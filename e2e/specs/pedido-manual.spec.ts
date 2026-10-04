/**
 * Ponta a ponta do pedido manual com grupo obrigatório (T-708: AC-707).
 *
 * O dono atende alguém que não quer se cadastrar: monta o pedido pela tela,
 * tenta pôr o lanche sem escolher o molho e é barrado com a mesma frase da
 * vitrine, escolhe, confirma — e o pedido aparece na fila marcado como balcão.
 */
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

/** Um lanche publicado, numa seção visível, com o grupo obrigatório "Molho". */
async function lancheComMolho(lojaId: string, nome: string): Promise<void> {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error(
      "o ponta a ponta do pedido manual precisa de DATABASE_URL_DIRETA",
    );
  }
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    await cliente.query("BEGIN");
    const umaLinha = async (sql: string, valores: unknown[]) => {
      const { rows } = await cliente.query<{ id: string }>(sql, valores);
      const id = rows[0]?.id;
      if (id === undefined) throw new Error(`não consegui criar: ${sql}`);
      return id;
    };
    const apelido = `e2e-${randomUUID().slice(0, 12)}`;
    const categoriaId = await umaLinha(
      `INSERT INTO app.categories (store_id, name, slug, is_visible, sort_order)
       VALUES ($1, $2, $3, true, 1) RETURNING id`,
      [lojaId, `Lanches ${nome}`, `${apelido}-secao`],
    );
    const produtoId = await umaLinha(
      `INSERT INTO app.products
         (store_id, name, slug, vertical_code, status, is_available,
          display_price_cents, price_min_cents, price_max_cents)
       VALUES ($1, $2, $3, 'APPAREL', 'PUBLISHED', true, 2000, 2000, 2000)
       RETURNING id`,
      [lojaId, nome, apelido],
    );
    await cliente.query(
      `INSERT INTO app.product_categories (store_id, product_id, category_id)
       VALUES ($1, $2, $3)`,
      [lojaId, produtoId, categoriaId],
    );
    const grupoId = await umaLinha(
      `INSERT INTO app.option_groups (store_id, name, min_select, max_select)
       VALUES ($1, 'Molho', 1, 1) RETURNING id`,
      [lojaId],
    );
    for (const [ordem, opcao] of ["Ketchup", "Mostarda"].entries()) {
      await cliente.query(
        `INSERT INTO app.option_items (store_id, group_id, name, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [lojaId, grupoId, opcao, ordem],
      );
    }
    await cliente.query(
      `INSERT INTO app.product_option_groups (store_id, product_id, group_id)
       VALUES ($1, $2, $3)`,
      [lojaId, produtoId, grupoId],
    );
    await cliente.query("COMMIT");
  } catch (causa) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw causa;
  } finally {
    await cliente.end();
  }
}

let lojaId: string;

// Quando este é o primeiro cenário depois de o site subir, a montagem do
// pedido ainda é a primeira de tudo — o balcão lê o catálogo e o detalhe de
// cada produto — e numa máquina carregada o cenário chegou a 28 s dos 30 s
// padrão, com tudo certo na tela. O prazo cobre o cenário inteiro; as esperas
// de cada passo continuam as do Playwright.
test.describe.configure({ timeout: 60_000 });

test.beforeAll(async () => {
  lojaId = (await garantirLojaDoPainel()).id;
});

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

test("@spec:AC-707 o dono lança o pedido de quem não quer cadastro, o grupo obrigatório barra, e o pedido entra na fila como balcão", async ({
  page,
}, info) => {
  const lanche = nomeUnico("X-Burguer", info.project.name);
  const quemPede = nomeUnico("Pedido por telefone", info.project.name);
  await lancheComMolho(lojaId, lanche);

  await page.goto("/painel/pedidos/novo");
  await page.getByLabel("Nome").fill(quemPede);
  await page.getByLabel("Telefone").fill("(11) 96000-1234");

  await page
    .getByLabel("Acrescentar produto")
    .selectOption({ label: `${lanche} — R$ 20,00` });
  await page.getByRole("button", { name: /^Adicionar/ }).click();
  // A mesma frase que a página do produto mostra ao cliente (AC-708).
  await expect(
    page.getByText("Escolha 1 opção em Molho.").first(),
  ).toBeVisible();

  await page.getByLabel("Mostarda").check();
  await page.getByRole("button", { name: /^Adicionar/ }).click();
  await expect(
    page.getByRole("list", { name: "Itens do pedido" }),
  ).toContainText(`${lanche} — Mostarda`);

  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  const lancado = page.getByText(/Pedido #\d+ lançado/);
  await expect(lancado).toBeVisible();
  const numero = (await lancado.textContent())?.match(/#(\d+)/)?.[1];

  await page.goto("/painel/pedidos");
  const cartao = page.getByRole("article", { name: `Pedido número ${numero}` });
  await expect(cartao).toContainText(quemPede);
  await expect(cartao).toContainText("Balcão");
});
