# EAS TW Hub — regras de arquitetura

1. Uma informação do jogo possui uma única fonte autoritativa dentro do EAS.
2. Um processo repetido possui uma implementação compartilhada.
3. Features descrevem intenção; o Core executa infraestrutura.

## Fontes autoritativas

- `EAS.Data.Villages`: fachada sobre `EAS.Villages`.
- `EAS.Data.Troops`: fachada sobre `EAS.Troops`, incluindo estado normalizado por aldeia.
- `EAS.Data.Market`: fachada sobre o cache econômico do `EAS.MarketEngine`.
- `EAS.Data.Resources` e `EAS.Data.Merchants`: projeções do mesmo Market State.
- `EAS.Data.Server`: relógio e identificação do mundo.
- `EAS.State.snapshot()`: visão consistente das fontes acima e seus metadados.

Leituras remotas passam por deduplicação in-flight, TTL específico por domínio e invalidação orientada por eventos. Scans em lote devem usar `EAS.Data.mapLimit`.

Seletores críticos ficam em `EAS.Selectors`; leitura e escrita de páginas ficam em `EAS.Adapters`. Execuções novas devem usar `EAS.Runtime`, `EAS.Window`, `EAS.Log` e `EAS.Usage`.

## Auditoria da UI operacional

- Intenção do usuário: executar, enviar, confirmar, pular e voltar ao menu.
- Recuperação: preparar novamente, atualizar dados e cancelar/encerrar uma execução ativa.
- Desenvolvimento: copiar/limpar diagnóstico e medições de performance.

Nesta etapa os controles de recuperação foram preservados para compatibilidade. Novas telas devem oferecer uma única ação “Atualizar dados”, implementada por `EAS.Data.refreshStale()`. Diagnósticos não devem ser necessários para concluir o fluxo normal e devem ficar condicionados à configuração de desenvolvimento.
