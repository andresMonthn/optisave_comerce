const fp = require('fastify-plugin');
const jwt = require('@fastify/jwt');

/**
 * Usa una variable de entorno JWT_SECRET en producción.
 * Mientras no la definas, usa un secreto de desarrollo (cámbialo).
 */
async function authPlugin(fastify, opts) {
  fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'CAMBIA-ESTE-SECRETO-EN-.env',
    sign: { expiresIn: '12h' },
  });

  // Cualquier ruta que use este preHandler exige un Authorization: Bearer <token> válido
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.code(401).send({ error: 'No autorizado. Inicia sesión de nuevo.' });
    }
  });

  // Además de autenticado, exige rol admin
  fastify.decorate('requireAdmin', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.code(401).send({ error: 'No autorizado. Inicia sesión de nuevo.' });
    }
    if (request.user.rol !== 'admin') {
      return reply.code(403).send({ error: 'Solo el administrador puede hacer esto.' });
    }
  });

  // Si el usuario es 'agente', exige que solo pueda tocar SU PROPIO vendedorId.
  // Úsalo en rutas con :vendedorId o body.vendedorId además de fastify.authenticate.
  fastify.decorate('requireOwnVendedorOrAdmin', function (getVendedorId) {
    return async function (request, reply) {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.code(401).send({ error: 'No autorizado. Inicia sesión de nuevo.' });
      }
      if (request.user.rol === 'admin') return; // el admin puede ver cualquier vendedor
      const targetId = getVendedorId(request);
      if (String(request.user.vendedorId) !== String(targetId)) {
        return reply.code(403).send({ error: 'No puedes acceder a datos de otro vendedor.' });
      }
    };
  });
}

module.exports = fp(authPlugin);