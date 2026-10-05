# Cunhagem — Criação automática oficial de 8h

## Motivo da mudança

A Academia já oferece sessões oficiais de criação automática de moedas por 8h. O EAS passa a verificar e ativar essas sessões, mediante ação explícita do jogador. O serviço não cunha moedas diretamente, não executa ciclos periódicos, não renova sessões e não cancela sessões oficiais.

BR143 comprovou duas representações do formulário oficial: o DOM navegado contém `input[name="h"]`, enquanto o HTML do GET pode conter `h` na query da action, sem input. O parser anterior exigia o input e retornava `NO_H_FIELD` mesmo com token presente na action. Ambas as representações agora são aceitas; valores divergentes produzem `H_TOKEN_CONFLICT`.

## Arquitetura e fluxo

- `modules/minting.js`: janela comum do Hub, seleção de grupo, preview, resumo e botão **Ativar 8h nas disponíveis**.
- `services/minting.js`: descoberta com `EAS.Data.Groups`, `EAS.Data.Villages` e `EAS.Data.mapLimit`, estado via `EAS.Storage`, lock exclusivo por mundo/jogador/sitter, processamento sequencial.
- `services/minting-adapter.js`: GET/POST same-origin, timeout e validação de sessão reutilizados do adapter anterior; parser estrito do contrato oficial.

1. Escolher explicitamente um grupo (a escolha anterior pode ser lembrada).
2. **Verificar aldeias** atualiza grupos, aldeias próprias e membros do grupo. Cada Academia é obtida por GET, independentemente da tela atual. A verificação não envia POST.
3. Revisar a tabela e o resumo: ACTIVE, AVAILABLE, UNAVAILABLE, PARSE_FAILED ou SESSION_INVALID. Sessão inválida impede ativar o preview.
4. **Ativar 8h nas disponíveis** consome o preview. Apenas AVAILABLE são processadas, sequencialmente, sob Web Lock. A associação ao grupo e a propriedade local da aldeia são conferidas novamente.
5. Antes de cada POST, outro GET fresco revalida a Academia. Uma aldeia que já ficou ACTIVE não recebe POST.
6. A tentativa é registrada antes do POST. Depois há um GET final para confirmar ACTIVE. Somente essa transição marca ACTIVATED (ATIVADA na UI).
7. Resultado incerto é UNCERTAIN. A sequência termina e não há retry nem renovação automática. Uma nova operação exige nova verificação e novo clique explícito.

## Contrato observado

GET: `/game.php?village=<ID>&screen=snob&mode=train`, preservando o contexto de sitter quando aplicável.

O formulário é identificado pela action oficial, resolvida em relação à URL final da resposta. A `table.auto-minting` não é obrigatória:

- `action=start_auto_minting_session`: AVAILABLE.
- `action=cancel_auto_minting_session`: ACTIVE.

Validações: mesma origem, caminho `/game.php`, screen=snob, aldeia correta, action única/esperada, sitter correto, method POST e token não vazio na query da action e/ou no input name=h habilitado e pertencente ao formulário selecionado. Repetições de h na mesma origem do token são rejeitadas; quando ambas as representações existem, os valores devem ser idênticos. Formulários/tabelas ambíguos, campos adicionais que exigiriam um contrato diferente e controles desabilitados não são ativados. Texto “Ativar”/“Cancelar” isolado não determina estado.

POST: action absoluta validada do formulário fresco, `application/x-www-form-urlencoded`, preservando a representação original. Token na query permanece na query; um campo h só é enviado no body quando existe no formulário. O adapter exige o callback de autorização/claim do controller antes do POST; não há autorização implícita. O EAS não envia count, não usa action=coin e não dispara action=cancel_auto_minting_session.

HTTP 200/302, texto de sucesso ou ausência de erro não confirmam ativação. O GET final deve mostrar o formulário oficial de cancelamento válido na mesma aldeia. Erro de transporte após iniciar POST também é UNCERTAIN e não gera repetição.

## Horário de término

Depois que o formulário oficial `cancel_auto_minting_session` comprova ACTIVE, o parser lê a linha `Fim: hoje às HH:MM:SS` ou `Fim: amanhã às HH:MM:SS` dentro do `.auto-minting-controls` que contém esse formulário. O texto não estabelece ACTIVE; fornece somente metadados opcionais.

A data-base vem do `#serverDate` da própria resposta. Uma resposta sem data não usa a data do PC nem a de outra página, pois a requisição pode atravessar a meia-noite. Somente ao analisar o próprio documento vivo o leitor pode reutilizar `EAS.World.getServerDateTime()` como alternativa. Datas/horários inválidos, linhas ambíguas ou ausentes mantêm ACTIVE e `endTime: null`.

`endTime` representa o calendário do servidor em campos UTC, como no Arrival Planner; não é um instante Unix a converter para o fuso do jogador. A UI formata `DD/MM/YYYY HH:MM:SS` diretamente nesse calendário. O valor atravessa o preview, persistência e GET de reconciliação sem alterar a autorização, o POST ou a política de não repetir resultados incertos. Quando indisponível, Fim mostra **—**.

## Storage e reload

Mantém-se a chave/lock `minting.v1.<world>.<player>.<sitter>` para o escopo existente; o formato salvo agora é version=2. Ao criar o controller, apenas config.groupId é aproveitado, inclusive de registros v1. Preview e autorização nunca são restaurados. Resultados e logs da execução contêm somente dados seguros; tokens, action URLs e HTML não entram no estado persistido.

