# Compactação do Scheduler legado: impedimento — 19/10/2026

**Atualização:** a exportação foi disponibilizada posteriormente em
`docs/eas_tw_scheduler_v2.json`. A análise específica encontrou dez missões de
`arrival-planner`, que já possui bloqueio persistente próprio consultado pelo
consumidor. A conclusão genérica abaixo não impede a migração dessa origem;
consulte `legacy-scheduler-migration.md` para a implementação e validação finais.
O impedimento continua aplicável às missões genéricas sem esse consumidor.

## Situação dos dados

Não foi localizada a exportação real de `eas_tw_scheduler_v2` nos arquivos
disponíveis do workspace. Os JSONs encontrados em `local-test` são auditorias
estáticas de código e metadados de build. A distribuição informada pelo usuário
(7 sem clique final, 2 tentativas consumidas sem sucesso e 1 envio comprovado)
permanece uma hipótese de entrada, sem validação individual.

Nenhuma missão real foi compactada ou excluída. Bytes liberados nesta etapa: 0.
O número de missões compactáveis não foi determinado.

## Consumidores relevantes

- `services/mission-scheduler.js`: `readRoot`, `load` e `persist` leem e gravam
  `contexts[world:player]`. A ausência de uma raiz v2 válida permite importação
  de `eas_tw_scheduler`; remover toda a raiz pode reintroduzir dados antigos.
- `findDuplicate` compara a assinatura de origem, destino, horário e tropas em
  `missions`, somente para estados do conjunto `ACTIVE`. Não é um registro
  persistente global de comandos já enviados e não consulta recibos separados.
- `services/scheduled-mission-execution.js`: `executeScheduledAttackSend` relê
  a missão em `missions` e bloqueia por `finalClickConsumed`, `submitAttemptId`,
  status `submitting`/`sent` ou referência de execução em memória. Se não encontra
  a missão persistida, usa `|| mission`, o objeto fornecido pelo chamador.
- `markAuthorizationUsed` grava `submitAuthorization.used` e `submitAttemptId`
  no contexto; o executor também grava a tentativa consumida na missão antes do
  clique final. Autorizações não são recibos passivos de deduplicação.
- `handleFinalSendDeadline` e `armAutomaticSubmission` também recuperam a missão
  com fallback para o objeto recebido e consultam seus campos de consumo/status.
- `resolveMissionContext` consulta `tabExecutions`, contexto de aba e IDs de
  missão. Apagar somente referências de abas não substitui o bloqueio de consumo.
- `finalizeScheduledAttackSuccess` acrescenta uma cópia a `history`; essa cópia
  não é consultada pelo bloqueio `already-consumed` do envio final.
- `services/arrival-execution.js` consulta vínculos de `tabExecutions`; registros
  dessa origem exigem análise adicional dos vínculos e das próprias evidências.
- `modules/scheduled-missions.js` apresenta missões e chama a limpeza existente
  do adaptador tático; `core/ui.js` apresenta indicadores e tem leitura do v1;
  `core/logger.js` lê o v2 apenas para diagnóstico. Esses consumidores visuais
  não estabelecem proteção de envio.

## Impedimento e decisão

Persistir um recibo em outra coleção, relê-lo e excluir a missão de `missions`
não demonstra equivalência: o bloqueio de consumo existente não lê tal recibo.
O fallback para uma missão em memória torna especialmente insuficiente provar
apenas que o registro foi removido do armazenamento.

Fazer o executor reconhecer um novo local de recibos exigiria modificar sua
deduplicação, expressamente vedado sem diagnóstico prévio. Essa parte foi
interrompida antes de implementar. Não foi criado recibo sem consumidor.

Uma representação reduzida mantida em `missions` poderia preservar alguns
campos já consultados, mas não equivale automaticamente à remoção do registro
principal. Ela exigiria prova para todos os consumidores, para estados ativos,
para autorizações e para chamadas com objetos antigos em memória. Não foi
implementada nem aprovada sem os registros reais e essa demonstração.

Os sete casos informados sem clique final não são automaticamente deletáveis:
é necessário verificar tentativas, autorizações utilizadas, referências ativas,
evidências de reconciliação e cópias em outras estruturas. Os dois casos incertos
não podem ser reclassificados. Um ID de comando no caso de sucesso não é, por
si só, um recibo que o executor legado consulte.

## Entrega desta investigação

Apenas este relatório foi adicionado. Motor, Scheduler, relógio, checkpoints,
interface, armazenamento real e build anterior não foram alterados. Não houve
envios, commit ou push. Não foram executados novos testes de migração nem gerado
novo build: não há migração implementada para validar. Resultados anteriores
não são apresentados como validação deste requisito.

Para continuar a avaliação individual é necessária a exportação real, incluindo
os contextos e suas coleções `missions`, `history`, `tabExecutions` e `logs`.
