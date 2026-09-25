# Arrival Planner V1 — auditoria e contrato

## Arquitetura reutilizada (antes da implementação)

- `core/game-data.js`: `EAS.Data.Troops.getAll/getById/getUnits/ensureFresh` fornece tropas próprias em casa; `Data.Villages` fornece origens próprias. Groups pode filtrar origens, mas não é necessário para V1.
- `services/mission-scheduler.js`: única fonte persistida `eas_tw_scheduler_v2`, particionada por mundo/jogador; criação, estados, histórico e cancelamento existentes.
- `services/scheduled-mission-execution.js`: preparação antecipada, vínculo de aba, autorização persistida, confirmação e tentativa consumida antes do clique. O executor existente era especializado em ataque. O envio final não repetia todas as validações; para Arrival é obrigatório validá-las novamente.
- `services/mass-snipe-execution.js`: calendário do servidor codificado em campos UTC, parser hoje/amanhã/data e relógio `Timing` com offset observado. Evita depender do fuso do computador.
- `services/mass-snipe-precise.js`: scheduler preciso existente, amostragem do relógio sincronizado, relógio monotônico na janela final e consumo único. Reutilizado sem compensação inventada (0 ms); não promete precisão absoluta sob throttling/rede.
- `index.js` e loader local: factories estáticas, Promise por recurso/build, resume de missão por contexto persistido. Arrival carrega somente em info_village ou ao retomar sua própria missão. Bootstrap não consulta map_info nem atualiza tropas.
- `EAS.Logger`: diagnóstico central; falhas do logger não autorizam nem bloqueiam ações.

## Limites de segurança

Análise usa apenas GET map_info comprovado, fila sequencial e cancelável, cache por origem/destino/mundo. Nenhuma ação irreversível ocorre durante análise. A autorização nasce exclusivamente no botão de agendamento. Preparação abre a Praça imediatamente, antes da janela crítica. Aba precisa permanecer disponível; atraso/contexto divergente pausa, sem retry automático.

`sendAtMs`/`desiredArrivalMs` são calendário do servidor UTC-wall; campos legados `sendTime`/`sendTimestamp` são adaptados ao calendário usado pela UI existente. Não são usados como relógio absoluto do computador. A tentativa Arrival é criada na autorização e preservada até o envio.

Resultado sem evidência explícita de sucesso permanece `verification-required`, com tentativa consumida. Não usar retorno à Praça sozinho como sucesso de Arrival. Fake, Smart Offers e Market não são alterados.

## Implementação e validação

`services/arrival-planner.js` contém parser, coleta sequencial, cache em memória do documento, cálculo, controles e criação autorizada da missão. `services/arrival-execution.js` acrescenta validação estrutural de apoio/ataque, read-back, exclusão entre abas via Web Locks e integração com o timer preciso existente. O `index.js` carrega esses serviços sob demanda, inclusive na retomada via contexto do scheduler.

Antes do clique final, a tentativa também recebe um lock imutável `eas_tw_arrival_consumed:<mundo>:<jogador>:<missão>:<tentativa>`, com read-back. Ele não agenda nem reconcilia: apenas impede reenvio caso outra aba grave uma versão antiga do contexto geral do scheduler. O teste simula essa sobrescrita e verifica que não ocorre segundo clique. Evidências/locks não são apagados automaticamente.

A preparação usa `EAS.Place.ensureCommandTarget/readTargetReadiness` sem alterar essas funções: o widget canônico pode esconder/esvaziar o input depois de resolver o destino. A disponibilidade é lida de `Data.Troops` na análise e novamente na seleção; o formulário do jogo é revalidado durante a preparação.

Os testes adicionados cobrem 120 origens em fila sequencial, cache, 429/abort, unidades/durações, composição e persistência; browser cobre DOM real de incoming, fechamento durante request, confirmação, concorrência e navegação completa com o userscript gerado. A suíte Node completa passou (253 testes). Na suíte browser, 44 de 45 páginas passaram; `scheduled-mission-process2.test.html` falha também contra HEAD: nobre `0` versus vazio e painel legado restaurado na Praça. Essa falha preexistente não foi corrigida nesta entrega.

