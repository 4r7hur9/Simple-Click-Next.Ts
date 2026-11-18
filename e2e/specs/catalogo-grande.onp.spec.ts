/**
 * Catálogo grande continua rápido e estável (card #114: AC-11418, AC-11419).
 *
 * LOJA PRÓPRIA com 1.000 produtos (`fixtures/catalogo-grande.ts`), nunca a
 * loja compartilhada. O QUE REPROVA é só o determinístico (decisão do usuário,
 * 17/11): a página não desenha os 1.000 cartões de uma vez, o deslocamento de
 * layout fica abaixo de 0,1, e busca e categoria devolvem só o que casa. Os
 * TEMPOS (2,5 s para os primeiros produtos, 200 ms para busca e filtro) são
 * medidos 5 vezes e a MEDIANA vai anexada ao relatório do Playwright — numa
 * máquina dividida entre vários processos, tempo reprovaria por carga, não por
 * código. Só se comparam números da mesma máquina.
 *
 * Projeto `celular`: 390px sob rede móvel emulada (mesma da prova antiga de
 * desempenho), abrindo o catálogo. Projeto `publico`: 1280px, busca e troca
 * de categoria.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  APELIDO_DO_CATALOGO_GRANDE,
  PRODUTOS_DO_CATALOGO_GRANDE,
  garantirCatalogoGrande,
} from "../fixtures/catalogo-grande.ts";
import {
  ehCelular,
  jaEscolheuOsCookies,
  mediana,
  origemDoSite,
} from "../fixtures/redesign.ts";

const CATALOGO = `/loja/${APELIDO_DO_CATALOGO_GRANDE}/cardapio`;
const REPETICOES = 5;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await garantirCatalogoGrande();
});

/** Rede móvel comum (3G), a mesma de `desempenho-vitrine.spec.ts`. */
async function redeMovel(
  contexto: BrowserContext,
  pagina: Page,
): Promise<void> {
  const devtools = await contexto.newCDPSession(pagina);
  await devtools.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1_600 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    connectionType: "cellular3g",
  });
}

/** Soma do deslocamento de layout desde a abertura da página. */
async function observarDeslocamento(pagina: Page): Promise<void> {
  await pagina.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries() as unknown as Array<{
        value: number;
        hadRecentInput: boolean;
      }>) {
        if (!e.hadRecentInput) w.__cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

const cartoes = (pagina: Page) => pagina.locator("main a.sc-vitrine__link");

test("[CA-32] @spec:AC-11418 o catálogo de 1.000 produtos abre sem desenhar tudo e sem pular", async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const celular = ehCelular(info);
  const tempos: number[] = [];
  const deslocamentos: number[] = [];
  let desenhados = 0;

  for (let vez = 0; vez < REPETICOES; vez += 1) {
    const contexto = await browser.newContext({
      baseURL: origemDoSite(info),
      viewport: celular
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 },
    });
    try {
      await jaEscolheuOsCookies(contexto, origemDoSite(info));
      const pagina = await contexto.newPage();
      if (celular) await redeMovel(contexto, pagina);
      await observarDeslocamento(pagina);
      const inicio = Date.now();
      await pagina.goto(CATALOGO, { waitUntil: "commit" });
      await expect(cartoes(pagina).first()).toBeVisible({ timeout: 60_000 });
      tempos.push(Date.now() - inicio);
      await pagina.waitForLoadState("networkidle").catch(() => undefined);
      await pagina.evaluate(() => document.fonts.ready.then(() => undefined));
      deslocamentos.push(
        await pagina.evaluate(
          () => (window as unknown as { __cls: number }).__cls,
        ),
      );
      desenhados = Math.max(desenhados, await cartoes(pagina).count());
    } finally {
      await contexto.close();
    }
  }

  await info.attach("medidas-abertura.json", {
    contentType: "application/json",
    body: JSON.stringify(
      {
        largura: celular ? 390 : 1280,
        rede: celular ? "3G emulada" : "local",
        primeirosProdutosMs: tempos,
        medianaMs: mediana(tempos),
        limiteProposto: 2_500,
        deslocamentos,
        cartoesNoDom: desenhados,
      },
      null,
      2,
    ),
  });

  expect(
    desenhados,
    "a página desenha uma parte, não os 1.000",
  ).toBeGreaterThan(0);
  expect(desenhados).toBeLessThan(PRODUTOS_DO_CATALOGO_GRANDE);
  expect(
    mediana(deslocamentos),
    "deslocamento de layout (mediana)",
  ).toBeLessThan(0.1);
});

test("[CA-33] @spec:AC-11419 busca e categoria no catálogo grande devolvem só o que casa (tempos no relatório)", async ({
  page,
  context,
}, info) => {
  test.setTimeout(240_000);
  await jaEscolheuOsCookies(context, origemDoSite(info));
  await page.setViewportSize(
    ehCelular(info)
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 },
  );
  const busca = page
    .locator("#busca-no-topo:visible, #busca-sobre-a-grade:visible")
    .first();
  const temposDaBusca: number[] = [];
  const temposDaCategoria: number[] = [];

  for (let vez = 0; vez < REPETICOES; vez += 1) {
    await page.goto(CATALOGO);
    await expect(cartoes(page).first()).toBeVisible();

    // Busca: "café" casa com 1 produto a cada 10.
    const inicioDaBusca = Date.now();
    await busca.fill("café");
    await busca.press("Enter");
    await expect(page).toHaveURL(/busca=caf/);
    await expect(cartoes(page).first()).toContainText("café");
    temposDaBusca.push(Date.now() - inicioDaBusca);
    const nomes = await cartoes(page).allInnerTexts();
    expect(nomes.length).toBeGreaterThan(0);
    expect(nomes.length).toBeLessThanOrEqual(PRODUTOS_DO_CATALOGO_GRANDE / 10);
    expect(
      nomes.filter((n) => !n.includes("café")),
      "só produtos que casam com a busca",
    ).toEqual([]);

    // Categoria: "Corredor 3" tem 100 produtos.
    await page.goto(CATALOGO);
    const inicioDaCategoria = Date.now();
    await page
      .getByRole("link", { name: /^Corredor 3\b/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Corredor 3" }).first(),
    ).toBeVisible();
    temposDaCategoria.push(Date.now() - inicioDaCategoria);
    const outras = await page
      .locator("main h2.sc-vitrine__secao-nome")
      .allInnerTexts();
    expect(
      outras.filter((t) => t.trim() !== "Corredor 3"),
      "só a categoria escolhida",
    ).toEqual([]);
  }

  await info.attach("medidas-busca-e-categoria.json", {
    contentType: "application/json",
    body: JSON.stringify(
      {
        largura: ehCelular(info) ? 390 : 1280,
        buscaMs: temposDaBusca,
        medianaDaBuscaMs: mediana(temposDaBusca),
        categoriaMs: temposDaCategoria,
        medianaDaCategoriaMs: mediana(temposDaCategoria),
        limiteProposto: 200,
        observacao:
          "Tempo de navegação completa (a busca e a categoria trocam a URL e o servidor desenha de novo).",
      },
      null,
      2,
    ),
  });
});
