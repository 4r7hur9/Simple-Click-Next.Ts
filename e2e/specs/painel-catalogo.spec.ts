/**
 * Ponta a ponta do cadastro pelo painel (T-313, AC-304).
 *
 * O dono cria a seção e o produto pelas telas de verdade, num navegador de
 * verdade, e o produto aparece publicado na vitrine da loja. É o único lugar
 * em que o caminho inteiro — tela do painel, rota do site, API, banco, vitrine
 * — é percorrido junto; cada pedaço já tem prova própria.
 */
import { expect, test } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  APELIDO_DO_PAINEL,
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

test.beforeAll(async () => {
  await garantirLojaDoPainel();
});

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

test("@spec:AC-304 o dono cria a seção e o produto pelo painel, e o produto aparece publicado na vitrine", async ({
  page,
}, info) => {
  const secao = nomeUnico("Camisetas", info.project.name);
  const produto = nomeUnico("Camiseta Listrada", info.project.name);

  await page.goto("/painel/categorias");
  await expect(
    page.getByRole("status").filter({ hasText: /categoria/ }),
  ).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill(secao);
  await page.getByRole("button", { name: "Criar categoria" }).click();
  await expect(
    page.getByText("Categoria criada e pronta para receber produtos."),
  ).toBeVisible();

  await page.goto("/painel/produtos/novo");
  await expect(page.getByText("Preencha os dados do produto.")).toBeVisible();
  await page.getByLabel("Nome do produto").fill(produto);
  await page
    .getByLabel("Descrição (opcional)")
    .fill("Algodão penteado, gola careca.");
  await page.getByLabel(/^Categoria/).selectOption({ label: secao });
  // Ponto decimal, que é o que o teclado numérico do celular oferece: a conta
  // antiga apagava o ponto e cadastrava R$ 1.990,00 (AC-311).
  await page.getByLabel("Preço (R$)").fill("19.90");
  await page.getByLabel("Visibilidade").selectOption("PUBLISHED");
  await page.getByRole("button", { name: "Cadastrar produto" }).click();

  await expect(page).toHaveURL(/\/painel\/produtos$/);
  const cartao = page.getByRole("listitem").filter({ hasText: produto });
  await expect(cartao).toContainText("Publicado");
  await expect(cartao).toContainText(/R\$\s19,90/);

  const editar = await cartao
    .getByRole("link", { name: "Editar" })
    .getAttribute("href");
  const produtoId = editar?.split("/").pop();
  expect(produtoId).toBeTruthy();

  await page.goto(`/loja/${APELIDO_DO_PAINEL}/produto/${produtoId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(produto);
  await expect(page.getByText(/R\$\s19,90/).first()).toBeVisible();
  await expect(page.getByText("Algodão penteado, gola careca.")).toBeVisible();
});
