# syntax=docker/dockerfile:1

# Imagem de produção do site do SimpleClick (T-018).
#
# Construída da RAIZ do repositório, porque o site é um pacote de um monorepo e
# consome o design system por ligação de espaço de trabalho:
#
#   docker build -f apps/web/Dockerfile -t simpleclick-web .
#
# O destino planejado do site é a Vercel, que constrói a partir do repositório e
# não usa este arquivo. Ele existe assim mesmo, por duas razões práticas: manter
# o site publicável em qualquer lugar que rode contêiner (o dia em que o plano
# gratuito deixar de servir chega com data marcada, decisão de 17/08) e permitir
# reproduzir localmente a MESMA construção de produção que hoje só acontece no
# provedor — o que transforma "funciona na minha máquina" em algo conferível.
#
# As três garantias são as mesmas da imagem da API: vários estágios, nenhuma
# dependência de desenvolvimento na imagem final, e processo rodando como
# usuário sem privilégio.
#
# A saída autônoma do Next (`output: "standalone"`, em `next.config.ts`) é o que
# permite a imagem final não ter gerenciador de pacotes nem `node_modules`
# inteiro: o próprio build escreve um servidor mínimo com apenas os arquivos que
# ele carrega de verdade.

ARG VERSAO_DO_NODE=24.18.0

# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------
FROM node:${VERSAO_DO_NODE}-bookworm-slim AS base
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependências — só manifestos e arquivo de trava, para a instalação ficar em
# cache enquanto nenhuma dependência mudar.
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

RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# Construção
# ---------------------------------------------------------------------------
FROM dependencias AS construcao

# O endereço da API é lido pelo navegador, então ele é gravado dentro do pacote
# na hora da construção — não na hora de subir. Trocar de endereço exige
# construir de novo, e é por isso que ele entra como argumento declarado, e não
# como variável de ambiente que alguém acha que muda em produção. Não é segredo
# (P-002): é o nome público do serviço.
ARG NEXT_PUBLIC_API_URL=https://api.simpleclick.localhost
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

COPY tsconfig.base.json ./
COPY packages packages
COPY apps/web apps/web

RUN pnpm --filter @simpleclick/web run build

# ---------------------------------------------------------------------------
# Produção — parte de `base`, então nada do estágio de construção viaja por
# esquecimento. Só três coisas entram, e todas vêm da saída autônoma.
# ---------------------------------------------------------------------------
FROM base AS producao

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# O servidor autônomo escuta o que estas duas dizem. `0.0.0.0` é obrigatório
# dentro de contêiner: escutando só em `localhost`, o processo subiria e
# ninguém de fora conseguiria falar com ele.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# A saída autônoma já traz o `node_modules` mínimo que ela mesma rastreou —
# nenhuma dependência de desenvolvimento entre elas.
COPY --from=construcao --chown=node:node /app/apps/web/.next/standalone ./
# Arquivos estáticos e imagens otimizadas ficam FORA da saída autônoma de
# propósito: o normal é servi-los por rede de distribuição. Sem esta linha o
# site sobe sem estilo nenhum, que é a falha mais confusa desta imagem.
COPY --from=construcao --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# A pasta `public` (imagens da landing, ícones, prints) também fica FORA da
# saída autônoma: sem esta linha tudo que mora em `public/` responde 404.
COPY --from=construcao --chown=node:node /app/apps/web/public ./apps/web/public

# Daqui para baixo, nada roda como administrador.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(function (r) { process.exit(r.ok ? 0 : 1); }, function () { process.exit(1); })"]

CMD ["node", "apps/web/server.js"]
