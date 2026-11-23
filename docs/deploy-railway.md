# Deploy no Railway — staging e produção (roteiro para o Arthur)

Card #158 (Entrega 4 do projeto final, Projeto A). Este roteiro é para **você** executar: criar a conta e o projeto no Railway, colar as variáveis, apontar o DNS do domínio e conferir. Nada disto foi criado por agente: ninguém logou no Railway nem no registrador.

> **Leia primeiro:** `docs/ambientes-e-deploy.md` explica o _porquê_ (ambientes, segredos, flag, expand/contract). Este arquivo é o _como_. Onde os dois divergem, vale este: ele **substitui a decisão "site na Vercel"** (seção 6.1 do outro). O site agora também roda no Railway, com o `apps/web/Dockerfile`, para ter os dois ambientes num lugar só.

Convenções do texto:

- `DOMINIO` = o domínio que você comprou (ex.: `simpleclick.com.br`). Troque em todo lugar.
- Os nomes de menu do Railway são os que a interface usa hoje; se um deles tiver mudado de lugar, procure pelo nome em negrito.
- Bloco com `<...>` é valor que você preenche.

---

## 0. O que vai existir no fim

Um projeto Railway com **dois ambientes**, cada um com quatro serviços:

| Serviço    | O que é                                     | Origem                                        | Porta |
| ---------- | ------------------------------------------- | --------------------------------------------- | ----- |
| `Postgres` | banco (template do Railway)                 | imagem do Railway                             | 5432  |
| `Redis`    | cache e filas (template do Railway)         | imagem do Railway                             | 6379  |
| `api`      | API (Express)                               | GitHub → `apps/api/Dockerfile`, `apps/api/railway.json` | 3001  |
| `web`      | site (Next.js)                              | GitHub → `apps/web/Dockerfile`, `apps/web/railway.json` | 3000  |

| Ambiente     | Branch do GitHub          | Site                      | API                           | `NODE_ENV`   |
| ------------ | ------------------------- | ------------------------- | ----------------------------- | ------------ |
| `staging`    | `entrega/projeto-final`   | `https://staging.DOMINIO` | `https://api.staging.DOMINIO` | `production` |
| `production` | `main`                    | `https://DOMINIO`         | `https://api.DOMINIO`         | `production` |

Pontos que não são óbvios:

- **Staging roda como `production`** (`NODE_ENV=production`). É de propósito: as travas de produção (segredo fraco recusado, `CHAVE_CIFRA_TOTP` obrigatória, segundo fator no login) valem lá também. Ver `docs/ambientes-e-deploy.md` seção 1.
- **Site e API ficam em subdomínios do mesmo domínio**, e o cookie de sessão é compartilhado por `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN`. Por isso o login **só funciona nos domínios próprios**, não nos endereços `*.up.railway.app` (o navegador recusa cookie de domínio compartilhado nesses endereços).
- **Ordem das coisas:** o `railway.json` só existe na branch `entrega/projeto-final` até ela ser mesclada na `main`. Por isso você monta o **staging primeiro**, valida, mescla (o merge é seu) e só então monta a **produção**.

---

## 1. Antes de começar

Você precisa de:

