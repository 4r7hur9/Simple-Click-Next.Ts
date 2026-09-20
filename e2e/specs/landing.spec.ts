import { expect, test, type Browser } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";

const HISTORIA = [
  "Seu cardápio online sem pagar mensalidade",
  "O cliente monta, você só prepara",
  "Você sabe quanto entrou, e de quê",
  "Nada, e sem asterisco",
];

async function abrirSemScript(browser: Browser) {
  const contexto = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: ENDERECO_DO_SITE,
  });
  const pagina = await contexto.newPage();
  await pagina.goto("/");
  return { contexto, pagina };
}

test("@spec:AC-934 a landing entrega a história e os caminhos sem script", async ({
  browser,
}) => {
  const { contexto, pagina } = await abrirSemScript(browser);

  for (const trecho of HISTORIA) {
    await expect(pagina.getByText(trecho, { exact: true })).toBeVisible();
  }

  const capitulos = pagina.locator("[data-capitulo]");
  await expect(capitulos).toHaveCount(6);
  for (let indice = 0; indice < (await capitulos.count()); indice += 1) {
    await expect(capitulos.nth(indice)).not.toBeEmpty();
  }

  const links = pagina.locator("a");
  await expect(links).not.toHaveCount(0);
  const destinos = await links.evaluateAll((elementos) =>
    elementos.map((elemento) => elemento.getAttribute("href")),
  );
  expect(destinos.every((destino) => Boolean(destino))).toBe(true);
  expect(
    destinos.filter((destino) => destino === "/entrar").length,
  ).toBeGreaterThan(0);

  await contexto.close();
});

test("@spec:AC-938 a landing cabe na largura mínima e em telas altas", async ({
  browser,
}) => {
  for (const viewport of [
    { width: 344, height: 1366 },
    { width: 344, height: 1920 },
    { width: 1366, height: 1366 },
    { width: 1920, height: 1920 },
  ]) {
    const contexto = await browser.newContext({
      baseURL: ENDERECO_DO_SITE,
      viewport,
    });
    const pagina = await contexto.newPage();
    await pagina.goto("/");

    const medidas = await pagina.evaluate(() => ({
      larguraDaJanela: window.innerWidth,
      larguraDoDocumento: document.documentElement.scrollWidth,
      capitulos: Array.from(
        document.querySelectorAll("[data-capitulo]"),
        (elemento) => {
          const caixa = elemento.getBoundingClientRect();
          return { altura: caixa.height, topo: caixa.top + window.scrollY };
        },
      ),
    }));

    expect(
      medidas.larguraDoDocumento,
      `estouro em ${viewport.width}x${viewport.height}`,
    ).toBeLessThanOrEqual(medidas.larguraDaJanela);
    expect(medidas.capitulos.length).toBe(6);
    for (const capitulo of medidas.capitulos) {
      expect(
        capitulo.altura,
        `capítulo esticado em ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(viewport.height + 200);
    }

    const chamada = pagina
      .getByRole("link", { name: /começar|criar|montar/i })
      .last();
    await expect(chamada).toBeVisible();
    await expect(chamada).toHaveAttribute("href", "/entrar");

    await contexto.close();
  }
});
