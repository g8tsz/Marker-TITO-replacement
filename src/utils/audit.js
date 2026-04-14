const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/db');

/**
 * Append an audit event to the ledger.
 *
 * @param {string} ticketId
 * @param {'issued'|'validated'|'redeemed'|'voided'|'expired'} eventType
 * @param {object} opts
 * @param {string} [opts.actorId]     - property/cage/kiosk that triggered the event
 * @param {string} [opts.propertyId]
 * @param {object} [opts.detail]      - arbitrary extra context (will be JSON-stringified)
 */
function logAuditEvent(ticketId, eventType, { actorId, propertyId, detail = {} } = {}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_events (event_id, ticket_id, event_type, actor_id, property_id, occurred_at, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    uuidv4(),
    ticketId,
    eventType,
    actorId ?? null,
    propertyId ?? null,
    new Date().toISOString(),
    JSON.stringify(detail)
  );
}

/**
 * Fetch the full audit trail for a ticket.
 */
function getAuditTrail(ticketId) {
  const db = getDb();
  return db.prepare(`
    SELECT event_id, event_type, actor_id, property_id, occurred_at, detail
    FROM audit_events
    WHERE ticket_id = ?
    ORDER BY occurred_at ASC
  `).all(ticketId).map(row => ({
    ...row,
    detail: JSON.parse(row.detail)
  }));
}

module.exports = { logAuditEvent, getAuditTrail };
