# Marker-TITO Replacement

**Digital replacement for the IRL casino ticket system** — the physical vouchers you get from slot machines and redeem at the cage or another machine.

## What This Replaces

In casinos today:

- **Ticket Out:** You cash out at a slot → a **paper voucher** prints (barcode, value, security code).
- **Ticket In:** You take that slip to another machine or the cage → it’s scanned → value is credited or paid in cash.
- **Markers:** At table games, paper **markers** (credit slips) work the same way: paper in, paper out.

This project replaces that **paper flow with digital tickets**: issue → store → present (QR/code/app) → validate → redeem, with full audit and no paper.

## Goals

- **Issue** digital tickets when a player cashes out (slot or table).
- **Store** tickets server-side; player holds a token (e.g. QR code or short code).
- **Validate** tickets at any redemption point (EGM, kiosk, cage).
- **Redeem** once, atomically, with full audit trail for cage reconciliation and compliance.

## Repo Structure

```
Marker-TITO-replacement/
├── README.md           # This file
├── docs/               # Architecture, API spec, integration notes
├── src/                # Backend / API (to be implemented)
├── .gitignore
└── LICENSE
```

## Status

**Early stage.** This repo defines the product and will hold the backend/API and docs. Integrations (slot systems, cage, property management) will be added as the core is built.

## Contributing

Open an issue or PR. For integration or compliance questions, see `docs/`.

## License

See [LICENSE](LICENSE).
