# VAIPIZZA — Combos, Franquias, Admin simplificado e Exportação de Relatórios

Data: 2026-09-01
Branch: `redesign-vaipizza`
Status: aprovado em conversa; aguardando revisão final desta especificação antes do plano de implementação.

## Objetivo

Evoluir a instalação atual da VAIPIZZA sem alterar o modelo de uma pizzaria por instalação, adicionando:

1. Combos configuráveis pela Gestão da pizzaria.
2. Interruptor global de Combos no Admin técnico.
3. Captação pública de interessados em franquia, com armazenamento e envio por e-mail.
4. Área compacta de contactos de franquia no Admin.
5. Simplificação visual do Admin para uma única empresa/restaurante.
6. Exportação CSV nos relatórios existentes.

A alteração deve preservar o fluxo atual Cliente → Gestão → Cozinha → Estafeta e manter o staging funcional durante o desenvolvimento.

## Princípios de produto

- Uma instalação corresponde a uma pizzaria. Não haverá gestão multiempresa ou multitenant nesta versão.
- O Admin técnico controla funcionalidades da instalação; a Gestão controla a operação diária.
- As telas devem permanecer compactas. Edição detalhada deve acontecer em modal/drawer, evitando páginas excessivamente longas.
- O Cliente deve continuar orientado à compra; ações institucionais como franquia ficam discretas.
- Segurança e autorização são aplicadas no backend, não apenas no frontend.

## 1. Combos

### 1.1 Controle global

O Admin técnico terá um bloco compacto `Funcionalidades` com o interruptor:

- `Combos: ativado/desativado`

Quando desativado:

- a Gestão não permite publicar novos combos para o Cliente;
- o Cliente não exibe categoria, cards ou atalhos de Combos;
- combos já cadastrados permanecem na base para futura reativação.

### 1.2 Gestão de Combos

A Gestão da pizzaria terá uma nova área `Combos`, com lista compacta e edição em modal/drawer.

Cada combo poderá ter:

- nome;
- descrição;
- foto própria;
- preço atual;
- preço anterior opcional;
- ativo/inativo;
- destaque opcional;
- período de validade opcional;
- dias da semana e janela de horário opcionais;
- itens fixos;
- grupos de escolha;
- quantidades por grupo;
- opções permitidas por grupo;
- acréscimo de preço por opção quando necessário;
- ordem de exibição.

A Gestão poderá criar, editar, ativar/desativar, substituir foto e remover combo sem depender do Admin técnico.

### 1.3 Estrutura de dados recomendada

Usar estrutura própria e relacional, evitando representar Combos apenas como produto comum ou blob JSON.

Entidades conceituais:

- `FeatureSettings`
  - `combosEnabled`
- `Combo`
  - metadados, preço, foto, status, disponibilidade e ordenação
- `ComboFixedItem`
  - item obrigatório/fixo do combo
- `ComboGroup`
  - grupo de seleção, por exemplo “Escolha 2 pizzas”
- `ComboGroupOption`
  - produto/opção permitida no grupo e eventual acréscimo de preço

As relações devem referenciar produtos existentes sempre que possível, para reaproveitar disponibilidade e dados do catálogo.

### 1.4 Regras de disponibilidade

Um combo só aparece no Cliente quando todas estas condições forem verdadeiras:

- Combos estão habilitados globalmente;
- combo está ativo;
- está dentro da validade, se configurada;
- está dentro dos dias/horários permitidos, se configurados;
- há opções suficientes disponíveis para satisfazer os grupos obrigatórios.

Se uma opção individual estiver indisponível, ela deixa de ser oferecida; o combo só fica indisponível se não houver opções suficientes para completar a seleção exigida.

### 1.5 Experiência do Cliente

Quando houver combos ativos e disponíveis, o Cliente poderá mostrar `Combos` junto às categorias do menu.

Cards de combo terão:

- foto própria;
- nome;
- descrição curta;
- preço;
- preço anterior quando aplicável;
- CTA para configurar/adicionar.

Ao abrir um combo:

- itens fixos são mostrados como incluídos;
- grupos de escolha aparecem em ordem;
- o cliente só consegue adicionar ao carrinho quando todos os grupos obrigatórios estiverem completos;
- o preço total reflete os acréscimos selecionados;
- o resumo do carrinho preserva as escolhas do combo.

