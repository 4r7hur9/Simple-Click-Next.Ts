/**
 * Aviso de cookies aberto sobre a administração (card #5).
 *
 * Os outros cenários já entram com o consentimento gravado (`jaEscolheuOsCookies`),
 * então o aviso nunca aparecia neles. Aqui o consentimento fica ZERADO: o aviso
 * abre e o teste confere que (1) ele não cobre o menu nem o cabeçalho do /admin
 * e (2) com a página rolada até o fim nenhum botão ou link fica atrás dele.
 *
 * Roda só no e2e isolado (`pnpm --filter @simpleclick/e2e test:e2e:isolado`).
 */
import { expect, test, type Page } from "@playwright/test";

import { entrarComoAdministrador } from "../fixtures/admin.ts";
import { ENDERECO_DO_SITE } from "../playwright.config.ts";

const LARGURAS = [1440, 1024, 768, 390] as const;
const CAMINHOS = ["/admin", "/admin/lojas", "/admin/contas"] as const;

/** Textos dos controles fora do aviso cujo centro cai DENTRO do aviso. */
async function cobertos(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const aviso = document.querySelector(".sc-cookies");
    if (aviso === null) return ["(sem aviso)"];
    const achados: string[] = [];
    for (const el of document.querySelectorAll("a[href],button,input,select,textarea")) {
      if (aviso.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) continue;
      const x = Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1);
      const topo = document.elementFromPoint(x, y);
      if (topo !== null && aviso.contains(topo))
        achados.push((el.textContent ?? el.tagName).trim().slice(0, 30));
    }
    return achados;
  });
}

for (const largura of LARGURAS) {
  for (const caminho of CAMINHOS) {
    test(`aviso aberto em ${caminho} a ${largura}px não esconde menu nem conteúdo`, async ({
      page,
      context,
    }, info) => {
      test.skip(info.project.name !== "publico", "roda só no projeto publico");
      await entrarComoAdministrador(context, ENDERECO_DO_SITE);
      await page.setViewportSize({ width: largura, height: largura === 390 ? 844 : 800 });
      await page.goto(caminho);

      const aviso = page.locator(".sc-cookies");
      await expect(aviso).toBeVisible();
      await expect(aviso.getByRole("button", { name: "Aceitar todos" })).toBeVisible();
      await expect(aviso.getByRole("button", { name: "Recusar não essenciais" })).toBeVisible();

      // O aviso inteiro cabe na tela e não sai pelos lados.
      const caixa = await aviso.boundingBox();
      expect(caixa).not.toBeNull();
      expect(caixa!.x).toBeGreaterThanOrEqual(0);
      expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(largura);

      // Nenhum item do menu (lateral ou barra de baixo) fica sob o aviso.
      const menu = page.getByRole("navigation").first();
      const menuCaixa = await menu.boundingBox();
      if (menuCaixa !== null) {
        const sobrepoe =
          caixa!.x < menuCaixa.x + menuCaixa.width &&
          caixa!.x + caixa!.width > menuCaixa.x &&
          caixa!.y < menuCaixa.y + menuCaixa.height &&
          caixa!.y + caixa!.height > menuCaixa.y;
        expect(sobrepoe, "o aviso não pode sobrepor o menu").toBe(false);
      }

      // Rolando até o fim, nada clicável fica atrás do aviso.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      expect(await cobertos(page)).toEqual([]);
    });
  }
}
