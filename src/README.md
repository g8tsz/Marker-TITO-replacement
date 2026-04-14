# src — Marker-TITO API

Node.js/Express backend for the digital Marker-TITO replacement.

## Setup

```bash
npm install
cp .env.example .env   # fill in API_KEYS and other settings
npm start
```

See the root [README](../README.md) for full setup and usage instructions.

## Structure

| File/Dir                | Purpose                                          |
|-------------------------|--------------------------------------------------|
| `index.js`              | Express server entry point                       |
| `db/schema.sql`         | SQLite DDL — tickets + audit_events tables       |
| `db/db.js`              | SQLite singleton (better-sqlite3)                |
| `routes/tickets.js`     | All `/v1/tickets` route handlers                 |
| `middleware/auth.js`    | API key authentication middleware                |
| `utils/token.js`        | Crypto token + short code generation             |
| `utils/audit.js`        | Audit event write + query helpers                |
| `utils/logger.js`       | Structured JSON logger                           |
| `.env.example`          | Environment variable template                    |

## Environment Variables

| Variable                  | Default          | Description                              |
|---------------------------|------------------|------------------------------------------|
| `API_KEYS`                | *(required)*     | Comma-separated list of valid API keys   |
| `PORT`                    | `3000`           | HTTP port                                |
| `DB_PATH`                 | `./data/tito.db` | SQLite file path                         |
| `TICKET_TTL_SECONDS`      | `0` (no expiry)  | Seconds until a ticket expires           |
| `MAX_TICKET_VALUE_CENTS`  | `10000000`       | Maximum ticket value ($100,000)          |
| `ALLOWED_PROPERTY_IDS`    | *(blank = any)*  | Comma-separated valid property IDs       |
| `LOG_LEVEL`               | `info`           | `error` \| `warn` \| `info` \| `debug`  |
