# Contexto de Mercado

## O que a ferramenta mostra

O Contexto de Mercado lê cotações Level I que o AddOn NinjaTrader transmite para o workspace. A tela `/market-context` atualiza a consulta a cada cinco segundos enquanto estiver visível e apresenta o universo de ações configurado, amplitude, setores quando informados, concentração, o contrato NQ/MNQ e a idade de cada amostra. Ela é descritiva e somente leitura: não envia ordens nem estima probabilidade de entrada.

Os blocos usam pesos relativos informados na configuração quando disponíveis. Se todos os componentes válidos não têm pesos, a área é igual e a mudança ponderada do índice fica indisponível. Setor, nome de empresa, peso e vencimento não são inferidos nem completados por uma fonte externa.

## Configurar no NinjaTrader

1. Gere/copiei o token de Integrações no workspace e use o endpoint de eventos exibido pela tela.
2. Compile a versão atual de `integrations/ninjatrader/NinjaControlAddOn.cs` no NinjaScript Editor instalado no PC.
3. No Control Center, abra **New → Ninja Control**, marque **Ativar mapa de contexto (cotações Level I)** e informe sua watchlist autorizada (máximo 100 ações) e o nome exato do contrato futuro, incluindo vencimento, como o NinjaTrader o reconhece.
4. Opcionalmente forneça metadados de cada ação no formato `SYMBOL|SETOR|PESO`, por exemplo `AAPL|Tecnologia|<peso vigente>`. Use ponto como separador decimal. Informe também a fonte e a data de vigência `AAAA-MM-DD`.
5. Mantenha a janela Output do NinjaTrader aberta para ver símbolos inválidos ou assinaturas recusadas. A tela mostra quantos instrumentos configurados enviam uma cotação recente.

O exemplo de peso acima é apenas formato. Consulte uma fonte autorizada para seus valores, constituintes, setor e vigência. NinjaTrader e a licença da conexão podem não fornecer ações do Nasdaq 100 ou todos os campos Level I. Não use dados de demonstração como se fossem um universo completo e não copie dados do TradingView.

## Recepção, cálculo e estados

- O AddOn coalesce atualizações por instrumento e envia snapshots em lotes de cinco segundos num endpoint de mercado separado de eventos de conta, ordem e execução.
- Os horários do evento da fonte e do recebimento do servidor ficam separados. Um instrumento é considerado fresco por até 20 segundos por padrão; ajuste `MARKET_CONTEXT_STALE_AFTER_MS` (5.000 a 300.000) após observar a latência real do provedor.
- O piso inicial de cobertura é 70%; `MARKET_CONTEXT_MINIMUM_COVERAGE_PERCENT` aceita de 50 a 100. Abaixo do piso, a tela exibe a amostra e suprime uma leitura abrangente.
- Retorno da sessão usa o último fechamento fornecido pelo NinjaTrader. 5 e 15 minutos usam o último valor persistido anterior ao instante de referência somente se ele tiver até 90 segundos; se não houver histórico suficientemente próximo, o retorno não aparece como zero.
- A mudança ponderada só aparece quando todos os instrumentos configurados têm cotação comparável e peso válido; uma amostra parcial não é apresentada como variação do universo completo.
- Concentração soma a contribuição absoluta dos cinco maiores componentes dividida pela contribuição absoluta de toda a amostra. Sem pesos cadastrados, as contribuições usam pesos iguais e não são P&L nem recomendação.
- `Alinhado` ou `Divergente` exige ações recentes com retorno comparável e um NQ/MNQ recente. Cobertura insuficiente, janela sem histórico, fonte antiga e futuro ausente permanecem visíveis como estados degradados.
- A série histórica guarda no máximo uma observação por instrumento por minuto e conserva 90 dias. Configure `CRON_SECRET` no Vercel para proteger e habilitar a rotina diária definida em `vercel.json`.

## Segurança e limites

Tokens não são enviados ao browser. O endpoint de ingestão verifica o mesmo token do workspace, limita payloads a 64 KB e 256 instrumentos/cotações por lote e separa todas as consultas pelo workspace autenticado. Dados de mercado passam por retenção própria e não removem snapshots de conta ou execuções.

O indicador não significa que um trade tem maior probabilidade de ganhar. Para estatísticas futuras, será necessário versionar referências de universo/pesos, armazenar contexto observado no instante de cada entrada e validar resultados em walk-forward com custos, amostra e incerteza.
