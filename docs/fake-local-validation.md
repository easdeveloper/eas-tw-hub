# Validar a continuidade do Fake sem publicar

## O que o código do repositório carrega

- `bookmarklet.txt` carrega `https://easdeveloper.github.io/eas-tw-hub/loader.js`, que carrega o `index.js` do mesmo endereço. Executa somente quando o atalho é acionado.
- `eas-tw-loader.user.js`, instalado em um gerenciador de userscripts, executa em cada nova página `game.php` de `tribalwars.com.br` e seus subdomínios. A URL com `screen=place&try=confirm` está incluída. Por padrão ele também usa o `index.js` remoto.
- O estado fica em `localStorage`; o vínculo da aba fica em `window.name`. Variáveis e listeners do documento anterior não são suficientes para uma navegação completa.
- No bootstrap silencioso com UI já existente, uma execução Fake ativa e vinculada à aba agora provoca o carregamento das dependências ausentes antes do resume. O confirmador não foi alterado.

Ainda é necessário confirmar qual desses carregadores está instalado no navegador do teste. A ausência dos dois globais prova que nenhum ponto de entrada **instrumentado** executou; também pode indicar que o navegador está carregando a versão publicada antiga.

## Carregar exatamente os arquivos locais deste patch

**Como distinguir os scripts no Violentmonkey:** `EAS TW Hub Loader` é o arquivo padrão, que busca o bundle remoto. `EAS TW Hub LOCAL validation` é o pacote gerado, que contém os fontes locais. O diagnóstico `codeSource: "remote"` com `localBuildId: null` confirma que o pacote embedded não estava ativo naquela página. Instalar apenas `eas-tw-loader.user.js` não instala o pacote local. O arquivo remoto não é atualizado por alterações neste projeto e não foi publicado como parte deste patch.

1. Gere o pacote na raiz do projeto:

   ```powershell
   python scripts/build-local-userscript.py
   ```

2. No gerenciador de userscripts do navegador usado no jogo, importe o arquivo **`local-test/eas-tw-local.user.js`**, ou crie um script e substitua todo o conteúdo pelo conteúdo desse arquivo. Salve e habilite **EAS TW Hub LOCAL validation**.
3. Desabilite temporariamente outras cópias do loader EAS. Durante este teste, não use o bookmarklet remoto.
4. Confira que o gerenciador permite executar o script no domínio brasileiro do jogo. Recarregue a página: instalar um script não garante execução retroativa no documento já aberto.

O arquivo gerado inclui `index.js`, os módulos, serviços e CSS desta cópia local. Usa URLs `blob:` em memória e **não baixa código do GitHub Pages**. Se um arquivo não estiver no pacote, o carregamento falha explicitamente, sem usar a versão remota como fallback. Não é necessário servidor local, commit, push ou publicação.

O userscript brasileiro não executa em outros domínios. Se o navegador/gerenciador bloquear scripts ou URLs `blob:` pela política da página, os marcadores de erro do loader devem ser enviados no diagnóstico; não há fallback silencioso para código antigo.

## Primeiro teste: continuidade, sem operação ativa

Encerre a execução antiga pelo Hub antes de instalar/habilitar a versão local, para que a retomada não envie um comando persistido durante este teste inicial.

Após uma navegação completa, inclusive em `screen=place&try=confirm`, execute no Console da página principal:

```js
typeof window.EASFakeDebug
window.EASFakeBootstrapDebug
window.EASTWUserscriptLoader.pageContext()
JSON.stringify(window.EASFakeDebug(), null, 2)
```

Verifique:

- `typeof` retorna `"function"`;
- `codeSource` é `"local-embedded"`;
- `localBuildId` corresponde a `buildId` em `local-test/build-info.json`;
- os eventos mostram `loaderReached`, `indexReached`, `fakeModuleInitialized` e, havendo execução autorizada, `resumeRequested`/`resumeEntered`/`confirmationHandlerEntered`.

Ative **Preservar log** no Console para guardar os eventos entre páginas. Se o helper não existir, envie também o domínio da página e o estado do userscript no gerenciador. Não envie novamente o bookmarklet para tentar mascarar a falta de carregamento automático.

## Segundo teste: operação pequena

Somente após confirmar a origem local, inicie uma operação nova com dois comandos. Verifique o mesmo `localBuildId` em cada página de confirmação e o avanço após cada envio. As validações, travas, composição e ações do executor permanecem as existentes.

