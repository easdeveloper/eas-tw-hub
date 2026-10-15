> Documento histórico, substituído pela decisão do proprietário. Não executar a migração V2 descrita abaixo. Usar [ciclo de vida e validação BR143](storage-lifecycle-br143.md).

# BR143 — recuperação de migração sob quota

Build: `local-b1e81c257c5e2994`.

SHA256 do userscript: `995873c40511cafc5c60b5c5d76fcce0a0bafcc15f25cc1f33588d377739bc07`.

## Causa e limites

O build anterior já oferecia `EAS.StorageMigration.inspect()` e `.run()`. O Fakes foi classificado ELIGIBLE, mas o V2 adicional não foi persistido. O original precisa coexistir temporariamente com o V2: a economia final da deduplicação não resolve a falta de espaço nessa primeira escrita. A chave esperada para o original informado é `eas_tw_fakes_execution_summary_migration_v2:557a4ad7-1521818`. Se o original mudar, seu fingerprint e a chave também mudam.

5.242.878 caracteres não comprovam sozinhos a quota exata do navegador. A nova API informa `sourceCharacters`, `summaryCharacters`, `summaryKeyCharacters`, `additionalCharactersRequired`, inventário de caracteres em valores/chaves e estimativa UTF-16. Não realiza sondagens de quota com gravações. Em falha retorna `writeError` com etapa, chave, nome, código e mensagem original do erro. `QuotaExceededError` é distinguido de `SecurityError` e outros erros. A capacidade efetiva permanece dependente do navegador.

O resumo legado de 43 comandos não é sobrescrito. Smart Offers HISTORY_MISSING e os três archives não elegíveis permanecem intactos. Não há escrita no Tactical Scheduler. O V2 mantém a reconstrução integral do contexto, incluindo tentativas, locks, autorizações e evidências. Só após gravar, reler e comparar exatamente o V2 e revalidar o contexto original ocorre a remoção da chave original.

## Espaço recuperável permitido

`inspect().spaceRecovery` considera somente `eas_tw_diagnostics_v1`, logger opcional. Só remove linhas reconhecidas de bootstrap CORE/LOADER/BOOTSTRAP, nível INFO/DEBUG, com evento permitido e sem indicadores estruturados ou textuais de evidência/proteção. Erros, eventos desconhecidos, registros de execução, tentativas, reconciliação, locks, autorizações e missões são conservados. Nenhuma chave é apagada; o logger é regravado com as linhas restantes. Outros caches ou arquivos não são candidatos.

`backupForRecovery()` retorna os valores brutos em memória. Isso **não é um backup externo** até o operador salvar o JSON fora do navegador. `recoverSpace()` exige o backup bruto exatamente correspondente à versão atual, `externalBackupConfirmed:true`, `authorize:true` e a chave explicitamente selecionada. Backup desatualizado ou mudança de valor bloqueiam. Não há recuperação automática no bootstrap ou em `.run()`.

## Procedimento exato

Instale `local-test/eas-tw-local.user.js`, desative a versão anterior e recarregue uma página comum do BR143. Execute em período sem execuções concorrentes e sem editar o armazenamento em outras abas. No Console do DevTools:

```js
if (window.EASLocalBuild?.id !== 'local-b1e81c257c5e2994') throw Error('BUILD_INCORRETO');
await EASLoader.loadScript('services/fakes-execution.js');
await EASLoader.loadScript('services/market-offers-execution.js');
await EASLoader.loadScript('services/storage-migration.js');
console.log(EAS.StorageMigration.inspect({ includeArchives: true }));
var quotaBackupBR143 = EAS.StorageMigration.backupForRecovery();
copy(JSON.stringify(quotaBackupBR143));
```

Salve o conteúdo copiado em arquivo JSON local fora do navegador e confira que contém `records.eas_tw_diagnostics_v1`. Não envie o backup ao chat. Se `spaceRecovery.status` não for ELIGIBLE, não execute a redução: não existe espaço comprovadamente recuperável neste escopo.

Somente depois de salvar e conferir o backup, a chamada abaixo expressa a autorização explícita para reduzir apenas esse logger:

```js
var quotaRecoveryBR143 = EAS.StorageMigration.recoverSpace({
  keys: ['eas_tw_diagnostics_v1'],
  backup: quotaBackupBR143,
  externalBackupConfirmed: true,
  authorize: true
});
console.log(quotaRecoveryBR143);
```

Se retornar COMPACTED, tente a migração e confira as proteções:

```js
var schedulerBR143Before = localStorage.getItem('eas_tw_tactical_scheduler_v1');
var legacyBR143Before = localStorage.getItem('eas_tw_fakes_execution_summary');
var migrationBR143 = EAS.StorageMigration.run({ includeArchives: true });
console.log(migrationBR143);
console.assert(localStorage.getItem('eas_tw_tactical_scheduler_v1') === schedulerBR143Before, 'SCHEDULER_CHANGED');
console.assert(localStorage.getItem('eas_tw_fakes_execution_summary') === legacyBR143Before, 'LEGACY_CHANGED');
if (migrationBR143.fakes.status === 'MIGRATED') {
  var summaryBR143Key = migrationBR143.fakes.summaryKey;
  var summaryBR143 = JSON.parse(localStorage.getItem(summaryBR143Key));
  console.assert(summaryBR143.version === 2 && summaryBR143.counts.total === 1165 && summaryBR143.counts.completed === 1164 && summaryBR143.counts.errors === 1);
  console.assert(localStorage.getItem('eas_tw_fakes_execution') === null);
  console.log(summaryBR143Key, summaryBR143.counts);
}
```

Se retornar BLOCKED/QUOTA_INSUFFICIENT, mantenha o original. Guarde o resultado com `copy(JSON.stringify(migrationBR143))` em arquivo para diagnóstico. Sem outro espaço comprovadamente descartável e autorizado, este procedimento não pode concluir: não remova Fakes, histórico, archives, autorizações ou Scheduler, nem mude estados para forçar elegibilidade. Será necessária uma solução adicional de armazenamento persistente verificada, fora do escopo desta redução; backup externo sozinho não autoriza excluir o original.

Após reload, carregue novamente os três serviços e execute inspect/run. Uma migração concluída retorna NO_CONTEXT e conserva o V2 na chave registrada. Repetições não recriam o resumo nem removem outros registros. Em interrupção depois da gravação do V2, a API revalida o V2 existente antes de remover o original.

## Validação

20/20 testes em `tests/storage-migration.test.cjs`, log `local-test/storage-quota-recovery.log`. A fixture reproduz os totais fornecidos do BR143 (1165/1164/1/1164); evidências por tentativa são sintéticas. A quota saturada é simulada com limite atômico de caracteres de chaves/valores, não uma medição do navegador real. Cobertura: falha de quota e SecurityError, autorização/backup ausentes ou divergentes, proteção de evidência textual/estruturada, recuperação suficiente/insuficiente, contexto alterado, readback, histórico obrigatório, arquivos não elegíveis, reconstrução integral, repetição e reload.

Não foi executada migração no navegador BR143, ataque, commit ou push. O sucesso real depende da quantidade de ruído elegível existente; não é prometido espaço suficiente.
