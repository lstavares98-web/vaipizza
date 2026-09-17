# Assisted Orders + Install App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add restaurant-created phone/counter orders without fake accounts and make the customer PWA install action consistently discoverable.

**Architecture:** Introduce restaurant-scoped `CustomerContact` records for non-login customers, make `Order.userId` nullable only for assisted/anonymous orders, and store immutable customer/address snapshots on every assisted order. A dedicated assisted-order service validates catalog selections and creates ordinary `NEW` orders that immediately rejoin the existing KDS/dispatch state machine. The PWA install fix is frontend-only and keeps the action visible until standalone mode is detected.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, React 18/Vite, Vitest, Socket.IO, existing pricing/combo helpers.

**Spec:** `docs/superpowers/specs/2026-09-17-assisted-orders-and-install-design.md`

## Global Constraints

- Production remains untouched; deploy only after feature-branch CI and staging verification.
- Never create synthetic User/password records for phone or counter customers.
- APP checkout still requires a real `userId` and existing behavior must regress green.
- PHONE and identified COUNTER orders are created by restaurant staff and audited with `createdByStaffId`.
- Anonymous COUNTER is pickup-only.
- Assisted delivery requires customer identity, phone, and coordinates.
- Assisted payments in this phase: `CASH`, `MBWAY`, `TERMINAL`; no `CARD`.
- Existing KDS, dispatch, courier, cash settlement, cancellation, and reporting flows remain authoritative after order creation.

---

### Task 1: Data model + pure assisted-order identity rules

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260917120000_assisted_orders/migration.sql`
- Create: `apps/api/src/modules/orders/assistedOrderRules.ts`
- Create: `apps/api/src/modules/orders/assistedOrderRules.test.ts`

**Interfaces:**
- `normalizePhone(value: string): string`
- `validateAssistedIdentity(input: { source: "PHONE" | "COUNTER"; fulfillmentType: "DELIVERY" | "PICKUP"; userId?: string | null; customerContactId?: string | null; customerName?: string | null; customerPhone?: string | null }): void`
- Prisma adds `OrderSource`, `CustomerContact`, `CustomerContactAddress`, optional `Order.userId`, `Order.customerContactId`, `Order.createdByStaffId`, `Order.customerNameSnapshot`, `Order.customerPhoneSnapshot`, and `Order.deliveryAddressSnapshot`.

- [ ] **Step 1: Add RED tests for phone normalization and identity invariants**

Test cases:
- `+351 912 345 678` normalizes to `351912345678`.
- PHONE with neither `userId` nor `customerContactId` throws.
- COUNTER/PICKUP with no identity passes.
- COUNTER/DELIVERY with no identity throws.
- Identified DELIVERY with empty phone throws.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm run test -w apps/api -- assistedOrderRules.test.ts`
Expected: FAIL because `assistedOrderRules.ts` does not exist.

- [ ] **Step 3: Implement minimal pure rules**

Use digits-only normalization and throw `badRequest` codes `CUSTOMER_REQUIRED` / `CUSTOMER_PHONE_REQUIRED` for invalid delivery/phone identity.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `npm run test -w apps/api -- assistedOrderRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Add Prisma schema and additive migration**

Migration operations:
- create enum `OrderSource` (`APP`,`PHONE`,`COUNTER`);
- alter `Order.userId` nullable;
- add source/contact/staff/snapshot columns;
- create `CustomerContact` with unique `(restaurantId, phoneNormalized)`;
- create `CustomerContactAddress` and indexes;
- add FKs to Restaurant/User/Order with `SET NULL` on optional audit/customer links.

Existing Order rows receive default `source='APP'`; no existing row is deleted or rewritten.

- [ ] **Step 6: Prisma generate + API build**

Run: `npm run prisma:generate -w apps/api` if available, otherwise `npx prisma generate --schema apps/api/prisma/schema.prisma`.
Run: `npm run build -w apps/api`.
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: add assisted order customer model`

---

### Task 2: Customer lookup, contact addresses, and forward geocoding

**Files:**
- Create: `apps/api/src/modules/orders/assistedCustomers.service.ts`
- Create: `apps/api/src/modules/orders/assistedCustomers.service.test.ts`
- Create: `apps/api/src/modules/addresses/forwardGeocode.ts`
- Create: `apps/api/src/modules/addresses/forwardGeocode.test.ts`
- Modify: `apps/api/src/modules/orders/restaurantOrders.routes.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- `searchAssistedCustomer(restaurantId: string, phone: string)` returns `{ users, contacts }`, each with only id/name/phone/addresses.
- `createCustomerContact(restaurantId: string, input)` upserts by normalized phone without creating a User.
- `addContactAddress(restaurantId: string, contactId: string, input)` rejects cross-restaurant access.
- `forwardGeocodeAddress(query: string)` returns up to 5 `{ label, line1, city, postalCode, lat, lng }` candidates.
- Routes:
  - `GET /restaurant/orders/assisted/customers?phone=...`
  - `POST /restaurant/orders/assisted/contacts`
  - `POST /restaurant/orders/assisted/contacts/:id/addresses`
  - `GET /restaurant/orders/assisted/geocode?q=...`

- [ ] **Step 1: Add RED service tests**

Cover normalized lookup, contact de-duplication, and restaurant scoping. Mock Prisma only at repository boundaries; assert returned public fields, not mock call counts.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test -w apps/api -- assistedCustomers.service.test.ts forwardGeocode.test.ts`
Expected: FAIL on missing modules.

