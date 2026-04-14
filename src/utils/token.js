const crypto = require('crypto');

/**
 * Generate a cryptographically random bearer token.
 * 32 bytes = 64 hex chars; collision probability is negligible.
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a short human-readable code (for display at cage / kiosk).
 * Format: XXXX-XXXX-XXXX  (alphanumeric, uppercase, no ambiguous chars).
 */
function generateShortCode() {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
  let code = '';
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    code += CHARS[bytes[i] % CHARS.length];
    if (i === 3 || i === 7) code += '-';
  }
  return code;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = { generateToken, generateShortCode, safeCompare };
