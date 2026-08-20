const { buildApp } = require('./app');

async function start() {
  const app = await buildApp({ logger: true });
  const port = process.env.PORT || 3000;

  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
