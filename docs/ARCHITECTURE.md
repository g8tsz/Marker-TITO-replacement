# Architecture

## Problem

Casinos rely on **paper vouchers (TITO)** and **paper markers** for cash-out and credit.  This creates:

- Printer/paper/maintenance cost at scale
- No real-time single source of truth for ticket state
- Reconciliation headaches and dispute risk around physical slips
- Fraud vectors (counterfeiting, duplicate scans before reconciliation)

---

## Solution: Digital Tickets

Replace paper with **server-side digital tickets**.  The player receives a **bearer token** (displayed as a QR code or short alphanumeric code) that references the ticket record.  Any redemption point validates the token against the API and redeems atomically — no paper, no double-spend.

```
                 ┌─────────────┐
   Cash-out ───► │  EGM / Table│──POST /v1/tickets──────────────────┐
                 └─────────────┘                                    │
                                                                    ▼
                                                         ┌──────────────────┐
                                            ┌────────────│  Ticket Service  │
                                            │            │   (this API)     │
                 ┌─────────────┐            │            └──────────────────┘
   Player ───►  │  Kiosk/Cage │──POST /v1/tickets/redeem──►  validates token
   presents QR  └─────────────┘            │            └── marks redeemed
   or short code                           │            └── audit event
                                           │
                                           ▼
                                     SQLite DB (WAL)
                                     (tickets + audit_events)
```

---

## Core Flows

### 1. Issue

1. EGM / table system POSTs to `/v1/tickets` with value, property, and optional machine ID.
2. Service creates a ticket row (`status = issued`), generates a cryptographically random **token** and a **short code**.
3. Returns token + short code to the caller; caller renders QR or prints short code for the player.

### 2. Validate (non-destructive)

1. Redemption point POSTs token to `/v1/tickets/validate`.
2. Service checks: exists? right property? not expired? not already redeemed/voided?
3. Returns `valid: true/false` and value — no state change.

### 3. Redeem (atomic)

1. Redemption point POSTs token + property_id to `/v1/tickets/redeem`.
2. Service wraps the check-and-update in a **SQLite transaction** — concurrent calls cannot both succeed.
3. On success: `status → redeemed`, `redeemed_at` and `redemption_point_id` are recorded.
4. All outcomes (success or failure) are written to `audit_events`.

### 4. Void

1. Operator POSTs to `/v1/tickets/:id/void` with an optional reason.
2. Only `issued` tickets can be voided.
3. `status → voided`, voided_at/void_reason recorded, audit event written.

---

## Data Model

### `tickets`

| Column               | Type    | Notes                                       |
|----------------------|---------|---------------------------------------------|
| `ticket_id`          | TEXT PK | UUID v4                                     |
| `token`              | TEXT    | 32-byte hex, unique, treat as secret        |
| `value_cents`        | INTEGER | Positive, ≤ MAX_TICKET_VALUE_CENTS          |
| `currency`           | TEXT    | ISO 4217, default `USD`                     |
| `property_id`        | TEXT    | Issuing/valid-at property                   |
| `machine_id`         | TEXT    | Optional EGM / table identifier             |
| `status`             | TEXT    | `issued` \| `redeemed` \| `voided` \| `expired` |
| `issued_at`          | TEXT    | ISO-8601 UTC                                |
| `expires_at`         | TEXT    | ISO-8601 UTC; NULL = no expiry              |
| `redeemed_at`        | TEXT    | Set on redemption                           |
| `redemption_point_id`| TEXT    | Kiosk / cage ID that redeemed               |
| `voided_at`          | TEXT    | Set on void                                 |
| `void_reason`        | TEXT    | Operator-supplied reason                    |
| `metadata`           | TEXT    | JSON blob; includes `short_code`            |

### `audit_events`

| Column       | Type    | Notes                                                      |
|--------------|---------|------------------------------------------------------------|
| `event_id`   | TEXT PK | UUID v4                                                    |
| `ticket_id`  | TEXT FK | References `tickets.ticket_id`                             |
| `event_type` | TEXT    | `issued` \| `validated` \| `redeemed` \| `voided` \| `expired` |
| `actor_id`   | TEXT    | Property / kiosk / cage that triggered the event           |
| `property_id`| TEXT    |                                                            |
| `occurred_at`| TEXT    | ISO-8601 UTC                                               |
| `detail`     | TEXT    | JSON blob — extra context (value, reason, IP, etc.)        |

Audit events are **append-only** — never deleted, never updated.

---

## Security Model

| Concern             | Mitigation                                                                 |
|---------------------|----------------------------------------------------------------------------|
| Token guessing      | 32-byte crypto-random token (2²⁵⁶ space)                                  |
| Double-spend        | SQLite write transaction; UPDATE is serialised                             |
| Timing attacks      | `crypto.timingSafeEqual` for API key comparison                           |
| Unauthenticated use | All `/v1/*` routes require `X-API-Key`                                    |
| Abuse / DoS         | Rate limiting (200 req/min per IP via express-rate-limit)                 |
| Replay / expiry     | Optional `TICKET_TTL_SECONDS`; expired tickets are auto-transitioned      |

> **Note:** For production, run behind TLS (HTTPS), store `DB_PATH` on an encrypted volume, and rotate `API_KEYS` periodically.  Consider mTLS for machine-to-machine trust.

---

## Components

```
src/
├── index.js              # Express app entry point
├── db/
│   ├── db.js             # SQLite singleton (better-sqlite3)
│   └── schema.sql        # DDL — tickets + audit_events tables
├── routes/
│   └── tickets.js        # All /v1/tickets endpoints
├── middleware/
│   └── auth.js           # API key authentication
└── utils/
    ├── token.js          # Crypto token + short code generation
    ├── audit.js          # Audit event helpers
    └── logger.js         # Structured JSON logger
```

---

## Scaling Considerations

- **SQLite (current):** Suitable for a single server; WAL mode handles concurrent readers well.  Writes serialise through SQLite's write lock — this is intentional for atomic redemption.
- **PostgreSQL (future):** Replace `better-sqlite3` with `pg`; change `BEGIN EXCLUSIVE` → `SELECT FOR UPDATE SKIP LOCKED`; run behind a connection pool.
- **Multi-property:** `property_id` is indexed and validated at issue/redeem; extend `ALLOWED_PROPERTY_IDS` or move to a DB-backed tenant registry.
- **High throughput:** Add a Redis layer for token → ticket_id lookup cache; keep DB as authoritative store.
