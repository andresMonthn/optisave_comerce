const BAILEYS_URL = (process.env.BAILEYS_SERVICE_URL || 'http://localhost:3001').replace(/\/$/, '');
const BAILEYS_KEY = process.env.BAILEYS_SERVICE_API_KEY || process.env.BAILEYS_API_KEY || '';

async function baileysRequest(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (BAILEYS_KEY) headers['x-api-key'] = BAILEYS_KEY;

  const res = await fetch(`${BAILEYS_URL}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || 'Respuesta inválida del servicio Baileys' };
  }

  return { ok: res.ok, status: res.status, body };
}

/**
 * Proxy al servicio Baileys (Docker local + túnel HTTPS para pg_cron).
 */
async function whatsappRoutes(fastify) {
  fastify.get('/whatsapp/status', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    try {
      const { ok, status, body } = await baileysRequest('/status');
      if (!ok) return reply.code(status).send(body);
      return body;
    } catch (err) {
      request.log.error(err);
      return reply.code(503).send({
        error: 'No se pudo contactar el servicio Baileys.',
        detalle: 'Levanta el contenedor: docker compose up baileys --build',
      });
    }
  });

  fastify.get('/whatsapp/qr', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    try {
      const { ok, status, body } = await baileysRequest('/qr');
      if (!ok) return reply.code(status).send(body);
      return body;
    } catch (err) {
      request.log.error(err);
      return reply.code(503).send({
        error: 'No se pudo obtener el QR del servicio Baileys.',
        detalle: 'Verifica que docker compose esté corriendo en el puerto 3001.',
      });
    }
  });

  fastify.get('/whatsapp/send-log', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    try {
      const { ok, status, body } = await baileysRequest('/send-log');
      if (!ok) return reply.code(status).send(body);
      return body;
    } catch (err) {
      request.log.error(err);
      return reply.code(503).send({ error: 'No se pudo leer el log de envíos.' });
    }
  });

  fastify.post('/whatsapp/check', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    const { to } = request.body || {};
    if (!to) {
      return reply.code(400).send({ error: 'Indica el número a verificar.' });
    }
    try {
      const { ok, status, body } = await baileysRequest('/check', {
        method: 'POST',
        body: { to },
      });
      if (!ok) return reply.code(status).send(body);
      return body;
    } catch (err) {
      request.log.error(err);
      return reply.code(503).send({
        error: 'No se pudo verificar el número en WhatsApp.',
        detalle: 'Verifica que Baileys esté conectado.',
      });
    }
  });

  fastify.post('/whatsapp/send-test', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    const { to, message } = request.body || {};
    if (!to || message == null) {
      return reply.code(400).send({ error: 'Indica número y mensaje de prueba.' });
    }
    try {
      const { ok, status, body } = await baileysRequest('/send', {
        method: 'POST',
        body: { to, message, source: 'test-ui' },
      });
      if (!ok) return reply.code(status).send(body);
      return body;
    } catch (err) {
      request.log.error(err);
      return reply.code(503).send({
        error: 'No se pudo enviar el mensaje de prueba.',
        detalle: 'Verifica que Baileys esté conectado y el túnel activo si usas pg_cron.',
      });
    }
  });

  fastify.post('/whatsapp/logout', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    try {
      const { ok, status, body } = await baileysRequest('/logout', { method: 'POST' });
      if (!ok) return reply.code(status).send(body);
      return body;
    } catch (err) {
      request.log.error(err);
      return reply.code(503).send({
        error: 'No se pudo desvincular WhatsApp.',
      });
    }
  });
}

module.exports = whatsappRoutes;
