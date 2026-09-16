# Courier Operations Hardening Design

## Context

Live staging QA exposed a set of operational gaps around courier sessions, online presence, GPS eligibility, management controls, and order cancellation. The dispatch core itself is working and has already passed two-courier capacity/queue tests and an outside-zone test. This change must preserve those green behaviors while making courier operations safer and clearer.

Production must remain untouched. All implementation and validation for this design happens on staging first.

## Goals

1. Make courier authentication session-exclusive: the newest courier login wins and invalidates the previous device session.
2. Keep authentication separate from work availability: logging in does not mean being online for dispatch.
3. Make courier online/offline, GPS eligibility, and device presence clear and non-contradictory.
4. Make the logged-in courier identity visible in the courier app.
5. Consolidate alert activation with the online action without weakening browser permission constraints.
6. Add temporary suspension and permanent deactivation controls for couriers.
7. Add safe restaurant-side operational cancellation with audit/history/refund/dispatch cleanup.
8. Fix management UI state colors so non-eligible couriers are never shown with a green operational indicator.
9. Preserve dispatch safety around stale/inaccurate/out-of-zone GPS and existing one-active-plus-one-queued delivery limits.
10. Explicitly treat browser background limitations as a presentation/presence concern, not as a reason to fake continuous GPS.

## Non-goals

- Do not build the native Capacitor courier app in this change.
- Do not weaken GPS freshness or accuracy requirements.
- Do not change the customer delivery radius or courier dispatch radius defaults.
- Do not rewrite the dispatch allocation algorithm.
- Do not alter production services, production databases, or production Netlify sites.
- Do not delete historical orders, assignments, earnings, or status history.

## 1. Exclusive courier session

### Desired behavior

Courier accounts may have only one valid operational session at a time.

When the same courier logs in on a second device:

- the new login succeeds;
- all previously active courier refresh sessions for that user are revoked;
- the new session is issued with a session identifier;
- protected courier requests validate that the access token belongs to the current courier session;
- the old device is rejected on its next API/socket interaction with a specific session-replaced error;
- the courier frontend clears local tokens and shows: `A sua conta foi iniciada noutro dispositivo.`

### Important delivery rule

A new device login must not cancel or unassign an already active delivery. The new device should load `/courier/orders/current` and continue the courier's active delivery state.

### Technical direction

Add a courier-session identity that is represented in the JWT and validated server-side. Revoking refresh tokens alone is insufficient because an already-issued access token remains valid until expiry.

A minimal implementation can store the current courier session id/version on the courier or user record and include that id/version in courier access tokens. Courier auth middleware compares token session id/version with the current stored value for courier-only endpoints.

Customer, restaurant, kitchen, and admin authentication semantics should remain unchanged.

## 2. Login and work availability are separate

The courier app already exposes `Ficar online / Ficar offline`; this remains the operational model.

Rules:

- Logging in does not automatically change a courier from `OFFLINE` to `AVAILABLE`.
- A courier without an active delivery lands in the app as Offline after a fresh login.
- If the courier has an active delivery, login does not overwrite the delivery-related courier status; the app resumes the active delivery.
- Explicit logout while the courier is `AVAILABLE` should set the courier to `OFFLINE` before clearing the local session.
- Explicit logout must be refused or carefully handled while an active delivery is in progress; it must never silently abandon the delivery.
- Closing the browser, locking the screen, losing connectivity, or background suspension must not be treated as explicit logout.

## 3. Online, eligibility, and GPS are distinct concepts

Three concepts are displayed separately:

- Authentication/session: who is logged in.
- Work availability: Offline, Online/Available, or delivery in progress.
- Dispatch eligibility: whether the courier can receive a new offer right now.

A courier may be online but not dispatch-eligible because:

- GPS is stale;
- GPS accuracy is worse than the configured threshold;
- courier is outside the restaurant dispatch radius;
- courier is suspended/deactivated/blocked;
- capacity is full;
- another existing dispatch rule excludes the courier.

GPS failure does not automatically flip an explicitly online courier to Offline. The backend continues to exclude stale/inaccurate/out-of-zone couriers from new assignments.

## 4. Management color/status semantics

Restaurant courier operations panel:

- Grey indicator: Offline.
- Green indicator: Online and eligible for dispatch.
- Red indicator: Online but not eligible for dispatch because of a blocking condition.
- Yellow may be used for a non-blocking/transitional warning only if the current feed can represent one unambiguously; otherwise omit it rather than inventing a state.

The text label remains authoritative and shows the concrete reason such as `GPS com pouca precisão`, `GPS desatualizado`, `Fora da zona operacional`, or `Offline`.

Do not derive the indicator only from `Courier.status` when `eligibleForDispatch` says otherwise.

## 5. Logged-in courier identity

Courier app should visibly show the authenticated courier name, with email available in a secondary/account area if useful. The user must be able to tell immediately whether the device is logged in as Luiz, Demo, or another courier.

No duplicate profile store should be introduced; use the existing authenticated user data.

## 6. Alerts and online activation

Browser restrictions mean sound/notification permission cannot be force-enabled.

Desired flow when the courier taps `Ficar online`:

