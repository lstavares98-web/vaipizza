# VaiPizza QA and Load Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a staging-only QA harness that can create isolated test data, exercise the full VaiPizza order/dispatch lifecycle, run progressive load stages, produce reports, and clean only its own data without risking the working system.

**Architecture:** Keep the harness outside the production API build under `apps/api/scripts/qa`. It uses Node 20 `fetch` for HTTP scenarios and the existing Prisma client only for test-fixture setup, protected-configuration snapshots, and run-scoped cleanup. Every mutating command is guarded by an exact staging allowlist, an explicit confirmation token, a QA run id, and ownership checks before deletion. The production API routes, Prisma schema, migrations, Netlify production sites, and existing non-QA records are not modified by the initial harness.

**Tech Stack:** Node 20, TypeScript, tsx, Vitest, Prisma/PostgreSQL, existing Express API, existing Socket.IO dispatch logic.

**Spec:** `docs/superpowers/specs/2026-09-11-vaipizza-qa-load-safety-design.md`

## Global Constraints

- Scope is staging only.
- Allowed Supabase project ref is `vnuowugruqheakomdtuh`.
- Default staging API hostname is `vaipizza-api-staging.onrender.com`; the runner must reject hosts that do not contain `staging` or are not explicitly allowlisted.
- No `TRUNCATE`, `DROP`, migration reset, schema reset, or broad date-based deletion.
- Every generated user email begins with `qa+<runId>-` and every generated name begins with `[QA <runId>]`.
- Every destructive cleanup requires `QA_CONFIRM=VAIPIZZA_STAGING_ONLY` and an exact `--run-id`.
- Cleanup is dry-run by default; deletion additionally requires `--confirm-delete`.
- Existing restaurant coordinates, delivery radius, courier-dispatch radius, fee rules, GPS-related configuration, operational users/couriers, and non-QA catalog rows are protected.
- Load stages are progressive: 10, 50, 100, 250. The 500+ stage is not part of the default implementation.
- A failed safety check or functional stop condition aborts the run immediately.
- No secrets, database passwords, JWT secrets, or access tokens are written to committed files or reports.

---

### Task 1: Create the QA safety boundary and rollback point

**Files:**
- Create: `apps/api/scripts/qa/config.ts`
- Create: `apps/api/scripts/qa/types.ts`
- Create: `apps/api/scripts/qa/config.test.ts`
- Create: `apps/api/vitest.qa.config.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `loadQaConfig(env: NodeJS.ProcessEnv): QaConfig`
- Produces: `assertSafeTarget(config: QaConfig): void`
- Produces: `assertMutationConfirmation(config: QaConfig): void`
- Produces: `QaConfig`, `QaRunManifest`, `QaResult`, `QaScenarioResult`

- [ ] **Step 1: Create a Git rollback branch before code changes**

Create `safety/pre-qa-harness-20260911` from the current `redesign-vaipizza` commit. Do not point Netlify at this branch and do not deploy it. Record the source commit in the QA plan execution notes.

- [ ] **Step 2: Write failing guardrail tests**

`apps/api/scripts/qa/config.test.ts` must cover these exact cases:

```ts
import { describe, expect, it } from "vitest";
import { assertMutationConfirmation, assertSafeTarget, loadQaConfig } from "./config.js";

