> Documento histórico, substituído pela decisão do proprietário. Não executar a migração V2 descrita abaixo. Usar [ciclo de vida e validação BR143](storage-lifecycle-br143.md).

# Migração explícita BR143

Este procedimento substitui a orientação de recuperação automática do relatório anterior. Não foi executado no navegador real. Não há acesso ao JSON real das tentativas ou do único erro; portanto os totais fornecidos não permitem afirmar que a execução é elegível.

## Diagnóstico do build local-488ba5d6ad792157

As APIs reais eram `FakesExecution.compactFinished()` e `MarketOffersExecution.compactCompletedStorage({includeLegacy:true})`. A primeira retornava apenas boolean e dependia de tentativa completed com outgoingCommandId. initialize tentava recuperar finishedAt, mas o bootstrap silencioso chama resume em vários caminhos; resumeAutomatic bloqueia finishedAt e loadActiveFakeRuntime ignora execuções encerradas. Portanto a recuperação não era garantida ao instalar/recarregar. Não há evidência de que as APIs explícitas tenham sido chamadas no BR143. Elas também podiam falhar por evidência insuficiente ou quota sem explicar o bloqueio.

Além disso, a finalização sobrescrevia o slot de resumo legado e o Market compactava antes de comprovar histórico correspondente, retirando snapshots de tentativas resolvidas. Essas lacunas foram corrigidas: recuperação antiga deixa de ocorrer no bootstrap, as APIs antigas passam a encaminhar ao novo serviço explícito (ou bloquear se não carregado), e a finalização normal preserva/verifica o resumo anterior em chave separada antes de sobrescrever o slot.

## Novo contrato

Carregamento explícito: `services/storage-migration.js`. API: `EAS.StorageMigration.inspect()` (somente leitura) e `.run()` (migração). Nenhum envio, preparação de tropas, navegação, clear ou acesso ao estado do Tactical Scheduler é realizado pelo serviço.

Fakes exige finishedAt válido, nenhuma pendência/forwarding, preset dentro do escopo, completed com tentativa completed e ID reconciliado, identidade de tentativa compatível quando presente e todos os erros associados à fila com fase comprovadamente anterior ao envio. Erro attacking/submitted/confirming, erro sem fase, erro não associado ou tentativa desconhecida bloqueiam. NT/anti-snipe são excluídos.

O V2 correspondente fica em `eas_tw_fakes_execution_summary_migration_v2:<fingerprint>`. O slot legado de 43 comandos permanece byte a byte intacto. O V2 contém resultados e `preservedExecution`, que conserva todos os campos do contexto original, tentativas, snapshots, locks e autorizações. Apenas objetos exatamente duplicados em completed/prepared são codificados como referências à fila. `restoreExecution(summary.preservedExecution)` reconstrói o contexto original sem persistir ou autorizar execução. Essa reconstrução é verificada antes da gravação. A chave ativa só é removida após readback exato do V2 e rechecagem do contexto original. Colisão de chave com valor diferente bloqueia. A repetição/reload não volta a migrar contexto ausente.

É uma compactação conservadora e sem perda, potencialmente maior que um resumo de resultados isolado. Se os arrays reais contiverem objetos diferentes, essas entradas são preservadas integralmente. É necessário espaço temporário para gravar o V2 enquanto o contexto completo ainda existe. Não há promessa de sucesso com localStorage em ~4.99 MB.

Market completed exige archive correspondente existente e semanticamente equivalente (V1 ou V2 reconhecido, elegível, mesma identidade/resultados). Histórico ausente/divergente bloqueia; não é criado automaticamente para contornar orçamento. O contexto continua armazenado com autorizações, revisões, locks, tentativas e snapshots intactos. Só diagnósticos sem marcadores de evidência de envio/reconciliação são reduzidos. Valores originais e histórico são rechecados antes da escrita; readback é verificado.

Os três archives legados são inspecionados individualmente. Somente completed reconhecido/elegível é compactado no próprio registro, conservando schema, autorizações e evidências. Não há exclusão por idade/quota, nem nova admissão de archives. A política existente (10 registros, 7 dias, 256 KiB UTF-16) é reportada, não alterada; os V1/V2 mantêm seu tratamento separado. Registros incertos, desconhecidos ou com chave/identidade incompatível são preservados. Quota/readback/conflicto retornam BLOCKED com o motivo. Redução sem exclusão não significa que arquivos antigos acima do orçamento tenham sido automaticamente descartados.

