# VAIPIZZA Dispatch GPS Operational Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o despacho de estafetas seguro para operação real com GPS qualificado, raio geográfico próprio, fila/redistribuição robusta e mapa operacional na Gestão.

**Architecture:** O backend centraliza uma política pura de elegibilidade geográfica reutilizada pelo despacho automático e pela reatribuição manual. O app Courier ganha runtime global de localização com watch + heartbeat + recuperação de foreground; a Gestão consulta um endpoint operacional a cada 10 s e visualiza os mesmos dados em Leaflet.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, React 18, React Router, Geolocation API, Leaflet/React-Leaflet, Socket.IO, Vitest/Node test.

**Spec:** `docs/superpowers/specs/2026-09-02-vaipizza-dispatch-gps-operational-design.md`

## Global Constraints

- GPS desatualizado após 120 segundos é inelegível.
- Precisão máxima inicial para despacho automático: 100 metros.
- Raio operacional inicial dos estafetas: 12 km, configurável por restaurante.
- Lisboa pode permanecer online, mas nunca recebe automaticamente nem por reatribuição manual um pedido de Braga se estiver fora do raio.
- Não repetir automaticamente o mesmo estafeta no mesmo pedido.
- Não cancelar comida preparada por falta de estafeta.
- `assignmentRetryCount` é auditoria, não limite fixo.
- Backend é sempre a autoridade de elegibilidade.

---

### Task 1: Política pura de elegibilidade e modelo de dados

**Files:**
- Modify: `apps/api/src/modules/dispatch/dispatch.policy.ts`
- Modify: `apps/api/scripts/dispatch-policy.node-test.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260902123000_courier_dispatch_tracking_v6/migration.sql`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `evaluateCourierGeoEligibility(...)`, `chooseCourierCandidate(...)` with accuracy/radius filtering.
- Produces: Prisma fields `Restaurant.courierDispatchRadiusKm` and `Courier.locationAccuracyM`.

- [ ] **Step 1: Write failing policy tests** for out-of-zone and inaccurate GPS.
- [ ] **Step 2: Run** `node --experimental-strip-types apps/api/scripts/dispatch-policy.node-test.ts` and verify the new tests fail for missing behavior.
- [ ] **Step 3: Implement** geo eligibility using max age, max accuracy and dispatch radius while preserving fairness.
- [ ] **Step 4: Re-run the policy test** and verify all cases pass.
- [ ] **Step 5: Add schema/migration/env fields** with `COURIER_MAX_ACCURACY_METERS=100`.

### Task 2: Backend GPS lifecycle, queue and courier state transitions

**Files:**
- Modify: `apps/api/src/modules/couriers/courier.routes.ts`
- Modify: `apps/api/src/modules/couriers/courier.service.ts`
- Modify: `apps/api/src/modules/dispatch/dispatch.service.ts`
- Modify: `apps/api/src/modules/orders/restaurantOrders.routes.ts`

**Interfaces:**
- Consumes: geo policy from Task 1.
- Produces: `POST /courier/location` with `accuracyM`.
- Produces: `dispatchWaitingOrders()` for immediate oldest-first draining.
- Produces: expanded `/restaurant/orders/couriers/nearby` operational payload.

- [ ] **Step 1: Add backend validation** for lat/lng/accuracy and require fresh+accurate GPS before `online=true`.
- [ ] **Step 2: Persist `locationAccuracyM`** on every location report.
- [ ] **Step 3: Replace fixed retry stop** with per-order exclusion of already-tried couriers plus exhaustion alert only when all known geo-eligible candidates were already tried.
- [ ] **Step 4: Drain queue oldest-first** after sweep, after courier becomes online and after delivery completes.
- [ ] **Step 5: Change courier state** to `GOING_TO_RESTAURANT` on accept/manual assignment, `PICKED_UP` on pickup, `DELIVERING` on out-for-delivery and `AVAILABLE` on delivery.
- [ ] **Step 6: Enforce manual reassign eligibility** server-side and return diagnostic reasons in the courier list.
- [ ] **Step 7: Resolve dispatch alerts** when an assignment is accepted.

