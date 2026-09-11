# Cunhagem — Criação automática oficial de 8h

## Motivo da mudança

A Academia já oferece sessões oficiais de criação automática de moedas por 8h. O EAS passa a verificar e ativar essas sessões, mediante ação explícita do jogador. O serviço não cunha moedas diretamente, não executa ciclos periódicos, não renova sessões e não cancela sessões oficiais.

O problema antigo NO_H_FIELD em action=coin não foi provado a partir do fragmento recebido. Esta mudança substitui aquele contrato pela funcionalidade oficial observada; não afirma ter resolvido retroativamente a causa do parser antigo.

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

GET: `/game.php?village=<ID>&screen=snob`, preservando o contexto de sitter quando aplicável.

Somente formulários dentro de uma única `table.auto-minting` são considerados:

- `action=start_auto_minting_session`: AVAILABLE.
- `action=cancel_auto_minting_session`: ACTIVE.

Validações: mesma origem, caminho `/game.php`, screen=snob, aldeia correta, action única/esperada, sitter correto, method POST e exatamente um input name=h não vazio, habilitado e pertencente ao formulário selecionado. Formulários/tabelas ambíguos, campos adicionais que exigiriam um contrato diferente e controles desabilitados não são ativados. Texto “Ativar”/“Cancelar” isolado não determina estado.

POST: action absoluta validada do formulário fresco, `application/x-www-form-urlencoded`, contendo somente o campo h fresco. O EAS não envia count, não usa action=coin e não dispara action=cancel_auto_minting_session.

HTTP 200/302, texto de sucesso ou ausência de erro não confirmam ativação. O GET final deve mostrar o formulário oficial de cancelamento válido na mesma aldeia. Erro de transporte após iniciar POST também é UNCERTAIN e não gera repetição.

## Horário de término

O texto observado “Fim: amanhã às 06:36:10” ainda não fornece um seletor/atributo de tempo confiável. ACTIVE é identificado estruturalmente, mas a coluna Fim mostra **—**. Nenhum horário é interpretado no timezone local nem calculado artificialmente.

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

Ainda pendem validação no jogo real: HTML exato recebido pelo fetch em ambos os estados (inclusive possível diferença frente ao DOM renderizado), comportamento do POST/redirect, sitter, mundos/contas com variações de formulário e marcação confiável do horário de término. O contrato conhecido diz 8h; o EAS não inventa parâmetros de duração. Se a estrutura variar, a ativação é bloqueada até validar a variação.

Commit sugerido (não executado): `refactor(cunhagem): use official 8h auto-minting sessions`.
