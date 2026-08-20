const mongoose = require('mongoose');
const { Schema } = mongoose;

const declaracionComisionSchema = new Schema(
  {
    vendedorId: { type: Schema.Types.ObjectId, ref: 'Vendedor', required: true, index: true },
    periodo: { type: String, required: true }, // ej. "Q1-2026"
    fechaGeneracion: { type: Date, default: Date.now },

    // Snapshot congelado: aunque config_comercial cambie después, esta declaración no se mueve
    metricas: {
      doctoresNuevos: { type: Number, required: true },
      desktopVendidas: { type: Number, required: true },
      doctoresActivos: { type: Number, required: true },
    },
    tramoAplicado: {
      rate: { type: Number, required: true },
      bonoAmount: { type: Number, required: true },
    },
    montos: {
      comisionDoctor: { type: Number, required: true },
      comisionDesktop: { type: Number, required: true },
      bono: { type: Number, required: true },
      total: { type: Number, required: true },
    },
    estado: {
      type: String,
      enum: ['generada', 'revisada', 'pagada'],
      default: 'generada',
    },
    fechaPago: { type: Date },
  },
  { timestamps: true }
);

// Evita generar dos veces la declaración del mismo vendedor/periodo
declaracionComisionSchema.index({ vendedorId: 1, periodo: 1 }, { unique: true });

module.exports = mongoose.model('DeclaracionComision', declaracionComisionSchema);
