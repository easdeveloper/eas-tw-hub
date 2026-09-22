# Estabilizacao e arquitetura Violentmonkey

## 1. Arquitetura anterior e dependencias

- `eas-tw-loader.user.js`: @match game.php no dominio BR e subdominios,
  document-idle, unsafeWindow, guard de pagina, carga silenciosa de index.
- `loader.js`: bookmarklet/manual com painel, timeout e listeners de readiness.
- `index.js`: carregamento sequencial dos services, estilos e core; guards por
  script/link e Set; ramo de UI existente; roteamento de resume silencioso.
- `core/eas.js`: cria namespace; nao e seguro executar arbitrariamente outra vez
  numa pagina viva, pois redefine objetos. O loader deve continuar impedindo isso.
- `core/runtime.js`: registry de runtimes, timers por janela, intervals, observers,
  listeners e dispose explicito. Nem todos os modulos usam esse registry.
- `core/game-data.js`: EAS.Data.* adapta Villages/Troops/Groups/Market; TTL,
  invalidacao e promises in-flight deduplicadas. Estado de cache nao autoriza envio.
- Groups: cache escopado por mundo/jogador, memberships e promises por grupo.
  Troops: snapshots e normalizacao de dimensoes; fetch autenticado e parser.
- MarketEngine: cache economico, deduplicacao de requests e backoff de leituras
  429; isso nao deve ser convertido em retry de submissao irreversivel.
- Farm: estado `eas-tw-hub:farm.mass.execution`, WeakMap local, limites e recovery
  de pagina. Reexecutar o arquivo diretamente perderia as closures de ownership;
  manter guard e validar reinjection separadamente antes de refatorar.
- Scheduled/Attack: scheduler persistido por contexto, autorizacao e tentativa,
  runtimes por window, finalClickConsumed e cleanup. Ha criterios de evidencia
  por URL/mensagem em caminhos existentes, diferentes do ID outgoing do Fake.
  Nao foram alteradas regras de ataque/recovery.
- Fake: storage proprio, window.name/executionTab, snapshot e attempt por comando,
  confirmacao nativa, retorno por navegacao e reconciliacao positiva por ID.
  Essas dependencias e ordem de persistencia/cliques foram preservadas.

## 2. Mudancas e arquitetura resultante

Violentmonkey -> guard por documento -> index -> core/services -> resume ja
existente, autorizado pelo estado funcional persistido. Nenhuma nova autorizacao,
retry ou trava funcional foi introduzida. Bookmarklet permanece compativel.

LOCAL: gerador embute fontes exatas, hash localBuildId e diagnosticos iniciais.
Logger instala antes do bundle; core/eas preserva sua referencia. Carregamento
posterior do logger reutiliza a instancia, sem duplicar listeners.
PRODUCTION: index carrega logger apos core/eas; falha de carga do logger nao
impede o restante do Hub. Erros anteriores a essa fase continuam nos diagnosticos
legados do loader. Nada foi publicado.

O userscript atual continua com nome de compatibilidade EAS TW Hub Loader.
Nao habilitar LOCAL e PRODUCTION simultaneamente: os guards evitam bootstrap
simples duplicado, mas nao sao um mecanismo de selecao/migracao entre builds.
Em pagina sem execucao, bootstrap silencioso nao autoriza cliques. Ainda existem
leituras de dados em background; nao se promete ausencia de rede.

### Migracao/atualizacao de producao

1. Validar LOCAL exato e guardar localBuildId.
2. Separar commits por responsabilidade depois de autorizacao, nunca nesta tarefa.
3. Publicar release imutavel com index e assets no mesmo diretorio versionado,
   BASE_URL correspondente e metadata @version do userscript atualizada juntos.
4. Testar instalacao limpa, atualizacao e rollback em pagina nova antes de mudar
   o canal estavel. Manter loader antigo durante a transicao.

O canal atual GitHub Pages usa URLs mutaveis/cachebuster e version 0.1.0. Esta
rodada prepara infraestrutura, mas nao implementa/publica o pipeline de releases
imutaveis. Esse risco permanece explicito; LOCAL nao possui fallback remoto.

## 3. Logger e exportacao

`core/logger.js`: EAS.Logger.debug/info/warn/error(module,event,data).
Cada evento tem timestamp, level, module, event, buildId, documentUrl e data.
`EAS.Log` antigo continua funcionando e encaminha eventos ao novo logger.
Aliases preservam action e nivel minusculo na leitura para consumidores antigos.
Historico antigo runtime.logs nao e apagado; nao e importado automaticamente.

Persistencia separada `eas_tw_diagnostics_v1`: ate 300 eventos, 24 horas, 180000
caracteres serializados (limite aproximado, nao bytes UTF-8), lote a cada 500ms,
flush em pagehide/visibilitychange/export. Limites de profundidade, campos,
strings, arrays e payload por evento. Ciclos, BigInt, getters e quota falhando
nao podem propagar erro ao executor. Pending tambem e limitado.
Nao ha polling do logger. Falha de storage conserva buffer limitado em memoria.
Multiplas abas fazem merge best-effort por ID ao persistir; localStorage nao e
transacional, entao escritas simultaneas ainda podem perder eventos. Nao existe
promessa de audit trail financeiro ou garantia contra encerramento abrupto.

