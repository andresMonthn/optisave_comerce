const mongoose = require('mongoose');

/**
 * Usuario/clave estáticos, se dan de alta y se modifican DIRECTO en BD
 * (tú decides el hash de la clave al insertarlos — ver snippet de seed
 * más abajo). No hay registro público, no hay recuperación de clave.
 *
 * rol: 'admin'      -> ve todo el panel administrativo
 *      'agente'     -> solo su propia cartera / cierre de mes / simulador
 *                      (requiere vendedorId apuntando a su Vendedor)
 */
const usuarioSchema = new mongoose.Schema(
  {
    usuario: { type: String, required: true, unique: true, trim: true, lowercase: true },
    claveHash: { type: String, required: true },
    rol: { type: String, enum: ['admin', 'agente'], required: true },
    vendedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendedor', default: null },
    nombre: { type: String, default: '' },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Usuario', usuarioSchema);