/**
 * O ponta a ponta contra o ambiente que JÁ ESTÁ NO AR (card #114).
 *
 * A configuração principal sobe o site e a API sozinha (build de produção em
 * :3100/:3101), o que leva minutos. Quando o site de desenvolvimento já está de
 * pé — `pnpm dev` em :3000, falando com a API em :3001 e com o mesmo banco do
 * `.env` que as fixtures usam —, esta configuração reaproveita o que existe:
 * mesmos cenários, mesmos projetos (`publico` e `celular`), outro endereço.
 *
 * Uso: `E2E_SITE=http://localhost:3000 playwright test -c playwright.no-ar.config.ts`
 * (o padrão já é :3000). Não substitui `pnpm test:e2e`, que segue sendo o do
 * portão.
 */
import { defineConfig } from "@playwright/test";

import principal from "./playwright.config.ts";

const site = process.env["E2E_SITE"] ?? "http://localhost:3000";

export default defineConfig({
  ...principal,
  use: { ...principal.use, baseURL: site },
  webServer: undefined,
});
