# Ambientes, segredos, feature flag e estratégia de deploy

Card #140 (Projeto A 5, módulo M3 do curso). Este documento diz:

- quais ambientes existem e o que muda entre eles;
- onde cada segredo mora e como trocá-lo;
- como o gitleaks protege o repositório;
- como a feature flag `FLAG_VITRINE_PROXIMO_PRECO` funciona;
- como a publicação acontece e como voltar atrás.

> **Nada disto está publicado.** Não existe conta nem ambiente criado no GitHub, na Railway ou na Vercel. Este documento descreve o mecanismo e o passo a passo. Criar os ambientes é tarefa humana, na fase de publicação.

---

## 1. Ambientes

| Ambiente            | Para quê                                          | `NODE_ENV`    | Banco                                                       | Dados                                                                                         |
| ------------------- | ------------------------------------------------- | ------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **desenvolvimento** | sua máquina (inclui o preview em :3000/:3001)     | `development` | `simpleclick_dev` local                                     | seed + `demo` (contas de demonstração)                                                        |
| **teste**           | suíte automática (`pnpm test:int`, `api-int`)     | `test`        | banco descartável por arquivo (`postgres-test`, porta 5533) | criados pelos próprios testes                                                                 |
| **homologação**     | ensaio de cada versão da `main` antes de produção | `production`  | Postgres próprio na Railway                                 | fictícios, criados à mão ou por roteiro de ensaio; **nunca** o seed `demo` nem o de simulação |
| **produção**        | clientes reais                                    | `production`  | Postgres próprio na Railway                                 | reais                                                                                         |

Quatro regras que não se negociam:

- **Homologação roda como `production`.** Assim as travas de produção valem lá também:
  - `CHAVE_CIFRA_TOTP` é obrigatória;
  - `METRICAS_ABERTAS` é recusada;
  - o seed `demo` se recusa a rodar (pelo rótulo, por marcador de provedor de hospedagem e por banco que não seja local: ele cria uma conta ADMIN com senha pública);
  - segredo de exemplo (`TROQUE_...`) ou fraco (menos de 10 caracteres distintos) recusa a partida;
  - o login exige o segundo fator.

  Uma homologação em `development` exporia o admin de demonstração, que entra sem segundo fator e tem senha pública no repositório.

- **Cada ambiente tem segredos próprios.** Nenhum valor é reaproveitado entre ambientes (`openssl rand` para cada um).
- **Seeds de demonstração e de simulação, e o k6, só rodam em base descartável ou local.** Os scripts usam senhas fixas e públicas (seção 4.4). Nunca aponte esses scripts para homologação ou produção.
- **A configuração vem do ambiente, nunca do código.** A API valida as variáveis na partida (`apps/api/src/core/env.ts`, `carregarAmbiente`). Se uma faltar ou estiver inválida, a API não sobe e diz o nome de cada variável com problema, sem repetir o valor. Em `production` ela também recusa o marcador `TROQUE_...` do `.env.example` e segredo de baixa variedade em `JWT_SECRET`, `SEGREDO_DE_REVALIDACAO`, `SEGREDO_DA_PONTE` e `METRICAS_TOKEN`, e o marcador nas cadeias de conexão (`DATABASE_URL*`, `REDIS_URL`, `CLOUDINARY_URL`, `SENHA_BANCO_ADMINISTRACAO`). O modelo comentado de todas as variáveis está em `.env.example`.

## 2. Matriz de variáveis por ambiente

Legenda:

- **Obrig.**: obrigatória (✔), opcional (–) ou "não usar" (✘).
- **Segredo**: se o valor é segredo.
- **Onde mora**: _arquivo_ é o `.env` local, fora do Git; _Railway_ é a variável do serviço da API no ambiente certo; _Vercel_ é a variável do projeto do site, no escopo **Production**, separado de Preview.

