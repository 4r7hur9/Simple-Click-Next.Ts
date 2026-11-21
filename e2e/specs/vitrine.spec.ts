import { expect, test } from "@playwright/test";

const LOJA = "pastelaria-da-vila";

test("@spec:AC-404 a vitrine lista somente as categorias visíveis na ordem do dono", async ({
  page,
}) => {
  await page.goto(`/loja/${LOJA}/cardapio`);

  await expect(page.locator(".sc-vitrine__secao h2")).toHaveText([
    "Pastéis",
    "Pastéis Doces",
    "Salgados",
    "Combos",
    "Bebidas",
    "Sobremesas",
  ]);
  await expect(
    page.getByRole("link", { name: /Pastel de Carne/ }).first(),
  ).toBeVisible();
  await expect(page.getByText("Pastel do Chef")).toHaveCount(0);
});
