# Fake: espera de readiness antes do ataque

## Evidencia e limite do diagnostico

O relato real informa snapshot indisponivel apos alguns comandos concluirem.
Nao foi fornecido o JSON da execucao nem o HTML do destino resolvido nesta rodada.
Assim, a ordem REAL no navegador e a causa concreta da ausencia do snapshot ainda
nao foram confirmadas. A correlacao com resolucao do target continua hipotese.

A auditoria de codigo confirmou dois caminhos relevantes:
1. prepareCurrent preenchia tropas antes de aplicar o target; ensureCommandTarget
   validava campos que o proprio EAS escreve (input/x/y), sem exigir evidencia
   separada de resolucao pelo widget do jogo.
2. attackCurrent pausava imediatamente quando a tabela outgoing estava ausente
   ou o DOM ainda carregava; a mensagem agrupava causas distintas.

Nao foi removida a protecao que bloqueou corretamente o ataque.

## Alteracao localizada

Estados funcionais existentes permanecem. A entrada corrente recebe apenas
preparationWait com fase, attemptId, deadlineAt e indicacao de espera. A tentativa
recebe identidade antes da preparacao; o snapshot usa essa MESMA identidade.

Ordem automatica:
PLACE_READY -> aplicar target -> aguardar evidencia de resolucao -> validar
payload/destino -> preencher e validar tropas -> capturar outgoing real ->
persistir/read-back -> persistir attacking -> clique nativo.

Usa o polling existente de 200ms para observar condicoes. Nao usa novo atraso
fixo para presumir sucesso. Prazo total de espera: 10 segundos desde o inicio da
preparacao, persistido. Reinjection e alternancia entre fases nao renovam prazo.
A espera nao reaplica target nem preenche tropas repetidamente. Persistencia de
espera ocorre em transicoes, nao em cada tick.

## Evidencia de target

Nova funcao read-only EAS.Place.readTargetReadiness, usada apenas pelo Fake
automatico. Mantem a validacao anterior do payload e exige adicionalmente:
- ID nativo de destino igual ao targetVillageId conhecido; OU
- rotulo visivel de destino com coordenada exata, na area #target_selection ou
  .target-input-field (.village-name ou link screen=info_village).

Labels contraditorios e aria-busy impedem readiness. Apenas texto no input, x/y
preenchidos pelo EAS ou passagem de tempo NAO bastam. ensureCommandTarget nao
foi flexibilizado e EAS nao inventa IDs de aldeia.

IMPORTANTE: a marcacao exata da pagina que pausou ainda precisa ser conferida no
DOM real. Os testes exercitam as estruturas suportadas; nao provam que o layout
atual do mundo BR exponha esses mesmos seletores. Sem evidencia reconhecida o
executor pausa com WAIT_TARGET_TIMEOUT, em vez de assumir que esta pronto.

## Snapshot e seguranca

CONTAINER_MISSING e DOM_LOADING podem ser aguardados ate o prazo, sem declarar
que sao necessariamente transitorios. PAGINATED, INVALID_ROW, falha de escopo ou
de persistencia nao sao aceitos nem transformados em snapshot vazio.

A espera somente consulta DOM. Snapshot valido e persistido antes do ataque,
com read-back existente. beforeCommandIds null nunca vira sucesso; [] continua
permitido somente a partir de uma tabela real disponivel.

Fluxos attacking/confirming/submitted nao entram na espera de preparacao e nao
sao reenviados. Locks, outgoingSnapshot, lastConfirmation, ID reconciliado,
UNCERTAIN e fila serial permanecem. Reload de preparacao antiga sem identidade
persistida continua pausando; somente esperas pre-submit identificadas retomam.

## Logger e testes

Eventos PLACE_WAIT_START/READY, TARGET_APPLY_START/APPLIED/WAIT_START/READY/
VALIDATED, TROOPS_FILLED/VALIDATED, SNAPSHOT_CAPTURE_START/CAPTURED/UNAVAILABLE/
READY e ATTACK_SUBMIT possuem identidade da execucao/comando/tentativa, origem,
esperado/actualTarget, status, fase e timestamp. Nenhum logger e guard funcional.

Testes novos: payload sem resolucao, evidencia positiva/contraditoria, input
vazio, target tardio/timeout, snapshot tardio/timeout, reinjection durante espera,
origem do DOM defasada, segunda origem/snapshot independente e ordem dos logs.
Mantidos testes de logger falhando/quota, confirmacao/reconciliacao, duplicate
bootstrap e fila de 730. O teste antigo de tabela ausente agora aguarda o timeout
antes de exigir pausa; continua exigindo zero ataques e zero confirmacoes.
O teste de adaptador invalido verifica erro mais cedo, antes de preencher tropas.

## Teste real

Instalar somente o LOCAL regenerado em pagina nova. Confirmar localBuildId.
Planejar SOMENTE 2 Fakes e iniciar uma vez. Validacao exige 2 planejados,
2 enviados, 0 erros. Nao liberar 730 com base apenas na simulacao.

Exportar JSON.stringify(EASDebug(), null, 2) depois. Se houver WAIT_TARGET_TIMEOUT,
enviar tambem HTML da area de selecao do destino; se WAIT_SNAPSHOT_TIMEOUT,
enviar HTML de #commands_outgoings (ou confirmar sua ausencia). Nao repetir
comandos em estado incerto. Nenhum commit/push nesta rodada.

## Validacao final

Build: `local-fa41fb3a80b6bc6f`.
Suíte Node completa: 171 testes passaram, 0 falhas, incluindo fila de 730 e
espera com validacao nativa ainda pendente. Sintaxe JS e git diff --check passaram.
Fixtures HTML: 33/34 passaram; permanecem as mesmas duas divergencias de UI na
fixture Scheduled Process 2, anteriormente reproduzidas no HEAD (sem alteracao
nesse executor nesta tarefa).

A validacao nativa pode ficar pendente mesmo com input correto: nesse caso o
Fake aguarda, mas nao libera tropas enquanto readTargetReadiness nao comprovar
payload e resolucao. Input incorreto/falha de aplicacao continua bloqueado.

Nao foi recebido o JSON/DOM da reproducao real. A ordem real e a compatibilidade
dos marcadores de resolucao com essa pagina continuam dependendo do teste real.
Antes dele, encerrar a fila anterior pela UI e configurar uma NOVA fila de apenas
2 comandos; nao retomar automaticamente 730 para validar este patch.
Sem commit, push ou envio no jogo durante esta tarefa.
