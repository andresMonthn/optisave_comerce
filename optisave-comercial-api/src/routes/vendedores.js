const bcrypt = require('bcryptjs');
const Vendedor = require('../models/Vendedor');
const Usuario = require('../models/Usuario');
const Cliente = require('../models/Cliente');
const DeclaracionComision = require('../models/DeclaracionComision');

async function vendedoresRoutes(fastify, opts) {
  // Listar vendedores — solo admin. Incluye si su acceso (Usuario) está activo.
  fastify.get('/vendedores', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    const vendedores = await Vendedor.find().sort({ nombre: 1 }).lean();
    const usuarios = await Usuario.find({ vendedorId: { $in: vendedores.map(v => v._id) } })
      .select('vendedorId usuario activo')
      .lean();

    const usuarioPorVendedor = {};
    usuarios.forEach(u => { usuarioPorVendedor[String(u.vendedorId)] = u; });

    const resultado = vendedores.map(v => ({
      ...v,
      cuenta: usuarioPorVendedor[String(v._id)] || null, // { usuario, activo } o null si no tiene acceso
    }));

    return resultado;
  });

  // Crear vendedor + su cuenta de acceso (correo/clave) en un solo paso — solo admin
  fastify.post('/vendedores', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    const { nombre, email, telefono, metaTrimestral, clave } = request.body || {};

    if (!nombre || !email) {
      return reply.code(400).send({ error: 'nombre y email son requeridos' });
    }
    if (!clave || clave.length < 6) {
      return reply.code(400).send({ error: 'La clave es requerida y debe tener al menos 6 caracteres' });
    }

    const correoNormalizado = email.trim().toLowerCase();

    const usuarioExistente = await Usuario.findOne({ usuario: correoNormalizado });
    if (usuarioExistente) {
      return reply.code(409).send({ error: 'Ya existe una cuenta con ese correo' });
    }

    const vendedor = await Vendedor.create({ nombre, email, telefono, metaTrimestral });

    const claveHash = await bcrypt.hash(clave, 10);
    const usuario = await Usuario.create({
      usuario: correoNormalizado,
      claveHash,
      rol: 'agente',
      vendedorId: vendedor._id,
      nombre,
      activo: true,
    });

    return reply.code(201).send({
      vendedor,
      cuenta: { usuario: usuario.usuario, activo: usuario.activo },
    });
  });

  // Activar / desactivar el acceso de un vendedor (NO borra al vendedor ni su
  // cartera/historial — solo le quita/regresa la posibilidad de hacer login)
  fastify.patch('/vendedores/:id/acceso', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    const { id } = request.params;
    const { activo } = request.body || {};

    if (typeof activo !== 'boolean') {
      return reply.code(400).send({ error: 'activo (true/false) es requerido' });
    }

    const usuario = await Usuario.findOneAndUpdate({ vendedorId: id }, { activo }, { new: true });
    if (!usuario) {
      return reply.code(404).send({ error: 'Este vendedor no tiene una cuenta de acceso asociada' });
    }

    return reply.send({ usuario: usuario.usuario, activo: usuario.activo });
  });

  // Cambiar la clave de un vendedor (por si la olvida) — solo admin
  fastify.patch('/vendedores/:id/clave', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    const { id } = request.params;
    const { clave } = request.body || {};

    if (!clave || clave.length < 6) {
      return reply.code(400).send({ error: 'La clave debe tener al menos 6 caracteres' });
    }

    const claveHash = await bcrypt.hash(clave, 10);
    const usuario = await Usuario.findOneAndUpdate({ vendedorId: id }, { claveHash }, { new: true });
    if (!usuario) {
      return reply.code(404).send({ error: 'Este vendedor no tiene una cuenta de acceso asociada' });
    }

    return reply.send({ ok: true });
  });

  // Cartera de un vendedor — admin ve cualquiera, agente SOLO la suya
  fastify.get(
    '/vendedores/:id/cartera',
    { preHandler: fastify.requireOwnVendedorOrAdmin((req) => req.params.id) },
    async (request, reply) => {
      const { id } = request.params;
      const { estado } = request.query;

      const filtro = { vendedorId: id };
      if (estado) filtro.estado = estado;

      const clientes = await Cliente.find(filtro).sort({ ultimoSeguimiento: -1 }).lean();
      return clientes;
    }
  );

  // Declaraciones de comisión — admin ve cualquiera, agente SOLO la suya
  fastify.get(
    '/vendedores/:id/declaraciones',
    { preHandler: fastify.requireOwnVendedorOrAdmin((req) => req.params.id) },
    async (request, reply) => {
      const { id } = request.params;
      const { periodo } = request.query;

      const filtro = { vendedorId: id };
      if (periodo) filtro.periodo = periodo;

      const declaraciones = await DeclaracionComision.find(filtro).sort({ periodo: -1 }).lean();
      return declaraciones;
    }
  );
}

module.exports = vendedoresRoutes;