| Variável                                                                                          | Dev           | Teste                             | Homolog.               | Produção               | Segredo                      | Onde mora (homolog./prod.)                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------- | --------------------------------- | ---------------------- | ---------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                        | `development` | `test`                            | `production`           | `production`           | não                          | Railway                                                                                              |
| `PORT`                                                                                            | – (3001)      | –                                 | injetada               | injetada               | não                          | Railway (o provedor injeta)                                                                          |
| `LOG_LEVEL`                                                                                       | –             | –                                 | –                      | –                      | não                          | Railway                                                                                              |
| `DATABASE_URL` (agrupador, `sc_app`)                                                              | ✔             | ✔                                 | ✔                      | ✔                      | **sim**                      | Railway                                                                                              |
| `DATABASE_URL_DIRETA` (migração, `sc_migrator`)                                                   | ✔             | ✔                                 | ✔                      | ✔ (só pré-deploy)      | ✔ (só pré-deploy)            | só no comando de migração (pré-deploy). A API **não** a exige em `production` (M-1, seção 6.2)       |
| `DATABASE_URL_TEST`                                                                               | ✔             | ✔                                 | ✘                      | ✘                      | sim (local)                  | arquivo                                                                                              |
| `SENHA_BANCO_MIGRADOR` / `_APLICACAO` / `_ADMINISTRACAO`                                          | ✔             | ✔                                 | ✔                      | ✔                      | **sim**                      | Railway. `_MIGRADOR` é da migração, não do processo da API                                           |
| `REDIS_URL`                                                                                       | ✔             | ✔                                 | ✔                      | ✔                      | sim (se tiver senha)         | Railway                                                                                              |
| `REDIS_URL_TEST`                                                                                  | ✔             | ✔                                 | ✘                      | ✘                      | não                          | arquivo                                                                                              |
| `JWT_SECRET` (32+)                                                                                | ✔             | ✔                                 | ✔                      | ✔                      | **sim**                      | Railway                                                                                              |
| `ORIGENS_PERMITIDAS`                                                                              | ✔             | ✔                                 | ✔                      | ✔                      | não                          | Railway                                                                                              |
| `CHAVE_CIFRA_TOTP`                                                                                | –             | –                                 | ✔                      | ✔                      | **sim**                      | Railway                                                                                              |
| `SEGREDO_DE_REVALIDACAO` (mesmo valor na API e no site)                                           | –             | –                                 | ✔                      | ✔                      | **sim**                      | Railway **e** Vercel Production                                                                      |
| `SEGREDO_DA_PONTE` (mesmo valor na API e no site)                                                 | –             | –                                 | ✔                      | ✔                      | **sim**                      | Railway **e** Vercel Production                                                                      |
| `URL_DO_SITE`                                                                                     | ✔             | –                                 | ✔                      | ✔                      | não                          | Railway e Vercel                                                                                     |
| `NEXT_PUBLIC_API_URL`                                                                             | –             | –                                 | ✔                      | ✔                      | **nunca** (vai ao navegador) | Vercel                                                                                               |
| `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN`                                                               | –             | –                                 | ✔                      | ✔                      | não                          | Vercel                                                                                               |
| `CLOUDINARY_URL` (forma canônica)                                                                 | –             | –                                 | ✔                      | ✔                      | **sim**                      | Railway                                                                                              |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` (legado)                                     | –             | –                                 | ✘                      | ✘                      | sim                          | não usar; prefira a URL                                                                              |
| `MIDIA_URL_PUBLICA`, `MIDIA_LOCAL_DIR`, `ARMAZENAMENTO_PRIVADO_DIR`                               | –             | –                                 | ✘                      | ✘                      | não                          | só local                                                                                             |
| `MIDIA_VIDEO_*`, `MIDIA_VIDEOS_POR_PRODUTO`, `STORIES_*`                                          | –             | –                                 | –                      | –                      | não                          | Railway                                                                                              |
| `VITRINE_CATALOGO_*`                                                                              | –             | (fixadas pelo `vitest.config.ts`) | –                      | –                      | não                          | Railway (só se precisar)                                                                             |
| `SEGUNDO_PLANO`                                                                                   | –             | –                                 | – (liga sozinho)       | – (liga sozinho)       | não                          | Railway                                                                                              |
| `METRICAS_TOKEN` (32+)                                                                            | –             | –                                 | ✔ se houver Prometheus | ✔ se houver Prometheus | **sim**                      | Railway                                                                                              |
| `METRICAS_ABERTAS`                                                                                | –             | –                                 | ✘ (recusada)           | ✘ (recusada)           | não                          | só local                                                                                             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS`                                                        | –             | –                                 | –                      | –                      | `_HEADERS` **sim**           | Railway                                                                                              |
| `FLAG_VITRINE_PROXIMO_PRECO`                                                                      | –             | –                                 | – (liga primeiro aqui) | – (liga depois)        | não                          | Railway                                                                                              |
| `EMAIL_DE_SUPORTE`                                                                                | –             | –                                 | –                      | –                      | não                          | Vercel                                                                                               |
| `SIMPLECLICK_DEV_TEST_EMAIL` / `_PHRASE`, `NEXT_PUBLIC_DEV_STORE_SLUG`, `CAIXA_DE_EMAIL_DE_PROVA` | –             | –                                 | ✘                      | ✘                      | sim (local)                  | só local                                                                                             |
| `PG_BIN`, `GUARDAS_URL`                                                                           | –             | –                                 | ✘                      | ✘                      | não                          | só local                                                                                             |
| `DATABASE_URL_ARRANQUE`, `PRIMEIRO_ADMIN_EMAIL` / `_NOME` / `_SENHA`                              | ✘             | ✘                                 | uma vez                | uma vez                | **sim**                      | **nunca** em provedor nem GitHub: arquivo temporário fora do repositório, apagado depois do arranque |

