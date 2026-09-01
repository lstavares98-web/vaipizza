# VAIPIZZA Combos, Franquias, Admin e Relatórios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar combos configuráveis, captação de franquias com e-mail + Admin, simplificar o Admin para uma única instalação e exportar relatórios CSV sem quebrar o fluxo de pedidos existente.

**Architecture:** Combos são entidades próprias ligadas ao restaurante, com itens fixos e grupos de escolha. Carrinho e pedido ganham suporte a linhas de combo com snapshot JSON das escolhas. Franquias entram por endpoint público rate-limited, são gravadas antes do envio SMTP e geridas pelo Admin. O Admin continua tecnicamente compatível com o backend existente, mas a UI deixa de expor multi-restaurante.

**Tech Stack:** React 18, TypeScript, Vite, Express, Prisma/PostgreSQL, Zod, Axios, Cloudinary, Node TLS SMTP, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-vaipizza-combos-franquias-admin-reports-design.md`

## Global Constraints

- Uma instalação corresponde a uma pizzaria; não criar multi-tenant novo.
- Admin técnico controla `Combos ON/OFF`; Gestão controla CRUD completo de combos.
- Combos e franquias usam autorização backend; não confiar em `restaurantId` vindo do frontend.
- Formulário de franquia: Nome, Telefone, E-mail, Cidade/Região, Mensagem; salvar antes de tentar e-mail.
- Destino de notificação configurado por `FRANCHISE_NOTIFY_EMAIL`, com `vaipizzapt@gmail.com` no staging/produção.
- Não criar páginas longas: listas compactas + modal/drawer.
- Exportar CSV na tela de relatórios atual, respeitando filtros ativos.
- RLS continua fechado para acesso público direto; API/Prisma é a camada de dados.

---

### Task 1: Modelo Prisma e regras puras de Combo

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/modules/combos/combo.rules.ts`
- Create: `apps/api/src/modules/combos/combo.rules.test.ts`
- Modify: `packages/validation/src/index.ts`

**Interfaces:**
- Produces: `isComboScheduleAvailable(combo, now, timeZone)`, `validateComboSelection(combo, selection)`, `priceCombo(combo, selection)`, schemas `comboInputSchema` e `addComboToCartSchema`.

- [ ] Write failing Vitest cases for schedule, required group counts, unavailable option and price deltas.
- [ ] Run `npm test -w apps/api -- combo.rules.test.ts` and confirm failure.
- [ ] Add Prisma models `Combo`, `ComboFixedItem`, `ComboGroup`, `ComboGroupOption`, nullable combo support on `CartItem` and `OrderItem`, `comboSelections`/snapshot JSON fields, `Restaurant.combosEnabled`, and `FranchiseLead`/status enum.
- [ ] Add Zod schemas with exact constraints: combo name 1..120, description <=2000, nonnegative prices, days 0..6, HH:MM strings, groups min/max, option product IDs and deltas; add-to-cart combo selection uses `{groupId, optionIds[]}` and quantity 1..50.
- [ ] Implement pure rules and make tests pass.
- [ ] Commit model/rules as one unit.

### Task 2: Gestão/API de Combos + feature flag

**Files:**
- Create: `apps/api/src/modules/combos/combos.service.ts`
- Create: `apps/api/src/modules/combos/combos.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/restaurants/restaurants.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`

**Interfaces:**
- Produces management endpoints `GET/POST /api/restaurant/combos`, `PATCH/DELETE /api/restaurant/combos/:id`; public `GET /api/restaurants/:slug/combos`; admin `GET/PATCH /api/admin/features`.

- [ ] Add service tests around ownership and public visibility using mocked Prisma boundaries where practical.
- [ ] Implement management CRUD deriving restaurant from `req.auth.restaurantId` only.
- [ ] Validate every referenced product belongs to the same restaurant; replace nested fixed items/groups/options transactionally on update.
- [ ] Implement public query that returns only active/scheduled/satisfiable combos when `restaurant.combosEnabled=true`.
- [ ] Implement single-installation feature read/update using the approved restaurant as installation target and only `SUPER_ADMIN` route access.
- [ ] Mount routes and run API tests.