URLs removem query arbitraria/fragment; mantem apenas screen/mode/village/try.
Campos de autenticacao, HTML e filas grandes sao omitidos. O export nao copia
DOM, tropas completas, tokens ou estado funcional inteiro. Diagnosticos legados
podem conter dados mais amplos; prefira o export central para compartilhamento.

```js
JSON.stringify(window.EASDebug(), null, 2)
// equivalente:
JSON.stringify(EAS.Logger.exportDiagnostic(), null, 2)
// filtro manual sem UI nova:
EAS.Logger.entries().filter(e => e.module === 'FAKE')
EAS.Logger.entries().filter(e => ['WARN','ERROR'].includes(e.level))
// comando voluntario de limpeza:
EAS.Logger.clear()
```

No Console do Chrome, `copy(JSON.stringify(EASDebug(), null, 2))` copia o JSON.
`copy` e um helper do DevTools, nao uma API do Hub. ExportDiagnostic devolve
objeto JSON serializavel; nao dispara download nem abre dialogs.
UI Logs/Diagnostico adiada para manter escopo seguro. APIs legadas permanecem.

## 4. Integracoes

- CORE: inicio local/entrada de index/logger; estado bootstrap no export.
- FAKE: inicio, comando, target, snapshot, ataque, confirmacao, resume,
  reconciliacao, conclusao e erro. Chamadas protegidas individualmente;
  nenhum estado funcional e escrito pelo logger.
- FARM, MARKET, DATA, GROUPS, TROOPS: chamadas existentes de EAS.Log agora passam
  pela persistencia central. Cobertura e gradual, nao todos os console logs.
- ATTACK: ponto de log existente do scheduler encaminhado, sem mudar agendamento.
- GLOBAL: listeners adicionais error/unhandledrejection, ate 20 ocorrencias por
  documento, sem preventDefault nem substituicao de handlers; autoria nao presumida.

## 5. Blobs e /st/

Ver `image-trace-investigation.md`. Um exemplo foi decodificado; falta o mapa
real da mesma reproducao para contar matches comprovados. Tracer compara URLs
inteiras, mostra finalidade e delta entre observacoes. Nao oculta/remove/bloqueia
IMG. Correlação nao identifica o criador. Nenhuma correcao dos pixels aplicada.

Cold bootstrap agora: 1 index + 33 JS assets (incluindo logger) + 1 CSS = 35 blobs
no caminho completo, sem modulos sob demanda. Logger LOCAL ja existe antes,
mas seu asset e carregado e sai pelo guard sem duplicar listeners.
JS no userscript e no index e revogado apenas depois de onload, apos execucao do
script classico. CSS permanece vivo; CSV conserva o comportamento preexistente.
Blobs de cargas falhas/timeout nao ganharam cleanup antecipado: sem prova segura
sobre uso remanescente. Nao se atribui os pixels a ausencia de revoke.

## 6. Riscos corrigidos e pendentes

Corrigidos: falhas de EAS.Log propagando ao modulo; gravacao de historico inteiro
a cada evento quando Logger ativo; historico sem navegacao no novo diagnostico;
blobs JS bem-sucedidos sem revogacao; ausência de export central sanitizado.

Pendentes deliberados:
- auditar cada closure de modulo sob reinjecao forcada/SPA; guard atual cobre
  scripts carregados pelo index, nao terceiros executando fontes diretamente;
- scheduler possui timers/listeners por documento e cleanup proprio; nao fazer
  teardown global em pagehide que possa alterar retomada/BFCache dos executores;
- avaliar criterios de sucesso agendados separadamente, sem copiar mecanicamente
  regras do Fake nem criar retries cegos;
- EAS.Usage e logs especializados legados ainda tem estrategias antigas;
- UI diagnostica, pipeline release imutavel, captura precoce de logger producao;
- race de logs entre abas e fonte real dos IMG /st/;
- diagnostico IMG temporario limitado, observer com filtro de atributos ancorado
  no document para ds_body tardio, somente LOCAL; nao torna-lo permanente sem medir.

## 7. Teste real amanha — FAKE REGRESSION STATUS

1. Importar somente `local-test/eas-tw-local.user.js` regenerado no Violentmonkey.
2. Desativar outra instalacao EAS; abrir pagina nova do mundo BR.
3. Conferir localBuildId em EASDebug(), logger disponivel e um unico Hub.
4. Planejar somente 2 Fakes autorizados como no teste validado (origens/tropas/
   alvos escolhidos pelo usuario). Iniciar pelo fluxo normal, uma vez.
