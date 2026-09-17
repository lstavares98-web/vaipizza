# VaiPizza Assisted Orders + Install App Design

## Goal

Add a safe restaurant-assisted order flow for phone and counter orders without creating fake customer accounts, while fixing the customer PWA install action so it remains discoverable whenever the app is not already installed.

## Constraints

- Production remains untouched. All implementation and QA happen on feature branch and staging first.
- Existing customer checkout, KDS, dispatch, cash settlement and courier workflows must continue unchanged for APP orders.
- Restaurant staff must never invent or know a customer's password.
- A phone/counter order created for an existing registered customer should appear in that customer's normal order history.
- A non-registered phone customer is stored as an operational contact, not as a login account.
- Anonymous counter pickup is allowed. Delivery always requires customer identity, phone and a geocoded delivery point.
- Historical order data is immutable even if a contact or address is edited later.
- No duplicate GPS/dispatch subsystem is introduced.

## 1. Order source and customer identity

Add `OrderSource` with `APP`, `PHONE`, and `COUNTER`.

`Order.userId` becomes optional so an operational contact or anonymous counter order does not need a synthetic User. Existing APP checkout still requires a real `userId` at service level.

Add `CustomerContact` scoped to a restaurant:

- `id`
- `restaurantId`
- `name`
- `phone`
- `phoneNormalized`
- timestamps
- unique `(restaurantId, phoneNormalized)`

Add `CustomerContactAddress` for reusable phone-order addresses:

- `id`
- `customerContactId`
- `label`
- `line1`, `line2`, `city`, `postalCode`
- `lat`, `lng`
- `isDefault`
- `createdAt`

The contact is deliberately not a login account and has no password/email requirement.

## 2. Order audit snapshots

Add fields to Order:

- `source OrderSource @default(APP)`
- `customerContactId String?`
- `createdByStaffId String?`
- `customerNameSnapshot String?`
- `customerPhoneSnapshot String?`
- `deliveryAddressSnapshot Json?`

`deliveryAddressSnapshot` stores the exact address text and coordinates used for the order so history never changes after later contact edits.

For registered customers, the order still uses `userId` and existing `addressId`; snapshots may also be filled for consistent restaurant/courier presentation.

Invariants enforced by service code:

- APP: `userId` required, `source=APP`, no staff creator.
- PHONE: `createdByStaffId` required and either `userId` or `customerContactId` required.
- COUNTER pickup: customer identity optional.
- COUNTER delivery: same identification/address rules as PHONE.

## 3. Customer search

Add a restaurant-only endpoint that receives a phone number and normalizes it to digits.

Search order:

1. Registered CUSTOMER users whose stored phone matches after normalization.
2. Restaurant-scoped `CustomerContact` records.
3. No match -> allow creation of a new operational contact.

If more than one registered user matches the normalized phone, return all matching candidates instead of silently selecting one.

Result cards show name, phone and saved addresses. For an existing registered user, selecting the customer preserves `userId`, so assisted orders appear in that account's normal history.

## 4. New order flow in Gestão

Add `+ Novo pedido` in the restaurant application and a protected route `/new-order`.

Step 1 — Source:

- Telefone
- Balcão

Step 2 — Customer:

- Phone flow begins with phone search.
- Existing account -> select customer + saved address.
- Existing operational contact -> select contact + saved address.
- No match -> quick form for name + phone; create operational contact.
- Counter pickup additionally offers `Cliente não identificado`.

Step 3 — Basket:

Use the restaurant's existing catalog endpoints. Show only available products/active combos. Support quantities, modifiers, split products, combo selections and notes. Pricing is always recomputed by the API; frontend totals are only previews.

Step 4 — Fulfillment/payment:

- Delivery or Takeaway.
- Delivery requires a confirmed geocoded address and applies the same delivery-radius and delivery-fee rules as customer checkout.
- Payment uses existing supported methods and existing MB WAY confirmation/cash-change rules.

Step 5 — Create:

The API validates products, availability, modifiers/combo selections, pricing, range, delivery fee and cash change, then creates a normal `NEW` order with source/audit fields. From that point onward it follows the existing Gestão -> KDS -> dispatch/courier state machine.

## 5. Assisted delivery geocoding

Existing registered customers can reuse saved coordinates.

For a new operational contact, staff types the address and uses `Localizar morada`. Add a provider-abstracted forward-geocoding endpoint configured by environment variable. The service returns one or more candidate addresses with coordinates; staff confirms the correct result before creating the order.

A delivery cannot be created without coordinates because delivery radius, fee and courier routing depend on them. Provider failure does not corrupt data; the UI keeps the draft and asks the operator to retry/edit or switch to pickup.

## 6. Presentation compatibility

Restaurant/KDS/courier-facing order payloads must expose a unified customer/address presentation regardless of whether the source is APP, PHONE or COUNTER.

For nullable `userId`, socket emissions to customer rooms are guarded. Registered assisted orders still emit to the customer's room; unregistered/anonymous orders do not.

Restaurant order cards show a compact source badge: `App`, `Telefone`, or `Balcão`.

## 7. Install app visibility fix

Current behavior hides the button on non-iOS browsers until `beforeinstallprompt` fires. Replace that with discoverable behavior:

- If already running in installed/standalone mode: hide the action.
- iPhone/iPad Safari: always show `Instalar app`; click opens `Partilhar -> Adicionar ao ecrã principal` instructions.
- Android/Chromium with `beforeinstallprompt`: click invokes native install prompt.
- Other browsers / Chromium before the prompt is available: keep the button visible and show a concise browser-specific/manual installation guide instead of returning `null`.

No backend changes are required for the install-button fix.

## 8. Security and privacy

- Restaurant endpoints require authenticated `RESTAURANT_OWNER` or `RESTAURANT_STAFF` and are scoped to `req.auth.restaurantId`.
- A restaurant can only read/create its own `CustomerContact` records.
- Registered user lookup returns only operationally required fields: id, name, phone, saved addresses.
- No password hash, email secret, token or unrelated customer data is exposed.
- Anonymous counter orders cannot be used to access customer history.

## 9. Testing

Automated coverage must include:

- phone normalization and contact de-duplication;
- registered customer found by phone and order linked to `userId`;
- new phone contact created without User/password;
- anonymous counter pickup accepted;
- anonymous delivery rejected;
- assisted delivery outside radius rejected;
- pricing/modifier/combo parity with normal checkout rules;
- nullable-customer socket emissions do not crash;
- APP checkout regression remains green;
- install button visibility matrix for standalone/iOS/native-prompt/manual-fallback states.

After CI is green, deploy only to staging and manually test: registered phone customer, new phone customer, anonymous counter pickup, assisted delivery address/geocode, KDS progression, courier delivery, customer history for a registered user, and install action on iPhone/Android/desktop Chromium.

## 10. Out of scope

- Automatic merging of old operational contacts into a newly registered account. The data model keeps this possible later, but this phase does not perform automatic identity merging.
- Loyalty/CRM automation.
- Repeating a previous order with one click.
- Route-batching/dispatch clustering discussed separately.
- Production rollout before staging QA and the existing production-readiness checkpoint.