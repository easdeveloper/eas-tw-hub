# Ciclo de vida do armazenamento e validação BR143

Esta política substitui as propostas anteriores de archives/migração V2. O Hub remove execuções comprovadamente reconciliadas; não grava filas históricas. Nenhuma manutenção chama `localStorage.clear()`, faz requests ao jogo ou envia comandos.

Build local: `local-465d28be9ca6d334` (71 assets).

SHA256: `a75a0164f75587813fc208c8bec10eaf2966486a91a591b217680461446e0264`.

## Política implementada

| Classe / produtor | Destino e limite |
| --- | --- |
| Fakes novos | Ao final, remover somente com tentativas `completed`, ID de comando reconciliado, identidade compatível e ausência de erro/lock ativo. Contagens e `finishedAt` não bastam. |
| Smart Offers novos | Remover somente quando cada oferta criada tem tentativa concluída, ID de oferta e evidência de confirmação, sem falha. Skips precisam ser anteriores ao envio. Histórico deixou de ser pré-requisito; nenhum archive é produzido. |
| Mass Farm novo | Persistir tentativa antes do clique; reconciliar por mudança DOM/marcador de sucesso. Resposta incerta conserva `pendingAction` e bloqueia reenvio. Remover fila somente quando todos os itens são seguros e os contadores de ações reconciliadas coincidem. |
| Tactical | Preservar resultados, missões, autorizações e locks. Botão **Excluir resultado** exige todas as unidades `COMPLETED`, IDs reconciliados, tentativa compatível e recibos consumidos, sem lock/claim. Depois da exclusão, conservar recibos compactos por 24h, sem expirar referências ativas. Snapshot vencido não pode iniciar nova execução. |
| Tactical legado / parcial / incerto | Preservar scheduler, autorizações, snapshots aprovados, claims e locks. `SENT` sem reconciliação final não é sucesso comprovado. |
| Resultados temporários | Não produzir resumos ou históricos de execução. Após reconciliação, retirar contexto e resultados reconhecidos do ciclo anterior; resumo Fakes legado divergente permanece intacto. Contagens de conclusão são exibidas apenas em memória. |
| Balanceamento | Readback antes dos cliques. Remover contexto novo concluído somente com prova de sucesso e recibos duráveis de deduplicação. Transporte não encontrado conserva tentativa incerta; nenhum reenvio automático. Contexto legado não pode ser substituído por novo plano. |
| Rascunhos | Desabilitados por padrão; habilitação explícita por sessão e gravação somente ao clicar em Salvar rascunho. |
| Smart Offers: erros | Ignorar mensagens dos painéis do Hub na detecção de erro do jogo. Distinguir `STORAGE_CONTEXT_CHANGED`, `STORAGE_READBACK_FAILED` e `STORAGE_WRITE_FAILED`; sucesso de gravação limpa o diagnóstico atual. Erro antigo persistido não comprova nova falha. |
| Logs opcionais | Logs reconhecidos: até 24h, 200 entradas e 32.768 caracteres; logger central mantém limite próprio de 300 entradas/180.000 caracteres. Logs do Mission Scheduler recebem limite no produtor. Escrita opcional não bloqueia envio nem limpeza de sucesso. |
| Caches reconhecidos | Novos snapshots de aldeias/tropas/grupos e mercado: até 24h e 262.144 caracteres por chave. Cache vencido não atende leitura. Dados legados sem metadados reconhecidos não são apagados automaticamente. |
| Segurança dos transportes | Históricos de Balance/Target são consultados na detecção de transporte duplicado: não são resultados descartáveis. Limite existente de 200 entradas é preservado; não expirar evidências necessárias. Backup GM do Target também é estado de recuperação, não log. |
| Outros estados | Configurações, drafts, incoming/deduplicação, contexto sessionStorage, regras e chaves desconhecidas permanecem protegidos. Histórico auxiliar de mudanças de regras é limitado a 30 mudanças/24h, sem expirar a regra atual. |

`core/storage.js` concentra a política e faz manutenção idempotente na inicialização. Os leitores continuam usando suas chaves existentes. O antigo `StorageMigration` é apenas uma fachada de compatibilidade para backup/limpeza explícita; não produz V2.

Nos Fakes parciais, somente payloads de tropas/diagnósticos/baseline de comandos com ID reconciliado são retirados. Status, identidade da tentativa e ID enviado permanecem. Smart Offers retira baseline somente após confirmação. Tactical parcial conserva o snapshot compartilhado porque ainda é dependência de autorização.

Persistência crítica exige readback. Falha bloqueia clique/envio; uma tentativa de recuperação pode descartar somente logs opcionais com esquema reconhecido e repetir a escrita. Nenhuma proteção é apagada para abrir quota. Fakes/Farm reconciliados já duráveis podem ser removidos sem uma escrita terminal maior. Nenhum resultado é gravado; a limpeza de sucesso não depende de espaço para um resumo.

Mass Farm usa Web Locks para serializar o despacho, relê o contexto dentro do lock e verifica a aba proprietária. Fakes e Smart Offers preservam os controles existentes de tentativa/aba. A limpeza compara o conteúdo persistido antes da remoção; alteração detectada retorna `BLOCKED`.

## Auditoria

[Inventário por chave](storage-audit-inventory.md), reproduzível com `python scripts/audit-storage.py`: 217 pontos de acesso e 62 famílias de chaves em core/services/modules/index/loader. O arquivo `local-test/storage-audit.json` inclui consumidor/produtor e linha de cada acesso, inclusive localStorage, sessionStorage e GM. As classificações conservadoras do inventário não autorizam limpeza de chaves desconhecidas.

Tamanho UTF-8 do userscript:

