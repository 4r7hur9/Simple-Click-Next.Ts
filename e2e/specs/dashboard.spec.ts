/**
 * Ponta a ponta das métricas do painel (T-809: AC-800, AC-803, AC-806, AC-807,
 * AC-815).
 *
 * O dono abre o painel do dia, troca para três e sete dias, escolhe um
 * intervalo a dedo, recarrega e abre o link em outra aba, e baixa a planilha
 * do período — pelas telas de verdade, contra a API e o banco. Cada pedaço já
 * tem prova própria na API e na tela; aqui o caminho inteiro roda junto.
 *
 * OS PEDIDOS SÃO GRAVADOS NO BANCO, em instantes escolhidos: hoje, anteontem
 * e cinco dias atrás. É isso que separa os períodos — o produto de anteontem
 * aparece em três dias e não em hoje; o de cinco dias, só em sete dias. Os
 * nomes dos produtos são únicos por projeto do Playwright: os dois projetos
 * rodam ao mesmo tempo contra a mesma loja, então o cenário confere os SEUS
 * produtos, e não totais que o outro projeto também mexe.
 */
import { expect, test, type Page } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  criarPedidoAceito,
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

/** O fuso da loja do painel (o padrão de `app.stores.timezone`). */
const FUSO_DA_LOJA = "America/Sao_Paulo";

const UM_DIA_MS = 24 * 60 * 60 * 1_000;