## Comandos exatos no BR143

Instalar o novo userscript local e desativar cópias antigas. Fechar outras abas de execução durante a manutenção. Fazer backup externo antes de executar `.run()`; o DevTools oferece `copy()` para copiar valores brutos:

```js
copy(JSON.stringify(Object.fromEntries(
  Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])
)));
```

Salvar o conteúdo copiado em arquivo local. Não enviar esse backup completo ao chat: pode conter dados privados de outros scripts.

Carregar o serviço e inspecionar, sem migrar:

```js
if (window.EASLocalBuild?.id !== 'local-3ed94844208e7589') throw Error('BUILD_INCORRETO');
await EASLoader.loadScript('services/fakes-execution.js');
await EASLoader.loadScript('services/market-offers-execution.js');
await EASLoader.loadScript('services/storage-migration.js');
console.log(EAS.StorageMigration.inspect({ includeArchives: true }));
```

A inspeção mostra ELIGIBLE/BLOCKED, índices e códigos. Se Fakes estiver BLOCKED, revisar os erros/tentativas indicados; não editar estados, IDs ou locks para forçar elegibilidade. Não existe botão de bypass.

Para executar a migração elegível e verificar as chaves protegidas nesta aba:

```js
const schedulerBefore = localStorage.getItem('eas_tw_tactical_scheduler_v1');
const legacyBefore = localStorage.getItem('eas_tw_fakes_execution_summary');
const migrationResult = EAS.StorageMigration.run({ includeArchives: true });
console.log(migrationResult);
console.assert(localStorage.getItem('eas_tw_tactical_scheduler_v1') === schedulerBefore, 'SCHEDULER_CHANGED');
console.assert(localStorage.getItem('eas_tw_fakes_execution_summary') === legacyBefore, 'LEGACY_SUMMARY_CHANGED');
if (migrationResult.fakes.status === 'MIGRATED') {
  const v2 = JSON.parse(localStorage.getItem(migrationResult.fakes.summaryKey));
  console.log(v2.counts, v2.version, v2.summaryKind);
  console.assert(v2.counts.total === 1165 && v2.counts.completed === 1164 && v2.counts.errors === 1);
  console.assert(localStorage.getItem('eas_tw_fakes_execution') === null);
}
```

A operação começa reduzindo apenas diagnósticos de Market elegível, depois tenta Fakes. É parcialmente aplicável: um bloqueio Fakes não desfaz a compactação segura Market já verificada. BLOCKED/QUOTA_INSUFFICIENT conserva o contexto e o resumo legado; não excluir estado para contornar a falha.

Após reload, carregar novamente o serviço e repetir inspect/run: Market deve indicar ALREADY_COMPACT quando não há mais diagnóstico elegível; Fakes indica NO_CONTEXT se migrado. Conferir o V2 pela summaryKey retornada na primeira execução e comparar o backup, especialmente campos protegidos. O serviço não usa o contexto preservado para retomar ataques.

## Validação e artefatos

Os testes usam a forma agregada real fornecida (1165/1164/1/1164), com conteúdo de tentativa sintético, não dados capturados da conta. Cobrem resumo divergente, erro incerto/sem fase, identidade inconsistente, ausência de prova, quota, readback, reconstrução integral, repetição/reload, completed com história V1/V2, archives não elegíveis e Scheduler protegido. A falha preexistente do teste `Fake summary remains full context: Phase 2 only` continua separada.

Arquivos deste ajuste: services/storage-migration.js, services/fakes-execution.js, services/market-offers-execution.js, tests/storage-migration.test.cjs, tests/fakes-auto-execution.test.cjs, tests/market-offers-archive.test.cjs e este relatório. O relatório anterior descreve a versão precedente.

Build: `local-3ed94844208e7589`. SHA256: `acdb7a1882a2bd9c3b14a9b73aec83ec61a016337132e56f17e01f3c2d16f1af`.

Resultado: 174/175 testes na suíte de regressão (a única falha é a asserção preexistente mencionada), oito fixtures de navegador passaram. Após revisar o guard de concorrência, 15 testes específicos da migração passaram, incluindo contexto alterado, reload após gravação do resumo com remoção interrompida e histórico V1 correspondente com evidência diagnóstica protegida. `git diff --check` e SHA256 conferidos.

Logs: local-test/storage-migration-focused.log, storage-migration-regression.log, storage-migration-final.log e storage-migration-browser.log. Nenhum commit/push ou alteração no navegador real foi realizado.
