# VaiPizza Browser, Mobile & Offline QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the real staging interfaces on desktop/mobile and verify safe customer behaviour when connectivity is lost, without claiming unsupported offline order confirmation.

**Architecture:** Use the existing customer Playwright workspace as the browser QA host, opening all deployed staging surfaces by URL. Ephemeral QA fixtures are created by the API harness and passed to Playwright at runtime. Network/offline states are injected with Playwright context controls and route interception; authoritative server state is checked through APIs/database before cleanup.

**Tech Stack:** Playwright 1.49+, Chromium, TypeScript, existing React/Vite apps, PWA service worker, REST API, Prisma, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-vaipizza-resilience-concurrency-design.md`

## Global Constraints

- Execute only after backend-resilience and transport-recovery plans pass.
- Use staging deployment URLs only.
- Do not store QA passwords/tokens in committed files or uploaded artifacts.
- Screenshots/traces must contain only QA-created customer/order data.
- Offline checkout must never be reported as successful without authoritative server confirmation.
- Do not implement deferred offline ordering as part of this QA plan; report it separately if desired later.

---

### Task 1: Multi-surface Playwright staging configuration

**Files:**
- Modify: `apps/customer/playwright.config.ts`
- Create: `apps/customer/e2e/helpers/staging-urls.ts`
- Create: `apps/customer/e2e/helpers/qa-runtime.ts`
- Test: `apps/customer/e2e/helpers/qa-runtime.spec.ts`

**Interfaces:**
- Runtime env: `QA_CUSTOMER_URL`, `QA_RESTAURANT_URL`, `QA_KDS_URL`, `QA_COURIER_URL`, `QA_API_URL`.
- Produces typed URL/session helpers without persisted credentials.

- [ ] **Step 1: Write RED tests for required staging URL parsing**

Assert missing/non-HTTPS/non-staging URLs are rejected before browser launch.

- [ ] **Step 2: Verify RED**

Run: `npm run test:e2e -w apps/customer -- qa-runtime.spec.ts`.

- [ ] **Step 3: Implement strict staging URL helper**

Accept only configured staging hosts and return named URLs for customer/restaurant/KDS/courier/API.

- [ ] **Step 4: Add desktop and representative mobile Playwright projects**

Chromium desktop plus one modern phone viewport/device profile. Avoid an exhaustive browser matrix in this phase.

- [ ] **Step 5: Verify and commit**

Commit: `test: configure multi-surface staging browser QA`.

### Task 2: QA fixture handoff for browser tests

**Files:**
- Create: `apps/api/scripts/qa/browserFixtureRunner.ts`
- Create: `apps/api/scripts/qa/browserFixtureRunner.test.ts`
- Modify: `apps/api/scripts/qa/cli.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces one runtime-only fixture payload containing customer/staff/kitchen/courier credentials and tracked run ID.
- Consumed by Playwright through process environment or a protected temporary file deleted before artifact upload.

- [ ] **Step 1: Write RED tests proving secrets are not written into normal QA artifacts**

Create a fixture result and assert `manifest.json`/JSON evidence contains IDs/emails but no password/token fields.

- [ ] **Step 2: Verify RED**

Run focused QA test.

- [ ] **Step 3: Implement browser fixture coordinator**

Reuse existing fixture creation functions. Emit credentials only to stdout in a machine-readable form captured by the workflow process or to an ephemeral file outside `qa-artifacts/` with restrictive permissions.

- [ ] **Step 4: Add cleanup-by-run-id handoff**

Browser suite returns run ID; cleanup uses existing manifest ownership/preflight/protected snapshot flow.

- [ ] **Step 5: Verify and commit**

Commit: `feat: add ephemeral browser QA fixture handoff`.

### Task 3: Real UI happy-path visibility and state agreement

**Files:**
- Create: `apps/customer/e2e/resilience-ui.spec.ts`
- Create: `apps/customer/e2e/helpers/surface-login.ts`
- Create: `apps/customer/e2e/helpers/api-audit.ts`

**Interfaces:**
- Consumes ephemeral runtime sessions.
- Produces UI/API agreement assertions for all four surfaces.

- [ ] **Step 1: Write RED customer UI test with QA fixture**

Log in as QA customer, place/observe QA order, assert order is visible with expected status and no blocking console error.

- [ ] **Step 2: Add Gestão and KDS visibility tests**

Assert the QA order appears, required action controls are visible/clickable, and displayed state agrees with API.

