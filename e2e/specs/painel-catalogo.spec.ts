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
import { escolherNoSeletor } from "../fixtures/seletor.ts";
import {
  APELIDO_DO_PAINEL,
  entrarComoDono,
  garantirLojaDoPainel,
  limparSobrasDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

test.beforeAll(async () => {
  const { id: lojaId } = await garantirLojaDoPainel();
  // A loja do painel dura entre rodadas: as categorias das rodadas
  // anteriores contam no limite de 50 da loja (card #133).
  await limparSobrasDoPainel(lojaId);
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
  // A lista de categorias carrega por trás: espera o fim do carregamento.
  await expect(page.getByText("Carregando categorias…")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Nome da categoria", exact: true })
    .fill(secao);
  await page.getByRole("button", { name: "Criar categoria" }).click();
  await expect(
    page.getByText("Categoria criada e pronta para receber produtos."),
  ).toBeVisible();

  await page.goto("/painel/produtos/novo");
  await expect(page.getByText("Preencha os dados do produto.")).toBeVisible();
  await page.getByLabel("Nome do produto", { exact: true }).fill(produto);
  await page
    .getByLabel("Descrição (opcional)", { exact: true })
    .fill("Algodão penteado, gola careca.");
  await escolherNoSeletor(
    page,
    page.getByRole("combobox", { name: /^Categoria/ }),
    secao,
  );
  // Ponto decimal, que é o que o teclado numérico do celular oferece: a conta
  // antiga apagava o ponto e cadastrava R$ 1.990,00 (AC-311).
  await page.getByLabel("Preço de venda (R$)", { exact: true }).fill("19.90");
  await escolherNoSeletor(
    page,
    page.getByRole("combobox", { name: "Visibilidade" }),
    "Publicado na vitrine",
  );
  await page.getByRole("button", { name: "Cadastrar produto" }).click();

  await expect(page).toHaveURL(/\/painel\/produtos$/);
  // A lista é tabela no computador e cartões no celular; nos dois, o produto
  // tem o menu "Ações".
  const cartao = page
    .locator("tr:visible, li[data-produto]:visible")
    .filter({ hasText: produto });
  await expect(cartao).toContainText("Publicado");
  await expect(cartao).toContainText(/R\$\s19,90/);

  await cartao.getByRole("button", { name: /Ações/ }).click();
  const editar = await page
    .getByRole("link", { name: "Editar", exact: true })
    .getAttribute("href");
  const produtoId = editar?.split("/").pop();
  expect(produtoId).toBeTruthy();

  await page.goto(`/loja/${APELIDO_DO_PAINEL}/produto/${produtoId}`);
  // O produto abre numa janela própria da loja, com o nome dele no título.
  const janela = page.getByRole("dialog", { name: produto });
  await expect(janela).toBeVisible();
  await expect(janela.getByText(/R\$\s19,90/).first()).toBeVisible();
  await expect(
    janela.getByText("Algodão penteado, gola careca."),
  ).toBeVisible();
});
