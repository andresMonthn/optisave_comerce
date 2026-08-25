const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const PORT = Number(process.env.PORT) || 3001;
const API_KEY = process.env.BAILEYS_API_KEY || '';
const SESSION_DIR = process.env.SESSION_DIR || path.join(__dirname, 'sessions');
const SEND_LOG_MAX = 100;

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

let sock = null;
let starting = false;
let qrDataUrl = null;
let connectionState = 'disconnected';
let phoneNumber = null;
let lastError = null;
const sendLog = [];

function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return String(headerKey).trim();

  const auth = req.headers.authorization;
  if (!auth) return '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  return String(auth).trim();
}

function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  if (extractApiKey(req) === API_KEY) return next();
  return res.status(401).json({
    error: 'API key inválida',
    hint: 'Usa header x-api-key o Authorization: Bearer <tu BAILEYS_API_KEY>',
  });
}

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;

  // 10 dígitos locales MX (4491234567) → WhatsApp móvil MX usa 521 + 10
  if (digits.length === 10) {
    return `521${digits}`;
  }

  // Ya viene 521XXXXXXXXXX
  if (digits.length === 13 && digits.startsWith('521')) {
    return digits;
  }

  // 52 + 10 dígitos sin el 1 móvil (524491234567) → insertar 1
  if (digits.length === 12 && digits.startsWith('52') && digits[2] !== '1') {
    return `521${digits.slice(2)}`;
  }

  // 1 + 10 dígitos (14491234567)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `52${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

function toJid(rawPhone) {
  const digits = normalizePhone(rawPhone);
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

function recordSend(entry) {
  const previewText = entry.preview || entry.message || '';
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    to: entry.to,
    kind: entry.kind || 'text',
    preview: String(previewText).slice(0, 120),
    source: entry.source || 'api',
    status: entry.status,
    error: entry.error || null,
    at: new Date().toISOString(),
  };
  sendLog.unshift(row);
  if (sendLog.length > SEND_LOG_MAX) sendLog.length = SEND_LOG_MAX;
  return row;
}

function normalizeMediaType(raw) {
  const type = String(raw || 'text').trim().toLowerCase();
  if (['text', 'plain', 'txt', ''].includes(type)) return 'text';
  if (['image', 'img', 'photo', 'picture', 'foto'].includes(type)) return 'image';
  if (['document', 'doc', 'pdf', 'file', 'archivo'].includes(type)) return 'document';
  if (['video', 'vid'].includes(type)) return 'video';
  if (['audio', 'voice', 'ptt', 'voz'].includes(type)) return 'audio';
  if (['sticker'].includes(type)) return 'sticker';
  return type;
}

function parseSendPayload(body = {}) {
  const media = body.media && typeof body.media === 'object' ? body.media : null;
  const message = body.message ?? body.caption ?? body.text ?? media?.caption ?? '';

  let mediaType =
    body.mediaType ??
    body.type ??
    media?.type ??
    null;

  if (!mediaType && (body.imageUrl || body.image)) mediaType = 'image';
  if (!mediaType && (body.documentUrl || body.document)) mediaType = 'document';
  if (!mediaType && (body.videoUrl || body.video)) mediaType = 'video';
  if (!mediaType && (body.audioUrl || body.audio)) mediaType = 'audio';

  const mediaUrl =
    body.mediaUrl ??
    body.url ??
    media?.url ??
    body.imageUrl ??
    (typeof body.image === 'string' ? body.image : null) ??
    body.documentUrl ??
    (typeof body.document === 'string' ? body.document : null) ??
    body.videoUrl ??
    (typeof body.video === 'string' ? body.video : null) ??
    body.audioUrl ??
    (typeof body.audio === 'string' ? body.audio : null) ??
    null;

  return {
    message: String(message || '').trim(),
    mediaType: normalizeMediaType(mediaType || 'text'),
    mediaUrl: mediaUrl ? String(mediaUrl).trim() : null,
    mediaBase64: String(body.mediaBase64 ?? media?.base64 ?? '').trim() || null,
    fileName: body.fileName ?? media?.fileName ?? null,
    mimetype: body.mimetype ?? body.mimeType ?? media?.mimetype ?? null,
    ptt: Boolean(body.ptt ?? media?.ptt),
  };
}

function validateSendPayload(payload) {
  if (payload.mediaType === 'text') {
    if (!payload.message) {
      const err = 'El mensaje está vacío.';
      const e = new Error(err);
      e.statusCode = 400;
      throw e;
    }
    return;
  }

  if (!payload.mediaUrl && !payload.mediaBase64) {
    const err = 'Para multimedia indica mediaUrl/url o mediaBase64.';
    const e = new Error(err);
    e.statusCode = 400;
    throw e;
  }
}

