# WAIT_SNAPSHOT: prazo e fonte de baseline

## Auditoria

A causa comprovada no codigo era o compartilhamento de preparationWait.deadlineAt:
criado no inicio de WAIT_PLACE, permanecia o mesmo durante WAIT_TARGET e
WAIT_SNAPSHOT. O tempo de resolucao do destino consumia o prazo do snapshot.
A fase de snapshot agora inicia seu proprio prazo de 10000 ms imediatamente antes
da primeira captura, persistindo snapshotStartedAt/snapshotDeadlineAt e preservando
targetPreparationDeadline. Loops e reinjecoes reutilizam o valor persistido.
Identidade de comando/tentativa continua obrigatoria. Nao houve aumento do timeout.

A fonte atual e exclusivamente #commands_outgoings, com tr.command-row. Ausencia
do container retorna CONTAINER_MISSING; documento carregando retorna DOM_LOADING;
paginacao e linhas invalidas continuam bloqueadas. Um container existente sem
linhas produz available=true e beforeCommandIds=[]; [] ja era aceito corretamente.
Ausencia nao e convertida em vazio. Nenhuma fonte alternativa foi inventada.

O relato real de WAIT_SNAPSHOT permite localizar a espera em CONTAINER_MISSING
ou DOM_LOADING, mas nao distinguir entre eles. Sem HTML/log dessa fonte no jogo,
nao esta comprovado se o container estava ausente, atrasado ou com outro seletor.
A correcao do prazo nao prova que essa fonte aparecera no proximo teste.

## Diagnostico central

EAS.Logger recebe PREPARATION_PHASE_START, TARGET_READY, SNAPSHOT_CAPTURE_START,
SNAPSHOT_SOURCE_CHECK, SNAPSHOT_CAPTURE_RESULT, SNAPSHOT_PERSIST_START,
SNAPSHOT_PERSIST_RESULT, SNAPSHOT_READBACK_RESULT, SNAPSHOT_WAIT e
PREPARATION_DEADLINE_EXPIRED. Inclui identidade, fase, timestamp/now, deadline,
remainingMs, URL/screen; a leitura inclui container/linhas/IDs e motivo; persistencia
e read-back tem resultados separados. O logger continua best-effort.

## Teste real: exatamente 2 Fakes

1. Instalar local-test/eas-tw-local.user.js, build local-de8ce7d7e97288f5.
2. Criar uma nova execucao de exatamente 2 Fakes. Nao retomar/repetir automaticamente
   um comando cujo resultado anterior seja incerto.
3. Verificar TARGET_READY -> PREPARATION_PHASE_START (WAIT_SNAPSHOT) ->
   SNAPSHOT_CAPTURE_RESULT available=true -> SNAPSHOT_PERSIST_RESULT persisted=true
   -> SNAPSHOT_READBACK_RESULT readBackValid=true -> ATTACK_SUBMIT para cada comando.
4. Esperado: 2 planejados, 2 enviados, 0 pulados, 0 erros.
5. Se parar, guardar JSON.stringify(EASDebug(), null, 2). Em SOURCE_CHECK verificar
   snapshotReason, outgoingContainerFound, outgoingRowsFound e outgoingCommandIds;
   em DEADLINE_EXPIRED conferir deadline/remainingMs. Se CONTAINER_MISSING persistir,
   sera necessario inspecionar o HTML real da area de comandos enviados antes de
   definir outro seletor/fonte. Nao enviar sem baseline, persistencia e read-back.

Arquivos desta rodada: services/fakes-execution.js,
tests/fakes-auto-execution.test.cjs, este documento e userscript local regenerado.
Detector de destino, confirmacao e reconciliacao nao modificados nesta rodada.
Sem commit, push ou publicacao.

Validacao: 176/176 testes Node, incluindo fila de 730 comandos; 34/35 fixtures
de navegador (falha preexistente scheduled-mission-process2); syntax 65 arquivos;
git diff --check aprovado.
