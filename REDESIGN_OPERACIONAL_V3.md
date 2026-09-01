# VAIPIZZA — Redesign Operacional V3

Esta entrega mantém o Customer V2 aprovado e acrescenta a primeira transformação operacional.

## KDS / Cozinha
- visual fullscreen, escuro e de alto contraste;
- tickets em grelha responsiva;
- relógio de preparação usa o momento PREPARING quando disponível;
- estados textuais No tempo / Atenção / Atrasado;
- Delivery / Takeaway visível;
- modificadores e observações mais legíveis;
- uma única ação dominante: PRONTO;
- campainha só toca depois de a API confirmar o estado pronto.

## Estafeta
- shell mobile-first com identidade VAIPIZZA;
- estado online/offline muito claro;
- resumo de entregas/ganhos do dia;
- nova oferta com contagem decrescente;
- entrega ativa com mapa, destino atual e ações Navegar/Ligar;
- uma ação fixa e dominante por estado: Confirmar recolha → A caminho → Confirmar entrega;
- link de navegação externo para Google Maps sem nova dependência.

## Gestão da pizzaria (`apps/restaurant`)
- passa a ser visualmente o Admin operacional da VAIPIZZA;
- “Cardápio” alterado para “Menu” (PT-PT);
- sidebar profissional e navegação mobile;
- dashboard de pedidos mais claro, com estatísticas e estado ao vivo;
- Delivery/Takeaway, pagamento e total destacados nos cartões;
- catálogo com fotografia, descrição, disponibilidade, preço e ações organizadas;
- criação de categorias continua disponível também no telemóvel.

## Combos
Ainda não implementados porque faltam as regras comerciais do cliente. O desenho funcional está registado em `docs/COMBOS_BACKLOG.md`. Combos serão criados/geridos no painel da pizzaria e apresentados automaticamente no Customer.

## Validação disponível neste ambiente
- testes de apresentação/estado: 11 testes, 11 aprovados;
- sintaxe TypeScript/TSX dos ficheiros operacionais modificados validada com TypeScript transpileModule;
- estrutura de chavetas CSS validada.

## Limitação do ambiente
O `npm install` do ambiente ficou incompleto e não contém `vite/client`, por isso o build Vite completo deve ser confirmado no PC do projeto com dependências instaladas.
