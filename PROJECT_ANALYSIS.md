# Yummix — Análise Profunda do Repositório Existente

Data da análise: 2026-08-29
Commit analisado: `d115e28` (branch `main`, working tree com alterações locais não commitadas em `backend/config/swagger.js`, `backend/package.json`, `backend/package-lock.json`)

---

## 1. Arquitetura atual

Cinco projetos **Vite/React independentes** + um backend Express partilhado. Não é um monorepo — são 5 pastas com `package.json`, `node_modules` e configuração próprias, sem workspaces, sem tipos partilhados, sem componentes partilhados. Cada frontend reimplementa a sua própria instância axios, toasts, CSS global e contexto.

```
Yummix/
├── frontend/      React 18 + Vite  — Cliente          (porta 5173)
├── admin/         React 18 + Vite  — Painel Restaurante (porta 5174)
├── rider/         React 19 + Vite + Tailwind v4 — Estafeta (porta 5175)
├── super-admin/   React 18 + Vite  — Super Admin        (porta 5176)
└── backend/       Node/Express + Mongoose — API única   (porta 4000)
```

**Não existe app de Cozinha/KDS.** O fluxo de preparação é gerido dentro do painel do restaurante (`admin/`), sem interface dedicada a touchscreen.

**Backend**: Express clássico (não serverless localmente, mas desenhado para correr em Vercel Functions — daí a ausência deliberada de `setTimeout`/timers em process, e o uso de cron externo). MongoDB Atlas via Mongoose. Autenticação JWT por role, com 4 middlewares separados (`auth.js`, `adminAuth.js`, `restaurantAuth.js`, `riderAuth.js`) que validam o token e o `role` embutido nele — só existem 4 roles: `user`, `restaurant`, `rider`, `admin` (não há `KITCHEN` nem `RESTAURANT_STAFF`).

**Camadas identificadas no backend**: `routes/` → `controllers/` → `models/` (Mongoose), mais `services/` para lógica de negócio isolada (`refundService.js`, `riderAssignmentService.js`) e `utils/cacheHelper.js` para Redis (Upstash, cliente HTTP-REST). Não há repositórios, não há DTOs/validação de schema (ex.: Zod/Joi), a validação é ad-hoc dentro dos controllers.

**Realtime**: inexistente. Tudo é polling — o estafeta faz polling a cada 8s por nova atribuição e envia GPS a cada 30s; o cliente/restaurante não têm nenhum mecanismo de push (o README próprio lista "Socket.io para GPS em tempo real" em "Future Improvements" — nunca foi implementado).

**Mapas**: Leaflet + OpenStreetMap (sem API key), usado em `admin` (pin da localização do restaurante) e `rider` (mapa de entrega). Boa escolha, coincide com o pedido do utilizador.

**Pagamentos**: Stripe Checkout Sessions + Cash on Delivery. Sem MB Way/Multibanco/Apple Pay/Google Pay, nem estrutura preparada para os adicionar (ver secção de problemas).

---

## 2. Funcionalidades existentes (o que já funciona)

- Registo/login de 4 tipos de conta com bcrypt + JWT.
- Descoberta de restaurantes num raio de 10km (Haversine), listagem cacheada em Redis.
- Carrinho single-restaurant (troca de restaurante limpa o carrinho).
- Cupão único `FIRST15` (15%, uso único por utilizador).
- Cálculo de taxa de entrega dinâmica: base + custo por km acima de uma distância franca.
- Checkout Stripe ou COD.
- Cancelamento de pedido pelo cliente (só até "Preparing Food") com reembolso automático Stripe.
- Máquina de estados de pedido com **ownership explícito por ator** (tabela `RESTAURANT_TRANSITIONS` — só o restaurante pode mover Order Placed→Confirmed→Preparing Food→Ready for Pickup, ou rejeitar).
- Atribuição de estafeta por vizinho mais próximo (Haversine) com retries geridos por cron (não por timer em processo) e cancelamento automático ao fim de 5 tentativas falhadas.
- Reembolso desacoplado do estado do pedido, com registo de falhas (`adminAlert`) e retry via cron.
- CRUD de comida com upload Cloudinary, categorias fixas (enum), nível de picante, tags, disponibilidade.
- Avaliação de comida (rating por item).
- Painel Super Admin: aprovação de restaurantes/estafetas, pedidos, alertas de reembolso, feedback.
- Dashboard de ganhos do estafeta (₹4/km + bónus a cada 10 entregas).
- Docker Compose para desenvolvimento local; deploy Vercel documentado.