## Limitações V1 e roteiro real

- Cache de tropas precisa estar disponível no Hub; a busca não inicia scans ocultos. Atualizar tropas no Hub é ação explícita do usuário. Cache de map_info é reutilizado ao reabrir o planner no mesmo documento.
- Identificação da aldeia visualizada usa o ID da URL e o fragmento nativo `#x;y`, ou coordenada única em `#village_info` quando disponível. Evidências contraditórias falham fechado. Incoming usa exclusivamente tipo/ID estruturais.
- Confirmar apoio requer os campos reais fornecidos (`support`, `x/y`, origem e tropas). Ataque requer evidência equivalente `attack=true/1`; ausência/divergência bloqueia envio.
- Precisão requer `Timing.getCurrentServerTime`, Web Locks e aba de confirmação disponível. Compensação de latência = 0; atraso superior a 1 segundo pausa, não tenta recuperar automaticamente. Limites do navegador/rede permanecem.
- Sucesso exige mensagem explícita reconhecida (português/inglês) em container de sucesso, sem erro. Outro retorno mantém decisão manual; não infere sucesso somente por navegação.
- Ainda não validado no jogo real. Primeiro conferir ATAQUE/APOIO e SNIP em info_village, offset, unidades, horários e Network ocioso. Depois agendar um apoio pequeno com antecedência; conferir origem/destino/composição na confirmação, envio único e resultado. Só então testar um SNIP controlado. Não usar comandos críticos durante essa validação.

Nenhum commit, push ou publicação faz parte da implementação.

## Correção de montagem após a primeira validação real

A existência de `ArrivalPlanner` não demonstrava montagem. O bootstrap completo já chamava `initialize()` antes de `EAS.start()`/retorno silencioso, mas `resolveTarget()` exigia `#village_info` e `initialize()` retornava sem log quando esse elemento não fornecia o alvo. A URL real informada (`screen=info_village&id=9113#524;438`) já traz a identidade/coordenada da aldeia visualizada. O mount deixou de depender exclusivamente daquele container. O diagnóstico original não incluía o HTML de `#village_info`; a reprodução comprova o bloqueio nessa variante, não presume que o DOM completo do jogo foi inspecionado.

Também faltava a chamada Arrival no ramo silencioso com UI já existente. Esse ramo agora passa pelo mesmo helper de página. `EAS.start()` continua responsável apenas pelo menu; nenhuma mudança no scheduler/execution/cálculo foi necessária.

Os testes anteriores já executavam o userscript completo, mas a fixture fornecia artificialmente `#village_info`, sem a tabela de incoming. A nova fixture omite esse ID e reproduz a URL, 78 rows, 26 markers attack e 65 support. Há 25 rows com ataque (uma contém dois markers attack), portanto o resultado correto é 25 SNIP. O teste falhou com o build anterior e passou com a correção.

Atualizações são observadas apenas no conteúdo relevante da página, com um observer registrado em `EAS.Runtime`, coalescência de 50 ms, descarte no pagehide/dispose e exclusão das próprias inserções e dos countdowns. Não há polling, requests ou automação de comando na montagem.

`ARRIVAL_PAGE_DETECTED`, `ARRIVAL_PAGE_MOUNT_STARTED`, `ARRIVAL_PAGE_MOUNTED` incluem screen, targetVillageId, commandRows, attackRows e snipeButtonsInserted. Recusas usam `ARRIVAL_PAGE_MOUNT_REFUSED` com reason; ataques cuja chegada não pôde ser lida mantêm um SNIP desabilitado com diagnóstico, sem autorizar operação.

Validação desta correção: Node 254/254; browser 45/46 (somente a falha legada já documentada); novo teste de mount com 25 assertions; sintaxe e `git diff --check` aprovados. Build local: `local-54ffe55c60d668df`. A validação visual no Tribal Wars ainda será feita pelo usuário.
