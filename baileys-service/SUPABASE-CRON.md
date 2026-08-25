# WhatsApp automático · Supabase pg_cron → Baileys

## Un solo archivo SQL

Ejecuta **todo** en Supabase SQL Editor:

**`baileys-service/supabase-wa.sql`**

Incluye:
- `wa_confirmar_envios_pendientes()` — cierra filas `pendiente_confirmar`
- `wa_enviar_siguiente()` — envío con espera ~35s y anti-duplicados
- Sincroniza `Prostecto35` con `wa_send_audit`
- Confirma pendientes actuales
- Cron `optisave-wa-confirm` cada minuto

## Requisitos

1. Extensiones: **pg_cron**, **pg_net**
2. Docker: `docker compose up baileys tunnel --build -d`
3. WhatsApp conectado (QR escaneado)
4. `wa_send_config.webhook_url` = `https://wa.optisave.app/webhook/send`
5. Vault: secret en `webhook_secret_name` = mismo valor que `BAILEYS_API_KEY` en Docker

## Después de ejecutar

```sql
SELECT id, prospecto_id, telefono, status FROM wa_send_audit ORDER BY id DESC LIMIT 10;
```

Panel local → **Colección WhatsApp** → Actividad de envíos.

## Pausar envíos

```sql
UPDATE wa_send_config SET activo = false WHERE id = (SELECT id FROM wa_send_config LIMIT 1);
```

## Pausar solo confirmación

```sql
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'optisave-wa-confirm';
```
