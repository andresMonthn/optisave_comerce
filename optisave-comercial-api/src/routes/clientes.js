const Cliente = require('../models/Cliente');
const Interaccion = require('../models/Interaccion');

async function clientesRoutes(fastify, opts) {
  // Crear cliente — admin, o agente PERO solo en su propio vendedorId
  fastify.post(
    '/clientes',
    { preHandler: fastify.requireOwnVendedorOrAdmin((req) => (req.body || {}).vendedorId) },
    async (request, reply) => {
      const { vendedorId, nombreClinica, contacto, especialidad, tipoLicencia, estado } = request.body || {};

      if (!vendedorId || !nombreClinica || !tipoLicencia) {
        return reply.code(400).send({ error: 'vendedorId, nombreClinica y tipoLicencia son requeridos' });
      }

      const cliente = await Cliente.create({
        vendedorId,
        nombreClinica,
        contacto,
        especialidad,
        tipoLicencia,
        estado,
      });

      return reply.code(201).send(cliente);
    }
  );

  // Actualizar estado / datos de un cliente — admin, o agente solo si el
  // cliente es de SU cartera (se valida cargando el cliente primero)
  fastify.patch('/clientes/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = request.params;
    const updates = request.body || {};

    const clienteActual = await Cliente.findById(id);
    if (!clienteActual) return reply.code(404).send({ error: 'Cliente no encontrado' });

    if (request.user.rol !== 'admin' && String(clienteActual.vendedorId) !== String(request.user.vendedorId)) {
      return reply.code(403).send({ error: 'No puedes editar clientes de otro vendedor.' });
    }

    const cliente = await Cliente.findByIdAndUpdate(id, updates, { new: true });
    return cliente;
  });

  // Historial de interacciones de un cliente
  fastify.get('/clientes/:id/interacciones', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = request.params;
    const interacciones = await Interaccion.find({ clienteId: id }).sort({ fecha: -1 }).lean();
    return interacciones;
  });

  // Registrar nueva interacción (seguimiento)
  fastify.post('/clientes/:id/interacciones', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = request.params;
    const { tipo, descripcion, fecha } = request.body || {};

    if (!tipo || !descripcion) {
      return reply.code(400).send({ error: 'tipo y descripcion son requeridos' });
    }

    const cliente = await Cliente.findById(id);
    if (!cliente) return reply.code(404).send({ error: 'Cliente no encontrado' });

    const interaccion = await Interaccion.create({
      clienteId: id,
      vendedorId: cliente.vendedorId,
      tipo,
      descripcion,
      fecha: fecha || new Date(),
    });

    cliente.ultimoSeguimiento = interaccion.fecha;
    await cliente.save();

    return reply.code(201).send(interaccion);
  });
}

module.exports = clientesRoutes;
