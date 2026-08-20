const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');

async function authRoutes(fastify, opts) {
  fastify.post('/auth/login', async (request, reply) => {
    const { usuario, clave } = request.body || {};

    if (!usuario || !clave) {
      return reply.code(400).send({ error: 'usuario y clave son requeridos' });
    }

    const user = await Usuario.findOne({ usuario: usuario.trim().toLowerCase() });

    // Mismo mensaje si el usuario no existe o la clave no coincide — no des pistas
    if (!user || !user.activo) {
      return reply.code(401).send({ error: 'Usuario o clave incorrectos' });
    }

    const claveOk = await bcrypt.compare(clave, user.claveHash);
    if (!claveOk) {
      return reply.code(401).send({ error: 'Usuario o clave incorrectos' });
    }

    const token = fastify.jwt.sign({
      sub: user._id,
      usuario: user.usuario,
      rol: user.rol,
      vendedorId: user.vendedorId || null,
    });

    return reply.send({
      token,
      rol: user.rol,
      vendedorId: user.vendedorId || null,
      nombre: user.nombre || user.usuario,
    });
  });

  // Opcional: para que el frontend valide la sesión al recargar sin volver a mandar clave
  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request, reply) => {
    return reply.send(request.user);
  });
}

module.exports = authRoutes;