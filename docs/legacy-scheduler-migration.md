# Migração dos históricos legados — 20/10/2026

## Resultado na exportação fornecida

Fonte: `docs/eas_tw_scheduler_v2.json`. O primeiro documento JSON é válido; o
arquivo contém também texto de inspeção do console após esse documento. O
arquivo original foi preservado. Os testes extraem o documento JSON inicial.

As dez missões pertencem a `arrival-planner`, no contexto `br143:6562420`:

| ID (prefixo) | Evidência verificada | Recibo |
|---|---|---|
| aa409161 | late, sem clique final | UNSENT_BLOCKED |
| 59ccfa5e | cancelled, sem clique final | UNSENT_BLOCKED |
| 8fca7167 | cancelled, confirmação não utilizada | UNSENT_BLOCKED |
| 8da2ab02 | cancelled, confirmação não utilizada | UNSENT_BLOCKED |
| 154fa83e | cancelled, apoio, confirmação não utilizada | UNSENT_BLOCKED |
| 465802dd | cancelled, confirmação não utilizada | UNSENT_BLOCKED |
| 0052f77c | cancelled, confirmação não utilizada | UNSENT_BLOCKED |
| 6f0dd012 | finalClickConsumed, tentativa utilizada, verification pending | UNCERTAIN |
| 335ed5c7 | finalClickConsumed, tentativa utilizada, verification unproven | UNCERTAIN |
| aa1ebab9 | sent, verification proven, comando 335522313 | PROVEN_SUCCESS |

**10 compactados e removidos na reprodução isolada; 0 protegidos nessa cópia.**
Nenhum dado da conta no navegador real foi alterado por esta sessão. A interface
revalida cada registro atual antes da migração; alterações de identidade,
referências ativas, cópias divergentes e consumidores indisponíveis bloqueiam a
remoção com motivo específico.

Na reprodução da exportação original, sem recibos preexistentes: **119.682 →
16.924 bytes**, redução de **102.758 bytes**. A medição considera strings UTF-16
do armazenamento principal e recibos, incluindo as chaves dos recibos. Não é
uma estimativa de quota física do navegador. O backup é externo ao localStorage.
O resultado na conta pode diferir se já houver outros recibos.

## Por que esta origem permite compactação

O executor genérico continua sem consumidor de recibos separados. Porém,
`services/arrival-execution.js` já consulta a existência de
`eas_tw_arrival_consumed:<world>:<playerId>:<missionId>:<attemptId>` em
`allowed()`, usada por preparação, submissão e validação antes do clique final.
O identificador não depende de status nem do volume do histórico.

A limpeza utiliza exatamente essa chave existente. Não houve alteração em
`mission-scheduler.js`, `scheduled-mission-execution.js`, `arrival-execution.js`,
relógio, checkpoints ou mecanismo de envio. O novo recibo é apenas um bloqueio:
não contém autorização, tropas para execução nem prazo de expiração.

O recibo mantém identidade, status original, classificação da evidência, ID de
comando quando existente, motivo e estado da verificação. Um bloqueio consumido
anterior mantém `consumedAt`; se contradiz a ausência de marcadores na missão,
o resultado permanece incerto. `UNSENT_BLOCKED` representa impedimento preventivo
de uma tentativa antiga, sem afirmar que ela foi enviada. As duas missões que
já estavam `cancelled` mas têm envio não comprovado conservam `originalStatus`
e evidência `UNCERTAIN`; a limpeza não as declara falhas nem sucessos.

Antes de remover uma missão, a limpeza exige backup exato e verifica a chave e
o consumidor real: um objeto de teste com a mesma identidade, autorizado e em
estado de envio, passa a ser rejeitado pelo próprio `ArrivalExecution.allowed`.
As condições de status/autorizações do objeto de teste são neutralizadas para
não confundir o bloqueio por recibo com outro motivo. Nenhum envio é chamado.

## Persistência e interface

Os botões existentes usam o mesmo serviço de prévia e limpeza:

- **Limpar concluídos:** inclui somente sucesso com verificação e ID de comando
  compatíveis; uma missão incerta não entra neste modo.
- **Limpar histórico geral / exclusão individual:** incluem os terminais
  compactáveis desta origem. Missões genéricas sem consumidor continuam
  protegidas; não se presume equivalência com recibos táticos.