---

## 3. Problemas encontrados

### Críticos para os requisitos pedidos
1. **Sem sistema de variantes/modificadores.** `foodModel` é totalmente plano: `name`, `price`, `category`. Não há grupos, obrigatoriedade, min/max, extras, nem preço por opção. O carrinho do utilizador é `cartData: { [itemId]: quantidade }` — um objeto simples no documento `user`. Isto torna **impossível** representar "Pizza Grande + massa fina + bacon extra + sem cebola" como itens distintos no carrinho (duas configurações do mesmo `itemId` colidem). É a limitação mais séria de todas — implica reescrever o modelo de produto e de carrinho do zero.
2. **Sem app de Cozinha/KDS.** Não existe.
3. **Sem realtime.** Só polling. Não há Socket.IO, SSE, nem WebSockets.
4. **Sem opção de recolha no restaurante (pickup).** O fluxo assume sempre entrega.
5. **`paymentStatus` não modelado como enum.** Existe `payment: Boolean` + `refunded/refundFailed/...` soltos — não há o `PENDING/PAID/FAILED/REFUNDED` pedido.
6. **Sem recuperação de password** (forgot/reset) em nenhuma das 4 apps.

### Arquitetura / qualidade
7. **Não é monorepo** — 5 `package.json` independentes, versões de React inconsistentes entre apps (React 18 em 3 apps, React 19 em `rider`/`super-admin` parcial), sem partilha de tipos/UI/validação. Duplicação de axios/context/CSS em cada app.
8. **Zero testes** (nenhum ficheiro `*.test.*` ou `*.spec.*` no repositório, nenhuma dependência de teste instalada).
9. **JavaScript puro, sem TypeScript** — sem verificação de tipos em nenhuma das 5 apps.
10. **Token JWT enviado num header custom `token`**, não `Authorization: Bearer` — não standard, dificulta integração com ferramentas/proxies comuns.
11. **Sem validação de input estruturada** (Zod/Joi/class-validator) — validação manual e inconsistente por controller.
12. **Sem rate limiting** em nenhum endpoint.
13. **Sem PWA** (sem manifest, sem service worker) apesar de ser o pedido central do utilizador.
14. **Restaurante sem horário de funcionamento, sem raio de entrega configurável, sem comissão** no modelo — o Super Admin não tem, portanto, onde guardar essas configurações.
15. **Categoria de comida é um enum fixo no schema** (`Biriyani, Rolls, Deserts...` — claramente pensado para cozinha indiana) — cada restaurante devia poder criar as suas próprias categorias.
16. **Coupons hardcoded** (`FIRST15` está escrito no controller, não é uma entidade configurável).
17. **Ratings só para comida**, não para estafeta nem para a experiência geral do pedido.
18. **`.env` do backend está commitado no working tree** (existe `backend/.env`, precisa de confirmação se está no `.gitignore` — a repetir a verificação antes de qualquer commit).
19. **Uploads locais em `backend/uploads/`** ficam commitados no histórico do repositório (ficheiros de imagem binários versionados em git).
20. Alterações locais não commitadas em `backend/config/swagger.js` e `backend/package.json` — a investigar antes de qualquer reset/checkout dessa pasta.

### Coisas certamente boas mas que não escalam
- MongoDB é aceitável para o CRUD simples atual, mas para um **sistema de modificadores relacional** (grupos → opções → combinações de preço, "meio a meio" com regra de preço, comissões, relatórios financeiros com joins) um modelo relacional com integridade referencial (PostgreSQL) é uma escolha técnica genuinamente melhor, não apenas preferência — evita denormalização manual e bugs de consistência em escrita.

---

## 4. Componentes reutilizáveis (referência/base para a nova plataforma)

Estes **padrões** (não necessariamente o código literal) valem a pena transportar:

