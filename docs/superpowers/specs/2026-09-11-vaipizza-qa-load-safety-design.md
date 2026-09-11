# VaiPizza QA, Load and Safety Design

**Date:** 2026-09-11  
**Branch:** `redesign-vaipizza`  
**Scope:** staging only

## Goal

Create a repeatable QA and load-testing system for VaiPizza that can exercise the full order lifecycle, dispatch rules, GPS eligibility, payments, history and concurrency without risking the working staging configuration or production code.

## Non-negotiable safety rules

1. Tests run only against staging endpoints and the current staging Supabase project.
2. No test may truncate the database, drop tables, reset migrations or delete untagged rows.
3. Test-created data must be clearly identifiable with a run id such as `QA-20260911-191500`.
4. Cleanup may delete only records that belong to the exact QA run id being cleaned.
5. Restaurant configuration, delivery radius, dispatch radius, restaurant coordinates, GPS rules, operational users and non-QA records must never be modified by cleanup.
6. Before the first destructive cleanup capability exists, the system must be able to export a logical snapshot of protected configuration and verify that snapshot after the test.
7. Load tests must ramp gradually. A failed stage stops the next stage automatically.
8. Production URLs, production database credentials and production Netlify sites are explicitly forbidden targets for the QA runner.

## Current environment facts

- Frontends are hosted on Netlify.
- The API is a Node/Express/Socket.IO application using Prisma.
- The database is PostgreSQL on Supabase.
- The current Supabase `vaipizza` project is test/staging data and is healthy.
- There is no separate Supabase database branch today.
- Existing restaurant/GPS configuration is considered valuable and must remain intact.
- Current dispatch defaults include offer TTL, location freshness and GPS accuracy rules.

## Architecture

The QA system will live inside the existing repository and consist of four focused parts:

1. **QA guard** — refuses to run unless the target is explicitly staging and passes environment checks.
2. **QA fixture manager** — creates customers, addresses, couriers and orders marked with a run id and removes only those records.
3. **Scenario runner** — drives functional end-to-end API flows and validates expected state transitions.
4. **Load runner/reporting** — executes controlled concurrency stages and writes a machine-readable and human-readable report.

The runner will call the API directly for high-volume tests. Browser/mobile tests remain separate for sound, vibration, PWA and Safari behaviour.

## Data isolation model

Every generated customer will use a deterministic marker:

- Email: `qa+<runId>-<n>@vaipizza.test`
- Name: `[QA <runId>] Cliente <n>`
- Address label: `QA <runId> <scenario>`
- Notes where available: `[QA:<runId>]`

Where a model has no free-text field suitable for a marker, the runner will maintain the created record ids in a run manifest. Cleanup will operate from that manifest and additionally verify ownership through related QA users before deletion.

The system will not rely on broad predicates such as `createdAt > X` for deletion.

## Protected configuration snapshot

Before a QA run, the runner will export the protected configuration required to prove nothing changed, including at minimum:

- Restaurant id, slug/name and coordinates
- Customer delivery radius/rules
- Courier dispatch radius
- Delivery fee configuration
- Relevant dispatch/GPS environment expectations used by the API
- Existing operational courier ids and verification/status metadata

The snapshot will be stored as a JSON artifact under a local QA output directory, not committed with secrets.

After the run, the same fields will be read again and compared. Any difference marks the run failed and blocks automatic cleanup beyond QA-owned rows until reviewed.

## Functional scenario matrix

The first automated suite will cover:

### Customer and coverage
- Delivery clearly inside coverage
- Delivery near the configured boundary but inside
- Delivery immediately outside the boundary
- Delivery well outside the boundary
- Pickup/takeaway order

### Payment
- Card/online-compatible path where staging allows it
- MB Way/terminal path where supported
- Cash without change
- Cash with change

### Restaurant/KDS lifecycle
- NEW → accepted/preparing
- PREPARING → ready
- Delivery ready → waiting for courier
- Pickup ready → collected where applicable
- Cancellation at allowed stages

### Dispatch and courier
- Eligible courier receives offer
- Courier accepts before TTL
- Courier rejects offer
- Offer expires with no response
- Offline courier is not selected
- Courier with stale GPS is not selected
- Courier with poor GPS accuracy is not selected
- Courier outside dispatch radius is not selected
- Multiple eligible couriers choose the expected candidate according to dispatch rules
- Reassignment path where supported

