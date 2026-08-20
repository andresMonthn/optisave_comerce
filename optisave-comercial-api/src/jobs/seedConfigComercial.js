// /**
//  * Corre una sola vez (o cuando quieras actualizar precios/tramos MANUALMENTE
//  * fuera de la API): npm run seed:config
//  *
//  * Esto es justo el "solo se edita directo en BD" que pediste -- este script
//  * no se expone como endpoint público.
//  */
// require('dotenv').config();
// const mongoose = require('mongoose');
// const ConfigComercial = require('../models/ConfigComercial');

// async function seed() {
//   const uri = process.env.MONGODB_URI;
//   if (!uri || uri.includes('REEMPLAZA_')) {
//     console.error('Configura MONGODB_URI en .env antes de correr el seed.');
//     process.exit(1);
//   }

//   await mongoose.connect(uri);

//   const config = {
//     _id: 'config_activa',
//     vigenteDesde: new Date(),
//     precios: {
//       doctorMensual: 350,
//       desktopAnual: 4500,
//       desktopComisionFija: 500,
//     },
//     ivaRate: 0.16,
//     tramosComision: [
//       { from: 1, to: 24, rate: 0.30 },
//       { from: 25, to: 49, rate: 0.40 },
//       { from: 50, to: 9999, rate: 0.50 },
//     ],
//     tramosBono: [
//       { from: 1, to: 24, amount: 1500 },
//       { from: 25, to: 49, amount: 4000 },
//       { from: 50, to: 99, amount: 9000 },
//       { from: 100, to: 99999, amount: 20000 },
//     ],
//     updatedBy: 'seed-script',
//   };

//   await ConfigComercial.findByIdAndUpdate('config_activa', config, {
//     upsert: true,
//     new: true,
//   });

//   console.log('config_activa creada/actualizada correctamente.');
//   await mongoose.disconnect();
// }

// seed().catch((err) => {
//   console.error(err);
//   process.exit(1);
// });
