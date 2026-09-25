# Ofertas Inteligentes: auditoria antes da migracao

- modules/market-smart-offers.js calcula buildGlobalOfferSuggestions, guarda a
  analise em eas_tw_market_offers_analysis e seleciona itens do preview.
- MarketOffersExecution.start normaliza a fila (version 3), executionId, id por
  item, valores, repeticoes e duracao. Persiste em eas_tw_market_offers_execution.
- openCurrent abre own_offer da origem em popup e vigia/injeta loader a cada
  300 ms. A troca de aldeia navega para game.php?screen=market&mode=own_offer.
- prepareItem reutiliza reconcileQueueItem, selecao de recursos, valores,
  estabilizacao do campo multi e validacao de max_time. Salva previousSnapshot.
- mount guarda preparedSubmit, submissionLocked, listener e observer em closures.
  O usuario clica Criar esta oferta ou Criar do jogo para cada item.
- O parser snapshotOffers e detectCreatedSmartOffer reconhece aumento de oferta
  compativel/quantidade agrupada ou mensagem. reconcileUncertainOffer atualiza
  somente a aldeia atual, mas ausencia permite retrySafe e uma repeticao automatica.
- TransportExecutor e exclusivo de transporte: mode=send, try=confirm_send,
  titulo Confirmar transporte, botao Enviar. Nao prova confirmacao de ofertas.
- Persistem fila/status/snapshot/diagnosticos; nao existe attemptId duravel por
  submissao, nem autorizacao imutavel do lote ou trava persistente do click.

A nova orquestracao reutilizara preparacao, validacao, parser e cache. O caminho
legado nao sera convertido implicitamente em automatico. Confirmacao de oferta
so sera aceita com formulario nativo e todos os valores exatos preservados;
layout sem evidencia suficiente pausara. Nao sera usado selector de transporte
para enviar oferta. Nenhuma alteracao funcional no Fake.

## Implementacao

- `Executar ofertas` chama `startBatch`. O plano autorizado inclui identidade,
  origem, recursos, valores, repeticoes e duracao; alteracoes pausam a fila.
- `market-offers-batch.js` controla uma oferta por vez na mesma aba, vinculada
  por `window.name`. O bootstrap solicita resume nessa aba em cada documento.
  O servico e carregado sob demanda: bootstrap ocioso nao inicia coleta Market.
- Preparacao e validacao permanecem em `MarketOffersExecution`. O estado
  `prepared` agora leva automaticamente a `submitPreparedOffer`, a mesma funcao
  usada pelo botao manual `Criar esta oferta`. Apenas esse dispatcher aciona
  a submissao nativa, depois do callback de persistencia/read-back.
- `attemptId`, baseline, `submitAt` e prazo ficam no estado persistido antes
  da submissao. Web Locks serializa os resumes; revisao de storage invalida
  continuacoes antigas, inclusive quando PARAR ocorre durante preparacao.
- Reload de tentativa enviada executa somente reconciliacao/confirmacao ainda
  nao consumida. Resultado incerto ou erro apos envio nunca autoriza retry.
- O parser do lote usa IDs nativos de tr.offer_container. Somente um ID novo
  compativel conclui o item; mensagens e aumento de quantidade em ID antigo nao
  bastam. Ausencia de linhas e vazia valida apenas numa pagina reconhecida/pronta.
- Conclusao e persistida antes de cache/historico; a proxima oferta comeca
  somente apos reconciliacao, com intervalo de 700 ms. Nao ha scan global.
- 429 persiste pausa mesmo antes do bootstrap completo. STOP preserva a fila.
  Continuar/Pular so estao disponiveis para pausas recuperaveis sem marcador de
  submissao. PARAR e terminal; nao e uma pausa recuperavel.

## Validacao local e limites

Testes Node cobrem 1, 2 e 70 ofertas, identidade, concorrencia, navegacao,
confirmacao, STOP, storage, 429, logger e resultado incerto. A fixture browser
`market-offers-batch.test.html` executa preparacao real e dispatcher compartilhado
para duas ofertas sem clique adicional, verificando marcador antes do submit e
reconciliacao da quantidade. Requests inesperados nessa fixture falham o teste.

O formulario intermediario de confirmacao de ofertas nao foi fornecido pelo
jogo real: somente um formulario POST da propria origem com valores exatos e
campos ocultos preservados pode passar pelo adapter; variante desconhecida para.
As fixtures nao comprovam o comportamento da pagina real nem concorrencia com
ofertas criadas manualmente fora da fila. Nao operar o mesmo Mercado por fora
durante o teste de validacao.

Teste real: importar o userscript regenerado, selecionar exatamente 2 ofertas,
clicar Executar ofertas uma vez e autorizar o lote. Esperar 2 concluidas,
0 puladas e 0 erros, verificando tambem as ofertas na tabela do jogo. Se pausar
depois de enviar, coletar EASDebug e conferir o jogo; nao reenviar o item.

Rodada final: 234 testes Node aprovados; 38/39 paginas de testes browser
aprovadas. A falha de `scheduled-mission-process2.test.html` (nobre 0 versus
vazio e painel de missao antiga) tambem ocorre no HEAD, sem este patch.
Syntax checks e git diff --check passaram. Build local: local-fcc89e735c461116.