describe("QA staging guard", () => {
  it("accepts the known staging API and Supabase ref", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: "postgresql://u:p@db.vnuowugruqheakomdtuh.supabase.co:5432/postgres?sslmode=require",
    });
    expect(() => assertSafeTarget(config)).not.toThrow();
  });

  it("rejects production-like API hosts", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://api.vaipizza.pt",
      DATABASE_URL: "postgresql://u:p@db.vnuowugruqheakomdtuh.supabase.co:5432/postgres?sslmode=require",
    });
    expect(() => assertSafeTarget(config)).toThrow(/staging/i);
  });

  it("rejects an unknown Supabase project", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: "postgresql://u:p@db.otherproject.supabase.co:5432/postgres?sslmode=require",
    });
    expect(() => assertSafeTarget(config)).toThrow(/Supabase/i);
  });

  it("requires the exact mutation confirmation token", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: "postgresql://u:p@db.vnuowugruqheakomdtuh.supabase.co:5432/postgres?sslmode=require",
      QA_CONFIRM: "wrong",
    });
    expect(() => assertMutationConfirmation(config)).toThrow(/VAIPIZZA_STAGING_ONLY/);
  });
});
```

- [ ] **Step 3: Run the QA test config and confirm RED**

Run:

```bash
npm exec -w apps/api vitest -- --config vitest.qa.config.ts scripts/qa/config.test.ts
```

Expected: FAIL because `config.ts` does not exist yet.

- [ ] **Step 4: Implement the minimal guard**

`config.ts` must parse `QA_API_URL` with `URL`, parse the DB hostname from `DATABASE_URL`, require `QA_ENV === "staging"`, require API hostname `vaipizza-api-staging.onrender.com` or another explicit allowlist entry containing `staging`, and require DB hostname exactly `db.vnuowugruqheakomdtuh.supabase.co`. `assertMutationConfirmation` must require the literal token `VAIPIZZA_STAGING_ONLY`.

- [ ] **Step 5: Add isolated QA scripts**

Add to `apps/api/package.json`:

```json
"qa:test": "vitest run --config vitest.qa.config.ts",
"qa:snapshot": "tsx scripts/qa/cli.ts snapshot",
"qa:functional": "tsx scripts/qa/cli.ts functional",
"qa:load": "tsx scripts/qa/cli.ts load",
"qa:cleanup": "tsx scripts/qa/cli.ts cleanup"
```

Add root proxy scripts:

```json
"qa:test": "npm run qa:test -w apps/api",
"qa:snapshot": "npm run qa:snapshot -w apps/api",
"qa:functional": "npm run qa:functional -w apps/api",
"qa:load": "npm run qa:load -w apps/api",
"qa:cleanup": "npm run qa:cleanup -w apps/api"
```

Add `qa-artifacts/` to `.gitignore`.

- [ ] **Step 6: Run QA guard tests and existing API tests**

Run:

```bash
npm run qa:test
npm run test -w apps/api
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json apps/api/package.json apps/api/vitest.qa.config.ts apps/api/scripts/qa .gitignore
git commit -m "test: adicionar protecoes do runner QA"
```

---

### Task 2: Add protected-configuration snapshot and invariant comparison

**Files:**
- Create: `apps/api/scripts/qa/snapshot.ts`
- Create: `apps/api/scripts/qa/snapshot.test.ts`
- Create: `apps/api/scripts/qa/artifacts.ts`
- Modify: `apps/api/scripts/qa/types.ts`

**Interfaces:**
- Produces: `captureProtectedSnapshot(prisma): Promise<ProtectedSnapshot>`
- Produces: `compareProtectedSnapshots(before, after): SnapshotDiff[]`
- Produces: `writeJsonArtifact(runId, name, value): Promise<string>`

- [ ] **Step 1: Write failing pure comparison tests**

Test that identical snapshots produce `[]` and that changing any protected field produces a named diff. Protected fields must include restaurant `id`, `slug`, `name`, `lat`, `lng`, `deliveryRadiusKm`, `courierDispatchRadiusKm`, `deliveryFeeMode`, `deliveryFeeBase`, `deliveryFeePerKm`, `deliveryFeeFreeKm`, delivery-fee tiers, and pre-existing courier `id`, `userId`, `verificationStatus`.

- [ ] **Step 2: Run and confirm RED**

```bash
npm run qa:test -- --run scripts/qa/snapshot.test.ts
```

Expected: FAIL because snapshot functions do not exist.

- [ ] **Step 3: Implement snapshot capture**

Use `PrismaClient` to read the primary restaurant and its delivery-fee tiers plus all couriers whose linked user email does **not** start with `qa+`. Sort arrays by stable id before serializing. Never include password hashes, refresh tokens, JWTs, DB URLs, Cloudinary credentials, or Stripe data.

- [ ] **Step 4: Persist snapshot artifacts locally**

Write files under:

```text
qa-artifacts/<runId>/protected-before.json
qa-artifacts/<runId>/protected-after.json
qa-artifacts/<runId>/protected-diff.json
```

- [ ] **Step 5: Run tests and a read-only staging snapshot**

Run QA unit tests first. Then run only `qa:snapshot` without mutation confirmation; read-only snapshot must succeed without `QA_CONFIRM`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/qa
git commit -m "test: proteger configuracao operacional antes do QA"
```

---

### Task 3: Add run manifest and isolated QA fixtures