## 2. Seja um franqueado

### 2.1 Entrada no site público

Adicionar uma chamada discreta `Seja um franqueado` no site público do Cliente, preferencialmente no rodapé/menu e, se houver espaço, uma chamada institucional curta perto do fim da página.

Não deve competir visualmente com `Pedir agora`, menu, carrinho ou checkout.

### 2.2 Formulário

Ao clicar, abrir modal/drawer sem sair da página.

Campos:

- Nome — obrigatório
- Telefone — obrigatório
- E-mail — obrigatório
- Cidade/Região — obrigatório
- Mensagem — obrigatória

Após envio com sucesso:

- mostrar confirmação amigável;
- limpar/fechar o formulário conforme a interação definida na UI;
- nunca expor detalhes internos de erro ao utilizador.

### 2.3 Backend e armazenamento

Criar endpoint público dedicado para submissão de interesse em franquia.

Requisitos:

- validação server-side;
- rate limiting;
- tamanho máximo de campos;
- sanitização/normalização dos dados necessários;
- armazenamento antes da tentativa de e-mail;
- nenhum endpoint público para listar contactos.

Entidade conceitual `FranchiseLead`:

- id;
- nome;
- telefone;
- email;
- cidade/região;
- mensagem;
- status (`NEW`, `CONTACTED`, `ARCHIVED`);
- data de criação;
- data de atualização.

### 2.4 E-mail

Depois de guardar o contacto, a API tenta enviar notificação para:

`vaipizzapt@gmail.com`

O envio será configurado por variáveis de ambiente no backend, nunca no frontend. A implementação deverá suportar SMTP através de variáveis como:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `FRANCHISE_NOTIFY_EMAIL`

`FRANCHISE_NOTIFY_EMAIL` terá `vaipizzapt@gmail.com` no staging/produção.

Se o envio de e-mail falhar:

- a submissão continua considerada recebida se foi gravada na base;
- o erro é registado de forma segura no servidor;
- o contacto permanece visível no Admin.

## 3. Admin técnico simplificado

O Admin deixa de apresentar a experiência visual de várias empresas/restaurantes.

A instalação atual passa a ser tratada como uma única VAIPIZZA.

### Estrutura proposta

- Visão geral
- Funcionalidades
- Franquias
- Configurações técnicas existentes que ainda façam sentido

Remover ou ocultar componentes de UI cuja finalidade seja selecionar, comparar ou navegar entre múltiplas empresas/restaurantes.

Não remover dados/estruturas de backend de forma destrutiva sem necessidade; a simplificação inicial é funcional e visual, preservando compatibilidade enquanto a instalação operar como single-restaurant.

### Funcionalidades

Bloco curto com switches da instalação. Nesta entrega, obrigatório:

- Combos ON/OFF

A estrutura pode aceitar futuros feature flags sem transformar a tela numa lista extensa.

### Franquias

Lista compacta com:

- nome;
- cidade/região;
- telefone/e-mail;
- data;
- status.

Ao abrir um contacto, mostrar mensagem e detalhes completos em modal/drawer.

Ações:

- marcar como contactado;
- arquivar;
- reabrir/voltar para novo, se necessário.

## 4. Exportação de relatórios

Adicionar botão `Exportar CSV` na página de relatórios já existente da Gestão.

Regras:

- exportar exatamente o período/filtros ativos no momento;
- usar cabeçalhos claros em PT-PT;
- valores monetários devem ser exportados de forma consistente;
- não criar nova tela;
- o botão deve ficar junto aos filtros/ações já existentes;
- exportação não deve incluir dados fora da autorização do restaurante autenticado.

Se os dados já estiverem carregados integralmente no frontend para o filtro atual, a geração pode ocorrer no cliente. Se o relatório for paginado/parcial, a API deve fornecer exportação completa para o filtro aplicado.

## 5. Upload de imagens dos Combos

Reutilizar o fluxo de upload já existente na aplicação sempre que possível.

A Gestão deve permitir:

- escolher nova imagem;
- substituir imagem existente;
- remover imagem;
- visualizar preview.