O serviço não registra listener de inicialização, não cria runtime de scheduler e não possui start/stop/run/restore. Abrir/recarregar não verifica Academias nem ativa sessões automaticamente. O timeout de 20s de cada requisição HTTP apenas aborta requisições pendentes e é sempre limpo; não agenda execução de jogo.

Após atualizar o código, recarregar também abas antigas do Hub: uma aba que ainda está executando o código anterior não é substituída remotamente por esta versão. O nome antigo do lock foi mantido para não sobrepor execuções em abas com versões diferentes.

## Diagnóstico temporário seguro

`TEMPORARY_LIVE_DIAGNOSTICS = true` mantém os logs `[EAS Cunhagem] academy GET` por padrão durante a validação real. Remover/desativar após validar o parser das sessões oficiais. `console.debug` pode exigir nível Verbose/Detalhado no console; não exige acesso a EAS no contexto da página.

Somente: URLs sanitizadas solicitada/final, redirect, status HTTP, content-type em lista permitida sem parâmetros, quantidade de forms/tabelas/candidatos, action sanitizada, method, nomes de campos saneados, contagem e presença booleana de h, villageId, state e reason. Nunca valor de h, cookies, headers de autenticação, tokens, erro remoto bruto ou HTML completo.

## Legado removido

Removidos do código ativo da Cunhagem: cálculo de quantidade/count/maxMintable, POST action=coin, confirmação textual de moedas, contador de moedas, intervalo, Iniciar/Parar/Executar Agora, estado automation/nextRunAt, restauração periódica e scheduler. Os testes anteriores desses caminhos foram substituídos pelos testes das sessões oficiais. Fixtures antigas de cunhagem direta permanecem apenas como material histórico, sem referências no código/testes ativos.

Não foram alterados outros módulos, o painel flutuante comum, o bootstrap ou o menu do Hub. O carregamento existente da Cunhagem continua válido e inerte até ação do usuário.

## Testes e limites da validação

Fixtures `auto-off.html` e `auto-on.html` reproduzem a estrutura observada com tokens inteiramente sintéticos. Nenhuma ação real no Tribal Wars é executada pelos testes. O adapter HTML testa estados, contrato inválido, fresh GET/token, transição oficial, falhas sem retry e ausência de segredos nos logs. O controller Node testa preview explícito, reload sem ação/timer, sequência, lock, claim persistente, grupos e resultado incerto. O teste HTML da UI cobre integração, controles removidos, migração da seleção e ativação via clique.

A representação AVAILABLE do DOM e do GET está comprovada no BR143 (aldeia 4286). O DOM ACTIVE e sua linha de fim também foram comprovados na aldeia 199. Ainda pendem validação do POST/redirect pelo EAS, HTML ativo via GET no BR143, sitter e outras variantes. O contrato conhecido diz 8h; o EAS não inventa parâmetros de duração. Uma variação nos dados opcionais de fim não altera ACTIVE; uma variação no formulário de ativação continua bloqueada até validação.

Commit sugerido (não executado): `refactor(cunhagem): use official 8h auto-minting sessions`.


## Estados e evidências BR143

O adapter expõe `states` com os nomes semânticos e mantém os aliases usados pelo controller/UI:

| Semântica | Estado interno |
| --- | --- |
| AUTO_MINT_AVAILABLE | AVAILABLE |
| AUTO_MINT_ACTIVE | ACTIVE |
| AUTO_MINT_UNAVAILABLE | UNAVAILABLE |
| NO_ACADEMY | NO_ACADEMY |
| READ_ERROR | PARSE_FAILED |

`SESSION_INVALID` e `UNCERTAIN` continuam separados. Sem formulário, uma tabela auto-minting ou `#gold_overview` reconhecido permite UNAVAILABLE; sem evidência estrutural suficiente, o resultado é PARSE_FAILED. Um título localizado não prova o estado. Não existe evidência nativa negativa suficiente neste patch para emitir NO_ACADEMY: o estado permanece reservado, e ausência de formulário/token nunca o produz. Para implementá-lo, precisamos do HTML de uma aldeia comprovadamente sem Academia, incluindo a estrutura nativa de nível/pré-requisito.

Os diagnósticos incluem `tokenSource` (form-input, action-query, action-and-input), `academyPresent` e contagens, nunca o token. A forma ativa existente é `cancel_auto_minting_session` com contexto, método e token válidos. A fixture `br143-auto-active.html` reproduz os controles da aldeia 199 com uma data de servidor determinística para os testes de fim.

## Validação manual BR143 deste patch

1. Instalar o userscript LOCAL regenerado e recarregar o Hub. Escolher um grupo pequeno contendo 4286; verificar aldeias.
2. Confirmar AVAILABLE para 4286 com GET `screen=snob&mode=train`, sem nenhum POST durante verificação. O diagnóstico deve indicar action-query ou form-input, sem expor h.
3. Para limitar o teste a uma sessão, usar um grupo com somente essa aldeia elegível. Clicar explicitamente em Ativar 8h nas disponíveis.
4. Confirmar GET fresco, um único POST para start_auto_minting_session e GET final. O local do token deve corresponder ao formulário fresco. Só o formulário oficial de cancelamento válido confirma ACTIVE/ACTIVATED.
5. Verificar novamente: a aldeia já ativa não deve receber outro POST. F5 não deve retomar nem renovar sessões.
6. Se UNCERTAIN, conferir a Academia manualmente e não repetir automaticamente. Coletar o formulário oficial ativo completo (action, method, nomes dos campos, com h substituído por REDACTED), o container ao redor e o marcador de fim; comparar DOM navegado e Response do GET da mesma aldeia. Não compartilhar o token real.
