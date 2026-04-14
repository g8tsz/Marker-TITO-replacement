const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

const { getDb } = require('../db/db');
const { generateToken, generateShortCode } = require('../utils/token');
const { logAuditEvent, getAuditTrail } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function now() { return new Date().toISOString(); }

function ticketExpiry() {
  const ttl = parseInt(process.env.TICKET_TTL_SECONDS || '0', 10);
  if (!ttl) return null;
  return new Date(Date.now() + ttl * 1000).toISOString();
}

function isExpired(ticket) {
  if (!ticket.expires_at) return false;
  return new Date(ticket.expires_at) < new Date();
}

function formatTicket(row) {
  return {
    ticket_id:           row.ticket_id,
    value_cents:         row.value_cents,
    currency:            row.currency,
    property_id:         row.property_id,
    machine_id:          row.machine_id ?? undefined,
    status:              row.status,
    issued_at:           row.issued_at,
    expires_at:          row.expires_at ?? undefined,
    redeemed_at:         row.redeemed_at ?? undefined,
    redemption_point_id: row.redemption_point_id ?? undefined,
    voided_at:           row.voided_at ?? undefined,
    void_reason:         row.void_reason ?? undefined,
    metadata:            row.metadata ? JSON.parse(row.metadata) : {},
  };
}

// ── POST /tickets ─────────────────────────────────────────────────────────────
// Issue a new digital ticket.

router.post('/', (req, res) => {
  const { value_cents, property_id, machine_id, currency = 'USD', metadata = {} } = req.body;

  // Validation
  if (!Number.isInteger(value_cents) || value_cents <= 0) {
    return res.status(400).json({ error: 'value_cents must be a positive integer.' });
  }
  const maxValue = parseInt(process.env.MAX_TICKET_VALUE_CENTS || '10000000', 10);
  if (value_cents > maxValue) {
    return res.status(400).json({ error: `value_cents exceeds maximum allowed (${maxValue}).` });
  }
  if (!property_id || typeof property_id !== 'string') {
    return res.status(400).json({ error: 'property_id is required.' });
  }

  const allowedProps = (process.env.ALLOWED_PROPERTY_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowedProps.length > 0 && !allowedProps.includes(property_id)) {
    return res.status(400).json({ error: `Unknown property_id: ${property_id}` });
  }

  const db = getDb();
  const ticket_id  = uuidv4();
  const token      = generateToken();
  const short_code = generateShortCode();
  const issued_at  = now();
  const expires_at = ticketExpiry();

  const metadataWithCode = { ...metadata, short_code };

  db.prepare(`
    INSERT INTO tickets
      (ticket_id, token, value_cents, currency, property_id, machine_id, status, issued_at, expires_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?)
  `).run(
    ticket_id, token, value_cents, currency,
    property_id, machine_id ?? null,
    issued_at, expires_at,
    JSON.stringify(metadataWithCode)
  );

  logAuditEvent(ticket_id, 'issued', {
    actorId:    machine_id,
    propertyId: property_id,
    detail:     { value_cents, currency, machine_id },
  });

  logger.info('Ticket issued', { ticket_id, value_cents, currency, property_id });

  return res.status(201).json({
    ticket_id,
    token,
    short_code,
    value_cents,
    currency,
    issued_at,
    expires_at: expires_at ?? undefined,
  });
});

// ── POST /tickets/validate ────────────────────────────────────────────────────
// Check validity without redeeming.

router.post('/validate', (req, res) => {
  const { token, property_id } = req.body;

  if (!token) return res.status(400).json({ error: 'token is required.' });

  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE token = ?').get(token);

  if (!ticket) {
    return res.status(200).json({ valid: false, reason: 'Ticket not found.' });
  }

  if (property_id && ticket.property_id !== property_id) {
    return res.status(200).json({ valid: false, reason: 'Ticket is not valid for this property.' });
  }

  if (isExpired(ticket) && ticket.status === 'issued') {
    db.prepare(`UPDATE tickets SET status = 'expired' WHERE ticket_id = ?`).run(ticket.ticket_id);
    logAuditEvent(ticket.ticket_id, 'expired', { propertyId: property_id });
    return res.status(200).json({ valid: false, reason: 'Ticket has expired.' });
  }

  if (ticket.status !== 'issued') {
    return res.status(200).json({
      valid:  false,
      reason: `Ticket is ${ticket.status}.`,
      status: ticket.status,
    });
  }

  logAuditEvent(ticket.ticket_id, 'validated', {
    propertyId: property_id,
    detail:     { redemption_property: property_id },
  });

  logger.info('Ticket validated', { ticket_id: ticket.ticket_id, property_id });

  return res.status(200).json({
    valid:      true,
    ticket_id:  ticket.ticket_id,
    value_cents: ticket.value_cents,
    currency:   ticket.currency,
    expires_at: ticket.expires_at ?? undefined,
  });
});

