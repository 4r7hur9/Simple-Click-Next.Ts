/**
 * O detalhe do produto por largura (card #109): folha no celular, duas colunas
 * no tablet e no computador, e nada estoura em 344 px.
 *
 * O `onp-spec verify` só roda o vitest: estas provas ficam no e2e (Q-11405).
 */
import { expect, test, type Page } from "@playwright/test";

import { avisarOSite } from "../fixtures/config-loja.ts";
import { garantirPastelariaDeTesteAberta } from "../fixtures/loja-de-teste.ts";
import { ENDERECO_DO_SITE } from "../playwright.config.ts";

const LOJA = "pastelaria-da-vila";

test.beforeAll(async () => {
  await garantirPastelariaDeTesteAberta();
  // Outro cenário pode ter lido a loja ainda fechada: o site guarda a vitrine
  // por até um minuto, e o botão sairia "Indisponível". O aviso a renova.
  await avisarOSite(ENDERECO_DO_SITE, LOJA);
});

async function abrirOPastel(page: Page) {
  await page.goto(`/loja/${LOJA}/cardapio`);
  await page
    .getByRole("link", { name: /Pastel de Carne/ })
    .first()
    .click();
  const janela = page.locator("dialog.sc-janela-produto[open]");
  await expect(janela).toBeVisible();
  // A folha entra animada (escala e deslize): mede-se depois que a animação
  // termina, e não no meio dela (386 px em vez de 390).
  await janela.evaluate((el) =>
    Promise.all(el.getAnimations().map((animacao) => animacao.finished)),
  );
  return janela;
}

test("[CA-26] @spec:AC-10925 no celular o detalhe é uma folha e a barra de adicionar fica sempre à mão", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const janela = await abrirOPastel(page);

  const caixa = await janela.boundingBox();
  expect(caixa?.width).toBeCloseTo(390, 0);
  expect(caixa?.height).toBeCloseTo(780, 0);

  const barra = page.locator(".sc-produto__acao");
  const ultimo = page
    .locator(".sc-produto__formulario > :not(.sc-produto__acao)")
    .last();
  // Rola até o fim e mede de novo até a altura assentar: fotos e opções que
  // terminam de carregar depois aumentam a folha, e uma só rolagem fica curta.
  await expect
    .poll(
      async () => {
        await janela.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
        const naBarra = await barra.boundingBox();
        const noUltimo = await ultimo.boundingBox();
        if (naBarra === null || noUltimo === null) return Infinity;
        return noUltimo.y + noUltimo.height - naBarra.y;
      },
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(1);

  // A barra fica dentro da tela.
  const naBarra = await barra.boundingBox();
  expect(naBarra).not.toBeNull();
  expect((naBarra?.y ?? 0) + (naBarra?.height ?? 0)).toBeLessThanOrEqual(780);

  await janela.evaluate((el) => el.scrollTo({ top: 0 }));
  const galeria = await page.locator(".sc-detalhe__fotos").boundingBox();
  const decisao = await page.locator(".sc-detalhe__decisao").boundingBox();
  expect(galeria?.y ?? 0).toBeLessThan(decisao?.y ?? 0);
});

for (const largura of [768, 1280]) {
  test(`[CA-27] @spec:AC-10926 a ${largura} px a galeria fica à esquerda e a decisão à direita`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    await abrirOPastel(page);

    const galeria = await page.locator(".sc-detalhe__fotos").boundingBox();
    const decisao = await page.locator(".sc-detalhe__decisao").boundingBox();
    expect(galeria).not.toBeNull();
    expect(decisao).not.toBeNull();
    expect((galeria?.x ?? 0) + (galeria?.width ?? 0)).toBeLessThanOrEqual(
      (decisao?.x ?? 0) + 1,
    );
    expect(Math.abs((galeria?.y ?? 0) - (decisao?.y ?? 0))).toBeLessThan(8);
    await expect(
      page.getByRole("button", { name: /Adicionar.*R\$/ }),
    ).toBeVisible();
  });
}

test("[CA-28] @spec:AC-10927 a 344 px nada estoura na horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 344, height: 700 });
  const janela = await abrirOPastel(page);

  const estoura = await janela.evaluate(
    (el) =>
      el.scrollWidth > el.clientWidth ||
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
  );
  expect(estoura).toBe(false);
});
