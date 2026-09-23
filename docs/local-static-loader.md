# Cadeia /st/: remocao das injecoes JS do loader local

## Evidencia e limite da conclusao

O Initiator real fornecido identifica a insercao de um script pelo EAS como
origem da mutacao e `game...js:109` como callback que origina o pixel. Nao
identifica 1805 execucoes do loader. O trecho de game...js ainda nao foi fornecido;
nao e possivel afirmar qual algoritmo interno multiplica os pixels.

O codigo EAS nao contem MutationObserver em start/loadScript. O observer do
image tracer apenas le mutacoes e registra dados; nao injeta scripts ou imagens.
A hipotese de um loop EAS childList -> loadScript nao foi confirmada.

## Mapeamento exato do build anterior local-3bbd35f02cb9727e

O index era colocado sem transformacao em um Blob, portanto as linhas da stack
correspondem diretamente ao source index.js anterior:

| Stack real | Source original anterior | Acao |
| --- | --- | --- |
| UUID:95 loadScript | index.js:95 | Cria Promise e carrega dependencia |
| UUID:113 anonymous | index.js:113 | document.head.appendChild(script) |
| UUID:407 start | index.js:407 | loadScript services/minting-adapter.js |
| UUID:438-439 | index.js:438-439 | start() e fim da IIFE |
| userscript:441 | eas-tw-loader.user.js:183 | appendChild do Blob contendo index.js |
| userscript:445-446 | eas-tw-loader.user.js:187-188 | start() e fim da IIFE |
| PendingScript / childList | Frames assincronos do Chrome | Nao sao funcoes EAS |
| game...js:109 | Codigo do jogo nao presente no repositorio | Criador do request conforme Initiator |

A copia local anterior confirmou exatamente as linhas 441 e 445 citadas.
No build novo, comentarios EAS_SOURCE_BEGIN/EAS_SOURCE_END delimitam cada
arquivo original dentro das funcoes estaticas do userscript.

## Correcao do gatilho comprovado

Antes, o gerador guardava JS como strings; o loader transformava index.js em
script blob e index.loadScript repetia isso para cada dependencia. Os nos
ficavam no DOM. Agora o gerador emite funcoes estaticas, executadas no contexto
da pagina (`@grant none`, `@inject-into page`). Nao usa eval, Function, JS blob,
script.textContent ou appendChild de script no caminho local novo.

EASLocalBuild.execute tem uma Promise persistente por arquivo no documento.
Chamadas concorrentes compartilham a mesma Promise, inclusive rejeicoes. Um
arquivo ausente falha fechado, sem buscar outra versao remota. A instancia local
nao e substituida por reinjecao; uma nova versao requer documento novo/F5.
O loader aguarda o mesmo handshake ready/error, remove listeners/timer ao
terminar e nao repete automaticamente uma inicializacao que falhou.
Index tem uma trava por documento e loadScript mantem Promises em andamento.

O loader remoto continua disponivel. O novo caminho local nao passa por ele.
A folha CSS continua sendo um unico link blob por documento, como antes; a
correcao remove a cadeia de SCRIPT explicitamente identificada na stack.
As APIs GM opcionais de backup nao eram visiveis nos antigos scripts blob do
contexto da pagina; a execucao estatica continua nesse mesmo contexto.

Nao existem observers de carregamento. O tracer passivo continua singleton,
com dispose existente, para observar eventuais pixels apos o bootstrap. Nenhum
observer do Tribal Wars foi modificado/desconectado e nenhuma URL foi bloqueada.

## Medicao local antes/depois (pagina ociosa)

| Contagem por documento | Antes | Depois |
| --- | --- | --- |
| Inicializacao do loader / index | 1 / 1 | 1 / 1 |
| Dependencias solicitadas via loadScript | 32 | 32 |
| Scripts JS injetados pelo EAS | 33 | 0 |
| JS blobs criados pelo loader | 33 | 0 |
| Avaliacoes de index + dependencias | 33 | 33 funcoes estaticas |
| Coleta HTTP Market/Villages/Troops/Groups | 0 | 0 |

A medicao anterior encontrou 33 URLs distintas, sem repeticao. O observer de
medicao externa recebeu 37 callbacks no bootstrap anterior e 4 no novo. Esses
numeros incluem mutacoes da fixture/UI, nao callbacks internos do jogo. A
contagem /st/ na fixture sem game...js e zero antes e depois; NAO comprova sozinha
a eliminacao da tempestade real. A evidencia forte do patch e zero insercoes de
SCRIPT no ponto exato que causava a mutacao da stack real.

## Diagnostico e teste real

Instalar local-test/eas-tw-local.user.js, build local-ff26337db2715e1a.
F5 na Praca com EAS ON, sem abrir Hub ou executar Fake/Farm/Market. Executar:

```js
JSON.stringify(window.EASLoaderDebug(), null, 2)
JSON.stringify(window.EASImageTraceDebug(), null, 2)
```

No bootstrap ocioso esperado: loaderStarts=1, indexStarts=1, loadScriptCalls=32,
scriptsInjected=0, factoryExecutions=33. Repetir depois de alguns segundos:
contadores de carregamento devem permanecer estaveis. Os contadores do observer
passivo podem crescer conforme o jogo altera o DOM; isso nao indica reinjecao.
No Network verificar /st/ e copiar Initiator se ainda aparecer. Fazer depois
place -> map -> place: cada documento ganha session nova e uma inicializacao.
Apenas apos este teste ocioso considerar outro teste Fake.

EASLoaderDebug informa motivo, recurso, timestamp, build e session; URLs estao
presentes quando um recurso remoto/legado foi injetado. Contadores de observer
sao somente do tracer EAS. Nao fingem medir o callback externo do jogo.

## Arquivos desta rodada

scripts/build-local-userscript.py, eas-tw-loader.user.js, index.js,
core/loader-diagnostics.js, core/image-trace.js,
tests/fake-bootstrap-debug.test.cjs, tests/local-idle-bootstrap.test.html,
tests/fixtures/loader/idle-local-page.html, esta nota e userscript regenerado.
Nao foram editados Fake, Market, snapshot, confirmacao ou reconciliation nesta
rodada. Alteracoes anteriores desses arquivos permanecem no workspace.
Sem commit, push ou publicacao.

## Testes executados

- Node completo: 209/209, incluindo 730 comandos, snapshot, locks, UNCERTAIN,
  rate-limit e os novos testes de singleton/concorrencia/falha de dependencia.
- Browser completo: 36/37. Falha preexistente scheduled-mission-process2
  (noble 0 versus vazio e painel presente). Sem alteracao nesse fluxo.
- Novo teste browser: 52 assertions, userscript inteiro, 3 documentos novos,
  20 starts duplicados por documento, childList, estabilidade de recursos,
  cache local sem HTTP e registro lazy de modulo sem injecao.
- Sintaxe JS: 69 arquivos; sintaxe Python do gerador e git diff --check aprovados.

Validacao real no Violentmonkey/Tribal Wars ainda pendente.