| Componente | Bytes |
| --- | ---: |
| Total gerado | 1.670.241 |
| JS fonte real | 1.561.252 |
| Core / services / modules / index | 178.189 / 1.028.702 / 315.046 / 39.315 |
| CSS | 28.963 |
| Prelude diagnóstico repetido | 26.783 |
| Loader | 15.089 |
| Overhead gerado: factories, escapes, hashes e metadados | 38.154 |
| Dependências externas embutidas | 0 |
| Outros arquivos idênticos: redundância | 0 (três placeholders vazios) |

A repetição identificada é o bootstrap diagnóstico/guards também presente nas factories (~1,6% do build). O código real responde pela maior parte do tamanho. Dependências de testes não são embutidas; não houve refatoração geral de bundling. Auditoria completa: `local-test/userscript-size-audit.json`.

## Procedimento BR143

Instalar o userscript `local-test/eas-tw-local.user.js`. Para a limpeza legada, fechar as outras abas do Hub e usar uma página BR143 sem execução em andamento. Não iniciar automações durante a validação.

No console, inspecionar e copiar o backup para um arquivo JSON externo no Windows:

```js
if (window.EASLocalBuild?.id !== 'local-465d28be9ca6d334') throw Error('BUILD_INCORRETO');
var tacticalBR143 = localStorage.getItem('eas_tw_tactical_scheduler_v1');
var resumo43BR143 = localStorage.getItem('eas_tw_fakes_execution_summary');
console.table(EAS.Storage.lifecycle.inspectLegacy());
var backupBR143 = EAS.Storage.lifecycle.backupLegacy();
copy(JSON.stringify(backupBR143));
```

`copy` é o helper do console Chrome/Edge. Salvar o conteúdo em arquivo externo e conferir que `records.eas_tw_fakes_execution` contém a string original de 1.165 comandos. O backup contém somente registros elegíveis, sem usar quota do localStorage.

Somente depois de salvar e verificar o backup externo, autorizar a limpeza:

```js
var limpezaBR143 = EAS.Storage.lifecycle.cleanLegacy({
  backup: backupBR143,
  authorize: true,
  externalBackupConfirmed: true
});
console.table(limpezaBR143);
console.assert(localStorage.getItem('eas_tw_tactical_scheduler_v1') === tacticalBR143, 'TACTICAL_ALTERADO');
console.assert(localStorage.getItem('eas_tw_fakes_execution_summary') === resumo43BR143, 'RESUMO_LEGADO_ALTERADO');
console.table(EAS.Storage.lifecycle.inspectLegacy());
```

Para os dados informados, Fakes só é `ELIGIBLE` se o único erro corresponder à identidade da fila e a uma fase comprovadamente anterior ao submit, e todos os 1.164 restantes tiverem tentativas concluídas/IDs reconciliados. A execução é removida diretamente depois do backup autorizado; não é criado `summary_migration_v2`. `finishedAt`, `remaining=0` e as contagens sozinhos nunca autorizam isso.

Smart Offers `completed` sem prova por oferta continua `BLOCKED`, mesmo sem crescimento novo de archives. Falta de histórico por si só deixa de ser obstáculo; falta de evidência continua sendo. Os três archives não elegíveis permanecem intactos. Nenhuma opção força elegibilidade.

Se aparecer `BLOCKED`, conservar o registro, guardar a tabela diagnóstica e revisar as evidências/tentativas antes de continuar; não apagar manualmente a fila para liberar quota. `BACKUP_STALE_OR_MISSING` exige novo backup exato. Falha de armazenamento ou alteração entre abas impede a remoção. Recarregar a página e repetir a inspeção: removidos devem aparecer `NO_CONTEXT`; os bloqueados continuam presentes. A operação repetida não cria históricos adicionais.

O navegador real BR143 não foi modificado pelos testes. Resultados inconclusivos precisam de revisão humana; não é possível prometer um limite global apagando segurança ou dados desconhecidos. Centenas de execuções novas bem-sucedidas não acumulam filas; evidências de falhas continuam enquanto necessárias.

## Validação local

Validação do build acima: **293/293 testes Node**, **7/7 fixtures de navegador**, sintaxe do userscript e `git diff --check` aprovados. Logs: `local-test/definitive-lifecycle-final-node.log`; fixtures de navegador executadas pelo runner com rede externa bloqueada.

Testes simulam 250 execuções de 1.165 Fakes, BR143 com erro pré-submit e resumo legado de 43 intacto, quota saturada, falha de gravação, espaço recuperado, reload, idempotência, múltiplas abas e preservação de Tactical legado. Fixtures de navegador usam DOM local com rede externa bloqueada; não enviam ataques reais.

Comandos reproduzíveis no workspace Windows:

```powershell
& './local-test/.test-deps/playwright/driver/node.exe' --test tests/market-balance-storage.test.cjs tests/storage-lifecycle.test.cjs tests/storage-lifecycle-extra.test.cjs tests/mass-farm-storage.test.cjs tests/storage-migration.test.cjs tests/market-offers-archive.test.cjs tests/market-offers-batch.test.cjs tests/tactical-final-execution.test.cjs tests/tactical-operation-scheduler-adapter.test.cjs tests/tactical-precheck.test.cjs tests/fakes-execution.test.cjs tests/fakes-auto-execution.test.cjs
python local-test/run-parser-tests.py market-balance-stability.test.html mass-farm.test.html market-offers-batch.test.html market-offers-recovery.test.html market-offer-id-reconciliation.test.html tactical-operation-ux.test.html tactical-scheduler-ui.test.html
python scripts/build-local-userscript.py
python scripts/audit-storage.py
Get-FileHash local-test/eas-tw-local.user.js -Algorithm SHA256
```

Nenhum commit/push foi realizado.
