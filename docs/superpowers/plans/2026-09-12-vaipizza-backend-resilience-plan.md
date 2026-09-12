# VaiPizza Backend Resilience & Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run staging-only QA scenarios that prove backend atomicity under concurrent checkout, courier assignment races, dispatch failures, duplicate actions, and cross-system audit rules.

**Architecture:** Extend the existing `apps/api/scripts/qa` harness with small scenario modules under `scripts/qa/resilience`. Every mutating scenario reuses existing staging guards, manifest ownership, protected snapshots, fixture creation, and cleanup. Concurrency is generated with synchronized `Promise.allSettled` starts; database/API state is audited before cleanup so cleanup cannot hide inconsistencies.

**Tech Stack:** TypeScript, Node 20+, Vitest, Prisma 6, existing REST API, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-vaipizza-resilience-concurrency-design.md`

## Global Constraints

- Staging only; never target production.
- Do not weaken `assertSafeTarget`, `assertMutationConfirmation`, manifest ownership checks, or protected snapshot checks.
- Every created user/order/address/product/courier must be recorded in the run manifest before the next mutating step.
- Cleanup may delete only manifest-owned QA data.
- Audit state before cleanup.
- Stop the scenario on ambiguous ownership, duplicate financial effects, protected configuration drift, or cleanup ownership failure.
- Existing sequential load stage 250 must be PASS and cleaned before any live execution from this plan.

---

### Task 1: Shared resilience scenario contracts and audit helper

**Files:**
- Create: `apps/api/scripts/qa/resilience/types.ts`
- Create: `apps/api/scripts/qa/resilience/audit.ts`
- Test: `apps/api/scripts/qa/resilience/audit.test.ts`
- Modify: `apps/api/tsconfig.qa.json`

**Interfaces:**
- Consumes: `QaConfig`, `QaRunManifest`, Prisma models, existing `qaRequest`.
- Produces: `QaResilienceScenarioResult`, `QaOrderAudit`, `auditOrderConsistency(prisma, input)`.

- [ ] **Step 1: Write the failing audit tests**

```ts
import { describe, expect, it } from "vitest";
import { validateOrderAudit } from "./audit.js";

it("passes when order, assignment and courier ownership agree", () => {
  expect(() => validateOrderAudit({
    orderId: "o1",
    orderStatus: "COURIER_ASSIGNED",
    orderCourierId: "c1",
    acceptedAssignmentCourierIds: ["c1"],
    activeAssignmentCourierIds: ["c1"],
    duplicatedEarnings: 0,
  })).not.toThrow();
});

