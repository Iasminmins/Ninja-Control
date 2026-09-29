# Biblioteca persistente de CSVs do Experiment Lab

## Objetivo

Permitir que a pessoa envie exports CSV HSG e NinjaTrader Grid, mantenha os arquivos originais vinculados ao workspace autenticado, abra qualquer arquivo em outro navegador após entrar na mesma conta, compare os resultados na bancada atual e exclua um arquivo ou todos quando desejar.

Os CSVs contêm dados de trading. Eles não podem ficar em URLs públicas nem ser acessíveis apenas por conhecer um identificador.

## Abordagens consideradas

1. Guardar o texto dos CSVs no Neon. Reutiliza a infraestrutura existente, mas arquivos percorrem a aplicação e aumentam o banco.
2. Guardar CSVs em Vercel Blob privado e metadados no Neon. O navegador envia o arquivo diretamente ao Blob; o Neon relaciona o objeto ao workspace. Essa é a abordagem escolhida para arquivos originais e uploads maiores.
3. Guardar apenas os resultados extraídos. Reduz armazenamento, mas não preserva o CSV original para recuperar ou baixar.

Vercel Blob oferece uploads diretos do navegador e armazenamento privado, cujo acesso passa por autenticação implementada pela aplicação. O plano Hobby inclui 1 GB de armazenamento Blob e 10 GB de transferência de dados Blob ao mês; se os limites forem excedidos, o acesso ao Blob fica pausado até haver cota disponível. Esses limites são compartilhados conforme a conta/plano Vercel. Fontes: [uploads do navegador](https://vercel.com/docs/vercel-blob/client-upload), [armazenamento privado](https://vercel.com/docs/vercel-blob/private-storage) e [preços e limites](https://vercel.com/docs/vercel-blob/usage-and-pricing).

## Desenho aprovado em conversa

- Usar Vercel Blob com acesso **privado** para armazenar o conteúdo original.
- Criar tabela `experiment_csv_files` no Neon com ID, workspace, nome original, caminho Blob, tamanho, formato detectado e data de envio. O caminho é único e inclui um identificador aleatório; o registro sempre pertence a um workspace.
- Usar `requireWorkspace()` em cada operação. Um arquivo só pode ser listado, baixado, carregado para análise ou excluído quando seu registro pertence ao workspace da sessão.
- O servidor emite tokens de upload apenas após verificar sessão e workspace. O token restringe arquivos a CSV, limita tamanho e força o caminho dentro do workspace. O cliente não escolhe livremente o caminho nem informa outro workspace.
- Registrar os metadados quando o upload terminar, validando o objeto e o escopo. Tratar uploads incompletos e falhas de registro sem apresentar o arquivo como salvo.
- Na bancada, listar os arquivos salvos com nome, formato, tamanho e data. A ação **Carregar para análise** obtém o conteúdo por uma rota autenticada e reusa `parseExperimentCsv`; os gráficos e métricas existentes continuam sendo calculados no navegador.
- Manter o botão de remoção por arquivo. Adicionar **Excluir tudo**, com confirmação explícita. Exclusão individual e em lote apagam objeto e registro; respostas parciais indicam quais itens falharam e permitem nova tentativa.
- Não alterar arquivos carregados na análise atual até que a pessoa selecione os arquivos salvos. A remoção da análise em memória não exclui os arquivos persistidos; exclusão permanente fica identificada separadamente.
- Usar `Cache-Control: private, no-store` nas respostas que entregam CSV privado. Nunca expor URL pública ou token Blob ao navegador.

## Experiência e limites

- Preservar a importação de múltiplos CSVs HSG e NinjaTrader Grid e a análise comparativa existente.
- Preservar o limite atual de 100 arquivos e 25 MB por seleção; validar também o tamanho de cada arquivo no endpoint de autorização e no fluxo de armazenamento.
- Duplicatas com o mesmo nome são itens distintos, salvo se a pessoa excluir uma delas. Isso evita sobrescrever históricos silenciosamente.
- Mostrar estados de carregamento, falha de envio, falha ao recuperar, lista vazia e falha parcial ao excluir.
- A biblioteca fica acessível em qualquer navegador somente após login na mesma conta/workspace. Acesso offline não faz parte deste desenho.

## Segurança e tratamento de falhas

- A loja Blob deve ser privada e conectada ao projeto Vercel; nenhuma configuração secreta vai para código ou navegador.
- Listagem e operações usam os registros do banco escopados pelo workspace, não um pathname recebido sem validação do cliente.
- Recuperação autentica a sessão, valida propriedade, lê com SDK no servidor e transmite o conteúdo sem cache no navegador.
- Exclusão é idempotente. Se a exclusão do objeto e do metadado não concluir em conjunto, a interface reporta o estado e permite tentar novamente; a implementação deve evitar deixar o arquivo visível como disponível quando o objeto já não existe.
- Um upload que termine no Blob sem metadado não deve virar item acessível a outro workspace. A implementação deve incluir recuperação/limpeza de órfãos ou um fluxo com estado pendente e compensação.
- Mensagens de erro não incluem tokens, conteúdo CSV ou detalhes internos do provedor.

## Escopo fora desta mudança

- Compartilhar arquivos com outras contas ou workspaces.
- Automatizar backtests, alterar trades reais ou afirmar que métricas garantem lucro.
- Guardar cópias locais de segurança, sincronização offline ou converter dados para outra plataforma.

## Critérios de aceitação

1. Um CSV HSG ou NinjaTrader Grid aceito pode ser enviado pela bancada e aparece na biblioteca após a confirmação do upload.
2. Após sair ou recarregar a página em outro navegador, entrando na mesma conta, a lista continua mostrando o arquivo.
3. Carregar um arquivo salvo reproduz a análise correspondente à importação original, incluindo a comparação com outros arquivos escolhidos.
4. Usuário sem sessão não consegue listar, ler, enviar ou excluir arquivos.
5. Um workspace não consegue ler nem excluir arquivo de outro workspace mesmo alterando IDs na requisição.
6. Excluir um arquivo remove-o da lista e do armazenamento; **Excluir tudo** remove todos os arquivos do workspace e limpa a análise em memória.
7. Erros de upload, leitura ou exclusão ficam visíveis e não são apresentados como sucesso.
8. Arquivos privados não são servidos por URL pública nem cacheados em respostas do navegador.

## Pré-requisito de implantação

Criar e conectar um Vercel Blob store privado ao projeto, habilitar a autenticação/variáveis necessárias nos ambientes de produção e desenvolvimento e aplicar a migração Neon antes de ativar a biblioteca persistente. Sem Blob conectado, a interface deve informar que o armazenamento ainda não está configurado e não alegar persistência.
