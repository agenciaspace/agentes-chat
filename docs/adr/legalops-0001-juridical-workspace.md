# legalops-0001. Ambiente jurídico com funcionários e agentes

- Status: Accepted para o fluxo inicial deste fork
- Date: 2026-11-11
- Namespace: `legalops-` identifica decisões do fork, sem ocupar a numeração upstream

Implantação e migração de dados dependem da instância de destino.
Veja [operação](../legalops-operations.md).

## Objetivo

Adaptar este fork para escritórios e departamentos jurídicos que trabalham com
funcionários próprios. Cada agente tem um responsável humano; autonomia é definida
por organização, demanda e ferramenta, com orçamento e histórico de execução.

## Decisão inicial

Reutilizar autenticação, organizações, agentes, orçamento, fila e Model Gateway.
O domínio jurídico usa tabelas próprias com ACL por demanda. A página e a equipe
importável não dependem de outro backend. O fork tem identidade própria e mantém
os avisos de licença e o acesso ao seu código-fonte modificado.

O pacote é original, público e não contém código ou dados de aplicações privadas.
Qualquer futura incorporação de código exige verificar sua autorização e licença.
Preservar LICENSE, NOTICE e a atribuição exigida no Sobre. A identidade visual
legalops.chat não dispensa os avisos da base nem autoriza usar as marcas upstream.

## Modelo funcional

- Organização: escritório ou departamento e seus membros.
- Demanda: unidade própria, com cliente, responsável, participantes, documentos,
  versões e política de acesso. Um canal é a conversa; não substitui esse registro.
- Análise: execução ligada à demanda, com contexto congelado, versões examinadas,
  etapas, fontes, cobertura, divergências e pendências.
- Decisão humana: registro sobre uma versão específica da análise; nova análise
  exige nova revisão. Solicitar ajustes mantém a demanda aberta.
- Autorização de ação: registro separado, ligado à ferramenta, argumentos,
  responsável e versão, com execução única e comprovante. Uma análise aprovada
  nunca concede, por si só, autorização para enviar, assinar ou protocolar.

### Controles implementados nesta versão

`legal_matters` guarda os participantes explícitos. `legal_documents` pertence a
uma demanda, com versões imutáveis do texto. `legal_analyses` pertence à mesma
demanda e guarda revisão, snapshot, resultados e decisão humana. Todas carregam
`org_id`; o servidor verifica organização ativa e participação em cada acesso.
Os testes de API cobrem não participantes, administradores sem participação e
outra organização, tanto para leitura quanto para escrita.

Esses documentos não são artefatos do Drive, não entram no índice geral e não
viram memória organizacional. O executor recebe apenas o snapshot da demanda e
os resultados anteriores. Não consulta canais, memórias, habilidades, agentes
externos ou ferramentas. Assim, a autorização não depende da visibilidade de um
canal nem da visibilidade organizacional dos artefatos.

A decisão é gravada atomicamente somente em análise `review` cuja revisão ainda
corresponda à demanda, pelo seu responsável. Adicionar uma versão substitui a
revisão pendente. O executor não lê essa decisão como uma permissão de ferramenta
e não cria nem consome registros de `approvals`. Não há ação externa neste fluxo.
Qualquer integração futura com execução deve acrescentar demanda, análise e
revisão à autorização e à validação atômica do efeito, com testes de versão
divergente. Essa integração permanece desabilitada até existir tal vínculo.

Todos os novos dados de domínio carregarão org_id. O servidor deve verificar
participação na demanda em cada leitura, busca, anexo, execução e escrita.
Memória, consultas entre agentes e recuperação de documentos devem preservar esse
escopo; restringir quem conversa com um agente não basta para proteger documentos.

## Fases e critérios de aceite

1. Equipe inicial: pacote reconhecido pelo importador real, quatro agentes e
   instruções preservados; nenhum canal, documento ou rotina criado pelo pacote.
2. Domínio jurídico: criar demanda privada, anexar documentos versionados e
   processar etapas retomáveis. Usuário de outra organização e não participante
   devem ser recusados, inclusive em consultas diretas e resultados de busca.
3. Evidências: congelar as fontes por execução; validar identificadores e trechos
   citados no servidor. Citação inválida impede publicação do resultado como
   validado. Exibir cobertura parcial e ausência de fontes.
4. Revisão: permitir concluir ou solicitar ajustes com autor, data e versão.
   Testar que decisões antigas não aprovam novas versões nem ações externas.
5. Autonomia: introduzir uma ferramenta por vez com escopos mínimos, orçamento,
   cancelamento, idempotência e aprovação vinculada à ação exata. Testar recusa,
   expiração e tentativa duplicada antes de habilitar rotinas.
6. Migração: inventariar contas, organizações, documentos, armazenamento e
   históricos; definir mapa de IDs e autenticação. Ensaiar cópia com contagens e
   acesso conferidos, restauração e retorno à versão anterior antes do corte.

## Implantação e continuidade

Validar inicialmente uma instância por organização, com banco e armazenamento
próprios. Isso é uma opção de implantação, não uma prova de isolamento: os testes
de autorização por demanda continuam necessários. Uma oferta compartilhada exige
validar isolamento de ponta a ponta antes de receber dados de clientes.

A aplicação existente continua operando enquanto o novo fluxo é validado em
ambiente independente. Esta proposta não migra autenticação nem troca domínio,
DNS ou produção. A interface jurídica e sua identidade serão integradas depois
do primeiro fluxo funcional, mantendo os componentes acessíveis da base.

## Validação desta fase

Teste do pacote pelo parser usado pela interface, incluindo preservação de
instruções, referências e leitura repetida determinística. Não exige chamadas a
provedores de IA, credenciais, banco de produção ou documentos reais.
