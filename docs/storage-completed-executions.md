> Documento histórico, substituído pela decisão do proprietário. Não executar a migração V2 descrita abaixo. Usar [ciclo de vida e validação BR143](storage-lifecycle-br143.md).

# Retenção de execuções — validação BR143

## Diagnóstico comprovado no código

Fakes: `completeForwardedTarget`/`reconcileOutgoing` registram o resultado e a tentativa; `resumeConfirmation` e `resumeAutomatic` chegam a `finishExecution`. `executionCounts` deriva contagens da fila, sem demonstrar reconciliação. `compactExecutionSummary` já produzia V2, mas `finishExecution` primeiro persistia o contexto completo com `finishedAt`, depois escrevia a chave única de resumo, sem readback. Falha nesta segunda escrita conservava queue/completed/prepared e o resumo anterior. `resumeAutomatic` bloqueava contextos com finishedAt/endedAt antes de tentar concluir a compactação. Isso explica uma execução terminal retida com resumo de outra execução; não prova retrospectivamente que a quota foi a única causa no navegador BR143.

A chave de resumo é um slot único, não um histórico por execução. O resumo informado de 43/31/12 não é prova da fila 1165/1164/1. A identidade do novo resumo inclui createdAt e referências de cada comando; resultados preservam origem, destino, tipo executado e ID reconciliado. Um estado completed sem tentativa reconciliada não é suficiente para recuperar e remover o contexto antigo.

Smart Offers: `services/market-offers-batch.js` usa `persist`, que lança STORAGE_WRITE_FAILED quando `MarketOffersExecution.save` retorna false. A conclusão conserva a execução completa e tenta `archiveBatch`, portanto pode ocupar espaço com contexto e archive simultaneamente. O fallback de `preserveTerminalHistory` anteriormente aceitava a elegibilidade de um resumo construído em memória mesmo quando o archive não era gravado. Agora exige persistência; archive existente deve corresponder exatamente ao resumo esperado. Quota, orçamento de archives, revisão divergente e conflito com execução anterior podem impedir save: STORAGE_WRITE_FAILED sozinho não distingue essas causas.

## Correções e limites

- Finalização normal Fakes verifica a gravação do V2 e a identidade do contexto antes de remover a chave principal. Tentativas consumidas, desconhecidas, sem prova de conclusão e erros oriundos de fases de envio conservam o contexto e suas evidências completas.
- initialize recupera somente execução com finishedAt, fila inteiramente terminal, forwardingIndex ausente, nenhuma evidência incerta e IDs reconciliados para todos os completed. A operação explícita `EAS.FakesExecution.compactFinished()` usa os mesmos critérios. Recuperação de NT/anti-snipe foi excluída.
- Falha de resumo/readback não remove contexto. Uma execução com resumo antigo nunca usa esse resumo como autorização de remoção. V1 no slot é conservado se V2 não puder ser gravado.
- `EAS.MarketOffersExecution.compactCompletedStorage()` é manutenção explícita, sem exclusões: compacta apenas contexto completed reconhecido, com itens terminais e tentativas resolvidas. Preserva autorizações, locks, revisões, resultados e identidade das tentativas. Retira diagnostics/diagnosticEvents e snapshots de tentativas completed com offerId.
- `{includeLegacy:true}` aplica essa mesma compactação conservadora aos archives legados reconhecidos (schema de execução 3, chamado V1 no contrato de archives). Conserva o schema e autorização do registro; não migra apagando esses campos. Archives V2, desconhecidos, malformados, pendentes e incertos permanecem intactos. A política existente de retenção V2 continua separada; nenhuma limpeza é acionada por quota.
- Não houve alteração nas rotinas de envio, composição de tropas, NT, Scheduler ou missões. Nenhum navegador real foi acessado. Nenhum clear, commit ou push foi executado.

## Validação real BR143 (a executar pelo operador)