5. Verificar preparacao, target, snapshot, Atacar, try=confirm, confirmacao e
   retorno; nao acionar manualmente botoes durante a execucao automatica.
6. Esperar Planejados 2 / Enviados 2 / Erros 0. Conferir snapshot/attempt proprios
   no segundo comando e apenas uma conclusao. Inspecionar comandos reais no jogo.
7. Exportar EASDebug() apos terminar: historico deve conter eventos das paginas
   anteriores, com RECONCILE_SUCCESS por tentativa e EXECUTION_COMPLETE unico.
8. Se UNCERTAIN, respeitar pausa e verificar jogo; nao repetir envio para testar.
9. Separadamente, em pagina ociosa, executar A/B/A de imagens conforme documento.
10. Enviar JSON central, JSON EASImageTraceDebug e buildId. Nenhum commit/publicacao
    antes de validar este novo build: testes simulados nao substituem teste real.

Protecoes Fake preservadas no patch: attemptId, confirmationAttempt,
outgoingSnapshot, locks, lastConfirmation, target/TARGET_NOT_APPLIED,
reconciliacao positiva, UNCERTAIN sem reenvio, idempotencia, fila serial e resume.
Testes acrescentados com logger normal, lancando excecao e quota cheia; verificam
2 preparacoes/ataques/confirmacoes e conclusao unica. Cenario 730 existente mantido.
Resultados numericos finais registrados no relatorio desta rodada.

## 8. Relatorio final da rodada

Build local: `local-177b6e1d57c05410` (52 assets embutidos).
Arquivo: `local-test/eas-tw-local.user.js`.

### Arquivos

Criados no working tree (incluem instrumentacao da investigacao anterior):
- core/logger.js
- core/image-trace.js
- tests/logger.test.cjs
- tests/image-trace.test.cjs
- docs/engineering-stabilization.md
- docs/image-trace-investigation.md

Alterados:
- core/eas.js: preserva referencia ao logger inicial.
- core/observability.js: bridge EAS.Log e isolamento de falhas.
- index.js: carga opcional de logger, evento de bootstrap e revoke JS em load.
- eas-tw-loader.user.js: evento de bootstrap e revoke do bundle em load.
- scripts/build-local-userscript.py: logger e tracer antes do bundle LOCAL.
- services/fakes-execution.js: somente chamadas de diagnostico protegidas.
- services/mission-scheduler.js: somente encaminhamento do log existente.
- modules/troop-counter.js: marcador CSV da investigacao, sem alterar download.
- tests/fake-bootstrap-debug.test.cjs: prova da revogacao pos-load.
- tests/fakes-auto-execution.test.cjs: falha/quota/normal do logger no fluxo real simulado.
- local-test/eas-tw-local.user.js e build-info.json: regenerados, ignorados pelo Git.

### Validacao executada

`node --test --test-isolation=none tests/*.test.cjs`: 158 testes, 157 passaram
na execucao em sandbox. Unico bloqueio: teste de fusos horarios usa spawnSync,
indisponivel no sandbox; repetido isoladamente fora dele, passou. Portanto todos
os 158 testes Node passaram considerando a repeticao autorizada.

22 testes focados de logger/bootstrap/imagens passaram apos a revisao final.
Verificacoes de sintaxe para JS de core/services/modules, loaders e bundle;
sintaxe Python do gerador; `git diff --check`: passaram.

34 fixtures HTML executadas em Chrome headless, perfil isolado e servidor local,
sem acessar o jogo. 33 passaram. `scheduled-mission-process2.test.html` falhou:
1. input nobre recebe "0", fixture espera string vazia;
2. fixture espera ausencia do painel na Praca normal, painel existe.
Repeticao servindo arquivos diretamente de `git show HEAD:<path>` apresentou
EXATAMENTE as mesmas duas divergencias. Falha preexistente, documentada, sem
alteracao especulativa do executor agendado. Nao declarar suite HTML toda verde.

Saidas locais: stabilization-tests-final.txt, browser-tests.json,
browser-baseline.json e browser-*.test.html. Scripts de execucao/browser profile
ficam apenas em local-test; nao serao incluidos em commits.

### FAKE REGRESSION STATUS

PASS nos testes automatizados. Cenario 730 concluiu com uma preparacao, ataque e
confirmacao por comando. Todos os cenarios existentes de snapshot/target/lock/
attempt, ID novo vs antigo, UNCERTAIN, bootstrap duplicado, idempotencia e dois
Fakes independentes permanecem passando. Tres cenarios novos provam que logger
normal, lancando excecao ou com quota de logs cheia nao alteram contagens e
conclusao. Logger normal registra EXECUTION_COMPLETE uma unica vez.

Nao foi realizado novo teste de envio no Tribal Wars nesta rodada. A validacao
real anterior de 2/2 nao e apresentada como validacao deste novo build. Seguir
os dez passos da secao 7 antes de publicar.

Nenhum commit, push ou publicacao. Sem correcao especulativa das imagens.
