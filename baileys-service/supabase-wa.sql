-- =============================================================================
-- OptiSave · WhatsApp cron Supabase (ejecutar TODO este archivo de 1)
-- Tablas: Prostecto35, wa_send_config, wa_send_audit, wa_message_templates, Vault
-- Baileys: https://wa.optisave.app/webhook/send
-- =============================================================================

-- 0) Ampliar wa_estado: conserva tus valores + enviando + pendiente_confirmar
ALTER TABLE public."Prostecto35"
  DROP CONSTRAINT IF EXISTS "Prostecto35_wa_estado_check";

ALTER TABLE public."Prostecto35"
  ADD CONSTRAINT "Prostecto35_wa_estado_check"
  CHECK (
    wa_estado = ANY (
      ARRAY[
        'pendiente'::text,
        'enviando'::text,
        'pendiente_confirmar'::text,
        'enviado'::text,
        'fallido'::text,
        'sin_whatsapp'::text,
        'opt_out'::text,
        'no_enviar'::text
      ]
    )
  );

-- Helper: leer respuesta pg_net sin http_collect_response (bug en algunas versiones)
CREATE OR REPLACE FUNCTION public.wa_pgnet_leer_respuesta(
  p_request_id bigint,
  p_max_intentos int DEFAULT 60
)
RETURNS TABLE(
  status_code int,
  body jsonb,
  error_msg text,
  listo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  v_intentos int := 0;
  v_status_code int;
  v_content text;
  v_error_msg text;
  v_body jsonb;
BEGIN
  LOOP
    SELECT r.status_code, r.content, r.error_msg
    INTO v_status_code, v_content, v_error_msg
    FROM net._http_response r
    WHERE r.id = p_request_id;

    IF v_status_code IS NOT NULL OR v_error_msg IS NOT NULL THEN
      v_body := NULL;
      IF v_content IS NOT NULL AND btrim(v_content) <> '' THEN
        BEGIN
          v_body := v_content::jsonb;
        EXCEPTION
          WHEN OTHERS THEN
            v_body := jsonb_build_object('raw', v_content);
        END;
      END IF;
      RETURN QUERY SELECT v_status_code, v_body, v_error_msg, true;
      RETURN;
    END IF;

    v_intentos := v_intentos + 1;
    EXIT WHEN v_intentos >= p_max_intentos;

    PERFORM pg_sleep(0.5);
  END LOOP;

  RETURN QUERY SELECT NULL::int, NULL::jsonb, NULL::text, false;
END;
$$;

-- 1) Confirmar envíos que quedaron en pendiente_confirmar
CREATE OR REPLACE FUNCTION public.wa_confirmar_envios_pendientes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions, vault
AS $$
DECLARE
  r record;
  pgnet_id bigint;
  v_resp record;
  v_body jsonb;
  v_status_code int;
  new_status text;
  updated int := 0;
  still_pending int := 0;
  failed int := 0;
BEGIN
  FOR r IN
    SELECT id, prospecto_id, telefono, template_id, respuesta_webhook
    FROM public.wa_send_audit
    WHERE status = 'pendiente_confirmar'
    ORDER BY id
  LOOP
    pgnet_id := NULL;
    BEGIN
      pgnet_id := (r.respuesta_webhook ->> 'request_id_pgnet')::bigint;
    EXCEPTION
      WHEN OTHERS THEN
        pgnet_id := NULL;
    END;

    IF pgnet_id IS NULL THEN
      still_pending := still_pending + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_resp
    FROM public.wa_pgnet_leer_respuesta(pgnet_id, 1);

    IF NOT v_resp.listo THEN
      still_pending := still_pending + 1;
      CONTINUE;
    END IF;

    v_status_code := v_resp.status_code;
    v_body := v_resp.body;

    IF v_status_code IS NULL AND v_resp.error_msg IS NOT NULL THEN
      UPDATE public.wa_send_audit
      SET
        status = 'fallido',
        respuesta_webhook = jsonb_build_object(
          'pgnet_error', v_resp.error_msg,
          'request_id_pgnet', pgnet_id
        )
      WHERE id = r.id;

      IF r.prospecto_id IS NOT NULL THEN
        UPDATE public."Prostecto35"
        SET wa_estado = 'fallido'
        WHERE id = r.prospecto_id;
      END IF;

      failed := failed + 1;
      CONTINUE;
    END IF;

    IF v_status_code = 200 AND COALESCE(v_body ->> 'ok', 'false') = 'true' THEN
      new_status := 'enviado';
    ELSIF v_status_code = 422 OR v_body ->> 'code' = 'NOT_ON_WHATSAPP' THEN
      new_status := 'sin_whatsapp';
    ELSE
      new_status := 'fallido';
    END IF;

    UPDATE public.wa_send_audit
    SET status = new_status, respuesta_webhook = COALESCE(v_body, '{}'::jsonb)
    WHERE id = r.id;

    IF r.prospecto_id IS NOT NULL THEN
      IF new_status = 'enviado' THEN
        UPDATE public."Prostecto35"
        SET wa_estado = 'enviado', wa_fecha_envio = now()
        WHERE id = r.prospecto_id;

        IF r.template_id IS NOT NULL THEN
          UPDATE public.wa_message_templates SET usos = usos + 1 WHERE id = r.template_id;
        END IF;
      ELSIF new_status = 'sin_whatsapp' THEN
        UPDATE public."Prostecto35"
        SET wa_estado = 'sin_whatsapp'
        WHERE id = r.prospecto_id;
      ELSE
        UPDATE public."Prostecto35"
        SET wa_estado = 'fallido'
        WHERE id = r.prospecto_id;
      END IF;
    END IF;

    updated := updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'confirmados', updated,
    'aun_pendientes', still_pending,
    'fallidos', failed
  );
