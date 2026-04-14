# Security Model

## Threat Model

Tickets are **bearer instruments** — whoever holds the token can redeem.  The security model must address:

1. Token guessing / brute-force
2. Double-spend (concurrent redemption)
3. Replay attacks
4. API key exposure
5. Insider / operator fraud

---

## Token Design

- **32 bytes of cryptographic randomness** (`crypto.randomBytes(32)`) encoded as 64 hex characters.
- Entropy: 2²⁵⁶ — brute force is computationally infeasible even at casino scale.
- Tokens are **opaque** — they encode no information about value, property, or expiry.
- Tokens are stored and compared with no truncation or transformation.

---

## Double-Spend Prevention

Redemption is wrapped in a **SQLite write transaction**:

```sql
BEGIN EXCLUSIVE;
SELECT * FROM tickets WHERE token = ? AND status = 'issued';
UPDATE tickets SET status = 'redeemed', redeemed_at = ? WHERE ticket_id = ?;
COMMIT;
```

SQLite's write-lock serialises concurrent calls — only one redemption transaction can hold the lock at a time.  The second concurrent request sees `status = redeemed` and returns `409`.

For a PostgreSQL migration, use `SELECT FOR UPDATE` to achieve the same guarantee.

---

## API Key Security

- Keys are compared using `crypto.timingSafeEqual` to prevent timing side-channels.
- Multiple keys can be active simultaneously (`API_KEYS=key1,key2`) for zero-downtime rotation.
- Keys should be **rotated regularly** — treat them like passwords.
- Never log API keys; the logger only records `path` and `ip` on auth failures.

---

## Transport Security

- **Always run behind HTTPS** in production (nginx/Caddy/ALB with TLS termination).
- API keys and tokens in transit must not be visible in plaintext.
- Consider **mTLS** for machine-to-machine trust (EGM to API server) in high-security deployments.

---

## Rate Limiting

- `express-rate-limit` enforces **200 requests/minute per IP** by default.
- Adjust `windowMs` and `max` in `src/index.js` for your environment.
- Add IP allowlisting (nginx `allow`/`deny`) if EGM IPs are static.

---

## Expiry

- Set `TICKET_TTL_SECONDS` to limit how long a ticket remains valid.
- Expiry is checked at validate/redeem time and the status is transitioned atomically.
- Expired tickets remain in the DB for audit; they cannot be un-expired.

---

## Audit Trail

- Every state change produces an immutable `audit_events` row.
- Rows are never updated or deleted.
- The `detail` JSON column captures context: who, where, why.
- Export the audit table to your compliance system daily.

---

## Short Codes

- Short codes (`XXXX-XXXX-XXXX`) use a 32-character alphabet (no ambiguous chars: `I`, `O`, `0`, `1`).
- They are convenience labels, **not** the bearer credential — the `token` is the secret.
- Do not accept short codes directly at redemption endpoints; always resolve to `ticket_id` → `token` server-side.

---

## Out of Scope (V1)

- **Player identity binding** — tickets are bearer instruments; add optional player PIN/auth in V2.
- **Hardware security modules (HSMs)** for token signing — consider for regulatory environments.
- **End-to-end encryption** of the DB — handled by OS-level disk encryption in production.