Após a confirmação da prévia, a interface oferece o download do backup original
completo e exige confirmação de que o arquivo foi salvo. Sem essa confirmação
nada é removido. A API também exige que o backup contenha o registro exato.

Ordem: backup → recibo → leitura exata → prova pelo consumidor → verificação de
concorrência → remoção de `missions` e da cópia idêntica em `history` → gravação
e leitura exata da raiz e do recibo. Falhas interrompem a limpeza e não declaram
sucesso. Recibos escritos antes de uma falha permanecem bloqueios seguros; a
reexecução conclui a migração sem duplicar recibos.

Referências de abas da missão removida e a referência à última missão concluída
são limpas. Logs redundantes de bootstrap são removidos apenas no contexto
tratado e após backup. Outros contextos, operações ativas e referências de abas
sem vínculo comprovado com os registros removidos permanecem intactos. A raiz
v2 é preservada para impedir reimportação do v1. Não se usa `localStorage.clear`.

## Validação

- 7 testes específicos de migração: exportação original, fixture derivada,
  classificação 7/2/1, consumidor real, recarga, idempotência, backup obrigatório,
  operações ativas, colisão de identidade, prévia desatualizada, cópias divergentes,
  gravação silenciosa, exceções de escrita/leitura e recuperação.
- Regressão focada: **142 testes Node aprovados** nas suítes de migração,
  execução final tática, precheck e adaptador.
- **10 fixtures focadas de navegador aprovadas**: legacy-arrival-history-ui (36
  asserções, incluindo recarga real), legacy-scheduled-history-ui (14),
  tactical-history-ui (13), tactical-scheduler-ui (38), tactical-attack-creation
  (16), tactical-automatic-attack (26), tactical-single-final (43),
  tactical-outgoing-recovery (38), tactical-attack-confirmation-clock (28) e
  arrival-reconciliation (28).
- Todas as suítes existentes foram executadas. Na rodada ampla Node: **602
  testes, 601 aprovados e 1 falha** em incoming-transport: comparação literal
  de `@connect` exige LF, mas o arquivo Discord possui CRLF. Esses arquivos não
  foram alterados.
- Na rodada ampla de navegador, 84 fixtures foram executadas. Uma falha da nova
  fixture foi corrigida (faltava passar `window` ao método de teste); a fixture
  passou posteriormente. Permanecem **8 falhas fora da migração**, portanto a
  regressão ampla não está totalmente verde: core-foundation (limite de logs),
  market-offers-archive, market-offers-cancel-waits,
  market-offers-manual-recovery, market-offers-stop-navigation,
  scheduled-mission-process2 e duas fixtures táticas com botões antigos ausentes
  (tactical-precheck e tactical-preflight-authorization). Os detalhes estão em
  `local-test/legacy-migration-browser-all.log`; não foram alterados motores para
  contornar essas falhas.
- Sintaxe do userscript e `git diff --check` aprovados. Navegação de teste local
  com rede externa bloqueada. Sem envios reais, commit ou push.

Logs: `local-test/legacy-migration-export-final.log`,
`local-test/legacy-migration-targeted-final.log`,
`local-test/legacy-migration-browser-focused-final.log`,
`local-test/legacy-migration-node-all-final.log` e
`local-test/legacy-migration-browser-all.log`.

## Arquivos e build

Alterados nesta implementação: `services/tactical-operation-scheduler-adapter.js`
e `modules/scheduled-missions.js`. Adicionados:
`tests/legacy-scheduler-migration.test.cjs`,
`tests/legacy-arrival-history-ui.test.html`,
`tests/fixtures/legacy-scheduler-export.json` (derivada da exportação, nomes e
URLs substituídos), este relatório. O diagnóstico anterior
`docs/legacy-scheduler-compaction-blocker.md` recebeu nota de atualização.
Alterações anteriores no workspace foram preservadas.

Build gerado: `local-test/eas-tw-local.user.js`, **local-71cf6d4d77d1e519**,
71 assets; metadados em `local-test/build-info.json`.
SHA-256: `3cc00421819a2a8dbb129e14dfafb7c3a723a0ea0979847f9e28fc42d255fb8d`.
