# Attack small e marcadores secundários

Auditoria: Arrival continua delegando a leitura a FakesExecution.readOutgoingCommands.
O parser anterior classificava attack_small.webp e command/spy.webp como unknown.
A correção adiciona exatamente /graphic/command/attack_small.webp como attack,
preservando attack.webp e as extensões legadas attack.png/gif. Não reconhece
attack_small.png nem nomes arbitrários contendo attack.

command/spy.webp é secundário somente quando o conjunto de tipos principais é
exatamente attack. Isolado, junto de return_farm, ou com um principal desconhecido,
continua bloqueando o snapshot. graphic/reqdef.webp já estava fora dos marcadores
de tipo e sozinho não classifica ataque. Conflitos, UNKNOWN, validação de IDs,
exclusão de return_farm e regras dos reconciliadores permanecem em vigor.
Nenhuma alteração em POST, autorização, locks, reload, retries ou deadlines.

## Auditoria das 14 rows

A seleção atual é global: .command-row, mais tr.command-row do container legado,
deduplicadas por elemento. Ela não usa o número do cabeçalho Próprios comandos.
Logo, 13 próprios e 14 rows globais não demonstram por si só um erro de contagem.
O fragmento anterior 30817114 tem type=other e reqdef e é tratado como inventoryOnly:
seu ID pode constar no inventário, mas não prova envio próprio. Retornos conhecidos
são separados e excluídos de commandIds. quickedit-in continua bloqueando a leitura
conforme o comportamento anterior, sem introduzir uma nova exclusão silenciosa.

Não foi fornecido o HTML das 14 rows com seus containers e links. Portanto não é
possível identificar a 14ª row de produção, nem afirmar que corresponde à row
estrangeira anteriormente fornecida. A hipótese de conjuntos diferentes é compatível
com a evidência, não uma conclusão sobre essa página específica. Nenhuma alteração
de seleção foi feita sem essa evidência. O teste sintético 13 retornos + 1 foreign
valida apenas o tratamento conservador dessa combinação.

## Fixtures

attack-small-rows.html reconstrói de forma sanitizada os IDs 1532215952 e 959258661
e suas combinações de imagens relatadas. Não inventa origem/destino/horário como
se fossem dados reais. O teste acrescenta contexto sintético separado para provar
MATCH de um ID novo nos dois reconciliadores e rejeição de destino incompatível.
Também cobre secundários isolados, principais conflitantes/desconhecidos, mistura
com return_farm, deduplicação e ausência de MATCH com apenas novo retorno.

Build: local-f9e38657d8c2510e

Validação: 262/262 testes Node e 49/50 fixtures HTML. A nova fixture passa com
18 assertions. scheduled-mission-process2.test.html permanece com as mesmas duas
falhas anteriores (nobre vazio versus zero e painel de missão antiga). Nenhuma
regressão nova observada. git diff --check aprovado.

SHA-256: 165127d34833824ea754b6eb5d0a97e0a84d97d1abcf2d859fa74791e09288ca

Arquivos desta rodada: services/fakes-execution.js,
tests/fixtures/place/attack-small-rows.html, tests/attack-small-outgoing.test.html,
este documento e os artefatos local-test/eas-tw-local.user.js e build-info.json.
Sem commit/push; teste real de uma missão pendente.
