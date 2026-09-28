# Variante commandicon-wt no leitor compartilhado

Fake e Arrival continuam usando `EAS.FakesExecution.readOutgoingCommands`.
O leitor examina as command rows, confere os IDs dos marcadores, quickedit e
link info_command, deduplica IDs e reconhece `/graphic/command/attack.webp`
(também png/gif). A imagem secundária de unidade não determina o tipo.
`data-command-type` continua suportado para attack/support; tipos ausentes,
desconhecidos ou conflitantes mantêm o snapshot indisponível. Não foi adicionado
reconhecimento de imagem support sem uma fixture real.

O fragmento BR143 fornecido contém `type=other` e reqdef. Seu ID entra no
inventário BEFORE, mas sua origem não é inferida do parâmetro village. O campo
`inventoryOnly` impede que Arrival use essa linha para comprovar nosso envio;
Fake também continua exigindo origem conhecida. Não se alteraram autorização,
locks, POST, persistência de tentativa, prazos ou proteção contra reenvio.

A fixture `watchtower-command-row.html` reproduz o fragmento fornecido, dentro
de table/tbody. O teste de navegador usa os parsers reais, verifica milliseconds
e fallback epoch, IDs alternativos/conflitantes, deduplicação, legado, UNKNOWN,
e a diferença BEFORE/AFTER nos dois reconciliadores. O mock Node de destino foi
corrigido para não retornar inputs ao consultar `.command-row`.

Build: `local-57c9efea7172c7b5`.
SHA-256 do userscript:
`aee00a29dfe5678a123e9f83fa78dc6b6926feb6a5db05f939d60a6723396900`.

Validação Node: 262/262 testes, incluindo 730 comandos sequenciais simulados.
Validação no Tribal Wars ainda pendente; nenhum envio real, commit ou push.
