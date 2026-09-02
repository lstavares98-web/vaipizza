# VAIPIZZA — Dispatch, GPS e Operação de Estafetas V6

## Objetivo

Tornar o módulo de estafetas confiável para operação real: GPS verdadeiro com qualidade conhecida, exclusão automática de posições antigas ou imprecisas, limite geográfico próprio de despacho, fila ordenada, redistribuição segura, estados coerentes e visão operacional na Gestão.

## Evidência que motivou a mudança

Em staging, dois telemóveis reais foram usados em Braga e Lisboa. O backend recebeu coordenadas distintas e o estafeta em Lisboa mudou de posição durante uma deslocação real. Quando o navegador saiu da tela ativa/foi para segundo plano, `locationUpdatedAt` deixou de avançar; ao voltar ao app, o GPS voltou a atualizar. O pedido #22 também provou que expiração/rejeição já são registadas, mas a política atual ainda não impede um estafeta muito distante de ser candidato e usa um limite fixo de tentativas.

## Requisitos funcionais

### 1. GPS e privacidade operacional

- O GPS vem exclusivamente da Geolocation API do dispositivo; Leaflet apenas visualiza os pontos.
- Guardar `lat`, `lng`, `locationUpdatedAt` e `locationAccuracyM`.
- O app do estafeta mantém `watchPosition` ativo enquanto o estado de trabalho não for `OFFLINE`.
- Além do `watchPosition`, o app envia heartbeat da última posição a cada 15 segundos enquanto a página estiver ativa. Isto evita que um estafeta parado fique artificialmente com GPS antigo.
- Ao voltar para foreground (`visibilitychange`) o app força uma nova leitura de alta precisão e envia imediatamente.
- Ao ficar online, o estafeta precisa primeiro de fornecer uma posição recente e com precisão aceitável; caso contrário permanece offline e recebe uma mensagem clara.
- O navegador pode suspender localização/timers em background. O sistema não finge resolver essa limitação: depois de 120 segundos sem atualização, o backend considera o GPS desatualizado e exclui o estafeta do despacho.
- Limite inicial de precisão para despacho automático: 100 metros, configurado no backend por `COURIER_MAX_ACCURACY_METERS`.

### 2. Zona operacional de estafetas

- Criar `Restaurant.courierDispatchRadiusKm`, separado de `deliveryRadiusKm`.
- Valor inicial: 12 km.
- Um estafeta pode permanecer online fora da zona, mas nunca pode receber oferta automática nem ser escolhido manualmente enquanto estiver fora do raio.
- O mesmo bloqueio vale para GPS ausente, antigo ou impreciso.
- A Gestão consegue alterar o raio operacional e a coordenada real da pizzaria.

### 3. Política de elegibilidade

Um estafeta só é elegível para uma nova oferta quando todos forem verdadeiros:

1. conta `APPROVED`;
2. `status === AVAILABLE`;
3. latitude/longitude válidas;
4. `locationUpdatedAt` não tem mais de 120 s;
5. `locationAccuracyM <= 100`;
6. distância até a coordenada da pizzaria `<= courierDispatchRadiusKm`;
7. ainda não recebeu oferta para aquele pedido.

A escolha entre elegíveis continua nearest-first, preservando fairness entre candidatos praticamente equivalentes.

### 4. Fila e redistribuição

- `WAITING_FOR_COURIER` é uma fila ordenada pelo pedido mais antigo.
- Uma oferta continua exclusiva para um único estafeta e expira pelo TTL já configurado.
- Rejeição: libertar o estafeta, incrementar `assignmentRetryCount` como auditoria e tentar imediatamente o próximo candidato não testado.
- Expiração: marcar `EXPIRED`, libertar o estafeta, incrementar o contador e tentar o próximo candidato no mesmo sweep.
- Remover o limite fixo de `MAX_ASSIGNMENT_RETRIES` como condição que bloqueia a fila. O número de estafetas elegíveis pode ser maior que cinco.
- Nunca repetir automaticamente para o mesmo estafeta no mesmo pedido.
- Se não houver estafeta elegível porque todos estão ocupados/offline/GPS inválido/fora da zona, o pedido permanece em fila sem ser cancelado.
- Quando um estafeta fica `AVAILABLE` (entra online ou conclui entrega), disparar imediatamente a fila; o primeiro pedido antigo compatível é oferecido.
- Se todos os estafetas geograficamente elegíveis conhecidos já recusaram/expiraram naquele pedido, criar/atualizar alerta `ASSIGNMENT_EXHAUSTED`. O alerta não impede um novo estafeta, ainda não testado, de receber a oferta posteriormente.
- Ao aceitar uma oferta, resolver alertas de despacho abertos daquele pedido.

### 5. Estados do estafeta

Usar os estados já existentes no schema em vez de criar enum novo:

- `OFFLINE`: não trabalha/não rastreia.
- `AVAILABLE`: online, livre e elegível se o GPS passar nas regras.
- `ASSIGNED`: oferta exclusiva pendente, ainda não aceite.
- `GOING_TO_RESTAURANT`: aceitou e está a caminho da recolha.
- `PICKED_UP`: pedido recolhido.
- `DELIVERING`: entrega em curso.
- `AVAILABLE`: automaticamente após `DELIVERED`.

