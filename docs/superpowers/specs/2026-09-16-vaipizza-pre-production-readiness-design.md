# VaiPizza — Pre-Production Readiness Design

Date: 2026-09-16
Branch: `feat/pre-production-readiness`
Base: staging commit `ce17658ae3e839ac23a5a5f1e7198928b4b4c007`

## Goal

Finish the remaining pre-production hardening without turning VaiPizza into a heavier or more complex system than necessary. The design prioritizes operational clarity, low server load, mobile reliability and recoverability.

Production remains untouched until staging is green and an explicit production-readiness checkpoint is approved.

## Scope

This phase covers eight areas:

1. Courier cash liability visibility without blocking work.
2. Courier map focus/navigation in Gestão using the existing live map.
3. Customer PWA install affordance.
4. iPhone courier viewport/stability corrections.
5. Event-driven Web Push for courier offers, including installed iPhone PWAs.
6. Admin orders: today-by-default, historical search and full order inspection.
7. Admin dashboard refresh with server-side analytics and clear pending-cash visibility.
8. Customer delivery-address assistance plus real password-recovery email delivery.

Guest checkout and mandatory unique phone numbers are explicitly deferred from this phase.

## Design principles

- Reuse existing flows before adding subsystems.
- Prefer event-driven work over polling.
- Keep GPS truth explicit: show age/accuracy, never imply live location when the point is stale.
- Preserve historical orders; hide old orders from the default operational view rather than deleting them.
- The restaurant confirms cash settlement. The courier can never clear their own cash liability.
- Pending cash must be visible but must not block dispatch. A single working courier must remain usable even after a cash delivery.
- Server returns aggregates for dashboards; the browser must not download full historical order sets just to calculate charts.
- Any new external integration must fail safely and must not block ordering if it is unavailable.

## 1. Courier cash liability — visible, not blocking

### Existing capability

The current system already:

- calculates cash held by the courier using the actual tendered amount;
- stores unsettled cash through `CourierEarning.settledAt = null`;
- shows pending cash in the courier app;
- provides restaurant-side cash settlement where only the restaurant can mark money as received.

### Change

Do not add an operational block to the courier.

Add a prominent pending-cash summary to the Super Admin dashboard. It should show:

- total cash currently in couriers' hands;
- number of couriers with pending cash;
- drill-down by courier with amount and related order numbers;
- direct navigation to the relevant order detail when useful.

The existing restaurant Cash Settlement screen remains the authority for clearing the liability.

### Load

Low. The data already exists. The admin API should aggregate unsettled cash server-side. No new polling loop is required beyond the dashboard's normal refresh/load behavior.

## 2. Gestão courier map — focus existing markers

### Existing capability

Gestão already has the live courier map and refreshes its operational feed every 10 seconds. Courier GPS is reported by movement plus a 15-second visible-page heartbeat.

### Change

Do not create a second map or a second tracking channel.

Make each courier row interactive:

- clicking/tapping the courier name or row focuses the existing map on that courier;
- selected courier receives a clear visual selection state;
- if the courier has no known coordinates, no fake focus is attempted and the UI explains that the location is unavailable;
- map popup continues to show GPS age and accuracy.

The label must continue to say things such as `GPS há 2 min` when stale. Never use wording that suggests current live position if the timestamp is old.

### Load

Negligible. This is client-side interaction on already-loaded coordinates.

## 3. Customer PWA installation affordance

### Existing capability

Customer and courier apps are already installable PWAs with `display: standalone`.

### Change

Add a lightweight install affordance to the customer app header/menu:

- Chromium/Android: capture `beforeinstallprompt` and show `Instalar app` only when installation is available;
- installed standalone mode: hide the install affordance;
- iOS/iPadOS Safari: show a compact instructional sheet explaining `Partilhar` → `Adicionar ao ecrã principal`;
- dismissing the iOS helper should not continuously nag the customer during the same session.

Do not add custom browser detection beyond what is needed for the install flow.

### Load

Client-only and negligible.

## 4. Courier iPhone viewport stability

### Problem

The courier UI currently mixes `100vh`, `100dvh`, fixed/sticky navigation and an internal scrolling delivery pane. Safari's changing browser chrome can resize the viewport and make the screen appear to jump vertically.

### Change

Normalize the courier shell for modern mobile Safari:

