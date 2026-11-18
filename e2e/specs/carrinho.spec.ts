/**
 * O carrinho, do produto até a gaveta (AC-500, AC-502).
 *
 * O QUE SÓ ESTE CENÁRIO PROVA: a costura entre o navegador e a API. O item vai
 * ao carrinho por uma chamada que sai do NAVEGADOR, carregando um cookie que a
 * API emitiu em outro endereço — e é isso que nenhum teste de unidade alcança.
 * Cada metade estava provada; a junção nunca tinha rodado (dívida 68).
 */
import { expect, test } from "@playwright/test";

import { garantirLojaDeTeste, PRODUTO } from "../fixtures/loja-de-teste.ts";

/**
 * A sacola do redesign (card #110): coluna lateral a partir de 1280px, janela
 * nas larguras menores. `/carrinho` abre a sacola sobre o catálogo — e as
 * conferências olham só para ela, não para a grade, que também traz o nome.
 */
const SACOLA = "aside.sc-sacola-coluna, dialog[open]:has(#titulo-do-carrinho)";

let loja: Awaited<ReturnType<typeof garantirLojaDeTeste>>;

test.beforeAll(async () => {
  loja = await garantirLojaDeTeste();
});

test("@spec:AC-500 o item vai ao carrinho e sobrevive ao recarregar", async ({
  page,
}) => {
  await page.goto(`/loja/${loja.apelido}/produto/${loja.produtoId}`);
  // O detalhe abre como janela sobre o catálogo (card #109): o nome do
  // produto é o título da janela; o h1 da página é o do catálogo.
  await expect(
    page
      .locator("dialog.sc-janela-produto[open]")
      .getByRole("heading", { name: PRODUTO.nome }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Adicionar à sacola/ }).click();
  await expect(page.getByText(/Adicionado à sacola/).first()).toBeVisible();

  // RECARREGAR É O PONTO. O carrinho vive no servidor, achado pelo cookie —
  // não em memória do navegador, que some ao fechar a aba.
  await page.goto(`/loja/${loja.apelido}/carrinho`);

  const sacola = page.locator(SACOLA);
  await expect(sacola.getByText(PRODUTO.nome)).toBeVisible();
  await expect(sacola.getByText("R$ 12,00").first()).toBeVisible();
});

test("@spec:AC-502 outra sessão não enxerga o carrinho da primeira", async ({
  browser,
}) => {
  // É a falha que a migração 0012 corrigiu, agora provada de ponta a ponta:
  // antes dela, todo visitante via o carrinho de todos os outros da loja.
  const primeira = await browser.newContext();
  const paginaUm = await primeira.newPage();
  await paginaUm.goto(`/loja/${loja.apelido}/produto/${loja.produtoId}`);
  await paginaUm.getByRole("button", { name: /Adicionar à sacola/ }).click();
  await expect(paginaUm.getByText(/Adicionado à sacola/).first()).toBeVisible();

  // Contexto novo é navegador novo: cookie nenhum, sessão nenhuma.
  const segunda = await browser.newContext();
  const paginaDois = await segunda.newPage();
  await paginaDois.goto(`/loja/${loja.apelido}/carrinho`);

  await expect(paginaDois.getByText("sacola está vazia")).toBeVisible();

  await primeira.close();
  await segunda.close();
});
