# Pickup, MB WAY and Next Delivery — Approved Design

Date: 2026-09-14

## Goal

Improve the real restaurant operation in staging before native courier work by implementing three approved behaviours: pickup-ready customer notification, manual MB WAY confirmation, and one queued next delivery for a busy courier.

## 1. Pickup

- Existing `PICKUP`, `READY_FOR_PICKUP` and `COLLECTED` states remain the source of truth.
- When a pickup order reaches `READY_FOR_PICKUP`, the customer order screen must prominently show that it is ready to collect.
- Gestão must provide a WhatsApp action with a prefilled ready-for-pickup message when the customer has a phone number.
- Gestão must provide a `Recolhido` action that moves a pickup order from `READY_FOR_PICKUP` to `COLLECTED`.
- WhatsApp is an additional convenience only; the in-app state must work without it.

## 2. MB WAY manual confirmation

- Each restaurant can configure a dedicated MB WAY phone number, independent from the general contact/WhatsApp phone.
- A customer choosing `MBWAY` creates an order in `paymentStatus=PENDING` and can see the configured MB WAY number and exact order total in order detail.
- The customer can open the restaurant WhatsApp with a prefilled proof-of-payment message. The user must attach the screenshot manually.
- Gestão must visibly distinguish `MBWAY/PENDING` from `MBWAY/PAID`.
- The backend must reject restaurant acceptance/preparation of an MB WAY order while it is still `PENDING`.
- Restaurant staff can explicitly confirm an MB WAY order as paid. This changes `paymentStatus` to `PAID` and emits the existing payment update event.
- No screenshot or WhatsApp action automatically marks payment as paid.
- Cash and terminal flows are not blocked by this rule.

## 3. Next delivery reservation

- A courier may have at most one active delivery plus one accepted next delivery reservation.
- Free, geo-eligible couriers keep priority. A busy courier is considered for a queued offer only when no free eligible courier can receive the waiting order.
- A queued offer is presented to the courier while the active order remains the current job.
- Accepting the queued offer reserves that order for the courier without replacing the active order.
- When the active order reaches `DELIVERED`, the reserved next order is automatically promoted to the active courier workflow.
- A courier cannot reserve more than one next order.
- Rejection/expiration frees the queued offer without disturbing the active delivery.
- Existing GPS freshness, accuracy, verification and dispatch-zone rules still apply.

## Safety constraints

- Work only on staging/feature branches until QA is green.
- Do not modify production during this feature implementation.
- Preserve existing order, courier and payment behaviour outside the approved changes.
- Keep existing strict CSP and concurrency protections.
- Apply DB migration to staging only after code/tests are ready.
