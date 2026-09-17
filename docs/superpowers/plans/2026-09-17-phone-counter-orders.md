# Phone & Counter Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe restaurant-created phone/counter orders and fix customer PWA install control visibility without altering production.

**Architecture:** Keep app checkout unchanged. Introduce a lightweight `CustomerContact` for non-login phone customers and make `Order.userId` optional only for staff-created orders, storing immutable customer/address snapshots and origin on every new manual order. Manual-order pricing and delivery validation stay server-side. The customer install control becomes capability-aware but always visible outside standalone mode.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, React/Vite, Vitest, Socket.IO.

**Spec:** `docs/superpowers/specs/2026-09-17-phone-counter-orders-design.md`

## Global Constraints
- Branch: `feat/phone-counter-orders` from `redesign-vaipizza` staging.
- Production remains untouched.
- No fake customer passwords.
- Existing app checkout behavior and dispatch logic must remain unchanged.
- Manual order pricing is server authoritative.
- Delivery requires coordinates and radius validation.
- Only RESTAURANT_OWNER / RESTAURANT_STAFF may create manual orders.

---

### Task 1: Fix customer install control visibility
**Files:**
- Modify: `apps/customer/src/components/InstallAppButton.tsx`
- Modify: `apps/customer/src/components/InstallAppButton.css`
- Create/Test: `apps/customer/src/components/installAppPolicy.ts`
- Test: `apps/customer/src/components/installAppPolicy.test.ts`

**Interfaces:**
- `getInstallAction({ standalone, ios, hasNativePrompt }): "hidden" | "native" | "ios-guide" | "browser-guide"`

- [ ] Write tests for standalone hidden, native prompt, iOS guide and browser fallback.
- [ ] Run customer tests/targeted Vitest and verify RED.
- [ ] Implement policy helper and update component so it never disappears solely because `beforeinstallprompt` has not fired.
- [ ] Build customer workspace.
- [ ] Commit `fix: keep customer install app action visible`.

### Task 2: Data model for manual order customers and audit snapshots
**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: Prisma migration for `CustomerContact`, `OrderOrigin`, nullable `Order.userId`, customer/address snapshot fields and indexes.

**Interfaces:**
- `CustomerContact.phoneNormalized` unique.
- `Order.origin` defaults APP.
- `Order.userId` nullable; existing app code still writes it.

- [ ] Add schema/migration.
- [ ] Generate Prisma client and build API.
- [ ] Verify existing order code compiles with nullable user relation; adjust includes/types only where required.
- [ ] Commit `feat: add manual order customer audit model`.

### Task 3: Phone normalization and customer lookup
**Files:**
- Create: `apps/api/src/modules/orders/manualCustomer.ts`
- Test: `apps/api/src/modules/orders/manualCustomer.test.ts`
- Modify: `apps/api/src/modules/orders/restaurantOrders.routes.ts`

**Interfaces:**
- `normalizePhone(input: string): string`
- `lookupManualCustomer(restaurantId: string, phone: string)` returns `{ type: "REGISTERED"|"CONTACT"|"NOT_FOUND", ... }`.

- [ ] Write RED tests for Portuguese number variants, registered-customer precedence and contact fallback.
- [ ] Implement normalizer and lookup.
- [ ] Add `GET /restaurant-orders/customer-lookup?phone=` route restricted to owner/staff.
- [ ] Run focused API tests/build.
- [ ] Commit `feat: add restaurant customer phone lookup`.

### Task 4: Server-authoritative manual order creation
**Files:**
- Create: `apps/api/src/modules/orders/manualOrder.service.ts`
- Test: `apps/api/src/modules/orders/manualOrder.service.test.ts`
- Modify: `apps/api/src/modules/orders/restaurantOrders.routes.ts`

**Interfaces:**
- `createManualOrder(restaurantId, actorRole, input)`.
- Input supports PHONE/COUNTER, DELIVERY/PICKUP, registered customer id or contact details, payment method, cash tendered, notes and selected item/modifier/combo IDs.

- [ ] RED tests: unidentified counter pickup, registered phone customer, contact creation/reuse, CASH change, out-of-range delivery, cross-restaurant/unavailable item rejection.
- [ ] Implement product/modifier/combo loading and server-side pricing using existing pricing helpers.
- [ ] Create immutable snapshots/origin and `OrderStatusEvent(NEW, actor=restaurant role)`.
- [ ] Emit `order:new` to restaurant room.
- [ ] Add `POST /restaurant-orders/manual` owner/staff route with Zod validation.
- [ ] Run focused tests and full API suite/build.
- [ ] Commit `feat: create phone and counter orders from restaurant`.

### Task 5: Gestão manual-order UI
**Files:**
- Inspect/modify existing restaurant routing/navigation files.
- Create: `apps/restaurant/src/pages/NewOrder.tsx`
- Create: `apps/restaurant/src/pages/NewOrder.css`
- Reuse existing restaurant menu/catalog API and item configuration patterns where possible.

**Interfaces:**
- `Novo pedido` action.
- Origin selection TELEFONE/BALCÃO.
- Phone lookup and customer/address display.
- Basket + delivery/pickup + payment + review + submit.

- [ ] Add route/navigation action.
- [ ] Implement phone lookup states and anonymous counter pickup.
- [ ] Implement menu/basket with server-compatible item payload.
- [ ] Implement delivery address inputs and current-location assistance if existing helper is reusable.
- [ ] Implement payment/cash tendered and review.
- [ ] Submit to manual order endpoint and redirect/show created order number.
- [ ] Build restaurant workspace.
- [ ] Commit `feat: add phone and counter order flow to gestão`.

### Task 6: Regression, staging promotion and manual QA
**Files:** no production files.

- [ ] Run full API tests.
- [ ] Build API, customer and restaurant; build other affected packages if type changes propagate.
- [ ] Compare branch against `redesign-vaipizza`; confirm no unrelated/prod config changes.
- [ ] Fast-forward staging only after GREEN evidence; no force push.
- [ ] Let Render staging auto-deploy API; deploy only affected Netlify staging frontends.
- [ ] Manual QA: install button Chrome/Edge/Android fallback and iPhone guide; registered phone customer order; new contact phone delivery; anonymous counter pickup; CASH/troco; KDS/dispatch continuity.
- [ ] Production remains untouched pending explicit production checkpoint.
