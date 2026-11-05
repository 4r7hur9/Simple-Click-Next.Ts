# Dependências, scripts de terceiros e source maps

## 1. Antes de adicionar uma dependência

Checklist do `implementer` (registre no relatório quando adicionar pacote de runtime):

1. **Precisa mesmo?** Função de 10 linhas não justifica dependência. A plataforma já oferece? (`Intl`, `fetch`, `crypto.randomUUID`, `structuredClone`, `URL`).
2. **Nome exato.** Confira no npm e no repositório oficial. Typosquatting comum: letras trocadas, hífen a mais, escopo falso (`@types-node/...`).
3. **Saúde.** Última publicação, mantenedores, issues abertas de segurança, downloads semanais coerentes com a popularidade alegada.
4. **Scripts de instalação.** Pacote com `preinstall`/`postinstall` que baixa binário ou executa código merece atenção extra.
5. **Peso.** Impacto no bundle do cliente (ver `frontend-performance`).
6. **Licença.** Compatível com uso comercial (MIT, Apache-2.0, BSD, ISC). GPL/AGPL em código distribuído requer decisão do dono.
7. **Vulnerabilidades.** `npm audit --omit=dev` sem alta/crítica no pacote novo.

Instale com o gerenciador que o projeto usa (lockfile existente decide: `package-lock.json` = npm, `pnpm-lock.yaml` = pnpm, `yarn.lock` = yarn) e commite o lockfile no mesmo commit.

## 2. Manutenção contínua

- CI usa `npm ci` (ou `pnpm install --frozen-lockfile`), nunca `npm install`, para instalar exatamente o lockfile.
- Dependabot ou Renovate para atualizações; SCA (npm audit, Snyk, Socket) no pipeline (ver `testes-qualidade` e `devops-observabilidade-lgpd`).
- Versões com `^` são aceitáveis com lockfile; dependências críticas de segurança (auth, crypto) podem ser fixadas.
- Pacote abandonado com vulnerabilidade sem correção: substitua ou isole; registre como débito.
- `overrides` (npm) / `pnpm.overrides` para forçar versão corrigida de dependência transitiva, com comentário explicando.

## 3. Scripts de terceiros no navegador

Todo script de terceiro roda com os mesmos poderes do seu código: lê o DOM, cookies não HttpOnly, dados digitados em formulários.

Regras:
- Carregue apenas nas rotas que precisam. Nunca carregue analytics/chat na página de pagamento ou de login sem necessidade.
- `next/script` com estratégia adequada (ver `frontend-performance`).
- Origem listada na CSP (`script-src` via `'strict-dynamic'` + nonce, `connect-src` para o endpoint de coleta).
- URL fixa e versionada: use SRI.

```tsx
<Script
  src="https://cdn.exemplo-lib.com/lib@4.2.1/lib.min.js"
  integrity="sha384-<hash-publicado-pelo-fornecedor>"
  crossOrigin="anonymous"
  strategy="afterInteractive"
/>
```

- SRI não funciona com scripts que mudam sem mudar a URL (a maioria dos analytics). Nesse caso, a defesa é CSP + fornecedor confiável + mínimo de páginas.
- Prefira self-hosting de bibliotecas estáveis via npm a CDN de terceiros.
- Pixels/analytics: não envie PII (e-mail, telefone, CPF) em eventos, URLs ou propriedades customizadas. Respeite o consentimento (ver `devops-observabilidade-lgpd`).
- SDK de pagamento: use o componente/iframe hospedado pelo gateway para dados de cartão; o app nunca toca no número do cartão.

## 4. Source maps

- `productionBrowserSourceMaps` é `false` por padrão no Next.js. Não ligue sem motivo.
- Para depurar erros de produção, gere os maps no build, envie ao Sentry (ou equivalente) e não os publique no CDN. O plugin do Sentry para Next.js tem opção para apagar os `.map` após o upload; confira o nome exato na versão do SDK do projeto.
- Verificação: `curl -sI https://app.exemplo.com.br/_next/static/chunks/<arquivo>.js.map` deve responder 404.
- Mesmo sem source map, o JS minificado é legível. Nunca conte com ofuscação para esconder regra de negócio ou segredo.

## 5. Variáveis de ambiente

```ts
// src/env.ts
import 'server-only';
import { z } from 'zod';

const servidor = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  GATEWAY_API_KEY: z.string().min(1),
});
export const env = servidor.parse(process.env);
```

```ts
// src/env-client.ts
import { z } from 'zod';

const cliente = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});
export const envClient = cliente.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

- No cliente, o Next.js só substitui referências literais `process.env.NEXT_PUBLIC_X` no build; por isso o objeto é montado campo a campo.
- Valores `NEXT_PUBLIC_` ficam embutidos no bundle: são públicos para sempre após o deploy. Se um segredo vazou assim, rotacione (não basta remover do código).
- DSN do Sentry e chave publicável de gateway são públicos por design; chave secreta de gateway, token de API interna e credencial de banco nunca.

## 6. O que o revisor procura no diff

- `package.json` com dependência nova: nome, necessidade, peso, lockfile atualizado no mesmo diff.
- Lockfile alterado sem mudança no `package.json` (atualização acidental ampla): finding pedindo a justificativa em `decisoes.md` ou a reversão.
- `<script src=...>` cru em layout, ou `next/script` no layout raiz para algo usado em uma página.
- Novas origens em CSP (`script-src`, `connect-src`) sem justificativa.
- `NEXT_PUBLIC_` novo com nome sugestivo de segredo (`_SECRET`, `_KEY` privada, `_TOKEN`).
- `productionBrowserSourceMaps: true` ou upload de maps sem remoção.
