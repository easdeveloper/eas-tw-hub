# Bootstrap local e coleta sob demanda

## Causa comprovada

`index.js` chama `EAS.Data.bootstrap()` na inicializacao e na reutilizacao da UI.
Antes, `core/game-data.js` iniciava `Villages.ensureFresh()` e
`Market.ensureFresh()` em `Promise.allSettled`, mesmo sem abrir o Mercado.
Cache Market obsoleto era convertido em `forceRefresh:true`; o engine recebia
`maxAgeMs:0` e percorria todas as aldeias. Cada aldeia consultada exige duas
leituras: Mercado/own_offer e Mercado/transports. Villages podia consultar a
visao geral em `requestAuthoritativeSnapshot`.

Troops e Groups nao tinham coleta automatica nesse bootstrap. Foram mantidos
sob demanda. Inicializar scripts registra APIs e le cache/DOM local.

## Alteracao

- Bootstrap retorna somente `EAS.State.snapshot()` local; nao agenda coleta.
- `initialize()` e `getCached()` dos dominios sao locais.
- `ensureFresh()` e `refresh()` continuam explicitos. Mercado reutiliza cache
  valido; demanda com cache obsoleto respeita TTL por aldeia. Force/invalidation
  explicitos continuam ignorando a idade do cache.
- Balance, Target Supply e Smart Offers solicitam dados ao abrir. Botoes de
  atualizacao e operacoes ativas mantem suas consultas e identificam o caller.
- Smart Offers preserva a montagem sincrona do painel; `dataReady` acompanha
  a atualizacao assincrona solicitada pela abertura.
- `CORE BACKGROUND_SCAN` / `BACKGROUND_SCAN_SKIPPED` registram module, reason,
  requestedBy, villageCount, forceRefresh, navigationCount e executionId.
  Chamadas sem identificador explicito preservam callerStack para auditoria.
- HTTP 429 nao tem retry automatico. Workers interrompem o restante da coleta;
  requests ja enviados podem terminar. RATE_LIMITED nao produz alert global.
- Nenhuma alteracao nesta rodada no envio, snapshot ou reconciliacao do Fake.

## Contagem por bootstrap normal

| Coleta | Antes, cache obsoleto e 62 aldeias | Depois |
| --- | --- | --- |
| Aldeias consultadas pelo Market | Ate 62 | 0 |
| HTTP Market | Ate 124 (2 por aldeia) | 0 |
| HTTP Villages overview | Ate 1 | 0 |
| HTTP Troops/Groups causado por bootstrap | 0 | 0 |

Antes e um limite derivado do codigo, nao o numero efetivamente concluido no
jogo (o 429 interrompeu aquela execucao). Depois foi verificado em testes com
stubs de coleta: map, place, inicializacao e 20 reinjecoes. Exclui recursos
JS/CSS do loader e requests nativos do jogo. Validacao no jogo ainda pendente.

## Arquivos desta rodada

core/game-data.js; index.js; modules/market-balance.js;
modules/market-target-supply.js; modules/market-smart-offers.js;
services/market-engine.js; services/market-balance-execution.js;
services/market-target-execution.js; services/market-offers-execution.js;
tests/data-lazy-bootstrap.test.cjs; tests/rate-limit.test.cjs;
tests/market-balance-stability.test.html; esta nota e userscript local gerado.
As demais alteracoes existentes no workspace pertencem as rodadas anteriores.

## Validacao real proposta

1. Instalar somente o userscript local novo. Abrir map e place sem abrir Mercado.
2. Em EASDebug(), verificar BACKGROUND_SCAN_SKIPPED / bootstrap-cache-only;
   nao deve haver refresh.scanStart Market causado por bootstrap.
3. Executar exatamente dois Fakes. Esperado: 2 enviados, 0 pulados, 0 erros.
4. Abrir uma funcao Market com cache obsoleto: a coleta deve identificar
   module-open; refresh manual deve identificar user-refresh.
5. Se ocorrer 429, interromper: nenhuma repeticao automatica ou reenvio incerto.

Build: local-3bbd35f02cb9727e. Sem commit, push ou publicacao.
Os /st/*.gif continuam investigacao separada; este patch nao comprova sua origem.

## Testes executados

Node completo: 206/206, incluindo 730 comandos simulados, bootstrap sem coleta,
cache, demanda, 429 sem retry e pausa persistente. Browser: 35/36; permanece
a falha preexistente scheduled-mission-process2 (campo noble 0 versus vazio
e painel ainda presente). Nove testes Market passaram. Syntax: 68 arquivos,
incluindo userscript gerado. git diff --check aprovado.