it("fails when two couriers own the same order", () => {
  expect(() => validateOrderAudit({
    orderId: "o1",
    orderStatus: "COURIER_ASSIGNED",
    orderCourierId: "c1",
    acceptedAssignmentCourierIds: ["c1", "c2"],
    activeAssignmentCourierIds: ["c1", "c2"],
    duplicatedEarnings: 0,
  })).toThrow(/multiple|owner/i);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm run qa:test -w apps/api -- resilience/audit.test.ts`
Expected: FAIL because `resilience/audit.ts` does not exist.

- [ ] **Step 3: Implement minimal contracts and audit validation**

Create `types.ts` with explicit result/audit types. Implement `validateOrderAudit()` and `auditOrderConsistency()` so the latter queries order `courierId/status/paymentStatus`, accepted/active assignments, waiting residue, and earnings count for the tested order. Do not mutate data in this helper.

- [ ] **Step 4: Run focused and full QA tests**

Run:
`npm run qa:test -w apps/api -- resilience/audit.test.ts`
`npm run qa:typecheck`
`npm run qa:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts/qa/resilience apps/api/tsconfig.qa.json
git commit -m "test: add resilience consistency audit"
```

### Task 2: Concurrent checkout scenarios

**Files:**
- Create: `apps/api/scripts/qa/resilience/concurrentCheckout.ts`
- Test: `apps/api/scripts/qa/resilience/concurrentCheckout.test.ts`
- Modify: `apps/api/scripts/qa/fixtures.ts`

**Interfaces:**
- Consumes: `createQaCustomer`, `createQaAddress`, `addQaProductToCart`, `singleDeliveryCheckoutBody`.
- Produces: `runConcurrentCheckoutScenario(prisma, config, manifest, options)` returning accepted/out-of-range/duplicate observations.

- [ ] **Step 1: Write RED tests for a synchronized start barrier**

Test that N prepared operations do not start HTTP work before `release()` and all begin after the barrier. Test mixed expected results preserve one result per logical attempt.

- [ ] **Step 2: Verify RED**

Run: `npm run qa:test -w apps/api -- resilience/concurrentCheckout.test.ts`
Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the minimal barrier and runner**

Implement `createStartBarrier()` plus scenario support for:
1. distinct customers submitting simultaneously;
2. same customer/same cart submitting two concurrent checkout requests;
3. mixed inside/outside address submissions.
Persist any returned order ID immediately into `manifest.orderIds` before classification.

- [ ] **Step 4: Add invariant assertions**

For distinct-customer checkout, accepted count must equal expected inside requests. For same-cart double submit, record whether API created 0/1/2 orders; if 2 accepted orders are created from the same cart, mark the scenario FAIL with reason `duplicate-same-cart-checkout` rather than hiding it.

- [ ] **Step 5: Run all QA and API tests**

Run:
`npm run qa:typecheck`
`npm run qa:test`
`npm run test -w apps/api`
Expected: PASS before live execution.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/qa/resilience/concurrentCheckout.ts apps/api/scripts/qa/resilience/concurrentCheckout.test.ts apps/api/scripts/qa/fixtures.ts
git commit -m "feat: add concurrent checkout QA scenarios"
```

### Task 3: Courier acceptance race scenarios

**Files:**
- Create: `apps/api/scripts/qa/resilience/courierRace.ts`
- Test: `apps/api/scripts/qa/resilience/courierRace.test.ts`
- Modify only if a real defect is reproduced: `apps/api/src/modules/couriers/courier.service.ts`
- Modify only if a real defect is reproduced: `apps/api/src/modules/couriers/courier.routes.ts`

**Interfaces:**
- Consumes: `createQaCourierFixture`, `loginQaCourier`, dispatch assignment APIs, `auditOrderConsistency`.
- Produces: `runCourierAcceptanceRace(prisma, config, manifest, courierCount)`.

- [ ] **Step 1: Write RED tests for winner validation**

Test pure validation: exactly one acceptance winner passes; zero winners or multiple winners fail; order `courierId` must equal the winning courier.

- [ ] **Step 2: Verify RED**

Run: `npm run qa:test -w apps/api -- resilience/courierRace.test.ts`
Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement synchronized acceptance runner**

Create 2 QA couriers first, both approved/AVAILABLE with fresh accurate GPS. Drive one QA order to `WAITING_FOR_COURIER`, capture assignment IDs, then release simultaneous accept requests with `Promise.allSettled`. Query the database immediately afterward and run the consistency audit.

- [ ] **Step 4: Extend to 3 couriers and accept-vs-reject race**

Add 3-courier contention and one accept/one reject at the same barrier. Losing attempts may return conflict/unavailable, but only one accepted assignment/order owner is allowed.

- [ ] **Step 5: If a backend race is found, reproduce it in an API unit/integration test before fixing**

Add a focused failing test alongside the affected courier service. Make the smallest transactional/conditional update required, then rerun the new regression test plus QA/API suites. Do not change service code unless the live scenario exposes a real defect.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/qa/resilience apps/api/src/modules/couriers
git commit -m "feat: add courier assignment race QA"
```

### Task 4: Dispatch reject, expiry, offline, GPS and reassignment matrix

**Files:**
- Create: `apps/api/scripts/qa/resilience/dispatchModes.ts`
- Test: `apps/api/scripts/qa/resilience/dispatchModes.test.ts`
- Reuse: `apps/api/scripts/qa/scenarios/geo.ts`

**Interfaces:**
- Consumes: courier fixture options (`status`, `lat`, `lng`, `accuracyM`, `locationUpdatedAt`), assignment reject API, Prisma assignment/order reads.
- Produces: `runDispatchModeScenario()` for named cases and explicit PASS/FAIL observations.

- [ ] **Step 1: Write RED tests for eligibility expectation tables**

Encode cases: AVAILABLE/fresh/accurate/in-radius = eligible; OFFLINE, stale location, inaccurate location, outside dispatch radius = ineligible.

- [ ] **Step 2: Verify RED**

Run: `npm run qa:test -w apps/api -- resilience/dispatchModes.test.ts`
Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement reject and automatic-next-courier cases**

Use two eligible couriers. First rejects. Assert its assignment cannot later be accepted and the order is offered to the next valid courier without two active owners.

- [ ] **Step 4: Implement expiry/ignore and ineligible-courier cases**

For timeout/ignore, use the system’s existing assignment TTL and poll at a bounded cadence; do not alter global TTL just to speed the test unless a test-only configuration already exists. Verify stale/inaccurate/outside/offline couriers are not selected.

- [ ] **Step 5: Add manual reassignment capability probe**

Inspect the current management API/UI path. If no supported manual reassignment action exists, record `capability: missing` and fail only the dedicated capability scenario, not unrelated dispatch tests.

- [ ] **Step 6: Run full verification and commit**

Run `npm run qa:typecheck && npm run qa:test && npm run test -w apps/api`.
Commit: `feat: add dispatch failure-mode QA`.

### Task 5: Duplicate-action/idempotency pressure

**Files:**
- Create: `apps/api/scripts/qa/resilience/idempotency.ts`
- Test: `apps/api/scripts/qa/resilience/idempotency.test.ts`

**Interfaces:**
- Consumes: operator/courier tokens and existing order-transition endpoints.
- Produces: `runDuplicateActionScenario()` and financial-effect audit.

- [ ] **Step 1: Write RED tests for acceptable duplicate outcomes**

For each endpoint, validation accepts a successful idempotent repeat or a clear conflict/validation error, but rejects contradictory state, duplicate assignment ownership, duplicate payment effects, or duplicate courier earnings.

- [ ] **Step 2: Verify RED**

Run focused QA test and confirm missing implementation failure.

- [ ] **Step 3: Implement rapid duplicate calls**

Exercise: staff accept, kitchen ready, assignment accept, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED. Use two simultaneous requests per action and audit state after each pair.

- [ ] **Step 4: Assert final monetary invariants**

For one delivered cash order: one PAID transition, one delivered order, one expected earning effect, one lifetime-delivery increment attributable to the tested order.

- [ ] **Step 5: Full verification and commit**

Run `npm run qa:typecheck`, `npm run qa:test`, `npm run test -w apps/api`.
Commit: `feat: add duplicate-action QA pressure`.

### Task 6: Backend resilience orchestrator, cleanup gate and workflow

**Files:**
- Create: `apps/api/scripts/qa/resilienceRunner.ts`
- Create: `apps/api/scripts/qa/resilienceRunner.test.ts`
- Modify: `apps/api/scripts/qa/cli.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Create: `.github/workflows/qa-live-resilience-backend.yml`
- Create: `qa-resilience-backend.trigger`

**Interfaces:**
- Consumes: Tasks 1-5 scenario runners.
- Produces: `runBackendResilienceQa(prisma, config)` plus CLI command `qa:resilience:backend`.

- [ ] **Step 1: Write RED tests for stop-on-first-failure and guaranteed cleanup**

Prove that if scenario 2 fails, scenario 3 never executes, audit artifacts are written, and cleanup is still attempted exactly once. Prove cleanup remains blocked if protected configuration drift exists.

- [ ] **Step 2: Verify RED**

Run focused runner test.

- [ ] **Step 3: Implement orchestrator**

Order: concurrent checkout → courier races → dispatch matrix → idempotency. Before every mutating group capture/assert protected state. After each group audit, then cleanup owned data. Produce one summary artifact with scenario statuses and reasons.

- [ ] **Step 4: Wire CLI/scripts**

Add `qa:resilience:backend` without changing existing `qa:load`. Keep `QA_CONFIRM=VAIPIZZA_STAGING_ONLY` required.

- [ ] **Step 5: Add GitHub Actions workflow**

Workflow must run only from `feature/qa-harness-safe` and its dedicated trigger file, require `DATABASE_URL`, run typecheck/QA/API tests before live work, upload artifacts `if: always()`, and use a bounded timeout.

- [ ] **Step 6: Run pre-live verification**

Run full suites. Confirm database preflight is clean (`qa_users=0`, `qa_orders=0`, no unexpected `WAITING_FOR_COURIER`) before triggering live staging scenarios.

- [ ] **Step 7: Execute live scenarios progressively**

Start with 2 concurrent clients/2 couriers. Increase only when PASS. Do not jump directly to large fan-out.

- [ ] **Step 8: Commit**

```bash
git add apps/api/scripts/qa package.json apps/api/package.json .github/workflows/qa-live-resilience-backend.yml qa-resilience-backend.trigger
git commit -m "feat: add backend resilience QA orchestration"
```
