# Revisão de segurança independente do card #140

Escopo: ambientes, segredos fora do código, gitleaks, a feature flag `FLAG_VITRINE_PROXIMO_PRECO` e a estratégia de deploy.
Data: 20/11/2026. Revisão **somente leitura**: nenhum arquivo foi alterado além deste. Nenhum valor de segredo foi impresso ou copiado.

## Veredito: **APROVADO COM RESSALVAS**

- **Nenhum segredo real versionado.** O histórico passou limpo pelo gitleaks, e cada exceção do `.gitleaks.toml` é falso positivo confirmado (seção 1).
- **A flag é segura:** nasce desligada, é validada no boot, não vaza para o cliente e não deixa o usuário escolher preço. Os dois estados têm teste (seção 3).
- **Uma ressalva de severidade alta (A-1):** o marcador público do `.env.example` passa na validação do boot em produção como `JWT_SECRET`. Corrija antes de publicar.
- Não há achado crítico. Os médios e baixos são endurecimentos e inconsistências de documentação.

## Resumo dos achados

| ID  | Severidade | Título                                                                                             |
| --- | ---------- | -------------------------------------------------------------------------------------------------- |
| A-1 | **Alto**   | O marcador `TROQUE_...` do `.env.example` é aceito como `JWT_SECRET` em produção                    |
| M-1 | Médio      | `DATABASE_URL_DIRETA` (dona do esquema) é obrigatória na partida da API em produção                |
| M-2 | Médio      | O seed `demo` só recusa produção pelo rótulo `NODE_ENV`; cria admin com senha pública e a imprime   |
| M-3 | Médio      | `.gitleaks.toml` sem proteção de dono, e a doc do CI está defasada em relação ao `ci.yml`           |
| B-1 | Baixo      | `NODE_ENV` ausente vira `development`: as travas de produção ficam inativas                         |
| B-2 | Baixo      | `SEGREDO_DA_PONTE` só gera aviso quando falta, embora a matriz o marque como obrigatório            |
| B-3 | Baixo      | Exceções do gitleaks: regex sem âncora e caminho amplo na exceção 1; SHAs fixos nas exceções 2       |
| B-4 | Baixo      | Matriz e `.env.example` não citam `DATABASE_URL_ADMINISTRACAO`                                      |
| B-5 | Baixo      | Rollback após o passo _contract_ e ordem site → API não são impostos por nada                       |
| B-6 | Baixo      | Snippet de CI da doc usa `actions/checkout@v4` por tag e baixa o gitleaks sem checksum              |
| B-7 | Baixo      | A senha antiga do admin de demonstração continua no histórico e nas bases já carregadas             |

---

## 1. Varredura de segredos e `.gitleaks.toml`

### O que foi rodado

| Comando                                                                                               | Resultado                                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `gitleaks git --config .gitleaks.toml --log-opts=--all --redact .` (gitleaks 8.30.1)                  | 426 commits varridos, **no leaks found**                            |
| O mesmo com uma config mínima (`[extend] useDefault = true`, fora do repositório)                      | 5 achados, exatamente os 5 da doc (seção 4.1)                       |
| `gitleaks git --pre-commit --config .gitleaks.toml .` (alterações não commitadas dos arquivos rastreados) | sem achados                                                         |

`gitleaks dir` **não** foi rodado na raiz.

### Cada achado, conferido na origem (valores mascarados)

