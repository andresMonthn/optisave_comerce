const mongoose = require('mongoose');
const { Schema } = mongoose;

const clienteSchema = new Schema(
  {
    vendedorId: { type: Schema.Types.ObjectId, ref: 'Vendedor', required: true, index: true },
    nombreClinica: { type: String, required: true, trim: true },
    contacto: {
      nombre: { type: String, trim: true },
      telefono: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    especialidad: {
      type: String,
      enum: ['optometria', 'ortodoncia', 'podologia', 'spa_belleza', 'otra'],
      default: 'otra',
    },
    tipoLicencia: {
      type: String,
      enum: ['doctor', 'desktop', 'ambas'],
      required: true,
    },
    estado: {
      type: String,
      enum: ['prospecto', 'vendido', 'activo', 'inactivo', 'cancelado'],
      default: 'prospecto',
      index: true,
    },
    /** Fecha y hora de la demo agendada con el prospecto */
    demoAgendada: { type: Date },
    /** Fecha en que el doctor adquirió la licencia (la reporta el agente; la confirma admin) */
    fechaAdquisicionLicencia: { type: Date },
    /** Cambio a vendido/activo solicitado por el agente — pendiente de aprobación admin */
    estadoSolicitado: {
      type: String,
      enum: ['vendido', 'activo'],
      default: null,
    },
    fechaVenta: { type: Date },
    fechaAlta: { type: Date, default: Date.now },
    ultimoSeguimiento: { type: Date }, // desnormalizado, se actualiza al crear una interacción
  },
  { timestamps: true }
);

clienteSchema.index({ vendedorId: 1, estado: 1 });

module.exports = mongoose.model('Cliente', clienteSchema);