// ── POST /tickets/redeem ──────────────────────────────────────────────────────
// Atomically validate and redeem — one-time, no double-spend.

router.post('/redeem', (req, res) => {
  const { token, property_id, redemption_point_id } = req.body;

  if (!token)       return res.status(400).json({ error: 'token is required.' });
  if (!property_id) return res.status(400).json({ error: 'property_id is required.' });

  const db = getDb();

  // Wrap in a transaction so concurrent requests cannot double-redeem.
  const redeem = db.transaction(() => {
    const ticket = db.prepare('SELECT * FROM tickets WHERE token = ?').get(token);

    if (!ticket) return { success: false, reason: 'Ticket not found.' };

    if (ticket.property_id !== property_id) {
      return { success: false, reason: 'Ticket is not valid for this property.' };
    }

    if (isExpired(ticket) && ticket.status === 'issued') {
      db.prepare(`UPDATE tickets SET status = 'expired' WHERE ticket_id = ?`).run(ticket.ticket_id);
      logAuditEvent(ticket.ticket_id, 'expired', { propertyId: property_id });
      return { success: false, reason: 'Ticket has expired.' };
    }

    if (ticket.status !== 'issued') {
      return {
        success:   false,
        reason:    `Ticket is already ${ticket.status}.`,
        status:    ticket.status,
        redeemed_at: ticket.redeemed_at ?? undefined,
      };
    }

    const redeemed_at = now();
    db.prepare(`
      UPDATE tickets
      SET status = 'redeemed', redeemed_at = ?, redemption_point_id = ?
      WHERE ticket_id = ?
    `).run(redeemed_at, redemption_point_id ?? null, ticket.ticket_id);

    return {
      success:             true,
      ticket_id:           ticket.ticket_id,
      value_cents:         ticket.value_cents,
      currency:            ticket.currency,
      redeemed_at,
      redemption_point_id: redemption_point_id ?? undefined,
    };
  });

  const result = redeem();

  if (result.success) {
    logAuditEvent(result.ticket_id, 'redeemed', {
      actorId:    redemption_point_id,
      propertyId: property_id,
      detail:     { redemption_point_id, value_cents: result.value_cents },
    });
    logger.info('Ticket redeemed', { ticket_id: result.ticket_id, value_cents: result.value_cents, property_id });
    return res.status(200).json(result);
  } else {
    logger.warn('Ticket redemption failed', { reason: result.reason });
    return res.status(409).json({ success: false, ...result });
  }
});

// ── GET /tickets/:id ──────────────────────────────────────────────────────────
// Admin/audit: get full ticket state.

router.get('/:id', (req, res) => {
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  return res.status(200).json(formatTicket(ticket));
});

// ── GET /tickets/:id/audit ────────────────────────────────────────────────────
// Full audit trail for a ticket.

router.get('/:id/audit', (req, res) => {
  const db = getDb();
  const ticket = db.prepare('SELECT ticket_id FROM tickets WHERE ticket_id = ?').get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const events = getAuditTrail(req.params.id);
  return res.status(200).json({ ticket_id: req.params.id, events });
});

// ── GET /tickets/:id/qr ───────────────────────────────────────────────────────
// Generate a QR code PNG (data URL) for the token.

router.get('/:id/qr', async (req, res) => {
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  if (ticket.status !== 'issued') {
    return res.status(410).json({ error: `Ticket is ${ticket.status} and no longer redeemable.` });
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(ticket.token, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
    });
    return res.status(200).json({
      ticket_id:   ticket.ticket_id,
      value_cents: ticket.value_cents,
      currency:    ticket.currency,
      qr_data_url: qrDataUrl,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate QR code.' });
  }
});

// ── POST /tickets/:id/void ────────────────────────────────────────────────────
// Operator: void (cancel) an unspent ticket.

router.post('/:id/void', (req, res) => {
  const { reason } = req.body;
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  if (ticket.status !== 'issued') {
    return res.status(409).json({ error: `Cannot void a ticket with status '${ticket.status}'.` });
  }

  const voided_at = now();
  db.prepare(`
    UPDATE tickets SET status = 'voided', voided_at = ?, void_reason = ? WHERE ticket_id = ?
  `).run(voided_at, reason ?? null, ticket.ticket_id);

  logAuditEvent(ticket.ticket_id, 'voided', {
    detail: { reason },
  });

  logger.info('Ticket voided', { ticket_id: ticket.ticket_id, reason });

  return res.status(200).json({
    ticket_id: ticket.ticket_id,
    status:    'voided',
    voided_at,
    reason:    reason ?? undefined,
  });
});

module.exports = router;
