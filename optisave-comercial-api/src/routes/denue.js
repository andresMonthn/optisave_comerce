/**
 * Proxy DENUE/INEGI — evita CORS en el navegador.
 * Solo administrador. El token lo envía el cliente (localStorage).
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
    const ent = String(entidad).trim();
    const actividadEnc = encodeURIComponent(String(actividad).trim());
    const tokenEnc = encodeURIComponent(String(token).trim());

    const url =
      `https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarEntidadActividad/` +
      `${ent}/${actividadEnc}/${numReg}/${tokenEnc}`;

    try {
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      const text = await resp.text();

      if (!resp.ok) {
        return reply.code(resp.status).send({
          error: `INEGI respondió HTTP ${resp.status}`,
          detalle: text.slice(0, 200),
        });
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return reply.code(502).send({ error: 'INEGI no devolvió JSON válido.' });
      }

      if (!Array.isArray(data)) {
        return reply.code(502).send({ error: 'Respuesta inesperada de INEGI.', detalle: data });
      }

      return data;
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: 'No se pudo consultar DENUE/INEGI.' });
    }
  });
}

module.exports = denueRoutes;
