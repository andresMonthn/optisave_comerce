const Cliente = require('../models/Cliente');
const Interaccion = require('../models/Interaccion');

const ESTADOS_ADMIN = ['prospecto', 'vendido', 'activo', 'inactivo', 'cancelado'];
const ESTADOS_SOLICITUD = ['vendido', 'activo'];

function parseDate(value) {
  if (value === null || value === '') return null;
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function clientesRoutes(fastify, opts) {
  fastify.get('/clientes/pendientes-aprobacion', { preHandler: fastify.requireAdmin }, async () => {
    const clientes = await Cliente.find({ estadoSolicitado: { $in: ESTADOS_SOLICITUD } })
      .sort({ updatedAt: -1 })
      .lean();
    return clientes;
  });

  fastify.post(
    '/clientes',
    { preHandler: fastify.requireOwnVendedorOrAdmin((req) => (req.body || {}).vendedorId) },
    async (request, reply) => {
      const { vendedorId, nombreClinica, contacto, especialidad, tipoLicencia, estado, demoAgendada } =
        request.body || {};

      if (!vendedorId || !nombreClinica || !tipoLicencia) {
        return reply.code(400).send({ error: 'vendedorId, nombreClinica y tipoLicencia son requeridos' });
      }

      const esAdmin = request.user.rol === 'admin';
      const estadoFinal = esAdmin && estado ? estado : 'prospecto';
      if (esAdmin && estado && !ESTADOS_ADMIN.includes(estadoFinal)) {
        return reply.code(400).send({ error: 'Estado no válido' });
      }

      const demo = parseDate(demoAgendada);

      const cliente = await Cliente.create({
        vendedorId,
        nombreClinica,
        contacto,
        especialidad,
        tipoLicencia,
        estado: estadoFinal,
        demoAgendada: demo ?? undefined,
      });

      return reply.code(201).send(cliente);
    }
  );

  fastify.patch('/clientes/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = request.params;
    const updates = request.body || {};

    const clienteActual = await Cliente.findById(id);
    if (!clienteActual) return reply.code(404).send({ error: 'Cliente no encontrado' });

    if (request.user.rol !== 'admin' && String(clienteActual.vendedorId) !== String(request.user.vendedorId)) {
      return reply.code(403).send({ error: 'No puedes editar clientes de otro vendedor.' });
    }

    const esAdmin = request.user.rol === 'admin';
    const patch = {};

    if (esAdmin && updates.aprobarSolicitud === true) {
      if (!clienteActual.estadoSolicitado) {
        return reply.code(400).send({ error: 'Este cliente no tiene una solicitud pendiente.' });
      }
      patch.estado = clienteActual.estadoSolicitado;
      patch.fechaVenta = clienteActual.fechaAdquisicionLicencia || new Date();
      patch.estadoSolicitado = null;
    } else if (esAdmin && updates.rechazarSolicitud === true) {
      patch.estadoSolicitado = null;
      patch.fechaAdquisicionLicencia = null;
    } else if (esAdmin) {
      if (updates.estado !== undefined) {
        if (!ESTADOS_ADMIN.includes(updates.estado)) {
          return reply.code(400).send({ error: 'Estado no válido' });
        }
        patch.estado = updates.estado;
        if (['vendido', 'activo'].includes(updates.estado)) {
          const fv = parseDate(updates.fechaVenta ?? updates.fechaAdquisicionLicencia);
          if (fv) patch.fechaVenta = fv;
        }
        patch.estadoSolicitado = null;
      }
      if (updates.demoAgendada !== undefined) patch.demoAgendada = parseDate(updates.demoAgendada);
      if (updates.fechaAdquisicionLicencia !== undefined) {
        patch.fechaAdquisicionLicencia = parseDate(updates.fechaAdquisicionLicencia);
      }
      if (updates.nombreClinica !== undefined) patch.nombreClinica = updates.nombreClinica;
      if (updates.contacto !== undefined) patch.contacto = updates.contacto;
      if (updates.especialidad !== undefined) patch.especialidad = updates.especialidad;
      if (updates.tipoLicencia !== undefined) patch.tipoLicencia = updates.tipoLicencia;
    } else {
      if (updates.demoAgendada !== undefined) {
        patch.demoAgendada = parseDate(updates.demoAgendada);
      }

      if (updates.estadoSolicitado !== undefined) {
        if (updates.estadoSolicitado === null || updates.estadoSolicitado === '') {
          patch.estadoSolicitado = null;
          patch.fechaAdquisicionLicencia = null;
        } else if (ESTADOS_SOLICITUD.includes(updates.estadoSolicitado)) {
          const fa = parseDate(updates.fechaAdquisicionLicencia);
          if (!fa) {
            return reply.code(400).send({
              error: 'Indica la fecha en que el doctor adquirió la licencia para solicitar vendido o activo.',
            });
          }
          patch.estadoSolicitado = updates.estadoSolicitado;
          patch.fechaAdquisicionLicencia = fa;
        } else {
          return reply.code(400).send({ error: 'Solicitud de estado no válida.' });
        }
      }

      if (updates.estado !== undefined && updates.estado !== 'prospecto') {
        return reply.code(403).send({
          error: 'Solo el administrador puede confirmar vendido, activo o cancelado.',
        });
      }
      if (updates.estado === 'prospecto') patch.estado = 'prospecto';

      if (updates.estado && ['vendido', 'activo', 'cancelado'].includes(updates.estado)) {
        return reply.code(403).send({
          error: 'Solo el administrador puede confirmar vendido, activo o cancelado.',
        });
      }
    }

    if (!Object.keys(patch).length) {
      return reply.code(400).send({ error: 'No hay cambios válidos para aplicar.' });
    }

    const cliente = await Cliente.findByIdAndUpdate(id, patch, { new: true });
    return cliente;
  });

  fastify.get('/clientes/:id/interacciones', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = request.params;
    const interacciones = await Interaccion.find({ clienteId: id }).sort({ fecha: -1 }).lean();
    return interacciones;
  });

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