`AT_RESTAURANT` permanece reservado para uma futura ação explícita de chegada; não será inventado automaticamente.

### 6. Gestão — mapa e diagnóstico

Adicionar ao ecrã de Pedidos um painel “Estafetas ao vivo” com Leaflet/OpenStreetMap.

Para cada estafeta aprovado mostrar:

- nome;
- estado;
- posição quando disponível;
- distância até à pizzaria;
- `locationUpdatedAt` em linguagem legível;
- precisão em metros;
- pedido ativo, se houver;
- elegível/não elegível e motivo (`offline`, `ocupado`, `GPS desatualizado`, `GPS impreciso`, `fora da zona`).

No mapa:

- marcador da pizzaria;
- círculo do raio operacional;
- marcador de cada estafeta com localização conhecida;
- círculo de precisão quando `locationAccuracyM` existir.

A lista de reatribuição manual usa a mesma política. O botão “Escolher” fica desativado para qualquer estafeta não elegível, e o backend reforça o bloqueio mesmo que alguém manipule o frontend.

### 7. Definições da pizzaria

Na Gestão/Definições:

- manter morada textual;
- permitir definir `lat`/`lng` reais por mapa/pino;
- botão “Usar a minha localização” para capturar GPS do dispositivo quando o gestor estiver fisicamente na pizzaria;
- permitir configurar `courierDispatchRadiusKm`;
- deixar explícito que o raio operacional dos estafetas é diferente do raio de entrega aos clientes.

### 8. Socket/polling

Não criar um protocolo Socket.IO novo apenas para o mapa nesta versão. O painel operacional consulta o endpoint de estafetas a cada 10 segundos. Ofertas e estados dos pedidos continuam por Socket.IO como hoje. Esta escolha reduz risco e é suficiente para operação, já que o GPS do estafeta chega ao backend a cada ~15 s.

## Modelo de dados

### Restaurant

Adicionar:

```prisma
courierDispatchRadiusKm Float @default(12)
```

### Courier

Adicionar:

```prisma
locationAccuracyM Float?
@@index([status, locationUpdatedAt])
```

## API

### `POST /courier/location`

Entrada:

```json
{ "lat": 41.56, "lng": -8.40, "accuracyM": 12.4 }
```

Validação: lat [-90,90], lng [-180,180], accuracyM [0,50000].

### `POST /courier/online`

Ao ligar, exige GPS recente e precisão <= limite. Não exige estar dentro do raio, para permitir que Lisboa apareça online porém inelegível.

### `GET /restaurant/orders/couriers/nearby`

Mantém o caminho por compatibilidade, mas passa a devolver:

```json
{
  "restaurant": { "lat": 0, "lng": 0, "courierDispatchRadiusKm": 12 },
  "couriers": []
}
```

Cada courier inclui diagnóstico operacional e elegibilidade.

### `POST /restaurant/orders/:id/reassign-courier`

Revalida no backend: disponível, aprovado, GPS recente, GPS preciso e dentro do raio.

## Segurança e concorrência

- O backend continua sendo a autoridade; o frontend nunca decide elegibilidade sozinho.
- A reserva atómica `AVAILABLE -> ASSIGNED` permanece dentro de transação para impedir duas ofertas simultâneas ao mesmo estafeta.
- A trava in-memory por `orderId` permanece enquanto o Render usar uma instância. Horizontalização futura exigirá advisory lock PostgreSQL.
- Nenhuma localização de estafeta é exposta ao cliente final; apenas a Gestão autenticada e o próprio app do estafeta usam estes dados nesta versão.

## Testes obrigatórios

1. candidato fora de 12 km nunca é escolhido;
2. candidato com GPS >120 s nunca é escolhido;
3. candidato com precisão >100 m nunca é escolhido;
4. candidato fresco/preciso/dentro do raio é escolhido;
5. fairness continua funcional entre candidatos próximos;
6. rejeição passa para candidato seguinte;
7. expiração passa para candidato seguinte;
8. todos ocupados => pedido continua `WAITING_FOR_COURIER`;
9. estafeta torna-se disponível => fila antiga tenta imediatamente;
10. reatribuição manual fora do raio/GPS ruim é bloqueada;
11. tracking continua na rota `/delivery`, `/earnings` e `/history` enquanto o estafeta não estiver offline;
12. retorno ao foreground força atualização do GPS;
13. **Braga × Lisboa obrigatório em staging:** Lisboa online e com GPS real não pode receber pedido da instalação de Braga, nem quando for o único estafeta livre;
14. ecrã bloqueado/background: após >120 s sem GPS, o estafeta deve aparecer como `GPS desatualizado` e ficar inelegível; ao voltar ao app deve recuperar automaticamente.

## Critério de conclusão

A funcionalidade só será considerada pronta quando builds da API, Courier e Restaurant passarem, testes automatizados da política passarem, migração estiver aplicada em staging e o teste real Braga × Lisboa provar o bloqueio geográfico e a recuperação do GPS após foreground.