- **Tabela de transições de estado por ator** (`RESTAURANT_TRANSITIONS` em [orderController.js](backend/controllers/orderController.js:315)) — o princípio de "cada estado só pode ser escrito por um ator" é exatamente o que os requisitos pedem; vamos generalizar isto para um enum de 10 estados com uma máquina de estados explícita no novo backend.
- **Reembolso como máquina de estados desacoplada do estado do pedido** ([refundService.js](backend/services/refundService.js)) — bom desenho, evita bloquear o cancelamento à espera do Stripe.
- **Cálculo de taxa de entrega Haversine + base/km** ([orderController.js](backend/controllers/orderController.js:15) `calcDeliveryFee`) — lógica correta, será generalizada para suportar também escalões fixos (0-3km, 3-5km, etc.) como pedido.
- **Atribuição de estafeta por proximidade com fila de retries** ([riderAssignmentService.js](backend/services/riderAssignmentService.js)) — bom ponto de partida conceptual para o algoritmo de despacho.
- **Cache fail-open para Mongo** ([cacheHelper.js](backend/utils/cacheHelper.js)) — o princípio "Redis nunca quebra a API" é correto e será mantido.
- **Leaflet + OpenStreetMap** (sem custos, sem API key) — reutilizar diretamente.
- **Separação de roles por middleware JWT** — o princípio é bom; a implementação será modernizada (Bearer token, refresh tokens, mais roles).
- **Aprovação administrativa de restaurantes e estafetas** (`isApproved`/`verificationStatus`) — manter o conceito.
- **Modelo de imagens Cloudinary + Multer** — reutilizável diretamente no novo backend.
- **Cron-driven background work em vez de timers em processo** — só relevante se mantivermos deploy serverless; a decidir na Fase 1 consoante o alvo de deploy.

---

## 5. Componentes a substituir/abandonar

- **`foodModel` e `cartData` (objeto simples no user)** — substituir por um schema de produto com grupos de modificadores e um carrinho como entidade própria com snapshot de modificadores por linha.
- **Categoria de comida como enum fixo** — substituir por categorias criadas por cada restaurante.
- **`orderModel.items: Array` não tipado** — substituir por `OrderItem` relacional com modificadores.
- **`payment: Boolean` + flags de refund soltos** — substituir por `paymentStatus` enum + `paymentMethod` enum.
- **Cupão hardcoded no controller** — substituir por entidade `Coupon` configurável.
- **As 5 apps sem partilha de código** — substituir por monorepo com pacotes partilhados.
- **Ausência de KDS** — construir de raiz.
- **Ausência de realtime** — substituir polling por Socket.IO.
- **Token em header custom** — substituir por `Authorization: Bearer`.

---

## 6. Arquitetura recomendada

### Stack

| Camada | Escolha | Justificação |
|---|---|---|
| Frontend (5 apps) | React 18 + Vite + TypeScript | Pedido explícito; consistência entre apps |
| Backend | Node.js + **Express** modular (routers/controllers/services/repositories), TypeScript | NestJS traria DI e módulos "de fábrica", mas o ganho não justifica a curva de aprendizagem/migração para uma equipa pequena — uma estrutura Express bem disciplinada (camadas claras, um router por domínio) entrega a mesma separação de responsabilidades com muito menos boilerplate. Não migro para Nest só porque é "mais enterprise". |
| Base de dados | **PostgreSQL + Prisma** | O sistema de modificadores (grupos → opções → regras de preço, "meio a meio") e o financeiro (comissões, GMV, relatórios com joins) são inerentemente relacionais. Prisma dá migrations versionadas, tipos gerados e integridade referencial que o Mongo atual não tem. Não é dogma — é o requisito de modificadores que decide isto. |
| Realtime | Socket.IO | Pedido explícito; substitui todo o polling atual. |
| Imagens | Cloudinary (mantido) | Já funciona bem no projeto atual; conversão automática para WebP fica centralizada no upload service. |
| Pagamentos | Stripe (Checkout + Refunds API, mantido) | Já funciona; estrutura `paymentMethod`/`paymentStatus` preparada para MB Way/Multibanco depois. |
| Auth | JWT (access + refresh) via cookies httpOnly ou Bearer, bcrypt | Evolução direta do que existe, com mais roles e reset de password. |

