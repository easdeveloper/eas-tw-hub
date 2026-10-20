# Limpeza de missões antigas — 16/10/2026

## Diagnóstico

A tela Missões Agendadas reúne duas fontes persistidas: operações táticas em
`eas_tw_tactical_scheduler_v1.executions[world:player]` e missões legadas em
`eas_tw_scheduler_v2.contexts[world:player].missions`. O Scheduler pode importar
`eas_tw_scheduler` quando a raiz v2 não existe. A investigação foi feita no
código e reproduzida em fixtures, sem consultar a conta real.

Os cartões legados `cancelled`, `late`/`SEND_WINDOW_MISSED` e
`error`/`UNCLASSIFIED_COMMAND_MARKERS` não eram integralmente contemplados pela
limpeza. Além disso, `attackClicked` registra o primeiro clique de preparação;
não prova o envio final. A exclusão agora admite esse caso somente quando há
autorização explicitamente não utilizada para a etapa `attack-confirmation` e
nenhum indício de envio final ou referência ativa.

## Alteração

Os dois botões existentes e a exclusão individual usam a mesma prévia e serviço
de limpeza. A interface identifica a origem persistida, distingue cancelar de
excluir histórico e explica bloqueios com motivo específico. Estados terminais
antigos entram na limpeza geral; estados ativos e referências de execução
permanecem protegidos. A gravação é condicionada ao contexto original e
verificada por leitura posterior. Referências auxiliares órfãs são removidas.

Operações táticas incertas continuam usando recibos compactos de deduplicação
antes da remoção do registro completo, sem autorização de envio e sem mudar o
resultado incerto. Para tentativas legadas com evidência de envio final, o motor
existente só consulta as missões completas para deduplicação. Como alterar esse
motor está fora do escopo, esses registros permanecem protegidos com
`LEGACY_SEND_EVIDENCE_DEDUPLICATION_UNPROVEN` ou
`LEGACY_OUTCOME_OR_DEDUPLICATION_UNPROVEN`. Nenhum estado é convertido em sucesso
ou cancelamento para permitir exclusão.

Nenhuma mudança nos arquivos do Scheduler, executor de Ataque/Apoio,
sincronização ou precisão temporal. Nenhum envio real, commit ou push.

## Validação

- Node: 135 testes aprovados, zero falhas, nas suítes
  `tactical-final-execution`, `tactical-precheck` e
  `tactical-operation-scheduler-adapter`.
- Navegador local: oito fixtures aprovadas: `legacy-scheduled-history-ui` (14),
  `tactical-history-ui` (13), `tactical-scheduler-ui` (38),
  `tactical-attack-creation` (16), `tactical-automatic-attack` (26),
  `tactical-single-final` (43), `tactical-outgoing-recovery` (38) e
  `tactical-attack-confirmation-clock` (28 asserções).
- Cobertura: cancelamento da confirmação, exclusão individual e geral,
  preservação de ativos e tentativas incertas, leitura posterior, remoção de
  referências órfãs, falhas de gravação/leitura, redução de armazenamento e
  leitura pelo Scheduler real sem reimportar históricos excluídos do v1.
- Fixture tática: 14.414 → 6.764 bytes. Sintaxe do userscript e `git diff --check`
  aprovados. Navegador limitado às fixtures locais, com rede externa bloqueada.

Build: `local-7e76c4491a78443f`, 71 assets, em
`local-test/eas-tw-local.user.js`.
SHA-256: `ba9f67d6b2e3b589412bdd607617057b8177c7a9a8ec4ecf898f0f03cb56ca14`.

Arquivos desta correção: `modules/scheduled-missions.js`,
`services/tactical-operation-scheduler-adapter.js`,
`tests/tactical-final-execution.test.cjs`,
`tests/tactical-history-ui.test.html`,
`tests/tactical-scheduler-ui.test.html`,
`tests/legacy-scheduled-history-ui.test.html`, este relatório e o build local.
Outras alterações previamente presentes no workspace foram preservadas.
