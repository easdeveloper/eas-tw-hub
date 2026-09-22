# Investigacao temporaria de imagens /st/

## Auditoria estatica

Escopo: loaders, index, core, services, modules e gerador do userscript local.
Busca por createElement/img, Image, appendChild/append/prepend,
insertAdjacentHTML, innerHTML, src, fetch/XMLHttpRequest/sendBeacon,
Blob/createObjectURL/blob e MutationObserver. Inventario bruto local em
local-test/image-static-audit.txt.

- Templates IMG explicitos encontrados em modules/mass-snipe.js (unit webp)
  e modules/troop-counter.js (unit png), dentro das interfaces desses modulos.
- Nenhum construtor new Image(), beacon ou gerador explicito de /st/ foi
  encontrado no runtime auditado. Isso nao exclui efeitos de codigo externo.
- innerHTML/insertAdjacentHTML sao usados extensivamente para interfaces;
  appendChild tambem insere paineis, controles, scripts e links de estilos.
  A busca estatica nao prova todos os valores possiveis de interpolacoes.
- Leituras HTTP incluem paginas autenticadas, mapa publico e informacao de
  unidades. Ha parsing de HTML recebido com DOMParser; isso nao demonstra
  criacao de IMG sob ds_body nem identifica a origem dos GIF observados.
- Os MutationObservers existentes monitoram estado/DOM dos modulos.
- Blobs locais: eas-tw-loader.user.js cria JS para index; index cria JS/CSS
  dos assets embutidos. troop-counter cria CSV para download. Nao foi
  encontrada conversao dessas URLs para /st/ ou criacao de IMG nesse caminho.
  Nao existe evidencia estatica de nexo causal com os GIF.

## Instrumentacao

core/image-trace.js e executado pelo gerador LOCAL antes do loader, diretamente
no contexto do userscript com exposicao em unsafeWindow. Nao depende do Fake.
O observador usa document como ancora para detectar ds_body tardio/substituido,
mas so registra IMG /st/ dentro de ds_body. Nao modifica DOM, estilos, rede ou
prototipos. Nenhuma API global e interceptada.

index e userscript registram apenas seus proprios pontos de criacao de blobs
com URL, arquivo e stack desse ponto. Essas stacks NAO sao stacks de IMG.
MutationObserver nao disponibiliza stack do criador: creatorStack e null e
origin permanece undetermined. Nem easOwner nem proximidade temporal provam
quem criou a imagem.

## Reproducao

1. Substituir o userscript LOCAL pelo arquivo regenerado e recarregar a pagina.
2. Reproduzir os elementos visuais.
3. Executar:

```js
JSON.stringify(window.EASImageTraceDebug(), null, 2)
```

O JSON inclui eventos, imagens atuais, resources /st/, scripts e loaderEvents.
Campos de timing indisponiveis podem ser null/zero. O navegador pode descartar
recursos antigos; nao alteramos o buffer global. Eventos limitados a 300, com
contador de descarte. O historico dura ate navegar/recarregar; em cada pagina o
userscript instala um novo observador. Imagens preexistentes sao marcadas como
existing-at-start, sem atribuir criacao ao EAS.

Se a origem continuar indeterminada: no DevTools Elements, selecionar ds_body,
Break on > Subtree modifications e reproduzir. Quando parar na insercao do IMG,
copiar a Call Stack e o Initiator da requisicao /st/ no Network. Usar o mapa
loaderEvents para resolver URLs blob para arquivos EAS, quando corresponderem.
Esse procedimento pode distinguir codigo do jogo, EAS ou terceiros; a ausencia
de correspondencia nao prova que uma extensao seja responsavel.

Nenhuma correcao visual foi aplicada; nao houve mudanca no Fake.

## Correlacao Base64 / blobs (segunda etapa)

O unico payload fornecido nesta etapa decodifica para:

```
3e180fa8-blob:https://br143.tribalwars.com.br/50df7718-0681-4fc9-b800-85b09fb7a0f2
```

O blobMap/loaderEvents dessa mesma reproducao nao foi fornecido. Logo, a
quantidade de correspondencias reais ainda e desconhecida, nao zero.