- [ ] **Step 3: Add courier offer/active-delivery UI tests**

Assert assignment appears for intended QA courier, navigation/action controls remain visible, and no stale second owner is shown.

- [ ] **Step 4: Run desktop and mobile projects**

Critical buttons must remain visible/clickable at both viewports. Capture trace only on failure by default.

- [ ] **Step 5: Commit**

Commit: `test: validate staging UI state agreement`.

### Task 4: Offline and reconnect customer behaviour

**Files:**
- Create: `apps/customer/e2e/offline-customer.spec.ts`
- Reuse: `apps/customer/vite.config.ts`
- Modify production app files only if a reproducible unsafe behaviour is found, and only after a RED regression test.

**Interfaces:**
- Uses Playwright `browserContext.setOffline(true/false)` and API/database audit.

- [ ] **Step 1: Write RED/characterization test for offline-before-checkout**

Populate cart online, switch offline, click/attempt checkout. Assert there is no server-confirmed order and UI does not show authoritative success.

- [ ] **Step 2: Test network loss during checkout**

Intercept/drop the checkout response or switch offline at request time. Treat result as uncertain until reconnect; then re-read server state and assert UI does not manufacture a second order on recovery.

- [ ] **Step 3: Test cart/reopen behaviour while offline**

Where cached assets allow reopening, assert cart is either retained according to current implementation or fails transparently; silent corruption is FAIL. Do not assume full offline app support solely because PWA is installed.

- [ ] **Step 4: Reconnect and deliberate retry**

Restore network, reload/reconcile, revalidate server data, and only then retry checkout when appropriate. Assert resulting order count is expected.

- [ ] **Step 5: If unsafe success messaging exists, create a focused product bug regression test before any fix**

Minimal expected safe state: clearly not confirmed while no authoritative response exists. Any UI change requires its own RED test and smallest fix.

- [ ] **Step 6: Commit**

Commit: `test: validate safe customer offline behaviour`.

### Task 5: Console/runtime error and responsive critical-control audit

**Files:**
- Create: `apps/customer/e2e/runtime-health.spec.ts`
- Create: `apps/customer/e2e/helpers/runtime-errors.ts`

**Interfaces:**
- Produces per-surface console/pageerror/network-failure observations filtered to critical unexpected errors.

- [ ] **Step 1: Write RED helper tests**

Known benign browser noise can be explicitly allowlisted by exact pattern; uncaught exceptions, unhandled promise rejections, failed critical API requests, and React fatal errors fail the scenario.

- [ ] **Step 2: Audit Customer, Gestão, KDS and Courier**

Open representative authenticated screens on desktop/mobile and assert critical controls are within viewport or reachable normally, not hidden behind broken responsive layout.

- [ ] **Step 3: Verify no mismatch after refresh/reconnect**

Displayed status must agree with API state after reload and network recovery.

- [ ] **Step 4: Commit**

Commit: `test: add browser runtime health QA`.

### Task 6: Browser/offline orchestration workflow and final cleanup audit

**Files:**
- Create: `.github/workflows/qa-live-browser-resilience.yml`
- Create: `qa-browser-resilience.trigger`
- Modify: `package.json`
- Modify: `apps/customer/package.json`

**Interfaces:**
- Produces a final browser resilience artifact bundle with PASS/FAIL summaries, failure traces, and QA cleanup evidence.

- [ ] **Step 1: Add workflow with staged gates**

Run API QA/typecheck/tests first. Install Playwright Chromium. Create ephemeral QA fixtures. Run desktop suite, then mobile suite, then offline suite. Always execute manifest-owned cleanup in a final step.

- [ ] **Step 2: Ensure artifacts exclude credentials**

Upload only `qa-artifacts/` plus Playwright report/traces/screenshots after verifying no password/token strings are present in generated JSON/text artifacts.

- [ ] **Step 3: Execute visual smoke subset first**

Run one QA order across all four surfaces and pause cleanup only when explicitly doing the user-observed visual test; otherwise auto-clean.

- [ ] **Step 4: Execute full browser/offline suite**

Desktop → mobile → offline/reconnect. Stop on first authoritative-state inconsistency.

- [ ] **Step 5: Final database/protected-state audit**

Require zero QA users/orders, no unexpected `WAITING_FOR_COURIER`, no active QA assignments, and empty protected snapshot diff.

- [ ] **Step 6: Commit**

Commit: `feat: orchestrate browser and offline QA`.
