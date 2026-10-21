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

let lojaId: string;

test.beforeAll(async () => {
  ({ id: lojaId } = await garantirLojaDoPainel());
});

test.beforeEach(async ({ context }) => {
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

  await page.getByLabel("Nome", { exact: true }).fill("Estampa");
  await page.getByLabel(/^Tipo/).selectOption("ADDON");
  await page.getByLabel("Mínimo").fill("1");
  await page.getByLabel("Máximo (opcional)").fill("1");
  await page.getByRole("button", { name: "Criar grupo" }).click();

  const grupo = page.getByRole("article").filter({ hasText: "Estampa" });
  await expect(grupo).toContainText("Obrigatório: 1");

  for (const [opcao, acrescimo] of [
    ["Lisa", "0"],
    // Ponto decimal: "2.50" é R$ 2,50, e não R$ 250 (AC-311).
    ["Listrada", "2.50"],
  ] as const) {
    await grupo.getByPlaceholder("Nova opção").fill(opcao);
    await grupo.getByPlaceholder("Acréscimo R$").fill(acrescimo);
    await grupo.getByRole("button", { name: "Adicionar" }).click();
    await expect(grupo).toContainText(opcao);
  }
  await expect(grupo).toContainText(/Listrada · R\$\s2,50/);

  // A vitrine: sem escolher, o item não vai; escolhendo, o total já soma.
  await page.goto(`/loja/${APELIDO_DO_PAINEL}/produto/${produtoId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nome);

  const adicionar = page.getByRole("button", { name: /Adicionar/ });
  await adicionar.click();
  await expect(page.locator(".sc-produto__grupo--pendente")).toContainText(
    "Estampa",
  );
  await expect(page.getByText("Adicionado ao carrinho")).toHaveCount(0);

  await page.getByRole("radio", { name: /Listrada/ }).check();
  await expect(adicionar).toContainText(/R\$\s32,50/);
  await adicionar.click();
  await expect(page.getByText("Adicionado ao carrinho")).toBeVisible();
});
