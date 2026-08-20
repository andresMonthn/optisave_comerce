const mongoose = require('mongoose');
const { Schema } = mongoose;

const interaccionSchema = new Schema(
  {
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true, index: true },
    vendedorId: { type: Schema.Types.ObjectId, ref: 'Vendedor', required: true, index: true }, // desnormalizado
    tipo: {
      type: String,
      enum: ['llamada', 'visita', 'email', 'nota', 'renovacion'],
      required: true,
    },
    descripcion: { type: String, required: true, trim: true },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

interaccionSchema.index({ clienteId: 1, fecha: -1 });
interaccionSchema.index({ vendedorId: 1, fecha: -1 });

module.exports = mongoose.model('Interaccion', interaccionSchema);
