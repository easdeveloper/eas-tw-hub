# Analise causal do trecho game.40f5ea.js fornecido

## Conclusao antes de nova correcao funcional

O trecho fornecido nao sustenta a hipotese de uma recursao simples de IMG, dado
o filtro de SCRIPT descrito pelo usuario. A deduplicacao e por valor/URL, nao
por bytes do script. Um novo UUID de blob e uma chave nova mesmo quando contem
JavaScript identico. Isso explica os pixels correspondentes aos blobs antigos,
mas NAO demonstra a origem dos cerca de 1805 requests no jogo real em idle.
Nenhuma nova correcao funcional/arquitetural foi feita nesta rodada sem essa
prova. Foram adicionados testes e metadados passivos de conteudo.

## Cache e emissao

Interpretando os indices conforme a descricao fornecida (a tabela ofuscada nao
foi fornecida), a chave e:

    o = n.split('?')[0]
    suffix = t ? t.slice(0, 50) : ''
    key = o + suffix

- URL identica: cache bloqueia a segunda emissao.
- Mesmo path com outro ?v=...: tambem bloqueia; a query e descartada.
- Novo UUID blob: chave nova; nao ha comparacao de conteudo.
- Data URL identica: mesma chave. Conteudo codificado diferente antes do primeiro
  '?' muda a chave (o EAS atual nao usa data URLs para scripts).
- t so pode diferenciar a chave pelos primeiros 50 caracteres. No callback src
  apresentado, _0x574527 e chamado sem t. Os outros gatilhos podem usa-lo.
- O cache e marcado ANTES de criar o pixel; a emissao nao aguarda load da imagem.
- O csrf_token entra no payload, nao na chave do cache. Nao o registramos nos
  novos diagnosticos ou nos resultados reais. Fixtures usam token ficticio.

O callback percorre addedNodes; nao ha varredura global de document.scripts no
codigo mostrado. Para um SCRIPT sem src, cada extrator de tc pode retornar um
valor. Para SCRIPT com src, o src e processado uma vez nessa passagem. Um IMG
adicionado aciona o observer, mas falha no filtro de SCRIPT e nao chama a funcao.
Isto nao permite concluir como os gatilhos a-f ou tc se comportam: faltam suas
definicoes, o decodificador e a declaracao/vida util de cache.

## Correlacao com o loader

No loader anterior: userscript/start insere Blob do index; index/start chama
loadScript sequencialmente, que insere 32 dependencias Blob. Cada URL tem UUID
proprio. O Initiator real (childList -> loadScript -> start -> PendingScript)
e compativel com a notificacao dessas insercoes, nao prova um loop no EAS.
Nao se encontrou observer do loader que chame loadScript nem reinjecao do mesmo
conteudo durante idle. Reinsercao com mesmo src seria bloqueada pelo cache nativo;
recriacao de Blob para o mesmo conteudo geraria outro src/chave.

O build atual, alterado na rodada anterior, usa funcoes estaticas: nenhum SCRIPT
ou JS Blob criado pelo EAS no bootstrap local. Ha uma unica folha CSS Blob;
o filtro de SCRIPT desse callback nao a processa. Outros gatilhos nativos ainda
nao foram fornecidos, portanto nao atribuimos a eles um comportamento presumido.
Os guards de documento/Promise e o comportamento de Fake/Market nao mudaram.

## Teste ocioso local realizado antes da instrumentacao nova

A fixture reproduz apenas a semantica dos dois trechos fornecidos, com filtro
SCRIPT, ramo Connection falso e tc vazio. Nao substitui nem intercepta game.js.
Usa navegador real/MutationObserver real e imagens no servidor HTTP LOCAL. Nao
faz requests ao Tribal Wars. A tabela de strings do decoder foi inferida da
descricao; a fixture esta explicitamente marcada como modelo parcial.

