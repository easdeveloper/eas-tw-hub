# Cunhagem V1 — executor do formulário oficial

## Contrato observado e implementado

Evidência fornecida pelo usuário diretamente da interface oficial:

- GET `/game.php?village=<id>&screen=snob`.
- Formulário POST com `screen=snob&action=coin`, `input[name=count]` e `input[name=h]` dentro do formulário.
- POST para a action extraída: `/game.php?village=<id>&screen=snob&action=coin`.
- Corpo `application/x-www-form-urlencoded`: `count=<quantidade>&h=<token da página>`.
- Resposta observada: 302 para `/game.php?screen=snob&village=<id>`.
- O formulário só é renderizado quando existe cunhagem disponível. Ausência não prova ausência de Academia: uma página válida sem o formulário retorna `NOT_ELIGIBLE / NO_MINT_FORM`.

Nenhum endpoint em massa foi fornecido; a V1 processa o grupo com POSTs sequenciais. Não reutiliza código de terceiros nem calcula custos manualmente.

## Descoberta e tokens

`EAS.Data.Groups` obtém os grupos e sua associação pela visão autenticada já usada pelo projeto. O grupo é explícito, nunca inferido da URL. `EAS.Data.Villages` limita a seleção às aldeias possuídas. `EAS.Data.mapLimit(..., 2, ...)` limita GETs de inspeção a dois simultâneos.

`EAS.Adapters.Minting.inspectMinting(id)` carrega uma página nova e valida origem, caminho, screen, aldeia, contexto de sitter, método POST, unicidade do formulário/count/token e action. A action precisa apontar para a mesma origem e aldeia. IDs/classes dos campos e o tipo hidden de h não são exigidos. Parâmetros adicionais de navegação da action são preservados; origem e parâmetros críticos continuam validados. Falhas têm motivos específicos: `NO_H_FIELD`, `INVALID_COUNT_FIELD`, `INVALID_METHOD`, `INVALID_ACTION`, `MULTIPLE_MINT_FORMS`. Login retorna `SESSION_EXPIRED / LOGIN_PAGE`. Nenhum desses casos envia POST. Informações de acesso negado (401/403), formulário de login/senha e páginas inesperadas são rejeitadas.

`inspectVillage` devolve apenas campos não sensíveis. O `h`, action e mensagens anteriores permanecem em memória e não entram no storage, resultados ou logs do adapter. `execute` ignora tokens de discovery e faz OUTRO GET imediatamente antes da tentativa, usando o `h` dessa nova leitura. Não executa scripts do HTML remoto.

## Quantidade máxima: limitação ainda pendente

O trecho fornecido mostra `#coin_mint_fill_max`, mas não seu JavaScript nem um valor máximo. Portanto não foi possível validar seu algoritmo oficial. Não se usa texto decorativo do link, print, maxlength ou fórmula estimada como capacidade.

Se o input nativo fornecer `max` inteiro explícito, o adapter o utiliza: `count = min(requested, maxMintable)`. Esse suporte está coberto por fixture sintética; o atributo NÃO estava presente na captura fornecida. Sem esse atributo, `maxMintable = null`.

Com máximo desconhecido, count é limitado a 1 mesmo quando requested é maior. A presença do formulário foi confirmada pelo usuário como sinal de disponibilidade. A quantidade configurada é preservada e os logs/UI avisam: “Limite máximo oficial ainda não validado; execução limitada a 1 moeda por aldeia.” `maxlength` apenas valida o tamanho do campo; não representa moedas disponíveis.

Para ampliar esse suporte, precisamos do HTML completo do link e do trecho do JavaScript NATIVO que preenche `coin_mint_count` (incluindo os valores de entrada). Não enviar tokens reais.

## Redirects e confirmação

O transporte usa `fetch` nativo, `credentials: same-origin`, `mode: same-origin`, `cache: no-store`, `redirect: follow` e timeout de 20 segundos. Não se envia `X-Requested-With`, pois a operação observada é um formulário HTML normal. O 302 é seguido pelo navegador; analisa-se o HTML final e seu URL. Não há segundo GET para consumir uma mensagem flash nem retry de POST.

Referência sobre o comportamento de redirect do fetch: https://developer.mozilla.org/en-US/docs/Web/API/Request/redirect

Fetch resolvido, HTTP 200/302 ou redirect isolado não confirmam cunhagem. A página final deve pertencer à Academia/aldeia esperada, sem login e sem mensagem de erro. Usam-se os seletores de sucesso já encontrados no projeto (`.success`, `.success_box`, `.success-message`). Não foi fornecido um recibo estruturado específico de moedas.

O fallback PT-BR aceita UMA mensagem nova, explícita e não cumulativa, por exemplo `Você cunhou 1 moeda de ouro.`; também suporta as formas `Foi cunhada ...` / `Foram cunhadas ...`. A quantidade precisa ser um inteiro positivo até o valor tentado. Mensagem já presente no GET anterior, texto genérico de sucesso, `Você já cunhou ...` (possível total cumulativo), contagem excedente ou contraditória não contam.

