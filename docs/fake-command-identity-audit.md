# Fake: auditoria de identidade de comandos (evidencia atual)

## Resultado

Nao ha fonte alternativa comprovada no repositorio para obter IDs outgoing
independentemente do DOM. Nenhuma nova estrategia de envio foi implementada.
O build local-a29fc8fa288deb2a e diagnostico; continuara bloqueando a variante
sem #commands_outgoings. Nao e um build para validar 2 envios nessa variante.

## Por que o container virou requisito

services/fakes-execution.js le IDs estruturados, compara o conjunto posterior
com beforeCommandIds e so aceita um novo ID com origem, alvo e tipo compativeis.
Isso evita confundir um comando anterior com a tentativa atual. docs/fake-local-validation.md
registra que o retorno real nem sempre inclui command_id na URL ou success_box.
A baseline foi antecipada para antes de Atacar porque a confirmacao nao mostrava
a tabela. A hipotese incorreta foi generalizar a disponibilidade da tabela no
retorno para a pagina pre-envio. A nova evidencia prova que ela nao esta disponivel
na variante real atual. [] valido continua distinto de null/ausencia.

## Onde existe segundo o material local

- tests/outgoing-dom.cjs reproduz campos de uma command-row fornecida anteriormente
  pelo usuario: quickedit-out, command-cancel, command_hover_details e info_command.
  Esse fragmento nao prova seu ancestral nem que exista antes do envio.
- tests/fakes-auto-execution.test.cjs injeta #commands_outgoings nas paginas simuladas;
  tests/fakes-execution.test.cjs tambem simula o container. Isso e uma premissa de
  fixture, nao evidencia de disponibilidade em todas as variantes reais.
- services/mass-snipe-execution.js procura esse mesmo container e incomings. Nao
  possui request alternativo de IDs de comandos.
- O historico real documentado contem leitura posterior de IDs outgoing; nao prova
  acesso anterior nessa variante. O relato atual mostra ausencia do container e
  dos marcadores de identidade antes do envio.

## Fontes auditadas

| Fonte existente | Dados obtidos | Serve como nova identidade? |
| --- | --- | --- |
| core/villages.js, core/groups.js | overview autenticado de aldeias/grupos | Nao: sem contrato de IDs outgoing |
| core/troops.js | overview_villages, mode=units, type=complete | Nao: contagens/estado de tropas |
| services/public-map.js | /map/player.txt, /map/village.txt | Nao: jogadores e aldeias |
| Mass Snipe | DOM de comandos; get_unit_info para velocidades | Nao: mesma dependencia DOM |
| FarmAssistant adapter | clique nativo, mudanca DOM/sucesso/ausencia de erro | Nao: nao extrai ID enviado |
| Scheduler | finalClickConsumed e mensagem/retorno a Praca | Nao: nao correlaciona novo command ID |
| Market/Minting/adapters | transportes, recursos, moedas, controles da pagina | Nao: sem adapter outgoing de ataques |
| EAS.World/game_data | identidade/contexto da pagina | Nenhum contrato/lista completa de outgoing comprovado |
| URL/resposta da confirmacao | clique nativo com navegacao; nenhuma resposta capturada | Nenhum contrato comprovado de ID por tentativa |

Nao foram adicionados requests, endpoints, navegacoes, interceptadores de APIs,
ou heuristicas de sucesso. Nenhuma fonte escolhida possui evidencia suficiente
para substituir o baseline. Logo nao existe ainda maneira comprovada de reconhecer
o novo ID nessa variante mantendo a garantia atual. Locks e UNCERTAIN seguem iguais.

## Diagnostico acrescentado

EASFakeDebug().snapshotSourceEvidence retorna inventario somente de leitura:
contagens de marcadores de identidade, IDs de elementos relacionados a comandos,
nomes de campos do formulario, destino sem tokens e nomes das propriedades de
game_data/village. Nao le valores de campos, cookies ou getters de game_data.
Nenhum desses dados autoriza envio. SNAPSHOT_SOURCE_EVIDENCE e registrado pelo
EAS.Logger uma vez por tentativa/motivo/documento (reinjetar pode gerar novo registro).
Falha na coleta nao altera a execucao. EASDebug preserva esse evento no logger.

## Evidencia exata que falta

1. Na pagina atual, executar JSON.stringify(EASFakeDebug(), null, 2) e
   JSON.stringify(EASDebug(), null, 2). Nao e necessario enviar ataque para coletar.
2. Precisamos de um contrato real de fonte: lista completa de IDs outgoing por
   aldeia, com prova explicita de lista vazia, OU resposta do servidor que associe
   inequivocamente o command ID a uma unica submissao (origem/alvo/tipo).
3. Se ja houver captura Network de um envio manual normal bem-sucedido, fornecer
   metodo/caminho/nomes de parametros, resposta e redirecionamentos da confirmacao,
   URL final e trecho que contenha o ID. Remover cookies, tokens e headers de
   autenticacao. Nao reenviar tentativa incerta para obter essa captura.
4. Se nao houver captura, preparar Preserve log no DevTools para um proximo envio
   manual que o usuario ja planeje fazer. Nenhuma navegacao adicional para lista
   Comandos nem envio automatico e necessario para esta instrumentacao.
5. Se os nomes em game_data revelarem possivel lista, coletar apenas esse campo
   especifico e sua estrutura; nao despejar todo game_data. Precisamos confirmar
   abrangencia, origem e significado de vazio antes de usar como baseline.

Uma URL com ID posterior sozinha nao comprova vinculo causal com esta tentativa;
contagens, ausencia de erros ou qualquer conjunto posterior nao substituem isso.
So apos validar esse contrato devemos implementar adapter e regressao correspondente.

Arquivos desta rodada: services/fakes-execution.js, tests/fakes-auto-execution.test.cjs,
este documento e local-test/eas-tw-local.user.js regenerado. Sem commit/push.
