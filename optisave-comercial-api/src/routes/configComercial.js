const ConfigComercial = require('../models/ConfigComercial');

/**
 * Un solo GET, de solo lectura. La app nunca escribe aquí:
 * precios y tramos se editan directo en BD (o vía script de admin fuera de la API pública).
 */
async function configComercialRoutes(fastify, opts) {
  fastify.get('/config-comercial', async (request, reply) => {
    const config = await ConfigComercial.findById('config_activa').lean();

    if (!config) {
      return reply.code(404).send({ error: 'No hay configuración comercial activa. Ejecuta el seed inicial.' });
    }

    return config;
  });
}

module.exports = configComercialRoutes;