O armazenamento final deve continuar por URL no combo. Não duplicar um segundo mecanismo de upload se o atual servir com segurança.

## 6. Segurança e autorização

- Cliente só acessa endpoints públicos de leitura de combos disponíveis e submissão de franquia.
- Gestão só cria/edita combos do restaurante associado ao token autenticado.
- Admin técnico controla feature flags e consulta/atualiza contactos de franquia.
- Nenhuma confiança em `restaurantId` vindo livremente do frontend para autorização.
- Endpoint de franquia recebe rate limiting e validação.
- Credenciais SMTP ficam apenas no Render/environment.
- Respostas públicas não retornam stack traces, dados internos ou contactos de franquia.
- RLS do Supabase permanece fechado para acesso público direto; a API/Prisma continua como camada de acesso.

## 7. Compatibilidade com pedidos, KDS e Estafeta

O carrinho/pedido deve persistir a composição do combo de forma suficiente para que:

- Gestão veja exatamente o que foi escolhido;
- Cozinha veja itens e opções de forma legível;
- total do pedido seja imutável após criação, mesmo que preço do combo mude depois;
- Estafeta não precise conhecer regras internas do combo, apenas pedido/entrega.

O pedido deve guardar snapshot das escolhas e preços aplicados no momento da compra, seguindo o mesmo princípio já usado para itens do pedido.

## 8. UI e comprimento das telas

Diretriz explícita desta entrega: não criar telas excessivamente longas.

- Combos: lista compacta + modal/drawer de edição.
- Franquias: lista compacta + modal/drawer de detalhe.
- Feature flags: card curto.
- Exportar CSV: ação na tela atual.
- Formulário público: modal/drawer curto.

Mobile deve continuar utilizável sem tabelas horizontais impossíveis de navegar.

## 9. Tratamento de erros

### Combos

- produto referenciado indisponível: retirar opção quando possível;
- combo inválido/incompleto: não publicar para Cliente e mostrar validação na Gestão;
- preço/acréscimo inválido: rejeitar no backend.

### Franquias

- erro de validação: mensagem de formulário clara;
- erro de base: informar que não foi possível enviar e permitir nova tentativa;
- erro apenas no e-mail depois de gravar: confirmar recebimento e manter lead salvo.

### Exportação

- filtro inválido ou falha de geração: erro não destrutivo na página de relatórios.

## 10. Testes mínimos obrigatórios

### Backend

- feature flag desativado esconde combos públicos;
- Gestão autorizada cria/edita combo;
- utilizador de outro papel não altera combo;
- validação de grupos obrigatórios;
- cálculo de acréscimos;
- disponibilidade por horário/status;
- criação de FranchiseLead;
- rate limit/validação do endpoint público;
- falha de SMTP não apaga lead;
- Admin lista e altera status de leads;
- exportação respeita restaurante e filtros.

### Frontend

- Cliente não mostra Combos quando desligado;
- Cliente configura combo e adiciona ao carrinho;
- Gestão cria/edita/troca foto/ativa/desativa;
- Admin altera flag e administra leads;
- formulário de franquia valida, envia e confirma;
- CSV baixa com filtro atual;
- layouts principais testados em desktop e mobile.

### Regressão

Repetir smoke test:

Cliente → Gestão → Cozinha → Estafeta → Cliente

Nenhuma alteração desta entrega deve quebrar autenticação por papel, Socket.IO, pedidos existentes ou o staging atual.

## 11. Deploy

Ordem recomendada:

1. migrations da base;
2. API staging;
3. validar `/health` e novos endpoints;
4. Gestão/Admin staging;
5. Cliente staging;
6. teste de Combos e Franquias;
7. teste de regressão do pedido completo;
8. somente depois considerar produção/domínios finais.

As credenciais SMTP serão configuradas diretamente no Render e nunca commitadas no Git.

## Fora do escopo desta entrega

- gestão centralizada de várias franquias/instalações;
- faturação de franqueados;
- CRM completo de vendas/franquias;
- automação de follow-up por WhatsApp;
- analytics avançado de funil de franquia;
- promoções complexas que não sejam representáveis pelos grupos de Combo definidos acima.
