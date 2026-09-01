# VAIPIZZA V5 — staging: Combos, Franquias, Admin e CSV

## Ordem de deploy

1. Guardar backup lógico/confirmar Supabase saudável.
2. Aplicar `apps/api/prisma/migrations/20260901222000_combos_franchise_v5/migration.sql` no projeto VAIPIZZA.
3. Atualizar API staging e confirmar `/health`.
4. Configurar SMTP no Render sem expor segredos:
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=465`
   - `SMTP_USER` = conta autorizada a enviar
   - `SMTP_PASS` = password de aplicação Google, nunca a password normal
   - `SMTP_FROM` = remetente autorizado
   - `FRANCHISE_NOTIFY_EMAIL=vaipizzapt@gmail.com`
5. Publicar Gestão e Admin staging.
6. Publicar Cliente staging; KDS também muda para apresentar composição de combos.
7. Testar todos os fluxos abaixo antes de produção.

## Smoke test V5

- Admin: Combos OFF → Cliente não vê Combos.
- Admin: Combos ON → Gestão pode publicar e Cliente passa a ver combos ativos.
- Gestão: criar combo fixo, trocar foto, editar preço, pausar e reativar.
- Gestão: criar combo com grupo “Escolha 2 pizzas” e opção com acréscimo.
- Cliente: configurar combo, adicionar ao carrinho e fechar pedido.
- Gestão/KDS: composição do combo aparece legível e o preço fica snapshotted no pedido.
- Pedido comum sem combo continua funcionando.
- “Seja um franqueado”: valida campos, grava lead, envia notificação e aparece no Admin.
- Admin Franquias: mudar NEW → CONTACTED → ARCHIVED e reabrir.
- Relatórios: Exportar CSV usa o intervalo atualmente escolhido.

## Segurança

- Não colocar credenciais SMTP no Git, Netlify ou frontend.
- Endpoint de franquia tem rate limit dedicado de 5 envios / 15 min / IP.
- Leads só podem ser listados/alterados por SUPER_ADMIN.
- Combos de Gestão derivam `restaurantId` do token; não aceitam restaurantId livre do browser.
- Novas tabelas têm RLS ativado e nenhuma policy pública.

## Produção

Só promover depois de repetir o fluxo Cliente → Gestão → Cozinha → Estafeta → Cliente e rever `npm audit` sem executar `npm audit fix --force` automaticamente.
