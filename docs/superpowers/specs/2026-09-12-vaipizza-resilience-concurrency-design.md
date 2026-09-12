# VaiPizza — Resilience, Concurrency & Failure-Mode QA Design

Date: 2026-09-12
Branch: `feature/qa-harness-safe`
Environment: staging only

## Purpose

Extend the existing QA harness beyond sequential load tests. The goal is to validate the most failure-prone real-world behaviours: concurrent checkouts, competing couriers, dispatch edge cases, API/network failures, reconnects, page refreshes, duplicate actions, and cross-system consistency.

This phase must not modify production and must not weaken the safety rules already used by the existing QA harness.

## Preconditions

This phase only starts after the stage-250 load test finishes and all of the following are true:

- stage 250 completes successfully;
- QA cleanup completes successfully;
- protected staging configuration has no diff before/after;
- no QA users or QA orders remain;
- no order remains unexpectedly in `WAITING_FOR_COURIER`;
- existing QA typecheck/tests and existing API tests are green.

If any precondition fails, execution stops and the failure is investigated before this phase begins.

## Safety model

All new scenarios use the current safety model:

- staging-only host and database guards;
- explicit mutation confirmation;
- QA-tagged users, orders, products and addresses;
- per-run manifest tracking every created identifier;
- protected configuration snapshots before and after each scenario;
- cleanup limited to manifest-owned QA data;
- automatic stop on unexpected behaviour;
- no production credentials, URLs or data;
- no broad database cleanup.

For destructive cleanup, the existing ownership checks remain authoritative. A scenario must never delete or mutate non-QA customer/order/courier data merely to recover from a failed test.

## Execution strategy

The phase is split into independent scenario groups. Each group starts small and increases pressure only after the small case passes. A failure in one group does not get hidden by continuing into the next one.

Each scenario records:

- exact inputs;
- request timing;
- API responses/status codes;
- order state transitions;
- courier assignment states;
- final database state;
- protected configuration diff;
- cleanup result;
- PASS/FAIL reason.

## Group 1 — Concurrent customer checkout

### Goal

Verify that simultaneous customer activity does not create duplicated, lost, malformed or partially persisted orders.

### Scenarios

1. Multiple distinct customers submit checkout at the same instant.
2. Same customer sends two checkout requests concurrently from the same cart.
3. Same checkout action is retried after client-side uncertainty/timeout.
4. Mixed inside/outside delivery addresses are submitted concurrently.

### Expected invariants

- each accepted distinct checkout produces exactly one valid order;
- an out-of-range request still returns the explicit `OUT_OF_RANGE` result;
- no cart/order is partially persisted;
- duplicate submission cannot silently create unintended duplicate orders;
- totals, customer, address and item relations remain consistent;
- no accepted order disappears from subsequent reads.

If current application behaviour permits duplicate same-cart checkout, that is reported as a product/backend defect rather than hidden by the harness.

## Group 2 — Courier assignment race conditions

### Goal

Validate atomicity when multiple couriers compete for the same offer.

### Scenarios

1. Two eligible couriers receive/observe the same delivery opportunity and attempt acceptance simultaneously.
2. Three or more eligible couriers attempt acceptance with tightly synchronized requests.
3. One courier accepts while another rejects at nearly the same time.
4. Repeated acceptance call from the same courier.

### Expected invariants

- only one courier can own the order;
- only one assignment can become accepted;
- losing acceptance attempts receive an explicit conflict/unavailable result;
- order `courierId` agrees with accepted assignment;
- no courier other than the winner sees the order as its current delivery;
- earnings are created only for the courier that actually completes the order.

## Group 3 — Dispatch lifecycle failure modes

### Goal

Verify automatic dispatch behaviour when courier availability changes.

### Scenarios

1. Courier rejects an offer.
2. Courier ignores an offer until TTL expiry.
3. Courier becomes offline before an offer.
4. Courier becomes offline after an offer but before acceptance.
5. Courier has stale GPS.
6. Courier has inaccurate GPS.
7. Courier is outside dispatch radius.
8. Multiple eligible couriers reject/expire in sequence.
9. Automatic reassignment to the next eligible courier.
10. Manual reassignment through the management API/UI if that capability already exists; if it does not exist, record the missing capability explicitly instead of silently skipping the scenario.

### Expected invariants

- ineligible couriers are never chosen;
- rejected/expired assignment is not later acceptable;
- dispatch moves to the next valid courier when appropriate;
- a waiting order remains visible and recoverable if nobody is eligible;
- assignment exhaustion/alerts are internally consistent;
- one order never has two active owners.

## Group 4 — API latency, timeout and transient failure

### Goal

Validate behaviour when requests are slow or fail rather than returning normally.

### Failure injection

Failure injection must happen in the QA harness/browser transport layer or a staging-only test proxy/interceptor. Production application limits must not be globally changed just to make the test pass.

### Scenarios

1. Delayed checkout response.
2. Delayed order-status transition response.
3. Client-side timeout while server may still complete the request.
4. Synthetic HTTP 500 response on a non-destructive read.
5. Temporary API unavailability followed by recovery.
6. Retry of an action after response loss.

### Expected invariants

- UI/client does not claim success without authoritative confirmation;
- retries do not create inconsistent duplicate side effects;
- server state can be re-read after uncertainty;
- once API recovers, the authoritative order state is restored to the client;
- loading/error state is understandable and recoverable.

## Group 5 — Socket disconnect and reconnect

### Goal