- [ ] conta no [Railway](https://railway.com) com forma de pagamento (o plano gratuito não sustenta quatro serviços sempre ligados; confira o preço atual na página de planos);
- [ ] conta no GitHub com acesso de administrador ao repositório do SimpleClick (o Railway pede para instalar o app dele no repositório);
- [ ] o domínio e acesso ao painel DNS dele (seção 7);
- [ ] um terminal com `openssl` (já vem no macOS e no Linux) e um **gerenciador de senhas** para guardar os segredos que você vai gerar;
- [ ] para a seção 8 (primeira conta de administração): Node 24, `pnpm` e um aplicativo autenticador no celular (Google Authenticator, Authy, 1Password...).

Confira que a branch está no GitHub:

```bash
git fetch origin && git log --oneline -1 origin/entrega/projeto-final
```

---

## 2. Gerar os segredos (um conjunto por ambiente)

**Nunca reaproveite um segredo entre staging e produção.** Rode o bloco abaixo **uma vez para staging e outra para produção**, e guarde cada saída no gerenciador de senhas (itens separados: `simpleclick staging` e `simpleclick producao`). O terminal mostra os valores; nada é gravado em arquivo.

```bash
echo "SENHA_BANCO_MIGRADOR=$(openssl rand -hex 24)"
echo "SENHA_BANCO_APLICACAO=$(openssl rand -hex 24)"
echo "SENHA_BANCO_ADMINISTRACAO=$(openssl rand -hex 24)"
echo "JWT_SECRET=$(openssl rand -base64 48)"
echo "SEGREDO_DE_REVALIDACAO=$(openssl rand -base64 48)"
echo "SEGREDO_DA_PONTE=$(openssl rand -base64 48)"
echo "CHAVE_CIFRA_TOTP=$(openssl rand -base64 32)"
```

O que cada um protege e o que acontece se trocar depois: `docs/ambientes-e-deploy.md` seção 3.3. Resumo do que **nunca** pode mudar depois do uso real: `CHAVE_CIFRA_TOTP` (trocar invalida todos os aplicativos autenticadores) e `SENHA_BANCO_*` (a API perde a conexão se o papel no banco não for alterado junto).

A API recusa partir em produção com segredo de exemplo (`TROQUE_...`) ou fraco; o site faz o mesmo (seção 5.3). Se você colar o valor errado, o deploy falha com o **nome** da variável no log.

---

## 3. Criar o projeto e os ambientes

1. Entre em <https://railway.com> → **New Project** → **Empty Project**. Dê o nome `simpleclick`.
2. O Railway cria o ambiente `production` sozinho. **Deixe-o vazio por enquanto.**
3. Canto superior esquerdo, o seletor com o nome do ambiente (`production ▾`) → **+ New Environment** → **Empty Environment** → nome `staging`. Os próximos passos (4 a 9) são **dentro de `staging`**: confira no seletor que `staging` está selecionado antes de criar cada serviço.

---

## 4. Criar os serviços do staging

Na tela do projeto, ambiente `staging`.

### 4.1 Postgres

1. **+ New** (ou `Ctrl/Cmd+K`) → **Database** → **Add PostgreSQL**. O nome do serviço fica `Postgres` — **não renomeie**: as variáveis abaixo se referem a esse nome.
2. Nada mais a configurar. O banco nasce com um usuário dono (`postgres`) e o Railway guarda as credenciais nas variáveis do serviço (`PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`, `PGDATABASE`, `DATABASE_URL`, `DATABASE_PUBLIC_URL`).
3. Aba **Settings** do `Postgres`: confira que **Public Networking** (TCP proxy) está ligado. Você vai usá-lo uma vez, na seção 8, e pode desligar depois.

### 4.2 Redis

1. **+ New** → **Database** → **Add Redis**. Nome `Redis`, sem renomear.

### 4.3 API

1. **+ New** → **GitHub Repo** → escolha o repositório do SimpleClick (na primeira vez o Railway pede para instalar o app no GitHub: autorize só este repositório).
2. Renomeie o serviço para `api` (clique no nome no topo do painel).
3. Aba **Settings**:
   - **Source → Branch:** `entrega/projeto-final`.
   - **Source → Root Directory:** **deixe vazio.** O Dockerfile constrói a partir da raiz do repositório (é um monorepo).
   - **Config-as-code → Railway Config File:** `/apps/api/railway.json` (com a barra inicial). É esse arquivo que diz ao Railway: construir com `apps/api/Dockerfile`, rodar as migrações antes de cada troca de versão (_pre-deploy_), o health check em `/v1/health/ready` e a política de reinício.
   - **Source → Wait for CI** (se aparecer): ligue. O Railway só publica depois que os checks do GitHub Actions passam.
4. **Ainda não faça o deploy.** O Railway tenta publicar assim que o serviço nasce e vai falhar por falta de variáveis. Isso é esperado; siga para a seção 5.

### 4.4 Site

1. **+ New** → **GitHub Repo** → o mesmo repositório. Nome `web`.
2. **Settings**: **Branch** `entrega/projeto-final`, **Root Directory** vazio, **Railway Config File** `/apps/web/railway.json`, **Wait for CI** ligado.

---

## 5. Variáveis (por serviço e por ambiente)

Entre no serviço → aba **Variables** → **Raw Editor** → cole o bloco → **Update Variables**. Você pode salvar tudo de uma vez e só então publicar (botão **Deploy** no topo, ou o banner "Apply N changes").

Regras de leitura dos blocos:

- `${{Postgres.X}}` e `${{Redis.X}}` são **referências do Railway** a variáveis de outro serviço. Cole como está: o Railway resolve na hora de publicar. Isso mantém a senha do banco fora do código **e** fora das suas anotações.
- `${{shared.X}}` é uma **variável compartilhada** do projeto (item 5.1).
- Valor `<...>` é seu: gere na seção 2 ou escolha.

### 5.1 Variáveis compartilhadas (as que API e site precisam ter iguais)

`SEGREDO_DE_REVALIDACAO` e `SEGREDO_DA_PONTE` precisam do **mesmo valor** na API e no site. Para não digitar duas vezes:

1. Na tela do projeto: **Settings** (do projeto, engrenagem no topo) → **Shared Variables** → confira que o ambiente selecionado é `staging`.
2. Crie `SEGREDO_DE_REVALIDACAO` e `SEGREDO_DA_PONTE` com os valores gerados na seção 2.
3. Clique em **Share** em cada uma e marque `api` e `web`. (Se preferir, nos blocos abaixo troque `${{shared.X}}` pelo valor literal, o mesmo nos dois serviços.)

### 5.2 Serviço `api`

| Variável                       | Valor — **staging**                                                                                                    | Valor — **produção**                                                                                                  | Segredo? | Difere entre ambientes? |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------- |
| `NODE_ENV`                     | `production`                                                                                                           | `production`                                                                                                          | não      | não                     |
| `PORT`                         | `3001`                                                                                                                 | `3001`                                                                                                                | não      | não                     |
| `LOG_LEVEL`                    | `info`                                                                                                                 | `info`                                                                                                                | não      | não                     |
| `DATABASE_URL`                 | `postgresql://sc_app:${{SENHA_BANCO_APLICACAO}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}` | igual                                                                                                                 | **sim**  | só pela referência      |
| `DATABASE_URL_DIRETA`          | `${{Postgres.DATABASE_URL}}`                                                                                           | igual                                                                                                                 | **sim**  | só pela referência      |
| `SENHA_BANCO_MIGRADOR`         | `<gerado>`                                                                                                             | `<outro gerado>`                                                                                                      | **sim**  | **sim**                 |
| `SENHA_BANCO_APLICACAO`        | `<gerado>`                                                                                                             | `<outro gerado>`                                                                                                      | **sim**  | **sim**                 |
| `SENHA_BANCO_ADMINISTRACAO`    | `<gerado>`                                                                                                             | `<outro gerado>`                                                                                                      | **sim**  | **sim**                 |
| `REDIS_URL`                    | `${{Redis.REDIS_URL}}`                                                                                                 | igual                                                                                                                 | **sim**  | só pela referência      |
| `JWT_SECRET`                   | `<gerado>`                                                                                                             | `<outro gerado>`                                                                                                      | **sim**  | **sim**                 |
| `CHAVE_CIFRA_TOTP`             | `<gerado, base64 de 32 bytes>`                                                                                         | `<outro gerado>`                                                                                                      | **sim**  | **sim**                 |
| `SEGREDO_DE_REVALIDACAO`       | `${{shared.SEGREDO_DE_REVALIDACAO}}`                                                                                   | igual                                                                                                                 | **sim**  | **sim** (valor)         |
| `SEGREDO_DA_PONTE`             | `${{shared.SEGREDO_DA_PONTE}}`                                                                                         | igual                                                                                                                 | **sim**  | **sim** (valor)         |
| `ORIGENS_PERMITIDAS`           | `https://staging.DOMINIO,https://api.staging.DOMINIO`                                                                  | `https://DOMINIO,https://api.DOMINIO`                                                                                 | não      | **sim**                 |
| `URL_DO_SITE`                  | `https://staging.DOMINIO`                                                                                              | `https://DOMINIO`                                                                                                     | não      | **sim**                 |
| `FLAG_VITRINE_PROXIMO_PRECO`   | `ligado`                                                                                                               | `desligado` (ligue só depois de validar no staging)                                                                   | não      | **sim**                 |
| `CLOUDINARY_URL` _(opcional)_  | `cloudinary://<chave>:<segredo>@<nuvem>`                                                                               | outra conta ou outra pasta                                                                                            | **sim**  | **sim**                 |
| `METRICAS_TOKEN` _(opcional)_  | `<openssl rand -hex 32>`                                                                                               | `<outro>`                                                                                                             | **sim**  | **sim**                 |

Bloco pronto para o Raw Editor da `api` em **staging** (troque `DOMINIO` e os `<...>`):

```env
NODE_ENV=production
PORT=3001
LOG_LEVEL=info
DATABASE_URL=postgresql://sc_app:${{SENHA_BANCO_APLICACAO}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
DATABASE_URL_DIRETA=${{Postgres.DATABASE_URL}}
SENHA_BANCO_MIGRADOR=<gerado>
SENHA_BANCO_APLICACAO=<gerado>
SENHA_BANCO_ADMINISTRACAO=<gerado>
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=<gerado>
CHAVE_CIFRA_TOTP=<gerado>
SEGREDO_DE_REVALIDACAO=${{shared.SEGREDO_DE_REVALIDACAO}}
SEGREDO_DA_PONTE=${{shared.SEGREDO_DA_PONTE}}
ORIGENS_PERMITIDAS=https://staging.DOMINIO,https://api.staging.DOMINIO
URL_DO_SITE=https://staging.DOMINIO
FLAG_VITRINE_PROXIMO_PRECO=ligado
```

Notas sobre a API:

- **`DATABASE_URL_DIRETA` = usuário dono do banco (`postgres`).** É ela que o _pre-deploy_ usa. Na primeira publicação ela **precisa** ser o dono: a migração `0001` cria os papéis `sc_migrator`, `sc_app` e `sc_admin` com as três senhas `SENHA_BANCO_*`, e isso exige poder de dono. A API em si usa `sc_app` (`DATABASE_URL`) e nunca abre conexão com a direta.
  - _Endurecimento opcional, depois que o staging estiver de pé:_ trocar `DATABASE_URL_DIRETA` por `postgresql://sc_migrator:${{SENHA_BANCO_MIGRADOR}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}`, para a API não carregar a credencial dona. **Não foi testado no Railway**: experimente no staging e confira o log do pre-deploy antes de repetir na produção. O risco de deixar como está está registrado em `docs/ambientes-e-deploy.md` seção 6.2 (M-1).
- **`PORT=3001`** fixa a porta. Ao criar o domínio (seção 7), escolha a porta **3001**.
- **Mídia (fotos e vídeos de loja):** sem `CLOUDINARY_URL`, o envio de arquivo responde "indisponível" em produção; o painel ainda aceita o endereço `https://` de uma imagem já hospedada. Crie uma conta gratuita no Cloudinary se quiser testar envio de foto.
- **E-mail:** a API não tem provedor de e-mail configurado. Os e-mails (convite, recuperação de senha) só vão para o log. Em staging, crie as contas pelo cadastro e pela seção 8; a recuperação de senha por e-mail **não funciona** ainda.
- **Redis em rede privada:** se o log da API mostrar erro de conexão com `redis.railway.internal` (`ENOTFOUND`, `EAI_AGAIN` ou `ECONNREFUSED`), mude `REDIS_URL` para `${{Redis.REDIS_URL}}?family=0` (a fila usa `ioredis`, que por padrão só resolve IPv4). Não foi preciso testar isso aqui; está como plano B.

### 5.3 Serviço `web`

| Variável                            | Valor — **staging**                  | Valor — **produção**         | Segredo?                      | Difere? |
| ----------------------------------- | ------------------------------------ | ---------------------------- | ----------------------------- | ------- |
| `NODE_ENV`                          | `production`                         | `production`                 | não                           | não     |
| `PORT`                              | `3000`                               | `3000`                       | não                           | não     |
| `NEXT_PUBLIC_API_URL`               | `https://api.staging.DOMINIO`        | `https://api.DOMINIO`        | **nunca** (vai ao navegador)  | **sim** |
| `URL_DO_SITE`                       | `https://staging.DOMINIO`            | `https://DOMINIO`            | não                           | **sim** |
| `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN` | `staging.DOMINIO`                    | `DOMINIO`                    | não                           | **sim** |
| `SEGREDO_DE_REVALIDACAO`            | `${{shared.SEGREDO_DE_REVALIDACAO}}` | igual                        | **sim**                       | **sim** (valor) |
| `SEGREDO_DA_PONTE`                  | `${{shared.SEGREDO_DA_PONTE}}`       | igual                        | **sim**                       | **sim** (valor) |
| `EMAIL_DE_SUPORTE` _(opcional)_     | `<e-mail de suporte>`                | `<e-mail de suporte>`        | não                           | não     |

Bloco para o Raw Editor do `web` em **staging**:

```env
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=https://api.staging.DOMINIO
URL_DO_SITE=https://staging.DOMINIO
NEXT_PUBLIC_SESSION_COOKIE_DOMAIN=staging.DOMINIO
SEGREDO_DE_REVALIDACAO=${{shared.SEGREDO_DE_REVALIDACAO}}
SEGREDO_DA_PONTE=${{shared.SEGREDO_DA_PONTE}}
```

Notas sobre o site:

- **`NEXT_PUBLIC_API_URL` é gravado dentro do pacote na hora do _build_**, não na hora de subir (o `Dockerfile` o recebe como `ARG`, e o Railway entrega as variáveis do serviço como argumentos de construção). Mudou o valor? Precisa de **um build novo**. Se só o contêiner reiniciar, o navegador continua chamando o endereço antigo. Para forçar: faça um push qualquer na branch do ambiente, ou **Deployments → ⋮ → Redeploy** e confira, no log, que houve a etapa de build.
- **`NEXT_PUBLIC_SESSION_COOKIE_DOMAIN`** é o ancestral comum do site e da API, **sem** `https://` e sem barra. Em staging: `staging.DOMINIO` (cobre `staging.DOMINIO` e `api.staging.DOMINIO`). Em produção: `DOMINIO`. Sem essa variável o cookie sairia com o domínio de desenvolvimento e o login falharia sem aviso.
- **O site confere o próprio ambiente ao subir** (`apps/web/src/instrumentation.ts` → `server/ambiente-do-site.ts`): se `URL_DO_SITE`/`NEXT_PUBLIC_API_URL` faltarem, se a API estiver em `localhost` com o site publicado, se o domínio do cookie não cobrir site e API, ou se um dos dois segredos faltar/for fraco/for o `TROQUE_...`, o processo **não sobe** e o log diz qual variável. O health check falha e a versão antiga continua no ar. (Rodando local pelo `docker compose`, em `http://localhost`, a conferência não exige cookie nem segredo.)
- **Cuidado com cookies entre ambientes:** o cookie de produção (`Domain=DOMINIO`) também é enviado para `staging.DOMINIO`, porque staging é subdomínio. Se você logar nos dois no **mesmo navegador**, os dois cookies `sc_refresh` convivem e o login pode se comportar de forma estranha. **Teste o staging numa janela anônima ou num perfil de navegador separado.**

### 5.4 `Postgres` e `Redis`

Sem variáveis suas: o Railway gera as credenciais. Você só as **referencia** nos blocos acima.

---

## 6. Primeiro deploy do staging

1. No topo do projeto, **Deploy** (ou o banner "Apply changes"). O Railway publica `api` e `web` em paralelo.
2. Abra `api` → **Deployments** → o deploy em andamento → **View logs**. Você deve ver, nesta ordem:
   1. **Build:** as etapas do `apps/api/Dockerfile` (leva alguns minutos na primeira vez).
   2. **Pre-deploy:** `node packages/database/src/migrate.ts aplicar` aplicando as migrações em ordem e fechando com `✔ N migração(ões) aplicada(s)`. Se esta etapa falhar, **o deploy é interrompido e nada vai ao ar** (a versão anterior, se existir, segue atendendo). A causa mais comum: `DATABASE_URL_DIRETA` ou alguma `SENHA_BANCO_*` faltando.
   3. **Start:** a API sobe e o **health check** `/v1/health/ready` responde 200 (verifica banco e cache). O status vira **Active**.
3. Mesmo caminho no `web`: o build do Next leva mais tempo (alguns minutos); o health check é `/`.

Se a API disser `A API não inicia: N variável(is)...`, leia as linhas `✘ NOME — motivo`: cada uma aponta a variável e o que se espera. Corrija em **Variables** e publique de novo.

Neste ponto o health já responde pelo endereço `*.up.railway.app` (aba **Settings → Networking → Generate Domain**, útil só para conferir). O login ainda **não** funciona até a seção 7.

---

## 7. Domínios e DNS

Cada serviço tem seu domínio. Em **staging**:

1. `api` → **Settings → Networking → Public Networking → + Custom Domain** → `api.staging.DOMINIO` → **porta 3001** → **Add Domain**.
2. `web` → mesmo caminho → `staging.DOMINIO` → **porta 3000**.
3. Para cada um, o Railway mostra os **registros DNS** a criar. Anote-os.

### 7.1 Registros no registrador

No painel DNS do seu domínio, crie (o campo "nome"/"host" costuma pedir **só a parte antes do domínio**; o Railway mostra o valor exato de cada um):

| Tipo    | Nome (host)                 | Valor                                                              | Para quê                      |
| ------- | --------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| `CNAME` | `staging`                   | `<alvo mostrado pelo Railway para o web>.up.railway.app`          | site do staging               |
| `CNAME` | `api.staging`               | `<alvo mostrado pelo Railway para a api>.up.railway.app`          | API do staging                |
| `TXT`   | `_railway-verify.staging`   | `<valor mostrado pelo Railway>`                                    | prova que o domínio é seu     |
| `TXT`   | `_railway-verify.api.staging` | `<valor mostrado pelo Railway>`                                  | idem                          |

E, **na produção** (seção 10):

| Tipo    | Nome (host)               | Valor                                                       | Para quê         |
| ------- | ------------------------- | ----------------------------------------------------------- | ---------------- |
| `CNAME` | `@` (raiz do domínio)     | `<alvo do web de produção>.up.railway.app`                  | site             |
| `CNAME` | `api`                     | `<alvo da api de produção>.up.railway.app`                  | API              |
| `TXT`   | `_railway-verify`         | `<valor do Railway>`                                        | verificação      |
| `TXT`   | `_railway-verify.api`     | `<valor do Railway>`                                        | verificação      |

**Atenção ao registro na raiz (`@`).** O DNS não admite `CNAME` na raiz do domínio, e muitos registradores (inclusive o Registro.br) não oferecem `ALIAS`/`ANAME`. Escolha um caminho:

- **A (recomendado):** passe o DNS do domínio para a **Cloudflare** (gratuita): troque os _name servers_ no registrador pelos que a Cloudflare indicar. Ela aceita `CNAME` na raiz (_CNAME flattening_). Em **todos** os registros do Railway, deixe a nuvem **cinza** ("DNS only"), não laranja: o Railway emite o certificado HTTPS e a nuvem laranja atrapalha.
- **B:** se o registrador não tem nada disso, use `www.DOMINIO` para o site de produção (CNAME em `www`) e configure no painel dele o redirecionamento da raiz para `https://www.DOMINIO`. Nesse caso, em produção: `URL_DO_SITE=https://www.DOMINIO`, `ORIGENS_PERMITIDAS=https://www.DOMINIO,https://api.DOMINIO` e `NEXT_PUBLIC_API_URL=https://api.DOMINIO`; o `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN` continua `DOMINIO`.

### 7.2 Esperar e conferir

- A propagação leva de minutos a algumas horas. No Railway, o domínio mostra um aviso amarelo enquanto aguarda e muda para **verde / "certificate issued"** quando o HTTPS está pronto.
- Do seu terminal:

  ```bash
  dig +short CNAME staging.DOMINIO
  dig +short CNAME api.staging.DOMINIO
  ```

  Cada um deve devolver um endereço `*.up.railway.app`.

---

## 8. Primeira conta de administração e dados de teste

### 8.1 A administração (obrigatória para testar o painel de admin)

**Caminho automático (recomendado):** a própria API cria a administração ao subir, a partir de `ADMIN_EMAIL`, `ADMIN_SENHA` e `ADMIN_TOTP_SEGREDO` no serviço `api`. O passo a passo, as regras e os riscos estão em `docs/ambientes-e-deploy.md`, seção 10.2 (gere o segredo com `pnpm --filter @simpleclick/api administracao:segredo`, crie as três variáveis, publique, entre, troque o aplicativo em `/conta/seguranca` e apague as variáveis). Não use os dois caminhos ao mesmo tempo: quem já tem administração não ganha outra pelo caminho automático.

**Caminho manual (`arranque`):** banco novo não tem administrador. O `arranque` cria o primeiro. Ele roda **uma vez, no seu computador**, contra o banco do Railway pelo endereço **público** do Postgres.

1. No Railway: `Postgres` → **Variables** → copie `DATABASE_PUBLIC_URL`.
2. Crie um arquivo **fora do repositório** (ex.: `~/arranque-staging.env`) com:

   ```env
   DATABASE_URL_ARRANQUE=<DATABASE_PUBLIC_URL copiada>
   SENHA_BANCO_MIGRADOR=<a mesma da api no staging>
   SENHA_BANCO_APLICACAO=<a mesma da api no staging>
   SENHA_BANCO_ADMINISTRACAO=<a mesma da api no staging>
   CHAVE_CIFRA_TOTP=<a mesma da api no staging>
   PRIMEIRO_ADMIN_EMAIL=<seu e-mail>
   PRIMEIRO_ADMIN_NOME=<seu nome>
   PRIMEIRO_ADMIN_SENHA=<uma senha forte e só sua>
   ```

3. No repositório (branch `entrega/projeto-final`), com Node 24:

   ```bash
   pnpm install
   node --env-file=$HOME/arranque-staging.env apps/api/src/arranque.ts
   ```

4. O comando confere as migrações, mostra a **chave do aplicativo autenticador** e pede um código: escaneie/digite a chave no aplicativo do celular, digite o código de 6 dígitos que ele mostrar. A chave e os **códigos de recuperação** aparecem **só nessa saída**: guarde-os no gerenciador de senhas.
5. **Apague o arquivo:** `rm ~/arranque-staging.env`. Ele contém a credencial mais poderosa do sistema (`DATABASE_PUBLIC_URL`) e a senha do admin.
6. Se o seu terminal exportar `DATABASE_URL_TEST` ou `REDIS_URL_TEST`, o arranque recusa (produção e teste nunca dividem banco). Rode com `env -u DATABASE_URL_TEST -u REDIS_URL_TEST node --env-file=...`.

Depois, no Railway, se quiser, desligue o **TCP Proxy** do Postgres (Settings → Networking).

### 8.2 Seed de demonstração: o que fazer (e o que NÃO fazer)

- **O seed `demo` não roda no Railway, de propósito.** Ele cria contas de teste **com senha pública** (`packages/database/seed/demo/contas.ts`) e por isso recusa qualquer banco que não seja `localhost`, qualquer processo com variável `RAILWAY_*` e qualquer `NODE_ENV=production` (`docs/ambientes-e-deploy.md` seção 1 e 9, M-2). **Não contorne a trava** e **não restaure um dump do banco local** no Railway: isso colocaria na internet contas com senha conhecida.
- **Os 100 mil pedidos do seed de volume** (`simpleclick_simulacao`) existem só no banco local de carga. Ficam **fora** do staging e da produção. Se um dia você quiser dado em volume no staging, isso é uma decisão nova e precisa de um seed próprio (peça um card): hoje não existe um caminho seguro para isso.
- **Como ter dados de demonstração no staging:** pela própria aplicação, que é também o teste de ponta a ponta:
  1. abra `https://staging.DOMINIO/vender` e cadastre uma loja de teste (conta de **Dono**: a loja nasce "aguardando aprovação");
  2. entre como administrador em `https://staging.DOMINIO/entrar` (e-mail, senha e o código do aplicativo) e aprove a loja em **/admin → Lojas**;
  3. entre como dono e cadastre categorias e produtos pelo painel (`/painel`);
  4. abra `https://staging.DOMINIO/loja/<apelido-da-loja>` e faça um pedido com uma conta de **Cliente** criada em `/cadastrar`.

---

## 9. Checagem final (staging)

Do seu terminal (troque `DOMINIO`):

```bash
# 1. A API está viva (não toca banco)
curl -i https://api.staging.DOMINIO/v1/health/live
# esperado: HTTP/2 200

# 2. A API está pronta (confere banco e cache)
curl -i https://api.staging.DOMINIO/v1/health/ready
# esperado: HTTP/2 200 (503 = banco ou Redis fora)

# 3. O site responde
curl -I https://staging.DOMINIO/
# esperado: HTTP/2 200

# 4. HTTPS válido e certificado emitido pelo Railway/Let's Encrypt
curl -sv https://api.staging.DOMINIO/v1/health/live 2>&1 | grep -E "subject:|issuer:|expire"

# 5. CORS: origem fora da lista NÃO recebe cabeçalho de liberação
curl -s -o /dev/null -D - -H "Origin: https://qualquer-outro-site.com" \
  https://api.staging.DOMINIO/v1/health/live | grep -i "access-control-allow-origin" \
  || echo "ok: origem desconhecida não foi liberada"
```

Roteiro no navegador (janela anônima):

1. `https://staging.DOMINIO/` abre a página inicial com estilo.
2. `https://staging.DOMINIO/entrar` → entre com a conta de administração (senha + código do aplicativo) → cai no painel de administração. **Esse é o teste de que cookie, CORS e URLs estão corretos**: se o login "volta para a tela de entrada" sem erro, revise `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN`, `ORIGENS_PERMITIDAS` e `URL_DO_SITE` (seção 12).
3. Num outro navegador/perfil, `https://staging.DOMINIO/cadastrar` → crie uma conta de cliente → entre → a barra do topo mostra o nome.
4. **Feature flag:** com `FLAG_VITRINE_PROXIMO_PRECO=ligado` no staging, `GET https://api.staging.DOMINIO/v1/vitrine/<apelido>/produto/<id>` de um produto com **queda de preço agendada nos próximos 7 dias** traz o campo `proximoPreco`; sem agendamento, `"proximoPreco": null`. Na produção (`desligado`) o campo **não aparece**. Veja a seção 11.3.

Se tudo isso passou: staging pronto. **Mescle `entrega/projeto-final` na `main`** (PR e merge são seus) e siga para a produção.

---

## 10. Produção

Só depois do staging verde e da `main` com os `railway.json`.

1. Seletor de ambiente → `production`.
2. Repita as seções **4** (serviços `Postgres`, `Redis`, `api`, `web`, agora com **Branch = `main`**), **5** (com a coluna "produção" e o **segundo conjunto de segredos**, gerado na seção 2, e as variáveis compartilhadas do ambiente `production`), **6** (primeiro deploy), **7** (domínios `api.DOMINIO` e `DOMINIO`, ou `www`) e **8.1** (primeiro admin; `DATABASE_PUBLIC_URL` e senhas **da produção**).
3. **Ligue "Wait for CI"** nos dois serviços de produção.
4. Proteja a `main` no GitHub (_Settings → Branches_: exigir PR) para que a produção só mude por merge consciente. É essa a "promoção manual": **produção = o que você mesclou na `main`**.
5. Em produção **não** rode seed algum (nem demo, nem volume) e **mantenha a flag desligada** até a validação de 11.3.
6. Repita a checagem da seção 9 com os endereços de produção.

---

## 11. Estratégia de deploy

### 11.1 Quem publica o quê

```
entrega/projeto-final ──push──► staging  (api + web, pre-deploy migra o banco do staging)
        │
        └──PR + merge (você)──► main ──push──► production (api + web, pre-deploy migra o banco da produção)
```

- Cada ambiente tem **o próprio banco, Redis e segredos**. Nada é compartilhado.
- Se o grupo passar a usar uma branch `develop`, basta trocar a branch do staging em **Settings → Source → Branch** (é só uma configuração, nada no código muda).
- O **CI do GitHub** (`ci.yml`) roda em todo push; com **Wait for CI** ligado, o Railway só publica depois dele verde.
- Em cada serviço o Railway **só reconstrói quando mudam os arquivos** listados em `watchPatterns` do `railway.json` (a API não é reconstruída por mudança só no site, e vice-versa).

### 11.2 Migrações (expand/contract)

O **pre-deploy** da API (`node packages/database/src/migrate.ts aplicar`) roda **antes** de a versão nova receber tráfego. Durante a troca, a versão **antiga** do código ainda atende com o esquema **novo**. Portanto toda migração precisa ser compatível com o código anterior:

1. **Expand** (num deploy): só acrescenta (coluna anulável, tabela, índice).
2. **Migrar o código** (no mesmo deploy ou no seguinte) para usar o novo.
3. **Contract** (deploy posterior, quando nenhuma versão no ar usa o antigo): remove o antigo.

Migração já aplicada **nunca é editada**; correção vira migração nova. Se o pre-deploy falhar, a versão nova **não entra**. Detalhes e exemplo: `docs/ambientes-e-deploy.md` seção 6.3.

### 11.3 Feature flag

Existe **uma** flag de ambiente, em `apps/api/src/core/flags.ts`:

| Flag                    | Variável                     | Padrão       | Efeito quando `ligado`                                                                       |
| ----------------------- | ---------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `vitrine.proximo_preco` | `FLAG_VITRINE_PROXIMO_PRECO` | `desligado`  | `GET /v1/vitrine/:apelido/produto/:id` ganha `proximoPreco` (a próxima **queda** de preço dos próximos 7 dias) |

- **Por ambiente:** staging `ligado`, produção `desligado`. Muda-se na aba **Variables** da **`api`** do ambiente; o Railway republica e a API reinicia.
- Valor fora de `ligado`/`desligado` (ex.: `ligada`, `sim`) **recusa a partida** da API (erro com o nome da variável).
- **Ordem para ligar em produção:** (1) site e API já publicados com o contrato novo e a flag desligada; (2) ligar no staging e ensaiar; (3) ligar na produção e observar. Ligar com um site antigo, que não conhece o campo, quebraria a página do produto.
- **Desligar é o rollback da funcionalidade:** não exige deploy de código nem mexe no banco.

### 11.4 Rollback no Railway

| Situação                                          | O que fazer                                                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A funcionalidade nova atrás da flag deu problema  | `FLAG_VITRINE_PROXIMO_PRECO=desligado` na `api` do ambiente (a API reinicia; o site normaliza em até 60 s). **Sem deploy de código.**                                                                         |
| Uma versão do código deu problema                 | Serviço (`api` ou `web`) → **Deployments** → localize o último deploy **bom** (marcado como Active/Removed com sucesso) → **⋮ → Rollback**. O Railway reaproveita a imagem já construída, sem reconstruir. Confira em **Variables** que nenhuma variável mudou depois daquele deploy. |
| A migração falhou no pre-deploy                   | Nada a fazer na hora: a versão nova nunca entrou e a antiga continua atendendo. Corrija com **migração nova** e faça push.                                                                                    |
| Quer voltar o código mas a flag está ligada       | **Primeiro desligue a flag**, depois faça o rollback do site/API. Um site antigo não aceita o campo novo.                                                                                                     |
| Depois de um passo _contract_ (coluna removida)   | O rollback do código **não basta**: o código antigo não convive com o esquema novo. O caminho é migração nova para a frente, ou restaurar o backup do banco.                                                  |

Backup do banco: se o plano mostrar a aba **Backups** no `Postgres`, ligue-a. Em qualquer caso, **antes de uma migração destrutiva**, faça uma cópia pelo seu computador:

```bash
pg_dump "<DATABASE_PUBLIC_URL do ambiente>" --format=custom --file=simpleclick-<ambiente>-$(date +%F).dump
```

(Guarde o `.dump` fora do repositório; ele contém dados de clientes.)

---

## 12. Logs, monitoramento e problemas comuns

### 12.1 Ver logs

- **Pela interface:** serviço → **Deployments** → o deploy → **View logs** (abas **Build Logs**, **Deploy Logs** e **HTTP Logs**). A caixa de busca filtra por texto; a API escreve JSON, uma linha por evento, com o `correlationId` da requisição.
- **Pela linha de comando (opcional):** instale a [Railway CLI](https://docs.railway.com/guides/cli), rode `railway login` e `railway link` (escolha o projeto e o ambiente) e depois `railway logs --service api` e `railway logs --service web`.
- Métricas e SLO: `docs/observabilidade.md`. O `/metrics` da API só abre com `METRICAS_TOKEN`.

### 12.2 Problemas comuns

| Sintoma                                                                          | Causa provável e correção                                                                                                                                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `A API não inicia: ... ✘ NOME`                                                    | Variável faltando ou inválida: corrija o `NOME` em **Variables** da `api`. A API nunca imprime o valor.                                                                                                 |
| `O site não inicia: ... ✘ NOME`                                                   | Idem, no serviço `web` (seção 5.3).                                                                                                                                                                     |
| Pre-deploy falha com erro de conexão ou de permissão                              | `DATABASE_URL_DIRETA` ausente ou não é a do dono (`${{Postgres.DATABASE_URL}}`); `SENHA_BANCO_*` faltando; nome do serviço do banco diferente de `Postgres`.                                              |
| Health check falha (`/v1/health/ready` 503)                                       | Banco ou Redis inacessível: confira `DATABASE_URL` (usuário `sc_app`, senha igual a `SENHA_BANCO_APLICACAO`) e `REDIS_URL`. Veja a nota do `?family=0` na seção 5.2.                                    |
| O site abre mas o login "volta para a tela de entrada"                            | Cookie de sessão descartado: `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN` errado ou ausente, ou você está no `*.up.railway.app` em vez do domínio próprio. Confira também `ORIGENS_PERMITIDAS` e `URL_DO_SITE` da API. |
| O navegador mostra erro de CORS / `origem_nao_autorizada` (403)                   | A origem do site não está em `ORIGENS_PERMITIDAS` da **API** (deve ter o `https://` e **sem barra no fim**).                                                                                              |
| A página chama a API errada (endereço antigo ou `simpleclick.localhost`)          | `NEXT_PUBLIC_API_URL` é gravado no build: corrija e faça um build novo (seção 5.3).                                                                                                                     |
| Dois logins se atrapalham entre staging e produção                                | Cookies com domínios que se sobrepõem (seção 5.3): use janela anônima ou perfis separados.                                                                                                              |
| Envio de foto "indisponível"                                                      | `CLOUDINARY_URL` ausente.                                                                                                                                                                               |
| Domínio continua "pendente" no Railway                                            | Registro `CNAME`/`TXT` digitado errado ou DNS ainda propagando; na Cloudflare, nuvem laranja em vez de cinza; confira com `dig`.                                                                        |
| Preciso trocar um segredo                                                         | Veja o efeito de cada um na tabela de `docs/ambientes-e-deploy.md` seção 3.3 **antes** de trocar (`CHAVE_CIFRA_TOTP` e `SENHA_BANCO_*` exigem cuidado).                                                 |

---

## 13. Referência: variáveis por serviço (lista completa)

O modelo comentado de **todas** as variáveis está em `.env.example`; a matriz por ambiente (dev, teste, homologação, produção) está em `docs/ambientes-e-deploy.md` seção 2. A API valida as dela na partida (`apps/api/src/core/env.ts`, zod) e o site valida as dele (`apps/web/src/server/ambiente-do-site.ts`).

**`api` — obrigatórias no Railway:** `NODE_ENV`, `DATABASE_URL`, `DATABASE_URL_DIRETA` (pre-deploy), `SENHA_BANCO_MIGRADOR`, `SENHA_BANCO_APLICACAO`, `SENHA_BANCO_ADMINISTRACAO`, `REDIS_URL`, `JWT_SECRET`, `CHAVE_CIFRA_TOTP`, `ORIGENS_PERMITIDAS`, `URL_DO_SITE`, `SEGREDO_DE_REVALIDACAO`, `SEGREDO_DA_PONTE`. (`PORT` fixa em 3001.)
**`api` — opcionais:** `LOG_LEVEL`, `FLAG_VITRINE_PROXIMO_PRECO`, `CLOUDINARY_URL`, `METRICAS_TOKEN`, `OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS`, `SEGUNDO_PLANO`, `MIDIA_VIDEO_*`, `STORIES_*`, `VITRINE_CATALOGO_*`.
**`api` — opcionais, só até o primeiro login da administração:** `ADMIN_EMAIL`, `ADMIN_SENHA`, `ADMIN_TOTP_SEGREDO`, `ADMIN_NOME` (`docs/ambientes-e-deploy.md`, seção 10.2); apague-as depois.

**`api` — nunca no Railway:** `DATABASE_URL_TEST`, `REDIS_URL_TEST`, `METRICAS_ABERTAS`, `SIMPLECLICK_DEV_*`, `CAIXA_DE_EMAIL_DE_PROVA`, `MIDIA_LOCAL_DIR`, `ARMAZENAMENTO_PRIVADO_DIR`, `PG_BIN`, `GUARDAS_URL`; e `DATABASE_URL_ARRANQUE`, `PRIMEIRO_ADMIN_*` só no arquivo temporário da seção 8.1.

**`web` — obrigatórias:** `NODE_ENV`, `NEXT_PUBLIC_API_URL` (build), `URL_DO_SITE`, `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN`, `SEGREDO_DE_REVALIDACAO`, `SEGREDO_DA_PONTE`. (`PORT` fixa em 3000.)
**`web` — opcional:** `EMAIL_DE_SUPORTE`.

**Segredos (gerar com `openssl`, valores diferentes por ambiente):** `SENHA_BANCO_MIGRADOR`, `SENHA_BANCO_APLICACAO`, `SENHA_BANCO_ADMINISTRACAO` (`openssl rand -hex 24`); `JWT_SECRET`, `SEGREDO_DE_REVALIDACAO`, `SEGREDO_DA_PONTE` (`openssl rand -base64 48`); `CHAVE_CIFRA_TOTP` (`openssl rand -base64 32`); `METRICAS_TOKEN` (`openssl rand -hex 32`). Mais as credenciais que o Railway gera (`Postgres`, `Redis`) e `CLOUDINARY_URL`, que vem do Cloudinary.

**O que muda de staging para produção:** domínios (`URL_DO_SITE`, `ORIGENS_PERMITIDAS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN`), **todos** os segredos, o banco e o Redis (referências ao `Postgres`/`Redis` **do próprio ambiente**), a branch e `FLAG_VITRINE_PROXIMO_PRECO`.

**Nenhum segredo está no código:** o repositório só tem o marcador `TROQUE_...` do `.env.example`, que a API e o site recusam em `production`; o `gitleaks` varre o histórico no CI (`docs/ambientes-e-deploy.md` seção 4).
