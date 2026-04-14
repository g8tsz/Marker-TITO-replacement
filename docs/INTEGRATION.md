# Integration Guide

How to connect slot systems, cage software, and kiosks to the Marker-TITO API.

---

## Typical Integration Points

| System                  | Action                  | Endpoint                     |
|-------------------------|-------------------------|------------------------------|
| EGM (slot machine)      | Issue ticket on cash-out | `POST /v1/tickets`           |
| Table game system       | Issue marker on cash-out | `POST /v1/tickets`           |
| Cage / teller terminal  | Validate before paying   | `POST /v1/tickets/validate`  |
| Cage / teller terminal  | Pay out and redeem       | `POST /v1/tickets/redeem`    |
| Self-service kiosk      | Scan QR and redeem       | `POST /v1/tickets/redeem`    |
| EGM (ticket-in)         | Insert ticket at machine | `POST /v1/tickets/redeem`    |
| Back-office / compliance| Dispute resolution       | `GET /v1/tickets/:id`        |
| Back-office / compliance| Full audit trail         | `GET /v1/tickets/:id/audit`  |
| Operator / cage manager | Cancel unspent ticket    | `POST /v1/tickets/:id/void`  |

---

## EGM Cash-Out Flow

```
EGM detects cash-out event
  │
  ├─► POST /v1/tickets
  │     Body: { value_cents, property_id, machine_id }
  │
  ◄─── 201 { ticket_id, token, short_code, value_cents, issued_at }
  │
  └─► Display QR code (encode token) OR print short_code on screen
```

**Recommended:** Encode `token` as a QR code in your EGM UI.  Store `ticket_id` locally for reference; it is also available in the QR data URL via `GET /v1/tickets/:id/qr`.

---

## Cage Redemption Flow

```
Player presents QR or short_code at cage terminal
  │
  ├─► POST /v1/tickets/validate   (optional preview step)
  │     Body: { token, property_id }
  │
  ◄─── 200 { valid: true, value_cents }
  │
  Cashier confirms amount → clicks "Pay"
  │
  ├─► POST /v1/tickets/redeem
  │     Body: { token, property_id, redemption_point_id: "CAGE-01" }
  │
  ◄─── 200 { success: true, value_cents }
  │
  └─► Dispense cash / credit player account
```

> Always call **redeem** as the final step — never rely on a prior validate as proof of redemption.

---

## Kiosk / EGM Ticket-In Flow

```
Player scans QR at kiosk / inserts voucher at EGM
  │
  ├─► POST /v1/tickets/redeem
  │     Body: { token, property_id, redemption_point_id: "KIOSK-07" }
  │
  ◄─── 200 { success: true, value_cents }
  │
  └─► Credit player balance on machine
```

---

## Short Code Flow

If QR is not available (e.g. player writes down the code or reads it off screen):

1. Player reads `short_code` (format: `XXXX-XXXX-XXXX`) from EGM screen.
2. Cashier types short code at cage terminal.
3. Cage terminal looks up token via your internal mapping (store `short_code → ticket_id` if needed), then calls `GET /v1/tickets/:id` to retrieve the token and redeem.

> Alternatively, integrate a short-code lookup endpoint into your cage software that maps `short_code` → `token` using the `metadata.short_code` field returned at issue time.

---

## Authentication

Every request from an integrated system needs an `X-API-Key` header:

```http
X-API-Key: your-operator-key
```

- Issue one key per integration point (EGM system, cage system, kiosk system) for auditability.
- Rotate keys without downtime by setting multiple values in `API_KEYS`: `key1,key2` — both are valid simultaneously.
- Use HTTPS in production so keys are not transmitted in plaintext.

---

## Property IDs

`property_id` scopes tickets to a casino property.  Set `ALLOWED_PROPERTY_IDS=PROP-001,PROP-002` in `.env` to restrict which properties the API accepts.  Tickets issued for `PROP-001` can only be redeemed against `PROP-001` — cross-property redemption is rejected.

---

## Idempotency Considerations

- **Issue:** If an EGM crashes after calling `POST /v1/tickets` but before displaying the QR, the ticket is already issued.  The EGM should store the `ticket_id` and `token` before displaying to the player.  Re-issuing will create a new ticket.
- **Redeem:** Concurrent redemption attempts for the same token are safe — only one will succeed (SQLite transaction).  The losing call receives `409`.

---

## Expiry

Set `TICKET_TTL_SECONDS` to enforce expiry (e.g. `86400` = 24 hours).  At validation/redemption time, expired tickets are automatically transitioned to `status: expired`.  Players must re-issue (re-cash-out) to get a fresh ticket.

---

## Compliance & Reconciliation

- Use `GET /v1/tickets/:id/audit` to get the full event history for any ticket.
- Export `audit_events` from SQLite daily for your compliance system.
- The `audit_events` table is append-only — no row is ever updated or deleted.
- All amounts are in **cents** to avoid floating-point issues.
