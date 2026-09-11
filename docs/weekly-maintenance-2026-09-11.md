# Manuten??o semanal ? 2026-09-11

## Escopo e sa?de

Revis?o est?tica de core, services, modules, index.js, loader.js e eas-tw-loader.user.js; baseline e regress?o locais. Nenhuma a??o no jogo, mudan?a de contrato de POST, novo recurso, commit ou altera??o de permiss?es do userscript. Esta varredura n?o equivale a uma auditoria exaustiva de seguran?a ou a uma medi??o em uma conta real.

A arquitetura mant?m UI em modules, execu??o/adapters em services e infraestrutura em core. Grupos/aldeias j? possuem deduplica??o de requisi??es em andamento; mercado e mapa p?blico tamb?m possuem testes dessa prote??o. O mapa p?blico tem cache com TTL. A Cunhagem oficial n?o possui scheduler/restaura??o autom?tica. Automa??es intencionais de miss?es, farm e snipe foram preservadas.

## Altera??es aplicadas

| Classifica??o | Arquivo | Evid?ncia e altera??o |
|---|---|---|
| PERFORMANCE | core/groups.js | getAll reconstru?a a lista de aldeias pr?prias por grupo; agora compartilha um Set apenas durante a chamada. getById consulta o registro solicitado sem construir/ordenar todos os grupos. Sem cache novo, altera??o de associa??o ou requisi??o HTTP. |
| RELIABILITY | core/runtime.js | Timeouts criados em outra janela eram cancelados com clearTimeout da janela principal. Agora s?o cancelados na janela propriet?ria, inclusive quando duas janelas t?m o mesmo ID. Callback j? enfileirado fica inerte ap?s dispose. |
| RELIABILITY / CLEANUP | services/mass-snipe-precise.js | Cancelamento usa runtime.clearTimeout para liberar tamb?m o registro de propriedade do timer. N?o altera scheduler, rel?gio, compensa??o ou clique. |
| RELIABILITY | loader.js | A Promise de handshake recebe tratamento de rejei??o imediatamente, enquanto o download continua. O erro continua sendo propagado por start; n?o ? transformado em sucesso. |
| SECURITY / PERFORMANCE | core/observability.js | URL do contexto deixa de incluir par?metros arbitr?rios/fragmentos. Mant?m rota, screen/mode e village. pageContext ? calculado uma vez por entrada, antes podia ser duas. |
| SECURITY | loader.js | Contexto do diagn?stico tamb?m exclui par?metros como h/token e fragmentos. Grants/connect, carregamento e execu??o do userscript n?o mudam. |
| MAINTAINABILITY | tests/weekly-maintenance.test.cjs, tests/loader.test.html | Regress?o de IDs de timers entre janelas, descarte/cancelamento, custo de grupos, sanitiza??o e handshake lento. |

A sanitiza??o trata a URL de contexto, n?o promete sanear qualquer string arbitr?ria enviada por todos os chamadores de log. Logs antigos n?o foram apagados, evitando destruir dados silenciosamente. URLs/detalhes e erros expl?citos de cada m?dulo ainda merecem auditoria espec?fica antes de compartilhar diagn?sticos.

## Medi??es

Harness local executado tanto no core/groups.js de HEAD (antes) quanto no c?digo novo, com 100 grupos e associa??o conhecida:

- getAll: 100 ? 1 chamadas de leitura da lista de aldeias pr?prias.
- getById: 100 ? 1 chamadas de leitura da lista de aldeias pr?prias.
- getById inexistente: teste confirma zero leituras de aldeias no c?digo novo.
- N?o foi medido ganho de tempo de bootstrap, FPS, mem?ria em MB ou redu??o de requests reais. N?o h? alega??o de ganho nessas m?tricas.

## Timers, jobs e listeners

Invent?rio est?tico abaixo identifica linhas com cria??o/cancelamento de timers nos arquivos de produ??o, incluindo o script independente da raiz. Uma linha minificada pode conter v?rias chamadas; os n?meros s?o localizadores, n?o contagem de timers vivos. Wrappers/cleanup em outro arquivo explicam linhas de cria??o sem cancelamento local.

| Arquivo | Cria??o setTimeout/setInterval | Cancelamento clearTimeout/clearInterval |
|---|---|---|
| core/runtime.js | 12, 14 | 13, 15 |
| core/utils.js | 48 | 37 |
| core/world-rules.js | 142 | 144 |
| eas-tw-loader.user.js | 110 | 94 |
| loader.js | 18, 19, 20 | 18, 19 |
| massSnipe.js | 761, 2361, 2689 | 2652, 2656, 2684 |
| modules/fakes.js | 1680, 1772, 1946 | 1679 |
| modules/troop-counter.js | 9 | ? |
| services/attack-preparation.js | 39, 45, 69, 72 | 68 |
| services/fakes-execution.js | 691, 1203, 1222 | 629, 803, 1153, 1188, 1224, 1234, 1243 |
| services/market-balance-execution.js | 28, 85, 112, 116, 128, 146 | 25, 28 |
| services/market-engine.js | 18 | ? |
| services/market-offers-execution.js | 74, 101, 132, 249, 305, 339 | 78, 101, 282 |
| services/market-target-execution.js | 21, 34, 39, 44, 45 | 18, 21 |
| services/mass-farm-execution.js | 13, 38 | 14, 31, 38 |
| services/mass-snipe-execution.js | 214 | ? |
| services/mass-snipe-precise.js | 184, 220 | 185 |
| services/minting-adapter.js | 78 | 90 |
| services/mission-scheduler.js | 41 | 42 |
| services/place.js | 111, 355, 426 | 320, 400 |
| services/scheduled-mission-execution.js | 25, 26, 52, 53, 62, 67, 71 | 58, 68, 115 |
| services/support-execution.js | 62, 63 | 45 |

