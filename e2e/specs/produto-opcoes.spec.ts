/**
 * Ponta a ponta dos grupos de escolha (T-313, AC-313).
 *
 * O dono cria, pelo painel, um grupo de escolha única obrigatória com um
 * acréscimo; o cliente, na vitrine, não consegue adicionar sem escolher, e ao
 * escolher vê o acréscimo somado antes de levar ao carrinho.
 */
import { expect, test } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  APELIDO_DO_PAINEL,
  criarProdutoSimples,
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";
import { prepararContaParaATela } from "../fixtures/redesign-lojas.ts";
import { jaEscolheuOsCookies } from "../fixtures/redesign.ts";

let lojaId: string;

test.beforeAll(async () => {
  const loja = await garantirLojaDoPainel();
  lojaId = loja.id;
  // Aviso de cookies, novo aceite e tutorial do dono abririam por cima do
  // formulário (cada um tem prova própria).
  await prepararContaParaATela(loja.donoId, "dono");
});

test.beforeEach(async ({ context }) => {
  await jaEscolheuOsCookies(context, ENDERECO_DO_SITE);
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

test("@spec:AC-313 o grupo obrigatório criado pelo dono impede adicionar sem escolha, e o acréscimo entra no total", async ({
  page,
}, info) => {
  const nome = nomeUnico("Camiseta Estampada", info.project.name);
  const produtoId = await criarProdutoSimples(lojaId, nome, 3_000);

  await page.goto(`/painel/produtos/${produtoId}/opcoes`);
  await expect(
    page.getByRole("status").filter({ hasText: "Crie o primeiro grupo" }),
  ).toBeVisible();

  // Rótulos do formulário do painel novo (card #112).
  await page.getByRole("textbox", { name: "Nome do grupo" }).fill("Estampa");
  // "Tipo do grupo" virou o seletor do pacote (lista própria, não <select>).
  const tipo = page.getByRole("combobox", { name: /^Tipo do grupo/ });
  await tipo.click();
  await page.getByRole("option", { name: "Adicional" }).click();
  await expect(tipo).toContainText("Adicional");
  await page.getByRole("spinbutton", { name: "Mínimo de escolhas" }).fill("1");
  await page
    .getByRole("spinbutton", { name: "Máximo de escolhas (opcional)" })
    .fill("1");
  await page.getByRole("button", { name: "Criar grupo" }).click();

  const grupo = page.getByRole("article").filter({ hasText: "Estampa" });
  await expect(grupo).toContainText("Obrigatório: escolher ao menos 1");

  for (const [opcao, acrescimo] of [
    ["Lisa", "0"],
    // Ponto decimal: "2.50" é R$ 2,50, e não R$ 250 (AC-311).
    ["Listrada", "2.50"],
  ] as const) {
    await grupo.getByRole("textbox", { name: "Nome da opção" }).fill(opcao);
    await grupo
      .getByRole("textbox", { name: /Acréscimo no preço/ })
      .or(grupo.getByRole("spinbutton", { name: /Acréscimo no preço/ }))
      .fill(acrescimo);
    await grupo.getByRole("button", { name: "Adicionar opção" }).click();
    await expect(grupo).toContainText(opcao);
  }
  // O painel novo escreve o acréscimo com sinal: "Listrada · + R$ 2,50".
  await expect(grupo).toContainText(/Listrada · \+ R\$\s2,50/);

  // A vitrine: sem escolher, o item não vai; escolhendo, o total já soma.
  await page.goto(`/loja/${APELIDO_DO_PAINEL}/produto/${produtoId}`);
  // O detalhe abre como janela sobre o catálogo (card #109): o nome é o
  // título da janela, e o h1 da página é o do catálogo.
  await expect(
    page
      .locator("dialog.sc-janela-produto[open]")
      .getByRole("heading", { name: nome }),
  ).toBeVisible();

  const adicionar = page.getByRole("button", { name: /Adicionar à sacola/ });
  await adicionar.click();
  await expect(page.locator(".sc-produto__grupo--pendente")).toContainText(
    "Estampa",
  );
  await expect(page.getByText(/Adicionado à sacola/)).toHaveCount(0);

  await page.getByRole("radio", { name: /Listrada/ }).check();
  await expect(adicionar).toContainText(/R\$\s32,50/);
  await adicionar.click();
  await expect(page.getByText(/Adicionado à sacola/).first()).toBeVisible();
});
