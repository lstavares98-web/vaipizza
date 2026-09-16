# Admin Operations Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the low-risk pre-production admin/restaurant operations slice: pending courier cash visibility, clickable courier-map focus, today-first order history/search/detail, and a richer server-aggregated admin dashboard.

**Architecture:** Reuse the existing Prisma data model, restaurant live courier feed, Recharts dependency, and cash-settlement data. Add focused server-side query/aggregation helpers in the admin module so React receives compact operational data instead of downloading full history. Keep map focus entirely client-side; no new location channel or polling loop is introduced.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, React 18, Recharts, React-Leaflet, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-vaipizza-pre-production-readiness-design.md`

## Global Constraints

- Production remains untouched until staging build/tests/manual QA are green and an explicit checkpoint is reached.
- Pending courier cash is visible and actionable but never changes courier dispatch eligibility.
- Existing restaurant Cash Settlement remains the authority for clearing courier cash.
- Never create a second map or second GPS tracking channel.
- Historical orders are retained; midnight changes only the default visible date range.
- Dashboard grouping/analytics are performed server-side.
- Business-day filtering uses `Europe/Lisbon` semantics and must remain DST-safe.
- No force-push. Branch: `feat/pre-production-readiness`.

---

### Task 1: Admin operational query helpers and pending cash summary

**Files:**
- Create: `apps/api/src/modules/admin/adminAnalytics.ts`
- Test: `apps/api/src/modules/admin/adminAnalytics.test.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`

**Interfaces:**
- Produces `getPendingCourierCashSummary()` returning `{ total: number; courierCount: number; couriers: { courierId: string; courierName: string; total: number; orders: { orderId: string; orderNumber: number; amount: number }[] }[] }`.
- Produces pure helpers `cashSummaryFromRows(rows)` and `periodBounds(period, now, timeZone)` so aggregation/date behavior can be unit tested without a live database.
- Existing dispatch eligibility code is not imported or modified by these helpers.

- [ ] **Step 1: Write failing unit tests for cash aggregation**

Create `adminAnalytics.test.ts` with rows containing unsettled CASH deliveries, settled rows and non-cash rows. Assert only unsettled cash is aggregated, multiple rows for one courier are grouped, totals are rounded to cents, and no output field can alter operational state.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test -w apps/api -- adminAnalytics.test.ts`
Expected: FAIL because `adminAnalytics.ts` / helpers do not exist.

- [ ] **Step 3: Implement pure cash aggregation and Prisma-backed summary**

Create `adminAnalytics.ts` with a small row type, `cashSummaryFromRows`, and `getPendingCourierCashSummary`. Query `CourierEarning` where `settledAt: null`, `kind: "DELIVERY"`, and `order.paymentMethod: "CASH"`; include courier user and order. Compute cash held with existing `cashHeldByCourier(order.total, order.amountTendered)` and `round2`.

- [ ] **Step 4: Run the focused test and API build**

Run: `npm run test -w apps/api -- adminAnalytics.test.ts`
Expected: PASS.
Run: `npm run build -w apps/api`
Expected: PASS.

- [ ] **Step 5: Wire the summary into `getDashboard()` without changing courier eligibility**

Add `pendingCash` to the dashboard response. Do not mutate courier rows, assignments, status, operationalState or sessionVersion.

- [ ] **Step 6: Commit**

Commit message: `feat: expose pending courier cash in admin dashboard`

---

### Task 2: Gestão courier map focus using existing live feed

**Files:**
- Modify: `apps/restaurant/src/components/CourierOperationsPanel.tsx`
- Modify: `apps/restaurant/src/index.css`

**Interfaces:**
- Consumes existing `OperationalCourier.lat/lng`, `locationAgeSeconds`, `locationAccuracyM`.
- Produces local `selectedCourierId` state only; no API contract changes.
- A `MapFocus` helper receives `{ lat, lng, zoom }` and calls `map.setView` only when a selected courier has coordinates.

- [ ] **Step 1: Add selected-courier state and focus helper**

Keep the existing 10-second feed refresh. Clicking a courier row/name sets `selectedCourierId`; the map centers on that courier and opens/visually emphasizes the selection without changing GPS data.

- [ ] **Step 2: Handle missing/stale location honestly**

If selected courier has no coordinates, show a compact `Localização indisponível` message and do not move the map. Preserve `GPS há ...` and accuracy copy; never replace it with generic `ao vivo` wording for stale coordinates.

- [ ] **Step 3: Add accessible selection styling**

Add selected row styling, keyboard focus, `role="button"`/appropriate semantics and visible focus ring. Do not change the operational status dot color rules already validated in staging.

- [ ] **Step 4: Build restaurant app**

