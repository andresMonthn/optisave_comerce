const mongoose = require('mongoose');
const { Schema } = mongoose;

const vendedorSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    telefono: { type: String, trim: true },
    activo: { type: Boolean, default: true },
    fechaAlta: { type: Date, default: Date.now },
    metaTrimestral: { type: Number, default: 0 }, // referencia visual, no afecta cálculo
  },
  { timestamps: true } // createdAt / updatedAt automáticos
);

module.exports = mongoose.model('Vendedor', vendedorSchema);
