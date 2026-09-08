# VaiPizza Customer Lab Home Design

## Goal
Create an isolated, high-energy customer-facing home for `apps/customer-lab` inspired by large pizza delivery brands, while keeping the existing VaiPizza API, cart, checkout, order flow, KDS, courier, restaurant and admin behavior unchanged.

## Isolation
- `apps/customer` remains untouched.
- All visual work in this phase lives under `apps/customer-lab`.
- The lab runs on port `3100`.
- The lab consumes the same VaiPizza API and existing `CartContext`/product customization flow.

## Experience direction
The home should feel commercial, cheerful and immediate rather than cinematic or gourmet-serious.

### Hero
- Warm cream/yellow background with strong red accents.
- Large pizza/restaurant imagery as the main visual focus.
- Clear headline: pizza-first, delivery-first language.
- Primary CTA scrolls to the real menu.
- Secondary CTA supports browsing offers/menu.
- Visible store status and current opening hours when available.

### Service choice
Show delivery and takeaway/recolha as prominent service cards/chips. In this phase they are informative and scroll users to the existing menu/checkout flow; they do not create new order-state logic.

### Offers
Show a promotional strip/area before the full menu using existing restaurant information and campaign-style copy. Do not introduce new backend promo models in this phase.

### Menu handoff
Continue rendering the existing `RestaurantMenu` component embedded on the home. This preserves:
- real restaurant/category/product data;
- combo and product modals;
- modifiers, size, dough, extras and ingredient removal;
- current `CartContext`;
- cart summary and checkout path.

### Mobile
- Hero stacks vertically.
- CTAs remain large and thumb-friendly.
- Service cards are visible above the menu.
- Existing mobile cart bar remains functional.

## Technical approach
- Replace only `apps/customer-lab/src/pages/Home.tsx` markup for the home sections.
- Add a dedicated `apps/customer-lab/src/lab-home.css` stylesheet imported by the lab Home, so the large existing `index.css` remains untouched.
- Keep `RestaurantMenu` and `ProductModal` logic unchanged in this first phase.
- Change `apps/customer-lab/package.json` name and ports only for lab identity.

## Non-goals
- No API changes.
- No database/schema changes.
- No checkout changes.
- No payment changes.
- No order state changes.
- No KDS/courier/admin changes.
- No new state-management library.
- No Next.js migration.

## Success criteria
1. `apps/customer` has no diff.
2. `apps/customer-lab` starts independently on port 3100.
3. The home visibly differs from the current cinematic design and has a brighter delivery-brand feel.
4. Clicking into the menu/product flow still uses the existing VaiPizza components and routes.
5. The lab builds successfully and the existing repository tests continue to pass.