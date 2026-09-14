# Pickup, MB WAY and Next Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pickup-ready customer handling, safe manual MB WAY confirmation, and one queued next delivery per busy courier without changing production.

**Architecture:** Extend the existing Prisma model minimally (`Restaurant.mbwayPhone` and queued-assignment metadata) while preserving current order/payment state machines. Implement pure policy helpers first so TDD can verify payment gating and queued-dispatch eligibility independently, then wire them into API routes/services and React UIs. Deploy only to staging after unit/build checks, migrate staging DB, and run live multi-surface QA before promoting the product branch.

**Tech Stack:** TypeScript, React/Vite, Express, Prisma/PostgreSQL (Supabase), Socket.IO, Vitest, Playwright, Render, Netlify.

**Spec:** `docs/superpowers/specs/2026-09-14-pickup-mbway-next-delivery.md`

## Global Constraints

- Staging/feature branches only until QA is green; production stays untouched.
- Preserve strict CSP and existing concurrent-checkout protections.
- Free geo-eligible couriers have priority over busy couriers for queued work.
- Maximum courier workload: one active delivery plus one reserved next delivery.
- MB WAY proof/WhatsApp actions never mark an order paid automatically.

---

### Task 1: MB WAY payment policy and restaurant configuration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260914_add_mbway_and_queued_delivery/migration.sql`
- Create: `apps/api/src/modules/orders/paymentPolicy.ts`
- Create: `apps/api/src/modules/orders/paymentPolicy.test.ts`
- Modify: `apps/api/src/modules/restaurants/settings.routes.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `apps/api/src/modules/orders/restaurantOrders.routes.ts`
- Modify: `apps/restaurant/src/pages/Settings.tsx`
- Modify: `apps/restaurant/src/pages/OrdersDashboard.tsx`
- Modify: `apps/customer/src/pages/OrderDetail.tsx`

**Interfaces:**
- Produces: `canRestaurantStartOrder(paymentMethod, paymentStatus): boolean`
- Produces API: `POST /restaurant/orders/:id/confirm-mbway-payment`
- Produces scalar: `Restaurant.mbwayPhone: string | null`

- [ ] **Step 1: Write failing payment policy test**

```ts
import { describe, expect, it } from "vitest";
import { canRestaurantStartOrder } from "./paymentPolicy.js";