Ficam fora do `.env.example` de propósito:

- `API_PORT`: nome aposentado. A API recusa a partida quando ele contradiz `PORT`.
- `PATH`.
- `SC_*`: diagnóstico interno de testes.

## 3. Onde moram os segredos

### 3.1 Princípio

O segredo de **execução** mora onde o processo roda: a API na Railway (por ambiente) e o site na Vercel (escopo Production). O GitHub não guarda segredo de execução: ele só constrói e testa. Isso evita uma cópia a mais de cada segredo e uma superfície de vazamento a mais.

**Vercel Preview** roda em todo branch e PR. Por isso **nenhum segredo de produção vai para o escopo Preview**. Se o Preview precisar de segredo, ele recebe valores próprios, de um ambiente descartável.

**`NEXT_PUBLIC_*` vai parar no JavaScript do navegador.** Nunca coloque segredo numa variável com esse prefixo.

### 3.2 GitHub Environments e Secrets (para quando houver job de deploy)

Hoje os workflows são `.github/workflows/ci.yml` (card #141: qualidade, integração, cobertura, SCA, gitleaks, OpenAPI e build) e `desempenho.yml` (k6). Nenhum dos dois publica nada. Os Environments do GitHub só protegem jobs do Actions. Enquanto não houver job de deploy, eles não protegem nada, e quem publica é a integração da Railway e da Vercel com o repositório.

Quando um humano criar o job de deploy ou de promoção:

1. Em _Settings → Environments_, crie dois Environments:
   - **`homologacao`**: _Deployment branches_ = só `main`.
   - **`producao`**: _Deployment branches_ = só `main`, _Required reviewers_ = quem pode publicar, e _Prevent self-review_ ligado. Desligue o bypass de administradores. Revisor obrigatório em repositório privado exige plano pago do GitHub.
2. Em cada Environment, só a credencial de publicação: `RAILWAY_TOKEN`. Use um **token de projeto/ambiente** da Railway, nunca o token da conta. Quando o provedor aceitar OIDC, prefira OIDC a token fixo.
3. Pela linha de comando, sem o valor aparecer no histórico do shell (o `gh` lê do prompt):

   ```bash
   gh secret set RAILWAY_TOKEN --env homologacao   # cola o valor quando pedir
   gh secret set RAILWAY_TOKEN --env producao
   ```

   Nunca use `--body` nem `echo valor | gh ...`.

4. No workflow:
   - `permissions:` mínimas por job (`contents: read`);
   - nenhum segredo em `pull_request` vindo de fork;
   - nunca `pull_request_target` com checkout do código do PR.

### 3.3 Rotação: o que acontece quando cada segredo muda

| Segredo                                      | Efeito da troca                                                                      | Como trocar sem susto                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                 | todas as sessões caem e todos entram de novo                                         | trocar fora do pico e avisar                                                                                                                              |
| `CHAVE_CIFRA_TOTP`                           | **invalida todos os aplicativos autenticadores** (o segredo deles é cifrado com ela) | não girar por rotina; só em incidente, e cada pessoa ativa o aplicativo de novo                                                                           |
| `SENHA_BANCO_*`                              | a API perde a conexão                                                                | `ALTER ROLE ... PASSWORD` e atualizar `DATABASE_URL` / `DATABASE_URL_DIRETA` na **mesma janela**                                                          |
| `SEGREDO_DE_REVALIDACAO`, `SEGREDO_DA_PONTE` | precisam do **mesmo valor** no site e na API                                         | trocar nos dois e publicar os dois juntos. Durante a troca, a revalidação de cache e o limite por IP do login ficam degradados até os dois estarem iguais |
| `CLOUDINARY_URL`                             | envio de mídia falha até a troca                                                     | gerar a chave nova no Cloudinary, trocar e só então revogar a antiga                                                                                      |
| `METRICAS_TOKEN`                             | o Prometheus para de coletar                                                         | trocar na API e no Prometheus                                                                                                                             |
| `RAILWAY_TOKEN` (GitHub)                     | o job de deploy falha                                                                | gerar o novo, `gh secret set`, revogar o antigo                                                                                                           |

Em caso de vazamento, a ordem é: **revogar, trocar, verificar o uso**. Apagar o commit não adianta, porque o histórico já foi copiado.

## 4. gitleaks

### 4.1 Configuração

O arquivo `.gitleaks.toml`, na raiz, usa **todas** as regras padrão (`[extend] useDefault = true`). Ele só abre exceção para os 5 falsos positivos que a varredura do histórico encontrou. Cada exceção é estreita:

- `condition = "AND"`: libera só quando o caminho **e** a linha casam;
- `regexTarget = "line"`, com a regra-alvo explícita;
- o teste antigo do portão, que só existe no histórico, é liberado pelos **commits**, e não pelo caminho;
- a exceção do marcador (1) vale só para o `.env.example` **da raiz** e só para uma linha que é **inteira** o marcador (`(?m)^…$`, B-3 da revisão #149). Conferido em modo `git` num repositório descartável: segredo colado antes ou depois do marcador na mesma linha, segredo em linha vizinha e marcador num `.env.example` de subpasta voltam a ser acusados. Sem `(?m)` o `^` nunca casa, porque o alvo "line" chega com contexto.

| Achado (impressão digital)                                                              | Por que é falso positivo                                                    |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `1061778:.env.example:generic-api-key:54`                                               | marcador `TROQUE_POR_UM_SEGREDO_...` do modelo                              |
| `770ac27:infra/tests/portao.test.ts:stripe-access-token:601`                            | chave Stripe **falsa** que o teste do portão de segredos grava de propósito |
| `7f9d836:infra/tests/portao.test.ts:stripe-access-token:795`                            | idem                                                                        |
| `f60a8ae:apps/web/tests/area-do-cliente-acompanhamento.onp.test.tsx:generic-api-key:79` | token de fixture de um teste                                                |
| `60b7b2c:apps/api/src/core/log.test.ts:generic-api-key:51`                              | valor de mentira do teste que prova que segredo não vai ao log              |

### 4.2 Varredura do histórico inteiro (feita em 20/11/2026)

```bash
git fetch --all --prune                        # inclui as refs do outro computador
gitleaks git --no-banner --redact --config .gitleaks.toml --log-opts=--all
```

Resultado: 426 commits em 16 refs, gitleaks 8.30.1.

- Sem o `.gitleaks.toml`: 5 achados, todos os falsos positivos acima.
- Com a configuração: nenhum achado e **exit 0**.
- **Nenhum segredo real versionado.** O histórico não foi reescrito.

**Controle negativo:** prova de que as exceções não abrem demais. A pasta temporária fica **fora** do repositório e espelha os caminhos liberados:

| Caso | Conteúdo                                                              | Esperado   | Obtido |
| ---- | --------------------------------------------------------------------- | ---------- | ------ |
| a    | só os fixtures liberados, nos mesmos caminhos                         | sem achado | exit 0 |
| b    | um segredo novo em **outra linha** de `apps/api/src/core/log.test.ts` | achado     | exit 1 |
| c    | uma chave AWS aleatória num caminho comum                             | achado     | exit 1 |

**Nunca rode `gitleaks dir` na raiz do projeto.** Ele leria o `.env` real.

### 4.3 No CI: o job `gitleaks` do `ci.yml` (card #141)

O passo existe: é o job `gitleaks` de `.github/workflows/ci.yml` (card #141). Este card não altera workflows. O job:

- faz checkout com `fetch-depth: 0` e a action fixada por SHA;
- baixa o gitleaks **8.30.1** (versão fixa) e confere o **checksum** do tarball contra o arquivo de checksums da release;
- lê a configuração do **branch base** (`git show origin/<base>:.gitleaks.toml`), para que um PR não afrouxe a regra que o julga. Se o base ainda não tem o arquivo, cai para o do checkout;
- varre `--log-opts=--all` com `--redact` e guarda o relatório SARIF como artefato.

Limites que continuam valendo:

- **enquanto o `.gitleaks.toml` não estiver commitado na `main`**, o job usa a cópia do próprio PR, e ela pode ter sido alterada por ele;
- num `push` direto na `main`, o "base" é a própria `main`: vale a config do commit empurrado. A proteção do branch `main` (só por PR) é o que fecha essa porta;
- localmente, o portão `segredos` do Workflow IA varre só `{base}..HEAD` e lê o `.gitleaks.toml` da raiz do branch em análise.

**Nunca rode `gitleaks dir` na raiz:** leria o `.env` real.

#### Proposta para decisão do Arthur: quem pode mudar a regra

Quem edita o `.gitleaks.toml` decide o que o portão de segredos deixa passar. Nada impede hoje que um agente ou um PR acrescente uma exceção larga. **Proposta (não criada; decisão humana):**

1. Criar `.github/CODEOWNERS` com revisão obrigatória de um humano para os arquivos que mudam as regras:

   ```text
   # Regras de segredos, CI e publicação: só com revisão humana.
   /.gitleaks.toml               @<dono-humano>
   /.github/                     @<dono-humano>
   /docs/ambientes-e-deploy.md   @<dono-humano>
   /.workflow-ia/config.json     @<dono-humano>
   ```

   No GitHub, ligar em _Settings → Branches → main_: _Require a pull request_, _Require review from Code Owners_ e _Do not allow bypassing_.

2. Incluir `.gitleaks.toml` (e um eventual `.gitleaksignore`) em `arquivosSomenteHumano` do `.workflow-ia/config.json`. Esse arquivo é só humano, por isso o agente não o editou.

Alternativa mais leve: só o passo 2, que barra os agentes, mas não um PR humano.

### 4.4 Ponto cego: senhas em português

As regras padrão **não reconhecem** `senha: "..."`. A palavra-chave delas é _password_, _secret_ ou _token_. Por isso a senha do admin de demonstração passou pela varredura (seção 8). Senhas de **demonstração**, públicas por desenho, que continuam no código:

- `packages/database/seed/demo/contas.ts` (a fonte única das contas de demonstração);
- `scripts/desempenho-painel/medir.mjs`, `scripts/gerar-prints-da-lp/gerar.mjs`, `scripts/telas-da-landing/gerar.mjs`, `scripts/prints-do-recorte/prints-do-modal.mjs`;
- `tests/performance/k6/comum.js` e o seed de simulação (`packages/database/seed/simulacao/`, contas `*.simulacao.test`);
- `docs/estruturacao/04-simulacao.md`.

Todas valem só em bases locais ou descartáveis (seção 1). **Senha real nunca vai para o código**, nem com outro nome de campo.

## 5. Feature flag

### 5.1 O que existe

O catálogo das flags fica em `apps/api/src/core/flags.ts`:

| Flag                    | Variável                     | Padrão        | Efeito quando ligada                                                                                                                                       |
| ----------------------- | ---------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitrine.proximo_preco` | `FLAG_VITRINE_PROXIMO_PRECO` | **desligado** | `GET /v1/vitrine/:apelido/produto/:produtoId` ganha `proximoPreco: { precoCentavos, aPartirDe } \| null`, a próxima **queda** de preço dos próximos 7 dias |

Como a flag se comporta:

- **Valores:** `ligado` ou `desligado`. Ausente vale **desligado** em todo ambiente. Qualquer outro valor (`ligada`, `sim`) **recusa a partida** da API, para que um erro de digitação não desligue a flag em silêncio.
- **Desligada:** a chave `proximoPreco` **não sai** e o corpo é exatamente o de hoje. O cálculo nem é feito.
- **Ligada:** só quedas aparecem, a partir de preço vigente para 1 unidade, no varejo.
  - Aumento agendado **nunca** aparece.
  - Se a primeira mudança nos próximos 7 dias for um aumento, a resposta é `null`. Pular para uma queda posterior esconderia o intervalo mais caro.
  - O cálculo usa a mesma regra que cobra (`precoQueVale`), então um aumento cadastrado sem encerrar o preço antigo não gera nada.
  - Atacado não entra.
- **Escolha conservadora do usuário (20/11/2026):** anunciar só quedas, porque o aumento agendado é informação comercial da loja. **Dá para mudar depois**, para "qualquer mudança" ou para opt-in por loja usando o portão `app.store_feature_enabled`. É uma decisão de produto: mexe em `packages/core/src/proximo-preco.ts` e no teste dele.
- **Site:** ainda não exibe o campo. Quando exibir, é a mesma flag que decide.

Os testes cobrem os dois estados:

- `packages/core/src/proximo-preco.test.ts`: a regra pura;
- `apps/api/src/core/flags.test.ts` e `apps/api/src/core/env.test.ts`: a leitura e a recusa de valor inválido;
- `apps/api/tests/flag-proximo-preco.int.test.ts`: a rota real, desligada e ligada, validada contra o OpenAPI e o `esquemaDoProduto`.

### 5.2 Por que flag de ambiente, e como trocar por Unleash ou GrowthBook

A flag é de **ambiente**, lida na partida: o mesmo commit vai a homologação e a produção, e cada um decide se a mudança já aparece.

**Não confunda** com o portão **por loja** (`core/funcionalidades.ts`), que fica no banco e responde 403.

A interface `ProvedorDeFlags { ligada(nome): boolean }` é síncrona, como o `isEnabled` dos SDKs do Unleash e do GrowthBook depois de inicializados. Para adotar um deles:

1. Instale o SDK com **versão fixa** (sem `^`) e lockfile.
2. Escreva um provedor que inicializa o SDK na partida e responde `ligada(nome)` pelo cache local dele.
3. Entregue esse provedor ao `criarApp` em `opcoes.flags` (no `main.ts`).

Nenhuma rota muda: a vitrine recebe só um booleano.

Ganho: trocar a flag sem reiniciar e liberar por porcentagem ou por loja. Custo: mais um serviço no ar. Para uma flag só, o ambiente basta.

### 5.3 Ligar e desligar

- **Ligar:** na Railway, mudar `FLAG_VITRINE_PROXIMO_PRECO=ligado` no ambiente. A Railway republica, e com isso a API reinicia.
- **Desligar:** a mesma variável com `desligado` (ou removida). É o **rollback da funcionalidade**: não exige deploy de código nem mexe no banco.
- **Atraso no site:** o site guarda a página do produto em cache por até 60 s (`SEGUNDOS_DE_CACHE`). A mudança chega lá dentro desse tempo.

## 6. Estratégia de deploy

### 6.1 Onde e por quê

> **Atualização (card #158, 21/11/2026):** o site passou a rodar **também na Railway** (`apps/web/Dockerfile`, com dois ambientes: `staging` e `production`), em vez da Vercel. O passo a passo, as tabelas de variáveis por serviço e ambiente, o DNS e o rollback estão em [`docs/deploy-railway.md`](deploy-railway.md). Onde este documento diz "Vercel", leia "serviço `web` da Railway"; o resto (segredos, flag, expand/contract) continua valendo.

A decisão já estava registrada desde agosto em `arquivo/docs/publicacao.md`:

- **site na Vercel**, construído do repositório;
- **API, Postgres e Redis na Railway**, construindo `apps/api/Dockerfile`.

Ficamos com ela porque:

- a Railway roda o Dockerfile que já existe, oferece Postgres e Redis gerenciados, injeta `PORT` (o nome que a API já lê) e tem **comando de pré-deploy**, que roda a migração antes de a versão nova receber tráfego;
- a Vercel é o caminho natural do Next.js e separa Production de Preview;
- o curso aceita Render ou Railway. O Render serviria igual, mas trocar seria reabrir uma decisão sem ganho.

### 6.2 O fluxo

```
PR → portão local (typecheck, lint, testes, gitleaks) → merge na main
  │
  ├─► HOMOLOGAÇÃO (deploy contínuo da main)
  │     1. imagem nova (a versão antiga continua atendendo)
  │     2. pré-deploy: migração com sc_migrator e DATABASE_URL_DIRETA
  │        (o processo da API não precisa dela: ver nota abaixo)
  │        (falhou → publicação interrompida, a antiga segue)
  │     3. troca de versão
  │     4. GET /v1/health/ready precisa responder 200
  │     5. ensaio (ex.: virada de preço do 06-operacao.md §5)
  │
  └─► PRODUÇÃO (promoção MANUAL do mesmo commit, depois do ensaio)
        mesmos passos 1–4; flags continuam desligadas até a decisão de ligar
```

A promoção é manual: alguém com acesso à Railway e à Vercel publica o commit que passou em homologação. Quando houver job de deploy, ele roda no Environment `producao` com revisor obrigatório (seção 3.2), e a publicação automática de produção na Railway fica desligada.

**Onde fica a credencial de migração (M-1 da revisão #149).** A API não exige mais `DATABASE_URL_DIRETA` na partida em `production`: o processo que atende tráfego nunca abre conexão com ela. Só o comando de migração e a cópia de segurança a usam. Porém o _pre-deploy command_ da Railway roda com as **variáveis do próprio serviço**, então, enquanto a migração for o pré-deploy do serviço da API, a credencial `sc_migrator` continua nas variáveis desse serviço. Para separar de fato, use um **serviço de migração à parte** na Railway: mesma imagem, comando `pnpm --filter @simpleclick/database migrar`, executado antes da troca. Ele guarda `DATABASE_URL_DIRETA` e `SENHA_BANCO_MIGRADOR`, e o serviço da API fica sem elas. Até isso existir, o risco fica aceito e declarado aqui.

### 6.3 Migrações expand/contract

A migração roda **antes** da troca de versão. Durante a publicação, a versão **antiga** do código convive com o esquema **novo**. Por isso toda migração precisa ser compatível com o código anterior:

1. **Expand** (num deploy): só acrescenta o que é novo, como coluna anulável, tabela nova ou índice. O código antigo ignora tudo isso.
2. **Migrar o código** (no mesmo deploy ou no seguinte): o código novo passa a ler e gravar o que é novo.
3. **Contract** (num deploy posterior, quando nenhuma versão no ar usa o antigo): remove a coluna ou a regra antiga.

Exemplo:

- **Errado:** renomear `amount_cents` para `valor_centavos` num passo só. O código antigo, ainda atendendo durante a troca, quebraria.
- **Certo:** criar a coluna nova, gravar nas duas, ler da nova e, num deploy posterior, apagar a antiga.

Também valem estas regras:

- migração já aplicada **nunca é editada**;
- correção vira migração nova;
- migração destrutiva só no passo _contract_, e com backup.

### 6.4 Ordem de ativação de uma mudança atrás de flag (o caso do `proximoPreco`)

1. Publicar **site e API** com o contrato novo, em que `proximoPreco` é opcional, com a flag **desligada**. O site valida a resposta com esquema estrito. Ligar a flag com um site antigo, que não conhece o campo, faria a página do produto falhar.
2. Ligar em **homologação** e ensaiar: um produto com promoção agendada mostra a queda, e um com aumento agendado não mostra nada.
3. Ligar em **produção** e observar: 5xx da rota do produto e `409 preco_divergente`, como no 06-operacao.md §5.

## 7. Rollback

| O que deu errado                           | Como voltar                                                                                                                                                                               | Mexe no banco? |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| A funcionalidade atrás da flag             | `FLAG_VITRINE_PROXIMO_PRECO=desligado` (a API reinicia); o site normaliza em até 60 s                                                                                                     | não            |
| O código de uma versão                     | republicar o **commit anterior** na Railway (_Redeploy_) e na Vercel (_Promote_ do deploy anterior). Funciona porque a migração foi _expand_ e o código antigo convive com o esquema novo | não            |
| O site, com a flag ligada                  | **primeiro desligar a flag**, depois voltar o site. Um site antigo não aceita o campo novo                                                                                                | não            |
| A migração falhou no pré-deploy            | nada a fazer na hora: a versão nova nunca entrou e a antiga segue atendendo. Corrigir com **migração nova**                                                                               | não            |
| Depois de um passo _contract_              | republicar o commit anterior **não** basta: o código antigo não convive com o esquema que perdeu a coluna. O caminho é migração nova para frente ou restaurar o backup                    | sim, com plano |
| Uma migração já aplicada se mostrou errada | **migração nova** que corrige, para frente. Nunca reverter destrutivamente nem editar a migração aplicada. Em último caso, restaurar o backup (PITR do Postgres gerenciado)               | sim, com plano |

## 8. L-13: senhas das contas de teste (avaliação e o que foi feito)

**Avaliação:**

- A senha do **admin** de demonstração tinha formato de senha pessoal e estava em três arquivos versionados: `contas.ts`, `LEIA-ME.md` e `scripts/campos-explicados/conferir.mjs`.
- O gitleaks não a pegou (ponto cego da seção 4.4).
- O usuário confirmou que ela é **só de teste** e não é reaproveitada em lugar nenhum.

**O que foi feito:**

- a senha do admin virou uma senha neutra de demonstração, em `contas.ts`;
- o `LEIA-ME.md` do `demo` não lista mais nenhuma senha e aponta para `contas.ts`, a fonte única;
- o `conferir.mjs` importa as contas de `contas.ts` e **recusa** site que não seja `localhost`/`127.0.0.1`, porque ele digita as senhas na página.

**O que isso NÃO resolve:**

- Tirar a senha da versão atual é **limpeza, não remediação**. A senha antiga continua no histórico do Git, que não foi reescrito por decisão do usuário.
- Ela continua valendo em toda base já carregada com o `demo`, até a próxima carga: a base de dev do preview, a do outro computador e qualquer cópia.
- Rode o `demo` de novo nessas bases quando for conveniente. O agente não roda seed na base do preview.

## 9. Revisão de segurança independente (#149) — o que mudou

Relatório: `docs/revisoes/140-seguranca.md`, veredito "aprovado com ressalvas".

| Achado                                                                        | O que foi feito                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-1 (alto)**: o marcador `TROQUE_...` passava como `JWT_SECRET` em produção | `env.ts` recusa em `production` o marcador e segredo com menos de 10 caracteres distintos (`JWT_SECRET`, `SEGREDO_DE_REVALIDACAO`, `SEGREDO_DA_PONTE`, `METRICAS_TOKEN`), e o marcador nas cadeias de conexão. Fora de produção o modelo copiado segue subindo. Testes `[A-1]` em `env.test.ts`, escritos antes da correção. A exceção 1 do gitleaks foi ancorada (seção 4.1) |
| **M-1**: `DATABASE_URL_DIRETA` exigida na partida da API                      | opcional na partida em `production`; obrigatória fora dela. Testes `[M-1]`. Nota sobre o pré-deploy da Railway na seção 6.2                                                                                                                                                                                                                                                   |
| **M-2**: seed `demo` travado só pelo rótulo e imprimindo senhas               | nova guarda `exigirDestinoLocalDaDemonstracao`: rótulo, marcadores de hospedagem (`RAILWAY_*`, `VERCEL*`, `RENDER`, `FLY_APP_NAME`) e banco só local, conferido antes de conectar. O terminal não mostra mais senha, só o e-mail e onde a senha está (`contas.ts`). Contas e senhas não mudaram. Testes em `seed/demo/guarda.test.ts`                                         |
| **M-3**: doc do CI defasada e `.gitleaks.toml` sem dono                       | seção 4.3 reescrita para o job real do `ci.yml`; proposta de `CODEOWNERS` e `arquivosSomenteHumano` para decisão do Arthur                                                                                                                                                                                                                                                    |

Baixos, **só registrados** (sem mudança de código):

- **B-1:** `NODE_ENV` ausente vira `development`. O `apps/api/Dockerfile` já define `production`, e sem `NODE_ENV` a partida recusa pela falta de `DATABASE_URL_TEST`. Na Railway, declare `NODE_ENV=production` mesmo assim.
- **B-2:** `SEGREDO_DA_PONTE` ausente em produção só gera aviso. Sem ele, todo login pelo site divide um balde só de tentativas (negação de serviço possível). Trate como obrigatório na publicação.
- **B-3:** SHAs fixos na exceção 2. Se o histórico for reescrito, os achados reaparecem, o que é falha segura. A âncora da exceção 1 foi aplicada (A-1).
- **B-4:** `DATABASE_URL_ADMINISTRACAO` (cadeia explícita da administração, lida em `core/db.ts`) não está na matriz. Na falta dela, a API deriva a cadeia de `DATABASE_URL` + `SENHA_BANCO_ADMINISTRACAO`. Se usada, é segredo e mora na Railway.
- **B-5:** a ordem site → API → flag e o rollback depois de _contract_ dependem de disciplina. Linha nova na seção 7.
- **B-6:** o snippet antigo da doc (checkout por tag, sem checksum) foi substituído pela referência ao job real.
- **B-7:** a senha antiga do admin continua no histórico e nas bases carregadas antes da troca. Considere-a pública e rode o `demo` de novo nessas bases.
