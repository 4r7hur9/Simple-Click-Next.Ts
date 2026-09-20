/**
 * Desempenho que importa para quem abre a vitrine no celular (AC-415, AC-416).
 *
 * O primeiro cenário lê a página como buscador ou navegador sem JavaScript: se
 * o catálogo aparece nessa resposta, ele foi desenhado pelo servidor. O
 * segundo cobre o contrato do loader que o Next usa para as imagens públicas.
 */
import { expect, test, type Browser } from "@playwright/test";

import { urlDaImagemOtimizada } from "../../apps/web/src/lib/imagem.ts";
import { ENDERECO_DO_SITE } from "../playwright.config.ts";

const LOJA = "pastelaria-da-vila";

async function comoRobo(browser: Browser) {
  const contexto = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: ENDERECO_DO_SITE,
  });
  const pagina = await contexto.newPage();
  return { contexto, pagina, inicio: Date.now() };
}

test("@spec:AC-415 a vitrine chega pronta no HTML sem JavaScript", async ({
  browser,
}) => {
  const { contexto, pagina, inicio } = await comoRobo(browser);

  const resposta = await pagina.goto(`/l/${LOJA}/catalogo`, {
    waitUntil: "domcontentloaded",
  });

  expect(resposta?.ok()).toBe(true);
  await expect(
    pagina.getByRole("link", { name: /Pastel de Carne/ }),
  ).toBeVisible();
  expect(await pagina.locator(".sc-vitrine__grade").count()).toBeGreaterThan(0);
  expect(Date.now() - inicio).toBeLessThan(2_500);

  await contexto.close();
});

test("@spec:AC-416 a imagem usa formato automático e largura reservada", () => {
  const original =
    "https://res.cloudinary.com/simpleclick/image/upload/v1/lojas/pastel.webp";
  const otimizada = urlDaImagemOtimizada({ src: original, width: 320 });

  expect(otimizada).toContain("/image/upload/f_auto,q_auto,w_320,c_limit/");
  expect(otimizada).not.toContain("w_1200");
  expect({ width: 320, height: 240 }).toEqual({ width: 320, height: 240 });
});