### Task 3: Carrinho, checkout e snapshots de Combo

**Files:**
- Modify: `apps/api/src/modules/cart/cart.routes.ts`
- Modify: `apps/api/src/modules/cart/cart.service.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `apps/customer/src/context/CartContext.tsx`
- Modify: `apps/customer/src/pages/Cart.tsx`
- Modify: `apps/customer/src/pages/OrderDetail.tsx`
- Modify: `apps/restaurant/src/pages/OrdersDashboard.tsx`
- Modify: `apps/kds/src/pages/KdsBoard.tsx`

**Interfaces:**
- Produces `POST /api/cart/combo-items`; cart view items include `kind`, combo name/image and `comboSelections`; order item snapshot includes immutable combo selections.

- [ ] Add failing tests for combo cart pricing and checkout snapshot helpers.
- [ ] Add combo cart endpoint using `addComboToCartSchema`.
- [ ] Revalidate combo availability/selection and compute combo price server-side; never trust frontend price.
- [ ] Make `getCartView` return a discriminated product/combo line without changing existing product behavior.
- [ ] Checkout snapshots combo name, selected product names/quantities/deltas and unit price; update auto-prep calculation to tolerate `product=null` and derive selected combo products when possible.
- [ ] Render combo composition in Cart, Order Detail, Gestão order cards and KDS tickets.
- [ ] Run regression tests for ordinary product cart/checkout.

### Task 4: Gestão UI de Combos

**Files:**
- Create: `apps/restaurant/src/pages/Combos.tsx`
- Create: `apps/restaurant/src/components/ComboForm.tsx`
- Modify: `apps/restaurant/src/App.tsx`
- Modify: `apps/restaurant/src/components/Layout.tsx`
- Modify: `apps/restaurant/src/index.css`

**Interfaces:**
- Consumes combo CRUD endpoints, product list and existing `/api/uploads`.

- [ ] Add route/nav `Combos` without expanding mobile nav beyond usable limits.
- [ ] Build compact list with image, name, price, state, edit/pause/remove actions.
- [ ] Build modal editor for photo upload/removal, price/compare price, active/featured, validity, days/hours, fixed products and groups/options with price deltas.
- [ ] Prevent saving invalid min/max or empty required groups before request; backend remains authoritative.
- [ ] Verify desktop/mobile layout and TypeScript build.

### Task 5: Cliente UI de Combos

**Files:**
- Create: `apps/customer/src/components/ComboModal.tsx`
- Modify: `apps/customer/src/pages/RestaurantMenu.tsx`
- Modify: `apps/customer/src/index.css`

**Interfaces:**
- Consumes public combos endpoint and `CartContext.addComboItem`.

- [ ] Fetch combos alongside restaurant menu.
- [ ] Show `Combos` category/cards only when response has available combos.
- [ ] Implement modal selection state, required-group completion and price preview from returned deltas.
- [ ] Submit only IDs/quantity; server recomputes price.
- [ ] Preserve login-before-add behavior.
- [ ] Build customer app.

### Task 6: Franquias — API, SMTP e Admin

**Files:**
- Create: `apps/api/src/modules/franchise/franchise.routes.ts`
- Create: `apps/api/src/modules/franchise/franchise.service.ts`
- Create: `apps/api/src/services/smtp.service.ts`
- Create: `apps/api/src/modules/franchise/franchise.test.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Create: `apps/admin/src/pages/Franchises.tsx`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/Layout.tsx`
- Modify: `apps/admin/src/index.css`

**Interfaces:**
- Produces public `POST /api/franchise`; admin `GET /api/admin/franchises`, `PATCH /api/admin/franchises/:id`; SMTP `sendMail({to, subject, text})`.

- [ ] Write failing tests proving lead persists before e-mail attempt and SMTP failure does not reject an already stored lead.
- [ ] Add strict form validation and dedicated rate limiter (5 submissions / 15 minutes / IP).
- [ ] Implement secure SMTP over TLS (default port 465) using env only; skip sending cleanly when SMTP is unconfigured in local/test.
- [ ] Store lead, attempt notification, log only safe failure metadata, return 201 once stored.
- [ ] Add Admin compact lead list and detail modal with NEW/CONTACTED/ARCHIVED status actions.
- [ ] Run API/admin builds.

### Task 7: Cliente “Seja um franqueado”

**Files:**
- Create: `apps/customer/src/components/FranchiseModal.tsx`
- Modify: `apps/customer/src/pages/Home.tsx`
- Modify: `apps/customer/src/index.css`

**Interfaces:**
- Consumes `POST /api/franchise`.

- [ ] Add compact CTA near page end and footer button, not in primary purchase path.
- [ ] Modal fields exactly: Nome, Telefone, E-mail, Cidade/Região, Mensagem.
- [ ] Implement pending/success/error states; on success clear form and show confirmation.
- [ ] Verify keyboard close/focus basics and mobile sizing.

### Task 8: Admin single-installation simplification

**Files:**
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/Layout.tsx`
- Modify: `apps/admin/src/pages/Dashboard.tsx`
- Create: `apps/admin/src/pages/Features.tsx`
- Modify: `apps/admin/src/pages/Orders.tsx`

