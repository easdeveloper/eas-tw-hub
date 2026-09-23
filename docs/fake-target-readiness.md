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

## Investigacao do card de destino (build de diagnostico)

O log real do usuario no build local-fa41fb3a80b6bc6f comprovou input/payload
511|443, mas TARGET_RESOLUTION_MISSING ate timeout. O card visual tinha aldeia,
proprietario, pontos e distancia. O texto visual nao identifica sua estrutura
HTML. Nao ha aba de navegador acessivel nesta sessao nem fixture do card no repo.

Portanto a adaptacao ao layout REAL esta pendente do outerHTML da secao Destino.
Nao foi inventado seletor/fixture a partir do nome da aldeia ou jogador, e os
criterios de autorizacao permanecem iguais nesta etapa.

Instrumentacao ampliada:
- candidateSelectors, candidateCoordinates e selectorMatches (contagens/coords);
- resolutionSource, resolvedCoordinate e matchedSelector quando reconhecido;
- TARGET_NOT_READY detalhado, deduplicado por tentativa e evidencia em memoria;
- TARGET_READY com origem estrutural da evidencia.

A lista candidateSelectors descreve os quatro seletores de rotulo pesquisados.
O criterio alternativo preexistente e ID nativo igual ao targetVillageId conhecido.

Solicitado ao usuario: inspecionar visualmente o card de Destino no DevTools e
copiar outerHTML do container com aldeia/coordenada/proprietario/pontos/distancia.
Nao e necessario instalar outro build para fornecer esse HTML. A proxima fixture
real e o novo seletor so devem ser definidos a partir dessa estrutura.

Build apenas de diagnostico: local-be75576e8e328171. Nao apresentar como correcao
do WAIT_TARGET nem iniciar o teste de 2 envios com base nesta etapa parcial.
Timeout, snapshot, confirmacao, reconciliacao, Market e Data nao foram alterados.


## Correcao com HTML real fornecido (2026-09-22)

O fragmento real mostra que `.target-input-field` e o proprio input, nao
um container do resultado. O card resolvido usa `.village-item .village-name`.
O detector agora suporta esse seletor dentro do formulario nativo de comando,
sem presumir um ancestral adicional que nao foi fornecido. Cards fora desse
formulario nao autorizam o envio. As variantes anteriores continuam suportadas.

A coordenada entre parenteses e normalizada e comparada exatamente com o destino
esperado e o payload atual. Apenas um card visivel com essa coordenada pode
representar a variante nova. Cards antigos isolados, ausencia de card, destino
atual divergente ou coordenada ambigua continuam bloqueados. Havendo varios cards,
a correspondencia exata e selecionada. Nomes, idioma, pontos e distancia nao
participam da decisao. Um card antigo nao permite fallback para ID nativo.

TARGET_READY registra resolutionSource=village-item/village-name,
resolvedCoordinate e matchedSelector. TARGET_NOT_READY continua deduplicado e
inclui seletores/candidatos/motivo. Nao houve alteracao de timeout, snapshot,
confirmacao, reconciliacao ou Market/Data nesta correcao.

Fixtures reais: tests/fixtures/place/target-{unresolved,resolved}.html;
atributos de imagem omitidos pelo usuario nao foram inventados. O fixture de
navegador usa esses fragmentos com o adapter real. A regressao Node cobre card
tardio, card antigo, reinjecao durante espera e somente um ataque/confirmacao.

Validacao: 173/173 testes Node (incluindo 730 comandos); fixture real com 15
assertions; navegador 34/35 fixtures. A falha preexistente em
scheduled-mission-process2.test.html tambem ocorre no HEAD. Syntax: 65 arquivos.
git diff --check sem erros de whitespace.
Build: local-461eb4f264fe6ded (local-test/eas-tw-local.user.js).
Pendente validacao real de 2 Fakes: 2 enviados, 0 pulados, 0 erros.
Sem commit/push.


## Container canonico e input oculto (evidencia completa)

Esta evidencia substitui a hipotese de escopo da secao anterior. O container
real e #place_target; ele e consultado diretamente no documento, independente
do formulario. O detector procura .village-item .village-name dentro dele e
exige card/nome visiveis e coordenada normalizada exatamente igual ao esperado.
A presenca do container impede fallback para rotulos/IDs legados quando seu
card estiver ausente ou divergente. Sem esse container, as variantes legadas
continuam com suas validacoes anteriores; a busca generica por village-item no
formulario foi removida.

O input real fica vazio e display:none apos a resolucao. Por isso actualTarget
na leitura de readiness passa a ser a coordenada resolvida, mantendo inputTarget
como diagnostico separado de preparacao. ensureCommandTarget reconhece o mesmo
estado canonico valido e nao tenta preencher novamente o input oculto antes do
ataque. A identidade continua sendo a coordenada exata, nunca a visibilidade do
input. Snapshot, read-back, deadlines, locks e reconciliacao nao foram alterados.

Logs: resolutionSource e matchedSelector usam
#place_target .village-item .village-name; TARGET_READY inclui inputVisible e
villageItemVisible. TARGET_NOT_READY inclui resolvedCoordinate, placeTargetFound,
villageItemFound, villageNameFound, inputVisible e reason, com deduplicacao.

Os dois fixtures agora contem #place_target e o estado real do input. Validacao:
174/174 testes Node (incluindo 730 comandos), fixture real 16 assertions,
34/35 fixtures de navegador (mesma falha preexistente de missao agendada),
65 arquivos com sintaxe valida e git diff --check aprovado.

Novo build: local-b136fa9d3af85560. Substitui local-461eb4f264fe6ded.
Pendente teste real: 2 planejados, 2 enviados, 0 pulados, 0 erros.
Sem commit/push.
