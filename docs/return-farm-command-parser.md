# Return farm no snapshot compartilhado

Auditoria anterior à edição: Fake e Arrival usam o mesmo readOutgoingCommands.
O parser reconhecia imagens attack.webp/png/gif e data-command-type attack/support.
Não havia fixtures ou código comprovando outros tipos de retorno.

A allowlist adiciona somente o caminho /graphic/command/return_farm.webp.
Retornos reconhecidos passam pela validação de IDs e duplicatas antes de serem
separados como KNOWN_NON_CANDIDATE em ignoredKnownCommands. Não entram em commands
nem commandIds, portanto não participam de baseline ou MATCH nos dois executores.
Marcadores desconhecidos e conflitos continuam bloqueando o snapshot. Imagens de
unidade e textos localizados não determinam tipo. Logs Fake BEFORE/AFTER incluem
ignoredKnownCommands e unknownCommandMarkers; o leitor também retorna
recognizedCandidates. Nenhum mecanismo de POST, autorização, lock, deadline ou
reenvio foi alterado nesta rodada.

A fixture mista é uma reconstrução sanitizada dos campos de retorno fornecidos,
combinada com a estrutura watchtower anteriormente fornecida. Não é uma captura
integral das 14 linhas da página de produção.

Validação: 262/262 testes Node; 48/49 fixtures HTML. A única falha é
scheduled-mission-process2.test.html, já documentada em fake-place-command-rows.md:
nobre vazio versus zero e painel de confirmação antigo. Essa fixture carrega
mission-scheduler.js e scheduled-mission-execution.js, não alterados nesta rodada.
As sete fixtures anteriores passaram; return-farm-outgoing.test.html passou com
19 assertions, incluindo novo retorno sem MATCH, novo ataque com MATCH e filtro
de destino preservado nos dois reconciliadores.

Build: local-23aceb06076e4f71

SHA-256: a2e744dc58688fea869c2535b370109decfa53c660ec0c74bfa8148898e5d66b

Arquivos desta rodada: services/fakes-execution.js,
tests/fixtures/place/mixed-return-farm.html, tests/return-farm-outgoing.test.html,
este documento, local-test/eas-tw-local.user.js e local-test/build-info.json.
Runner e logs auxiliares permanecem em local-test (ignorado pelo Git).
Sem commit/push. Teste real de uma missão ainda pendente.
