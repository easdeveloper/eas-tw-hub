# Snapshot BEFORE vazio: evidencia e limite atual

Build diagnostico local-ac85d6f83aa99bb3. Nao apresenta como corrigida a variante
real sem container: ela continua indisponivel ate identificarmos evidencia da
secao outgoing carregada/vazia. Nao e necessario repetir envios para essa coleta.

## Auditoria

O relato real comprova readyState=complete, screen=place, formulario e destino
funcionais, ausencia de linhas/marcadores. Ele nao fornece HTML da estrutura da
secao outgoing vazia ou contrato de carregamento dessa secao. O repositorio tem
fixture de linha real com outgoing e fixture sintetico de container vazio; nao
possui fixture real da variante vazia. Nao foi inventado um marcador nativo.

O caminho [] ja funciona: Array.isArray aceita [], snapshotMatches valida escopo,
saveContext serializa o array, read-back compara o snapshot, restore recupera a
mesma tentativa e reconcileOutgoing calcula novos IDs. O uso beforeCommandIds ||
null nao converte [] em null em JavaScript, pois arrays vazios sao truthy.
Nenhuma checagem de length invalida um baseline [] no estado persistido.

## Alteracoes desta rodada

readOutgoingCommands informa sourceState:
- ROWS_PRESENT: linhas analisadas/validadas;
- EMPTY_CONFIRMED: fonte explicita conhecida analisada e zero comandos;
- UNAVAILABLE: ausencia de evidencia ou leitura invalida.

Vazio confirmado retorna reason=EMPTY_OUTGOING_COMMANDS, available=true e commands=[].
SNAPSHOT_SOURCE_CHECK e SNAPSHOT_AFTER_CAPTURED propagam sourceState. O inventario
EASFakeDebug().snapshotSourceEvidence inclui evidencia estrutural separada:
container outgoing, formulario, place_target e header_commands. Presenca isolada
de formulario/target/header nao autoriza vazio. Nenhuma regra de envio, timeout,
lock, detector de alvo ou reconciliacao foi relaxada.

Testes adicionais alternam tres aldeias [100,101], [], [300], conferem persistencia,
restore da confirmacao e conclusao sem duplicacao. Fixture navegador distingue
explicitamente os tres estados; a simulacao da pagina funcional sem marcador
continua negativa. Nao chamar esse fixture negativo de HTML real completo: apenas
reproduz as presencas/ausencias relatadas, nao uma estrutura nao fornecida.

## Evidencia necessaria para concluir a correcao real

Fornecer o trecho de Response do GET game.php?screen=place&village=13186 com zero
outgoing, incluindo o ancestral da area de comandos, cabecalhos, tabelas/estado
vazio e codigo de inicializacao da area se ela for carregada assincronamente.
Remover valores de tokens/cookies e campos sensiveis. Se for mais simples,
fornecer outerHTML da area de comandos vazia e indicar o que muda no mesmo local
quando ha um comando. Nao basta somente command-data-form ou #place_target.

Isso permite identificar uma evidencia nativa de secao completa/vazia e criar
fixture real positivo sem confundir DOM parcial com zero outgoing. Se a secao
for omitida pelo servidor quando vazia, precisamos do HTML/contrato que demonstre
que a omissao e o resultado final, e nao carregamento posterior.

Apos implementar esse criterio com evidencia: teste pequeno incluindo uma aldeia
sem outgoing; somente depois teste maior. Politica de UNCERTAIN sem reenvio mantida.

Arquivos desta rodada: services/fakes-execution.js, tests/fakes-auto-execution.test.cjs,
tests/place-outgoing-rows.test.html, este documento e userscript local regenerado.
Sem commit/push/publicacao.

Validacao: 182/182 testes Node, incluindo 730 comandos; 35/36 fixtures de navegador
(falha preexistente scheduled-mission-process2); syntax 65 arquivos; git diff --check
aprovado.


## Evidencia dos dois estados recebida: criterio implementado

A evidencia posterior identifica a variante vazia completa por #command-data-form,
#command_target e #command_actions, sem .command-row, quickedit-out ou info_command.
Essa evidencia substitui a limitacao anterior desta nota.

readOutgoingCommands agora aceita vazio nessa variante quando readyState=complete,
screen=place sem try de confirmacao, todos os tres elementos nativos presentes,
sem busy/erro, sem rows e sem marcadores de comandos avulsos. O container antigo
continua suportado como variante, mas nao e requisito. Ausencia de estruturas,
DOM incompleto, marcadores inconsistentes ou paginacao nao autorizam vazio.

O mesmo parser e usado para BEFORE e AFTER. Resultados incluem sourceState,
pageReady, commandRowCount e commandIds ([] no vazio confirmado, null se indisponivel).
Os eventos centrais de evidencia, captura, persistencia/restore e RECONCILE incluem
as identidades e listas pertinentes. Snapshot e read-back mantem [] sem conversao.

Fixture tests/fixtures/place/ready-empty-outgoing.html reproduz a combinacao de
estruturas nativas relatadas (nao e uma copia byte a byte de pagina inteira).
O fixture de linha existente fornece o estado com comandos. Tests verificam
[] -> [100], [antigo] -> [antigo,novo], restore, alternancia de tres aldeias e
bloqueio quando falta cada estrutura. Mais de um novo ID permanece AMBIGUOUS,
mesmo quando somente um corresponde ao alvo; novo ID sem alvo continua incerto.

Build: local-7b58513fff8cb098. Detector de destino, deadlines, confirmacao e locks
nao foram modificados nesta rodada. Sem commit/push/publicacao.

Teste real: primeiro exatamente 2 Fakes, incluindo uma origem sem outgoing.
Esperado: 2 enviados, 0 pulados, 0 erros. Conferir EMPTY_CONFIRMED e BEFORE []
persistido/restaurado, seguido por RECONCILE SUCCESS com um novo ID compativel.
Depois validar fila maior alternando origens vazias/com comandos. Em caso incerto,
nao reenviar; preservar logs e estado.

Arquivos desta rodada: services/fakes-execution.js,
tests/fakes-auto-execution.test.cjs, tests/place-outgoing-rows.test.html,
tests/fixtures/place/ready-empty-outgoing.html, esta nota e userscript regenerado.

Validacao final desta correcao: 185/185 testes Node (730 comandos incluidos);
35/36 fixtures navegador. Minting ficou running na primeira rodada e passou com
24 assertions na repeticao isolada; permanece apenas a falha preexistente de
scheduled-mission-process2. Syntax de 65 arquivos e git diff --check aprovados.
