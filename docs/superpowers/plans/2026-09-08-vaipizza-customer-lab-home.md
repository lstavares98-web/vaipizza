# VaiPizza Customer Lab Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first isolated VaiPizza customer-lab home with a bright delivery-brand visual while preserving all existing ordering logic.

**Architecture:** Duplicate the existing customer app into `apps/customer-lab`, keep all contexts/routes/API integrations intact, and replace only the home presentation layer. A dedicated `lab-home.css` scopes the experimental visual system so the production customer stylesheet is not refactored.

**Tech Stack:** React 18, Vite 6, TypeScript, React Router, existing VaiPizza API/contexts.

**Spec:** `docs/superpowers/specs/2026-09-08-vaipizza-customer-lab-home-design.md`

## Global Constraints
- Do not modify `apps/customer`.
- Do not modify API, Prisma schema, checkout, payments, order state machine, KDS, courier, restaurant or admin behavior.
- Lab development server uses port `3100`.
- Reuse existing `RestaurantMenu`, `ProductModal`, `ComboModal`, `CartContext`, `AuthContext` and API client.
- Do not add Next.js, Zustand or another state-management framework.

---

### Task 1: Establish isolated lab identity

**Files:**
- Modify: `apps/customer-lab/package.json`

**Interfaces:**
- Consumes: npm workspace discovery via root `apps/*`.
- Produces: workspace `@yummix/customer-lab`, dev/preview port 3100.

- [ ] **Step 1: Make the lab package identity distinct**

Set:
```json
"name": "@yummix/customer-lab"
```

Set scripts:
```json
"dev": "vite --port 3100",
"preview": "vite preview --port 3100"
```

- [ ] **Step 2: Verify workspace build discovery**

Run:
```bash
npm run build -w apps/customer-lab
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 3: Commit**

```bash
git add apps/customer-lab/package.json
git commit -m "chore: configure customer lab workspace"
```

### Task 2: Add a failing home-contract test

**Files:**
- Create: `apps/customer-lab/e2e/lab-home.spec.ts`

**Interfaces:**
- Consumes: customer-lab dev server and rendered Home route `/`.
- Produces: contract for the new hero/service/offers experience.

- [ ] **Step 1: Write the failing Playwright test**

```ts
import { expect, test } from "@playwright/test";

test("shows the new VaiPizza delivery-first home", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /pizza que dá vontade/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /como quer receber/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /ofertas vaipizza/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /pedir agora/i }).first()).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify RED**

Run the API and lab, then:
```bash
npm run test:e2e -w apps/customer-lab -- lab-home.spec.ts
```

Expected: FAIL because the current cinematic home does not contain the new heading/regions.

- [ ] **Step 3: Commit the red test**

```bash
git add apps/customer-lab/e2e/lab-home.spec.ts
git commit -m "test: define customer lab home contract"
```

### Task 3: Implement the delivery-first home

**Files:**
- Modify: `apps/customer-lab/src/pages/Home.tsx`
- Create: `apps/customer-lab/src/lab-home.css`

**Interfaces:**
- Consumes: `resolvePrimaryRestaurant`, `VAIPIZZA`, `useAuth`, `api`, `RestaurantMenu`, `FranchiseModal`.
- Produces: a new home presentation while still rendering `<RestaurantMenu restaurantSlug={VAIPIZZA.slug} embedded />`.

- [ ] **Step 1: Replace only the Home presentation**

Keep the existing data-loading effect and restaurant state. Build sections with these stable selectors/content:
- root `.lab-home`;
- hero heading containing `Pizza que dá vontade`;
- `section[aria-label="Como quer receber"]`;
- `section[aria-label="Ofertas VaiPizza"]`;
- hero CTA text `Pedir agora` linking to `#menu-home`;
- embedded existing `RestaurantMenu` after the promotional sections.

- [ ] **Step 2: Add scoped lab CSS**

Create `lab-home.css` with styles rooted in `.lab-home`/`.lab-*` only. Use CSS gradients, layout, typography, rounded promotional cards and responsive breakpoints. Do not edit the existing shared `index.css`.

- [ ] **Step 3: Verify GREEN**

Run:
```bash
npm run test:e2e -w apps/customer-lab -- lab-home.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Verify build**

Run:
```bash
npm run build -w apps/customer-lab
```

Expected: PASS.

- [ ] **Step 5: Run repository regression tests**

Run:
```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-lab/src/pages/Home.tsx apps/customer-lab/src/lab-home.css
git commit -m "feat: add delivery-first customer lab home"
```

### Task 4: Visual/manual acceptance

**Files:** none.

**Interfaces:**
- Consumes: lab at `http://localhost:3100` and existing API.
- Produces: human approval before redesigning product/modal surfaces.

- [ ] **Step 1: Start the lab**

```bash
npm run dev:api
npm run dev -w apps/customer-lab
```

- [ ] **Step 2: Check desktop and mobile**

Verify:
- hero has strong VaiPizza delivery identity;
- status/opening-hours content appears when API data loads;
- delivery/takeaway section is visible;
- offers section is visible;
- `Pedir agora` scrolls to the real menu;
- product cards and existing customization modal still work;
- cart flow still works.

- [ ] **Step 3: Stop here for design review**

Do not redesign `ProductModal` until this home is accepted.