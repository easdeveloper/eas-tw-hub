# eas-tw-hub
Tribalwars Hub by EAS Dev

## Painel flutuante

Com o userscript instalado, o Hub apresenta automaticamente seu painel de ferramentas. Arraste pelo cabeçalho; o botão **Minimizar** mantém um launcher **EAS** arrastável. Clique nele para restaurar. Posições e estado são salvos pelo `EAS.Storage` em `localStorage`, na chave `eas-tw-hub:floating-panel`, por domínio do jogo. O conteúdo rola dentro do painel e as posições são corrigidas quando a janela diminui.

O dashboard existente ocupa o novo shell. Os módulos continuam abrindo suas janelas originais, com o painel principal minimizado. Nenhum cálculo, scheduler ou executor foi migrado. Após montar o shell, o Hub remove do DOM somente o link com texto exato **EAS TW Hub** dentro da barra rápida; os demais atalhos e a configuração salva da barra não são alterados.

## Atalho da barra rápida

O nome visível do atalho pode ser qualquer um. A inicialização não procura nem valida o texto do link; ela depende somente do código salvo em **URL-Alvo**.

Use o conteúdo de `bookmarklet.txt` como URL-Alvo. Ao tocar, uma mensagem “EAS TW Hub — iniciando...” aparece imediatamente, antes do download dos arquivos principais.

Se nada aparecer, o navegador não executou o código `javascript:` da barra rápida. Nesse caso, abra `/mobile-test` no mesmo navegador e toque em **Testar compatibilidade**. Essa página não acessa a conta nem executa operações do jogo.

O loader mostra um código curto para suporte:

- `LOAD-001`: o download excedeu o tempo limite.
- `INIT-002`: o arquivo chegou, mas o Hub não confirmou a inicialização.
- `DOM-003`: a página do jogo está diferente do esperado.
- `NETWORK-004`: o arquivo não pôde ser baixado.
- `MOBILE-005`: ambiente móvel não reconhecido.

## Continuação automática entre páginas

O bookmarklet é carregado dentro da página atual. Quando o Tribal Wars navega para outra página, o navegador descarta esse contexto JavaScript. O estado salvo pelo Hub permanece, mas é necessário instalar o userscript [eas-tw-loader.user.js](eas-tw-loader.user.js) para que o bundle seja carregado novamente e retome automaticamente missões e execuções persistidas.

No computador, instale Tampermonkey ou Violentmonkey e importe o arquivo `eas-tw-loader.user.js`. O userscript executa somente nas páginas `game.php` dos mundos brasileiros configurados e carrega exclusivamente o bundle oficial. Ao terminar a inicialização, o painel restaura seu estado salvo; em uma primeira visita com execução ativa, começa minimizado. As permissões e os domínios do userscript permanecem os mesmos.

No Android, a continuação automática exige um navegador que aceite extensões/userscripts e um gerenciador compatível. O Chrome móvel padrão não executa Tampermonkey ou Violentmonkey e, portanto, não consegue manter a automação entre navegações completas. Nesses navegadores, o bookmarklet continua disponível como fallback, mas precisa ser acionado novamente após cada troca de página.

O bookmarklet continua sendo a forma manual de abrir o menu. Se o userscript já tiver carregado o bundle, o bookmarklet apenas abre a interface existente e não injeta uma segunda cópia.
