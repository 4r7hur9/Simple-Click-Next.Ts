/**
 * Dá para comprar só com o teclado (card #114, AC-11410; propostas do #110:
 * AC-11024 sacola em janela e AC-11028 coluna da sacola; do #109: janela do
 * produto).
 *
 * - O Tab alcança o produto no catálogo, e todo controle focado no caminho
 *   mostra o foco (contorno ou sombra).
 * - A janela do produto e a sacola em janela PRENDEM o foco (Tab e Shift+Tab
 *   não saem dela), fecham com Esc e DEVOLVEM o foco a quem as abriu.
 * - No computador (1280px) a sacola é uma coluna: o Tab chega ao "Fechar
 *   pedido" dela.
 *
 * Projeto `celular` mede a 390px (sacola em janela); `publico` a 1280px
 * (sacola em coluna). Sem `test.skip`: cada projeto prova a sua forma.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  APELIDO_DA_JORNADA,
  JORNADA,
  garantirLojaDaJornada,
} from "../fixtures/redesign-lojas.ts";
import {
  ehCelular,
  jaEscolheuOsCookies,
  origemDoSite,
} from "../fixtures/redesign.ts";

test.beforeAll(async () => {
  await garantirLojaDaJornada();
});

test.beforeEach(async ({ page, context }, info) => {
  await jaEscolheuOsCookies(context, origemDoSite(info));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(
    ehCelular(info)
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
  );
});

interface Foco {
  readonly descricao: string;
  readonly visivel: boolean;
}

/**
 * O elemento focado agora e se o foco DESENHA alguma coisa: compara contorno,
 * sombra, borda e fundo do elemento (e do rótulo/pai, para caixa de marcar
 * atrás de rótulo desenhado ou campo dentro de caixa) com foco e sem foco.
 * Foco que não muda nada na tela é foco invisível.
 */
