# Validar a continuidade do Fake sem publicar

## O que o código do repositório carrega

- `bookmarklet.txt` carrega `https://easdeveloper.github.io/eas-tw-hub/loader.js`, que carrega o `index.js` do mesmo endereço. Executa somente quando o atalho é acionado.
- `eas-tw-loader.user.js`, instalado em um gerenciador de userscripts, executa em cada nova página `game.php` de `tribalwars.com.br` e seus subdomínios. A URL com `screen=place&try=confirm` está incluída. Por padrão ele também usa o `index.js` remoto.
- O estado fica em `localStorage`; o vínculo da aba fica em `window.name`. Variáveis e listeners do documento anterior não são suficientes para uma navegação completa.
- No bootstrap silencioso com UI já existente, uma execução Fake ativa e vinculada à aba agora provoca o carregamento das dependências ausentes antes do resume. O confirmador não foi alterado.

Ainda é necessário confirmar qual desses carregadores está instalado no navegador do teste. A ausência dos dois globais prova que nenhum ponto de entrada **instrumentado** executou; também pode indicar que o navegador está carregando a versão publicada antiga.

## Carregar exatamente os arquivos locais deste patch

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

Sempre que modificar os fontes, gere novamente o arquivo e reimporte/substitua o userscript instalado. Editar o arquivo local não atualiza automaticamente a cópia instalada no navegador. O diretório `local-test/` é gerado e ignorado pelo Git.
