/**
 * Proxy DENUE/INEGI — evita CORS en el navegador.
 * Solo administrador. El token lo envía el cliente (localStorage).
 *
 * Formato oficial INEGI (BuscarEntidad):
 * /consulta/BuscarEntidad/{condicion}/{entidad}/{registro_inicial}/{registro_final}/{token}
 * @see https://www.inegi.org.mx/servicios/api_denue.html
 */
async function denueRoutes(fastify, opts) {
  fastify.get('/denue/buscar', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    const { actividad, entidad = '22', registros = '200', token } = request.query || {};

    if (!token || !String(token).trim()) {
      return reply.code(400).send({ error: 'Falta el token de la API DENUE.' });
    }
    if (!actividad || !String(actividad).trim()) {
      return reply.code(400).send({ error: 'Falta la actividad o palabra clave.' });
    }

    const numReg = Math.min(1000, Math.max(1, parseInt(registros, 10) || 200));
    const ent = String(entidad).trim().padStart(2, '0');
    const regIni = 1;
    const regFin = numReg;
    const tokenRaw = String(token).trim();

    // INEGI: varias palabras separadas por coma; normalizamos espacios → comas
    const condicion = String(actividad)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .join(',');
    const condicionEnc = encodeURIComponent(condicion);

    const url =
      `https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarEntidad/` +
      `${condicionEnc}/${ent}/${regIni}/${regFin}/${tokenRaw}`;

    try {
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        redirect: 'follow',
      });
      const text = await resp.text();

      if (!resp.ok) {
        request.log.warn({ status: resp.status, url: url.replace(tokenRaw, '***') }, 'DENUE error');
        return reply.code(resp.status).send({
          error: resp.status === 404
            ? 'INEGI no encontró la consulta. Verifica token, entidad y palabras clave.'
            : `INEGI respondió HTTP ${resp.status}`,
          detalle: text.slice(0, 300),
        });
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return reply.code(502).send({ error: 'INEGI no devolvió JSON válido.', detalle: text.slice(0, 200) });
      }

      if (!Array.isArray(data)) {
        const msg = data?.mensaje || data?.message || data?.error;
        return reply.code(502).send({
          error: msg || 'Respuesta inesperada de INEGI (revisa que el token sea válido).',
          detalle: data,
        });
      }

      return data.map(normalizeDenueRow);
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: 'No se pudo consultar DENUE/INEGI.' });
    }
  });
}

/** Unifica nombres de campos entre versiones de la API DENUE */
function normalizeDenueRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    Nombre: row.Nombre ?? row.nombre ?? row['Nombre del establecimiento'] ?? '',
    Razon_social: row.Razon_social ?? row.razon_social ?? row['Razón social'] ?? '',
    Clase_actividad: row.Clase_actividad ?? row.clase_actividad ?? row['Clase de la actividad'] ?? '',
    Ubicacion:
      row.Ubicacion ??
      row.ubicacion ??
      row['Localidad, municipio y entidad federativa'] ??
      '',
    Telefono: row.Telefono ?? row.telefono ?? row['Teléfono'] ?? '',
    Municipio: row.Municipio ?? row.municipio ?? '',
    Localidad: row.Localidad ?? row.localidad ?? '',
    Latitud: row.Latitud ?? row.latitud ?? '',
    Longitud: row.Longitud ?? row.longitud ?? '',
  };
}

module.exports = denueRoutes;