async function focoAtual(page: Page): Promise<Foco> {
  return page.evaluate(async () => {
    // Com movimento reduzido o site encurta as transições para 0,00001s: o
    // desenho do foco chega um quadro depois. Dois quadros antes de ler.
    const doisQuadros = () =>
      new Promise<void>((pronto) =>
        requestAnimationFrame(() => requestAnimationFrame(() => pronto())),
      );
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body)
      return { descricao: "body", visivel: true };
    const rotulo = el.closest("label") ?? el.parentElement;
    const desenho = () =>
      [el, rotulo]
        .filter((x): x is HTMLElement => x !== null)
        .map((x) => {
          const e = getComputedStyle(x);
          return [
            e.outlineStyle,
            e.outlineWidth,
            e.outlineColor,
            e.boxShadow,
            e.borderColor,
            e.backgroundColor,
          ].join("|");
        })
        .join("/");
    await doisQuadros();
    const comFoco = desenho();
    el.blur();
    await doisQuadros();
    const semFoco = desenho();
    el.focus();
    const tipo = el instanceof HTMLInputElement ? `[type=${el.type}]` : "";
    const texto = (
      el.getAttribute("aria-label") ??
      el.textContent ??
      rotulo?.textContent ??
      ""
    ).trim();
    const descricao = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${tipo}.${[...el.classList].slice(0, 2).join(".")} "${texto.slice(0, 40)}" (${comFoco === semFoco ? comFoco.slice(0, 160) : ""})`;
    return { descricao, visivel: comFoco !== semFoco };
  });
}

/** Tab até `alvo` ficar focado; devolve os focos do caminho. */
async function tabAte(page: Page, alvo: Locator, limite = 80): Promise<Foco[]> {
  const caminho: Foco[] = [];
  for (let i = 0; i < limite; i += 1) {
    await page.keyboard.press("Tab");
    caminho.push(await focoAtual(page));
    if (await alvo.evaluate((el) => el === document.activeElement))
      return caminho;
  }
  throw new Error(`o Tab não chegou ao alvo em ${limite} passos`);
}

/** Tab e Shift+Tab, várias vezes, sem o foco sair de `janela`. */
async function focoPreso(page: Page, janela: Locator): Promise<string[]> {
  const fugas: string[] = [];
  for (const tecla of [
    ...Array(12).fill("Tab"),
    ...Array(12).fill("Shift+Tab"),
  ]) {
    await page.keyboard.press(tecla);
    // Sair para a interface do navegador (foco no `body`, com o resto da
    // página inerte) é o comportamento nativo do `<dialog>` modal e não é
    // fuga: fuga é focar um controle DA PÁGINA fora da janela.
    const fugiu = await janela.evaluate(
      (el) =>
        document.activeElement !== null &&
        document.activeElement !== document.body &&
        !el.contains(document.activeElement),
    );
    if (fugiu) fugas.push(`${tecla} → ${(await focoAtual(page)).descricao}`);
  }
  return fugas;
}

const ehFocado = (alvo: Locator) =>
  alvo.evaluate((el) => el === document.activeElement);

test("[CA-13] @spec:AC-11410 o Tab alcança o produto com foco visível, e a janela do produto prende, fecha com Esc e devolve o foco", async ({
  page,
}) => {
  await page.goto(`/loja/${APELIDO_DA_JORNADA}/cardapio`);
  const cartao = page.getByRole("link", {
    name: new RegExp(`^${JORNADA.coxinha.nome}`),
  });

  const caminho = await tabAte(page, cartao);
  const semFoco = caminho.filter((f) => !f.visivel).map((f) => f.descricao);
  expect(semFoco, "controles focados sem foco visível").toEqual([]);

  await page.keyboard.press("Enter");
  const janela = page.locator("dialog.sc-janela-produto[open]");
  await expect(janela).toBeVisible();
  expect(
    await janela.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  expect(
    await focoPreso(page, janela),
    "o foco saiu da janela do produto",
  ).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(janela).toBeHidden();
  await expect
    .poll(() => ehFocado(cartao), { message: "o foco volta ao cartão" })
    .toBe(true);
});

test("[CA-14] @spec:AC-11410 a sacola é alcançada e operada pelo teclado (janela no celular, coluna no computador)", async ({
  page,
}, info) => {
  await page.goto(`/loja/${APELIDO_DA_JORNADA}/cardapio`);
  const cartao = page.getByRole("link", {
    name: new RegExp(`^${JORNADA.coxinha.nome}`),
  });
  await tabAte(page, cartao);
  await page.keyboard.press("Enter");
  const produto = page.locator("dialog.sc-janela-produto[open]");
  await expect(produto).toBeVisible();
  const adicionar = produto.locator(".sc-produto__adicionar");
  await tabAte(page, adicionar, 30);
  await page.keyboard.press("Enter");
  await expect(produto).toBeHidden();

  if (ehCelular(info)) {
    // AC-11024 (#110): a sacola em janela prende o foco, fecha com Esc e
    // devolve o foco ao botão da barra.
    const abrir = page.locator(".sc-sacola-barra__abrir");
    await expect(abrir).toBeVisible();
    await tabAte(page, abrir);
    await page.keyboard.press("Enter");
    const sacola = page
      .locator("dialog[open]")
      .filter({ has: page.locator("#titulo-do-carrinho") });
    await expect(sacola).toBeVisible();
    expect(
      await sacola.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    expect(await focoPreso(page, sacola), "o foco saiu da sacola").toEqual([]);
    await page.keyboard.press("Escape");
    await expect(sacola).toBeHidden();
    await expect
      .poll(() => ehFocado(abrir), { message: "o foco volta à barra" })
      .toBe(true);
  } else {
    // AC-11028 (#110): a coluna da sacola entra na ordem do Tab, até o
    // "Fechar pedido", com foco visível.
    const coluna = page.locator("aside.sc-sacola-coluna");
    await expect(coluna).toBeVisible();
    const fechar = coluna.getByRole("button", { name: "Fechar pedido" });
    const caminho = await tabAte(page, fechar, 120);
    expect(caminho.at(-1)?.visivel, "foco visível no Fechar pedido").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator("#titulo-do-fechamento")).toBeVisible();
  }
});