### Delivery lifecycle
- COURIER_ASSIGNED → PICKED_UP
- PICKED_UP → OUT_FOR_DELIVERY
- OUT_FOR_DELIVERY → DELIVERED
- Courier returns to available/online state after completion
- Delivered order appears in history
- Earnings and cash settlement values remain internally consistent

### Cross-application consistency
For each important transition, the runner will verify API-visible state expected by Customer, Gestão, Cozinha and Estafeta instead of assuming a successful HTTP response means the whole system is consistent.

## Load profile

Load testing will be progressive and abort on unacceptable error rate or latency.

Stages:

1. **10 concurrent orders** — correctness baseline
2. **50 concurrent orders** — moderate burst
3. **100 concurrent orders** — target initial stress level
4. **250 concurrent orders** — only if the previous stage passes

A later 500+ stage is optional and must be manually enabled.

The load runner will record:

- Requests attempted/succeeded/failed
- HTTP status distribution
- Median, p95 and max latency
- Order creation throughput
- Time from ready to assignment where dispatch is part of the scenario
- Orders stuck in unexpected states
- Duplicate assignments
- Missing history records
- State mismatches
- Socket/event timing where measurable from the runner

## Stop conditions

The next load stage will not start if any of the following occurs:

- Database/config snapshot mismatch
- Any non-QA row is detected as a cleanup candidate
- Unexpected 5xx error rate above 1%
- Order state corruption or impossible transition
- Duplicate active assignment for the same courier/order where not allowed
- A meaningful number of orders remain stuck after the scenario timeout
- API becomes unavailable

Latency thresholds will be reported first and tuned after a baseline run; they will not be used to hide functional failures.

## Sound, vibration and PWA testing

Automated API/load tests cannot prove that an iPhone physically emitted sound or vibration. The automated suite can prove that an offer was created and delivered through the system. A short manual mobile checklist remains mandatory for:

- Audible offer alert
- Vibration where supported
- Safari/iOS interaction restrictions
- PWA resume/background behaviour
- GPS in foreground/background

## Rollback and recovery strategy

### Code
Git is the source of truth. The QA implementation is committed in small steps so individual changes can be reverted cleanly.

### Netlify frontends
Deploys remain immutable and a previous successful deploy can be republished if a frontend regression occurs.

### Database data
The QA runner avoids requiring database rollback by using run-scoped data and run-scoped cleanup. Protected configuration is snapshotted and compared before/after.

### Database schema
QA work will not alter the Prisma schema unless a later reviewed requirement makes it necessary. No migration is required for the initial harness.

## Infrastructure decision

No VPS is required for the initial QA system. The runner can execute from a developer machine or CI and call staging directly.

Netlify should not be the bottleneck because high-volume tests call the API directly rather than rendering hundreds of frontend sessions.

The current Supabase plan should be tested before any upgrade decision. Upgrades will be recommended only after measured evidence such as connection saturation, database CPU/latency, storage growth or sustained query slowdown.

## Repository layout

Planned files:

- `qa/README.md` — safe operating instructions
- `qa/config.ts` — staging allowlist and guardrails
- `qa/run-manifest.ts` — run id and created-record tracking
- `qa/config-snapshot.ts` — protected configuration export/compare
- `qa/fixtures.ts` — QA users/addresses/order fixtures
- `qa/scenarios/*.ts` — functional scenarios grouped by responsibility
- `qa/load.ts` — progressive load stages
- `qa/report.ts` — JSON/Markdown report generation
- `qa/cleanup.ts` — run-scoped cleanup only
- `qa/tests/*.test.ts` — tests for guardrails, cleanup ownership and scenario helpers
- root/package scripts — explicit commands for QA functional, load and cleanup workflows

The exact file structure may be adjusted during planning if repository conventions make a smaller design safer.

## Acceptance criteria

The QA system is considered ready when:

1. It refuses a non-staging target.
2. It can create and clean one QA run without touching untagged data.
3. Protected configuration matches before and after a run.
4. Functional scenarios produce a clear pass/fail report.
5. A 10-order baseline completes with traceable results.
6. Load stages can be increased independently without code edits.
7. A failed stage prevents automatic escalation.
8. Cleanup is idempotent and safe to run twice.
9. No production credential or secret is committed.
10. Manual mobile checks remain documented separately from automated load results.

## Out of scope for the first version

- Creating a paid Supabase branch
- Migrating hosting to a VPS
- Changing production infrastructure
- Running destructive tests against production
- Proving physical sound/vibration through automation
- Schema migrations solely for test convenience
