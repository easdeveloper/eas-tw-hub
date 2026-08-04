# eas-tw-hub
Tribalwars Hub by EAS Dev

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