Para o patch de destino, teste primeiro um comando e depois dois. Antes do ataque, procure `[EAS][FAKE][TARGET]`: ele mostra o valor visível, os valores submetidos (`nativeX`, `nativeY`, `submittedInput`), eventual ID selecionado e `targetValidated`. O adapter tenta restaurar o destino uma vez e revalida o formulário. `TARGET_NOT_APPLIED` interrompe o envio ou identifica a rejeição de destino retornada pelo jogo. A presença de `targetVillageId: null` não impede um formulário que aceita coordenadas diretamente.

Sempre que modificar os fontes, gere novamente o arquivo e reimporte/substitua o userscript instalado. Editar o arquivo local não atualiza automaticamente a cópia instalada no navegador. O diretório `local-test/` é gerado e ignorado pelo Git.

## Reconciliação do envio na Praça

O retorno real do jogo pode não conter `command_id` na URL nem `.success_box`. O Fake agora compara os IDs estruturados de `#commands_outgoings tr.command-row` com o snapshot capturado antes da confirmação. Quando a confirmação não mostra a tabela, usa o snapshot persistido na Praça antes de Atacar. O snapshot fica vinculado à execução, comando, tentativa, origem e alvo.

Somente um ID novo, de tipo compatível, mesma origem e coordenada extraída de `.quickedit-label` permite concluir. O texto do nome da aldeia ou do tipo do comando não é usado. IDs divergentes na mesma linha, coordenadas ausentes, paginação detectada, snapshot ausente ou candidatos ambíguos não autorizam sucesso. A espera pelo DOM tem limite de 10 segundos contado a partir do início da reconciliação na página de retorno; reload não reinicia esse prazo persistido. Não há reenvio automático.

Após sucesso, a tentativa conserva seu ID, o ID do comando real e a data de conclusão; `lastConfirmation` registra a associação. As listas de IDs anteriores são descartadas após a conclusão para não multiplicar o tamanho do storage por toda a fila. O próximo comando captura seu próprio snapshot.

Limites: tabelas incompletas ou comandos renomeados sem coordenada podem impedir a reconciliação. Um envio paralelo, externo ao EAS, da mesma origem para o mesmo alvo pode ser indistinguível pelas informações disponíveis no DOM. Faça o teste sem outros envios simultâneos dessa origem/alvo.

## Auditoria de imagens e HTTP 429

A busca nos fontes não encontrou criação de `.gif`, `new Image()` ou `sendBeacon`. Os `<img>` encontrados estão em `modules/mass-snipe.js` (`.webp`) e `modules/troop-counter.js` (`.png`). A referência a `.gif` em `core/troops.js` apenas identifica unidades no HTML; não cria nem solicita imagens. `core/observability.js` grava logs, sem imagens de comunicação.

Há refresh de aldeias/Mercado em `core/game-data.js` durante o bootstrap e leitura de HTML remoto por `DOMParser` em `services/market-engine.js`. Isso explica atividade desses módulos, mas não prova a origem da fileira de imagens nem dos 429 de `.gif`. Nenhum loop, imagem ou estilo foi alterado por hipótese.

Quando o problema ocorrer, capture:

```js
JSON.stringify(EASFakeImageDebug(), null, 2)
```

O helper apenas lê as imagens presentes (incluindo ancestral EAS quando identificável) e as últimas 50 entradas de recursos `.gif` já registradas pelo navegador. Não cria imagens, não faz requests e não instala timers. Query strings são removidas do resultado. Para atribuir a origem exata, envie também o campo **Initiator** de uma requisição 429 na aba Network; os dados de Performance podem não expor o status HTTP ou a pilha de criação.

### Baseline persistido por tentativa

O caminho anterior aceitava `readOutgoingCommands().available === false`, gravava
`beforeCommandIds: null` e ainda enviava. A serializacao/normalizacao nao removia o
campo. O log real nao distingue tabela ausente, DOM carregando, paginacao ou linha
invalida; `[EAS][FAKE][SNAPSHOT].reason` agora identifica essas causas.

Antes de Atacar, a tentativa recebe identidade e um snapshot real de
`#commands_outgoings`, persistido em
`eas_tw_fakes_execution.queue[currentIndex].confirmationAttempt.outgoingSnapshot`.
A leitura de volta verifica o JSON antes do clique. Na confirmacao, a mesma
identidade e baseline sao recuperados; DOM indisponivel nao os substitui por null.
Sem baseline valido, o envio fica bloqueado. A confirmacao direta ainda pode
capturar uma tabela real nessa pagina, antes do clique irreversivel.

Os logs SNAPSHOT incluem escopo, IDs, horario, persistencia verificada e indicacao
de reutilizacao do snapshot persistido (`restoredAfterNavigation`). Essa indicacao
significa recuperacao de baseline existente, inclusive em bootstrap duplicado.
O reconciliador e sua regra de evidencia positiva permanecem inalterados.