- use dynamic viewport units consistently with safe fallbacks;
- respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`;
- reduce competing scroll containers;
- keep the active-delivery primary action reachable without a fixed element fighting Safari's viewport changes;
- avoid body-level horizontal/vertical overscroll that produces the visible "dancing" effect;
- preserve Android behavior.

The PWA remains `standalone`; do not force `fullscreen` simply to hide browser chrome.

### Testing

Manual staging checks on:

- iPhone Safari before install;
- installed iPhone PWA;
- Android browser/PWA regression;
- delivery page with enough content to scroll;
- keyboard opening on login/input screens.

## 5. Courier Web Push for new offers

### Goal

A courier who is online should be able to receive a new-delivery notification when the installed PWA is backgrounded or the phone is locked, subject to browser/OS permission and platform rules.

### Architecture

Use standard Web Push, event-driven from dispatch.

Add a push-subscription model associated with the courier user/device containing:

- endpoint;
- p256dh key;
- auth key;
- created/updated timestamps;
- optional user-agent/device label for diagnostics.

Expose authenticated courier endpoints to:

- create/update a subscription;
- remove a subscription.

Use VAPID credentials stored only in environment variables.

When dispatch creates an `OFFERED` courier assignment, enqueue/send a push notification to the assigned courier. The payload should be minimal, for example:

- title: `Nova entrega VaiPizza`;
- body: `Pedido #47 disponível`;
- URL/deep link to the courier home/app;
- assignment/order id sufficient for the app to refresh authoritative data after opening.

The notification payload is not the authority for accepting the order. The app must always re-fetch the current assignment.

### Failure handling

- Expired/invalid push endpoints are removed when the push service returns permanent invalidation responses.
- Push failure must never fail order creation or dispatch.
- Socket/browser audio remains the foreground fast path.
- Web Push is the background/lock-screen complement, not a replacement for the existing assignment checks.
- Do not add frequent polling to compensate for push.

### iPhone limitation

Installed PWAs on supported iOS/iPadOS versions can receive Web Push after the user grants notification permission. Continuous background GPS is not promised by this feature; GPS freshness remains independently enforced by dispatch.

## 6. Admin orders — operational today view + history

### Current issue

The admin currently loads the most recent orders up to a fixed limit and displays them as one long operational list. Older orders should not crowd the daily operation, but historical records must remain searchable.

### New behavior

Default Admin Orders view: `Hoje`.

This means:

- all orders created during the business day appear regardless of final status;
- delivered, collected and cancelled orders remain visible for that day;
- after the date changes, yesterday's orders disappear from the default view but stay in the database.

Add server-side filters:

- order number;
- date/date range;
- status;
- optionally payment method if inexpensive to expose.

Add an order detail view/drawer showing authoritative historical data:

- order number and timestamps;
- customer and contact details available to admin;
- delivery/pickup type;
- delivery address and coordinates where applicable;
- immutable item snapshots, quantities, modifiers/combo selections and notes;
- subtotal/discount/delivery fee/total;
- payment method/status and cash tender/change where applicable;
- courier assignment;
- status history with actor/timestamps;
- cancellation reason/actor/time;
- refund/manual-review information if present.

### API

Prefer explicit server filtering and detail endpoints rather than returning hundreds/thousands of orders and filtering in React.

Example shape:

- `GET /admin/orders?date=YYYY-MM-DD&status=...&orderNumber=47`
- `GET /admin/orders/:id`

Use a configurable business timezone, defaulting to `Europe/Lisbon`, for the meaning of `Hoje`. Date filtering must be DST-safe.

### Retention

No automatic deletion in this phase. Historical order retention is required for support, accounting and dispute/correction investigation.

## 7. Admin dashboard redesign

### Goal

Replace the current sparse/legacy-looking dashboard with a focused VaiPizza operational dashboard while retaining the existing Recharts dependency.

### Filters

One period control: `Hoje`, `7 dias`, `15 dias`, `30 dias`.

### KPI row

Return server-side aggregates for:

- orders;
- GMV/revenue;
- average ticket;
- delivery fees;
- platform commission;
- restaurant payout;
- active/approved couriers as appropriate;
- unresolved operational alerts.

### Cash alert

A visually prominent card/banner appears when unsettled courier cash is greater than zero:

`Dinheiro por receber dos estafetas — 89,70 €`

Clicking it opens/drills into the courier breakdown. It is informational/actionable only; it does not change courier eligibility.

### Charts

Keep the dashboard useful rather than decorative:

1. Revenue/orders trend over the selected period — line or columns depending on density.
2. Top 5 products by quantity/revenue — horizontal bars or columns.
3. Top combos when combos exist — bar chart/list; hide gracefully if no combo sales.
4. Order mix — Delivery vs Recolha, preferably a donut.
5. Payment-method mix can be included only if it remains visually clean; otherwise leave it for a later report.

