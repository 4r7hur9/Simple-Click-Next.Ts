/**
 * Ponta a ponta da loja do painel pela sessão (T-115, AC-135, AC-136).
 *
 * Três donos de verdade, cada um com vínculo de verdade: Ana (uma loja),
 * Bruno (outra loja) e Marta (duas lojas). O site do ponta a ponta continua
 * com `NEXT_PUBLIC_DEV_STORE_SLUG` apontando para a loja do painel dos outros
 * cenários — e nenhum destes donos é de lá: se o site ainda lesse a variável,
 * cada um veria a loja errada. A sessão é emitida aqui, como nos outros
 * cenários do painel (`fixtures/painel.ts`).
 */
import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext } from "@playwright/test";
import { Client } from "pg";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import { garantirDonoDaLoja, tokenDoDono } from "../fixtures/painel.ts";

/** Uma loja do cenário: apelido, nome, a seção que só ela tem e o dono. */
interface LojaDoCenario {
  readonly apelido: string;
  readonly nome: string;
  readonly secao: string;
}

interface Cenario {
  readonly ana: string;
  readonly bruno: string;
  readonly marta: string;
  readonly daAna: LojaDoCenario;
  readonly doBruno: LojaDoCenario;
  readonly primeiraDaMarta: LojaDoCenario;
  readonly segundaDaMarta: LojaDoCenario;
}

let cenario: Cenario;

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error("o ponta a ponta precisa de DATABASE_URL_DIRETA");
  }
  return new Client({ connectionString: url });
}

/** Cria (ou reaproveita) a loja ativa com uma seção visível só dela. */
async function montarLoja(
  banco: Client,
  apelido: string,
  nome: string,
): Promise<{ readonly id: string; readonly loja: LojaDoCenario }> {
  // Repetível: a mesma execução local pode rodar de novo sobre o mesmo banco.
  const achada = await banco.query<{ id: string }>(
    `SELECT id FROM app.stores WHERE lower(slug) = lower($1) AND deleted_at IS NULL`,
    [apelido],
  );
  const id =
    achada.rows[0]?.id ??
    (
      await banco.query<{ id: string }>(
        `INSERT INTO app.stores (code, name, slug, status, vertical_code)
         VALUES ($1, $2, $3, 'ACTIVE', 'APPAREL')
         RETURNING id`,
        [apelido.toUpperCase(), nome, apelido],
      )
    ).rows[0]?.id;
  if (id === undefined) throw new Error(`não consegui criar a loja ${apelido}`);
  const secao = `Seção de ${nome} ${randomUUID().slice(0, 6)}`;
  await banco.query(
    `INSERT INTO app.categories (store_id, name, slug, is_visible, sort_order)
     VALUES ($1, $2, $3, true, 0)`,
    [id, secao, `secao-${randomUUID().slice(0, 12)}`],
  );
  return { id, loja: { apelido, nome, secao } };
}

