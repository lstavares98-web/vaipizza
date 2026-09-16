# Courier Operations Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden courier sessions and operations so one courier has one active device session, login is distinct from Online/Offline, courier suspension/deactivation is explicit, restaurant cancellation is safe, and the management UI reflects real dispatch eligibility.

**Architecture:** Keep the current dispatch algorithm and courier status machine intact. Add a courier-specific session generation/id to JWT validation, add an operational courier account state separate from document verification, centralize pre-handoff cancellation cleanup in one service, and update courier/restaurant/admin frontends to present these backend truths. Production remains untouched; all migration and runtime validation happen on staging first.

**Tech Stack:** TypeScript, React, Express, Prisma/PostgreSQL, Socket.IO, Vitest, Vite/Netlify, Render, Supabase.

**Spec:** `docs/superpowers/specs/2026-09-16-courier-operations-hardening-design.md`

## Global Constraints

- Work only on `feat/courier-operations-hardening`, branched from `redesign-vaipizza`.
- Do not change the customer delivery radius or courier dispatch radius defaults.
- Do not weaken `COURIER_LOCATION_MAX_AGE_SECONDS` or `COURIER_MAX_ACCURACY_METERS`.
- Do not rewrite dispatch allocation or the one-active-plus-one-queued capacity model.
- Do not delete order, assignment, earning, refresh-token, or status-history rows.
- No production database, production Render service, production Netlify site, or approved branch deployment until staging QA passes.
- New courier login wins; previous courier device session becomes invalid.
- A new-device login must preserve an already active delivery.
- Fresh login without an active delivery must leave the courier Offline.
- Restaurant operational cancellation is limited to `NEW`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `WAITING_FOR_COURIER`, and `COURIER_ASSIGNED`.
- `PICKED_UP`, `OUT_FOR_DELIVERY`, `DELIVERED`, `COLLECTED`, and `CANCELLED` are not restaurant-cancellable in this iteration.

---

### Task 1: Add courier operational account state and exclusive session identity

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260916163000_courier_operational_state_and_session/migration.sql`
- Modify: `packages/types/src/index.ts`
- Test: `apps/api/src/modules/auth/courierSession.policy.test.ts`

**Interfaces:**
- Produces Prisma enum `CourierOperationalState = ACTIVE | SUSPENDED | DEACTIVATED`.
- Produces `Courier.operationalState` defaulting to `ACTIVE`.
- Produces `Courier.sessionVersion` integer defaulting to `0`.
- Extends `JwtPayload` with optional `courierSessionVersion?: number` so non-courier tokens remain unchanged.

- [ ] **Step 1: Write the failing shared/session policy test**

Create `apps/api/src/modules/auth/courierSession.policy.test.ts` with tests that express the contract independently of Prisma:

```ts
import { describe, expect, it } from "vitest";
import { isCurrentCourierSession } from "./courierSession.policy.js";