O helper agora decodifica todos os /st/<payload>.gif retidos em eventos, DOM
atual e Resource Timing, sem requisitar URLs. correlations tem uma linha por URL
unica, incluindo falha de decodificacao. matchesEasBlob exige igualdade da URL
blob completa. blobMap informa asset, finalidade e horario do marcador EAS.
correlationSummary distingue URLs unicas de elementos IMG atuais: load/error
repetidos nao contam como novos pixels. repeatedAssets identifica arquivos com
mais de uma URL blob distinta nos registros retidos.

pixelAddedAt e o primeiro horario observado em um evento added para aquela URL,
na entrega do MutationObserver, nao o instante exato de criacao. Se a mesma URL
aparecer em varios elementos, esse horario e compartilhado. Imagens preexistentes
ou vistas somente nos recursos nao ganham horario de insercao inventado.
blobCreatedAt e o horario do marcador imediatamente depois da criacao da URL.
Portanto deltaMs e uma diferenca entre observacoes, nao uma medicao causal.

Uma correspondencia exata comprova correlacao do conteudo do pixel com um blob
registrado pelo EAS. Ainda NAO prova quem criou o IMG, nem que ausencia de revoke
seja sua causa. creatorStack continua null; origin continua undetermined.

### Ciclo de vida estatico

Inicializacao completa bem-sucedida numa pagina nova: 1 blob do index no
userscript, 1 CSS e 32 JS assets no caminho principal do index = 34 blobs.
Os 51 arquivos embutidos nao sao todos executados/criados como blob ao iniciar.
Modulos carregados sob demanda podem criar blobs adicionais; caminhos de resume
ou runtime preexistente podem carregar menos assets.

O userscript possui guards de bootstrapped/initializing/script existente.
loadScript verifica Set e script[data-eas-script]; loadStyle verifica link
existente. Nao ha loop que recrie blobs no caminho normal de inicializacao.
Cada full-page navigation cria um novo conjunto; removendo elementos ou em
outros caminhos de reinicializacao, a contagem pode diferir. O JSON permite
verificar repeticoes reais na mesma pagina.

Nenhum revokeObjectURL encontrado no loader/index para JS/CSS. Isso e uma
observacao de ciclo de vida, sem evidencia de que provoque IMG. CSV no contador
de tropas cria um blob por exportacao e agenda revokeObjectURL com timeout 0
apos link.click(); existe limpeza explicita, mas a auditoria estatica nao prova
a conclusao do download em cada navegador. Nenhuma revogacao foi modificada.
O ponto CSV recebeu apenas um marcador diagnostico de criacao.

### Teste A/B sem alterar jogo ou protecoes

Usar uma pagina ociosa, sem execucao automatica ativa. Manter navegador, outras
extensoes, conta, URL e tempo de observacao iguais. Fazer A/B/A em paginas novas
(recarregar; nao basta desativar o userscript numa pagina ja carregada).

A: desativar apenas EAS/userscript; nao acionar o atalho. Abrir a mesma URL,
aguardar 10 segundos e executar a leitura abaixo. O helper EAS nao existira.

```js
JSON.stringify({
  url: location.href,
  timestamp: Date.now(),
  images: [...document.querySelectorAll('#ds_body img')]
    .filter(i => [i.src, i.currentSrc].some(s => s.includes('/st/')))
    .map(i => ({ src: i.src, currentSrc: i.currentSrc,
      complete: i.complete, naturalWidth: i.naturalWidth, outerHTML: i.outerHTML })),
  resources: performance.getEntriesByType('resource')
    .filter(r => r.name.includes('/st/'))
    .map(r => ({name: r.name, initiatorType: r.initiatorType, startTime: r.startTime}))
}, null, 2)
```

B: ativar o userscript LOCAL, abrir novamente a mesma URL, aguardar 10 segundos,
repetir a leitura acima e executar EASImageTraceDebug(). Guardar ambos JSONs.
Voltar a A para verificar repetibilidade. Nao clicar em ataques para esse teste.

Comparar existencia, quantidades e correspondencias exatas em B. Se aparecerem
so em B, isso reforca dependencia da ativacao do EAS nesse ambiente; nao separa
EAS de uma reacao do jogo/extensao ao carregamento dos blobs. Para autoria,
continuar com breakpoint de DOM e Initiator conforme a primeira etapa.
