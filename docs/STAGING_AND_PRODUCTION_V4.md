# VAIPIZZA — Staging e preparação para produção (V4)

## Objetivo

Colocar a VAIPIZZA online primeiro num ambiente de staging, mantendo Cliente, Gestão, Cozinha, Estafeta e Admin separados e protegidos por função. O domínio principal só deve ser ligado depois dos testes de fluxo, autorização, performance e carga.

## Arquitetura recomendada

- Customer: Netlify
- Gestão: Netlify
- KDS/Cozinha: Netlify
- Estafeta: Netlify
- Admin técnico: Netlify, sem divulgação pública
- API + Socket.IO + dispatch: serviço Node de longa duração (Railway/Render/Fly.io equivalente)
- Base de dados: Supabase PostgreSQL

A API não deve ser convertida em funções serverless de curta duração porque o dispatch usa Socket.IO e um sweep periódico.

## Separação por aplicação

Cada frontend aponta para a mesma API através de `VITE_API_URL`. O backend continua a ser a autoridade de segurança:

- Customer: `CUSTOMER`
- Gestão: `RESTAURANT_OWNER` / `RESTAURANT_STAFF`
- Cozinha: `KITCHEN`
- Estafeta: `COURIER`
- Admin técnico: `SUPER_ADMIN`

A V4 também repete esta verificação no frontend para impedir que um token de outra aplicação revele a interface errada.

## Dispatch V4

A oferta continua a ir para **um estafeta de cada vez**. Isso evita duas pessoas aceitarem o mesmo pedido.

A seleção agora segue estas regras:

1. só considera estafetas `AVAILABLE` e `APPROVED`;
2. só considera GPS recente (por defeito, atualizado nos últimos 120 segundos);
3. um estafeta claramente mais próximo continua a ter prioridade;
4. quando dois ou mais estão praticamente à mesma distância, o sistema favorece quem recebeu menos ofertas nos últimos 30 minutos;
5. rejeição e expiração contam como tentativa falhada;
6. a mesma oferta não pode ser aceite/rejeitada duas vezes devido a duplo clique/corrida simples;
7. ao atingir o limite de tentativas, o pedido **não é cancelado automaticamente**: fica `WAITING_FOR_COURIER` e Gestão recebe alerta para atribuição manual.

Observação: a primeira produção deve usar uma única instância da API. A V4 inclui um lock por pedido dentro do processo. Se a API for escalada horizontalmente para múltiplas instâncias, substituir esse lock por advisory lock/claim distribuído no PostgreSQL antes de escalar.

## Estafetas

O auto-registo público está desligado por defeito (`ALLOW_PUBLIC_COURIER_REGISTRATION=false`). O site do estafeta mostra apenas login. No futuro, a criação/gestão de estafetas deve ficar dentro da Gestão da pizzaria.

## Segurança adicionada na V4

- chaves de sessão separadas e renomeadas por aplicação;
- role guard em cada frontend;
- credenciais demo removidas dos formulários;
- auto-registo público de estafeta desligado por defeito;
- tokens de recuperação de palavra-passe deixam de ir para logs por defeito;
- produção rejeita JWT secrets com menos de 32 caracteres;
- produção rejeita CORS `*`;
- headers Netlify: CSP, anti-frame, nosniff, referrer policy e permissions policy;
- coordenadas continuam protegidas pelo login do estafeta e dispatch só usa localização recente.

## Variáveis de staging

### API

Usar `apps/api/.env.example` como referência. No host da API, configurar pelo painel de secrets; nunca commitar `.env`.

Para os Netlify temporários, `CORS_ORIGINS` deve listar exatamente os URLs reais dos cinco sites, separados por vírgula.

### Frontends

Cada site Netlify recebe:

`VITE_API_URL=https://URL-DA-API-DE-STAGING`


## Configuração Netlify por site

Criar cinco sites separados apontando para o mesmo repositório/branch de staging, todos com base no root do monorepo:

| Site | Build command | Publish directory |
|---|---|---|
| Customer | `npm run build -w apps/customer` | `apps/customer/dist` |
| Gestão | `npm run build -w apps/restaurant` | `apps/restaurant/dist` |
| Cozinha | `npm run build -w apps/kds` | `apps/kds/dist` |
| Estafeta | `npm run build -w apps/courier` | `apps/courier/dist` |
| Admin técnico | `npm run build -w apps/admin` | `apps/admin/dist` |

Cada site recebe `VITE_API_URL` como variável de ambiente. Os ficheiros `public/_redirects` mantêm SPA routing e os novos `public/_headers` aplicam os headers de segurança.

## Ordem de publicação

1. criar base staging Supabase separada da produção;
2. aplicar migrations;
3. subir API staging;
4. confirmar `/health`;
5. subir Customer;
6. subir Gestão;
7. subir KDS;
8. subir Estafeta;
9. subir Admin técnico;
10. preencher CORS com os URLs definitivos do staging e reiniciar API;
11. executar fluxo completo pela internet;
12. testar tentativas de acesso cruzado entre roles;
13. medir performance;
14. executar teste de carga;
15. só então apontar os domínios reais.

## Testes obrigatórios antes do domínio real

- Customer A não vê pedido de Customer B.
- Customer não entra em Gestão/KDS/Estafeta/Admin.
- Estafeta A não aceita/edita entrega do Estafeta B.
- KDS só vê restaurante associado ao token.
- Staff/Owner só vê o restaurante associado ao token.
- Admin técnico exige `SUPER_ADMIN`.
- Oferta expirada não pode ser aceite.
- Rejeição dupla não incrementa duas tentativas.
- GPS antigo não recebe oferta.
- pedidos com dispatch esgotado não são cancelados automaticamente.
- Socket.IO não permite subscrição arbitrária de salas.
- CORS rejeita origem não autorizada.
- upload rejeita ficheiros/tamanhos proibidos (auditar antes de produção).
- recuperação de palavra-passe usa email transacional real (ainda é um blocker de produção).
- teste de carga com, no mínimo, 30 clientes concorrentes e operação simultânea de Gestão/KDS/Estafeta.

## Blockers que continuam antes de produção

1. ligar um fornecedor de email transacional ao reset de palavra-passe;
2. auditoria final de uploads e pagamentos reais;
3. build completo em ambiente limpo/CI;
4. staging online e smoke/E2E real;
5. carga e performance;
6. se houver mais de uma instância da API, trocar o lock local do dispatch por lock distribuído no PostgreSQL.