END;
$$;


-- 2) Envío automático (pg_cron llama wa_enviar_siguiente)
CREATE OR REPLACE FUNCTION public.wa_enviar_siguiente()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions, vault
AS $$
DECLARE
  v_id integer;
  v_tel text;
  v_nombre text;
  v_cfg record;
  v_tpl record;
  v_hora_local time;
  v_dow_local int;
  v_request_id bigint;
  v_status_code int;
  v_body jsonb;
  v_delay_seg int;
  v_api_key text;
  v_resp record;
BEGIN
  SELECT * INTO v_cfg FROM public.wa_send_config WHERE activo LIMIT 1;
  IF v_cfg IS NULL THEN RETURN; END IF;

  IF now() < v_cfg.proximo_envio_en THEN RETURN; END IF;

  v_hora_local := (now() AT TIME ZONE v_cfg.zona_horaria)::time;
  v_dow_local := extract(dow FROM (now() AT TIME ZONE v_cfg.zona_horaria))::int;

  IF v_hora_local NOT BETWEEN v_cfg.hora_inicio AND v_cfg.hora_fin THEN RETURN; END IF;
  IF v_dow_local != ALL(v_cfg.dias_activos) THEN RETURN; END IF;

  IF (SELECT count(*) FROM public.wa_send_audit
      WHERE created_at > now() - interval '1 hour' AND status = 'enviado') >= v_cfg.max_por_hora
  THEN RETURN; END IF;

  IF (SELECT count(*) FROM public.wa_send_audit
      WHERE created_at > now() - interval '1 day' AND status = 'enviado') >= v_cfg.max_por_dia
  THEN RETURN; END IF;

  SELECT id, telefono, nombre INTO v_id, v_tel, v_nombre
  FROM public."Prostecto35" p
  WHERE p.wa_estado = 'pendiente'
    AND p.telefono IS NOT NULL
    AND btrim(p.telefono) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.wa_send_audit a
      WHERE a.prospecto_id = p.id
        AND (
          a.status IN ('enviado', 'sin_whatsapp')
          OR (a.status = 'pendiente_confirmar' AND a.created_at > now() - interval '48 hours')
        )
    )
  LIMIT 1;

  IF v_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_tpl
  FROM public.wa_message_templates
  WHERE activo
  ORDER BY usos ASC, random()
  LIMIT 1;

  IF v_tpl IS NULL THEN RETURN; END IF;

  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = v_cfg.webhook_secret_name
  LIMIT 1;

  IF v_api_key IS NULL OR btrim(v_api_key) = '' THEN RETURN; END IF;

  v_delay_seg := floor(random() * (330 - 30 + 1) + 30)::int;
  UPDATE public.wa_send_config
  SET proximo_envio_en = now() + (v_delay_seg || ' seconds')::interval
  WHERE id = v_cfg.id;

  UPDATE public."Prostecto35"
  SET wa_estado = 'enviando', wa_intentos = wa_intentos + 1
  WHERE id = v_id AND wa_estado = 'pendiente';

  IF NOT FOUND THEN RETURN; END IF;

  v_request_id := net.http_post(
    url := v_cfg.webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_api_key,
      'x-api-key', v_api_key
    ),
    body := jsonb_strip_nulls(jsonb_build_object(
      'to', v_tel,
      'message', v_tpl.contenido,
      'mediaType', NULLIF(v_tpl.tipo, 'text'),
      'mediaUrl', v_tpl.media_url,
      'mimetype', v_tpl.mime_type,
      'prospectId', v_id::text
    ))
  );

  PERFORM set_config('statement_timeout', '35000', true);

  SELECT * INTO v_resp
  FROM public.wa_pgnet_leer_respuesta(v_request_id, 60);

  v_status_code := v_resp.status_code;
  v_body := v_resp.body;

  IF NOT v_resp.listo THEN
    v_status_code := NULL;
  END IF;

  IF v_status_code = 200 AND COALESCE(v_body ->> 'ok', 'false') = 'true' THEN
    INSERT INTO public.wa_send_audit (prospecto_id, telefono, nombre, status, template_id, request_id, respuesta_webhook)
    VALUES (v_id, v_tel, v_nombre, 'enviado', v_tpl.id, gen_random_uuid(), COALESCE(v_body, '{}'::jsonb));

    UPDATE public."Prostecto35"
    SET wa_estado = 'enviado', wa_fecha_envio = now()
    WHERE id = v_id;

    UPDATE public.wa_message_templates SET usos = usos + 1 WHERE id = v_tpl.id;

  ELSIF v_status_code = 422 OR v_body ->> 'code' = 'NOT_ON_WHATSAPP' THEN
    INSERT INTO public.wa_send_audit (prospecto_id, telefono, nombre, status, template_id, request_id, respuesta_webhook)
    VALUES (v_id, v_tel, v_nombre, 'sin_whatsapp', v_tpl.id, gen_random_uuid(), COALESCE(v_body, '{}'::jsonb));

    UPDATE public."Prostecto35"
    SET wa_estado = 'sin_whatsapp'
    WHERE id = v_id;

  ELSIF v_status_code IS NULL THEN
    INSERT INTO public.wa_send_audit (prospecto_id, telefono, nombre, status, template_id, request_id, respuesta_webhook)
    VALUES (
      v_id, v_tel, v_nombre, 'pendiente_confirmar', v_tpl.id, gen_random_uuid(),
      jsonb_build_object('request_id_pgnet', v_request_id)
    );

    UPDATE public."Prostecto35"
    SET wa_estado = 'pendiente_confirmar'
    WHERE id = v_id;

  ELSE
    INSERT INTO public.wa_send_audit (prospecto_id, telefono, nombre, status, template_id, request_id, respuesta_webhook)
    VALUES (v_id, v_tel, v_nombre, 'fallido', v_tpl.id, gen_random_uuid(), COALESCE(v_body, '{}'::jsonb));

    UPDATE public."Prostecto35"
    SET wa_estado = 'fallido'
    WHERE id = v_id;
  END IF;
