require('dotenv').config();

const express    = require('express');
const rateLimit  = require('express-rate-limit');

const { requireApiKey } = require('./middleware/auth');
const ticketRoutes      = require('./routes/tickets');
const logger            = require('./utils/logger');
const { getDb }         = require('./db/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Global middleware ─────────────────────────────────────────────────────────

app.use(express.json());

// Attach request ID and log every incoming request
app.use((req, _res, next) => {
  req.requestId = require('crypto').randomUUID();
  logger.info('Incoming request', { id: req.requestId, method: req.method, path: req.path, ip: req.ip });
  next();
});

// Rate limiting: 200 req/min per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use(limiter);

// ── Health / readiness ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  try {
    getDb(); // will throw if DB is inaccessible
    res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', detail: err.message });
  }
});

// ── API routes (all require auth) ────────────────────────────────────────────

app.use('/v1/tickets', requireApiKey, ticketRoutes);

// Redirect root for discoverability
app.get('/', (_req, res) => res.json({
  name:    'Marker-TITO API',
  version: '1.0.0',
  docs:    'https://github.com/g8tsz/Marker-TITO-replacement/tree/master/docs',
  health:  '/health',
  api:     '/v1/tickets',
}));

// ── 404 and error handlers ────────────────────────────────────────────────────

app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`Marker-TITO API listening`, { port: PORT });
  getDb(); // init DB + apply schema on startup
});

module.exports = app;
