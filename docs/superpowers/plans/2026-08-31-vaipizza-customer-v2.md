# VAIPIZZA Customer V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the VAIPIZZA customer experience premium and conversion-first: keep the cinematic hero, expose the full menu immediately below it, improve typography/colors/product cards/product sheet/cart, and add real hours/contact details.

**Architecture:** Preserve the existing React/Vite customer app and API contracts. Add an embedded mode to the existing `RestaurantMenu` so the same functional catalog powers both `/` and `/pedir`, avoiding duplicate ordering logic. Add a small pure store-hours formatter for the weekly schedule and keep the order route as the direct deep link.

**Tech Stack:** React 18, TypeScript, React Router, Axios, existing CartContext, Vite CSS.

**Spec:** `/mnt/data/VAIPIZZA_VISUAL_FUNCTIONAL_DESIGN_SPEC.md`

## Global Constraints
- Single-store public experience: the customer never chooses a restaurant.
- Cinematic effects only on the public hero; ordering remains lightweight.
- Mobile ordering is the primary experience.
- No new runtime dependency for this iteration.
- Preserve `/pedir` and legacy `/restaurants/:slug` compatibility.
- Use the official VAIPIZZA logo and its deep green/red/cream/gold palette.

---

### Task 1: Weekly store-hours presentation
**Files:**
- Create: `apps/customer/src/lib/storeHours.ts`
- Create: `apps/customer/tests/storeHours.test.ts`

**Interfaces:**
- Produces: `formatWeeklyHours(hours)` returning display rows with day, time and closed state.

- [ ] Write failing tests for day labels, closed days and time ranges.
- [ ] Verify failure because the helper does not exist.
- [ ] Implement the helper.
- [ ] Compile/run the focused tests and verify green.

### Task 2: Embedded ordering catalog on the homepage
**Files:**
- Modify: `apps/customer/src/pages/Home.tsx`
- Modify: `apps/customer/src/pages/RestaurantMenu.tsx`

**Interfaces:**
- `RestaurantMenu({ restaurantSlug, embedded?: boolean })`
- Homepage primary CTA scrolls to `#menu-home`.

- [ ] Add `embedded` mode to reuse the real menu without the secondary order hero.
- [ ] Place it immediately after the cinematic hero.
- [ ] Move brand-story content below the catalog.
- [ ] Keep `/pedir` as a full ordering route.

### Task 3: Editorial menu, sticky categories and premium product cards
**Files:**
- Modify: `apps/customer/index.html`
- Modify: `apps/customer/src/index.css`
- Modify: `apps/customer/src/pages/RestaurantMenu.tsx`

- [ ] Add internal editorial/UI font families without changing the cinematic hero identity.
- [ ] Refine internal colors from the official logo.
- [ ] Make product photography dominant and cards editorial on mobile/desktop.
- [ ] Keep category navigation sticky and finger-friendly.
- [ ] Add a desktop order rail only to `/pedir`, hidden in embedded/mobile contexts.

### Task 4: Product sheet and cart presentation
**Files:**
- Modify: `apps/customer/src/components/ProductModal.tsx`
- Modify: `apps/customer/src/index.css`
- Modify: `apps/customer/src/pages/RestaurantMenu.tsx`

- [ ] Split product image/options visually on desktop and keep bottom-sheet behavior on mobile.
- [ ] Keep one dominant add-to-order CTA with live total.
- [ ] Keep mobile cart bar fixed and create a compact desktop cart summary.

### Task 5: Hours, contact and trust footer
**Files:**
- Modify: `apps/customer/src/pages/RestaurantMenu.tsx`
- Modify: `apps/customer/src/index.css`

- [ ] Render weekly hours from real API `hours` data.
- [ ] Render address, phone, WhatsApp/contact CTA.
- [ ] Keep contact information below the menu rather than before products.

### Task 6: Verification package
**Files:**
- Modify: `REDESIGN_CUSTOMER_V2.md`

- [ ] Run focused tests.
- [ ] Run TypeScript/build if dependency installation is complete.
- [ ] Run static reference and syntax checks otherwise, explicitly reporting any unverified item.
- [ ] Produce full and patch ZIPs for local testing.