function resolveMediaSource(payload) {
  if (payload.mediaBase64) {
    const raw = payload.mediaBase64.replace(/^data:[^;]+;base64,/, '');
    return Buffer.from(raw, 'base64');
  }
  return { url: payload.mediaUrl };
}

function guessFileNameFromUrl(url, fallback) {
  try {
    const name = path.basename(new URL(url).pathname);
    return name && name !== '/' ? decodeURIComponent(name) : fallback;
  } catch {
    return fallback;
  }
}

function buildWhatsAppContent(payload) {
  validateSendPayload(payload);

  const caption = payload.message || undefined;

  if (payload.mediaType === 'text') {
    return {
      kind: 'text',
      content: { text: payload.message },
      preview: payload.message,
    };
  }

  const source = resolveMediaSource(payload);

  switch (payload.mediaType) {
    case 'image':
      return {
        kind: 'image',
        content: { image: source, ...(caption ? { caption } : {}) },
        preview: caption ? `[imagen] ${caption}` : `[imagen] ${payload.mediaUrl || 'base64'}`,
      };
    case 'document':
      return {
        kind: 'document',
        content: {
          document: source,
          mimetype: payload.mimetype || 'application/octet-stream',
          fileName:
            payload.fileName ||
            (payload.mediaUrl ? guessFileNameFromUrl(payload.mediaUrl, 'archivo') : 'archivo'),
          ...(caption ? { caption } : {}),
        },
        preview: caption ? `[documento] ${caption}` : `[documento] ${payload.fileName || payload.mediaUrl || 'base64'}`,
      };
    case 'video':
      return {
        kind: 'video',
        content: {
          video: source,
          mimetype: payload.mimetype || 'video/mp4',
          ...(caption ? { caption } : {}),
        },
        preview: caption ? `[video] ${caption}` : `[video] ${payload.mediaUrl || 'base64'}`,
      };
    case 'audio':
      return {
        kind: 'audio',
        content: {
          audio: source,
          mimetype: payload.mimetype || 'audio/mpeg',
          ptt: payload.ptt,
        },
        preview: payload.ptt ? '[nota de voz]' : `[audio] ${payload.mediaUrl || 'base64'}`,
      };
    case 'sticker':
      return {
        kind: 'sticker',
        content: { sticker: source },
        preview: '[sticker]',
      };
    default: {
      const err = `mediaType no soportado: ${payload.mediaType}. Usa text, image, document, video, audio o sticker.`;
      const e = new Error(err);
      e.statusCode = 400;
      throw e;
    }
  }
}

async function checkWhatsAppNumber(rawPhone) {
  if (connectionState !== 'connected' || !sock) {
    const err = 'WhatsApp no conectado. Escanea el QR primero.';
    const e = new Error(err);
    e.statusCode = 503;
    throw e;
  }

  const digits = normalizePhone(rawPhone);
  if (!digits) {
    const err = 'Número inválido. Usa 10 dígitos MX (449…) o formato 521XXXXXXXXXX.';
    const e = new Error(err);
    e.statusCode = 400;
    throw e;
  }

  const queryJid = `${digits}@s.whatsapp.net`;
  const results = await sock.onWhatsApp(queryJid);
  const row = results?.[0];

  return {
    ok: true,
    to: digits,
    exists: Boolean(row?.exists),
    jid: row?.exists ? row.jid : null,
  };
}

async function sendWhatsAppMessage(to, message, source = 'api', options = {}) {
  return sendWhatsAppPayload(
    to,
    parseSendPayload({ message, ...(options.media || {}), mediaType: options.mediaType, mediaUrl: options.mediaUrl }),
    source,
    options,
  );
}

