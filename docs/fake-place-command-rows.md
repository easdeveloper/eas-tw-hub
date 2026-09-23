# Outgoing: parser compartilhado de linhas reais

Build local-751705a0dfd3048c.

## Mudanca

readOutgoingCommands, usado tanto antes do ataque quanto apos a navegacao, agora
procura tr.command-row com .quickedit-out[data-id] no documento, independente de
#commands_outgoings. O container antigo continua suportado. IDs sao strings decimais
normalizadas (espacos/zeros iniciais), deduplicadas; IDs discordantes e duplicatas
com metadados conflitantes tornam a leitura indisponivel. Quando presentes, ID do
icone, cancelamento e link info_command sao validados contra o ID primario.
Links externos/tipo nao proprio e paginacao continuam bloqueados.

O fixture tests/fixtures/place/outgoing-command-row.html reproduz o fragmento
fornecido, apenas fechando tags abertas. Nao inventa quickedit-label/coordenada.
Origem 675, ID 1091585556 e tipo attack sao lidos. Coordenada ausente continua null;
na reconciliacao, um novo ID sem origem/tipo/alvo suficientes continua AMBIGUOUS,
sem reenvio. O fixture de navegador valida diretamente esse HTML.

## Limite de evidencia: estado vazio

Um #commands_outgoings existente e vazio continua produzindo baseline valido [].
Sem container, as linhas reais comprovam a fonte alternativa. Se nem container nem
linhas existem, a leitura continua unavailable/CONTAINER_MISSING: nao ha no trecho
fornecido marcador de lista vazia que permita distinguir zero outgoing de area
nao renderizada. Foi solicitado o HTML da variante vazia. Nao se inventou seletor,
nao se converteu ausencia em [], nao se introduziu request/navegacao.

Consequencia pratica: este patch cobre linhas outgoing fora do container antigo.
Nao prova que a pagina pre-envio sem nenhuma linha contenha uma lista vazia valida.
Se ocorrer essa situacao no teste, guardar o HTML do estado vazio antes de prosseguir.

## Logs

source=place-command-rows nos eventos SNAPSHOT_SOURCE_FOUND, SNAPSHOT_CAPTURED,
SNAPSHOT_EMPTY_VALID, SNAPSHOT_PERSISTED, SNAPSHOT_RESTORED,
SNAPSHOT_AFTER_CAPTURED e RECONCILE_NEW_COMMAND. Este ultimo so ocorre quando
a reconciliacao existente encontra exatamente um novo comando compativel.
Os locks, identidade de tentativa, persistencia/read-back e regras de UNCERTAIN
permanecem iguais. Detector de destino e deadlines nao foram modificados.

## Teste real

Instalar o novo userscript local. Criar execucao de exatamente 2 Fakes.
Esperado: 2 planejados, 2 enviados, 0 pulados, 0 erros. Para cada comando conferir
BEFORE persistido/read-back antes de Atacar, AFTER capturado e novo ID reconciliado.
Se o baseline ficar indisponivel ou o resultado for incerto, nao reenviar: coletar
EASDebug()/EASFakeDebug() e o trecho da lista outgoing/estado vazio.

Arquivos desta rodada: services/fakes-execution.js,
tests/fakes-auto-execution.test.cjs, tests/place-outgoing-rows.test.html,
tests/fixtures/place/outgoing-command-row.html, este documento e userscript local.
Sem commit/push/publicacao. Validacao real pendente.

Validacao: 180/180 testes Node, incluindo 730 comandos; fixture real 12 assertions;
35/36 fixtures navegador (falha preexistente scheduled-mission-process2); syntax
65 arquivos e git diff --check aprovados.
