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
  // Quem não quer cadastro é "Cliente novo": basta nome e telefone.
  await page.getByRole("button", { name: "Cliente novo" }).click();
  await page.getByLabel("Nome de quem pede").fill(quemPede);
  // Telefone novo a cada execução: com o mesmo telefone o sistema reaproveita
  // a ficha do primeiro cliente e o pedido sairia no nome dele, não no daqui.
  const fim = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  await page
    .getByLabel("Telefone com DDD")
    .fill(`(11) 9${fim.slice(0, 4)}-${fim.slice(4)}`);

  // O produto vem do seletor do pacote (lista própria, não <select>).
  await page
    .getByRole("combobox", { name: "Adicionar produto ao pedido" })
    .click();
  await page.getByRole("option", { name: `${lanche} — R$ 20,00` }).click();
  await page.getByRole("button", { name: /^Adicionar/ }).click();
  // A mesma frase que a página do produto mostra ao cliente (AC-708): sem a
  // opção obrigatória o item não entra no pedido.
  await expect(
    page.getByText("Escolha 1 opção em Molho.").first(),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Itens do pedido" })).toHaveCount(
    0,
  );

  await page.getByLabel("Mostarda").check();
  await page.getByRole("button", { name: /^Adicionar/ }).click();
  await expect(
    page.getByRole("list", { name: "Itens do pedido" }),
  ).toContainText(`${lanche} — Mostarda`);

  // No celular o aviso de cookies cobre o fim do formulário e o clique no
  // botão de baixo não chega. A pessoa o dispensa antes de confirmar; o teste
  // faz o mesmo (só os essenciais, que é a escolha que não grava nada a mais).
  const recusar = page.getByRole("button", { name: "Recusar não essenciais" });
  if (await recusar.isVisible()) await recusar.click();
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  const lancado = page.getByText(/Pedido [A-Z]-\d{4} lançado/);
  await expect(lancado).toBeVisible();
  const codigo = (await lancado.textContent())?.match(/[A-Z]-\d{4}/)?.[0];

  await page.goto("/painel/pedidos");
  const cartao = page.getByRole("article", {
    name: `Pedido ${codigo}`,
  });
  // O quadro mostra só os primeiros cartões de cada coluna e guarda o resto
  // atrás de "Mostrar mais" ou "Mostrar os outros N". Num dia com muitos pedidos o novo (o mais recente,
  // no fim da coluna) fica escondido até a pessoa abrir a lista.
  await expect(
    page.getByRole("region", { name: "Pedidos em Pedido gerado" }),
  ).toBeVisible();
  const mostrarMais = page.getByRole("button", {
    name: /^Mostrar (mais|os outros)/,
  });
  for (let volta = 0; volta < 20; volta += 1) {
    if (await cartao.isVisible()) break;
    if (!(await mostrarMais.first().isVisible())) break;
    await mostrarMais.first().click();
  }
  // O quadro lê os pedidos do dia pela API ao abrir; na primeira carga depois
  // de o site subir ele passa dos 5 s padrão sem nada errado.
  await expect(cartao).toContainText(quemPede, { timeout: 20_000 });
  await expect(cartao).toContainText("Balcão");
});