- [ ] **Step 3: Implement customer lookup/contact persistence**

Registered-user lookup uses a parameterized Postgres query comparing `regexp_replace(phone, '\\D', '', 'g')` to normalized digits, then fetches only those users' saved addresses. Contact lookup uses `(restaurantId, phoneNormalized)`.

- [ ] **Step 4: Implement provider-abstracted forward geocoding**

Add `FORWARD_GEOCODE_URL` to env. Build URL with `q`, `format=jsonv2`, `addressdetails=1`, `limit=5`; 4-second timeout; return `[]` on provider/network failure rather than throwing a 500.

- [ ] **Step 5: Wire guarded restaurant routes**

Routes inherit existing restaurant auth, but creation/search actions explicitly require `RESTAURANT_OWNER` or `RESTAURANT_STAFF` (not KITCHEN).

- [ ] **Step 6: Verify tests + API build**

Run focused tests then `npm run build -w apps/api`.
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: add assisted customer lookup and geocoding`

---

### Task 3: Assisted-order pricing, creation, and nullable-customer compatibility

**Files:**
- Create: `apps/api/src/modules/orders/assistedOrders.service.ts`
- Create: `apps/api/src/modules/orders/assistedOrders.service.test.ts`
- Modify: `apps/api/src/modules/orders/restaurantOrders.routes.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `apps/api/src/modules/orders/cancelOrder.service.ts` only where customer-room emission assumes a non-null `userId`
- Modify: dispatch/courier serializer files only if they directly dereference `order.user` or `order.address`

**Interfaces:**
- `createAssistedOrder(restaurantId: string, staffUserId: string, input)`.
- Input includes `source`, optional `userId`/`customerContactId`, fulfillment, optional confirmed address snapshot, payment method, cash tendered, notes, and item selections.
- Each item is either:
  - product `{ productId, secondaryProductId?, quantity, modifierOptionIds[], notes? }`; or
  - combo `{ comboId, quantity, selections, notes? }`.
- Returns a normal Order in `NEW` plus the same presentation shape used by restaurant order lists.

- [ ] **Step 1: Add RED tests for assisted order rules**

Cover:
- existing registered customer keeps `userId`;
- operational contact creates order with `userId=null` and `customerContactId` set;
- anonymous counter pickup succeeds;
- anonymous delivery fails;
- CARD fails with `ASSISTED_CARD_UNSUPPORTED`;
- outside-radius delivery fails;
- CASH tender/change uses existing `computeChangeDue`;
- unavailable product/combo fails;
- modifier/combo pricing matches existing pricing helpers.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm run test -w apps/api -- assistedOrders.service.test.ts`
Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement backend catalog validation/pricing**

Load only requested product/combo IDs scoped to the restaurant. Reuse `computeSplitBasePrice`, `computeUnitPrice`, `validateComboSelection`, `priceCombo`, `buildComboSelectionSnapshot`, `isComboScheduleAvailable`, and `round2`. Reject unavailable/out-of-restaurant selections before order creation.

- [ ] **Step 4: Implement order transaction**

Compute subtotal, delivery fee/radius, payment fields and immutable snapshots; create Order + OrderItems + modifiers + initial `NEW` status event atomically. Do not create Cart or User rows.

- [ ] **Step 5: Guard nullable-customer emissions/presentation**

Introduce a small helper that emits to `rooms.customer(userId)` only when `userId` is non-null. Restaurant/courier presentation resolves name/phone/address from registered relations first, otherwise snapshots/contact data. APP payloads remain unchanged.

- [ ] **Step 6: Add `POST /restaurant/orders/assisted` route**

Validate source/payment/item schema with Zod. Require staff/owner role. Return `{ success: true, order }` and emit `order:new` to the restaurant room.

- [ ] **Step 7: Verify focused tests + full API regression**

Run: `npm run test -w apps/api -- assistedOrders.service.test.ts` then `npm run test -w apps/api` and `npm run build -w apps/api`.
Expected: all PASS.

- [ ] **Step 8: Commit**

Commit: `feat: create phone and counter orders`

---

### Task 4: Gestão assisted-order UI

**Files:**
- Create: `apps/restaurant/src/pages/NewOrder.tsx`
- Create: `apps/restaurant/src/pages/NewOrder.css`
- Create: `apps/restaurant/src/lib/assistedOrder.ts`
- Create: `apps/restaurant/src/lib/assistedOrder.test.ts` if Vitest is configured for this workspace; otherwise keep pure validation covered in API and verify by build/manual staging.
- Modify: `apps/restaurant/src/App.tsx`
- Modify: `apps/restaurant/src/components/Layout.tsx`
- Modify: `apps/restaurant/src/pages/OrdersDashboard.tsx`

**Interfaces:**
- Route `/new-order`.
- Main CTA `+ Novo pedido` from Orders page/sidebar.
- Draft state contains source, selected customer/contact, address candidate, basket, fulfillment, payment, tendered amount, notes.

- [ ] **Step 1: Build source/customer step**

Telefone starts with phone search. Balcão offers identified customer or `Cliente não identificado` when pickup is selected. New phone contact form requires name + phone.

- [ ] **Step 2: Build basket using existing restaurant catalog APIs**

Fetch categories/products and combos. Available items only. Add product customization controls for required modifier groups, optional extras, split secondary product, quantity and notes; add combo group selection controls matching backend schema.

- [ ] **Step 3: Build fulfillment/address/payment step**

Registered user can select saved address. Operational contact can select saved contact address or type a new one, call `Localizar morada`, choose candidate, then save it. Delivery submission remains disabled until coordinates exist. Payment choices: Dinheiro, MB WAY, Terminal.

- [ ] **Step 4: Submit and return to live order board**

POST `/restaurant/orders/assisted`; on success navigate to `/` and display order number. Preserve draft and show API error on failure.

- [ ] **Step 5: Show order source badge in live cards**

`APP` -> App, `PHONE` -> Telefone, `COUNTER` -> Balcão. Existing cards must tolerate `user=null` and use unified customer presentation fields.

- [ ] **Step 6: Restaurant build**

Run: `npm run build -w apps/restaurant`.
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: add assisted order flow to gestão`

