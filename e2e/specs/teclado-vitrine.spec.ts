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
  await page.goto(`/loja/${APELIDO_DA_LOJA}/cardapio`);

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
  // O PRODUTO APARECE DUAS VEZES, de propósito: a loja de teste o marca como
  // destaque (a televisão precisa de uma tela de destaques, AC-925), e o
  // destaque tem área própria acima do cardápio (AC-406). O link procurado é o
  // da seção da categoria, que existe com ou sem destaque.
  await expect(
    page
      .getByRole("region", { name: "Salgados" })
      // O cartão novo tem também "Adicionar Pastel de Teste à sacola": o
      // link procurado é o do cartão, cujo nome começa pelo produto.
      .getByRole("link", { name: /^Pastel de Teste/ }),
  ).toBeVisible();
});