### Supabase — avaliado e não recomendado como plataforma completa

Supabase simplificaria Postgres + Auth + Storage num único fornecedor, mas o produto pedido precisa de **lógica de negócio pesada no servidor** (motor de despacho de estafetas, máquina de estados de pedido, cálculo de comissões, KDS em tempo real) que teria de viver num backend Express de qualquer forma — nesse cenário, dividir o realtime entre "Supabase Realtime" e "Socket.IO" criaria duas fontes de verdade em vez de uma. Recomendo: **PostgreSQL gerido** (pode ser hospedado no Supabase, Neon, Railway ou RDS — indiferente para a arquitetura) + Prisma + Express + Socket.IO como única camada de tempo real. Se mais tarde quisermos reduzir código de auth, migrar para Supabase Auth é uma opção isolada e reversível — não afeta esta decisão agora.

### Monorepo

**npm workspaces** (sem Turborepo por agora — 6 pacotes não justificam a complexidade de cache de build distribuído; reavaliar se o build ficar lento).

```
apps/
  customer/       React + Vite + TS  (porta 3000)
  restaurant/     React + Vite + TS  (porta 3001)
  kds/            React + Vite + TS  (porta 3002)
  courier/        React + Vite + TS  (porta 3003)
  admin/          React + Vite + TS  (porta 3004)
  api/            Express + TS + Prisma + Socket.IO (porta 4000)
packages/
  types/          Tipos partilhados (enums de estado, DTOs)
  validation/      Schemas Zod partilhados entre api e apps
  ui/             Componentes React partilhados (botões, cartões, toasts)
  config/         ESLint/TS config partilhada
prisma/
  schema.prisma
```

### Modelo de dados — pontos-chave que resolvem o gap de modificadores

- `Product` → tem N `ModifierGroup` (nome, `required`, `min`, `max`)
- `ModifierGroup` → tem N `ModifierOption` (nome, `priceDelta`)
- `OrderItem` → guarda snapshot imutável do produto + modificadores escolhidos (preço na altura da compra, para nunca depender de alterações futuras do menu)
- `Order.status` — enum com os 10 estados pedidos (`NEW…DELIVERED/CANCELLED`), transições validadas por uma tabela `ALLOWED_TRANSITIONS[actor][from] → to[]`, à semelhança do padrão já existente no Yummix.
- `Order.paymentMethod` (`CARD|CASH|MBWAY|TERMINAL`) e `Order.paymentStatus` (`PENDING|PAID|FAILED|REFUNDED`) como campos independentes, como pedido.
- `Order.fulfillmentType` (`DELIVERY|PICKUP`) — pickup salta a atribuição de estafeta.
- `DeliveryZone`/`Restaurant.deliveryFeeRule` — suporta tanto escalões fixos como base+km.

### Roles
`CUSTOMER, RESTAURANT_OWNER, RESTAURANT_STAFF, KITCHEN, COURIER, SUPER_ADMIN`

---

## 7. Plano de implementação (fases)

1. **Fase 1** — auditoria (este documento), monorepo, Prisma schema completo, auth (JWT + roles + reset password), seed.
2. **Fase 2** — cliente: restaurantes, menu, produtos com modificadores, carrinho.
3. **Fase 3** — checkout, pedidos, painel restaurante, KDS.
4. **Fase 4** — estafetas, despacho, tracking em tempo real (Socket.IO).
5. **Fase 5** — super admin, financeiro, pagamentos, analytics.
6. **Fase 6** — PWA, polimento visual, testes (Vitest + Playwright), performance, segurança.

Cada fase só é considerada concluída depois de correr e passar os testes correspondentes.

---

## 8. Decisão a confirmar com o utilizador antes de avançar

Este documento recomenda **abandonar o MongoDB** e migrar para PostgreSQL — é a decisão de maior impacto e a mais difícil de reverter depois de começarmos a escrever o schema Prisma e o seed. Vou avançar com esta recomendação na Fase 1 salvo indicação em contrário.