1. Antes de instalar/ativar o build, exportar os valores brutos das chaves EAS e registrar tamanhos e hashes, especialmente Scheduler, missões, autorizações, locks e os três archives grandes. Manter uma cópia fora do localStorage. Fechar outras abas de execução para evitar concorrência durante a inspeção.
2. Examinar cada uma das 1165 entradas: status, confirmationAttempt, ID reconciliado dos 1164 completed e estado/fase do erro. Conferir que não existem tentativas consumidas sem reconciliação, forwarding pendente ou evidências incertas. Os números agregados não substituem essa inspeção. Sem prova, preservar a execução.
3. Para criar espaço sem excluir evidências, revisar os registros Market completed elegíveis e executar separadamente a manutenção explícita, primeiro sem includeLegacy e depois, se necessário, com includeLegacy. Comparar antes/depois: IDs, autorizações, locks, revisões e resultados devem permanecer iguais. Essa manutenção altera somente snapshots resolvidos e diagnósticos dispensáveis. Não executar retenção legada baseada em exclusão.
4. Ativar o build local. initialize pode concluir automaticamente a compactação Fakes elegível no reload; quando necessário usar compactFinished. Confirmar V2 1165/1164/1, todos os resultados/IDs e ausência da chave principal somente após persistência verificada. Se quota/readback falhar, conservar o contexto e interromper tentativas de limpeza.
5. Recarregar e confirmar que não há retomada/reenvio. Comparar hashes brutos de Scheduler, missões e demais chaves protegidas. Em teste posterior autorizado de Smart Offers, verificar persistência da fila antes de qualquer envio e ausência de STORAGE_WRITE_FAILED; não iniciar ataques para validar armazenamento.

## Riscos remanescentes

Uma quota de ~4.99 MB pode continuar insuficiente para escrever V2 antes de liberar o contexto. A solução falha fechada; não promete remover a execução BR143 sem analisar as tentativas reais. A compactação Market é explícita, não uma tentativa automática de liberar quota. Autorizações e locks persistem mesmo em contexto completed, por exigência de preservação. Históricos existentes desconhecidos/incertos não são compactados. localStorage não fornece transação entre abas; as verificações síncronas reduzem riscos, mas não substituem isolamento de abas durante manutenção. Diagnósticos volumosos podem crescer novamente. A origem exata do erro BR143 depende dos dados e logs reais.

## Testes

Os novos casos incluem fila 1165/1164/1 com resumo V1 antigo, reload, quota geral, quota somente no resumo, readback divergente, pendência, incerteza e ausência de prova. Market cobre completed com autorização/lock preservados, manutenção legada opt-in, quota, archive idempotente e bloqueio de substituição sem histórico persistido. Os testes existentes cobrem V1/V2 e anti-reenvio.

A asserção `Fake summary remains full context: Phase 2 only` em market-offers-archive.test.cjs é preexistente e incompatível com o V2 já presente em HEAD antes desta correção: exige `const summary = { ...context, counts:`. Foi mantida e reportada separadamente, sem ocultar a falha.

Logs locais: storage-final.log, storage-final-cases.log, storage-browser.log, storage-regression-browser.log. Identificação e SHA256 do artefato estão em local-test/build-info.json.

Resultado consolidado: 169/170 testes Node passaram; única falha preexistente descrita acima. Após a revisão final dos guards de identidade, os 12 casos focados foram reexecutados. Dez fixtures de navegador de Market/Scheduler/missões/anti-snipe/loader passaram; bootstrap local e telemetria também passaram (12 fixtures no total). `git diff --check` passou.

Arquivos alterados: services/fakes-execution.js, services/market-offers-execution.js, tests/fakes-auto-execution.test.cjs, tests/market-offers-archive.test.cjs e este relatório. Gerados: local-test/eas-tw-local.user.js e local-test/build-info.json, além dos logs de validação (artefatos locais ignorados pelo Git).

Build final: `local-488ba5d6ad792157`. SHA256 do userscript: `0ca134f7b898f2a2854a24cde4cac9b679afd4b076c7fe3e9e731464c749faad`.