Run: `npm run build -w apps/restaurant`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: focus live courier map from gestão list`

---

### Task 3: Today-first Admin orders with historical search and detail

**Files:**
- Create: `apps/api/src/modules/admin/adminOrders.ts`
- Test: `apps/api/src/modules/admin/adminOrders.test.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/admin/src/pages/Orders.tsx`
- Modify: `apps/admin/src/index.css`

**Interfaces:**
- Produces `listAdminOrders(filters)` with `{ status?, restaurantId?, orderNumber?, date?, from?, to? }`.
- Produces `getAdminOrderDetail(id)` with customer, address, courier, immutable item/modifier/combo snapshots, payment/cash fields, status history, cancellation/refund fields and timestamps.
- Admin API routes:
  - `GET /admin/orders?date=YYYY-MM-DD&status=...&orderNumber=47`
  - `GET /admin/orders/:id`
- Default UI request uses today's date in `Europe/Lisbon`.

- [ ] **Step 1: Write failing tests for date/order-number filter construction**

Unit-test DST-safe Lisbon day bounds for a summer date and a winter date, exact order-number filtering and combined status/date filtering. Tests must assert a local day maps to the correct UTC start/end instants.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test -w apps/api -- adminOrders.test.ts`
Expected: FAIL because the new module does not exist.

- [ ] **Step 3: Implement filter/date helpers and Prisma queries**

Use `Intl.DateTimeFormat`/timezone offset-safe conversion in a focused helper rather than assuming UTC midnight. Query only requested rows and keep a bounded result limit. Detail query includes `items.modifiers`, address, courier user, `statusHistory` ordered ascending, coupon/refund/cancellation fields already present in schema.

- [ ] **Step 4: Wire routes**

Validate `date/from/to` as ISO dates and `orderNumber` as positive integer. Keep existing status validation. Add `GET /orders/:id` before the cancel route and return 404 through existing `notFound` helper when absent.

- [ ] **Step 5: Run API tests/build**

Run: `npm run test -w apps/api -- adminOrders.test.ts`
Expected: PASS.
Run: `npm run build -w apps/api`
Expected: PASS.

- [ ] **Step 6: Replace Admin Orders default list behavior**

Default to `Hoje`, with controls for order number, date and status. Searching `47` requests `orderNumber=47`; it does not fetch all rows and filter in React. Clicking a row opens a detail drawer/modal populated from `/admin/orders/:id` and shows item snapshots, payment/troco, customer/address, courier, status history and cancellation/refund information.

- [ ] **Step 7: Build admin app**

Run: `npm run build -w apps/admin`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit message: `feat: add admin order history search and detail`

---

### Task 4: Server-aggregated Admin dashboard redesign

**Files:**
- Modify: `apps/api/src/modules/admin/adminAnalytics.ts`
- Modify: `apps/api/src/modules/admin/adminAnalytics.test.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/admin/src/pages/Dashboard.tsx`
- Modify: `apps/admin/src/index.css`

**Interfaces:**
- `GET /admin/dashboard?period=today|7d|15d|30d` returns existing financial metrics plus:
  - `period`
  - `averageTicket`
  - `trend: { date: string; orders: number; revenue: number }[]`
  - `topProducts: { name: string; quantity: number; revenue: number }[]`
  - `topCombos: { name: string; quantity: number; revenue: number }[]`
  - `fulfillmentMix: { type: "DELIVERY"|"PICKUP"; count: number }[]`
  - `pendingCash` summary from Task 1.

- [ ] **Step 1: Extend failing analytics tests**

Feed pure aggregator fixtures containing products, combos, cancelled orders, delivery/pickup orders and different dates. Assert cancelled orders do not inflate sales KPIs, product/combo quantity and revenue totals are correct, top results are capped at 5 and fulfillment mix counts match.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm run test -w apps/api -- adminAnalytics.test.ts`
Expected: FAIL on missing period analytics helpers.

- [ ] **Step 3: Implement server-side period aggregation**

Accept `today|7d|15d|30d`; derive Lisbon-aware bounds; query orders/items only for the selected period; aggregate compact arrays in the service/helper. Do not return raw historical orders to Dashboard.

- [ ] **Step 4: Run API tests/build**

Run: `npm run test -w apps/api -- adminAnalytics.test.ts`
Expected: PASS.
Run: `npm run build -w apps/api`
Expected: PASS.

- [ ] **Step 5: Redesign Dashboard using existing Recharts**

Add period segmented control; KPI cards for orders, GMV, average ticket, delivery fees, commission and restaurant payout; prominent pending-cash card when total > 0; revenue/order trend; Top 5 products; Top combos hidden when empty; Delivery vs Recolha donut. Remove remaining legacy/demo wording visible in the dashboard and use VaiPizza naming consistently.

- [ ] **Step 6: Build admin app**

Run: `npm run build -w apps/admin`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: redesign admin operations dashboard`

---

### Task 5: Block verification and staging handoff

**Files:**
- No production files.
- Update plan checkboxes only if desired after verification.

**Interfaces:**
- Produces a branch commit sequence suitable for fast-forward staging promotion after verification.

- [ ] **Step 1: Run complete API regression suite**

Run: `npm run test -w apps/api`
Expected: all tests PASS.

- [ ] **Step 2: Build affected workspaces**

Run: `npm run build -w apps/api && npm run build -w apps/restaurant && npm run build -w apps/admin`
Expected: all PASS.

- [ ] **Step 3: Compare branch to base**

Verify changes are limited to this plan plus its design/plan docs. Confirm no production config/site/data changes.

- [ ] **Step 4: Promote only after green evidence**

Fast-forward the staging branch only after automated verification. Never force the ref. Let staging deploys complete, then perform targeted manual checks: map focus, pending cash card, today orders, #47 historical lookup/detail and dashboard periods/charts.
