# Marker-TITO Replacement

**Digital replacement for the IRL casino ticket system** — the paper vouchers printed by slot machines and redeemed at the cage or another machine, now fully digital.

---

## What This Replaces

In casinos today:

- **Ticket Out:** Player cashes out at a slot → a **paper voucher** prints (barcode, value, security code).
- **Ticket In:** Player takes that slip to another machine or the cage → it is scanned → value is credited or paid out.
- **Markers:** At table games, paper **markers** (credit slips) work the same way.

This project replaces that **paper flow with digital tickets**: issue → store → present (QR code or short alphanumeric code) → validate → redeem, with a full immutable audit trail and no paper.

---

## Status

**V1 — Backend API shipped.**  The core ticket lifecycle (issue, validate, redeem, void, audit) is implemented and ready to integrate.

| Feature                  | Status        |
|--------------------------|---------------|
| Issue tickets            | ✅ Done        |
| Validate tickets         | ✅ Done        |
| Redeem tickets (atomic)  | ✅ Done        |
| Void tickets             | ✅ Done        |
| Audit trail              | ✅ Done        |
| QR code generation       | ✅ Done        |
| Short code generation    | ✅ Done        |
| API key auth             | ✅ Done        |
| Rate limiting            | ✅ Done        |
| Expiry / TTL support     | ✅ Done        |
| Multi-property support   | ✅ Done        |
| PostgreSQL backend       | 🔲 Planned     |
| Player identity binding  | 🔲 Planned     |
| Slot system connectors   | 🔲 Planned     |
| Web dashboard / cage UI  | 🔲 Planned     |

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- npm

### 1. Clone & install

```bash
git clone https://github.com/g8tsz/Marker-TITO-replacement.git
cd Marker-TITO-replacement/src
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — at minimum set API_KEYS
```

```
API_KEYS=your-secret-operator-key
PORT=3000
DB_PATH=./data/tito.db
TICKET_TTL_SECONDS=86400
```

### 3. Run

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Server starts on `http://localhost:3000`.

### 4. Try it

```bash
# Issue a ticket
curl -s -X POST http://localhost:3000/v1/tickets \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-operator-key" \
  -d '{"value_cents": 2500, "property_id": "PROP-001", "machine_id": "EGM-42"}'

# Validate
curl -s -X POST http://localhost:3000/v1/tickets/validate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-operator-key" \
  -d '{"token": "<token from above>", "property_id": "PROP-001"}'

# Redeem
curl -s -X POST http://localhost:3000/v1/tickets/redeem \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-operator-key" \
  -d '{"token": "<token>", "property_id": "PROP-001", "redemption_point_id": "CAGE-01"}'
```

---

## API Overview

All endpoints are under `/v1/tickets` and require `X-API-Key` header.

| Method | Path                         | Description                        |
|--------|------------------------------|------------------------------------|
| POST   | `/v1/tickets`                | Issue a new ticket                 |
| POST   | `/v1/tickets/validate`       | Validate (non-destructive check)   |
| POST   | `/v1/tickets/redeem`         | Atomically redeem a ticket         |
| GET    | `/v1/tickets/:id`            | Get ticket state (admin/audit)     |
| GET    | `/v1/tickets/:id/audit`      | Full audit trail for a ticket      |
| GET    | `/v1/tickets/:id/qr`         | QR code PNG (data URL)             |
| POST   | `/v1/tickets/:id/void`       | Void (cancel) an unspent ticket    |
| GET    | `/health`                    | Health check (no auth)             |

See [`docs/API.md`](docs/API.md) for full request/response schemas and error codes.

---

## Repo Structure

```
Marker-TITO-replacement/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md   # System design, data model, security model
│   ├── API.md            # Full API reference with examples
│   ├── INTEGRATION.md    # How to connect EGMs, cage, kiosks
│   └── SECURITY.md       # Threat model and mitigations
└── src/
    ├── index.js          # Express server entry point
    ├── package.json
    ├── .env.example
    ├── db/
    │   ├── db.js         # SQLite connection singleton
    │   └── schema.sql    # tickets + audit_events DDL
    ├── routes/
    │   └── tickets.js    # All /v1/tickets endpoints
    ├── middleware/
    │   └── auth.js       # API key authentication
    └── utils/
        ├── token.js      # Crypto token & short code generation
        ├── audit.js      # Audit event helpers
        └── logger.js     # Structured JSON logger
```

---

## Security Highlights

- **Tokens** are 32 bytes of `crypto.randomBytes` — 2²⁵⁶ entropy, not guessable.
- **Redemption** is wrapped in a SQLite write transaction — concurrent calls cannot double-spend.
- **API keys** are compared with `crypto.timingSafeEqual` — timing-safe.
- **Rate limiting** is enforced at 200 req/min per IP.
- **Audit events** are append-only — never updated or deleted.

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full threat model.

---

## Integration

See [`docs/INTEGRATION.md`](docs/INTEGRATION.md) for:

- EGM cash-out flow
- Cage redemption flow
- Kiosk / ticket-in flow
- Short code flow
- Authentication and key rotation
- Idempotency considerations
- Compliance and reconciliation

---

## Contributing

Open an issue or PR.  For integration or compliance questions, see `docs/`.

---

## License

[MIT](LICENSE)
