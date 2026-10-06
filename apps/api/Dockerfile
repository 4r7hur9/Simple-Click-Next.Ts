# syntax=docker/dockerfile:1

# Imagem de produção da API do SimpleClick (T-018).
#
# Construída da RAIZ do repositório, porque a API é um pacote de um monorepo e
# depende de irmãos por ligação de espaço de trabalho:
#
#   docker build -f apps/api/Dockerfile -t simpleclick-api .
#
# Três coisas que este arquivo garante, e por que cada uma:
#
# 1. **Vários estágios.** O que compila (gerenciador de pacotes, compilador de
#    tipos, gerador do cliente do banco) fica no estágio de construção e NÃO
#    viaja para o que vai ao ar. Imagem menor é consequência; a razão é
#    superfície: ferramenta que não existe na imagem não pode ser usada por
#    quem entrar nela.
# 2. **Sem dependência de desenvolvimento.** Antes de copiar, o estágio de
#    construção reinstala o `node_modules` só com o que é de execução. Não é
#    limpeza cosmética: compilador e biblioteca de teste dentro do contêiner
#    que atende loja são código extra rodando com o mesmo poder da aplicação.
# 3. **Usuário sem privilégio.** O processo roda como `node`, e não como
#    administrador. Uma falha que consiga executar comando encontra um usuário
#    que não instala pacote nem escreve fora do que precisa.
#
# A imagem carrega TAMBÉM as ferramentas de migração (`infra/railway/`,
# `infra/scripts/` e `packages/database/`). Isso é de propósito: o comando de
# pré-publicação roda DENTRO desta imagem, antes de ela receber tráfego
# (AC-029). Sem as migrações aqui, o passo que aplica o esquema não existiria
# no lugar onde o provedor o executa.

ARG VERSAO_DO_NODE=24.18.0

# ---------------------------------------------------------------------------
# Base — o mesmo Node em todos os estágios, para que o que foi compilado e o
# que executa nunca sejam versões diferentes da mesma linguagem.
# ---------------------------------------------------------------------------
FROM node:${VERSAO_DO_NODE}-bookworm-slim AS base
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependências — só os manifestos e o arquivo de trava.
#
# Copiar apenas os manifestos antes do código-fonte é o que faz a instalação
# ficar em cache: mexer numa linha de `app.ts` não obriga a baixar o mundo de
# novo. `--frozen-lockfile` recusa resolver versão nova por conta própria: a
# imagem instala EXATAMENTE o que a máquina de desenvolvimento instalou.
# ---------------------------------------------------------------------------
FROM base AS dependencias
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config-eslint/package.json packages/config-eslint/
COPY packages/config-ts/package.json packages/config-ts/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/database/package.json packages/database/
COPY packages/testing/package.json packages/testing/
COPY packages/ui/package.json packages/ui/

# `--ignore-scripts`: script de instalação é execução de código de terceiro no
# meio da construção (superfície de cadeia de suprimentos). O único que este
# projeto realmente precisa — gerar o cliente tipado do banco — é chamado
# adiante, por nome, onde dá para ver.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# Construção — gera o cliente do banco, compila a API e PODA o desenvolvimento.
# ---------------------------------------------------------------------------
FROM dependencias AS construcao

COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api

# O cliente tipado nasce do esquema declarado e não é versionado: sem este
# passo, `core/db.ts` não encontraria o que importa.
RUN pnpm --filter @simpleclick/database run gerar

# `tsc` escreve `apps/api/dist`. O tsconfig de geração já deixa os testes de
# fora — teste em imagem de produção só carrega peso e dependência que não
# existe lá.
RUN pnpm --filter @simpleclick/api run build

