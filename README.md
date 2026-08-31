# Yummix — Plataforma de Delivery Multi-Restaurante

Yummix está a ser reconstruído a partir do zero como um monorepo profissional, usando o projeto legado (pastas `backend/`, `frontend/`, `admin/`, `rider/`, `super-admin/`) como referência de negócio, não como base de código. Ver [PROJECT_ANALYSIS.md](PROJECT_ANALYSIS.md) para a auditoria completa do que existia, o que foi reaproveitado e a arquitetura recomendada.

> **Estado atual: Fases 1–6 concluídas.** As 5 apps novas + a API são funcionais ponta-a-ponta contra a base de dados real: autenticação por papel, catálogo com modificadores, carrinho, checkout (entrega/recolha, 4 métodos de pagamento, cupões), painel do restaurante, KDS, despacho de estafetas com algoritmo do mais próximo + retries + PWA, e o painel Super Admin com financeiro. Ver a secção "O que falta" mais abaixo para o que fica deliberadamente fora deste âmbito inicial. As pastas antigas (`backend/`, `frontend/`, `admin/`, `rider/`, `super-admin/`) continuam no repositório como referência histórica.

## Arquitetura

```
apps/
  customer/     Cliente          React + Vite + TS, PWA   → http://localhost:3000
  restaurant/   Painel Restaurante  React + Vite + TS      → http://localhost:3001
  kds/          Kitchen Display System  React + Vite + TS  → http://localhost:3002
  courier/      Estafeta         React + Vite + TS, PWA    → http://localhost:3003
  admin/        Super Admin      React + Vite + TS         → http://localhost:3004
  api/          Backend          Express + TS + Prisma + Socket.IO → http://localhost:4000

packages/
  types/        Enums e tipos partilhados (estados de pedido, roles, JWT payload)
  validation/   Schemas Zod partilhados entre o backend e as apps
  config/       tsconfig base partilhada
  ui/           (reservado para componentes React partilhados — Fase 6)

prisma/schema.prisma  (dentro de apps/api) — modelo de dados completo
```

**Stack**: React 18 + Vite + TypeScript (todas as apps) · Node.js + Express + TypeScript (API) · PostgreSQL + Prisma · Socket.IO (realtime) · Stripe (pagamentos) · Cloudinary (imagens) · JWT (access + refresh) com bcrypt.

Porquê esta stack e não a original (MongoDB, Express solto, sem monorepo): ver secção 6 de [PROJECT_ANALYSIS.md](PROJECT_ANALYSIS.md).

## Requisitos

- Node.js 20+ e npm 10+
- PostgreSQL 16 (local via Docker, ou uma instância gerida — Neon/Supabase/Railway/RDS, indiferente)
- Conta Stripe (modo teste) e Cloudinary — opcionais para a Fase 1, necessárias a partir da Fase 3

## Instalação

```bash
npm install
```

Isto instala as dependências de todas as apps e pacotes do monorepo (npm workspaces) de uma vez.

## Base de dados

Sobe um PostgreSQL local descartável:

```bash
docker compose up -d
```

Configura o ambiente do backend:

```bash
cp apps/api/.env.example apps/api/.env
```

Edita `apps/api/.env` — no mínimo define `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` (qualquer string aleatória longa para desenvolvimento; gerar com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). `DATABASE_URL` já vem pronta para o Postgres do `docker-compose.yml`.

Aplica o schema e semeia dados de demonstração:

```bash
npm run db:migrate
npm run db:seed
```

## Contas de demonstração

Password para todas: **`Demo1234!`**

| Papel | Email |
|---|---|
| Cliente | `cliente@demo.local` |
| Dono de Restaurante (Bella Napoli) | `restaurante@demo.local` |
| Cozinha (Bella Napoli) | `cozinha@demo.local` |
| Estafeta | `estafeta@demo.local` |
| Super Admin | `admin@demo.local` |

O seed cria 3 restaurantes fictícios (Bella Napoli, Burger House, Frango Real) com categorias, produtos e — no caso da Bella Napoli — grupos de modificadores completos (Tamanho, Massa, Extras, Remover ingredientes) para testar o sistema de variantes desde já, além de um cupão `BEMVINDO15` (15%, uso único).

### Testar o fluxo principal

1. Login em `cliente@demo.local` (app Cliente) → guardar um endereço com "Usar localização atual" → escolher Bella Napoli → adicionar Pizza Margherita com modificadores → checkout com **entrega** (COD) → pedido fica `NEW`.
2. Login em `restaurante@demo.local` (app Restaurante) → aparece na coluna "Novos" em tempo real (com som) → Aceitar (com tempo de preparação) → passa a `ACCEPTED`.
3. Login em `cozinha@demo.local` (app KDS) → pedido aparece em "Novos" → Iniciar Preparação → Pedido Pronto → passa a `WAITING_FOR_COURIER`.
4. Login em `estafeta@demo.local` (app Estafeta) → ficar Online → a oferta de entrega aparece automaticamente (despacho pelo mais próximo) → Aceitar → Confirmar recolha → A caminho → Confirmar entrega.
5. Durante tudo isto, a app Cliente atualiza sozinha em tempo real (Socket.IO) até `DELIVERED`.
6. Login em `admin@demo.local` (app Super Admin) → ver o pedido, o GMV e a comissão no Dashboard.

Para testar **recolha no restaurante** em vez de entrega: escolher "Recolha" no checkout — o pedido salta a atribuição de estafeta e o restaurante marca-o como levantado diretamente.

## Desenvolvimento local

```bash
npm run dev
```

Arranca as 5 apps + a API em paralelo:

