// /**
//  * Ejecuta una sola vez desde la raíz del proyecto:
//  *   node jobs/seedUsuarios.js
//  *
//  * Antes de correrlo:
//  *  1. Pon tu URI real de Mongo Atlas en MONGO_URI (la misma que usa server.js).
//  *  2. Después de correrlo, borra este archivo o quítale la clave en texto
//  *     plano — ya quedó hasheada en la BD, no necesitas conservarla aquí.
//  */

// // require('dotenv').config();
// const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');
// const Usuario = require('../models/Usuario');

// const MONGO_URI = 'te marca erros **'

// const ADMIN_USUARIO = 'andres.777.monthana@gmail.com';
// // const ADMIN_CLAVE = 'optisave1';

// async function seed() {
//   await mongoose.connect(MONGO_URI);
//   console.log('✅ Conectado a Mongo');

//   const claveHash = await bcrypt.hash(ADMIN_CLAVE, 10);

//   await Usuario.findOneAndUpdate(
//     { usuario: ADMIN_USUARIO.toLowerCase() },
//     {
//       usuario: ADMIN_USUARIO.toLowerCase(),
//       claveHash,
//       rol: 'admin',
//       nombre: 'Andy',
//       activo: true,
//     },
//     { upsert: true, new: true }
//   );

//   console.log(`✅ Usuario admin creado/actualizado → usuario: "${ADMIN_USUARIO}"`);

//   await mongoose.disconnect();
//   console.log('✅ Listo. Conexión cerrada.');
//   process.exit(0);
// }

// seed().catch((err) => {
//   console.error('❌ Error al sembrar el usuario admin:', err);
//   process.exit(1);
// });