| Achado                                                                              | Conclusão                                                                                                                          |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example:54` (commit 10617783)                                                 | Marcador `JWT_SECRET=TROQUE_POR_UM_SEGREDO_...`. Falso positivo.                                                                   |
| `infra/tests/portao.test.ts:601` e `:795` (770ac27d, 7f9d8363)                      | Teste que grava uma chave Stripe falsa de propósito. Tem 20 caracteres no total; uma `sk_live_` real tem prefixo de 8 e corpo de 24 ou mais. Falso positivo. |
| `apps/web/tests/area-do-cliente-acompanhamento.onp.test.tsx:79` (f60a8ae3)          | `const TOKEN = "<22 caracteres>"` numa fixture de teste de interface. Falso positivo.                                              |
| `apps/api/src/core/log.test.ts:51` (60b7b2c3)                                       | `VALOR_SECRETO = "abacaxi-de-mentira-N"`, para provar que segredo não vai ao log. Falso positivo.                                  |

**Nenhum segredo real versionado. Nenhum card foi pausado por isso.**

### Avaliação das exceções

A doc diz "5 exceções". No arquivo são **4 blocos `[[allowlists]]` que cobrem 5 achados** (o bloco 2 cobre dois commits).

- **`condition = "AND"` em todos.** Isso corrige o padrão OR do gitleaks, que liberaria o arquivo inteiro. Está certo.
- **Bloco 1** (`.gitleaks.toml:30-36`): regra `generic-api-key`, caminho `.env.example` e linha `NOME=TROQUE_POR_UM_SEGREDO_...`. Estreito, com a ressalva de B-3.
- **Bloco 2** (`:45-53`): libera por **commit E caminho**. Um `portao.test.ts` novo, em outro commit, volta a ser varrido. Bom desenho.
- **Blocos 3 e 4** (`:57-74`): caminho exato, linha exata, regra `generic-api-key`. São estreitos.
- A doc afirma que o controle negativo (um segredo em outra linha do mesmo arquivo continua sendo acusado) foi feito com exit 1. Não o repeti; o desenho das exceções é coerente com a afirmação.

### Achados

#### M-3 · Médio · `.gitleaks.toml` sem proteção de dono, e doc do CI defasada

- **Onde:** `.workflow-ia/config.json:262-269` (`arquivosSomenteHumano` não lista `.gitleaks.toml`), ausência de `CODEOWNERS` (nem na raiz nem em `.github/`), `docs/ambientes-e-deploy.md:98` e `:177`.
- **Cenário:** a própria doc (`:199`) recomenda pôr o `.gitleaks.toml` em `arquivosSomenteHumano` e num `CODEOWNERS`, mas nada disso foi feito. Quem editar o arquivo decide o que o portão deixa passar. Um agente ou PR pode adicionar uma exceção larga (`paths = ['''.*''']`) e o portão local `{base}..HEAD` usará a config alterada.
- **Doc defasada:** a seção 4.3 diz "nenhum workflow roda o gitleaks hoje", e a seção 3.2 diz que o único workflow é `desempenho.yml`. Já existe `.github/workflows/ci.yml` (job `gitleaks`, `ci.yml:282-335`), ainda **não rastreado** pelo Git. Esse job faz o certo: lê a config de `origin/${BRANCH_BASE}` com fallback para a do checkout, usa checksum e versão fixa. Limites do job:
  - num `push` para a `main`, o base é a própria `main`, então a config usada é a do commit empurrado;
  - o fallback para a config do checkout vale só enquanto a base não tiver o arquivo.
- **Correção sugerida:**
  - criar `CODEOWNERS` com `.gitleaks.toml`, `.github/workflows/**` e `docs/ambientes-e-deploy.md` sob responsável humano;
  - incluir `.gitleaks.toml` em `arquivosSomenteHumano` (decisão humana, pois o `config.json` é só deles);
  - atualizar as seções 3.2 e 4.3 para apontar o job `gitleaks` do `ci.yml`.

#### B-3 · Baixo · Exceções com folga evitável

- **Onde:** `.gitleaks.toml:34` e `:36`.
- **Cenário:**
  - o caminho `(^|/)\.env\.example$` casa um `.env.example` em **qualquer** pasta (por exemplo `infra/compose/.env.example`);
  - a regex `[A-Z][A-Z0-9_]*=TROQUE_POR_UM_SEGREDO_[A-Z0-9_]+` não tem âncora: uma linha com o marcador **e** um segredo real depois (`X=TROQUE_POR_UM_SEGREDO_A KEY=...`) esconde o achado `generic-api-key` dessa linha. Só vale para a regra `generic-api-key`, então o alcance é pequeno.
  - as exceções 3 e 4 liberam qualquer valor de 22 caracteres alfanuméricos (ou `abacaxi-de-mentira-N`) naquela linha daquele arquivo. Alcance mínimo, e aceitável.
- **Correção sugerida:** ancorar a regex 1 como `^[A-Z][A-Z0-9_]*=TROQUE_POR_UM_SEGREDO_[A-Z0-9_]+$` e restringir o caminho a `^\.env\.example$`. Anote também que os SHAs do bloco 2 deixam de valer se o histórico for reescrito (nesse caso os achados reaparecem, o que falha de forma segura).

#### B-6 · Baixo · Snippet de CI da doc

- **Onde:** `docs/ambientes-e-deploy.md:185-194`.
- **Cenário:** o exemplo usa `actions/checkout@v4` por tag móvel e baixa o tarball do gitleaks sem conferir o checksum. A doc reconhece o segundo ponto na linha 200. O `ci.yml` real já fixa por SHA e confere o checksum.
- **Correção sugerida:** trocar o snippet da doc por uma referência ao job do `ci.yml`.

---

## 2. `.env.example` e validação de ambiente

### `.env.example`: aprovado

- Nenhum valor real. Tudo são marcadores `TROQUE_*`, exemplos `localhost`, campos vazios ou linhas comentadas.
- A senha de exemplo do usuário de teste (`:143`) é um texto explicativo, e a variável está comentada.
- A cobertura da matriz está completa para o que `env.ts` valida: `NODE_ENV`, `PORT`, `DATABASE_URL`, `DATABASE_URL_DIRETA`, `DATABASE_URL_TEST`, `REDIS_URL`, `JWT_SECRET`, `ORIGENS_PERMITIDAS`, `LOG_LEVEL`, `SEGUNDO_PLANO`, `FLAG_VITRINE_PROXIMO_PRECO` e `CHAVE_CIFRA_TOTP`. Também estão as variáveis lidas fora do `env.ts` (observabilidade, mídia, segredos da ponte e da revalidação). Exceção: B-4.
- `.gitignore:37-40` ignora `.env` e `.env.*` e libera só `.env.example` e `.env.compose.example`.
- **Limite da revisão:** `infra/compose/.env.compose.example` foi bloqueado pelo gancho do projeto e **não foi lido**. Peça a um humano para conferir que ele só tem marcadores.

### `env.ts`: falha fechada no essencial, com lacunas

Pontos bons: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` e `ORIGENS_PERMITIDAS` não têm padrão. `CHAVE_CIFRA_TOTP` é obrigatória em produção e só aceita 32 bytes em base64. `DATABASE_URL_TEST` é obrigatória fora de produção e nunca igual à da aplicação. `METRICAS_ABERTAS` é recusada em produção. O desenho de coletar todos os problemas de uma vez é bom.

#### A-1 · **Alto** · Marcador público do `.env.example` aceito como `JWT_SECRET` em produção

- **Onde:** `apps/api/src/core/env.ts:161-166` (só `.min(32)`); marcador em `.env.example:84` e `:149`.
- **Cenário (reproduzido):** com `NODE_ENV=production`, os demais campos válidos e `JWT_SECRET=TROQUE_POR_UM_SEGREDO_GERADO_COM_AO_MENOS_32_CARACTERES` (55 caracteres), `carregarAmbiente` **aceita**. Um `JWT_SECRET` de 32 letras `a` também passa. Quem faz `cp .env.example .env` ou cola o modelo na Railway sem regenerar sobe produção com um segredo que está no repositório público. Qualquer pessoa forjaria um token de acesso (inclusive de administrador). O gitleaks não alerta, porque a exceção 1 libera justamente esse marcador. O mesmo vale para `SEGREDO_DE_REVALIDACAO` e `SEGREDO_DA_PONTE`, cujo marcador tem o mesmo tamanho. <!-- gitleaks:allow -->
- **Mitigação existente:** exige erro do operador. O fluxo documentado manda gerar com `openssl rand`.
- **Correção sugerida:** no `env.ts`, em `production`, recusar segredo que:
  - comece com `TROQUE_`;
  - tenha poucos caracteres distintos (por exemplo menos de 10);
  - esteja numa lista de marcadores conhecidos.

  Aplicar ao `JWT_SECRET`, ao `METRICAS_TOKEN` e aos dois segredos de ponte e revalidação (estes últimos hoje são validados em `cache.ts` e `servicos-da-identidade.ts`, não no `env.ts`). Recusar também `TROQUE_` em `DATABASE_URL*` e em `REDIS_URL`. Adicionar o teste: `NODE_ENV=production` com o marcador deve lançar `ErroDeAmbiente` nomeando `JWT_SECRET`.

#### M-1 · Médio · Credencial dona do esquema exigida na partida da API

- **Onde:** `apps/api/src/core/env.ts:147-149` (`DATABASE_URL_DIRETA` obrigatória, sem condição de ambiente); `docs/ambientes-e-deploy.md:52` ("usada só no pré-deploy") e `:54`.
- **Cenário:** a API não sobe sem `DATABASE_URL_DIRETA`, então o processo que atende tráfego em produção carrega a credencial `sc_migrator`, dona do esquema. A separação de papéis (`sc_app` sem poder de contornar o isolamento) perde força: uma falha de injeção ou de execução remota na API alcança uma credencial que pode alterar o esquema e as políticas RLS. A doc afirma o contrário ("usada só no pré-deploy"). Pelo mesmo motivo, `SENHA_BANCO_MIGRADOR` fica nas variáveis do serviço da API.
- **Correção sugerida:** tornar `DATABASE_URL_DIRETA` e `SENHA_BANCO_MIGRADOR` opcionais para o processo da API em produção e obrigatórios só no comando de migração. Se isso for inviável agora, declarar o risco na doc e registrar a dívida, em vez de afirmar "usada só no pré-deploy".

#### B-1 · Baixo · `NODE_ENV` ausente vira `development`

- **Onde:** `env.ts:130-133` (`.default("development")`); travas que dependem do valor: `env.ts:271-281`, `observabilidade.ts:163` e `servicos-da-identidade.ts:296-297` (comparam a `"production"` literal); `desenvolvimento.routes.ts:69`.
- **Cenário:** um host sem `NODE_ENV` roda como `development`. As travas de produção (`CHAVE_CIFRA_TOTP` obrigatória, recusa de `METRICAS_ABERTAS`, aviso da ponte) ficam inativas, e o login de desenvolvimento com `SIMPLECLICK_DEV_TEST_*` valeria se essas variáveis estivessem definidas.
- **Mitigações que verifiquei:** `apps/api/Dockerfile:126` define `ENV NODE_ENV=production`; sem `NODE_ENV`, a partida **recusa** por falta de `DATABASE_URL_TEST` (reproduzido). O risco real é baixo.
- **Correção sugerida:** exigir `NODE_ENV` explícito quando houver sinal de hospedagem (por exemplo `RAILWAY_ENVIRONMENT` ou `PORT` injetada). Registrar na doc que a Railway precisa receber `NODE_ENV=production`.

#### B-2 · Baixo · `SEGREDO_DA_PONTE` não é obrigatório em produção

- **Onde:** `apps/api/src/modules/auth/servicos-da-identidade.ts:293-303` (só `registrar.aviso`); `docs/ambientes-e-deploy.md:61` (matriz marca ✔).
- **Cenário:** sem o segredo, todo login pelo site cai num balde só de limite de tentativas. Um atacante esgota o balde e **trava o login de todos** (negação de serviço), e a defesa por IP deixa de existir. A partida segue normalmente, apenas com um aviso no log.
- **Correção sugerida:** em `production`, recusar a partida sem `SEGREDO_DA_PONTE` de 32 ou mais caracteres (e de `SEGREDO_DE_REVALIDACAO` quando `URL_DO_SITE` existir), ou então corrigir a matriz para "recomendado".

#### B-4 · Baixo · Matriz incompleta

- **Onde:** `apps/api/src/core/db.ts:575-596` lê `DATABASE_URL_ADMINISTRACAO` (cadeia explícita da administração), que não aparece em `.env.example` nem na matriz. A matriz cita `SENHA_BANCO_*` mas não a URL.
- **Cenário:** quem montar o ambiente de produção só pela matriz não sabe que essa variável existe e que, quando presente, aponta a administração para outro destino. O seed de simulação já a trata como perigosa (`seed/simulacao/aplicacao.ts:77-80`).
- **Correção sugerida:** incluir uma linha na matriz e um comentário no `.env.example`.

---

## 3. Feature flag `FLAG_VITRINE_PROXIMO_PRECO`: aprovada

| Verificação                                  | Resultado                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Padrão seguro                                | `CATALOGO_DE_FLAGS.padrao = false` (`flags.ts:22-29`). `FLAGS_DESLIGADAS` é o padrão do `criarApp` (`app.ts:~753`). Ausente vale desligado em qualquer ambiente.                                                                                                                                                 |
| Valor inválido                               | `z.enum(["ligado","desligado"]).optional()` (`env.ts:192-197`): `ligada` e `sim` recusam a partida. Não vira "desligado" em silêncio.                                                                                                                                                                            |
| Ligação ao `main`                            | `flags: flagsDoAmbiente(ambiente)` (`main.ts:~273`), a partir do ambiente já validado. Mudar exige reiniciar.                                                                                                                                                                                                    |
| Vaza para o cliente?                         | Não. O cliente só vê o campo `proximoPreco`; nome e estado da flag não são enviados. A chave **nem sai** na resposta quando desligada (`produto.usecase.ts:~420`, `...(proximoPreco === undefined ? {} : {...})`). O OpenAPI e o `esquemaDoProduto` o declaram opcional.                                          |
| O usuário escolhe o preço?                   | Não. Nenhum parâmetro de rota ou de consulta entra no cálculo. `agora` vem de `opcoes.agora?.() ?? new Date()` (`vitrine.routes.ts:~446`), só do servidor. O valor sai da **mesma lista de preços** que gera `precoCentavos`, dentro da mesma transação, com papel `PUBLIC` e `lojaId` identificado (RLS preservada). Nada é cobrado por ele: o fechamento continua usando `precoQueVale`. |
| Só queda, sem informação comercial sensível  | `proximaQuedaDePreco` (`packages/core/src/proximo-preco.ts`) usa a regra que cobra de verdade. Aumento agendado devolve `null`, e o `null` não revela o aumento. Atacado fica fora. O horizonte é de 7 dias.                                                                                                      |
| Isolamento entre lojas                       | Existe teste de produto pedido pelo apelido de **outra** loja: responde 404 igual ao caso desligado (`flag-proximo-preco.int.test.ts:224-`).                                                                                                                                                                     |
| Teste nos dois estados                       | Sim. `flags.test.ts` (3 testes), `env.test.ts` (2 testes `[CA-12]`) e `flag-proximo-preco.int.test.ts` (desligada e ligada, conferidas contra o OpenAPI e o esquema do contrato).                                                                                                                                 |

**Execução:** `npx vitest run apps/api/src/core/env.test.ts apps/api/src/core/flags.test.ts packages/core/src/proximo-preco` → **3 arquivos, 37 testes, todos passaram**. O teste de integração `flag-proximo-preco.int.test.ts` **não foi executado** (precisa de Postgres descartável); li o código e ele cobre desligada, ligada, aumento, horizonte e loja errada.

#### B-5 · Baixo · Ordem de ativação e rollback dependem de disciplina humana

- **Onde:** `docs/ambientes-e-deploy.md:316-320` (seção 6.4) e `:322-330` (seção 7).
- **Cenário:** o site valida a resposta com esquema **estrito** (`z.strictObject` no contrato). Ligar a flag antes de publicar o site novo faz a página do produto falhar para o público. Nada impede isso: a API não sabe qual versão do site está no ar. Do mesmo modo, a linha "republicar o commit anterior … funciona porque a migração foi expand" deixa de valer depois de um passo _contract_ (o código antigo não convive com o esquema novo).
- **Correção sugerida:** acrescentar à seção 7 que, depois de um _contract_, o rollback é restauração de backup. Se o site ficar mais resiliente, o esquema do site pode aceitar o campo como opcional em modo não estrito.

---

## 4. `docs/ambientes-e-deploy.md`

| Tema                                      | Avaliação                                                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ambientes e regras                        | Correto e coerente com o código: homologação roda como `production`, e as travas de `CHAVE_CIFRA_TOTP` e de `METRICAS_ABERTAS` são reais. Ressalva M-2 para o seed.                                                                          |
| Matriz de variáveis                       | Boa, com a ressalva de B-4. Está certa em manter `NEXT_PUBLIC_*` fora de segredo (`:63`, `:94`) e Preview sem segredo de produção (`:92`).                                                                                                  |
| GitHub Environments e Secrets (3.2)       | Correto: `homologacao` e `producao` restritos à `main`, revisor obrigatório, sem bypass de administrador, `RAILWAY_TOKEN` de escopo de projeto, `gh secret set` sem `--body`, `permissions` mínimas, sem `pull_request_target`. Sem ressalvas. |
| Rotação (3.3)                             | Completa e honesta quanto ao efeito de cada troca (`CHAVE_CIFRA_TOTP` invalida os autenticadores).                                                                                                                                         |
| Passo do gitleaks no CI (4.3)             | O desenho (config lida do branch base, histórico inteiro, versão fixa) é o certo. Ressalvas: M-3 (doc defasada, sem proteção de dono) e B-6.                                                                                                |
| Expand/contract (6.3)                     | Correto: exemplo certo e errado, migração aplicada nunca editada, destrutiva só no _contract_ e com backup. Ressalva B-5.                                                                                                                  |
| Rollback (7)                              | Tabela clara. A linha "o site, com a flag ligada: primeiro desligar a flag" é a mais importante e está presente.                                                                                                                            |
| Afirmação "o seed `demo` se recusa a rodar" (`:29`) | Verdadeira apenas para `NODE_ENV=production` (M-2).                                                                                                                                                                                  |

---

## 5. Senhas de contas de teste (L-13)

### O que o #140 propôs e fez (conferido no diff)

- A senha do admin de demonstração foi trocada: de 14 para 22 caracteres, neutra (`packages/database/seed/demo/contas.ts:32-37`). A senha antiga **não aparece mais em nenhum arquivo da árvore de trabalho**; a nova só em `contas.ts`.
- `LEIA-ME.md` não lista senhas e aponta para `contas.ts` (`:37`).
- `scripts/campos-explicados/conferir.mjs` importa as contas de `contas.ts` e **recusa** hosts que não sejam `localhost` ou `127.0.0.1` (`:30-36`). Essa recusa é boa: o script digita a senha na página.
- A doc é honesta sobre o limite: tirar a senha da versão atual é limpeza, não remediação.
- O inventário de arquivos com senhas de demonstração, na seção 4.4, está em linha com o que existe; não os reli um a um.

### Achados

#### M-2 · Médio · Seed `demo`: trava só por rótulo, admin com senha pública, senha impressa

- **Onde:** `packages/database/seed/index.ts:208-216` (`exigirAmbienteQueNaoEProducao` só olha `NODE_ENV`), chamada em `seed/demo/index.ts:1290`; `packages/database/package.json:17` (`node --env-file-if-exists=../../.env`); `seed/demo/index.ts:~1383` (`relatar(... conta.senha)`).
- **Cenário:**
  - o `demo` lê o `.env` da raiz e conecta com a credencial `sc_admin`. A única recusa é `NODE_ENV=production`. O próprio comentário do seed original (`seed/index.ts:204-207`) admite que o rótulo pode faltar, e lá existe uma segunda defesa (`exigirBancoSemDadoProprio`) que o `demo` não repete. Os seeds de simulação e de volume têm guardas bem mais fortes (host local, banco diferente de dev e teste, recusa de `DATABASE_URL_ADMINISTRACAO`: `seed/volume/guarda.ts:63`, `seed/simulacao/banco.ts`);
  - se alguém apontar o `.env` para um banco remoto sem definir `NODE_ENV`, o `demo` pode criar o admin `maria.card6@exemplo.test` com senha pública e vínculos de dono. Atenuantes: o `demo` exige que as lojas do seed original existam (outra recusa) e a vinculação a uma loja inexistente derruba a transação (`ROLLBACK`). O risco é pequeno, mas o estrago, se ocorrer, é um administrador conhecido;
  - o `demo` **imprime** e-mail e senha das contas no terminal a cada carga (`index.ts:~1383`), o que vai parar em logs de terminal ou de CI.
- **Correção sugerida:**
  - reaproveitar no `demo` a guarda do volume (host local obrigatório, banco ≠ produção);
  - parar de imprimir a senha (basta o e-mail e a referência a `contas.ts`);
  - registrar na doc que o `demo` cria um **ADMIN**.

#### B-7 · Baixo · A senha antiga continua viva fora da versão atual

- **Onde:** histórico do Git (1 commit toca a senha antiga); bases carregadas antes da mudança.
- **Cenário:** a doc já diz que vale em toda base carregada com o `demo` antes da troca (a base `simpleclick_dev` do preview, a do outro computador, cópias). O admin dessas bases entra com a senha antiga até a próxima carga. A senha tinha formato de senha pessoal; o usuário confirmou que não é reaproveitada.
- **Correção sugerida:** rodar o `demo` nessas bases (o que a doc já recomenda) e considerar a senha antiga como pública a partir de agora. Não é necessário reescrever histórico.

---

## 6. O que foi verificado e **não** gerou achado

- Segredo real em qualquer commit de qualquer ref: nenhum (426 commits com diff, 5 falsos positivos conhecidos).
- `.env` e `.env.*` ignorados pelo Git; só os dois `*.example` versionados.
- `METRICAS_TOKEN` com 32 ou mais caracteres, e `METRICAS_ABERTAS` recusada em produção (`observabilidade.ts:135-141`).
- A rota de login de desenvolvimento ignora `NODE_ENV=production` (`desenvolvimento.routes.ts:69`).
- O corpo da resposta da vitrine, com a flag desligada, é idêntico ao anterior (o teste compara os dois corpos).
- Nenhuma variável `NEXT_PUBLIC_*` do `.env.example` é segredo.

## 7. Transparência e limites da revisão

- Não li o `.env` real nem imprimi valores de segredo. **Uma varredura minha** (`grep -rlF` por conteúdo, para ver onde a senha antiga e a nova do admin ainda aparecem) percorreu a raiz do projeto e, portanto, também passou pelo `.env`. Ela imprimiu apenas nomes de arquivo, e nenhum nome casado foi o `.env`. Registro aqui por honestidade, já que o pedido era evitar essa leitura.
- Não rodei o teste de integração da flag (exige banco descartável), nem a suíte completa.
- Não li `infra/compose/.env.compose.example` (bloqueado pelo gancho).
- Não repeti o controle negativo da doc (casos a, b, c da seção 4.2).
- A árvore tem mudanças não commitadas de vários cards. Os achados se limitam ao que é do #140.
