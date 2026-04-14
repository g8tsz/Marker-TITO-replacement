# API Reference

**Base URL:** `http://localhost:3000/v1`  (configure `PORT` in `.env`)

## Authentication

All `/v1/*` endpoints require an **API key** passed in the `X-API-Key` header:

```
X-API-Key: your-operator-key
```

Keys are set in the `API_KEYS` environment variable (comma-separated).  Requests without a valid key receive `401` or `403`.

---

## Endpoints

### `POST /v1/tickets` — Issue a ticket

Creates a new digital ticket when a player cashes out.

**Request**

```json
{
  "value_cents": 2500,
  "property_id": "PROP-001",
  "machine_id": "EGM-42",
  "currency": "USD",
  "metadata": {}
}
```

| Field         | Type    | Required | Notes                                   |
|---------------|---------|----------|-----------------------------------------|
| `value_cents` | integer | Yes      | Positive; max set by `MAX_TICKET_VALUE_CENTS` |
| `property_id` | string  | Yes      | Must be in `ALLOWED_PROPERTY_IDS` if set |
| `machine_id`  | string  | No       | EGM or table identifier                 |
| `currency`    | string  | No       | ISO 4217, default `USD`                 |
| `metadata`    | object  | No       | Arbitrary integrator metadata           |

**Response `201`**

```json
{
  "ticket_id": "a1b2c3d4-...",
  "token": "7f3a9e...<64 hex chars>...",
  "short_code": "ABCD-EFGH-JKLM",
  "value_cents": 2500,
  "currency": "USD",
  "issued_at": "2026-04-13T10:00:00.000Z",
  "expires_at": "2026-04-14T10:00:00.000Z"
}
```

> Store the `token` securely — it is the bearer credential for redemption.  Display `short_code` to the player or encode `token` as a QR code.

---

### `POST /v1/tickets/validate` — Validate (non-destructive)

Check if a ticket is valid without redeeming it.  Use this for a "preview before pay" step at cage.

**Request**

```json
{
  "token": "7f3a9e...",
  "property_id": "PROP-001"
}
```

**Response `200`**

```json
{
  "valid": true,
  "ticket_id": "a1b2c3d4-...",
  "value_cents": 2500,
  "currency": "USD",
  "expires_at": "2026-04-14T10:00:00.000Z"
}
```

**Response `200` (invalid)**

```json
{
  "valid": false,
  "reason": "Ticket is already redeemed.",
  "status": "redeemed"
}
```

---

### `POST /v1/tickets/redeem` — Redeem a ticket

Atomically validates and redeems.  This is the point-of-no-return — ticket is marked `redeemed` and **cannot be used again**.

**Request**

```json
{
  "token": "7f3a9e...",
  "property_id": "PROP-001",
  "redemption_point_id": "KIOSK-07"
}
```

| Field                  | Type   | Required | Notes                              |
|------------------------|--------|----------|------------------------------------|
| `token`                | string | Yes      |                                    |
| `property_id`          | string | Yes      | Must match issuing property        |
| `redemption_point_id`  | string | No       | Kiosk / cage ID for audit trail    |

**Response `200` (success)**

```json
{
  "success": true,
  "ticket_id": "a1b2c3d4-...",
  "value_cents": 2500,
  "currency": "USD",
  "redeemed_at": "2026-04-13T10:05:00.000Z",
  "redemption_point_id": "KIOSK-07"
}
```

**Response `409` (failure)**

```json
{
  "success": false,
  "reason": "Ticket is already redeemed.",
  "status": "redeemed",
  "redeemed_at": "2026-04-13T10:04:55.000Z"
}
```

---

### `GET /v1/tickets/:ticket_id` — Get ticket (admin/audit)

Returns the current state of a ticket by ID.  Use for dispute resolution.

**Response `200`**

```json
{
  "ticket_id": "a1b2c3d4-...",
  "value_cents": 2500,
  "currency": "USD",
  "property_id": "PROP-001",
  "machine_id": "EGM-42",
  "status": "redeemed",
  "issued_at": "2026-04-13T10:00:00.000Z",
  "redeemed_at": "2026-04-13T10:05:00.000Z",
  "redemption_point_id": "KIOSK-07",
  "metadata": { "short_code": "ABCD-EFGH-JKLM" }
}
```

---

### `GET /v1/tickets/:ticket_id/audit` — Audit trail

Returns the full append-only event log for a ticket.

**Response `200`**

```json
{
  "ticket_id": "a1b2c3d4-...",
  "events": [
    {
      "event_id": "e1f2...",
      "event_type": "issued",
      "actor_id": "EGM-42",
      "property_id": "PROP-001",
      "occurred_at": "2026-04-13T10:00:00.000Z",
      "detail": { "value_cents": 2500, "currency": "USD", "machine_id": "EGM-42" }
    },
    {
      "event_id": "e3f4...",
      "event_type": "redeemed",
      "actor_id": "KIOSK-07",
      "property_id": "PROP-001",
      "occurred_at": "2026-04-13T10:05:00.000Z",
      "detail": { "redemption_point_id": "KIOSK-07", "value_cents": 2500 }
    }
  ]
}
```

---

### `GET /v1/tickets/:ticket_id/qr` — QR code

Returns a base64 PNG data URL of the QR code for the ticket's token.  Only available for `issued` tickets.

**Response `200`**

```json
{
  "ticket_id": "a1b2c3d4-...",
  "value_cents": 2500,
  "currency": "USD",
  "qr_data_url": "data:image/png;base64,iVBOR..."
}
```

---

### `POST /v1/tickets/:ticket_id/void` — Void a ticket

Operator action to cancel an unspent ticket.  Only `issued` tickets can be voided.

**Request**

```json
{
  "reason": "Player request"
}
```

**Response `200`**

```json
{
  "ticket_id": "a1b2c3d4-...",
  "status": "voided",
  "voided_at": "2026-04-13T10:02:00.000Z",
  "reason": "Player request"
}
```

---

## Error Codes

| HTTP | Meaning                                                         |
|------|-----------------------------------------------------------------|
| 400  | Bad request — missing or invalid field                         |
| 401  | Missing API key                                                 |
| 403  | Invalid API key                                                 |
| 404  | Ticket not found                                               |
| 409  | Conflict — ticket already redeemed, voided, or expired         |
| 410  | Gone — QR requested for non-`issued` ticket                    |
| 429  | Rate limit exceeded                                            |
| 500  | Internal server error                                          |

All errors follow the format:

```json
{ "error": "Human-readable message." }
```

---

## Health Check

`GET /health` — No auth required.

```json
{ "status": "ok", "ts": "2026-04-13T10:00:00.000Z" }
```
