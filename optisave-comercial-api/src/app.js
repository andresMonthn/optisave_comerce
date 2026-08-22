require('dotenv').config();
const fastify = require('fastify');

const mongoosePlugin = require('./plugins/mongoose');
const configComercialRoutes = require('./routes/configComercial');
const vendedoresRoutes = require('./routes/vendedores');
const clientesRoutes = require('./routes/clientes');

async function buildApp(opts = {}) {
  const app = fastify({ logger: opts.logger ?? true });

  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : true;

  await app.register(require('@fastify/cors'), {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(mongoosePlugin);
  await app.register(require('./plugins/auth'));
  await app.register(configComercialRoutes);
  await app.register(vendedoresRoutes);
  await app.register(clientesRoutes);
  await app.register(require('./routes/auth'));
  await app.register(require('./routes/denue'));

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

module.exports = { buildApp };
