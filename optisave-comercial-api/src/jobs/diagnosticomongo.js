// /**
//  * Diagnóstico rápido: node jobs/diagnosticoMongo.js
//  * Esto conecta directo, sin Fastify de por medio, así que si algo
//  * truena vas a ver el error REAL (no el timeout genérico de avvio).
//  */
// const path = require('path');

// // Busca el .env en la RAÍZ del proyecto (dos niveles arriba de src/jobs/),
// // sin importar desde qué carpeta ejecutes este script.
// require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

// const mongoose = require('mongoose');

// const uri = process.env.MONGODB_URI;

// console.log('--- Diagnóstico de conexión a MongoDB ---');
// console.log('Buscando .env en:', path.resolve(__dirname, '..', '..', '.env'));
// console.log('¿MONGODB_URI está definida?', !!uri);
// if (uri) {
//     // Oculta la clave para que puedas pegar este log sin exponerla
//     console.log('URI (clave oculta):', uri.replace(/:([^:@/]+)@/, ':****@'));
// } else {
//     console.log('❌ No hay MONGODB_URI en tus variables de entorno. Revisa tu .env');
//     process.exit(1);
// }

// mongoose.connection.on('connecting', () => console.log('⏳ Conectando…'));
// mongoose.connection.on('connected', () => console.log('✅ Evento "connected" recibido'));
// mongoose.connection.on('error', (err) => console.log('❌ Evento "error" recibido:', err.message));

// mongoose
//     .connect(uri, { serverSelectionTimeoutMS: 8000 })
//     .then(() => {
//         console.log('✅ ¡CONECTÓ! No hay problema de red/credenciales.');
//         return mongoose.disconnect();
//     })
//     .then(() => process.exit(0))
//     .catch((err) => {
//         console.log('❌ ERROR REAL AL CONECTAR:');
//         console.log(err.message);
//         console.log('--- stack completo (por si acaso) ---');
//         console.log(err);
//         process.exit(1);
//     });