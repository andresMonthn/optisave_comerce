const https = require('https');

const PAGE_TIMEOUT_MS = process.env.VERCEL ? 45000 : 20000;
const MAX_PER_REQUEST = 25;
const MAX_RETRIES = 1;

/**
 * INEGI DENUE a veces responde HTTP status 0 (inválido para fetch nativo).
 */
function httpsGetText(url, timeoutMs = PAGE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OptiSave-Comercial/1.0',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(
        new Error(
          'INEGI tardó demasiado en responder. Prueba con menos registros o una palabra clave más corta.'
        )
      );
    });
    req.on('error', reject);
  });
}

async function httpsGetTextWithRetry(url, timeoutMs = PAGE_TIMEOUT_MS) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await httpsGetText(url, timeoutMs);
    } catch (err) {
      lastErr = err;
      const retryable = /tardó demasiado|timeout|ETIMEDOUT|ECONNRESET/i.test(err.message || '');
      if (attempt >= MAX_RETRIES || !retryable) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

function buildDenueUrl(condicion, entidad, regIni, regFin, token) {
  const condEnc = encodeURIComponent(condicion);
  const ent = String(entidad).trim().padStart(2, '0');
  const tokenClean = String(token).trim();
  return (
    `https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarEntidad/` +
    `${condEnc}/${ent}/${regIni}/${regFin}/${tokenClean}`
  );
}

function parseDenueJson(text) {
  if (!text || !String(text).trim()) {
    throw new Error('INEGI no devolvió contenido. Verifica tu token DENUE.');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('INEGI no devolvió JSON válido.');
  }

  if (!Array.isArray(data)) {
    const msg =
      data?.mensaje ||
      data?.Message ||
      data?.message ||
      data?.error ||
      'Token DENUE inválido o consulta rechazada por INEGI.';
    const err = new Error(msg);
    err.statusCode = 401;
    throw err;
  }

  return data.map(normalizeDenueRow);
}

/**
 * Proxy DENUE/INEGI — consultas paginadas (lotes pequeños, INEGI responde lento).
 */
async function denueRoutes(fastify, opts) {
  fastify.get('/denue/buscar', { preHandler: fastify.requireAdmin }, async (request, reply) => {
    const { actividad, entidad = '22', registros = '25', regIni: regIniQ, token } =
      request.query || {};

    if (!token || !String(token).trim()) {
      return reply.code(400).send({ error: 'Falta el token de la API DENUE.' });
    }
    if (!actividad || !String(actividad).trim()) {
      return reply.code(400).send({ error: 'Falta la actividad o palabra clave.' });
    }

    const count = Math.min(MAX_PER_REQUEST, Math.max(1, parseInt(registros, 10) || 25));
    const regIni = Math.max(1, parseInt(regIniQ, 10) || 1);
    const regFin = regIni + count - 1;

    const condicion = String(actividad)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .join(',');

    const url = buildDenueUrl(condicion, entidad, regIni, regFin, token);

    try {
      const { statusCode, body } = await httpsGetTextWithRetry(url);

      if (statusCode === 0) {
        try {
          return parseDenueJson(body);
        } catch (err) {
          return reply.code(err.statusCode || 401).send({
            error: err.message,
            detalle: body?.slice(0, 300),
          });
        }
      }

      if (statusCode >= 400) {
        return reply.code(statusCode).send({
          error: `INEGI respondió HTTP ${statusCode}`,
          detalle: body?.slice(0, 300),
        });
      }

      return parseDenueJson(body);
    } catch (err) {
      request.log.error(err);
      const code = err.statusCode || 502;
      return reply.code(code).send({
        error: err.message || 'No se pudo consultar DENUE/INEGI.',
      });
    }
  });
}

function normalizeDenueRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    Nombre: row.Nombre ?? row.nombre ?? row['Nombre del establecimiento'] ?? '',
    Razon_social: row.Razon_social ?? row.razon_social ?? row['Razón social'] ?? '',
    Clase_actividad: row.Clase_actividad ?? row.clase_actividad ?? row['Clase de la actividad'] ?? '',
    Ubicacion:
      row.Ubicacion ??
      row.ubicacion ??
      row['Localidad, municipio y entidad federativa'] ??
      '',
    Telefono: row.Telefono ?? row.telefono ?? row['Teléfono'] ?? '',
    Municipio: row.Municipio ?? row.municipio ?? '',
    Localidad: row.Localidad ?? row.localidad ?? '',
    Latitud: row.Latitud ?? row.latitud ?? '',
    Longitud: row.Longitud ?? row.longitud ?? '',
  };
}

module.exports = denueRoutes;
