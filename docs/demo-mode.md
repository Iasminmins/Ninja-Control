# Modo de demonstração

O Ninja Control nesta fase é um protótipo local de interface e fluxos. Contas, trades, eventos, alertas e métricas são sintéticos e aparecem identificados como demonstração.

## Dados e persistência

- As alterações ficam no `localStorage` deste navegador, na chave `ninja-control.demo.v1`.
- As alterações não são sincronizadas entre usuários, dispositivos ou navegadores. Uma aba aberta em outro contexto recebe atualizações via evento de armazenamento do navegador.
- Em **Contas**, use **Restaurar demonstração** para apagar alterações locais e recriar a amostra inicial.
- Se os dados salvos estiverem inválidos ou em versão incompatível, o aplicativo recupera a amostra inicial.
- Não insira credenciais, tokens ou dados financeiros reais.

## Limites atuais

Não existe autenticação, banco remoto, integração conectada, envio de alertas, envio de ordens ou proteção de risco real. Os conectores aparecem como não configurados. Hunter e HSG permanecem aguardando a especificação das regras; os rótulos não implicam comportamento implementado.

## Integração planejada com NinjaTrader

A NinjaTrader oferece uma Trade API com endpoints para consultar contas e atividade. Para integrar usuários via web app, o fluxo oficial documentado é OAuth: é necessário obter `client_id` e `client_secret` para o aplicativo e registrar a URL de retorno. O segredo deve permanecer no servidor. Começar no ambiente Demo e expor apenas leitura até existir autenticação por usuário, armazenamento seguro de sessões/tokens, mapeamento idempotente das execuções e aprovação explícita de qualquer capacidade de escrita. Não envie senha, `client_secret` nem tokens no chat.

## Para uma fase conectada

Antes de uso multiusuário, definir provedores e permissões suportados; criar API e banco com isolamento por usuário; implementar autenticação e autorização; guardar segredos exclusivamente no servidor; definir sincronização, idempotência, auditoria, retenção e recuperação; configurar observabilidade e consentimento. Antes de implementar Hunter/HSG ou proteção automatizada, obter as regras, parâmetros, limites, falhas seguras e cenários de validação aprovados pelo responsável.