**A fixture de sucesso é sintética, não uma captura do mundo do usuário.** O HTML e a redação real ainda precisam ser validados. Uma mensagem diferente resulta em `CONFIRMATION_FAILED`, confirmed=0 e parada da automação. O servidor pode ter cunhado apesar dessa falha de reconhecimento: conferir no jogo antes de reiniciar.

## Scheduler, resultados e proteções

Reutiliza `EAS.Runtime`, `EAS.Storage`, `EAS.Log`, `EAS.Usage` e as janelas existentes. Não altera o scheduler global, painel flutuante, Market ou Mass Snipe.

`IDLE → RUNNING → WAITING` enquanto ligado; Parar resulta em `STOPPED`. Executar Agora OFF faz um ciclo; ON substitui a espera e calcula o próximo como fim do ciclo + intervalo. 0.5/0,5 hora = 1.800.000 ms. WAITING restaura um timer; atraso gera no máximo um ciclo de recuperação. RUNNING após interrupção bloqueia repetição até conferência do usuário.

Web Locks por mundo/jogador/sitter e guarda local impedem ciclos concorrentes. A associação ao grupo é revalidada antes da inspeção final. A callback síncrona `beforePost(count)` verifica cancelamento e persiste a tentativa ANTES do POST. Falha nessa persistência impede envio. Um formulário que desapareceu ou quantidade não validável gera attempted=0, sem falso incremento. Parar durante o GET impede o POST; não desfaz uma requisição já processada.

Cada resultado contém `villageId`, `villageName`, `requested`, `attempted`, `confirmed`, `status`, `reason`. Requested preserva a quantidade configurada; attempted representa o count realmente preparado para envio. Só confirmed soma ao total. Por exemplo requested=5/max=3 produz attempted=3, não 5. Depois de uma tentativa com resultado incerto, a automação para, sem repetir automaticamente.

Chave `eas-tw-hub:minting.v1.<world>.<playerId>.<sitterId>`, via EAS.Storage: configuração, automação, status, total confirmado, contadores do último ciclo, lastRunAt/nextRunAt, resultados, últimos 100 logs e erro. Nenhum token é persistido. Horários são timestamps absolutos; a UI identifica a exibição no horário do navegador.

## Testes e validação pendente

- `tests/minting-adapter.test.html`: fixtures de form/login/sem form/página inesperada, token ausente, action inválida, limite, POST, resposta final, confirmação explícita, cancelamento, token fresco e sete aldeias. As fixtures usam tokens fictícios; `max` e recibo são cenários sintéticos documentados.
- `tests/minting.test.cjs`: scheduler, recuperação, grupo, locks, tentativa sem confirmação, contagem efetiva, cancelamento durante inspeção e falha de persistência antes do POST.
- `tests/minting.test.html`: UI e integração dos serviços com transporte simulado.

Os testes não gastam recursos no jogo. Permanecem pendentes: handler/valor real do preenchimento máximo, HTML exato da mensagem de sucesso, variantes de idioma/mundo e validação autenticada de ponta a ponta. O contexto de sitter é preservado e validado, mas também exige conferência no jogo.


## Alinhamento com os testes reais do usuário

A causa potencial dos falsos PARSE_FAILED no parser anterior era exigir id=coin_mint_count, type=hidden e restringir todos os parâmetros da action. Sem o HTML de cada falha não é possível atribuir todos os casos a essas exigências. Agora os campos são localizados por name dentro do formulário de screen=snob/action=coin; mantém-se validação de POST, origem e aldeia. Ausência do formulário é um skip, não falha de parsing. Página inesperada continua sendo bloqueada.

Cada ciclo atualiza grupo e elegibilidade (GET com cache no-store). A lista de aldeias elegíveis não é reutilizada permanentemente. O teste sete aldeias / ciclo seguinte três confirma 7 + 3, não 7 + 7.

Parar elimina o timer, mantém grupo/quantidade/intervalo/total/logs, reabilita Iniciar e desabilita Parar. Executar Agora OFF executa uma vez e continua OFF, sem nextRunAt. Durante esse ciclo é possível cancelar novas tentativas. Executar Agora ON/WAITING continua sendo política própria do EAS (fim do ciclo + intervalo), ainda não um comportamento externo validado.

Logs por aldeia indicam Academia carregada, formulário encontrado, elegibilidade, ausência de formulário e h ausente, sem conteúdo sensível. Para diagnóstico técnico do parser: `EAS.Storage.set('minting.diagnostics', true)`. O console recebe somente villageId, stage e reason; para desligar, definir false. Resultados persistidos preservam esses códigos, nunca h, HTML ou action completa.

Nenhuma cunhagem real foi disparada nos testes de desenvolvimento. Validação manual seguinte: selecionar explicitamente um grupo contendo uma aldeia, configurar 1 moeda e usar Executar Agora. Verificar a confirmação e o contador, e conferir que Parar permanece desabilitado e não há próxima execução, antes de testar grupo completo.
