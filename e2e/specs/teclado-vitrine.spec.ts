import { expect, test } from "@playwright/test";

import {
  APELIDO_DA_LOJA,
  garantirLojaDeTeste,
} from "../fixtures/loja-de-teste.ts";

test.beforeAll(async () => {
  await garantirLojaDeTeste();
});

test("@spec:AC-418 a vitrine percorre links com foco visível pelo teclado", async ({
  page,
}) => {
  await page.goto(`/l/${APELIDO_DA_LOJA}/catalogo`);

  const focados: string[] = [];
  for (let indice = 0; indice < 12; indice += 1) {
    await page.keyboard.press("Tab");
    focados.push(
      await page.evaluate(() => {
        const elemento = document.activeElement;
        if (!(elemento instanceof HTMLElement)) return "";
        const estilo = getComputedStyle(elemento);
        return `${elemento.tagName}:${elemento.getAttribute("href") ?? elemento.getAttribute("aria-label") ?? elemento.textContent?.trim() ?? ""}:${estilo.outlineStyle}`;
      }),
    );
  }

  expect(focados.some((foco) => foco.startsWith("A:"))).toBe(true);
  expect(focados.some((foco) => foco.endsWith(":solid"))).toBe(true);
  await expect(
    page.getByRole("link", { name: /Pastel de Teste/ }),
  ).toBeVisible();
});
