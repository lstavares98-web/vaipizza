# VaiPizza Phone & Counter Orders Design

## Goal
Allow restaurant staff to create orders received by phone or at the counter without requiring the customer to use the customer app, while preserving existing order/KDS/courier flows and avoiding fake passwords or duplicate login accounts.

## Scope
- Add a restaurant-side `Novo pedido` flow with origin `TELEFONE` or `BALCÃO`.
- Phone flow searches customer by phone first.
- If a registered CUSTOMER exists, reuse that user and saved addresses; the order appears in that customer's history.
- If no registered customer exists, create/reuse a lightweight restaurant customer contact keyed by normalized phone. This contact has no password and is not a login account.
- Counter pickup may use an unidentified customer. Delivery always requires name, phone and delivery address/coordinates.
- Orders created by staff enter the same `NEW -> ... -> KDS -> courier` operational flow as app orders.
- Store order origin and immutable customer/address snapshots on the order for auditability.
- Existing app checkout remains unchanged.

## Data Model
Add `OrderOrigin { APP PHONE COUNTER }`.

Add `CustomerContact`:
- `id`
- `phoneNormalized @unique`
- `name`
- `createdAt`, `updatedAt`
- optional relation to orders

Extend `Order`:
- `origin OrderOrigin @default(APP)`
- `userId String?` (registered customer only)
- `customerContactId String?`
- immutable snapshots: `customerNameSnapshot`, `customerPhoneSnapshot`, `deliveryLine1Snapshot`, `deliveryLine2Snapshot`, `deliveryCitySnapshot`, `deliveryPostalCodeSnapshot`
- existing `customerLat/customerLng` remain authoritative coordinates for dispatch/delivery.

Existing APP orders continue storing `userId` and may populate snapshots at creation. Existing historical rows remain valid after nullable migration.

## Customer lookup
`GET /restaurant-orders/customer-lookup?phone=...`
- normalize Portuguese phones to canonical `+351XXXXXXXXX` where possible; otherwise strip formatting while preserving country code.
- find registered CUSTOMER first using normalized comparison over stored phone variants.
- if found return id, name, phone, addresses, type `REGISTERED`.
- otherwise search `CustomerContact`; return type `CONTACT` or `NOT_FOUND`.

## Staff-created order
`POST /restaurant-orders/manual`
Authenticated roles: RESTAURANT_OWNER / RESTAURANT_STAFF.

Input includes origin, optional registered user/contact, customer details, fulfillment type, address snapshot/coords, payment method, amount tendered for CASH, notes, and selected product/combo items with modifier identifiers.

Server owns pricing and validation. It loads products/modifiers/combos from the database, validates restaurant ownership/availability, computes subtotal, delivery fee, cash change, immutable item snapshots, then creates the order. Client-supplied totals are never trusted.

For delivery, enforce restaurant delivery radius using coordinates. For pickup, address is unnecessary.

Emit the same restaurant `order:new` socket event as app checkout.

## Restaurant UI
Add `Novo pedido` action in Gestão.

Flow:
1. Choose `Telefone` or `Balcão`.
2. Phone: enter phone -> lookup.
3. Found registered customer: show name + saved addresses + last orders, allow selection.
4. Found contact: prefill name/phone and last used delivery data if available.
5. Not found: ask name + phone; for delivery ask address/coords.
6. Build basket from the restaurant's own menu, including modifiers/combos.
7. Choose delivery/pickup + payment + cash tendered if relevant.
8. Review and submit.

For `Balcão + PICKUP`, allow `Cliente não identificado`.

## Install App correction
The customer `Instalar app` control must remain visible whenever the app is not already running in standalone mode.
- If `beforeinstallprompt` exists, use it.
- On iOS, show Safari `Partilhar -> Adicionar ao ecrã principal` guidance.
- On other browsers without prompt, show a compact guidance dialog instead of hiding the button.
- Installed/standalone mode hides the control.

## Safety / compatibility
- Production untouched until staging QA is green.
- No change to courier dispatch logic.
- No fake customer passwords.
- No automatic merging of a contact with a registered account without verified identity; association can be a later feature.
- Existing customer checkout and order history continue to work.

## Tests
- phone normalization and registered/contact lookup precedence.
- manual order pricing rejects client-side totals and unavailable/cross-restaurant products.
- delivery radius enforcement.
- pickup unidentified customer succeeds.
- registered customer manual order appears under that user's order history.
- CASH amountTendered/changeDue.
- origin/audit snapshots.
- install-button visibility behavior via pure capability helper/unit tests where practical.
