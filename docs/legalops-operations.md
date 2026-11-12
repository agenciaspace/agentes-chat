# legalops.chat · operação da primeira versão

## O que esta versão entrega

O novo fluxo está em português brasileiro e inglês. Nos demais idiomas da
plataforma, ele usa o texto em inglês até uma tradução específica.

Uma página própria em `/org/<organização>/legalops`, também na navegação do app.
Funcionários entram pela autenticação e pelos convites existentes da plataforma.
O responsável abre uma demanda e escolhe seus participantes. Nem administradores
da organização recebem acesso implícito a demandas alheias.

Cada demanda recebe minutas, modelos e políticas. PDF com texto selecionável,
DOCX, TXT e Markdown têm extração no servidor, com limite de 4 MB, 150.000
caracteres de texto e, para PDF, 100 páginas. Não há OCR nem suporte a PDF com
senha. Guardamos versões imutáveis do texto e sua impressão SHA-256, não os
arquivos originais. Preserve os originais no repositório documental da organização.
Há até 40 versões de documentos por demanda.

A análise seleciona até 12 documentos, uma versão por documento, e até 20 trechos,
cobrindo cada documento selecionado antes de ordenar os demais trechos por
relevância textual. A tela informa cobertura e permite conferir o texto extraído.
Não é uma revisão integral quando existem trechos fora do contexto.

Triagem, Contratos, Políticas e Coordenação executam em sequência pela fila
durável do PostgreSQL. Escolha agentes próprios com modelos específicos, ou crie
uma equipe pelo formulário da página com chave de IA, modelo e orçamento mensal.
As chamadas usam o Model Gateway e registram o consumo. O modo Automático não é
aceito neste fluxo fechado.

As etapas recebem somente a demanda, as fontes congeladas e os resultados
anteriores. Não recebem memórias gerais, canais, ferramentas MCP ou acesso ao
computador dos agentes. Citações publicadas são comparadas literalmente às fontes
pelo servidor. Isso valida a correspondência textual, não a correção jurídica da
interpretação. A decisão humana continua necessária.

O responsável conclui a análise ou solicita ajustes. Uma nova versão de documento
substitui a revisão pendente, preservando o histórico. A tela permite cancelar,
consultar fontes e baixar o relatório com o snapshot e a decisão em JSON.

## Autonomia e limites

As quatro etapas trabalham sem intervenção entre elas. A conclusão e as ações
externas ficam separadas: esta versão não envia e-mails, não assina contratos e
não protocola peças. Nenhuma decisão jurídica desta página aprova uma ferramenta
externa. Conectores e rotinas gerais continuam disponíveis no produto base,
sujeitos às suas permissões, sem acesso automático às demandas jurídicas.

Cancelar impede a gravação de novos resultados e a próxima etapa. Uma chamada ao
provedor já iniciada pode terminar e gerar cobrança. A fila retoma trabalho após
reinício do servidor. Uma etapa já gravada não é repetida por uma entrega
duplicada. Se um processo morrer depois da chamada e antes de gravar o resultado,
a retomada pode repetir a chamada e o custo, sem efeitos externos neste fluxo.

Participantes e responsável são definidos na abertura. Esta versão não oferece
transferência de responsabilidade nem remoção de participantes pela página. Para
revogar acesso de um funcionário, remova sua participação na organização pelas
configurações existentes. O servidor verifica participação ativa em cada operação.

## Validar localmente sem dados reais

Com Bun na versão de `package.json`:

```sh
bun install --frozen-lockfile
bun run --filter '@agenteschat/web' build
bun apps/server/test/legalops-preview.ts
```

A demonstração usa banco temporário em memória e um provedor falso. O terminal
mostra a URL e a conta sintética. Só escuta em `127.0.0.1:3000`. Todos os dados
desaparecem quando o processo termina. Não a exponha como servidor de produção.

Para desenvolvimento com um banco próprio e chamadas reais, siga
[CONTRIBUTING.md](../CONTRIBUTING.md). Configure chaves de IA pela aplicação, nunca
no navegador ou no código. Testes automatizados não precisam dessas chaves.

## Implantar uma instância independente

Requisitos: servidor Linux com Docker Compose, disco persistente e recursos para
o build do frontend e PostgreSQL com pgvector. O build e o typecheck consomem
memória: execute-os separadamente. A imagem configura limite padrão de 8 GB para
a aplicação pelo Compose existente, ajustável conforme o servidor.

1. Clone este fork no servidor e fixe o commit aprovado. Use banco e volumes
   exclusivos para esta instância. Não reutilize o banco da aplicação anterior.
2. Crie `.env` com permissão `0600`. Defina `POSTGRES_PASSWORD` com saída de
   `openssl rand -hex 24` e `AGENTES_SECRET` com saída de `openssl rand -hex 48`.
   Defina `PUBLIC_URL` como a URL desta instância e `ALLOW_SIGNUP=false`. O primeiro
   usuário configura a instalação e convida a equipe. Veja as opções de SMTP em
   [SELF_HOSTING.md](../SELF_HOSTING.md) para envio dos convites.
3. Para uma avaliação local, use `PUBLIC_URL=http://localhost:3000`. Para um
   hostname independente com HTTPS, use `COMPOSE_PROFILES=https`, `DOMAIN` e
   `PUBLIC_URL=https://<hostname>` conforme SELF_HOSTING.md. Configure o DNS desse
   hostname depois de conferir sua titularidade e destino.
4. Construa a imagem deste fork e inicie a instância:

   ```sh
   docker compose -p legalops -f docker-compose.yml -f deploy/legalops.compose.yml build agentes
   docker compose -p legalops -f docker-compose.yml -f deploy/legalops.compose.yml up -d --wait
   ```

   O override é necessário: o Compose sem ele usa a imagem do upstream, que não
   contém o fluxo legalops.chat. As migrações rodam na inicialização. A migração
   `0252_legalops_matters.sql` é aditiva e cria as tabelas jurídicas.
5. Confira `/api/health`, faça login, configure a chave e o orçamento, e execute
   uma demanda com documentos sintéticos antes de liberar dados reais.

O domínio e a implantação existentes permanecem operacionais até um corte
planejado. Um Worker de frontend isolado não executa este backend Bun. Não mude
as rotas do domínio antigo apenas para publicar uma interface sem seu backend.

## Atualização, backup e retorno

Antes de atualizar, faça dump do PostgreSQL e cópia dos volumes de arquivos,
registre o commit e salve a imagem anterior com `docker tag`. Teste uma restauração
em instância separada. Depois construa o commit novo e execute o mesmo Compose.
Se a verificação falhar, retorne o checkout e a imagem anterior. Não apague as
tabelas novas para reverter esta entrega. Para falha de dados, restaure o backup
em instância separada, valide e só então planeje a troca.

O perfil de backup do Compose cobre o banco, incluindo os textos e análises
jurídicas. Os arquivos do Drive geral exigem também a política de backup do
armazenamento escolhido. Configure retenção, acesso e restauração com o cliente.

## Migração do piloto existente

Esta versão não copia dados automaticamente. Antes do corte, inventarie usuários,
organizações, demandas, documentos, versões e decisões. As contas do piloto e
desta base usam mecanismos distintos de autenticação: não copie hashes ou cookies.
Mapeie identidades verificadas e preserve a autoria de decisões importadas.
Ensaie a migração em banco separado, confira contagens e acesso por participante,
e mantenha a aplicação anterior até a validação. Citações antigas precisam manter
seu snapshot original. Não reconstrua uma aprovação histórica a partir de uma
análise nova.