**Files:**
- Create: `apps/api/scripts/qa/manifest.ts`
- Create: `apps/api/scripts/qa/manifest.test.ts`
- Create: `apps/api/scripts/qa/fixtures.ts`
- Create: `apps/api/scripts/qa/fixtures.test.ts`
- Create: `apps/api/scripts/qa/http.ts`
- Modify: `apps/api/scripts/qa/types.ts`

**Interfaces:**
- Produces: `createRunId(now?: Date): string`
- Produces: `qaEmail(runId, index): string`
- Produces: `createQaCustomer(...)`
- Produces: `createQaCatalogFixture(...)`
- Produces: `createQaCourierFixture(...)`
- Produces: `saveManifest(manifest): Promise<void>`

- [ ] **Step 1: Write marker/manifest tests**

The marker functions must generate deterministic values, for example:

```ts
expect(qaEmail("QA-20260911-191500", 3))
  .toBe("qa+QA-20260911-191500-3@vaipizza.test");
```

The manifest must refuse record ids that are empty and must persist only ids, run metadata, scenario names, and timing data; never credentials.

- [ ] **Step 2: Create QA customers through the real API**

Use `POST /api/auth/register` with names `[QA <runId>] Cliente <n>`, QA emails, phone `910000000`-style deterministic values, and a generated test-only password held in memory for the run. Store returned user ids/tokens only in memory; persist only user ids to the manifest.

- [ ] **Step 3: Create QA catalog data directly with Prisma**

Attach a category named `[QA <runId>] Categoria` and one available product named `[QA <runId>] Produto` to the existing primary restaurant. Record their ids in the manifest. Do not edit or reuse existing product rows for load traffic.

- [ ] **Step 4: Create QA courier fixtures directly with Prisma**

Create linked `User` + `Courier` rows with QA email markers, bcrypt password hashes, role `COURIER`, `verificationStatus=APPROVED`, and statuses/coordinates supplied by each scenario. Record both ids in the manifest. Never alter the existing operational courier rows.

- [ ] **Step 5: Add address/cart helpers through the real API**

Use the existing address and cart endpoints so coverage and checkout exercise actual server validation. Address labels must start `QA <runId>`.

- [ ] **Step 6: Run unit tests and one fixture smoke run**

A fixture smoke run may create one QA customer, one QA catalog product, and one QA courier only after the staging guard and mutation confirmation pass. It must write the manifest immediately after each successful creation so a partial crash remains cleanable.

- [ ] **Step 7: Commit**

```bash
git add apps/api/scripts/qa
git commit -m "test: adicionar fixtures isoladas do QA"
```

---

### Task 4: Implement ownership-checked, dry-run-first cleanup

**Files:**
- Create: `apps/api/scripts/qa/cleanup.ts`
- Create: `apps/api/scripts/qa/cleanup.test.ts`
- Modify: `apps/api/scripts/qa/manifest.ts`
- Modify: `apps/api/scripts/qa/cli.ts`

**Interfaces:**
- Produces: `preflightCleanup(prisma, manifest): Promise<CleanupPlan>`
- Produces: `executeCleanup(prisma, plan): Promise<CleanupResult>`

- [ ] **Step 1: Write failing cleanup safety tests**

Tests must prove:

1. A manifest user whose DB email does not start with `qa+<runId>-` aborts cleanup.
2. A manifest order owned by a non-QA user aborts cleanup.
3. A manifest courier linked to a non-QA user aborts cleanup.
4. Cleanup with no `--confirm-delete` returns a plan and deletes nothing.
5. Cleanup run twice is idempotent.

- [ ] **Step 2: Implement preflight ownership validation**

Load every manifest id from the DB and verify relationships before constructing deletions. Missing rows are allowed for idempotency; mismatched ownership is a hard failure.

- [ ] **Step 3: Implement a single Prisma transaction for QA-owned deletion**

Delete in dependency-safe order using **exact manifest ids only**: QA orders first, then QA carts/addresses, QA couriers, QA products/categories, and finally QA users. Rely on declared cascades only after ownership has been checked. Do not use `deleteMany({ where: { createdAt: ... } })`, email wildcard deletion, or table-wide deletion.

- [ ] **Step 4: Require three independent deletion gates**

Actual deletion requires all three:

```text
safe staging API + allowed Supabase host
QA_CONFIRM=VAIPIZZA_STAGING_ONLY
--confirm-delete --run-id=<exact id>
```

