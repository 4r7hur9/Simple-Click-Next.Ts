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

let loja: Awaited<ReturnType<typeof garantirLojaDeTeste>>;

test.beforeAll(async () => {
  loja = await garantirLojaDeTeste();
});

test("@spec:AC-500 o item vai ao carrinho e sobrevive ao recarregar", async ({
  page,
}) => {
  await page.goto(`/l/${loja.apelido}/produto/${loja.produtoId}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    PRODUTO.nome,
  );

  await page.getByRole("button", { name: /Adicionar/ }).click();
  await expect(page.getByText("Adicionado ao carrinho")).toBeVisible();

  // RECARREGAR É O PONTO. O carrinho vive no servidor, achado pelo cookie —
  // não em memória do navegador, que some ao fechar a aba.
  await page.goto(`/l/${loja.apelido}/checkout`);

  await expect(page.getByText(PRODUTO.nome)).toBeVisible();
  await expect(page.getByText("R$ 12,00").first()).toBeVisible();
});

test("@spec:AC-502 outra sessão não enxerga o carrinho da primeira", async ({
  browser,
}) => {
  // É a falha que a migração 0012 corrigiu, agora provada de ponta a ponta:
  // antes dela, todo visitante via o carrinho de todos os outros da loja.
  const primeira = await browser.newContext();
  const paginaUm = await primeira.newPage();
  await paginaUm.goto(`/l/${loja.apelido}/produto/${loja.produtoId}`);
  await paginaUm.getByRole("button", { name: /Adicionar/ }).click();
  await expect(paginaUm.getByText("Adicionado ao carrinho")).toBeVisible();

  // Contexto novo é navegador novo: cookie nenhum, sessão nenhuma.
  const segunda = await browser.newContext();
  const paginaDois = await segunda.newPage();
  await paginaDois.goto(`/l/${loja.apelido}/checkout`);

  await expect(paginaDois.getByText("carrinho está vazio")).toBeVisible();

  await primeira.close();
  await segunda.close();
});