All heavy grouping happens server-side. The admin receives compact aggregate arrays only.

### Branding cleanup

Remove remaining Burger House/demo wording/assets from the current admin experience and consistently use VaiPizza naming and current product language.

## 8. Customer address assistance

### Current issue

Checkout requires an existing saved address. Address creation lives in Profile and requires manually typed address text plus a separate GPS action.

### New flow

A customer should be able to solve delivery address directly during checkout.

For delivery:

1. Existing saved address can still be selected.
2. If none exists, or the customer wants another location, offer `Usar a minha localização`.
3. Browser geolocation obtains coordinates with explicit permission.
4. Reverse geocoding attempts to suggest street/city/postal information.
5. Customer must confirm/correct the human-readable address and can add door/floor/intercom details.
6. The confirmed address and exact coordinates are saved and used for the order.

GPS alone is never treated as a complete postal address.

### Reverse-geocoding integration

Put reverse geocoding behind a small backend/provider abstraction so the front end does not depend directly on a third-party API. Cache/limit requests where practical. A provider outage should fall back to manual address entry while keeping the coordinates.

### Guest checkout

Deferred. Current cart/order schema is account-owned, so guest checkout is a larger identity/cart redesign and is not necessary to solve the immediate delivery-address friction.

## 9. Password recovery — real email delivery

### Existing capability

Password reset tokens, expiry and reset endpoints already exist. The missing piece is transactional email delivery.

### Change

Introduce a small mail adapter with environment-configured provider credentials. Initial implementation may use a transactional provider, but application code must call a provider-neutral function such as `sendPasswordResetEmail`.

Flow:

1. Customer enters email.
2. API always returns the same generic success message to prevent account enumeration.
3. Existing reset token is generated/stored.
4. Email contains a one-time reset link pointing to the customer application's reset-password page.
5. Reset page submits token + new password.
6. Successful reset marks the token used and revokes active refresh sessions for the user.

Email delivery failure should be logged/observable but the public response must remain generic.

Staging must use staging URLs and sender configuration. No production credentials are touched during development.

## 10. Account uniqueness

Email remains the unique login identity and is already unique at database level.

Phone uniqueness is deliberately not added in this phase. Before making phone unique, the product would need a clear policy for shared household/business numbers and canonical E.164 normalization. Phone normalization can be introduced independently later.

## Delivery sequence

Implement as isolated slices so one risky subsystem cannot destabilize the rest:

1. Admin pending-cash visibility + courier-map focus.
2. Customer install affordance + courier iPhone viewport fix.
3. Admin today's-orders/search/detail.
4. Admin analytics/dashboard redesign.
5. Checkout address assistance.
6. Password-reset email delivery.
7. Web Push subscriptions and dispatch notifications.
8. Full automated regression + targeted mobile/staging manual QA.

Web Push is deliberately late because it adds environment secrets, service-worker behavior and a persistent subscription table. The simpler UI/query improvements can be validated independently first.

## Testing strategy

Use TDD for behavioral backend changes and regression tests for existing workflows.

Required automated coverage includes:

- cash summary includes only unsettled cash orders and never changes courier eligibility;
- admin date/order-number filters and order detail snapshots;
- dashboard aggregate correctness for products/combos/order modes/cash;
- address/reverse-geocode fallback behavior;
- password reset remains enumeration-safe, token is one-time, sessions are revoked after reset;
- push subscription upsert/delete and stale subscription cleanup;
- dispatch still succeeds when push sending fails;
- PWA install helper visibility logic;
- viewport/layout utility tests where logic is extracted.

Manual staging QA includes:

- courier map selection/focus;
- customer installation on Android and iPhone instructions;
- courier iPhone Safari + installed PWA viewport behavior;
- lock-screen/background push on supported Android/iPhone devices;
- Admin today rollover/date filtering and historical lookup;
- password-reset email end-to-end once staging provider credentials are available;
- delivery address GPS suggestion and manual correction.

## Safety / rollout

- All implementation starts on `feat/pre-production-readiness`.
- No direct production data mutation.
- Database migrations are additive and applied to staging first.
- New integrations are environment-gated.
- Every staging promotion must be a verified fast-forward or reviewed equivalent; no force-push.
- Production promotion happens only after staging build/tests/manual QA are green and an explicit checkpoint is reached.

## Explicit non-goals for this phase

- Guest checkout.
- Native iOS/Android courier app.
- Guaranteed continuous background GPS on iOS PWA.
- Automatic courier blocking because of pending cash.
- Deleting historical orders at midnight.
- New map provider or second location-tracking channel.
- Phone-number-as-login or mandatory unique phone number.
