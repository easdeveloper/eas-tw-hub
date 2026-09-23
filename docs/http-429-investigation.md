# HTTP 429 / pixels /st/: auditoria e contencao

## Conclusao comprovada e limite

Nao foi identificado no EAS um criador de /st/<payload>.gif. O tracer de imagens
(core/image-trace.js) apenas le DOM/performance, decodifica Base64 e correlaciona
strings; nao atribui src a IMG, nao cria IMG, nao usa fetch/beacon e nao transforma
eventos em recursos. EASFakeImageDebug tambem e leitura. core/logger.js usa memoria,
timer e localStorage. O userscript gerado contem esses mesmos fontes embutidos.

Portanto NAO ha arquivo/linha comprovado como autor dos pixels, nem contagem
comprovada de pixels eliminados. Os blobs EAS e o payload previamente decodificado
sugerem correlacao, mas a pilha do criador de IMG/Initiator ainda e necessaria.
Nao foi removida/ocultada/bloqueada nenhuma imagem ou URL /st/.

Redundancia comprovada: index.js carregava core/logger.js como asset mesmo quando
o userscript local ja executara o logger antes do loader. O guard interno evitava
listeners duplicados, mas nao a criacao do script/blob. Agora index reutiliza o
logger existente e o novo guard precoce. Elimina UM blob JS por bootstrap completo
local em relacao ao build anterior; nao equivale a comprovar uma request /st/ a
menos. O guard novo nao adiciona um blob proprio no modo local.

## Classificacao da busca final no userscript gerado

- new Image: 0; createElement('img' / "img"): 0; sendBeacon: 0.
- fetch: 8 sites funcionais: aldeias, grupos, tropas, mapa (2), Mercado,
  velocidades de unidades e adapter de moedas. Nenhum fetch de diagnostico.
- XMLHttpRequest: 3 strings de header X-Requested-With, nenhum construtor/interceptor.
- /st/: 8 referencias no bundle bruto, pertencem ao tracer (embutido e executado).
  Sao filtros/decodificacao/descricao de dados, nao geracao de URL de requisicao.
- .gif: 7 referencias literais no bundle bruto: tracer, auditoria Fake e parser
  de nomes de unidades. Nao ha criacao de GIF.
- atob: 2 referencias (mesmo tracer duplicado como texto embutido e script inicial);
  btoa: 0. O retorno de atob so e campo JSON.
- Imagens funcionais por HTML: icones .webp do Mass Snipe e .png do contador de
  tropas; nao sao /st/ nem diagnostico. src dinamico de scripts pertence aos loaders.
- Blobs: JS/CSS locais e exportacao CSV; JS de index/loader revogado apos load;
  CSV tem revoke agendado. CSS dura a pagina. Revogacao nao prova causa de pixels.
- MutationObservers: observacao/espera por DOM, nao geracao de imagens. Tracer tem
  guard global e agora dispose; logger tambem expoe dispose para seus listeners.

Inventario detalhado de ocorrencias: local-test/network-static-audit.json.
Contagens sao de texto bruto; fontes embutidos podem aparecer duas vezes.

## Instrumentacao local

NETWORK_REQUEST_SOURCE no EAS.Logger registra a criacao de recursos EAS ja existente:
asset/caller, operation, timestamp, URL sanitizada pelo logger, stack local, buildId
e navigationCount diagnostico da aba. Nao autoriza atribuir a criacao do IMG ao EAS.
__EASImageTraceMark continua somente memoria/log local, sem criar request.
EASImageTraceDispose desconecta observer/listeners. __EASLogger.dispose remove
listeners e faz flush local. Guards globais impedem duplicacao por reinjecao.

## RATE_LIMITED

core/rate-limit.js e embutido antes do loader local. Instala no maximo um
PerformanceObserver passivo e detecta a pagina com 'Solicitacao bloqueada' +
'muitos pedidos'. Verifica status 429 em performance quando disponivel e recebe
status real dos requests ja existentes nos adapters. Nao intercepta fetch/XHR.

Ao detectar: para runtime/timer Fake, persiste paused=true e context.rateLimit
state=RATE_LIMITED, preservando status/attempt/snapshot/locks. Loader/index param
novas cargas. Requests proprios consultam o guard antes de iniciar e reportam 429.
O Mercado nao faz seu retry quando esse guard esta instalado. Requests ja em voo
e trafego iniciado pelo jogo/extensoes nao podem ser cancelados por esse guard.
Status de recursos de terceiros pode nao estar exposto; nao e garantido detectar
um 429 oculto pelo navegador. Pagina bloqueada e respostas fetch EAS sao verificadas
independentemente desse campo. Nenhum probe e enviado.

Nao ha retry automatico nem timer de recuperacao. Em nova pagina saudavel, somente
comando pending sem tentativa iniciada pode ser liberado explicitamente por
EASRateLimit.resumeUnsent(). Para continuar depois, recarregar manualmente o Hub.
Tentativas preparadas/enviadas/incertas nao sao liberadas por essa funcao: precisam
da recuperacao manual existente, sem reenviar. Nao chamar para contornar bloqueio
ativo: o documento que observou 429 nunca e liberado por ela.

## Trafego legitimo do Fake

O executor faz leitura DOM/localStorage no polling de 200ms (nao requests), um
submit Atacar, um submit final por tentativa, retorno/navegacao nativa do jogo e
abertura da proxima origem conforme a fila. O servidor pode acrescentar redirects
e cada pagina carrega recursos proprios. A quantidade HTTP exata depende do
Network real; o codigo nao prova um numero fixo. Cada pagina nova pode criar novos
blobs locais do bootstrap; reinjecao na mesma pagina reutiliza guards. Background
Data pode atualizar caches obsoletos via requests funcionais, separados do polling.
Nao foram alterados delay, snapshot, alvo, confirmacao ou reconciliacao.

## Prova ainda necessaria da autoria /st/

Em pagina ociosa, sem fila automatica, usar DevTools: selecionar BODY#ds_body,
Break on > Subtree modifications, continuar ate insercao de IMG /st/, copiar a
Call Stack e URL/linha do script. Alternativamente, Network > /st/...gif > Initiator.
Guardar EASImageTraceDebug() para correlacao exata de blobs e numero por pagina.
Isso nao cria requests de diagnostico. Nao repetir fila de 335 para capturar.
Nao instalar patch global em appendChild/src/fetch para tentar adivinhar autoria.
Sem essa pilha, nao afirmar que a tempestade foi eliminada nem seu autor.

## Arquivos desta rodada

core/rate-limit.js, core/image-trace.js, core/logger.js; index.js,
eas-tw-loader.user.js, scripts/build-local-userscript.py;
services/fakes-execution.js; pontos de requests existentes em core/groups.js,
core/villages.js, core/troops.js, services/public-map.js, services/market-engine.js,
services/mass-snipe-execution.js e services/minting-adapter.js;
tests/rate-limit.test.cjs, tests/image-trace.test.cjs, tests/logger.test.cjs,
tests/fakes-auto-execution.test.cjs; esta nota e userscript local regenerado.

Build local-73aeafb0a3916ff5. Sem commit/push/publicacao. Validacao real pendente.

Validacao: 195/195 testes Node completos (730 comandos sem IMG/script/link, fetch,
XHR ou beacon do executor), testes de rate-limit novamente aprovados apos ajuste
da verificacao manual, syntax de 67 arquivos e git diff --check aprovados.
Browser: 35/36 apos repetir minting isoladamente (ficou running inicialmente);
permanece a falha preexistente scheduled-mission-process2.
