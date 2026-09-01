# VAIPIZZA — Customer Redesign V1

Esta entrega altera apenas a experiência do cliente. API, KDS, estafeta, restaurant/admin e contratos do backend não foram alterados.

## O que mudou

- `/` deixou de redirecionar e passou a ser a homepage cinematográfica VAIPIZZA.
- `/pedir` passou a ser a rota permanente do menu single-store.
- `/restaurants/:slug` continua disponível por compatibilidade.
- Login passa a encaminhar para `/pedir`.
- Navegação do cliente foi redesenhada para desktop e telemóvel.
- Referências quebradas a `/logo.png` foram removidas; a identidade usa `/apple-touch-icon.png`.
- Menu, cards de produto e personalização receberam um novo layout responsivo.
- Estados de erro/carregamento do menu foram melhorados.
- Carrinho/API continuam exatamente com o modelo de autenticação atual nesta fase.

## Verificação já executada neste ambiente

- Teste RED/GREEN da configuração single-store: 3/3 a passar.
- Transpilação sintática dos ficheiros TypeScript/TSX alterados: OK.
- Balanceamento estrutural do CSS: OK.
- Pesquisa por referência `/logo.png` no customer: nenhuma ocorrência.

## Verificação local obrigatória

No teu PC, na branch de redesign e com os `.env` locais preservados:

```bat
npm install
npm run build -w apps/customer
npm run dev:api
```

Noutro terminal:

```bat
npm run dev:customer
```

Abrir:

```text
http://localhost:3000
```

Para o E2E completo, com a base de teste/seed preparada:

```bat
npm run test:e2e
```

## Nota do ambiente ChatGPT

O sandbox desta sessão não conseguiu terminar `npm install` por falta de acesso às dependências externas. Por isso o build Vite completo deve ser confirmado localmente antes de qualquer deploy.