- [ ] **Step 5: Verify protected snapshot before and after cleanup**

Capture `protected-after.json`, compare it to `protected-before.json`, and fail loudly if any protected configuration differs.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/qa
git commit -m "test: adicionar limpeza QA com validacao de propriedade"
```

---

### Task 5: Implement the functional scenario suite

**Files:**
- Create: `apps/api/scripts/qa/scenarios/coverage.ts`
- Create: `apps/api/scripts/qa/scenarios/payments.ts`
- Create: `apps/api/scripts/qa/scenarios/lifecycle.ts`
- Create: `apps/api/scripts/qa/scenarios/dispatch.ts`
- Create: `apps/api/scripts/qa/scenarios/history.ts`
- Create: `apps/api/scripts/qa/scenarios/index.ts`
- Create: `apps/api/scripts/qa/scenarios/scenarios.test.ts`
- Modify: `apps/api/scripts/qa/cli.ts`

**Interfaces:**
- Produces: `runFunctionalSuite(context): Promise<QaScenarioResult[]>`
- Every scenario returns `{ name, status: "PASS" | "FAIL" | "SKIP", durationMs, details }`.

- [ ] **Step 1: Add deterministic geographic point generation**

Generate coordinates from the restaurant lat/lng at target radial distances using a pure helper. Cover 1 km, `deliveryRadiusKm - 0.1`, `deliveryRadiusKm + 0.1`, and `deliveryRadiusKm + 3`. Unit-test the resulting Haversine distances within ±0.05 km.

- [ ] **Step 2: Add coverage scenarios**

Create separate QA customers for clearly inside, boundary-inside, boundary-outside, and well-outside delivery. Assert expected success/rejection from the real checkout flow. Add pickup as a separate scenario that does not require a delivery address.

- [ ] **Step 3: Add payment scenarios**

Run CASH without change and CASH with `amountTendered`. Run MBWAY/TERMINAL only when the current checkout path permits them. CARD must be marked `SKIP` when staging Stripe configuration is intentionally absent rather than falsely passing.

- [ ] **Step 4: Add restaurant/KDS lifecycle scenarios**

Drive a delivery order through the existing API-visible states and assert status history contains the expected sequence. Drive one pickup order to collection. Exercise customer cancellation only at a stage currently allowed by the service.

- [ ] **Step 5: Add dispatch scenarios with QA couriers only**

Create scenario-specific QA couriers for: eligible, offline, stale GPS, poor GPS accuracy, outside dispatch radius, reject, expiration, and two eligible couriers. Assert that non-eligible couriers do not receive `OFFERED` assignments and that the selected courier matches the current distance/fairness rules.

- [ ] **Step 6: Add delivery/history/accounting assertions**

For one accepted QA assignment, drive `COURIER_ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED`. Assert the order is delivered, the QA courier returns to an available state expected by current logic, the order appears in history, and earnings/cash values are internally consistent.

- [ ] **Step 7: Add fail-fast orchestration**

A configuration mismatch, ownership violation, impossible state, duplicate active assignment, or API outage stops the suite. Ordinary scenario failures are reported but may continue only when they cannot corrupt subsequent state.

- [ ] **Step 8: Run the full functional suite with one QA run**

Run against staging only. After report generation, execute cleanup for that exact run id. Re-run protected snapshot comparison.

- [ ] **Step 9: Commit**

```bash
git add apps/api/scripts/qa
git commit -m "test: automatizar fluxo funcional completo da VaiPizza"
```

---

### Task 6: Add progressive load generation and metrics

**Files:**
- Create: `apps/api/scripts/qa/load.ts`
- Create: `apps/api/scripts/qa/load.test.ts`
- Create: `apps/api/scripts/qa/metrics.ts`
- Modify: `apps/api/scripts/qa/cli.ts`
- Modify: `apps/api/scripts/qa/types.ts`

**Interfaces:**
- Produces: `runLoadStage(context, concurrentOrders): Promise<LoadStageResult>`
- Produces: `summarizeLatencies(values): { medianMs: number; p95Ms: number; maxMs: number }`

- [ ] **Step 1: Test metrics calculation**

Use fixed arrays to verify median, p95, max, success count, HTTP status histogram, and 5xx rate.

- [ ] **Step 2: Implement a default 10-order baseline**

Each virtual order uses its own QA customer and address, the dedicated QA product, and the real cart/checkout API. Collect request timing with `performance.now()` and record exact order ids in the manifest immediately.

- [ ] **Step 3: Add progressive stages**

Allowed values are exactly `10`, `50`, `100`, `250`. The CLI default is `10`. Advancing to the next stage requires the previous stage result in the same run to meet stop conditions.

- [ ] **Step 4: Enforce stop conditions**

Abort escalation on: any protected snapshot mismatch, >1% unexpected 5xx, API unavailability, impossible order state, duplicate assignment, or orders left in unexpected states after the configured timeout.

- [ ] **Step 5: Prevent accidental extreme load**

Reject stage values outside the allowlist. There is no `500` option in this version. Adding 500+ requires a separate reviewed change.

- [ ] **Step 6: Run only the 10-order baseline first**

Do not run 50/100/250 during initial implementation. Review baseline results and infrastructure health before authorizing stage 50.

- [ ] **Step 7: Commit**

```bash
git add apps/api/scripts/qa
git commit -m "test: adicionar carga progressiva com travoes de seguranca"
```

---

### Task 7: Generate human-readable reports and operational checklist

**Files:**
- Create: `apps/api/scripts/qa/report.ts`
- Create: `apps/api/scripts/qa/report.test.ts`
- Create: `apps/api/scripts/qa/README.md`
- Modify: `apps/api/scripts/qa/cli.ts`

**Interfaces:**
- Produces: `writeQaReport(run): Promise<{ jsonPath: string; markdownPath: string }>`

- [ ] **Step 1: Add report snapshot tests**

The report must show run id, start/end time, target hostname, scenario PASS/FAIL/SKIP totals, load stage, request counts, status distribution, median/p95/max latency, stuck orders, duplicate assignments, cleanup result, and protected-configuration comparison. It must redact tokens and URLs containing credentials.

- [ ] **Step 2: Write reports**

Output:

```text
qa-artifacts/<runId>/report.json
qa-artifacts/<runId>/report.md
```

- [ ] **Step 3: Document exact operating commands**

`README.md` must distinguish read-only snapshot, functional run, load baseline, dry-run cleanup, confirmed cleanup, and the manual mobile checklist for sound/vibration/Safari/PWA/GPS.

- [ ] **Step 4: Add recovery instructions**

Document the Git safety branch, Netlify deploy rollback, QA manifest cleanup, and protected-snapshot comparison. State explicitly that DB schema rollback is not part of this harness because the harness creates no migration.

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts/qa
git commit -m "docs: documentar execucao e relatorios do QA"
```

