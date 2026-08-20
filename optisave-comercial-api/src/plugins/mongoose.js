const mongoose = require('mongoose');

/**
 * Plugin de conexión a MongoDB Atlas vía Mongoose.
 * Reutiliza la conexión en entornos serverless (Vercel).
 */
async function mongoosePlugin(fastify, opts) {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes('REEMPLAZA_')) {
    fastify.log.error('MONGODB_URI no está configurada correctamente en .env');
    throw new Error('Falta configurar MONGODB_URI en .env (ver .env.example)');
  }

  if (!global.__mongooseCache) {
    global.__mongooseCache = { conn: null, promise: null };
  }

  const cache = global.__mongooseCache;

  if (cache.conn) {
    fastify.decorate('mongoose', mongoose);
    return;
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri).then((m) => {
      fastify.log.info('Conectado a MongoDB Atlas');
      return m;
    });
  }

  cache.conn = await cache.promise;
  fastify.decorate('mongoose', mongoose);

  if (!process.env.VERCEL) {
    fastify.addHook('onClose', async () => {
      await mongoose.disconnect();
      global.__mongooseCache = { conn: null, promise: null };
    });
  }
}

module.exports = mongoosePlugin;
