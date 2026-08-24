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

function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  if (req.headers['x-api-key'] === API_KEY) return next();
  return res.status(401).json({ error: 'API key inválida' });
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
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    to: entry.to,
    preview: String(entry.message || '').slice(0, 120),
    source: entry.source || 'api',
    status: entry.status,
    error: entry.error || null,
    at: new Date().toISOString(),
  };
  sendLog.unshift(row);
  if (sendLog.length > SEND_LOG_MAX) sendLog.length = SEND_LOG_MAX;
  return row;
}

async function sendWhatsAppMessage(to, message, source = 'api') {
  if (connectionState !== 'connected' || !sock) {
    const err = 'WhatsApp no conectado. Escanea el QR primero.';
    recordSend({ to, message, source, status: 'failed', error: err });
    const e = new Error(err);
    e.statusCode = 503;
    throw e;
  }

  const jid = toJid(to);
  if (!jid) {
    const err = 'Número inválido. Usa 10 dígitos MX (449…) o formato 521XXXXXXXXXX.';
    recordSend({ to, message, source, status: 'failed', error: err });
    const e = new Error(err);
    e.statusCode = 400;
    throw e;
  }

  const text = String(message || '').trim();
  if (!text) {
    const err = 'El mensaje está vacío.';
    recordSend({ to, message, source, status: 'failed', error: err });
    const e = new Error(err);
    e.statusCode = 400;
    throw e;
  }

  try {
    const result = await sock.sendMessage(jid, { text });
    const row = recordSend({ to: normalizePhone(to), message: text, source, status: 'sent' });
    return { ok: true, to: normalizePhone(to), messageId: result?.key?.id, log: row };
  } catch (err) {
    recordSend({ to, message: text, source, status: 'failed', error: err.message });
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
app.use(express.json());
app.use(authMiddleware);

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

app.post('/send', async (req, res) => {
  const { to, message, source = 'api' } = req.body || {};
  if (!to || message == null) {
    return res.status(400).json({ error: 'Faltan to y message.' });
  }
  try {
    const result = await sendWhatsAppMessage(to, message, source);
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/webhook/send', async (req, res) => {
  const { to, message, prospectId } = req.body || {};
  const source = prospectId ? `cron:${prospectId}` : 'cron';
  if (!to || message == null) {
    return res.status(400).json({ error: 'Faltan to y message.' });
  }
  try {
    const result = await sendWhatsAppMessage(to, message, source);
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/logout', async (_req, res) => {
  await logoutWhatsApp();
  res.json({ ok: true, state: connectionState });
});

app.listen(PORT, () => {
  console.log(`Baileys service listening on port ${PORT}`);
  connectWhatsApp();
});
