# legalops.chat · equipe jurídica

Pacote inicial para escritórios e departamentos com funcionários próprios.
Importa quatro agentes pelo fluxo existente, sem chamadas de IA durante a leitura
do arquivo. As instruções foram escritas para este pacote e são públicas sob a
licença do repositório.

## Experimentar

1. Em uma instalação de desenvolvimento, crie uma organização de teste.
2. Nas configurações, abra a importação de agentes e selecione
   `equipe-juridica.json`. Confira a prévia antes de aplicar.
3. Configure o provedor, o modelo, um responsável humano e um orçamento para cada
   agente. O pacote não transporta essas configurações nem credenciais.
4. Crie um canal privado para uma demanda sintética e convide somente a equipe
   autorizada. Adicione os agentes necessários e confira seu acesso aos arquivos.
5. Acione Triagem, Contratos, Políticas e Coordenação por menção, em sequência.
   Esse roteiro é manual: importar o pacote não implementa uma fila jurídica.
6. Confira fontes, cobertura, divergências e pendências. Registre a decisão humana
   separadamente de qualquer autorização para enviar, assinar ou protocolar.

O importador cria canais compartilhados, por isso o pacote não cria canais.
Também não inclui rotinas, memórias, documentos, conexões ou permissões. A escolha
de modelo segue a configuração disponível na organização.

## Limites desta entrega

As instruções orientam comportamento; não implementam controles de acesso,
validação automática de citações ou bloqueio de ferramentas. Não conecte sistemas
com capacidade de escrita durante o primeiro ensaio. As permissões e aprovações
precisam ser configuradas e verificadas no servidor antes de habilitar ações.

O pacote não migra contas, documentos ou históricos e não altera o site em
produção. A identidade visual existente será integrada em uma etapa posterior.
Veja a [decisão de arquitetura](../../docs/adr/legalops-0001-juridical-workspace.md).
