# Architecture (High Level)

## Problem

Casinos today rely on **paper vouchers** (TITO) and **paper markers** for cash-out and credit. This means:

- Cost of printers, paper, and maintenance
- Reconciliation and dispute handling around physical slips
- No single source of truth for ticket state

## Solution: Digital Tickets

Replace paper with **digital tickets** stored server-side. The player gets a **token** (e.g. QR code or short alphanumeric code) that references the ticket; redemption points validate the token against the backend and redeem once.

## Core Flows

1. **Issue** — EGM or table system requests a ticket (value, property, optional metadata). Backend creates a ticket, returns a token for the player.
2. **Validate** — Redemption point (EGM, kiosk, cage) sends token; backend checks ticket exists, is not redeemed, is valid for that property; returns value and status.
3. **Redeem** — Same request can validate-and-redeem in one step: mark ticket redeemed, return success; value is paid out at the device.
4. **Void / Cancel** — Optional: cancel a ticket before redemption (e.g. dispute or operator action).

## Components (Planned)

- **Ticket service** — Create, read, validate, redeem, void tickets. Single source of truth.
- **API** — REST or similar for issue, validate, redeem. Used by EGMs, cage, kiosks.
- **Security** — Ticket IDs must be unguessable; redemption must be atomic (no double-spend).
- **Audit log** — Every state change (issued, validated, redeemed, voided) for reconciliation and compliance.

## Integrations (Later)

- Slot / EGM management system (to trigger issue on cash-out)
- Cage / POS (to validate and redeem)
- Property management (optional: property ID, time windows)

## Out of Scope (V1)

- Stored-value wallet (future product)
- Player identity / loyalty (tickets are bearer instruments unless we add optional player binding later)
