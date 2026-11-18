import { expect, test } from "@playwright/test";

import { garantirPastelariaDeTesteAberta } from "../fixtures/loja-de-teste.ts";

const LOJA = "pastelaria-da-vila";

test.beforeAll(async () => {
  await garantirPastelariaDeTesteAberta();
});

test("@spec:AC-410 a página do produto mostra tudo que preciso decidir", async ({
  page,
}) => {
  await page.goto(`/loja/${LOJA}/cardapio`);
  await page
    .getByRole("link", { name: /Pastel de Carne/ })
    .first()
    .click();

  await expect(
    page.getByRole("heading", { name: "Pastel de Carne" }),
  ).toBeVisible();
  // A galeria do detalhe novo (card #109) substituiu `.sc-produto__foto`.
  await expect(page.locator(".sc-detalhe__fotos")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Sobre o item" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Pastel de massa fina com carne moída temperada/),
  ).toBeVisible();
  await expect(page.getByText("R$ 7,00").first()).toBeVisible();
  await expect(page.getByRole("group", { name: "Ingredientes" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Adicionais" })).toBeVisible();
  await expect(
    page.getByLabel("Observação para este item (opcional)"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Adicionar.*R\$ 7,00/ }),
  ).toBeVisible();
});

test("@spec:AC-410 os grupos de escolha obrigatória aparecem sinalizados antes de decidir", async ({
  page,
}) => {
  await page.goto("/loja/moda-boa-vista/cardapio");
  await page
    .getByRole("link", { name: /Camiseta Básica/ })
    .first()
    .click();

  await expect(
    page.getByRole("group", { name: /Tamanho.*obrigatório/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: /Cor.*obrigatório/i }),
  ).toBeVisible();
});