---

### Task 5: Install-app visibility behavior

**Files:**
- Modify: `apps/customer/src/components/InstallAppButton.tsx`
- Modify: `apps/customer/src/components/InstallAppButton.css`
- Create: `apps/customer/src/components/installAppPolicy.ts`
- Create: `apps/customer/src/components/installAppPolicy.test.ts` only if customer Vitest is available; otherwise test policy in an API-independent Node/Vitest-compatible workspace or add a minimal customer test script before implementation.

**Interfaces:**
- Pure `getInstallAction({ standalone, ios, hasNativePrompt, browserHint }): "hidden" | "native" | "ios-guide" | "manual-guide"`.

- [ ] **Step 1: Add RED policy tests**

Cases: standalone hidden; iOS guide; prompt available native; non-iOS/no prompt manual guide.

- [ ] **Step 2: Verify RED**

Run the focused customer test command configured for the workspace.
Expected: FAIL because policy module does not exist.

- [ ] **Step 3: Implement policy and button behavior**

Remove `if (installed || (!installPrompt && !ios)) return null;`. Hide only when installed. Manual guide explains browser menu installation when native prompt is unavailable.

- [ ] **Step 4: Verify GREEN + customer build**

Run focused tests and `npm run build -w apps/customer`.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `fix: keep customer install app action visible`

---

### Task 6: Branch verification, staging migration, and staging deploy

**Files:**
- Modify `.github/workflows/preprod-readiness-ci.yml` only to include `feat/assisted-orders-and-install` while feature work is active.
- No production configuration.

**Interfaces:**
- Feature branch CI verifies API tests + affected builds.
- Staging DB receives only the additive assisted-order migration after CI is green.

- [ ] **Step 1: Enable CI trigger for this feature branch and establish baseline**

Add `feat/assisted-orders-and-install` to workflow branch list. Before production-code commits, run workflow and confirm existing tests/builds are green.

- [ ] **Step 2: Final CI**

Run full API suite and builds for API, Restaurant, Customer, Admin, Courier, KDS if its workspace build exists. Require zero failures.

- [ ] **Step 3: Review diff against staging base**

Confirm no production site IDs, secrets, production branches, or unrelated dispatch logic changed.

- [ ] **Step 4: Apply migration to Supabase staging only**

Run the exact SQL from `20260917120000_assisted_orders/migration.sql` against project `vnuowugruqheakomdtuh`. Verify new enum/tables/columns and existing orders remain present.

- [ ] **Step 5: Fast-forward `redesign-vaipizza` only after green evidence**

Use a non-force ref update. Render staging API auto-deploys from the staging branch; do not manually trigger Render after push.

- [ ] **Step 6: Deploy affected Netlify staging frontends**

Deploy only `vaipizza-gestao-staging` and `vaipizza-cliente-staging` unless backend serializer changes require another affected frontend. Do not touch production Netlify projects.

- [ ] **Step 7: Manual staging QA**

One UI action -> backend/DB verification:
1. Registered phone customer search -> create pickup -> verify `source=PHONE`, real `userId`, order visible in customer history.
2. New phone contact -> verify no User row/password created.
3. Anonymous counter pickup -> verify `userId=null`, `source=COUNTER`.
4. Assisted delivery -> geocode -> verify coordinates/range/fee -> KDS -> courier -> delivered.
5. Verify existing APP checkout still completes.
6. Verify Install app visible on non-installed desktop/Android and iPhone guide; hidden in standalone mode.

- [ ] **Step 8: Production checkpoint remains closed**

Record staging results in Notion. No production promotion until the existing Production Readiness checklist and explicit final checkpoint are complete.