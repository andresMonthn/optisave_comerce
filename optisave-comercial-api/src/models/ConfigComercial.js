const mongoose = require('mongoose');
const { Schema } = mongoose;

const tramoComisionSchema = new Schema(
  {
    from: { type: Number, required: true },
    to: { type: Number, required: true },
    rate: { type: Number, required: true }, // 0.30 = 30%
  },
  { _id: false }
);

const tramoBonoSchema = new Schema(
  {
    from: { type: Number, required: true },
    to: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const configComercialSchema = new Schema(
  {
    _id: { type: String, default: 'config_activa' }, // documento único, id fijo
    vigenteDesde: { type: Date, default: Date.now },
    precios: {
      doctorMensual: { type: Number, required: true },
      desktopAnual: { type: Number, required: true },
      desktopComisionFija: { type: Number, required: true },
    },
    ivaRate: { type: Number, required: true, default: 0.16 },
    tramosComision: { type: [tramoComisionSchema], required: true },
    tramosBono: { type: [tramoBonoSchema], required: true },
    updatedBy: { type: String }, // referencia de auditoría, quién lo editó directo en BD
  },
  { timestamps: true, _id: false }
);

module.exports = mongoose.model('ConfigComercial', configComercialSchema);