Verify real-time clients recover from missed events.

### Scenarios

Disconnect/reconnect the socket during:

- NEW → PREPARING;
- PREPARING → WAITING_FOR_COURIER;
- assignment creation/acceptance;
- PICKED_UP;
- OUT_FOR_DELIVERY;
- DELIVERED.

### Expected invariants

- reconnect does not duplicate events or actions;
- client eventually reconciles with authoritative API/database state;
- a missed socket event does not permanently leave the UI in an old state;
- the order does not change backwards;
- reconnect cannot assign the same order twice.

## Group 6 — Refresh, close and reopen

### Goal

Validate persistence across browser lifecycle changes.

### Surfaces

- Customer;
- Gestão;
- Cozinha;
- Estafeta.

### Scenarios

Refresh or reopen at representative states:

- customer after checkout;
- management while order is NEW/PREPARING;
- kitchen while preparing/ready;
- courier while offer is pending;
- courier after acceptance;
- courier while OUT_FOR_DELIVERY;
- customer after DELIVERED.

### Expected invariants

- current state is restored from server, not assumed from stale local state;
- authenticated session behaves as designed;
- no state transition is repeated automatically by refresh;
- navigation returns to a valid screen;
- order/courier ownership remains unchanged unless an explicit action occurred.

## Group 7 — Duplicate actions / idempotency pressure

### Goal

Find double-click and retry defects.

### Scenarios

Rapid duplicate requests for:

- checkout;
- accept order in Gestão;
- mark ready in Cozinha;
- courier assignment acceptance;
- PICKED_UP;
- OUT_FOR_DELIVERY;
- DELIVERED.

### Expected invariants

The authoritative state machine must remain valid. Repeated requests may return success, conflict or validation error depending on endpoint semantics, but they must not produce contradictory state, duplicated payment effects, duplicated courier earnings, or duplicated assignment ownership.

## Group 8 — Browser and mobile UI validation

### Goal

Verify the actual staging interfaces rather than only API behaviour.

### Coverage

- Chromium desktop viewport;
- representative mobile viewport(s);
- customer ordering journey;
- Gestão order visibility/actions;
- Cozinha workflow;
- Estafeta offer and active-delivery workflow.

### Checks

- no blocking console errors;
- no uncaught promise errors;
- critical controls visible and clickable;
- loading/error/reconnect states are understandable;
- refresh returns to a coherent screen;
- order state shown in UI agrees with API/database state;
- responsive layout does not hide critical action buttons.

This does not claim exhaustive certification of every browser/device combination. It is a representative functional validation of the supported web experience.

## Group 9 — Customer offline behaviour

### Current expectation

The customer app is installable as a PWA, but confirmed ordering without internet is not treated as supported behaviour unless a dedicated offline submission design is implemented later.

### Tests for current behaviour

1. App loses network before checkout.
2. Network disappears during checkout.
3. App regains network after the user has a populated cart.
4. Refresh/reopen while offline where cached resources are available.

### Required safe behaviour

- the customer must not be told that an order was confirmed if the server did not confirm it;
- cart contents should not be silently corrupted;
- once connectivity returns, the user can revalidate/retry deliberately;
- stale price/stock/delivery eligibility must not be assumed authoritative offline.

A future "offline cart + deferred submission" feature is out of scope for this QA phase and would require its own design because prices, stock, opening status and delivery range must be revalidated on reconnect.

## Cross-system audit after every mutating scenario

For each successfully created delivery order, the harness checks that the following agree:

- order status;
- payment status;
- customer order read;
- management/kitchen-visible state where applicable;
- accepted courier assignment;
- order `courierId`;
- courier current order/history;
- courier earnings/lifetime delivery count;
- no unexpected active assignment remains;
- no unexpected `WAITING_FOR_COURIER` residue remains after scenario completion.

The audit is performed before cleanup so that cleanup cannot hide an inconsistent result.

## Scenario ordering

Recommended execution order:

1. concurrent checkout;
2. courier acceptance races;
3. reject/timeout/offline/reassignment;
4. duplicate-action/idempotency pressure;
5. API latency/timeouts/transient errors;
6. socket disconnect/reconnect;
7. refresh/reopen;
8. browser/mobile UI validation;
9. current offline behaviour validation;
10. final protected-state and cleanup audit.

The order intentionally validates backend atomicity before UI/network recovery behaviours.

## Stop conditions

Execution stops immediately when any of these occurs:

- protected configuration changes unexpectedly;
- non-QA data would need to be changed for cleanup;
- order ownership becomes ambiguous;
- more than one courier owns the same order;
- duplicated financial/earning effect is detected;
- cleanup ownership validation fails;
- a test failure cannot be clearly attributed to the scenario being exercised.

The failure is then reproduced in the smallest possible scenario and fixed/tested before progression continues.

## Success criteria

This phase is considered successful when every approved scenario group has:

- a reproducible automated test or controlled browser test;
- explicit expected result;
- PASS evidence on staging;
- final data consistency audit;
- successful QA-owned cleanup;
- zero protected configuration drift.

A complete PASS materially increases confidence in the system, but does not constitute a guarantee that no future software, infrastructure, browser, network or third-party failure can ever occur.

## Out of scope

- production load testing;
- deliberate attacks/security penetration testing;
- changing production/staging business rules solely to satisfy tests;
- testing every physical phone/browser/OS combination;
- implementing true offline order submission;
- raising sequential load beyond 250 merely for a larger number unless evidence from these scenarios justifies it.