**Interfaces:**
- Consumes `GET/PATCH /api/admin/features` and dashboard installation metadata.

- [ ] Remove `Restaurantes` navigation/route from visible Admin UI while leaving legacy backend endpoints untouched.
- [ ] Dashboard shows one installation identity instead of restaurant count/pending restaurants.
- [ ] Add compact `Funcionalidades` page/card with Combos ON/OFF.
- [ ] Remove Restaurant column from Admin Orders visual table because installation is singular.
- [ ] Build admin app.

### Task 9: Exportar CSV nos Relatórios

**Files:**
- Create: `apps/restaurant/src/lib/reportCsv.ts`
- Create: `apps/restaurant/tests/reportCsv.test.ts`
- Modify: `apps/restaurant/src/pages/Reports.tsx`
- Modify: `apps/restaurant/package.json` only if test runner already present; otherwise test helper through existing project tooling without adding dependency.

**Interfaces:**
- Produces `buildReportCsv(report, {from,to})` returning UTF-8 CSV string.

- [ ] Write tests for escaping quotes/commas, PT-PT headers and filtered date metadata.
- [ ] Implement CSV with BOM, summary rows, top products and modifier groups from the displayed report.
- [ ] Add `Exportar CSV` button enabled only after report exists; filename `vaipizza-relatorio-YYYY-MM-DD-a-YYYY-MM-DD.csv`.
- [ ] Verify downloaded content manually in browser.

### Task 10: Migration, full verification and staging handoff

**Files:**
- Create: `docs/STAGING_COMBOS_FRANCHISE_V5.md`
- Modify: `docs/COMBOS_BACKLOG.md` to mark implemented scope and leave future enhancements only.

**Interfaces:**
- Produces SQL migration equivalent to Prisma schema and deployment checklist.

- [ ] Generate/review SQL for additive tables/columns and indexes; no destructive drops.
- [ ] Run API unit tests, TypeScript syntax/build checks for customer/restaurant/admin/kds/courier, and existing dispatch tests.
- [ ] Run `npm audit` report only; do not use `--force` automatically.
- [ ] Apply migration to Supabase staging only after code verification.
- [ ] Deploy API, verify `/health`, then deploy changed frontends.
- [ ] Test: feature flag OFF hides combos; ON shows; create/edit/photo combo; combo cart/order/KDS; franchise form persists and e-mail path; Admin status; CSV export; ordinary product order flow.
- [ ] Commit/package patch and document exact Render SMTP env variables without secrets.
