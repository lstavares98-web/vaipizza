# VAIPIZZA V4 — Dispatch + Segurança de Staging

Esta entrega parte da V3 operacional aprovada.

## Dispatch
- GPS stale deixa de participar na escolha.
- Mantém oferta para um estafeta por vez.
- Proximidade continua a ser o fator principal.
- Estafetas praticamente equivalentes em distância entram numa rotação baseada em ofertas recentes.
- Rejeições agora contam para o limite de tentativas.
- Expirações/rejeições usam claims condicionais para reduzir duplicação por concorrência.
- Duplo aceite/rejeição deixa de sobrescrever a mesma oferta.
- Esgotamento não cancela comida pronta; cria alerta e exige atribuição manual.

## Segurança
- Role guard explícito em todos os frontends.
- Tokens locais separados por aplicação e renomeados para VAIPIZZA.
- Registo público de estafetas desligado por defeito.
- Credenciais demo removidas das telas de login.
- Password-reset token não é logado por defeito.
- Produção exige JWT secrets >= 32 chars e proíbe CORS wildcard.
- Headers de segurança adicionados para deploy Netlify.

## Nota
Refresh token ainda usa armazenamento browser nesta fase para não introduzir problemas de cookie cross-site enquanto o staging está em domínios temporários Netlify/host da API. Antes do domínio real, decidir entre subdomínios same-site + HttpOnly refresh cookie ou manter o modelo atual acompanhado de CSP e revisão XSS.
