# VAIPIZZA Customer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inherited marketplace-like customer experience with a single-store VAIPIZZA experience: cinematic brand homepage, permanent `/pedir` order route, fast menu/product flow, and responsive navigation without changing the backend order contract.

**Architecture:** Keep the existing React/Vite app, API endpoints, auth, cart and product-modifier logic. Add a small single-store brand/config layer, render the existing restaurant menu directly at `/pedir`, retain `/restaurants/:slug` as a compatibility alias, and redesign customer-facing components with CSS that isolates cinematic effects to the public homepage.

**Tech Stack:** React 18, React Router 6, TypeScript, Vite, Playwright, existing Axios/Socket.IO client.

**Spec:** `docs/superpowers/specs/2026-08-31-vaipizza-visual-functional-design.md`

## Global Constraints

- Keep `vaipizza-atual` behavior recoverable; all work belongs to `redesign-vaipizza`.
- Do not modify API contracts in this phase.
- Do not add Three.js/GSAP to the critical ordering bundle in this phase.
- Use the existing VAIPIZZA logo asset at `/apple-touch-icon.png`.
- Preserve `/restaurants/:slug` as a compatibility route.
- Homepage may animate; checkout/menu operational surfaces must remain lightweight.
- Respect `prefers-reduced-motion`.
- Desktop and mobile are first-class targets.

---

### Task 1: Single-store brand configuration

**Files:**
- Create: `apps/customer/src/config/vaipizza.ts`
- Create: `apps/customer/tests/vaipizza-config.test.ts`

**Interfaces:**
- Produces: `VAIPIZZA`, `resolvePrimaryRestaurant<T extends { slug: string }>(restaurants: T[]): T | null`

- [x] Write a failing Node test for selecting the `vaipizza` restaurant and falling back safely.
- [x] Run with Node TypeScript stripping and verify failure because the module does not exist.
- [x] Implement the minimal config/helper.
- [x] Re-run the test and verify pass.

### Task 2: Public homepage and `/pedir`

**Files:**
- Modify: `apps/customer/src/App.tsx`
- Replace: `apps/customer/src/pages/Home.tsx`
- Modify: `apps/customer/src/pages/RestaurantMenu.tsx`
- Modify: `apps/customer/e2e/main-flow.spec.ts`

**Interfaces:**
- `/` is the cinematic homepage.
- `/pedir` renders the primary restaurant menu without URL redirection.
- `/restaurants/:slug` continues to render the same menu component.

- [x] Update E2E expectations to login into `/pedir`.
- [x] Add optional `restaurantSlug` prop to `RestaurantMenu` while retaining `useParams()` fallback.
- [x] Add `/pedir` route using the configured VAIPIZZA slug.
- [x] Replace `Home` redirect with a real single-store landing page using public restaurant data.
- [x] Change post-login navigation to `/pedir`.

### Task 3: Customer navigation shell

**Files:**
- Replace: `apps/customer/src/components/Layout.tsx`
- Modify: `apps/customer/src/components/NavIcons.tsx`
- Modify: `apps/customer/src/index.css`

**Interfaces:**
- Desktop uses a premium top bar, not the inherited marketplace sidebar.
- Mobile uses a compact top bar plus bottom navigation.
- Homepage suppresses operational navigation so the hero remains cinematic.

- [x] Build a route-aware top navigation.
- [x] Keep cart count and auth state behavior intact.
- [x] Repoint logo usage to `/apple-touch-icon.png` so the removed `/logo.png` cannot 404.
- [x] Add a dedicated menu icon and accessibility labels.

### Task 4: Order menu visual redesign

**Files:**
- Modify: `apps/customer/src/pages/RestaurantMenu.tsx`
- Modify: `apps/customer/src/index.css`

**Interfaces:**
- Keep API fetch and modifier behavior unchanged.
- Use compact order hero, sticky category rail, responsive cards, and obvious service status.

- [x] Restructure hero copy and service chips.
- [x] Keep all categories rendered for scrollspy.
- [x] Redesign product cards for faster scanning on mobile and richer grid on desktop.
- [x] Keep existing ProductModal callbacks and toast behavior.

### Task 5: Product modal polish

**Files:**
- Modify: `apps/customer/src/components/ProductModal.tsx`
- Modify: `apps/customer/src/index.css`

**Interfaces:**
- Preserve exact modifier selection/pricing logic.
- Mobile uses a near-full-height bottom sheet with a sticky purchase action.

- [x] Add clearer product header/price hierarchy.
- [x] Add selected-state containers around modifiers without altering form inputs.
- [x] Add sticky action/footer behavior.
- [x] Keep auth requirement unchanged for this visual phase.

### Task 6: Verification and handoff

**Files:**
- Review all changed customer files.

- [x] Run pure Node config test.
- [ ] Run TypeScript/build if dependencies are available.
- [x] If dependencies are unavailable in the sandbox, document exact local commands for verification.
- [x] Package the modified project for local `npm` testing.
