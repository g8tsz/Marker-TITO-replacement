-- Digital TITO replacement schema
-- SQLite dialect; compatible with Postgres with minor type adjustments.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── tickets ──────────────────────────────────────────────────────────────────
-- Each row represents one digital ticket (bearer instrument).
-- Tokens are cryptographically random and must be treated as secrets.

CREATE TABLE IF NOT EXISTS tickets (
    ticket_id           TEXT    PRIMARY KEY,   -- UUID v4
    token               TEXT    NOT NULL UNIQUE, -- 32-byte hex, opaque bearer token
    value_cents         INTEGER NOT NULL CHECK (value_cents > 0),
    currency            TEXT    NOT NULL DEFAULT 'USD',
    property_id         TEXT    NOT NULL,
    machine_id          TEXT,                  -- issuing EGM / table ID (optional)
    status              TEXT    NOT NULL DEFAULT 'issued'
                            CHECK (status IN ('issued', 'redeemed', 'voided', 'expired')),
    issued_at           TEXT    NOT NULL,       -- ISO-8601 UTC
    expires_at          TEXT,                  -- ISO-8601 UTC; NULL = no expiry
    redeemed_at         TEXT,
    redemption_point_id TEXT,
    voided_at           TEXT,
    void_reason         TEXT,
    metadata            TEXT    DEFAULT '{}'   -- JSON blob for integrator use
);

CREATE INDEX IF NOT EXISTS idx_tickets_token      ON tickets (token);
CREATE INDEX IF NOT EXISTS idx_tickets_property   ON tickets (property_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_issued_at  ON tickets (issued_at);

-- ── audit_events ─────────────────────────────────────────────────────────────
-- Append-only ledger.  Never delete rows; add a voided row instead.

CREATE TABLE IF NOT EXISTS audit_events (
    event_id        TEXT    PRIMARY KEY,  -- UUID v4
    ticket_id       TEXT    NOT NULL REFERENCES tickets (ticket_id),
    event_type      TEXT    NOT NULL      -- 'issued' | 'validated' | 'redeemed' | 'voided' | 'expired'
                        CHECK (event_type IN ('issued','validated','redeemed','voided','expired')),
    actor_id        TEXT,                 -- property / kiosk / cage ID that triggered the event
    property_id     TEXT,
    occurred_at     TEXT    NOT NULL,     -- ISO-8601 UTC
    detail          TEXT    DEFAULT '{}'  -- JSON: extra context (reason, IP, etc.)
);

CREATE INDEX IF NOT EXISTS idx_audit_ticket    ON audit_events (ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred  ON audit_events (occurred_at);
