# legalops.chat no Cloudflare

Esta implantação executa o backend Bun e o frontend do fork em **Cloudflare
Containers**, atrás de um Worker com Cloudflare Access. O PostgreSQL com pgvector
fica em serviço persistente externo. Não é possível executar este backend apenas
como Worker JavaScript. A configuração usa a CLI `cf`, com versões fixadas no lock.

O nome é `legalops-platform-staging`, sem domínio personalizado, e não altera o
Worker `legalops-chat`, o banco ou as rotas da aplicação anterior. É uma instância
separada para homologação. Não copie credenciais do piloto.

## Requisitos

- Node.js >= 22.18, npm e Docker disponíveis no ambiente de build; Bun 1.4.4 está
  na imagem. O build da interface exige mais memória que o Worker.
- Conta Cloudflare com Containers habilitado e plano compatível. Confira os
  [requisitos e preços atuais](https://developers.cloudflare.com/containers/pricing/)
  antes da publicação. A configuração permite um container `standard-1`.
- Credencial de deploy para Workers, Durable Objects e Containers, incluindo
  envio de imagem ao registro da conta. A conexão disponível em 12/11/2026
  recebeu **403** ao listar Workers e Containers. Workers informou falta de um
  escopo aceito, entre eles `workers-scripts.read`/`workers-scripts.edit`.
  Isso não é uma falha do código. Use uma credencial com as permissões de deploy
  suportadas pela conta; renovar a mesma conexão sem ampliá-las não resolve.
- PostgreSQL exclusivo com pgvector, TLS e backup/restauração testados. Use uma
  conexão compatível com o cliente Postgres do app; não use PGlite ou disco do
  container para dados persistentes. As migrações existentes rodam no início.
- Uma aplicação Cloudflare Access para o hostname de homologação, com política
  que permita inicialmente só o responsável pela instalação. Depois do primeiro
  administrador criado, libere os funcionários autorizados. Access é uma camada
  adicional: o app mantém seu próprio login, convites e permissões por demanda.

## Configurar e validar

```sh
cd deploy/cloudflare
npm ci
npm test
npm run typecheck
npm run build
npm run test:worker
npx cf deploy --dry-run
```

O build inclui a imagem Docker deste diretório e o bundle do Worker. A imagem usa
o código da raiz e dispensa dependências dos aplicativos mobile e desktop.
Não publica recursos. `test:worker` usa o bundle gerado e o runtime local workerd:
testa autenticação assinada, bloqueio de host e indisponibilidade do container,
com chaves sintéticas e sem acesso a serviços externos. Não substitui o teste
remoto com o banco e os serviços da conta.
Se o ambiente usa um proxy corporativo com CA própria, configure a cadeia de
confiança no builder Docker. Nunca desative a validação TLS para instalar pacotes.

Copie `.dev.vars.example` para um arquivo fora do repositório com permissão `0600`.
Preencha as cinco variáveis e gere `AGENTES_SECRET` uma única vez com
`openssl rand -hex 48`. Preserve esse segredo nas atualizações: ele protege dados
e credenciais da aplicação. Use `sslmode=verify-full` no banco quando suportado;
`require` também é aceito pelo validador, com as garantias do cliente/provedor.

`PUBLIC_URL` deve ser exatamente a origem HTTPS desta instância. O Worker recusa
outros hosts. `ACCESS_TEAM_DOMAIN` tem formato
`https://<equipe>.cloudflareaccess.com`, sem barra final, e `ACCESS_AUD` é o
Application Audience da aplicação Access. A assinatura RS256, emissor, audiência
e validade do token são verificados no Worker antes de acessar o container.
Sem configuração ou token válido, inclusive em acesso direto por `workers.dev`,
o resultado é 403. Preview URLs estão desativadas.

## Publicar

Autentique a CLI na conta pretendida por `cf auth login`, ou injete
`CLOUDFLARE_API_TOKEN` no ambiente de execução seguro. Selecione a conta por
`CLOUDFLARE_ACCOUNT_ID`. Não grave tokens no código, terminal compartilhado ou chat.
Com Access e o PostgreSQL configurados, publique com o arquivo de segredos:

```sh
npx cf deploy --secrets-file /caminho/seguro/legalops-staging.env
```

Não há um workflow de deploy automático: a configuração não presume que o token
do plugin esteja disponível no GitHub Actions. A publicação e a validação remota
dependem das permissões da conta e da configuração externa acima.

Depois da publicação, valide com documentos sintéticos:

1. Sem Access, inclusive pela URL `workers.dev`, o app não pode abrir.
2. Com Access, crie o primeiro administrador e confirme `/api/health`.
3. Crie organização, convide um funcionário e configure provedor de IA e orçamento
   pelo app. Nesta configuração, signup público permanece desativado.
4. Execute uma demanda com os quatro agentes, confira fontes e decisão humana.
5. Uma segunda conta fora da demanda deve receber acesso negado aos seus dados.
6. Reinicie o container e confirme documentos, contas e retomada da fila.
7. Ensaie restauração do banco em outra instância antes de usar dados reais.

## Persistência, disponibilidade e custo

O disco de Containers é efêmero. O Worker não passa `FILES_DIR`: nessa modalidade
o app guarda os arquivos gerais no PostgreSQL. Os documentos jurídicos já usam
versões de texto imutáveis no banco; originais continuam no repositório documental
do escritório. Planeje tamanho, backup e retenção do PostgreSQL. R2 pode ser uma
evolução para arquivos grandes, com configuração S3 própria e teste de restauração.

O Durable Object preserva método, corpo, cookies e origem por streaming, incluindo
WebSocket, e usa HTTP pela conexão privada com o listener Bun. O acesso externo é
HTTPS. Substitui cabeçalhos de proxy e não encaminha a asserção Access ao app.
Não repete escritas após falhas. Respostas de API usam `private,
no-store`; erros não revelam credenciais ou corpos de provedores.

Uma vez iniciada a instância por uma requisição autorizada, um alarme por minuto
mantém o container ativo para a fila Postgres e as rotinas do app continuarem sem
navegador aberto. Falhas de saúde usam espera crescente até 16 minutos. Isso
significa **custo de container continuamente ativo**, além de banco, tráfego e IA.
Não prometa o custo de um Worker que só cobra por requisição. Monitore memória e
latência; `standard-1` é uma configuração inicial, não um dimensionamento validado
com carga real. Um único container não oferece alta disponibilidade da aplicação.

Faça backup antes de atualizar. Para retorno, publique o commit/imagem anterior
mantendo banco e `AGENTES_SECRET`. Não remova tabelas novas para reverter o app.
Para parar os custos, desative a aplicação de Containers e o alarme do Durable
Object; fechar o navegador ou bloquear Access não interrompe o heartbeat.

## Fontes

- [CLI cf e deploy](https://developers.cloudflare.com/cf/projects/)
- [Configuração programática](https://developers.cloudflare.com/cf/projects/cloudflare-config/)
- [API nativa de Containers](https://developers.cloudflare.com/containers/api/durable-object-container/)
- [Validação de JWT do Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Avaliação dos conectores de contexto](../../docs/adr/legalops-0002-context-connectors.md)