### Task 3: Tracking global e resiliente no app Courier

**Files:**
- Modify: `apps/courier/src/hooks/useLocationReporting.ts`
- Create: `apps/courier/src/context/CourierRuntimeContext.tsx`
- Modify: `apps/courier/src/App.tsx`
- Modify: `apps/courier/src/pages/Home.tsx`
- Modify: `apps/courier/src/pages/ActiveDelivery.tsx`

**Interfaces:**
- Produces: `CourierRuntimeProvider`, `useCourierRuntime()`.
- Tracking enabled whenever authenticated courier status is not `OFFLINE`.

- [ ] **Step 1: Make the hook retain the latest `GeolocationPosition`** from `watchPosition`.
- [ ] **Step 2: Add 15 s heartbeat** that resends the latest position even when stationary.
- [ ] **Step 3: Add immediate foreground recovery** using `visibilitychange` + high-accuracy `getCurrentPosition`.
- [ ] **Step 4: Create runtime context** that polls `/courier/me`, owns the tracking hook and survives route changes.
- [ ] **Step 5: Before going online**, Home captures and reports a fresh accurate position, then calls `/courier/online`.
- [ ] **Step 6: Remove page-local tracking from Home** so `/delivery`, `/earnings` and `/history` keep the same global tracker.

### Task 4: Gestão — coordenada real e raio operacional

**Files:**
- Modify: `apps/api/src/modules/restaurants/settings.routes.ts`
- Modify: `apps/restaurant/src/pages/Settings.tsx`
- Create: `apps/restaurant/src/components/RestaurantLocationPicker.tsx`
- Create: `apps/restaurant/src/lib/leafletIcons.ts`
- Modify: `apps/restaurant/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Settings PATCH accepts `lat`, `lng`, `courierDispatchRadiusKm`.
- Picker calls `onChange(lat, lng)`.

- [ ] **Step 1: Extend settings validation** with coordinate ranges and dispatch-radius bounds.
- [ ] **Step 2: Add React-Leaflet dependencies** to Restaurant workspace.
- [ ] **Step 3: Add draggable map picker** centered on the saved restaurant point.
- [ ] **Step 4: Add “Usar a minha localização”** high-accuracy capture in Settings.
- [ ] **Step 5: Add distinct inputs/help copy** for customer delivery radius and courier operational radius.

### Task 5: Gestão — Estafetas ao vivo e reatribuição segura

**Files:**
- Create: `apps/restaurant/src/components/CourierOperationsPanel.tsx`
- Modify: `apps/restaurant/src/pages/OrdersDashboard.tsx`
- Modify: `apps/restaurant/src/index.css`

**Interfaces:**
- Consumes expanded `/restaurant/orders/couriers/nearby` payload.
- Poll interval: 10 seconds.

- [ ] **Step 1: Add panel polling** every 10 s and refresh on order status events.
- [ ] **Step 2: Render Leaflet map** with restaurant pin, dispatch-radius circle, courier pins and GPS accuracy circles.
- [ ] **Step 3: Render operational list** with status, distance, last GPS, accuracy, active order and eligibility reason.
- [ ] **Step 4: Update reassign modal** to disable ineligible/busy couriers and display the reason.

### Task 6: Verification and staging handoff

**Files:**
- Create: `docs/STAGING_DISPATCH_GPS_V6.md`

**Interfaces:**
- Produces exact migration/deploy/test checklist.

- [ ] **Step 1: Run policy tests** and API tests.
- [ ] **Step 2: Run builds** for API, Courier and Restaurant.
- [ ] **Step 3: Run `git diff --check` equivalent** on generated patch files for whitespace/syntax anomalies.
- [ ] **Step 4: Package only changed files** into `VAIPIZZA-V6-dispatch-gps-operacional.zip`.
- [ ] **Step 5: Document staging order:** migration -> API -> Courier -> Restaurant.
- [ ] **Step 6: Require real Braga × Lisboa validation** after deploy, including foreground/background stale-GPS recovery and “Lisboa is the only free courier” negative dispatch test.
