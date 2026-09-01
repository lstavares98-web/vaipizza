# VAIPIZZA — Customer V2

## O que mudou

- Hero cinematográfico preservado.
- O menu real começa imediatamente após o hero na homepage.
- CTA principal faz scroll direto para o menu.
- Menu editorial com fotografias maiores, cards mais elegantes e tipografia revista.
- Categorias sticky para navegação rápida no telemóvel.
- Produto abre em modal/bottom-sheet com hierarquia visual melhorada.
- Carrinho móvel fixo em baixo quando há itens.
- Resumo de carrinho lateral no desktop na rota de pedido.
- Horário semanal renderizado a partir dos dados reais da API.
- Contacto por telefone/WhatsApp após o menu, sem atrasar a compra.
- Paleta interna ajustada para verde profundo, vermelho quente, creme e dourado da identidade VAIPIZZA.
- Sem novas dependências runtime nesta iteração.

## Validação feita neste ambiente

- 11 ficheiros TypeScript/TSX modificados: transpile/syntax check sem erros.
- CSS: chaves balanceadas sem erro estrutural detectado.
- Build completo Vite não foi concluído neste ambiente porque o `node_modules` disponível está incompleto (`vite/client` ausente). O build deve ser validado na máquina local com as dependências normais do projeto.

## Teste local recomendado

```bat
cd C:\Users\luizs\Downloads\Yummix
npm install
npm run build -w apps/customer
npm run dev:customer
```

Depois abrir `http://localhost:3000` e testar primeiro em largura de telemóvel e desktop.
