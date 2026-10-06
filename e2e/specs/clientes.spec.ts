/**
 * Ponta a ponta dos clientes da loja (T-708: AC-703, AC-707, AC-711).
 *
 * O dono cadastra o cliente que ligou, lança um pedido para ele pela ficha,
 * vê o pedido no histórico e repete esse pedido — tudo pelas telas de verdade,
 * num navegador de verdade, contra a API e o banco. Cada pedaço já tem prova
 * própria contra o banco e na tela; aqui o caminho inteiro é percorrido junto.
 *
 * O produto com grupo obrigatório é criado direto no banco: a tela de grupos
 * tem ponta a ponta próprio, e montá-la aqui triplicaria o cenário sem provar
 * nada novo sobre clientes.
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

/** Um telefone celular que não se repete entre execuções. */
function telefoneUnico(): string {
  const assinante = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
  return `(11) 9${assinante.slice(0, 4)}-${assinante.slice(4)}`;
}

/** Um lanche publicado, numa seção visível, com o grupo obrigatório "Molho". */
async function lancheComMolho(lojaId: string, nome: string): Promise<void> {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error(
      "o ponta a ponta de clientes precisa de DATABASE_URL_DIRETA",
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

// O CAMINHO INTEIRO É LONGO, e de propósito: cadastro, busca, ficha, pedido,
// histórico, repetição e segunda confirmação — dez telas em sequência. No
// primeiro cenário depois de o site subir, cada tela ainda é a primeira, e numa
// máquina carregada isso passou dos 30 s padrão já na última confirmação, com
// tudo certo na tela. O prazo cobre o cenário inteiro; as esperas de cada passo
// continuam as do Playwright.
test.describe.configure({ timeout: 60_000 });

test.beforeAll(async () => {
  lojaId = (await garantirLojaDoPainel()).id;
});

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

test("@spec:AC-703 @spec:AC-707 @spec:AC-711 o dono cadastra o cliente, lança o pedido pela ficha, vê o histórico e repete o pedido", async ({
  page,
}, info) => {
  const nome = nomeUnico("Cliente do Balcão", info.project.name);
  const telefone = telefoneUnico();
  const lanche = nomeUnico("X-Salada", info.project.name);
  await lancheComMolho(lojaId, lanche);

  // Cadastro: nome e telefone bastam (AC-703).
  await page.goto("/painel/clientes");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  const cadastro = page.getByRole("form", { name: "Novo cliente" });
  await cadastro.getByLabel("Nome").fill(nome);
  await cadastro.getByLabel("Telefone").fill(telefone);
  await cadastro.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/painel\/clientes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nome);
  const ficha = page.url();

  // A busca por parte do telefone, com outra pontuação, acha o cliente.
  await page.goto("/painel/clientes");
  await page
    .getByLabel("Buscar por nome ou telefone")
    .fill(telefone.replace(/\D/g, "").slice(2, 9));
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("link", { name: nome })).toBeVisible();

  // Pedido pela ficha, com o grupo obrigatório escolhido (AC-707).
  await page.goto(ficha);
  await page.getByRole("link", { name: `Novo pedido para ${nome}` }).click();
  await expect(page.getByText(`Pedido para ${nome}`)).toBeVisible();
  await page
    .getByLabel("Acrescentar produto")
    .selectOption({ label: `${lanche} — R$ 20,00` });
  await page.getByLabel("Ketchup").check();
  await page.getByRole("button", { name: /^Adicionar/ }).click();
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  const lancado = page.getByText(/Pedido #\d+ lançado/);
  await expect(lancado).toBeVisible();
  const numero = (await lancado.textContent())?.match(/#(\d+)/)?.[1];
  expect(numero).toBeTruthy();

  // O histórico da ficha mostra o pedido (AC-711).
  await page.goto(ficha);
  await expect(
    page.getByRole("link", { name: `Pedido #${numero}` }),
  ).toBeVisible();

  // Repetir monta o pedido novo pronto, e ele é lançado com número próprio.
  await page.getByRole("link", { name: "Repetir pedido" }).first().click();
  await expect(
    page.getByRole("list", { name: "Itens do pedido" }),
  ).toContainText(`${lanche} — Ketchup`);
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await expect(page.getByText(/Pedido #\d+ lançado/)).toBeVisible();
  await expect(page.getByText(`Pedido #${numero} lançado`)).toHaveCount(0);
});
