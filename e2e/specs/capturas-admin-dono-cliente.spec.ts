/**
 * Capturas do modo administração, do painel do dono e do explorar do cliente
 * (card #170, T-13; CA-14): 1440 e 390, claro e escuro. Também afirma que o
 * selo da administração aparece na sidebar e no cabeçalho do /admin e em
 * nenhuma tela do dono nem do cliente.
 *
 * As imagens vão para `test-results/` e para `.rmcode/capturas/170/` (fora do
 * git) para serem anexadas ao card.
 */
import { mkdir, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { entrarComoAdministrador } from "../fixtures/admin.ts";
import { entrarComoDono } from "../fixtures/painel.ts";
import { clienteLogado } from "../fixtures/redesign-lojas.ts";
import {
  TEMAS,
  alturaPara,
  esperarAssentar,
  jaEscolheuOsCookies,
  prepararPagina,
} from "../fixtures/redesign.ts";
import { ENDERECO_DO_SITE } from "../playwright.config.ts";

const LARGURAS = [1440, 390] as const;
const PASTA = fileURLToPath(
  new URL("../../.rmcode/capturas/170/", import.meta.url),
);
const SELO = '[data-modo="administracao"].sc-selo-admin';

type Papel = "admin" | "dono" | "cliente";

const TELAS: ReadonlyArray<{ papel: Papel; id: string; caminho: string }> = [
  { papel: "admin", id: "admin-visao-geral", caminho: "/admin" },
  { papel: "admin", id: "admin-pessoas", caminho: "/admin/contas" },
  {
    papel: "admin",
    id: "admin-donos-e-equipes",
    caminho: "/admin/donos-e-equipes",
  },
  { papel: "dono", id: "dono-painel", caminho: "/painel" },
  { papel: "cliente", id: "cliente-explorar", caminho: "/explorar/produtos" },
];

async function entrar(
  papel: Papel,
  contexto: Parameters<typeof entrarComoAdministrador>[0],
): Promise<void> {
  await jaEscolheuOsCookies(contexto, ENDERECO_DO_SITE);
  if (papel === "admin")
    await entrarComoAdministrador(contexto, ENDERECO_DO_SITE);
  else if (papel === "dono") await entrarComoDono(contexto, ENDERECO_DO_SITE);
  else
    await clienteLogado(contexto, ENDERECO_DO_SITE, "Cliente das Capturas 170");
}

async function selosVisiveis(page: Page): Promise<number> {
  return page
    .locator(SELO)
    .evaluateAll(
      (nos) =>
        nos.filter((no) => (no as HTMLElement).offsetParent !== null).length,
    );
}

for (const tela of TELAS) {
  test(`[CA-14] capturas de ${tela.id} em 1440/390, claro e escuro`, async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== "publico", "roda só no projeto publico");
    test.setTimeout(180_000);
    await entrar(tela.papel, context);
    await mkdir(PASTA, { recursive: true });

    for (const largura of LARGURAS) {
      for (const tema of TEMAS) {
        await test.step(`${largura}px ${tema}`, async () => {
          await page.setViewportSize({
            width: largura,
            height: alturaPara(largura),
          });
          await prepararPagina(page, tema);
          const resposta = await page.goto(tela.caminho);
          expect(resposta?.status()).toBeLessThan(400);
          expect(new URL(page.url()).pathname).toBe(tela.caminho);
          await esperarAssentar(page);

          if (tela.papel === "admin") {
            // Sidebar (no celular, a barra de baixo) e cabeçalho: ao menos um
            // selo visível, e a moldura da administração presente.
            expect(await selosVisiveis(page)).toBeGreaterThan(0);
            await expect(
              page.locator(".sc-moldura-admin").first(),
            ).toBeAttached();
          } else {
            await expect(page.locator(SELO)).toHaveCount(0);
            await expect(page.locator(".sc-moldura-admin")).toHaveCount(0);
          }

          const nome = `${tela.id}-${largura}-${tema}.png`;
          const arquivo = info.outputPath(nome);
          await page.screenshot({ path: arquivo, fullPage: true });
          expect((await stat(arquivo)).size).toBeGreaterThan(1_000);
          await copyFile(arquivo, join(PASTA, nome));
        });
      }
    }
  });
}