/** Põe a sessão do dono no navegador do cenário. */
async function entrarComo(contexto: BrowserContext, dono: string) {
  await contexto.addCookies([
    {
      name: "sc_access",
      value: tokenDoDono(dono),
      url: ENDERECO_DO_SITE,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

test.beforeAll(async () => {
  // Lojas por projeto: os dois projetos do Playwright rodam ao mesmo tempo.
  const sufixo = test.info().project.name;
  const banco = conectar();
  await banco.connect();
  try {
    const a = await montarLoja(
      banco,
      `e2e-sessao-ana-${sufixo}`,
      `Ateliê da Ana ${sufixo}`,
    );
    const b = await montarLoja(
      banco,
      `e2e-sessao-bruno-${sufixo}`,
      `Brechó do Bruno ${sufixo}`,
    );
    const m1 = await montarLoja(
      banco,
      `e2e-sessao-marta1-${sufixo}`,
      `Malhas da Marta ${sufixo}`,
    );
    const m2 = await montarLoja(
      banco,
      `e2e-sessao-marta2-${sufixo}`,
      `Moda da Marta ${sufixo}`,
    );
    const ana = await garantirDonoDaLoja(
      banco,
      a.id,
      `ana-${sufixo}@e2e-sessao.test`,
    );
    const bruno = await garantirDonoDaLoja(
      banco,
      b.id,
      `bruno-${sufixo}@e2e-sessao.test`,
    );
    const marta = await garantirDonoDaLoja(
      banco,
      m1.id,
      `marta-${sufixo}@e2e-sessao.test`,
    );
    await garantirDonoDaLoja(banco, m2.id, `marta-${sufixo}@e2e-sessao.test`);
    cenario = {
      ana,
      bruno,
      marta,
      daAna: a.loja,
      doBruno: b.loja,
      primeiraDaMarta: m1.loja,
      segundaDaMarta: m2.loja,
    };
  } finally {
    await banco.end();
  }
});

test("@spec:AC-135 dois donos de lojas diferentes, cada um vê só a própria loja no painel", async ({
  browser,
}) => {
  for (const [dono, propria, alheia] of [
    [cenario.ana, cenario.daAna, cenario.doBruno],
    [cenario.bruno, cenario.doBruno, cenario.daAna],
  ] as const) {
    const contexto = await browser.newContext({ baseURL: ENDERECO_DO_SITE });
    await entrarComo(contexto, dono);
    const pagina = await contexto.newPage();

    await pagina.goto("/painel/categorias");
    await expect(pagina).toHaveURL(/\/painel\/categorias$/);
    await expect(pagina.getByText(`Loja: ${propria.nome}`)).toBeVisible();
    await expect(pagina.getByText(propria.secao)).toBeVisible({
      timeout: 30_000,
    });
    await expect(pagina.getByText(alheia.secao)).toHaveCount(0);
    await expect(
      pagina.getByRole("link", { name: "Ver minha loja" }),
    ).toHaveAttribute("href", `/loja/${propria.apelido}`);
    // Uma loja só: não há o que trocar.
    await expect(
      pagina.getByRole("link", { name: "Trocar de loja" }),
    ).toHaveCount(0);
    await contexto.close();
  }
});

test("@spec:AC-136 dona de duas lojas escolhe, troca, e escolha alheia ou vencida volta para a escolha", async ({
  page,
  context,
}) => {
  await entrarComo(context, cenario.marta);

  // Sem escolha: o painel pede a loja antes de abrir.
  await page.goto("/painel/categorias");
  await expect(page).toHaveURL(/\/escolher-loja$/);
  await page
    .getByRole("button", { name: `Abrir ${cenario.segundaDaMarta.nome}` })
    .click();
  await expect(page).toHaveURL(/\/painel$/);

  const cookie = (await context.cookies()).find((c) => c.name === "sc_loja");
  expect(cookie?.value).toBe(cenario.segundaDaMarta.apelido);
  expect(cookie?.httpOnly).toBe(true);

  await page.goto("/painel/categorias");
  await expect(page.getByText(cenario.segundaDaMarta.secao)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(cenario.primeiraDaMarta.secao)).toHaveCount(0);

  // Trocar de loja pelo painel.
  await page.getByRole("link", { name: "Trocar de loja" }).click();
  await expect(page).toHaveURL(/\/escolher-loja$/);
  await page
    .getByRole("button", { name: `Abrir ${cenario.primeiraDaMarta.nome}` })
    .click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.goto("/painel/categorias");
  await expect(page.getByText(cenario.primeiraDaMarta.secao)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(cenario.segundaDaMarta.secao)).toHaveCount(0);

  // Cookie com a loja de outra pessoa: não abre nada; o site pede a escolha.
  await context.clearCookies({ name: "sc_loja" });
  await context.addCookies([
    {
      name: "sc_loja",
      value: cenario.doBruno.apelido,
      url: ENDERECO_DO_SITE,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/painel/categorias");
  await expect(page).toHaveURL(/\/escolher-loja$/);
  await expect(
    page.getByText("A loja escolhida antes não abre mais"),
  ).toBeVisible();
  const resposta = await page.request.get("/api/catalogo/categorias");
  expect(resposta.status()).toBe(409);
});
