# VAIPIZZA — Especificação de Redesign Visual e Funcional

**Data:** 31/08/2026  
**Base:** branch `vaipizza-atual`  
**Objetivo desta fase:** transformar a aplicação existente numa experiência VAIPIZZA premium e coerente em desktop e telemóvel, preservando o motor funcional atual. Segurança aprofundada e testes de carga ficam para a fase seguinte, depois da validação visual/funcional local.

---

## 1. Decisão arquitetural

A VAIPIZZA será **uma única pizzaria por instalação**.

O modelo de franquia não será um SaaS multi-restaurante gerido centralmente. Quando uma nova franquia/licença for vendida, será criada uma **nova instalação independente da mesma aplicação**, com:

- deploy próprio;
- base de dados/Supabase próprio;
- variáveis de ambiente próprias;
- utilizadores próprios;
- catálogo próprio;
- domínio próprio, quando aplicável;
- identidade configurável a partir da mesma base de código.

Isto mantém cada operação isolada e reduz complexidade operacional e risco de mistura de dados entre unidades.

### Consequência

A experiência pública da VAIPIZZA deixa de ter qualquer conceito de “escolher restaurante”.

O código pode conservar internamente entidades herdadas de `Restaurant` para evitar uma reescrita desnecessária do backend, mas a UI da VAIPIZZA será **single-store**.

---

## 2. Arquitetura atual a preservar

O monorepo atual já está corretamente separado e será mantido:

```text
apps/
  customer/     Cliente / site público
  restaurant/   Gestão operacional da pizzaria
  kds/          Cozinha
  courier/      Estafeta
  admin/        Console administrativa/técnica
  api/          Backend
packages/
  types/
  validation/
  config/
  ui/
```

### Princípio

Não reconstruir o motor funcional que já existe.

O redesign deve trabalhar principalmente sobre:

- componentes;
- rotas;
- design system;
- UX;
- hierarquia visual;
- nomenclatura;
- responsividade;
- estados de loading/erro/sucesso;
- animações controladas.

Alterações no backend só entram quando forem necessárias para suportar uma melhoria concreta de UX.

---

## 3. Estrutura de produto desejada

```text
VAIPIZZA.PT
│
├── /
│   └── experiência cinematográfica da marca
│
├── /pedir
│   └── menu e experiência de compra
│
├── /carrinho
│
├── /checkout
│
├── /pedidos
│
└── /perfil

GESTÃO VAIPIZZA
│
├── pedidos
├── cardápio
├── caixa
├── relatórios
└── definições

COZINHA
└── KDS fullscreen

ESTAFETA
├── início / online-offline
├── entrega ativa
├── ganhos
└── histórico

CONSOLE TÉCNICA
└── funções administrativas que não pertencem à operação diária
```

A rota antiga `/restaurants/vaipizza` poderá continuar a funcionar como alias interno/transitório, evitando que links ou testes existentes sejam quebrados.

---

# 4. Design System VAIPIZZA

## 4.1 Identidade

A identidade final será definida a partir da **logo e paleta oficial fornecidas pelo cliente**.

Até receber esses assets, o código deve ser preparado para usar tokens de marca centralizados:

```text
--vp-primary
--vp-secondary
--vp-accent
--vp-bg
--vp-surface
--vp-text
--vp-muted
--vp-success
--vp-warning
--vp-danger
```

### Regra importante

Não espalhar hexadecimais da marca por centenas de regras CSS.

A identidade deve poder ser alterada de forma controlada.

## 4.2 Tipografia

Definir no máximo:

- 1 fonte de impacto/display;
- 1 fonte de interface altamente legível.

Cozinha, estafeta e admin priorizam legibilidade.  
O site público pode usar a fonte de display de forma mais expressiva.

## 4.3 Componentes partilhados

A pasta `packages/ui` deve finalmente ser usada, de forma incremental, para componentes realmente comuns:

- Button
- Badge
- Modal / BottomSheet
- Input
- Select
- Toast
- EmptyState
- Skeleton
- StatusChip
- ConfirmDialog

Não tentar mover toda a UI de uma vez. Migrar apenas componentes novos/reutilizados.

---

# 5. CUSTOMER — Site público + aplicação de pedidos

## 5.1 Nova homepage cinematográfica

Hoje `/` serve essencialmente para localizar a VAIPIZZA e redirecionar para o menu. Isto será substituído por uma homepage real.

### Hero

Primeiro ecrã:

- logo VAIPIZZA;
- mensagem curta;
- `Delivery & Takeaway`;
- CTA dominante: **PEDIR AGORA**;
- CTA secundário: ver menu / como funciona;
- imagem ou vídeo cinematográfico de pizza/forno/massa;
- profundidade e movimento suaves;
- transição elegante para o conteúdo.

### Movimento

Usar animação somente na homepage pública.

Opções técnicas previstas:

- GSAP / ScrollTrigger para timeline e scroll;
- Lenis para smooth scroll, se não comprometer acessibilidade;
- React Three Fiber apenas se houver um elemento 3D que realmente agregue;
- lazy loading de qualquer módulo pesado;
- fallback estático no mobile/equipamentos modestos;
- respeitar `prefers-reduced-motion`.

### Regra de performance

A experiência cinematográfica **não entra no bundle crítico do menu/checkout**.

Ao tocar em “Pedir agora”, o cliente entra numa interface muito mais rápida e funcional.

---

## 5.2 `/pedir` — menu VAIPIZZA

Eliminar visualmente qualquer conceito de marketplace.

### Cabeçalho

- logo;
- estado `Aberto / Fechado`;
- estimativa de entrega/recolha;
- localização resumida;
- carrinho sempre acessível.

### Categorias

- navegação sticky;
- chips/tabs grandes e fáceis de tocar;
- scroll horizontal no mobile;
- indicação clara da categoria ativa.

### Produtos

Cards com:

- fotografia dominante;
- nome;
- descrição curta;
- preço “desde” quando houver variantes;
- indicador de popular/destaque quando aplicável;
- botão visual simples para abrir personalização.

### Produto / personalização

No desktop: modal elegante.  
No mobile: bottom sheet / painel de ecrã quase inteiro.

Ordem:

1. produto + fotografia;
2. descrição;
3. tamanho obrigatório;
4. massa;
5. extras;
6. remover ingredientes;
7. observações;
8. quantidade;
9. preço total atualizado;
10. CTA `Adicionar ao pedido`.

Seleções obrigatórias e limites min/max devem ficar visualmente evidentes.

---

## 5.3 Carrinho

O carrinho deve poder ser montado **antes do login**.

A autenticação será exigida apenas quando o utilizador avançar para checkout, mantendo a compatibilidade do backend nesta fase.

### Mobile

- resumo compacto fixo na parte inferior quando houver itens;
- CTA com quantidade + total;
- página de carrinho simples, sem distrações.

### Desktop

- drawer lateral ou painel claramente visível;
- edição de item sem perder o contexto do menu.

---

## 5.4 Checkout

Objetivo: reduzir passos e dúvidas.

### Ordem proposta

1. `Delivery` ou `Takeaway`;
2. morada / localização;
3. horário, se aplicável;
4. contacto;
5. pagamento;
6. cupão;
7. observações;
8. resumo;
9. confirmar pedido.

Mostrar permanentemente:

- subtotal;
- taxa de entrega;
- desconto;
- total;
- previsão de tempo.

Erros devem aparecer junto do campo/etapa correspondente, nunca apenas como erro genérico.

---

## 5.5 Acompanhamento do pedido

Aproveitar o realtime já existente.

Transformar os estados internos numa timeline compreensível:

```text
Pedido recebido
→ Em preparação
→ Pronto
→ Saiu para entrega
→ Entregue
```

Para takeaway:

```text
Pedido recebido
→ Em preparação
→ Pronto para levantar
→ Levantado
```

Não expor nomes técnicos como `WAITING_FOR_COURIER`.

---

# 6. KDS — Cozinha

O fluxo existente será preservado: o pedido já chega à cozinha em preparação e a ação principal da cozinha é marcá-lo como pronto.

## Direção visual

- fullscreen;
- alto contraste;
- fundo neutro/escuro;
- cartões grandes;
- leitura a 1–2 metros;
- cronómetro destacado;
- prioridade/urgência muito evidente;
- sem animações decorativas.

## Ticket

Hierarquia:

1. número do pedido;
2. tempo decorrido;
3. `DELIVERY` / `TAKEAWAY`;
4. quantidade + produto;
5. variantes/modificadores;
6. remoções;
7. observações;
8. botão enorme `PRONTO`.

### Urgência

- normal;
- atenção;
- atrasado.

Não depender apenas de cor: usar também texto/ícone/borda.

### Interação

- um toque para `PRONTO`;
- proteção contra duplo toque enquanto a requisição está em curso;
- feedback visual imediato;
- som novo pedido / pronto de forma controlável.