1. Prime/enable the offer alert using the user gesture.
2. Obtain and report fresh high-accuracy GPS.
3. Ask the backend to set Online.
4. If GPS or required browser capabilities fail, keep the courier offline and show the concrete reason.
5. If alert audio cannot be enabled, surface a persistent warning; do not falsely claim alerts are active.

The existing separate alert control can remain as a recovery action if needed, but the main online flow should attempt activation automatically.

## 7. Courier suspension and deactivation

Add an operational account state distinct from document verification.

Recommended model:

- `ACTIVE`: normal behavior.
- `SUSPENDED`: login is allowed so the courier can see the account, but cannot go online or receive offers.
- `DEACTIVATED`: login is blocked until an administrator reactivates the account.

Document verification (`PENDING/APPROVED/REJECTED`) remains separate.

### Safety constraints

- Suspending or deactivating a courier with an active delivery must not orphan the order.
- Admin UI must either prevent the action while an active delivery exists or require the active delivery to be resolved/reassigned first.
- Any outstanding unaccepted offers should be cancelled when suspension/deactivation becomes effective.
- When a suspended/deactivated courier has no active delivery, courier work status should be `OFFLINE`.
- Reactivation does not automatically make the courier Online.

## 8. Restaurant-side operational order cancellation

Restaurant owner/staff should be able to cancel an order from the management app for operational reasons.

### Required behavior

- cancellation requires a non-empty reason;
- order is updated to `CANCELLED` with `cancelledBy`, `cancelledAt`, reason, and status history;
- customer and restaurant receive socket status updates;
- payment refund logic runs where applicable;
- active/offered/queued courier assignments for that order are cancelled transactionally;
- if the cancelled order occupied a courier's current slot, the courier's next accepted queued order is promoted when appropriate;
- if the courier becomes genuinely free, waiting-order dispatch can resume;
- historical assignment rows are preserved and marked cancelled, never deleted.

### Cancellation eligibility

Restaurant-side operational cancellation is allowed before terminal handoff. It must not convert `DELIVERED`, `COLLECTED`, or already `CANCELLED` orders back into another state.

For safety, cancellation during `PICKED_UP` or `OUT_FOR_DELIVERY` should not be a casual one-click restaurant action in this iteration. Those statuses involve food already with the courier and need a separate exception workflow. Therefore restaurant cancellation in this change is limited to:

- `NEW`
- `ACCEPTED`
- `PREPARING`
- `READY_FOR_PICKUP`
- `WAITING_FOR_COURIER`
- `COURIER_ASSIGNED`

This matches the current admin cancellation boundary and avoids introducing an under-specified post-pickup incident process.

## 9. Background / locked-screen behavior

The current browser courier app uses `watchPosition`, periodic reporting, and a forced refresh when the page becomes visible again. Browsers may suspend timers and geolocation in background/locked-screen states.

This change must not claim to solve continuous locked-screen GPS in a PWA.

Instead:

- stale GPS makes the courier non-eligible for new offers;
- the management UI should describe the actual problem (`GPS desatualizado`) rather than implying the courier explicitly chose Offline;
- on foreground/pageshow/network reconnect, refresh GPS immediately as the app already attempts;
- the future native Capacitor app remains the target for reliable background GPS and native push behavior.

## 10. Testing strategy

Use TDD for new behavior and run only affected regression areas plus the full workspace test/build before staging deployment.

Required automated coverage:

- second courier login invalidates first courier session;
- old access token is rejected after replacement, not just old refresh token;
- second-device login preserves an active delivery;
- fresh login without active delivery does not force Online;
- explicit logout from `AVAILABLE` leaves courier `OFFLINE`;
- cannot explicitly go Offline or logout in a way that abandons an active delivery;
- suspended courier cannot go Online or receive dispatch;
- deactivated courier cannot log in;
- reactivated courier remains Offline until explicitly activated;
- restaurant cancellation records reason/history/audit fields;
- cancellation removes outstanding offers/reservations without deleting history;
- cancellation frees/promotes courier capacity correctly;
- terminal orders cannot be cancelled;
- courier operations presentation returns/uses grey/green/red semantics correctly.

Required staging QA:

1. Same courier login on two phones: second phone wins; first phone is expelled.
2. Repeat session replacement during an active delivery and verify the order stays assigned and recoverable on the new phone.
3. Login courier and verify it remains Offline until `Ficar online` is tapped.
4. Verify courier name is clearly visible.
5. Verify Online + good GPS + in-zone = green/elegible.
6. Verify Online + bad/stale/out-of-zone GPS = red/non-eligible, not green.
7. Suspend courier and verify login works but Online is blocked.
8. Deactivate courier and verify login is blocked.
9. Cancel a restaurant order in each materially different pre-handoff stage needed to prove dispatch cleanup and refund handling.
10. Re-run only dispatch/queue tests affected by cancellation/session changes; do not repeat unrelated already-green QA.

## Rollout constraints

- Implement on `feat/courier-operations-hardening` branched from `redesign-vaipizza`.
- No production deployment.
- Staging schema migration only after code/tests are ready and migration is reviewed.
- Staging frontend/API deployment only after automated checks pass.
- Promote reviewed commits to the approved branch only after manual staging QA passes.
- Preserve all order, assignment, earning, and status-history data.