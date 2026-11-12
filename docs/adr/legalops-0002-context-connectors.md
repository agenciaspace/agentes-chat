# ADR 0002: Composio e Executor para contexto do escritório

Data: 12/11/2026. Status: recomendação de integração; nenhuma conta conectada e
nenhum documento real importado nesta avaliação.

## Decisão

**Começar com Composio para Drive, Docs e OneDrive.** O fork já possui
OAuth, associação da conexão à organização, ferramentas e testes de Composio para
Google Drive, Google Docs e OneDrive. Aproveitar essa implementação exige menos
adaptação do que adicionar outro gerenciador de credenciais. O ganho esperado é
tempo de implementação; preço, limites de cada plano e contratos de tratamento de
dados ainda precisam ser comparados para o volume do cliente.

**Usar Executor quando houver uma necessidade concreta adicional:** escritório já
usa a plataforma, precisa integrar um sistema próprio, executar uma automação
persistente ou reunir ferramentas via MCP. O app já aceita conectores MCP, que são
o caminho para um piloto. Executor não substitui o modelo de IA, a autorização do
legalops.chat, seu banco ou o controle de acesso aos documentos. Não precisamos
dos dois fornecedores para a mesma fonte na primeira entrega.

Se a biblioteca principal do escritório estiver no **SharePoint**, vale priorizar
um piloto Executor: seu catálogo tem essa integração, enquanto o fork não possui
preset SharePoint. Antes de escolher, compare esse piloto com o esforço de
validar e adicionar um toolkit SharePoint no Composio. A recomendação de menor
esforço para Composio se aplica às fontes já integradas, não a qualquer sistema.

| Critério | Composio | Executor |
| --- | --- | --- |
| Evidência no projeto | Implementação em `packages/engine/src/connectors/composio.ts`, presets e teste `apps/server/scripts/composio-check.ts` | Cliente MCP genérico existente; sem adaptador Executor específico validado |
| Fontes iniciais | Presets Composio de Drive, Docs e OneDrive já definidos | Catálogo consultado pela conexão: Google Drive, OneDrive e SharePoint, todos com OAuth2 |
| Contas e ferramentas | Conexão associada à organização; ações selecionadas nos presets | Contas e ferramentas gerenciadas no workspace Executor; exige mapear um workspace/conta ao cliente e filtrar ferramentas |
| Sistemas próprios | Avaliar toolkit/API e OAuth necessários | Ferramentas próprias, armazenamento e rotinas tornam essa opção interessante |
| Esforço inicial | Menor, por reutilizar o código presente | Adicional: configurar servidor MCP, isolamento, autenticação e contrato de ferramentas |
| Acesso jurídico | Precisa de seleção e importação com ACL da demanda | Precisa da mesma seleção e importação com ACL da demanda |

O catálogo Executor foi consultado apenas como metadados, com buscas por Drive e
SharePoint. Foram encontrados `@executor.sh/google-drive`,
`@executor.sh/onedrive` e `@executor.sh/sharepoint`; as descrições incluem arquivos,
permissões e versões. Isso comprova disponibilidade no catálogo, não uma chamada
funcional na conta de um escritório. Composio também precisa de validação com uma
conta de teste e os escopos efetivamente concedidos antes de liberar produção.

## Conectar não significa importar com segurança

Os presets gerais do fork incluem ações de leitura **e escrita**. Não devem ser
habilitados integralmente como um conector de contexto jurídico. A identidade
Composio atual é por organização, e uma conta de serviço compartilhada pode
enxergar mais documentos que o funcionário. OAuth por si só não preserva as
permissões individuais, as barreiras entre clientes ou o sigilo de uma demanda.

O fluxo jurídico atual recebe apenas textos anexados à demanda e suas versões
congeladas. Ele não recebe MCP, memórias ou canais gerais. Essa propriedade deve
continuar: a integração busca documentos em uma operação separada de importação;
depois o fluxo jurídico analisa o snapshot autorizado. Conteúdo externo é tratado
como documento, nunca como instrução para executar ferramentas.

## Piloto proposto

1. Escolher **uma** fonte inicial (Drive ou OneDrive), uma organização de teste e
   uma pasta com documentos sintéticos. Usar configuração OAuth somente de
   leitura, com consentimento e seleção de recursos. Se o provedor não permitir
   restringir por pasta, impor uma allowlist no backend, inclusive para IDs de
   arquivos fornecidos diretamente. Um filtro de interface não é suficiente.
2. Associar conexão e conta ao cliente e, para contexto pessoal, ao funcionário.
   Verificar associação ativa à organização e à demanda e acesso no provedor a
   cada leitura. Contas compartilhadas requerem um escopo explícito de biblioteca
   disponibilizada pelo escritório; não podem representar permissões pessoais.
3. Mostrar os documentos selecionados para importação. O backend valida tamanho,
   formato, pasta e origem, extrai texto pelos validadores existentes e cria uma
   versão na demanda. Não seguir URLs arbitrárias de download fornecidas pelo
   navegador; resolver o recurso pelo conector autorizado.
4. Registrar provedor, conexão, identificador de recurso, versão/data de alteração,
   hash, autor e instante da importação. Uma atualização gera nova versão; uma
   aprovação anterior não passa a valer para a nova versão.
5. Não criar índice geral do escritório. Se houver busca, filtrar organização,
   conexão, autorização do usuário e demanda antes da recuperação. Não misturar
   contextos de clientes ou contas de organizações distintas no cache.
6. Desconexão e revogação bloqueiam novas leituras. A retenção de snapshots já
   importados segue a política explícita do escritório e os participantes da
   demanda; não é revogada automaticamente só porque o original mudou.
7. Validar duas organizações, dois funcionários com pastas privadas distintas,
   revogação, token expirado, mudança de versão, tentativas de escrita, limites e
   custo por importação. Só então considerar sincronização recorrente.

Esse importador com metadados de origem ainda é trabalho posterior; não faz parte
do adaptador Cloudflare. A configuração Cloudflare entregue deixa Composio e
Executor desativados: não encaminha suas chaves nem abre conexões. Para o piloto
Composio, registrar a chave como segredo do Worker e passá-la explicitamente ao
container via `containerEnvironment`, junto da implementação e dos testes do
importador. Não colocar chaves no frontend.

## O que decide o investimento

Medir no piloto: tempo para conectar, sucesso da importação, preservação de ACL,
qualidade do texto/citações, atraso de atualização e custo total por documento.
Incluir chamadas, polling, armazenamento, execução e manutenção; comparar o mesmo
volume em ambos os fornecedores. Revisar retenção de logs/tokens, suboperadores,
região, exclusão, contrato e tratamento de dados com o escritório. As fontes
consultadas não sustentam uma conclusão de conformidade LGPD ou de preço menor.

## Fontes verificadas

- [Composio: autenticação](https://docs.composio.dev/docs/authentication)
- [Composio: produção e isolamento](https://docs.composio.dev/docs/production-readiness)
- [Executor: plataforma e documentação](https://executor.sh/)
- Catálogo Executor consultado em 12/11/2026 pela ferramenta
  `tools.executor.organization.catalog`, sem instalar ferramentas ou conectar contas.
- Código do fork: `packages/engine/src/connectors/composio.ts`,
  `packages/engine/src/connectors/presets.ts` e `packages/engine/src/mail/accounts.ts`.