---

# 7. ESTAFETA — Mobile first

A aplicação já possui:

- online/offline;
- entrega atribuída;
- mapa;
- contacto do cliente;
- três transições principais;
- ganhos;
- histórico.

O redesign deve simplificar ainda mais.

## 7.1 Home

Mostrar apenas:

- estado ONLINE/OFFLINE;
- entrega atual ou nova oferta;
- resumo do dia;
- CTA principal.

## 7.2 Oferta

Cartão de oferta com:

- distância estimada;
- valor/ganho;
- origem;
- destino resumido;
- contagem regressiva;
- `Aceitar`.

## 7.3 Entrega ativa

Layout mobile:

```text
[ MAPA ]

Pedido #123
Restaurante / Cliente

[Navegar] [Ligar]

informação essencial

[ CTA FIXO NA PARTE INFERIOR ]
```

Estados:

- `Confirmar recolha`
- `A caminho do cliente`
- `Confirmar entrega`

Exatamente uma ação dominante por estado.

O mapa não deve competir com o botão operacional.

---

# 8. GESTÃO VAIPIZZA

A app `restaurant` será tratada como o **painel operacional principal**.

Ela já possui:

- dashboard de pedidos;
- cardápio;
- caixa;
- relatórios;
- definições.

## Direção

Transformar a experiência num dashboard profissional, sem aparência de template genérico.

### Navegação

Desktop:
- sidebar fixa/recolhível.

Mobile/tablet:
- navegação compacta adequada ao uso administrativo.

### Pedidos

Preservar o quadro de estados, mas melhorar:

- densidade;
- prioridade;
- tempo;
- tipo entrega/recolha;
- pagamento/troco;
- observações;
- ações.

### Cardápio

O CRUD existente será reorganizado para:

- categorias;
- produtos;
- imagem;
- preço;
- disponibilidade;
- modificadores;
- destaque/promoção quando suportado.

A interface deve reduzir risco de apagar/desativar um produto por engano.

### Dashboard

Métricas úteis à **pizzaria**, não à plataforma multi-restaurante:

- vendas hoje;
- pedidos hoje;
- ticket médio;
- delivery x takeaway;
- produtos mais vendidos;
- pedidos por hora;
- cancelamentos;
- tempo médio de preparação, quando os dados permitirem.

---

# 9. `apps/admin` — Console técnica

O Super Admin atual ainda contém conceitos de plataforma multi-restaurante, como:

- número de restaurantes;
- restaurantes pendentes;
- comissão da plataforma;
- repasses a restaurantes.

Isto não representa o modelo de negócio da VAIPIZZA single-store.

## Nesta fase

Não apagar essa aplicação nem reescrever o backend.

Em vez disso:

- retirar a Console Técnica da navegação operacional normal;
- manter acesso protegido para funções administrativas internas;
- não usá-la como “admin da pizzaria”;
- migrar gradualmente apenas as funções realmente úteis.

O utilizador operacional trabalhará principalmente em `apps/restaurant`.

---

# 10. Estratégia para franquias/licenças futuras

Não criar multi-tenancy nesta fase.

A base deve ficar fácil de replicar através de configuração.

## Configuração por instalação

Criar um ponto único para identidade e parâmetros:

```text
brand/
  name
  slug
  logo
  favicon
  colors
  contact
  social
  delivery settings
```

Os dados de negócio continuam na base de dados.

### Nova franquia

Fluxo futuro esperado:

1. clonar/criar projeto a partir da base estável;
2. criar novo Supabase/Postgres;
3. configurar `.env`;
4. aplicar migrations;
5. seed inicial;
6. inserir identidade;
7. configurar domínio;
8. deploy.

Assim uma franquia não depende da disponibilidade nem dos dados de outra.

---

# 11. Responsividade

## Customer
Mobile-first, mas com experiência desktop premium.

## KDS
Prioridade a:
- tablet horizontal;
- monitor de cozinha;
- desktop.

## Courier
Prioridade absoluta a:
- smartphone vertical.

## Gestão
Prioridade a:
- desktop;
- tablet;
- mobile funcional para ações rápidas.

Breakpoints não devem ser tratados apenas com “encolher tudo”. Alguns layouts mudam estruturalmente entre mobile e desktop.

---

# 12. Performance visual

Antes dos testes de carga do backend, a camada visual deve seguir estas regras:

- imagens WebP/AVIF quando possível;
- tamanhos adequados por breakpoint;
- lazy loading fora do primeiro viewport;
- skeletons;
- code splitting;
- lazy import da experiência cinematográfica;
- sem 3D no checkout/KDS/admin/courier;
- animações somente com `transform`/`opacity` quando possível;
- evitar grandes sombras/blurs em listas extensas;
- `prefers-reduced-motion`;
- prevenir layout shift em imagens.

---

# 13. Tratamento de erros

Cada app deve possuir um padrão consistente:

- loading;
- vazio;
- offline/rede;
- erro recuperável;
- erro fatal;
- sucesso;
- ação em curso.

### Exemplos

KDS:
`Não foi possível atualizar. Tentar novamente.`

Estafeta:
não perder a entrega ativa se uma requisição falhar.

Checkout:
não criar pedido duplicado em duplo toque.

Admin:
ações destrutivas exigem confirmação adequada.

---

# 14. Ordem de implementação

## Etapa 0 — Baseline
Antes de mudar visual:

- confirmar branch de trabalho;
- `npm install`;
- `npm test`;
- build de todos os workspaces;
- validar fluxo existente;
- registar erros atuais.

## Etapa 1 — Fundação visual
- tokens da marca;
- tipografia;
- componentes comuns essenciais;
- ícones;
- estados/loading/toasts;
- estrutura responsiva.

## Etapa 2 — Customer
1. homepage cinematográfica;
2. `/pedir`;
3. produto/modal-bottom-sheet;
4. carrinho;
5. login/checkout;
6. tracking/pedidos;
7. perfil.

**Esta etapa é a primeira grande entrega visual para teste.**

## Etapa 3 — KDS
- redesign fullscreen;
- tickets;
- urgência;
- ação `PRONTO`;
- áudio/feedback.

## Etapa 4 — Estafeta
- home;
- oferta;
- mapa/entrega ativa;
- ganhos/histórico;
- PWA/mobile.

## Etapa 5 — Gestão
- shell/sidebar;
- pedidos;
- cardápio;
- caixa;
- relatórios;
- definições.

## Etapa 6 — Console técnica
- retirar linguagem multi-restaurante daquilo que ficar visível;
- definir o que permanece técnico;
- ocultar o que não pertence à VAIPIZZA.

## Etapa 7 — Validação visual/funcional local
- desktop;
- tablet;
- mobile;
- fluxo completo cliente → pizzaria → cozinha → estafeta → cliente.

## Etapa 8 — Segurança e carga
Somente depois da aprovação da experiência:

- auditoria de auth/autorização;
- API abuse;
- sockets;
- uploads;
- dependências;
- headers/CORS;
- testes de concorrência;
- k6;
- 30+ clientes simultâneos;
- rajadas de checkout;
- pedidos concorrentes;
- observabilidade.

## Etapa 9 — Produção
- build de produção;
- ambientes;
- URLs;
- CORS;
- secrets;
- banco;
- deploy;
- smoke tests online;
- rollback.

---

# 15. Critérios de aprovação da fase visual

A fase visual/funcional só será considerada pronta para avançar para carga/segurança quando:

- homepage parecer uma marca VAIPIZZA, não um template;
- menu abrir rapidamente no mobile;
- personalização de pizza for intuitiva;
- carrinho/checkout não tiverem fricção visual desnecessária;
- KDS puder ser utilizado à distância sem esforço;
- estafeta concluir uma entrega em poucas ações;
- painel operacional permitir gerir pedidos e menu sem confusão;
- todas as apps tiverem estados de loading/erro;
- build passar;
- testes existentes continuarem a passar;
- fluxo E2E principal continuar operacional.

---

# 16. Fora do escopo desta primeira transformação

Não bloquear o redesign à espera de:

- MB Way real;
- Multibanco real;
- Apple Pay/Google Pay;
- cálculo de rota profissional;
- avaliações;
- carga k6;
- CI/CD completo.

Esses itens serão tratados depois da validação da nova experiência, salvo se algum deles for necessário para o fluxo local.

---

# 17. Resultado esperado

A VAIPIZZA deverá transmitir duas coisas simultaneamente:

### Para o cliente
**Desejo + rapidez.**

### Para a operação
**Clareza + confiabilidade.**

O objetivo não é transformar todas as telas em experiências cinematográficas.

O objetivo é:

> impressionar onde a marca precisa impressionar e desaparecer onde o software precisa simplesmente funcionar.
