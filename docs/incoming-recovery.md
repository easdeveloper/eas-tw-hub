# Recuperação do IncomingMonitor

O guard anterior recusava toda reconciliação com `failures >= 3`. O único
incremento estava no catch da reconciliação (leitura, merge, processamento ou
persistência); RATE_LIMITED também fixava o contador em 3. Não havia tentativa
de recuperação. Eventos do socket continuavam agendando chamadas recusadas.
Falhas de lock/event storage e callbacks de timer não incrementavam o contador.

O teste `incoming-pagination.test.html` reproduziu INCOMING_PAGINATION no código
anterior, inclusive numa visão todos com paginação. A reprodução foi ajustada
para 62 ataques, conforme a correção da captura real: a aba Ataques mostra
`Comando (62)` e controles `[1] [2] >todos<`. Apoios pertencem à aba separada;
o total geral de incomings não representa a quantidade de ataques.
Uma captura posterior confirmou 67 ataques, 134 marcadores data-command-id e
69 linhas em incomings_table. O teste atual usa 67 identidades, multiplicando a
linha real coletada em incoming-br143-real.html dentro de uma estrutura de tabela
reconstruída. Não representa uma cópia integral do HTML privado de 179116 caracteres.
O teste manual informado retornou os ataques com page=-1 sem mode=incomings;
a variante com mode retornou zero elementos compatíveis. Os logs recentes
confirmaram INCOMING_PAGINATION na etapa OVERVIEW. Essa evidência explica a
falha atual; não reconstrói as três falhas históricas cujos logs se perderam.

A leitura faz um GET normal e, se houver paginação, no máximo um segundo GET
para a variante observada: screen=overview_villages&page=-1&type=unignored&subtype=attacks,
preservando village/contexto e removendo mode. Nunca usa subtype=all nem o texto
Todos da barra de filtros. A resposta exige #incomings_table, linhas de ataques
válidos e correspondência entre o contador da coluna de comandos e o número de
commandIds únicos. Marcadores repetidos não aumentam a contagem. Seleção explícita
de página parcial, redirecionamento, contador divergente, tabela ausente ou linhas
inválidas impedem o merge. Uma resposta vazia da variante completa também falha
com segurança; não é interpretada como desaparecimento de todos os ataques.

Após três falhas, uma tentativa é agendada para 60 segundos depois. Uma tentativa
fracassada dobra o cooldown, até 15 minutos. O prazo é persistido, inclusive em
F5; socket não o antecipa. Web Lock e single-flight protegem cada tentativa.
Uma leitura/reconciliação válida zera o contador. O guard global de rate limit
continua respeitado; a recuperação não o desbloqueia.

RECONCILE_FAILED é emitido antes do incremento com contador anterior, etapa,
código seguro, status HTTP quando conhecido e razão do parser. As últimas 12
causas ficam em `EAS.IncomingMonitor.status().failureHistory`, sobrevivendo aos
logs rotativos. Há CIRCUIT_OPEN e RECOVERY_SCHEDULED/START/SUCCESS/FAILED.
Mensagens de erro arbitrárias, corpos, URLs e tokens não são registrados.

Comandos inéditos descobertos após uma falha tornam-se baseline silenciosa;
não há alertas retroativos da janela sem leitura confiável. Identidades já
conhecidas, signatures enviadas e intenções incertas continuam preservadas.

## Validação no BR143

1. Instalar o userscript local gerado e dar F5. Manter o transporte Discord
   existente. Não desativar/reativar o monitor para limpar failures.
2. Conferir `window.EASLocalBuild.id` e `EAS.IncomingMonitor.status()`.
3. Se houver failures=3 herdado, observar CIRCUIT_OPEN e RECOVERY_SCHEDULED;
   aguardar 60 segundos para RECOVERY_START. Os socket events devem continuar.
4. Na aba Network, conferir o GET overview/incomings/attacks e, quando paginado,
   no máximo um GET adicional page=-1, subtype=attacks, sem mode. Não compartilhar URLs com
   tokens. Conferir RECOVERY_SUCCESS, failures=0 e quantidade total de comandos.
5. Se houver ALL_VIEW_UNCONFIRMED, a proteção está funcionando: preservar a
   resposta para inspeção local do pager, removendo tokens e dados privados
   antes de compartilhá-la. Não remover o guard para aceitar a página parcial.
6. Com a leitura recuperada, observar um novo ataque legítimo: exatamente um
   NEW_INCOMING e um DISCORD_SENT de criação para seu commandId. Comandos antigos
   não devem produzir criações retroativas.
7. Dar F5 e confirmar que os mesmos commandIds não geram novas criações. Uma
   atualização de torre pode editar a mensagem existente, preservando messageId.
8. Exportar o diagnóstico e consultar failureHistory se ocorrer nova falha.
   Não provocar requisições extras no servidor para simular erros; esses cenários
   já são exercitados por mocks nos testes locais.