/** A data civil (AAAA-MM-DD) de um instante, no fuso da loja. */
function dataNaLoja(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_DA_LOJA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

interface ProdutosDoCenario {
  /** Vendido hoje: muitas unidades, pouco valor. */
  readonly muitasUnidades: string;
  /** Vendido hoje: poucas unidades, muito valor. */
  readonly muitoValor: string;
  /** Vendido anteontem: fora de hoje, dentro de três dias. */
  readonly anteontem: string;
  /** Vendido há cinco dias: só em sete dias e no intervalo daquele dia. */
  readonly cincoDias: string;
}

const produtosPorProjeto = new Map<string, ProdutosDoCenario>();
let cincoDiasAtras: Date;

// UM TRABALHADOR POR PROJETO, em série. Com os cenários espalhados, cada
// trabalhador rodaria a montagem de novo e gravaria mais pedidos: a lista dos
// mais vendidos tem dez lugares, e os produtos de anteontem e de cinco dias,
// que vendem pouco, chegaram a sair dela com as cópias dos outros
// trabalhadores. O prazo cobre várias trocas de período, cada uma com a sua
// leitura, e o primeiro cenário depois de o site subir.
test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeAll(async () => {
  const { id: lojaId } = await garantirLojaDoPainel();
  const projeto = test.info().project.name;
  const produtos: ProdutosDoCenario = {
    muitasUnidades: nomeUnico("Pastel de feira", projeto),
    muitoValor: nomeUnico("Bandeja família", projeto),
    anteontem: nomeUnico("Caldo de cana", projeto),
    cincoDias: nomeUnico("Coxinha", projeto),
  };
  produtosPorProjeto.set(projeto, produtos);

  const agora = Date.now();
  cincoDiasAtras = new Date(agora - 5 * UM_DIA_MS);
  await criarPedidoAceito(lojaId, new Date(agora - 5_000), [
    { nome: produtos.muitasUnidades, quantidade: 9, totalCentavos: 4_500 },
    { nome: produtos.muitoValor, quantidade: 2, totalCentavos: 18_000 },
  ]);
  await criarPedidoAceito(lojaId, new Date(agora - 2 * UM_DIA_MS), [
    { nome: produtos.anteontem, quantidade: 3, totalCentavos: 2_400 },
  ]);
  await criarPedidoAceito(lojaId, cincoDiasAtras, [
    { nome: produtos.cincoDias, quantidade: 4, totalCentavos: 3_200 },
  ]);
});

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

function produtosDe(projeto: string): ProdutosDoCenario {
  const produtos = produtosPorProjeto.get(projeto);
  if (produtos === undefined) throw new Error("cenário sem produtos");
  return produtos;
}

/** O produto, na lista dos mais vendidos da tela. */
function noRanking(pagina: Page, nome: string) {
  return pagina.locator(
    `[data-ranking-produtos] li[data-produto="${nome.replaceAll('"', '\\"')}"]`,
  );
}

/**
 * Prazo da primeira leitura de uma página: a primeira consulta de métricas
 * depois de a API subir passou dos 5 s padrão numa máquina carregada, com a
 * tela certa logo depois.
 */
const PRIMEIRA_LEITURA = { timeout: 20_000 } as const;

/** Espera os números do período terminarem de chegar. */
async function esperarNumeros(pagina: Page): Promise<void> {
  await expect(
    pagina.locator('[data-estado="sucesso"], [data-estado="vazio"]'),
  ).toBeVisible(PRIMEIRA_LEITURA);
}

test("@spec:AC-800 o painel abre com os números de hoje e os produtos vendidos hoje", async ({
  page,
}, info) => {
  const produtos = produtosDe(info.project.name);

  await page.goto("/painel");
  await expect(
    page.getByRole("heading", { level: 1, name: "Hoje na sua loja" }),
  ).toBeVisible();
  await expect(page.locator('[data-estado="sucesso"]')).toBeVisible(
    PRIMEIRA_LEITURA,
  );

  // Os quatro números do dia, com valor de verdade (a loja vendeu hoje).
  for (const metrica of ["vendido", "pedidos", "ticket-medio", "em-aberto"]) {
    await expect(
      page.locator(`[data-metrica="${metrica}"] [data-valor]`).first(),
    ).not.toBeEmpty();
  }
  await expect(
    page.locator('[data-metrica="pedidos"] [data-valor]'),
  ).not.toHaveText("0");
  await expect(
    page.locator('[data-metrica="vendido"] [data-valor]').first(),
  ).not.toHaveText(/R\$\s*0,00/);

  // O período em vigor é hoje, no fuso da loja.
  const hoje = dataNaLoja(new Date());
  await expect(
    page.locator(`[data-periodo-em-vigor] time[datetime="${hoje}"]`),
  ).toBeVisible();

  // O que foi vendido hoje está na lista; o de anteontem, não.
  await expect(noRanking(page, produtos.muitasUnidades)).toBeVisible();
  await expect(noRanking(page, produtos.muitoValor)).toBeVisible();
  await expect(noRanking(page, produtos.anteontem)).toHaveCount(0);
});

test("@spec:AC-803 @spec:AC-807 hoje, três e sete dias recalculam a lista, e ela alterna entre quantidade e valor", async ({
  page,
}, info) => {
  const produtos = produtosDe(info.project.name);

  await page.goto("/painel/metricas");
  await esperarNumeros(page);
  const hoje = page.getByRole("button", { name: "Hoje", exact: true });
  await expect(hoje).toHaveAttribute("aria-pressed", "true");
  await expect(noRanking(page, produtos.muitasUnidades)).toBeVisible();
  await expect(noRanking(page, produtos.anteontem)).toHaveCount(0);

  // Ordenada por quantidade: as nove unidades vêm antes das duas bandejas.
  const ranking = page.locator("[data-ranking-produtos]");
  await expect(ranking).toHaveAttribute("data-ordem", "quantidade");
  const ordemDosMeus = async (): Promise<string[]> =>
    (
      await ranking
        .locator("li[data-produto]")
        .evaluateAll((itens) =>
          itens.map((item) => item.getAttribute("data-produto") ?? ""),
        )
    ).filter(
      (nome) =>
        nome === produtos.muitasUnidades || nome === produtos.muitoValor,
    );
  expect(await ordemDosMeus()).toEqual([
    produtos.muitasUnidades,
    produtos.muitoValor,
  ]);
  await expect(
    noRanking(page, produtos.muitasUnidades).locator("[data-quantidade]"),
  ).toContainText("9");
  await expect(
    noRanking(page, produtos.muitoValor).locator("[data-valor]"),
  ).toContainText("180,00");

  // Ordenada por valor: a bandeja passa à frente (AC-807).
  await ranking.locator('[data-medida="valor"]').click();
  await expect(ranking).toHaveAttribute("data-ordem", "valor");
  await expect(ranking.locator('[data-medida="valor"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await ordemDosMeus()).toEqual([
    produtos.muitoValor,
    produtos.muitasUnidades,
  ]);

  // Três dias: entra o de anteontem, o de cinco dias ainda não (AC-803).
  await page.getByRole("button", { name: "Últimos 3 dias" }).click();
  await expect(page).toHaveURL(/[?&]periodo=3d(&|$)/);
  await expect(
    page.getByRole("button", { name: "Últimos 3 dias" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(noRanking(page, produtos.anteontem)).toBeVisible();
  await expect(noRanking(page, produtos.cincoDias)).toHaveCount(0);
  const tresDias = page.locator("[data-periodo-em-vigor] time");
  await expect(tresDias).toHaveCount(2);
  await expect(tresDias.first()).toHaveAttribute(
    "datetime",
    dataNaLoja(new Date(Date.now() - 2 * UM_DIA_MS)),
  );
  await expect(tresDias.last()).toHaveAttribute(
    "datetime",
    dataNaLoja(new Date()),
  );

  // Sete dias: entra o de cinco dias, e a evolução por dia aparece.
  await page.getByRole("button", { name: "Últimos 7 dias" }).click();
  await expect(page).toHaveURL(/[?&]periodo=7d(&|$)/);
  await expect(noRanking(page, produtos.cincoDias)).toBeVisible();
  await expect(noRanking(page, produtos.anteontem)).toBeVisible();
  await expect(
    page.locator("[data-periodo-em-vigor] time").first(),
  ).toHaveAttribute(
    "datetime",
    dataNaLoja(new Date(Date.now() - 6 * UM_DIA_MS)),
  );

  // E de volta a hoje: o de anteontem sai da lista.
  await hoje.click();
  await expect(page).toHaveURL(/[?&]periodo=hoje(&|$)/);
  await expect(noRanking(page, produtos.muitasUnidades)).toBeVisible();
  await expect(noRanking(page, produtos.anteontem)).toHaveCount(0);
});

test("@spec:AC-806 @spec:AC-815 o intervalo escolhido fica no endereço, sobrevive ao recarregar e à outra aba, e a planilha é dele", async ({
  page,
  context,
}, info) => {
  const produtos = produtosDe(info.project.name);
  const dia = dataNaLoja(cincoDiasAtras);

  await page.goto("/painel/metricas");
  await esperarNumeros(page);

  await page.getByLabel("De", { exact: true }).fill(dia);
  await page.getByLabel("Até", { exact: true }).fill(dia);
  await page.getByRole("button", { name: "Aplicar datas" }).click();

  const esperado = new RegExp(
    `[?&]periodo=personalizado&de=${dia}&ate=${dia}(&|$)`,
  );
  await expect(page).toHaveURL(esperado);
  const umDiaSo = async (pagina: Page): Promise<void> => {
    await esperarNumeros(pagina);
    await expect(
      pagina.locator(`[data-periodo-em-vigor] time[datetime="${dia}"]`),
    ).toBeVisible();
    await expect(noRanking(pagina, produtos.cincoDias)).toBeVisible();
    await expect(noRanking(pagina, produtos.muitasUnidades)).toHaveCount(0);
  };
  await umDiaSo(page);

  // Recarregar mantém o intervalo: ele mora no endereço.
  await page.reload();
  await expect(page).toHaveURL(esperado);
  await umDiaSo(page);

  // O link copiado, aberto em outra aba, abre o mesmo recorte.
  const outraAba = await context.newPage();
  await outraAba.goto(page.url());
  await umDiaSo(outraAba);
  await outraAba.close();

  // A planilha baixada é do intervalo que está na tela.
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar planilha do período" })
    .click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toBe(
    `pedidos-e2e-painel-${dia}-a-${dia}.csv`,
  );
  await expect(page.locator("[data-exportar] [role=status]")).toContainText(
    `Planilha pedidos-e2e-painel-${dia}-a-${dia}.csv baixada`,
  );
});
