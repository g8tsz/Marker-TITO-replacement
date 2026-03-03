# API (Planned)

API for the digital Marker/TITO replacement. All endpoints are **planned**; implementation will follow.

## Base

- Base URL: TBD (e.g. `https://api.<tenant>.tito.example/v1`)
- Auth: TBD (API key, mTLS, or OAuth for integrators)
- Idempotency: Issue and Redeem should support idempotency keys where needed

## Endpoints

### Issue ticket

**POST** `/tickets`

Creates a new digital ticket (e.g. when player cashes out at EGM).

- **Request body:** `{ "value_cents": number, "property_id": string, "machine_id": string (optional), "currency": string (optional) }`
- **Response:** `{ "ticket_id": string, "token": string, "value_cents": number, "expires_at": string (optional) }`
- `token` is what the player shows (e.g. encoded in QR or displayed as short code).

---

### Validate ticket

**POST** `/tickets/validate`

Checks if a ticket is valid and not yet redeemed. Does not redeem.

- **Request body:** `{ "token": string, "property_id": string (optional) }`
- **Response:** `{ "valid": boolean, "ticket_id": string, "value_cents": number, "reason": string (if invalid) }`

---

### Redeem ticket

**POST** `/tickets/redeem`

Validates and redeems in one step. Ticket is marked redeemed and cannot be used again.

- **Request body:** `{ "token": string, "property_id": string, "redemption_point_id": string (optional) }`
- **Response:** `{ "success": boolean, "ticket_id": string, "value_cents": number, "reason": string (if failed) }`

---

### Get ticket (admin / audit)

**GET** `/tickets/:ticket_id`

Returns current state of a ticket (for dispute resolution or audit). Auth required.

- **Response:** `{ "ticket_id", "value_cents", "status": "issued"|"redeemed"|"voided", "issued_at", "redeemed_at" (if applicable), ... }`

---

### Void ticket

**POST** `/tickets/:ticket_id/void`

Marks a ticket as void (e.g. operator cancel). Optional for V1.

---

## Data Model (Planned)

- **Ticket:** `ticket_id` (UUID), `token` (opaque, unguessable), `value_cents`, `currency`, `property_id`, `status`, `issued_at`, `redeemed_at`, `redemption_point_id`, optional metadata.
- **Audit events:** Append-only log of issue, validate, redeem, void for each ticket.