END;
$$;


-- 3) Plantillas t01–t26: imagen + caption (contenido) alternando 2 flyers de Storage
UPDATE public.wa_message_templates
SET
  tipo = 'image',
  mime_type = 'image/png',
  media_url = CASE
    WHEN (substring(codigo from 2)::int % 2) = 1 THEN
      'https://bcbotkiemeopuicqnvie.supabase.co/storage/v1/object/public/images_marketing/Flyer_optisave79465png.png'
    ELSE
      'https://bcbotkiemeopuicqnvie.supabase.co/storage/v1/object/public/images_marketing/metaads_optisave19498.png'
  END
WHERE codigo IN (
  't01', 't02', 't03', 't04', 't05', 't06', 't07', 't08', 't09', 't10',
  't11', 't12', 't13', 't14', 't15', 't16', 't17', 't18', 't19', 't20',
  't21', 't22', 't23', 't24', 't25', 't26'
);

-- Desactivar t27/t28 si existían (evita duplicados en el sorteo)
UPDATE public.wa_message_templates
SET activo = false
WHERE codigo IN ('t27', 't28');

-- Verificar:
-- SELECT codigo, tipo, mime_type, left(media_url, 80) AS media_url, left(contenido, 60) AS caption
-- FROM wa_message_templates WHERE codigo LIKE 't%' ORDER BY codigo;
