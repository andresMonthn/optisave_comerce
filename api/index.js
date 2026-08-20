const { buildApp } = require('../optisave-comercial-api/src/app');

let appPromise;

function stripApiPrefix(url) {
  if (!url || !url.startsWith('/api')) return url || '/';
  const stripped = url.slice(4);
  return stripped.length ? stripped : '/';
}

module.exports = async (req, res) => {
  if (!appPromise) {
    appPromise = buildApp({ logger: false }).then(async (app) => {
      await app.ready();
      return app;
    });
  }

  const app = await appPromise;
  req.url = stripApiPrefix(req.url);

  app.server.emit('request', req, res);
};