# A poda: joga a árvore inteira fora e reinstala só o que é de execução.
#
# Reinstalar do zero, e não "instalar por cima", é o que faz a diferença: por
# cima, o gerenciador refaz as ligações mas DEIXA os arquivos no depósito
# interno (`node_modules/.pnpm`) — compilador, ferramenta de teste e gerador de
# esquema continuariam dentro da imagem, sem aparecer em lista nenhuma. Medido:
# `/app` com 868 MB instalando por cima, contra 356 MB do zero, e a diferença
# é exatamente o desenvolvimento que o critério manda não levar.
#
# Acontece ANTES de apagar pacote do espaço de trabalho: o arquivo de trava
# descreve todos os pacotes, e apagar um deles antes faria `--frozen-lockfile`
# recusar a instalação por divergência que ninguém escreveu.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@simpleclick/api..."

# Três pacotes atravessam a poda porque `@prisma/client` os declara como
# companhia OPCIONAL, e o arquivo de trava reproduz a resolução que a máquina de
# desenvolvimento fez. São a linha de comando do Prisma, o painel visual dele e
# o servidor de desenvolvimento — 104 MB de ferramenta que a API em produção
# nunca chama; o que ela usa é o cliente TIPADO já gerado, que fica em
# `packages/database/gerado`. Sair daqui leva `/app` de 356 MB para 267 MB, e
# a prova de que nada quebrou é a imagem subir e responder `/v1/health/live`.
RUN rm -rf node_modules/.pnpm/prisma@* \
  node_modules/.pnpm/@prisma+studio-core* \
  node_modules/.pnpm/@prisma+dev@*

# Os pacotes irmãos são consumidos como código-fonte TypeScript, então os
# arquivos de teste deles viriam junto — importando uma ferramenta de teste que
# a poda acabou de remover. E os pacotes que só existem para desenvolver (apoio
# a teste, regras de qualidade, design system do site) não têm o que fazer
# dentro da imagem da API.
RUN find packages \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.prova.ts' \) -delete \
  && rm -rf packages/testing packages/config-eslint packages/config-ts packages/ui

# ---------------------------------------------------------------------------
# Produção — o que efetivamente vai ao ar.
#
# Parte de `base`, e não de `construcao`: assim nada do que só serviu para
# compilar pode viajar por esquecimento. O que entra é copiado item a item,
# porque uma lista explícita é revisável e um `COPY . .` não é.
# ---------------------------------------------------------------------------
FROM base AS producao

ENV NODE_ENV=production
# `main.ts` lê PORT (AC-048). Declarar aqui evita que a imagem dependa de o
# cofre do provedor lembrar de uma variável cujo padrão já é o certo; o
# provedor que injeta a própria PORT continua valendo por cima desta.
ENV PORT=3001

COPY --from=construcao --chown=node:node /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=construcao --chown=node:node /app/node_modules ./node_modules
COPY --from=construcao --chown=node:node /app/packages/contracts ./packages/contracts
# Regras puras compartilhadas (dinheiro, status, cupom...): a API importa
# daqui em execução, como código-fonte TypeScript, igual ao contrato.
COPY --from=construcao --chown=node:node /app/packages/core ./packages/core
COPY --from=construcao --chown=node:node /app/packages/database ./packages/database
COPY --from=construcao --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=construcao --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=construcao --chown=node:node /app/apps/api/dist ./apps/api/dist

# As ferramentas da publicação. O provedor executa `infra/railway/pre-deploy.sh`
# DENTRO desta imagem, antes de mandar tráfego para ela (AC-029).
COPY --chown=node:node infra/railway ./infra/railway
COPY --chown=node:node infra/scripts/check-ambientes.sh ./infra/scripts/
COPY --chown=node:node infra/scripts/check-migracao-compativel.mjs ./infra/scripts/

# Daqui para baixo, nada roda como administrador.
USER node

EXPOSE 3001

# `live` responde "o processo está de pé", sem tocar banco nem cache: se ele
# dependesse do banco, a primeira queda do banco faria o orquestrador matar e
# recriar todas as instâncias — trocando falha parcial por total.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/v1/health/live').then(function (r) { process.exit(r.ok ? 0 : 1); }, function () { process.exit(1); })"]

CMD ["node", "apps/api/dist/main.js"]