| Medida | Build antigo local-3bbd35f02cb9727e | Build atual estatico |
| --- | --- | --- |
| Scripts criados pelo EAS | 33 distintos | 0 |
| Pixels do ramo src atribuiveis a esses scripts | 33 | 0 |
| Pixels totais na fixture | 34 | 1 |
| Pixels do proprio driver externo da fixture | 1 | 1 |
| Incremento apos 20 starts adicionais | 0 | 0 |
| Novas emissoes provocadas pelos IMG | 0 | 0 |
| Requests de coleta funcional | 0 | 0 |

Os 34/1 totais incluem o script externo que executa o userscript no servidor de
teste; nao sao medidas de injecoes do Violentmonkey real. O build antigo foi
medido com a copia local preservada pre-injection-fix.user.js. A regressao
permanente testa o build atual e nao exige esse artefato antigo.
Cada arquivo antigo (index.js, core/eas.js, core/utils.js, etc., ate
services/minting.js) gerou uma chave de blob distinta. Nao houve um unico modulo
reinjetado centenas de vezes. O relatorio bruto local esta em
local-test/browser-temporary-legacy-telemetry.test.html.

## Instrumentacao adicionada

- assetHashes SHA-256 de cada source no userscript gerado, calculados no build.
- EASLoaderDebug: timestamp, src sanitizado, scriptType, contentHash,
  stableResourceId, sameContentProcessedBefore, stack resumida, motivo e session.
- Hashes de source iguais continuam iguais quando UUID/URL muda.
- Builds legados com string local usam fallback FNV-1a 32 bits, rotulado como
  nao criptografico; quando os bytes nao estao disponiveis, hash=null.
- Nenhum fetch para obter conteudo; nenhum patch global de criacao/insercao.
- Sem conteudo bruto, query, fragmento, payload /st/ ou data URL nos novos logs.
- Marcadores de execucao estatica nao fingem representar criacao de SCRIPT.

## Evidencia ainda necessaria para os 1805 requests

Solicitadas declaracao/inicializacao de cache, objeto tc, gatilhos _0x164101.a-f
e tabela/decoder _0x1027, sobretudo indices 191, 195, 203, 210, 223, 225. Isso
permitira confirmar o filtro literal, valores variaveis adicionais e se o cache
pode ser recriado. Nao pressupomos nenhuma dessas causas sem o codigo.

## Proximo teste real

Instalar o novo build local-2872fabd157e0da2 e F5 em place, sem abrir modulos.
Executar JSON.stringify(window.EASLoaderDebug(), null, 2) logo apos bootstrap
e novamente depois de permanecer ocioso. Esperado: loaderStarts=1,
indexStarts=1, bootstrapCompleted=1, scriptsCreated=0, scriptsInjected=0,
factoryExecutions=33; SHA-256 identificando cada source uma vez. Correlacionar
qualquer request persistente com seu Initiator, sem exportar csrf/payload bruto.
A validacao de 2 Fakes permanece posterior ao teste ocioso.

## Arquivos desta rodada

core/loader-diagnostics.js, scripts/build-local-userscript.py, index.js e
eas-tw-loader.user.js (somente metadados da criacao); testes de bootstrap e
hashes; tests/loader-telemetry-causality.test.cjs/.html;
tests/fixtures/loader/native-telemetry-excerpt.js e causal-idle-page.html;
esta nota e userscript regenerado. Nenhuma alteracao em Fake/Market/game.js.
Sem commit ou push. Tempestade real ainda nao declarada resolvida.

## Validacao final

Node completo: 219/219, incluindo 730 comandos. Browser: 37/38; permanece
scheduled-mission-process2, falha preexistente (noble 0 versus vazio/painel
presente). O comparativo legado adicional tambem passou, com 8 assertions.
Sintaxe de 71 arquivos JavaScript e do gerador Python aprovada; git diff --check
aprovado. Validacao no Tribal Wars real ainda pendente.
