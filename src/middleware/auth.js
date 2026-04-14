const { safeCompare } = require('../utils/token');
const logger = require('../utils/logger');

/**
 * API key middleware.
 * Reads X-API-Key header and compares against API_KEYS env var (comma-separated list).
 * Uses constant-time comparison to prevent timing attacks.
 */
function requireApiKey(req, res, next) {
  const provided = req.headers['x-api-key'] || req.query.api_key;

  if (!provided) {
    logger.warn('Rejected unauthenticated request', { path: req.path, ip: req.ip });
    return res.status(401).json({ error: 'Missing API key. Provide X-API-Key header.' });
  }

  const validKeys = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  if (validKeys.length === 0) {
    logger.error('No API_KEYS configured — all requests will be rejected');
    return res.status(500).json({ error: 'Server misconfiguration: no API keys set.' });
  }

  const isValid = validKeys.some(key => safeCompare(provided, key));

  if (!isValid) {
    logger.warn('Rejected invalid API key', { path: req.path, ip: req.ip });
    return res.status(403).json({ error: 'Invalid API key.' });
  }

  next();
}

module.exports = { requireApiKey };