describe("canRestaurantStartOrder", () => {
  it("blocks pending MB WAY and permits it once paid", () => {
    expect(canRestaurantStartOrder("MBWAY", "PENDING")).toBe(false);
    expect(canRestaurantStartOrder("MBWAY", "PAID")).toBe(true);
  });

  it("does not block cash or terminal orders awaiting handoff payment", () => {
    expect(canRestaurantStartOrder("CASH", "PENDING")).toBe(true);
    expect(canRestaurantStartOrder("TERMINAL", "PENDING")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the API test and verify RED**

Run: `npm run test -w apps/api -- paymentPolicy.test.ts`
Expected: FAIL because `paymentPolicy.ts` does not exist.

- [ ] **Step 3: Implement the minimal payment policy**

```ts
export function canRestaurantStartOrder(paymentMethod: string, paymentStatus: string) {
  return paymentMethod !== "MBWAY" || paymentStatus === "PAID";
}
```

- [ ] **Step 4: Add `mbwayPhone`, migration, settings validation/UI, confirmation endpoint and backend acceptance guard**

Required behaviour:
- nullable `Restaurant.mbwayPhone` so existing rows remain valid;
- settings accepts empty value as `null` and validates reasonable phone length;
- confirmation endpoint only accepts an owned MB WAY order and sets `paymentStatus=PAID` idempotently;
- emits `order:payment` to restaurant and customer rooms;
- `NEW -> ACCEPTED` rejects pending MB WAY with code `PAYMENT_PENDING`;
- Gestão displays `MB WAY — aguarda pagamento` and a confirm button;
- customer order detail displays number + amount and WhatsApp proof link while pending.

- [ ] **Step 5: Run API tests, typechecks and frontend builds**

Run: `npm test -w apps/api`
Run: `npm run build -w apps/customer`
Run: `npm run build -w apps/restaurant`
Expected: all PASS.

### Task 2: Pickup ready experience

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `apps/restaurant/src/pages/OrdersDashboard.tsx`
- Modify: `apps/customer/src/pages/OrderDetail.tsx`
- Create: `apps/customer/e2e/helpers/pickup-ready-policy.spec.ts`

**Interfaces:**
- Existing status flow remains `PREPARING -> READY_FOR_PICKUP -> COLLECTED`.
- Restaurant order payload includes customer `name` and `phone` for owned orders.

- [ ] **Step 1: Write failing source-policy test**

The test must assert that customer order detail contains a prominent ready-for-pickup message and Gestão contains both the WhatsApp ready action and a `COLLECTED` transition action for pickup orders.

- [ ] **Step 2: Run and verify RED**

Run: `npx playwright test apps/customer/e2e/helpers/pickup-ready-policy.spec.ts --list` or the existing helper-policy runner used by QA.
Expected: policy assertion FAIL before UI implementation.

- [ ] **Step 3: Implement pickup UI and restaurant payload**

Required behaviour:
- customer sees `O seu pedido está pronto para recolha` for `PICKUP + READY_FOR_PICKUP`;
- Gestão can open a prefilled WhatsApp message when customer phone exists;
- Gestão can mark the order `COLLECTED`;
- order state remains authoritative even if WhatsApp is unavailable.

- [ ] **Step 4: Run policy/build tests**

Run customer/restaurant builds and helper-policy test. Expected: PASS.

### Task 3: One reserved next delivery

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/migrations/20260914_add_mbway_and_queued_delivery/migration.sql`
- Create: `apps/api/src/modules/dispatch/queuedDispatch.policy.ts`
- Create: `apps/api/src/modules/dispatch/queuedDispatch.policy.test.ts`
- Modify: `apps/api/src/modules/dispatch/dispatch.service.ts`
- Modify: `apps/api/src/modules/couriers/courier.service.ts` or the existing courier status-transition service responsible for marking deliveries complete
- Modify: `apps/courier/src/main.tsx` and/or its offer components as required by current structure
- Modify: `apps/restaurant/src/components/CourierOperationsPanel.tsx`

**Interfaces:**
- `CourierAssignment.isQueued Boolean @default(false)` identifies a next-delivery reservation/offer without inventing a second order status.
- Produces pure policy `canReceiveQueuedOffer({activeDeliveryCount, queuedAcceptedCount, geoEligible, verificationStatus}): boolean`.
- Accepted queued assignment leaves the active order unchanged and reserves the waiting order to that courier.
- Delivering the active order promotes the reserved order to `COURIER_ASSIGNED` and courier status `GOING_TO_RESTAURANT`.

- [ ] **Step 1: Write failing queued-dispatch policy tests**

```ts
expect(canReceiveQueuedOffer({ activeDeliveryCount: 1, queuedAcceptedCount: 0, geoEligible: true, approved: true })).toBe(true);
expect(canReceiveQueuedOffer({ activeDeliveryCount: 1, queuedAcceptedCount: 1, geoEligible: true, approved: true })).toBe(false);
expect(canReceiveQueuedOffer({ activeDeliveryCount: 0, queuedAcceptedCount: 0, geoEligible: true, approved: true })).toBe(false);
```

Also test that free-courier selection remains preferred before queued-busy selection.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test -w apps/api -- queuedDispatch.policy.test.ts`
Expected: FAIL because policy is not implemented.

- [ ] **Step 3: Implement minimal pure policy**

Implement only the approved one-active + one-next constraints and preserve all existing geo checks.

- [ ] **Step 4: Wire queued offers into dispatch transactionally**

Required behaviour:
- normal `AVAILABLE` dispatch path runs first unchanged;
- only when no free eligible courier exists, eligible busy couriers with exactly one active delivery and zero queued accepted offer are considered;
- queued offer expiration/rejection does not change courier active status;
- queued acceptance claims the waiting order for that courier without changing the current active delivery;
- race-safe `updateMany`/transaction guards prevent double reservation.

- [ ] **Step 5: Promote queued delivery on active completion**

In the existing delivered-order transaction, locate one accepted queued assignment for the courier, change the reserved order to `COURIER_ASSIGNED`, record status history, and set courier to `GOING_TO_RESTAURANT`; otherwise preserve current `AVAILABLE` behaviour.

- [ ] **Step 6: Update courier/Gestão presentation**

Courier must clearly show `Próxima entrega reservada` without replacing the active job. Gestão live courier panel must expose active and next order separately.

- [ ] **Step 7: Run API tests and all affected builds**

Run: `npm test -w apps/api`
Run courier/restaurant builds. Expected: PASS.

### Task 4: Staging migration, deploy and live regression QA

**Files:**
- Temporary QA/deploy workflow only if existing branch automation cannot run these checks; remove after validation.

**Interfaces:**
- Staging Supabase receives the additive migration only.
- Staging API/frontend deploys use existing Render/Netlify projects.

- [ ] **Step 1: Run complete branch CI**

Run API tests, workspace builds/typechecks and existing QA guardrails. Expected: PASS.

- [ ] **Step 2: Apply additive migration to staging Supabase**

Verify columns/defaults and existing rows before continuing.

- [ ] **Step 3: Deploy feature to staging only**

Deploy API and affected frontends. Do not touch production.

- [ ] **Step 4: Run live acceptance automation**

Verify desktop, Pixel 5, runtime desktop/mobile, offline/reconnect, pickup state, MB WAY pending/paid gating, and queued delivery lifecycle.

- [ ] **Step 5: Verify database cleanup and no QA residue**

Orders/assignments created by QA are removed; structural configuration including MB WAY setting remains.

- [ ] **Step 6: Promote only verified product commits to `redesign-vaipizza`**

Use a fast-forward or specific verified commits; do not merge unrelated QA history.