---

### Task 8: Verify the harness before any significant load

**Files:**
- No new production files.
- Review all files under `apps/api/scripts/qa/`.

**Interfaces:**
- Consumes all previous tasks.
- Produces the evidence required to authorize stage 10 and, later, stage 50.

- [ ] **Step 1: Run all existing API tests**

```bash
npm run test -w apps/api
```

Expected: zero failures.

- [ ] **Step 2: Run all QA unit tests**

```bash
npm run qa:test
```

Expected: zero failures.

- [ ] **Step 3: Build the API and courier frontend**

```bash
npm run build -w apps/api
npm run build -w apps/courier
```

Expected: both exit 0.

- [ ] **Step 4: Prove the production guard**

Run the guard tests with a production-like URL and an unknown Supabase project; both must be rejected before any Prisma client mutation executes.

- [ ] **Step 5: Run a read-only protected snapshot**

Verify the snapshot contains the known restaurant/GPS/delivery settings but no credentials.

- [ ] **Step 6: Run one single-order functional QA execution**

Create one QA run, complete one order lifecycle, generate its report, run cleanup, compare protected config, and confirm the manifest has no remaining owned rows.

- [ ] **Step 7: Run the 10-order baseline only**

Run stage 10, review report, then clean that exact run. Do not proceed to stage 50 without reviewing API/database behaviour and the report.

- [ ] **Step 8: Record infrastructure recommendation from measured evidence**

Only after stage 10 and later stage 50 results, decide whether Render/API capacity, Supabase plan, or any other infrastructure requires upgrading. Netlify frontend credits are not used as the main load target.

- [ ] **Step 9: Final verification commit**

Commit only documentation or harness changes needed from verification. Do not commit generated `qa-artifacts/`.
