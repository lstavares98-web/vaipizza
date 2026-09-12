# VaiPizza Transport Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate staging recovery from API latency, response loss, temporary unavailability, socket disconnect/reconnect, and browser refresh/reopen without corrupting authoritative order state.

**Architecture:** Add transport/fault-injection helpers to the QA harness and browser-layer tests using Playwright. Failures are injected at the client/test transport layer or by request interception; production/staging business rules are not globally changed. Every uncertainty case resolves by re-reading authoritative server/database state and auditing consistency before cleanup.

**Tech Stack:** TypeScript, Vitest, Playwright 1.49+, REST API, Socket.IO client/server, Prisma, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-vaipizza-resilience-concurrency-design.md`

## Global Constraints

- Execute only after backend-resilience plan passes on staging.
- Never simulate failures by weakening production/staging validation rules globally.
- Use request interception, delayed promises, connection aborts, browser context offline mode, or controlled socket disconnects.
- A client may display uncertainty/error, but must never invent successful server state.
- Reconciliation must use the API/database as authority.
- QA-owned cleanup and protected-snapshot rules remain mandatory.

---

### Task 1: Fault-injection transport primitives

**Files:**
- Create: `apps/api/scripts/qa/resilience/faultTransport.ts`
- Test: `apps/api/scripts/qa/resilience/faultTransport.test.ts`

**Interfaces:**
- Produces: `delayRequest`, `dropResponseAfterServerCall`, `withTimeout`, and deterministic fault-plan types used by later tasks.

- [ ] **Step 1: Write RED tests**

Test that `withTimeout(promise, 20)` rejects with a typed QA timeout while the underlying operation may still settle later. Test deterministic one-shot failure plans consume exactly once and then pass through.

- [ ] **Step 2: Verify RED**

Run: `npm run qa:test -w apps/api -- resilience/faultTransport.test.ts`.

- [ ] **Step 3: Implement minimal deterministic transport helpers**

No random failure percentages. Every test declares exactly which request is delayed/dropped and by how much.

- [ ] **Step 4: Verify all QA tests and commit**

Commit: `test: add deterministic QA fault transport`.

### Task 2: API delay, timeout, response-loss and recovery scenarios

**Files:**
- Create: `apps/api/scripts/qa/resilience/apiRecovery.ts`
- Test: `apps/api/scripts/qa/resilience/apiRecovery.test.ts`
- Reuse: `apps/api/scripts/qa/resilience/audit.ts`

**Interfaces:**
- Produces: `runApiRecoveryScenario(prisma, config, manifest, scenario)`.

- [ ] **Step 1: Write RED tests for reconciliation rules**

Encode rule: if client times out, scenario outcome is UNKNOWN until authoritative re-read says no order / one order / duplicate orders. A timeout is never treated as automatic failure or success by itself.

- [ ] **Step 2: Verify RED**

Run focused test.

- [ ] **Step 3: Implement delayed checkout and response-loss cases**

Cases: delayed checkout response; client-side timeout while server completes; retry after lost response. After uncertainty, query `/api/orders/:id` or customer order list and Prisma state before deciding PASS/FAIL.

- [ ] **Step 4: Implement delayed transition and temporary-read failure cases**

Delay a status transition response; synthesize a 500 only in the QA/client interception layer for a read; then recover and assert the server state remains authoritative.

- [ ] **Step 5: Full verification and commit**

Run typecheck + QA + existing API tests. Commit: `feat: add API recovery QA scenarios`.

### Task 3: Socket disconnect/reconnect reconciliation

**Files:**
- Create: `apps/customer/e2e/resilience-socket.spec.ts`
- Create: `apps/customer/e2e/helpers/socket-control.ts`
- Modify: `apps/customer/playwright.config.ts`

**Interfaces:**
- Uses staging URLs through environment variables.
- Produces browser evidence for missed-event recovery.

- [ ] **Step 1: Write a failing Playwright test skeleton against a controlled local/staging fixture**

The test must assert that after socket disconnect, a server-side order transition occurs, reconnect happens, and the UI eventually shows the authoritative new state.

- [ ] **Step 2: Verify RED**

Run: `npm run test:e2e -w apps/customer -- resilience-socket.spec.ts`.
Expected: FAIL until socket control/helper/reconciliation steps are implemented.

- [ ] **Step 3: Implement socket-control helper**

Use page evaluation or client-visible Socket.IO instance hooks only if already exposed; otherwise intercept websocket transport at browser/context level. Do not add a production backdoor solely for QA.

- [ ] **Step 4: Cover representative transitions**

Disconnect/reconnect around NEW→PREPARING, PREPARING→WAITING_FOR_COURIER, assignment, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED. Each test must re-read API state and assert UI catches up without state rollback or duplicate action.

- [ ] **Step 5: Verify desktop and mobile viewport for the same recovery path**

Use Chromium desktop and one representative mobile viewport.

- [ ] **Step 6: Commit**

Commit: `test: add socket reconnect recovery coverage`.

### Task 4: Refresh/close/reopen persistence across surfaces

**Files:**
- Create: `apps/customer/e2e/resilience-refresh.spec.ts`
- Create: `apps/customer/e2e/helpers/staging-sessions.ts`
- Modify if needed for test discovery only: `apps/customer/playwright.config.ts`

**Interfaces:**
- Consumes QA-created customer/operator/courier sessions passed through runtime environment, never persisted as artifact secrets.

- [ ] **Step 1: Write RED test for customer refresh after checkout**

Create order, reload, assert route and order state restore from API.

- [ ] **Step 2: Implement runtime session helper**

Helper logs into the correct staging surface using ephemeral QA credentials supplied by the same workflow process. Passwords/tokens must not be written to artifacts.

- [ ] **Step 3: Add Gestão/KDS/Courier refresh cases**

At representative states: NEW/PREPARING; preparing/ready; pending offer; accepted delivery; OUT_FOR_DELIVERY. After reload, state must match authoritative API and no transition may be replayed automatically.

- [ ] **Step 4: Add close/new-page reopen cases**

Close page/context where session storage design permits, reopen appropriate URL, and assert the documented authentication behavior rather than assuming persistence.

- [ ] **Step 5: Commit**

Commit: `test: add refresh and reopen resilience coverage`.

### Task 5: Transport recovery orchestrator and live workflow

**Files:**
- Create: `apps/api/scripts/qa/transportRecoveryRunner.ts`
- Create: `apps/api/scripts/qa/transportRecoveryRunner.test.ts`
- Modify: `apps/api/scripts/qa/cli.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Create: `.github/workflows/qa-live-transport-recovery.yml`
- Create: `qa-transport-recovery.trigger`

**Interfaces:**
- Produces CLI `qa:resilience:transport` and workflow evidence bundle.

- [ ] **Step 1: Write RED runner tests**

Prove API scenarios stop on first invariant failure, cleanup still runs, and browser suite is not started if backend preconditions fail.

- [ ] **Step 2: Implement orchestrator and CLI**

Run API uncertainty cases first, then browser socket/reload suite. Preserve manifest and protected snapshots across each isolated mutating scenario.

- [ ] **Step 3: Add workflow**

Require staging URLs and `DATABASE_URL`; run safety/typecheck/unit tests first; install Playwright Chromium; run API recovery, then browser recovery; upload JSON/Playwright traces/screenshots only on QA data.

- [ ] **Step 4: Execute small live cases first**

One delayed checkout, one response-loss retry, one socket reconnect, one refresh per surface. Expand state matrix only after PASS.

- [ ] **Step 5: Final audit and commit**

Verify no QA residues, no waiting orders, no protected config drift. Commit: `feat: orchestrate transport recovery QA`.