```
API:         http://localhost:4000  (GET /health para verificar)
Cliente:     http://localhost:3000
Restaurante: http://localhost:3001
KDS:         http://localhost:3002
Estafeta:    http://localhost:3003
Super Admin: http://localhost:3004
```

Cada app frontend também tem um `.env.example` próprio (`VITE_API_URL`).

Para correr só o backend: `npm run dev:api`. Cada app individualmente: `npm run dev:<nome>` (ex.: `npm run dev:customer`).

## Testes

```bash
npm test
```

Corre os testes unitários de todos os workspaces (Vitest — 42 testes): máquina de estados de pedido e transições por ator, geração/hash de tokens de autenticação, cálculo de preço com modificadores e split meio-a-meio, taxa de entrega (tiered e base+km), validação de grupos de modificadores obrigatórios/min/max, desconto de cupão, ganhos de estafeta por entrega com bónus, e o cálculo financeiro (GMV/comissão/repasse) do Super Admin.

Teste E2E (Playwright) do fluxo principal — login → restaurante → produto com modificadores → carrinho → checkout:

```bash
cd apps/customer
npx playwright install chromium   # primeira vez apenas
npm run dev:api                   # noutro terminal, com Postgres a correr e seed aplicado
npm run test:e2e
```

## Uploads de imagem

`POST /api/uploads` (autenticado, multipart `file` + `folder`) — usado para documentos de estafeta, e futuramente para imagens de produto/restaurante. Imagens são automaticamente convertidas para WebP e redimensionadas (máx. 1600px) antes do upload para o Cloudinary; requer `CLOUDINARY_*` configurado em `apps/api/.env` — sem isso, o endpoint devolve um erro claro em vez de falhar silenciosamente.

## Fluxo de pedido (arquitetura de estados)

```
NEW → ACCEPTED → PREPARING → READY_FOR_PICKUP
                                    ├─ (DELIVERY) → WAITING_FOR_COURIER → COURIER_ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
                                    └─ (PICKUP)   → COLLECTED
```

Cada estado só pode ser escrito por um ator (restaurante, cozinha, sistema de despacho, ou estafeta) — ver `ORDER_TRANSITIONS` em [packages/types/src/index.ts](packages/types/src/index.ts). Nunca dois papéis escrevem no mesmo campo.

## Plano de fases

1. ✅ **Fase 1** — auditoria, monorepo, schema Prisma, autenticação (JWT + roles + reset de password), seed.
2. ✅ **Fase 2** — cliente: restaurantes, menu, produtos com modificadores, carrinho.
3. ✅ **Fase 3** — checkout, pedidos, painel do restaurante, KDS.
4. ✅ **Fase 4** — estafetas: registo, despacho pelo mais próximo com retries automáticos, tracking em tempo real, mapa, ganhos.
5. ✅ **Fase 5** — super admin: restaurantes, estafetas, clientes, pedidos, alertas de reembolso, feedback, financeiro (GMV/comissão/repasse).
6. ✅ **Fase 6** — PWA instalável (Cliente + Estafeta), teste E2E do fluxo principal, revisão de segurança.

### O que fica fora deste âmbito inicial

Estas ficaram deliberadamente por fazer — nenhuma é um "TODO esquecido", são cortes de âmbito conscientes para manter a reconstrução focada no fluxo principal pedido:

- CRUD de menu (produtos/categorias/modificadores) na app Restaurante — hoje só existe via seed/Prisma Studio. A API (`Product`, `Category`, `ModifierGroup`) já suporta; falta só a UI.
- Avaliações (produto e estafeta) — os modelos `ProductRating`/`CourierRating` existem no schema mas não há endpoints/UI ainda.
- "Repetir pedido" no histórico do cliente.
- Gestão de horários de funcionamento do restaurante na UI (`RestaurantHours` existe no schema).
- Integração real MB Way/Multibanco/Apple Pay/Google Pay — os enums `paymentMethod` já preveem isto, falta o processador de pagamento.
- k6/load testing, CI/CD, i18n multi-idioma.

## Segurança

- Passwords com bcrypt (12 rounds)
- JWT access token (15 min) + refresh token opaco rotativo (30 dias), guardado como hash SHA-256 em base de dados — nunca em texto plano
- `Authorization: Bearer <token>` standard (substitui o header `token` custom do projeto legado)
- Reset de password com token de uso único, expira em 1h, revoga todas as sessões ativas ao ser usado
- Contas Super Admin só podem ser criadas via CLI local (`npm run create-admin -w apps/api -- --name "..." --email ... --password ...`) — zero superfície HTTP para criar admins, mesmo mal configurada
- Validação de input com Zod em todos os endpoints (auth, carrinho, checkout, admin, etc.)
- Rate limiting (global + mais restrito em `/api/auth`)
- Helmet, CORS restrito a origens conhecidas
- Cada socket autentica com o mesmo JWT via `auth: { token }` no handshake e só entra nas salas do seu próprio papel/restaurante/utilizador — nunca recebe eventos de outra conta
- Uploads validam tipo de ficheiro e limitam tamanho (8MB); nome de pasta sanitizado
- Nenhum segredo no código — tudo via `.env`, validado no arranque (`apps/api/src/config/env.ts` falha rápido se faltar algo)

## Projeto legado

As pastas `backend/`, `frontend/`, `admin/`, `rider/`, `super-admin/` são o Yummix original (MongoDB/Express/React sem TypeScript) e ficam no repositório como referência histórica durante a migração — ver o respetivo README de cada uma. Não desenvolver funcionalidades novas ali.

## Licença

MIT — ver [LICENSE](LICENSE).