describe("isCurrentCourierSession", () => {
  it("accepts matching courier session versions", () => {
    expect(isCurrentCourierSession(7, 7)).toBe(true);
  });

  it("rejects an old courier session after a newer login", () => {
    expect(isCurrentCourierSession(6, 7)).toBe(false);
  });

  it("rejects a courier token without a session version", () => {
    expect(isCurrentCourierSession(undefined, 7)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -w apps/api -- courierSession.policy.test.ts
```

Expected: FAIL because `courierSession.policy.ts` does not exist.

- [ ] **Step 3: Add the schema and shared type changes**

In `schema.prisma`, add:

```prisma
enum CourierOperationalState {
  ACTIVE
  SUSPENDED
  DEACTIVATED
}
```

and on `Courier`:

```prisma
operationalState CourierOperationalState @default(ACTIVE)
sessionVersion   Int                     @default(0)
```

In `JwtPayload` add:

```ts
courierSessionVersion?: number;
```

Create the migration with additive SQL only:

```sql
CREATE TYPE "CourierOperationalState" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
ALTER TABLE "Courier"
  ADD COLUMN "operationalState" "CourierOperationalState" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Add the minimal policy implementation**

Create `apps/api/src/modules/auth/courierSession.policy.ts`:

```ts
export function isCurrentCourierSession(tokenVersion: number | undefined, currentVersion: number) {
  return Number.isInteger(tokenVersion) && tokenVersion === currentVersion;
}
```

- [ ] **Step 5: Run focused tests and Prisma generation**

```bash
npm run db:generate
npm test -w apps/api -- courierSession.policy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260916163000_courier_operational_state_and_session/migration.sql packages/types/src/index.ts apps/api/src/modules/auth/courierSession.policy.ts apps/api/src/modules/auth/courierSession.policy.test.ts
git commit -m "feat: add courier operational session state"
```

---

### Task 2: Enforce newest-device-wins authentication and safe courier login/logout

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/tokens.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/modules/auth/auth.routes.ts`
- Modify: `apps/api/src/modules/couriers/courier.service.ts`
- Test: `apps/api/src/modules/auth/courierExclusiveSession.test.ts`
- Test: `apps/api/src/modules/couriers/courierAvailability.policy.test.ts`

**Interfaces:**
- `issueSession(...)` accepts optional `courierSessionVersion` and signs it into courier JWTs.
- Courier login atomically increments `Courier.sessionVersion`, revokes older refresh tokens for that courier user, and issues the new version.
- Courier-only authenticated requests compare the JWT version against the current `Courier.sessionVersion`.
- Session mismatch returns a stable application error code `COURIER_SESSION_REPLACED`.
- Courier explicit logout while `AVAILABLE` sets status to `OFFLINE`; logout during an active-delivery status is rejected with `COURIER_MID_DELIVERY`.
- Fresh login never changes delivery-related statuses; if there is no active delivery it normalizes `AVAILABLE` to `OFFLINE`.

- [ ] **Step 1: Write failing exclusive-session tests**

Cover these cases with mocked Prisma calls:

```ts
it("increments courier sessionVersion and revokes previous refresh tokens on login", async () => {
  // current version 3 -> new session version 4
  // expect refreshToken.updateMany({ userId, revokedAt: null })
  // expect access token payload courierSessionVersion === 4
});

it("does not reset an active delivery status during second-device login", async () => {
  // courier status OUT_FOR_DELIVERY remains OUT_FOR_DELIVERY
});

it("normalizes AVAILABLE to OFFLINE on fresh login when there is no active order", async () => {
  // courier status AVAILABLE and no current assigned/picked/out-for-delivery order -> OFFLINE
});
```

Also test middleware/session validation by extracting a focused helper rather than requiring a full Express integration harness.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -w apps/api -- courierExclusiveSession.test.ts courierAvailability.policy.test.ts
```

- [ ] **Step 3: Implement courier-specific session issuance**

In `auth.service.ts`, for courier logins only:

```ts
const courier = await prisma.courier.findUnique({ where: { userId: user.id } });
if (!courier) throw unauthorized("Courier profile unavailable");
if (courier.operationalState === "DEACTIVATED") {
  throw unauthorized("Esta conta de estafeta está desativada", "COURIER_DEACTIVATED");
}

const nextSessionVersion = courier.sessionVersion + 1;
```

Use one transaction to:

```ts
await tx.refreshToken.updateMany({
  where: { userId: user.id, revokedAt: null },
  data: { revokedAt: new Date() },
});
await tx.courier.update({
  where: { id: courier.id },
  data: {
    sessionVersion: nextSessionVersion,
    ...(shouldNormalizeAvailableToOffline ? { status: "OFFLINE" } : {}),
  },
});
```

Then issue tokens with `courierSessionVersion: nextSessionVersion`.

- [ ] **Step 4: Enforce the version on courier endpoints**

Add a courier-session middleware/helper that loads the courier by `req.auth.sub` only for `Role.COURIER` and rejects mismatches with:

```ts
throw unauthorized(
  "A sua conta foi iniciada noutro dispositivo.",
  "COURIER_SESSION_REPLACED",
);
```

Apply it to the courier router after `requireAuth`/`requireRole`, and to courier Socket.IO authentication if socket auth is separately validated.

- [ ] **Step 5: Make explicit logout safe**

Before revoking the caller's refresh token, courier logout should:

```ts
if (["ASSIGNED", "GOING_TO_RESTAURANT", "AT_RESTAURANT", "PICKED_UP", "DELIVERING"].includes(courier.status)) {
  throw badRequest("Não pode terminar sessão a meio de uma entrega", "COURIER_MID_DELIVERY");
}
if (courier.status === "AVAILABLE") {
  await prisma.courier.update({ where: { id: courier.id }, data: { status: "OFFLINE" } });
}
```

Do not interpret browser close/background as logout.

- [ ] **Step 6: Run focused tests**

```bash
npm test -w apps/api -- courierExclusiveSession.test.ts courierAvailability.policy.test.ts tokens.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/middleware/auth.ts apps/api/src/modules/couriers/courier.service.ts
git commit -m "feat: enforce exclusive courier sessions"
```

---

### Task 3: Add suspension/deactivation controls without orphaning deliveries

**Files:**
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/api/src/modules/couriers/courier.service.ts`
- Modify: `apps/api/src/modules/dispatch/dispatch.service.ts`
- Modify: `apps/admin/src/pages/Couriers.tsx`
- Test: `apps/api/src/modules/admin/courierOperationalState.test.ts`
- Test: `apps/api/src/modules/dispatch/courierOperationalEligibility.test.ts`

**Interfaces:**
- `setCourierOperationalState(id, state)` supports `ACTIVE`, `SUSPENDED`, `DEACTIVATED`.
- State change is rejected while the courier has an active order in `COURIER_ASSIGNED`, `PICKED_UP`, or `OUT_FOR_DELIVERY`.
- `SUSPENDED` can authenticate but `setOnline(..., true)` rejects with `COURIER_SUSPENDED`.
- `DEACTIVATED` cannot authenticate.
- Both non-active states set `Courier.status=OFFLINE`, cancel outstanding unaccepted `OFFERED` assignments, and invalidate existing courier sessions by incrementing `sessionVersion`.
- Reactivation leaves `OFFLINE` until the courier explicitly taps Online.

- [ ] **Step 1: Write failing service tests**

```ts
it("prevents suspension while a courier has an active delivery", async () => {
  // active order exists -> NOT_ALLOWED_WITH_ACTIVE_DELIVERY
});

it("suspends an idle courier and cancels outstanding offers", async () => {
  // operationalState=SUSPENDED, status=OFFLINE, OFFERED -> CANCELLED
});

it("reactivates a courier without making them AVAILABLE", async () => {
  // operationalState=ACTIVE, status remains OFFLINE
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -w apps/api -- courierOperationalState.test.ts courierOperationalEligibility.test.ts
```

- [ ] **Step 3: Implement backend state changes transactionally**

Use one Prisma transaction to check active delivery, update operational state/status/sessionVersion, cancel live offers, and preserve all historical rows.

Add admin route:

```ts
adminRouter.patch("/couriers/:id/operational-state", asyncHandler(async (req, res) => {
  const { state } = z.object({ state: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]) }).parse(req.body);
  const courier = await adminService.setCourierOperationalState(req.params.id!, state);
  res.json({ success: true, courier });
}));
```

- [ ] **Step 4: Exclude non-ACTIVE couriers in dispatch**

Add `operationalState: "ACTIVE"` to the free and busy courier candidate queries and retain all existing GPS/capacity predicates.

- [ ] **Step 5: Block Online for suspended couriers**

At the start of `setOnline(..., true)`:

```ts
if (courier.operationalState === "SUSPENDED") {
  throw badRequest("A sua conta está temporariamente suspensa", "COURIER_SUSPENDED");
}
if (courier.operationalState === "DEACTIVATED") {
  throw badRequest("A sua conta está desativada", "COURIER_DEACTIVATED");
}
```

- [ ] **Step 6: Add Admin UI controls**

Show operational state separately from verification state and expose buttons with confirmation:

```tsx
<button onClick={() => setOperationalState(c.id, "SUSPENDED")}>Suspender</button>
<button className="danger" onClick={() => setOperationalState(c.id, "DEACTIVATED")}>Desativar</button>
<button onClick={() => setOperationalState(c.id, "ACTIVE")}>Reativar</button>
```

Do not reuse `verificationStatus` for this.

- [ ] **Step 7: Run tests/build**

```bash
npm test -w apps/api -- courierOperationalState.test.ts courierOperationalEligibility.test.ts
npm run build -w apps/admin
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/admin apps/api/src/modules/couriers/courier.service.ts apps/api/src/modules/dispatch/dispatch.service.ts apps/admin/src/pages/Couriers.tsx
git commit -m "feat: add courier suspension controls"
```

---

### Task 4: Centralize safe restaurant/admin pre-handoff cancellation

**Files:**
- Create: `apps/api/src/modules/orders/cancelOrder.service.ts`
- Modify: `apps/api/src/modules/orders/restaurantOrders.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `apps/api/src/modules/dispatch/dispatch.service.ts` only if a small exported promotion/refill helper is needed
- Test: `apps/api/src/modules/orders/cancelOrder.service.test.ts`

**Interfaces:**
- `cancelOrderBeforeHandoff(input)` accepts `{ orderId, actorRole, actorRestaurantId?, reason }`.
- Allowed order statuses: `NEW`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `WAITING_FOR_COURIER`, `COURIER_ASSIGNED`.
- It marks live `OFFERED` and queued/accepted reservation assignments for the cancelled order as `CANCELLED`, preserving rows.
- If an active slot is freed, it promotes that courier's oldest accepted queued reservation when possible; otherwise sets courier `AVAILABLE` only when genuinely free.
- After commit, it emits socket updates, runs refund handling, and wakes waiting dispatch if capacity was freed.

- [ ] **Step 1: Write failing cancellation tests**

Cover at least:

```ts
it("records reason, actor and status history", async () => {});
it("cancels OFFERED and ACCEPTED queued assignments without deleting them", async () => {});
it("promotes a courier queued order when the cancelled order occupied the active slot", async () => {});
it("returns courier to AVAILABLE only when no active or queued work remains", async () => {});
it.each(["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "COLLECTED", "CANCELLED"])(
  "rejects restaurant cancellation from %s",
  async (status) => {},
);
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -w apps/api -- cancelOrder.service.test.ts
```

- [ ] **Step 3: Implement transactional cancellation core**

Within a Prisma transaction:

```ts
await tx.order.update({
  where: { id: order.id },
  data: {
    status: "CANCELLED",
    cancelledBy: actorRole,
    cancelledAt: now,
    rejectionReason: reason,
    courierId: null,
    statusHistory: { create: { status: "CANCELLED", actor: actorRole } },
  },
});

await tx.courierAssignment.updateMany({
  where: {
    orderId: order.id,
    status: { in: ["OFFERED", "ACCEPTED"] },
  },
  data: { status: "CANCELLED", respondedAt: now },
});
```

Then reconcile the affected courier's active/queued capacity in the same transaction.

- [ ] **Step 4: Expose restaurant cancellation route**

Add owner/staff-only endpoint:

```ts
restaurantOrdersRouter.post(
  "/:id/cancel",
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const result = await cancelOrderBeforeHandoff({
      orderId: req.params.id!,
      actorRole: req.auth!.role,
      actorRestaurantId: req.auth!.restaurantId!,
      reason,
    });
    res.json({ success: true, ...result });
  }),
);
```

- [ ] **Step 5: Make Admin use the same cancellation core**

Replace duplicated `forceCancelOrder` logic with a call to the shared service using `Role.SUPER_ADMIN`.

- [ ] **Step 6: Run affected dispatch/order tests**

```bash
npm test -w apps/api -- cancelOrder.service.test.ts orderStateMachine.test.ts courier.updateDeliveryStatus.concurrent.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/orders apps/api/src/modules/admin/admin.service.ts apps/api/src/modules/dispatch/dispatch.service.ts
git commit -m "feat: add safe operational order cancellation"
```

---

### Task 5: Make courier app session-aware, identity-clear, and Online-first

**Files:**
- Modify: `apps/courier/src/context/AuthContext.tsx`
- Modify: `apps/courier/src/context/CourierRuntimeContext.tsx`
- Modify: `apps/courier/src/pages/Home.tsx`
- Modify: `apps/courier/src/lib/api.ts`
- Modify: `apps/courier/src/index.css`
- Test: `apps/courier/src/lib/sessionError.test.ts`
- Test: `apps/courier/src/lib/courierUiState.test.ts`

**Interfaces:**
- API interceptor recognizes backend `code === "COURIER_SESSION_REPLACED"`, clears tokens/socket, and exposes one stable reason to AuthContext.
- AuthContext can render/route to login with `A sua conta foi iniciada noutro dispositivo.`.
- Home visibly shows authenticated `user.name` and secondary email.
- `Ficar online` primes alert audio and captures high-accuracy GPS before calling `/courier/online`.
- If audio cannot be enabled, Online may still proceed only if product decision remains alert-as-warning; UI must show a persistent warning and never show `Alertas ativos` falsely.
- Separate recovery alert button remains only when browser audio is not ready.

- [ ] **Step 1: Write failing pure UI/session helper tests**

```ts
it("maps COURIER_SESSION_REPLACED to the replaced-session login message", () => {});
it("shows alert recovery only when alert audio is not ready", () => {});
it("uses authenticated user name as courier identity", () => {});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -w apps/courier --if-present
```

If the courier workspace has no test script, run the focused helper tests with the root's available Vitest setup only after adding the minimal courier test script; do not add a new framework.

- [ ] **Step 3: Handle session replacement centrally**

In the Axios interceptor, detect the stable backend error code, clear `tokenStore`, disconnect socket, and emit/set a local auth reason. Do not attempt token refresh for a replaced courier session.

- [ ] **Step 4: Make identity visible**

Render near the availability hero:

```tsx
<p className="courier-identity">Ligado como <strong>{user?.name}</strong></p>
<small>{user?.email}</small>
```

- [ ] **Step 5: Consolidate alert activation into Ficar online**

Keep the current sequence:

```ts
const ready = await primeOfferAlert();
setAlertReady(ready);
await captureAndReportCurrentLocation();
await api.post("/courier/online", { online: true });
```

If `ready === false`, display the warning persistently and offer `Ativar alertas` as recovery; do not silently claim success.

- [ ] **Step 6: Make logout call backend before clearing local tokens**

The local app should request logout first; if backend returns `COURIER_MID_DELIVERY`, keep the session and show the message. Only clear local tokens after successful logout, except for invalid/replaced sessions where local cleanup is mandatory.

- [ ] **Step 7: Build courier app**

```bash
npm run build -w apps/courier
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/courier/src
git commit -m "feat: harden courier session experience"
```

---

### Task 6: Fix restaurant operational colors and add cancellation UI

**Files:**
- Modify: `apps/restaurant/src/components/CourierOperationsPanel.tsx`
- Modify: `apps/restaurant/src/index.css`
- Locate and modify the existing order action component/page that renders management order controls; do not introduce a duplicate orders screen.
- Create/Test: `apps/restaurant/src/lib/courierOperationalTone.test.ts`

**Interfaces:**
- `courierOperationalTone(courier)` returns `offline | eligible | blocked`.
- Grey = explicit `OFFLINE`.
- Green = not offline and `eligibleForDispatch === true`.
- Red = not offline and `eligibleForDispatch === false`.
- Restaurant cancel action appears only for the allowed pre-handoff states and requires a non-empty reason.

- [ ] **Step 1: Write failing color-state test**

```ts
expect(courierOperationalTone({ status: "OFFLINE", eligibleForDispatch: false })).toBe("offline");
expect(courierOperationalTone({ status: "AVAILABLE", eligibleForDispatch: true })).toBe("eligible");
expect(courierOperationalTone({ status: "AVAILABLE", eligibleForDispatch: false })).toBe("blocked");
```

- [ ] **Step 2: Implement helper and wire panel classes**

Replace `state-${courier.status.toLowerCase()}` for the main indicator with a class derived from operational tone. Keep the textual status and ineligibility reason unchanged.

- [ ] **Step 3: Add cancel control to the existing order-management UI**

Allowed UI states:

```ts
const RESTAURANT_CANCELLABLE = new Set([
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "WAITING_FOR_COURIER",
  "COURIER_ASSIGNED",
]);
```

On click, collect a reason and call:

```ts
await api.post(`/restaurant/orders/${order.id}/cancel`, { reason });
```

Refresh the order feed after success; show backend error text on conflict.

- [ ] **Step 4: Build restaurant app**

```bash
npm run build -w apps/restaurant
```

- [ ] **Step 5: Commit**

```bash
git add apps/restaurant/src
git commit -m "feat: clarify courier eligibility and cancellation UI"
```

---

### Task 7: Full verification, staging migration, and affected manual QA

**Files:**
- No product-code changes unless verification finds a specific defect.
- Update: `docs/superpowers/specs/2026-09-16-courier-operations-hardening-design.md` only if implementation intentionally differs from the approved design.
- Optionally update project QA/Notion status after staging evidence exists.

**Interfaces:**
- Staging-only migration/deploy.
- No production promotion in this task.

- [ ] **Step 1: Run complete automated verification**

```bash
npm test
npm run build
```

Expected: all existing and new tests/builds PASS.

- [ ] **Step 2: Review migration before applying it**

Verify migration is additive only:

```sql
CREATE TYPE ...;
ALTER TABLE "Courier" ADD COLUMN ...;
```

No `DROP`, destructive rewrite, or data deletion.

- [ ] **Step 3: Apply migration to staging Supabase only**

After schema/code review, apply exactly the migration to staging project `vnuowugruqheakomdtuh`. Verify existing couriers receive:

```text
operationalState = ACTIVE
sessionVersion = 0
```

before first new login increments versions.

- [ ] **Step 4: Deploy feature branch to staging services only**

Deploy API and affected frontends (Courier, Restaurant, Admin) to their staging targets. Do not deploy Customer/KDS unless a build dependency requires it; do not touch production.

- [ ] **Step 5: Manual QA — session exclusivity**

Phone A logs in as Luiz, then Phone B logs in as Luiz. Expected: B works; A is expelled on next API/socket activity with `A sua conta foi iniciada noutro dispositivo.`.

Repeat while Luiz has an active delivery. Expected: order remains assigned and Phone B loads the active delivery.

- [ ] **Step 6: Manual QA — availability and identity**

Fresh login with no active order -> Offline. Verify courier name/email shown. Tap Online -> alert priming + fresh GPS -> AVAILABLE only when backend accepts.

- [ ] **Step 7: Manual QA — eligibility colors**

Prove:

```text
OFFLINE -> grey
Online + fresh accurate in-zone GPS -> green/elegible
Online + stale/inaccurate/out-of-zone GPS -> red/non-eligible
```

Do not alter dispatch thresholds just to make the UI pass.

- [ ] **Step 8: Manual QA — suspension/deactivation**

Suspend idle Demo -> login allowed, Online denied, dispatch excluded. Reactivate -> remains Offline. Deactivate -> new login denied and old session invalidated.

- [ ] **Step 9: Manual QA — cancellation**

Create staging orders that exercise materially different cancellation effects:

```text
NEW -> cancel directly
PREPARING -> cancel + refund path if paid
WAITING_FOR_COURIER -> cancel with no live courier
COURIER_ASSIGNED -> cancel active slot and verify queued promotion/free-capacity reconciliation
```

Confirm rows/history are preserved and no assignment is deleted.

- [ ] **Step 10: Re-run only affected dispatch regression**

Reconfirm the one-active-plus-one-queued invariant and waiting-order refill only where cancellation/session changes could affect it. Do not repeat unrelated pickup/MB WAY/customer PWA tests already green.

- [ ] **Step 11: Record evidence and stop before production**

Document test IDs/order numbers/session behavior and staging deploy identifiers. Do not merge/promote to production automatically. Production promotion requires a separate explicit checkpoint after staging is green.
