# Auditoria dirigida do ciclo de carregamento

Build local: local-3bb5d9c0ac2b2c2a.

## Evidencia atual e conclusao

O usuario confirmou no game.js real que a funcao que monta /st/<payload>.gif
pertence ao Tribal Wars e e chamada por um MutationObserver de childList/subtree
sobre document. O Initiator fornecido liga esse callback a appendChild(script)
do loader anterior do EAS. Isso comprova o gatilho e a autoria do request, mas
nao determina se o callback revarre todos os scripts nem como deduplica imagens.

Na medicao anterior houve 33 scripts EAS distintos, nao 1805 reinjecoes. No build
estatico atual nao ha SCRIPT criado no bootstrap local. Nenhum loop interno EAS
childList -> loadScript foi encontrado. Nao atribuimos ao EAS repeticao de start
ou do mesmo script sem evidencia de contadores que mostre essa repeticao.

## Pontos auditados

- eas-tw-loader.user.js/start: iniciado uma vez automaticamente. Chamadas
  posteriores sao bloqueadas pelas flags persistentes do documento. No local,
  __EASLocalLoaderStarted permanece inclusive se a inicializacao falhar.
- index.js: __EASIndexBootstrap e definido antes dos awaits. Reavaliar o index
  retorna antes de trocar EASLoader ou criar um novo mapa de dependencias.
- loadScript: scriptPromises compartilha a mesma Promise enquanto carrega e
  depois de carregar/falhar; nao agenda retry. Scripts externos sao marcados
  data-eas-script/data-eas-loaded. A funcao nao e chamada por observer do loader.
- EASLocalBuild.execute: registro estatico por arquivo, com Promise retida;
  reinjetar o userscript nao substitui o registro. O modulo permanece registrado
  no objeto EAS; a API Promise de carregamento nao foi alterada.
- O caminho local nao cria/remove SCRIPT ou JS Blob. O caminho remoto cria um
  no por dependencia, preservado depois de load. No timeout do bundle remoto,
  o no e removido, sem retry automatico; isso nao faz parte do bootstrap local.
- O loader nao tem MutationObserver ou tick de carregamento. O image tracer
  e passivo, singleton, com dispose existente; nao chama start/loadScript.
- Listeners de handshake e timer sao retirados ao concluir/errar. Nao foram
  adicionados novos observers, timers, polling ou coleta de rede nesta rodada.
- Navegacao completa cria documento/registro novos: mantem resume do Fake.

Nao houve nova alteracao de arquitetura nesta rodada. A mudanca funcional do
loader para funcoes estaticas pertence ao patch anterior. Agora completamos
somente a instrumentacao e os testes do ciclo ja existente.

## Eventos observaveis

Console e logger central recebem:

- [EAS][LOADER] start
- [EAS][LOADER] loadScript
- [EAS][LOADER] script-created (somente quando existe criacao de no)
- [EAS][LOADER] script-loaded
- [EAS][LOADER] script-error
- [EAS][LOADER] duplicate-blocked
- [EAS][BOOTSTRAP] start
- [EAS][BOOTSTRAP] already-running
- [EAS][BOOTSTRAP] completed

Cada evento tem counter sequencial, timestamp, session, codeSource, localBuildId,
asset/url quando aplicavel e reason. start/loadScript incluem callerStack.
Bootstrap e module-demand sao identificados separadamente. No local estatico,
script-loaded tem transport=embedded-static-function e url=null: nao representa
um download ou criacao de elemento. Erros de Console/Logger nao afetam o fluxo.
O historico em EASLoaderDebug e limitado a 200 eventos; contadores sao cumulativos
por documento. Os eventos principais tambem entram no EAS.Logger/EASDebug.

## Teste real

1. Instalar o novo userscript LOCAL e dar F5 na Praca, sem abrir modulo.
2. Capturar Console filtrado por [EAS][LOADER] e [EAS][BOOTSTRAP].
3. Executar JSON.stringify(window.EASLoaderDebug(), null, 2).
4. No idle inicial: loaderStarts=1, indexStarts=1, bootstrapCompleted=1,
   loadScriptCalls=32, scriptsCreated=0, scriptsInjected=0, scriptsLoaded=33.
5. Repetir a captura apos alguns segundos: os contadores de carregamento nao
   devem crescer. O contador do tracer pode crescer com mutacoes normais do jogo.
6. Se estavel, navegar place -> map -> place; uma session diferente por documento.
7. Somente apos o idle validado, executar 2 Fakes: 2 enviados, 0 pulados, 0 erros.

Nao bloquear/remover/interceptar /st/, _0x574527 ou observer nativo. Se os pixels
persistirem com zero scripts EAS criados, capturar o novo Initiator. O callback
nativo completo e necessario para explicar a multiplicacao: incluir a funcao
criadora do IMG, sua chamada e filtros/sets de scripts ja processados. Verificar
addedNodes versus varredura global e se o proprio IMG aciona reprocessamento.

## Arquivos desta rodada

core/loader-diagnostics.js, eas-tw-loader.user.js, index.js,
scripts/build-local-userscript.py, tests/fake-bootstrap-debug.test.cjs,
tests/local-idle-bootstrap.test.html, esta nota e userscript local regenerado.
Fake, Market e os mecanismos nativos nao foram editados nesta rodada.
Sem commit ou push. Validacao real pendente.

## Resultado dos testes e evidencia pendente

Node completo: 211/211, incluindo 730 comandos. Browser: 36/37; permanece
scheduled-mission-process2, falha preexistente (noble 0 versus vazio e painel
presente). Sintaxe JS 69 arquivos, Python e git diff --check aprovados.

O game.js completo nao foi encontrado no workspace. A busca por _0x574527
localizou apenas esta nota; anexos recentes contem instrucoes da investigacao,
nao o bloco nativo. Solicitadas linhas 17800-17950 da versao citada pelo usuario,
mais declaracoes externas de funcoes, Sets/caches ou decodificadores usados no
bloco. Sem elas nao se pode determinar se o IMG criado causa recursao ou se o
filtro nativo impede isso. Nenhuma reconstrucao por suposicao foi realizada.