async function sendWhatsAppPayload(to, payload, source = 'api', options = {}) {
  if (connectionState !== 'connected' || !sock) {
    const err = 'WhatsApp no conectado. Escanea el QR primero.';
    recordSend({
      to,
      message: payload.message,
      kind: payload.mediaType,
      source,
      status: 'failed',
      error: err,
    });
    const e = new Error(err);
    e.statusCode = 503;
    throw e;
  }

  const { checkExists = false } = options;
  let built;

  try {
    built = buildWhatsAppContent(payload);
  } catch (err) {
    recordSend({
      to,
      message: payload.message,
      kind: payload.mediaType,
      preview: payload.message,
      source,
      status: 'failed',
      error: err.message,
    });
    if (!err.statusCode) err.statusCode = 400;
    throw err;
  }

  let jid;
  if (checkExists) {
    const check = await checkWhatsAppNumber(to);
    if (!check.exists) {
      const err = 'El número no está registrado en WhatsApp.';
      recordSend({
        to,
        message: payload.message,
        kind: built.kind,
        preview: built.preview,
        source,
        status: 'failed',
        error: err,
      });
      const e = new Error(err);
      e.statusCode = 422;
      e.code = 'NOT_ON_WHATSAPP';
      throw e;
    }
    jid = check.jid;
  } else {
    jid = toJid(to);
    if (!jid) {
      const err = 'Número inválido. Usa 10 dígitos MX (449…) o formato 521XXXXXXXXXX.';
      recordSend({
        to,
        message: payload.message,
        kind: built.kind,
        preview: built.preview,
        source,
        status: 'failed',
        error: err,
      });
      const e = new Error(err);
      e.statusCode = 400;
      throw e;
    }
  }

  try {
    const result = await sock.sendMessage(jid, built.content);
    const row = recordSend({
      to: normalizePhone(to),
      message: payload.message,
      kind: built.kind,
      preview: built.preview,
      source,
      status: 'sent',
    });
    return {
      ok: true,
      to: normalizePhone(to),
      kind: built.kind,
      messageId: result?.key?.id,
      log: row,
    };
  } catch (err) {
    recordSend({
      to,
      message: payload.message,
      kind: built.kind,
      preview: built.preview,
      source,
      status: 'failed',
      error: err.message,
    });
    const e = new Error(err.message || 'No se pudo enviar el mensaje.');
    e.statusCode = 502;
    throw e;
  }
}

async function connectWhatsApp() {
  if (starting || sock) return;
  starting = true;
  lastError = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['OptiSave Comercial', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
        connectionState = 'qr';
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        connectionState = 'disconnected';
        qrDataUrl = null;
        phoneNumber = null;
        sock = null;
        starting = false;

        if (!loggedOut) {
          setTimeout(connectWhatsApp, 3000);
        }
      } else if (connection === 'open') {
        connectionState = 'connected';
        qrDataUrl = null;
        const rawId = sock?.user?.id || '';
        phoneNumber = rawId.split(':')[0].split('@')[0] || null;
        starting = false;
      }
    });
  } catch (err) {
    lastError = err.message || 'Error al iniciar Baileys';
    connectionState = 'disconnected';
    starting = false;
    sock = null;
    setTimeout(connectWhatsApp, 5000);
  }
}

async function logoutWhatsApp() {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      /* ignore */
    }
    sock = null;
  }

  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  qrDataUrl = null;
  connectionState = 'disconnected';
  phoneNumber = null;
  starting = false;
  setTimeout(connectWhatsApp, 1000);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(authMiddleware);

async function handleSendRoute(req, res, { defaultSource, checkExists = false }) {
  const body = req.body || {};
  const { to, source = defaultSource, prospectId, skipCheck } = body;

  if (!to) {
    return res.status(400).json({ error: 'Falta to (número destino).' });
  }

  try {
    const payload = parseSendPayload(body);
    const result = await sendWhatsAppPayload(to, payload, source, {
      checkExists: skipCheck === true ? false : checkExists,
    });
    if (prospectId != null) result.prospectId = prospectId;
    return res.json(result);
  } catch (err) {
    const out = { error: err.message };
    if (err.code) out.code = err.code;
    return res.status(err.statusCode || 500).json(out);
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'baileys' });
});

app.get('/status', (_req, res) => {
  res.json({
    state: connectionState,
    connected: connectionState === 'connected',
    phoneNumber,
    hasQr: Boolean(qrDataUrl),
    lastError,
  });
});

app.get('/qr', (_req, res) => {
  res.json({
    state: connectionState,
    connected: connectionState === 'connected',
    phoneNumber,
    qr: qrDataUrl,
  });
});

app.get('/send-log', (_req, res) => {
  res.json({ items: sendLog });
});

app.post('/check', async (req, res) => {
  const { to } = req.body || {};
  if (!to) {
    return res.status(400).json({ error: 'Falta to (número a verificar).' });
  }
  try {
    const result = await checkWhatsAppNumber(to);
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/webhook/check', async (req, res) => {
  const { to, prospectId } = req.body || {};
  if (!to) {
    return res.status(400).json({ error: 'Falta to (número a verificar).' });
  }
  try {
    const result = await checkWhatsAppNumber(to);
    return res.json({ ...result, prospectId: prospectId || null });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/send', (req, res) => handleSendRoute(req, res, { defaultSource: 'api' }));

app.post('/webhook/send', (req, res) => {
  const prospectId = req.body?.prospectId;
  const source = prospectId ? `cron:${prospectId}` : 'cron';
  return handleSendRoute(req, res, { defaultSource: source, checkExists: true });
});

app.post('/logout', async (_req, res) => {
  await logoutWhatsApp();
  res.json({ ok: true, state: connectionState });
});

app.listen(PORT, () => {
  console.log(`Baileys service listening on port ${PORT}`);
  connectWhatsApp();
});
