// /**
//  * Job de cierre de periodo MENSUAL. Corre el día 1 de cada mes, cerrando
//  * el mes anterior completo (1 al último día del mes).
//  *
//  * Pensado para correr por cron (Atlas Scheduled Trigger, cron del SO,
//  * GitHub Actions programado, etc.) el día 1 de cada mes.
//  *
//  * Uso manual, cerrando un mes específico:
//  *   PERIODO=2026-08 npm run job:generarDeclaraciones
//  *
//  * Si no se pasa PERIODO, cierra automáticamente el mes calendario anterior
//  * al día en que se ejecuta (ideal para el cron del día 1).
//  *
//  * Lee config_comercial vigente + métricas de clientes por vendedor dentro
//  * del rango exacto del mes, y escribe un snapshot congelado en
//  * declaraciones_comision. Si ya existe declaración para vendedor+periodo,
//  * la salta (índice único).
//  */
// require('dotenv').config();
// const mongoose = require('mongoose');
// const ConfigComercial = require('../models/ConfigComercial');
// const Vendedor = require('../models/Vendedor');
// const Cliente = require('../models/Cliente');
// const DeclaracionComision = require('../models/DeclaracionComision');

// function lookupTramoComision(n, tramos) {
//   const tiers = [...tramos].sort((a, b) => a.from - b.from);
//   const tramo = tiers.find((t) => n >= t.from && n <= t.to);
//   return tramo ? tramo.rate : 0;
// }

// function lookupTramoBono(n, tramos) {
//   const tiers = [...tramos].sort((a, b) => a.from - b.from);
//   const tramo = tiers.find((t) => n >= t.from && n <= t.to);
//   return tramo ? tramo.amount : 0;
// }

// function esCierreTrimestre(periodo) {
//   const mes = parseInt(String(periodo).split('-')[1], 10);
//   return !Number.isNaN(mes) && mes > 0 && mes % 3 === 0;
// }

// /**
//  * Calcula el rango [inicio, fin) de un periodo "YYYY-MM".
//  * inicio = día 1 00:00:00 UTC del mes. fin = día 1 00:00:00 UTC del mes
//  * siguiente (rango exclusivo al final, evita bugs de límite en 23:59:59.999).
//  */
// function rangoDeMes(periodo) {
//   const [anio, mes] = periodo.split('-').map(Number); // mes: 1-12
//   const inicio = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0));
//   const fin = new Date(Date.UTC(anio, mes, 1, 0, 0, 0)); // primer día del mes siguiente
//   return { inicio, fin };
// }

// /**
//  * Si no se pasa PERIODO explícito, calcula el mes calendario anterior
//  * a la fecha de ejecución. Ej: si corre el 1 de septiembre, cierra "2026-08".
//  */
// function periodoMesAnterior() {
//   const hoy = new Date();
//   const anio = hoy.getUTCFullYear();
//   const mes = hoy.getUTCMonth(); // 0-11
//   const fecha = new Date(Date.UTC(anio, mes - 1, 1)); // retrocede un mes
//   const yyyy = fecha.getUTCFullYear();
//   const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
//   return `${yyyy}-${mm}`;
// }

// function validarFormatoPeriodo(periodo) {
//   return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
// }

// async function run() {
//   const uri = process.env.MONGODB_URI;
//   const periodo = process.env.PERIODO || periodoMesAnterior();

//   if (!uri || uri.includes('REEMPLAZA_')) {
//     console.error('Configura MONGODB_URI en .env antes de correr el job.');
//     process.exit(1);
//   }
//   if (!validarFormatoPeriodo(periodo)) {
//     console.error(`Formato de PERIODO inválido: "${periodo}". Usa YYYY-MM, ej: 2026-08`);
//     process.exit(1);
//   }

//   const { inicio, fin } = rangoDeMes(periodo);
//   console.log(`Cerrando periodo ${periodo} (del ${inicio.toISOString()} al ${fin.toISOString()}, exclusivo)`);

//   await mongoose.connect(uri);

//   const config = await ConfigComercial.findById('config_activa').lean();
//   if (!config) {
//     console.error('No existe config_activa. Corre primero: npm run seed:config');
//     process.exit(1);
//   }

//   const vendedores = await Vendedor.find({ activo: true }).lean();
//   let generadas = 0;
//   let omitidas = 0;

//   for (const vendedor of vendedores) {
//     // Doctores NUEVOS: venta de licencia doctor cuya fechaVenta cae dentro del mes.
//     const doctoresNuevos = await Cliente.countDocuments({
//       vendedorId: vendedor._id,
//       tipoLicencia: { $in: ['doctor', 'ambas'] },
//       estado: { $ne: 'cancelado' },
//       fechaVenta: { $gte: inicio, $lt: fin },
//     });

//     // Desktop vendidas en el mes (mismo criterio de fecha).
//     const desktopVendidas = await Cliente.countDocuments({
//       vendedorId: vendedor._id,
//       tipoLicencia: { $in: ['desktop', 'ambas'] },
//       estado: { $ne: 'cancelado' },
//       fechaVenta: { $gte: inicio, $lt: fin },
//     });

//     // Doctores ACTIVOS: snapshot del estado de la cartera al cierre del mes
//     // (no se filtra por fecha de venta -- es "cuántos siguen activos hoy").
//     const doctoresActivos = await Cliente.countDocuments({
//       vendedorId: vendedor._id,
//       estado: 'activo',
//     });

//     const rate = lookupTramoComision(doctoresNuevos, config.tramosComision);
//     const bonoAmount = esCierreTrimestre(periodo)
//       ? lookupTramoBono(doctoresActivos, config.tramosBono)
//       : 0;

//     const comisionDoctor = doctoresNuevos * config.precios.doctorMensual * rate;
//     const comisionDesktop = desktopVendidas * config.precios.desktopComisionFija;
//     const bono = bonoAmount;
//     const total = comisionDoctor + comisionDesktop + bono;

//     try {
//       await DeclaracionComision.create({
//         vendedorId: vendedor._id,
//         periodo,
//         metricas: { doctoresNuevos, desktopVendidas, doctoresActivos },
//         tramoAplicado: { rate, bonoAmount },
//         montos: { comisionDoctor, comisionDesktop, bono, total },
//         estado: 'generada',
//       });
//       generadas++;
//     } catch (err) {
//       if (err.code === 11000) {
//         // índice único vendedorId+periodo -- ya existía, se omite
//         omitidas++;
//       } else {
//         throw err;
//       }
//     }
//   }

//   console.log(`Declaraciones generadas: ${generadas}. Omitidas (ya existían): ${omitidas}.`);
//   await mongoose.disconnect();
// }

// run().catch((err) => {
//   console.error(err);
//   process.exit(1);
// });