## Correcao do lifecycle de PARAR

Causa: STOP apenas gravava paused/USER_STOP, sem endedAt/finishedAt. O bootstrap
aceitava o registro e resume renderizava novamente o painel pausado. O tempo
continuava usando Date.now() menos createdAt. Uma inspecao diferida e esperas de
preparacao tambem nao tinham cancelamento completo.

O registro `eas_tw_market_offers_execution` continua sendo a unica fonte de
verdade operacional. `state` e autoritativo: somente running pode agir;
paused/rate_limited/uncertain/error sao restauraveis para revisao, sem submissao
automatica. A flag paused permanece por compatibilidade, mas nao sobrepoe um
estado de seguranca. O roteador rejeita estados terminais, desconhecidos,
autorizacao revogada e o USER_STOP legado.

PARAR grava cancelled, paused=false, stopReason=USER_STOP, startedAt/finishedAt,
endedAt e batchAuthorization.revokedAt; remove proximo horario/destino. Nao muda
o status nem a evidencia dos itens. Cancela timers, inspecao diferida, observer,
listeners e esperas de preparacao via AbortSignal; remove o painel e libera o
vinculo da aba. Chamadas repetidas nao regravam timestamps nem geram outro evento.
O tempo usa startedAt (authorizedAt/createdAt em registros antigos) e finishedAt.

Uma copia diagnostica terminal fica em
`eas_tw_market_offers_archive:<executionId>`, consultavel por
`EASMarketOffersDebug.getArchive(executionId)`. Arquivos diagnosticos nunca sao
consultados para resume. Uma fila nova ou limpeza nao pode sobrescrever/apagar
o registro anterior se seu arquivamento falhar. Se a escrita terminal falhar,
o runtime ainda cancela e libera a aba, e o registro original permanece intacto;
a falha de persistencia e propagada, sem declarar conclusao bem-sucedida.

Regressoes novas: 2 ofertas -> uncertain -> PARAR -> overview -> place -> market
-> F5 com o userscript local completo; zero novas submissões, painel ausente e
attemptId/snapshot preservados. Inclui cancelamento durante preparacao/intervalo,
idempotencia, flags divergentes, USER_STOP legado, tempo congelado e protecao do
arquivo diagnostico. A reconciliacao de ofertas e o Fake nao foram alterados.

## Reconciliacao por identidade nativa de oferta

`captureBatchSnapshot` e compartilhado entre BEFORE e AFTER. Fonte:
`tr.offer_container[data-id]`, com validacao cruzada de offer_ID, checkbox id_ID,
offer_count_ID, offer_time_ID e offerText_ID. Os IDs sao strings normalizadas,
deduplicadas; conflitos tornam a leitura indisponivel. data-count e wanted_*
sao confrontados com a oferta autorizada, juntamente com recurso/valor oferecido.

Pagina pronta significa documento complete, screen=market/mode=own_offer,
origem exata, ausencia de login e estrutura nativa reconhecida. Sem linhas,
uma tabela conhecida ou formulario POST nativo completo da propria origem
permite `available:true, offerIds:[]`. Sem evidencia estrutural, available:false.

A tentativa guarda beforeSnapshot com executionId, itemId, attemptId,
sourceVillageId e configuracao imutavel antes do dispatcher compartilhado.
Persistencia/read-back continuam obrigatorios. O diff AFTER menos BEFORE precisa
conter exatamente um ID e sua linha deve ser compativel. Nenhum ID aguarda o
deadline existente; multiplos IDs, incompatibilidade ou identidade divergente
pausam em uncertain. Nenhum caminho permite reenviar. O snapshot seguinte e novo.

OFFER_SNAPSHOT registra IDs/contagem/disponibilidade/persistencia; OFFER_RECONCILE
registra BEFORE/AFTER/diff/candidato/match/resultado no Logger central.

O outerHTML posterior de offer_369361 comprovou as celulas com
`.icon.header.wood`, `.icon.header.stone` e `.icon.header.iron`. O parser localiza
primeiro essas celulas, sem indices globais de TD ou nomes traduzidos. A primeira
fornece o recurso/valor oferecido; a segunda deve concordar com wanted_*.
`1<span class="grey">.</span>000` e lido como 1000; data-count=33 continua sendo
a quantidade de ofertas. Celulas ambiguas, valores ilegíveis ou atributos
divergentes nunca autorizam SUCCESS. A variante IMG/data-attribute anterior
permanece suportada quando nao existem icones nativos, sem mascarar conflitos.

OFFER_MATCH registra newOfferId, expected, parsed, compatible e mismatchFields.
`market-own-offer-native-icons.html` reproduz o fragmento real. Os testes cobrem
as seis combinacoes de recursos, baseline vazio/com ofertas antigas, unidade
1000/quantidade 33, multiplos IDs, campos inconsistentes e TDs adicionais.
Esta correcao altera somente parser/matcher e diagnosticos: lifecycle, snapshot
persistido, autorizacao, submissao, Violentmonkey, Fake e no-resend permanecem.