Ciclo de vida revisado:

- Runtime: timers/intervals, observers e listeners s?o removidos por dispose; timeout com propriet?rio incorreto foi corrigido e coberto por testes.
- Cunhagem: somente timeout HTTP de 20s, limpo em finally; n?o h? timer de cunhagem ou renova??o.
- Loader/userscript: timeouts de script/handshake e listeners de ready/error t?m cleanup; o tratamento tardio da rejei??o do handshake foi corrigido. Timers curtos de remo??o de painel permanecem.
- MissionScheduler e scheduled-mission-execution: automa??o intencional, stop/cleanup e restaura??o de miss?es preservados. Os dois problemas conhecidos do teste process2 n?o foram modificados.
- Mass Snipe: countdown e scheduler preciso continuam com o ciclo de vida existente; s? mudou a libera??o do timer no runtime.
- Farm/mercado/fakes/apoio: polling e watchers de confirma??o/executores mantidos; existem cancelamentos por conclus?o/fechamento e limites em v?rios fluxos. N?o se afirma que todos os caminhos de navega??o reais foram exercitados.
- Painel flutuante: inicializa??o protegida; listeners de drag/resize e posi??o persistida s?o intencionais durante a vida do Hub. Nenhuma mudan?a visual/funcional.
- Attack preparation e watchers de abas: alguns registram IDs de timeouts conclu?dos at? cleanup e aguardam limites de tempo. Mantidos para n?o mudar prepara??o/agendamento nesta rodada; priorizar teste de fechamento repetido na pr?xima revis?o.

## HTTP, DOM, estado e c?digo morto

N?o se introduziu cache de HTML, h ou tokens. GET de revalida??o pr?-POST e GET de confirma??o da Cunhagem s?o necess?rios e foram mantidos. N?o houve aumento de concorr?ncia, retry de POST, flexibiliza??o de parser nem altera??o de contratos de formul?rio.

Grupos/aldeias fazem HTTP pr?prio; alguns GETs n?o possuem timeout expl?cito. Padronizar isso exige testes de timeout/abort por m?dulo, para n?o criar retry ou classifica??o incorreta de resultado. Ficou como acompanhamento.

index.js carrega depend?ncias em ordem e usa script tags/loadedScripts. H? um risco de considerar uma tag existente como carregamento conclu?do mesmo quando est? pendente ou falhou. N?o foi alterado nesta rodada porque exige validar todas as rotas de bootstrap silencioso e carregamento din?mico. Tamb?m n?o foram paralelizadas depend?ncias nem alterados cache-busters sem medir cold/warm load.

Refer?ncias est?ticas e namespaces foram consultados antes de considerar exclus?es. Nenhuma fun??o p?blica ou arquivo foi removido por simples aus?ncia de refer?ncia textual. Fixtures hist?ricas da Cunhagem e massSnipe.js independente foram preservados; nenhum caminho antigo de POST/scheduler da Cunhagem foi reativado. N?o foi identificado c?digo morto cuja remo??o fosse necess?ria e inequivocamente segura nesta rodada.

Estado do jogador, chaves, migra??es, sele??es e posi??o do painel n?o foram apagados. O diagn?stico tempor?rio da Cunhagem permanece marcado e habilitado, pois a investiga??o real ainda n?o foi conclu?da. O logger geral ainda persiste uma janela de at? 500 entradas; mudar pol?tica de DEBUG ou batching exige requisito pr?prio para n?o perder evid?ncia ?til.

## Testes e resultados

Baseline: 38 testes Node passaram; 32/33 p?ginas HTML passaram.
P?s-manuten??o: 43/43 testes Node passaram (incluindo cinco novos); 32/33 p?ginas HTML passaram novamente, com as mesmas duas falhas preexistentes. Sintaxe de 51 arquivos de produ??o e testes alterados, al?m de git diff --check, validada. Nenhuma nova falha foi identificada nesta su?te.

Falhas preexistentes, sem mascaramento, em tests/scheduled-mission-process2.test.html:

1. FULL sem nobre: esperado ["4300", ""], recebido ["4300", "0"].
2. Pra?a normal: painel de confirma??o antigo deveria estar ausente, mas estava presente.

Testes HTML usam Chrome headless com contexts novos e HTTPS externo bloqueado, servidos em localhost; requests de jogo s?o mocks. N?o houve execu??o no Tribal Wars. O teste Node de timezone precisa de permiss?o de subprocessos e foi executado fora da restri??o que bloqueava esse recurso.

## Pr?xima manuten??o

1. Resolver as duas falhas process2 como corre??o funcional separada, com caso real/fixture.
2. Testar ?ndice/loader sob download lento, falha parcial e dois carregamentos concorrentes antes de mudar deduplica??o/timeout.
3. Exercitar repetidas aberturas/fechamentos de prepara??o, mercado e farm e medir watchers/IDs retidos.
4. Auditar payloads/erros expl?citos de logs e innerHTML din?mico por m?dulo; a prote??o desta rodada ? restrita ao contexto de URL.
5. Validar o contrato da Cunhagem no jogo e ent?o desligar a flag tempor?ria. N?o fazer isso automaticamente sem a evid?ncia pendente.

Arquivos removidos: nenhum. Commit n?o executado.
Sugest?o: `chore(maintenance): weekly performance and cleanup pass`.
