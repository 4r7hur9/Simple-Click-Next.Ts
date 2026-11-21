/**
 * A navegação do cliente em navegador de verdade (card #105).
 *
 * O QUE SÓ O NAVEGADOR PROVA. O vitest confere o que o CSS e o DOM DECLARAM
 * (`apps/web/tests/barras-fixas.onp.test.ts` e companhia). Aqui se mede o que
 * acontece de fato: qual navegação aparece em cada largura, o que cobre o quê
 * embaixo, o teclado virtual, o foco atrás das barras fixas e o cabeçalho de
 * `Referrer-Policy`. Proposta ao #114, que é dono da prova transversal (axe,
 * toque, estouro lateral); este arquivo não repete o que ele já cobre.
 *
 * Roda com o ambiente e2e de pé (API e site, banco de desenvolvimento):
 * `pnpm test:e2e`. Os cenários com sacola dependem da loja de teste.
 */
import { expect, test, type Page } from "@playwright/test";

import {
  APELIDO_DA_LOJA,
  garantirLojaDeTeste,
} from "../fixtures/loja-de-teste.ts";

let loja: Awaited<ReturnType<typeof garantirLojaDeTeste>>;

test.beforeAll(async () => {
  loja = await garantirLojaDeTeste();
});

const LARGURAS = [344, 390, 768, 1024, 1280] as const;
/** 64rem: abaixo, barra inferior; a partir dela, abas no topo. */
const QUEBRA_EM_PX = 1024;

const barra = (page: Page) =>
  page.getByRole("navigation", { name: "Navegação principal" });
const abas = (page: Page) =>
  page.getByRole("navigation", { name: "Áreas do cliente" });

/** O aviso de cookies cobriria o que se mede aqui: a escolha já está dada. */
async function jaEscolheuOsCookies(page: Page) {
  await page.context().addCookies([
    {
      name: "sc_consentimento",
      value: encodeURIComponent(
        JSON.stringify({ v: "2026-10-19", d: false, f: false, t: Date.now() }),
      ),
      url: "http://localhost:3100",
    },
  ]);
}

/** Espera o React assumir o elemento (hidratação concluída e efeitos ligados). */
async function esperarAHidratacao(page: Page, seletor: string) {
  await page.waitForFunction((alvo) => {
    const elemento = document.querySelector(alvo);
    return (
      elemento !== null &&
      Object.keys(elemento).some((chave) => chave.startsWith("__reactFiber$"))
    );
  }, seletor);
  // Os efeitos passivos rodam logo depois do commit de hidratação.
  await page.evaluate(
    () =>
      new Promise<void>((resolver) =>
        requestAnimationFrame(() => setTimeout(resolver, 0)),
      ),
  );
}

test.describe("uma navegação por largura", () => {
  for (const largura of LARGURAS) {
    test(`@spec:AC-10504 em ${largura}px só uma navegação aparece`, async ({
      page,
    }) => {
      await jaEscolheuOsCookies(page);
      await page.setViewportSize({ width: largura, height: 844 });
      await page.goto("/explorar/produtos");
      if (largura < QUEBRA_EM_PX) {
        await expect(barra(page)).toBeVisible();
        await expect(abas(page)).toBeHidden();
        await expect(barra(page).getByRole("link")).toHaveCount(5);
      } else {
        await expect(abas(page)).toBeVisible();
        await expect(barra(page)).toBeHidden();
        await expect(abas(page).getByRole("link")).toHaveCount(4);
      }
      // A página atual é anunciada por UM item, qualquer que seja a navegação.
      const atual = page.locator('[aria-current="page"]:visible');
      await expect(atual).toHaveCount(1);
      await expect(atual).toContainText("Explorar");
    });
  }

  test("@spec:AC-10504 trocar a largura não perde a página atual", async ({
    page,
  }) => {
    await jaEscolheuOsCookies(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/explorar/lojas");
    await expect(barra(page).locator('[aria-current="page"]')).toHaveText(
      "Lojas",
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(abas(page).locator('[aria-current="page"]')).toHaveText(
      "Lojas",
    );
  });
});

test.describe("o fim da página e as barras fixas", () => {
  test("@spec:AC-10517 o último conteúdo fica acima da barra de baixo", async ({
    page,
  }) => {
    await jaEscolheuOsCookies(page);
    for (const largura of [344, 390, 768]) {
      await page.setViewportSize({ width: largura, height: 844 });
      await page.goto(`/loja/${APELIDO_DA_LOJA}/sobre`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const topoDaBarra = (await barra(page).boundingBox())?.y ?? Infinity;
      const rodape = await page.locator("footer.sc-rodape-legal").boundingBox();
      expect(rodape, `rodapé em ${largura}px`).not.toBeNull();
      expect((rodape?.y ?? 0) + (rodape?.height ?? 0)).toBeLessThanOrEqual(
        topoDaBarra + 1,
      );
    }
  });

  test("@spec:AC-10518 com a ação do produto (ou a sacola) só uma barra fixa embaixo", async ({
    page,
  }) => {
    await jaEscolheuOsCookies(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/loja/${loja.apelido}/produto/${loja.produtoId}`);
    await expect(
      page.locator(".sc-produto__acao, .sc-sacola, .sc-sacola-barra").first(),
    ).toBeVisible();
    await expect(barra(page)).toBeHidden();
  });

  test("@spec:AC-10518 sem nada no cardápio a barra de navegação aparece", async ({
    browser,
  }) => {
    const contexto = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await contexto.newPage();
    await jaEscolheuOsCookies(page);
    await page.goto(`/loja/${loja.apelido}/cardapio`);
    await expect(barra(page)).toBeVisible();
    await contexto.close();
  });

  test("@spec:AC-10519 o aviso de cookies fica acima da barra, sem cobrir nenhum item", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/explorar/produtos");
    const cookies = page.locator(".sc-cookies");
    await expect(cookies).toBeVisible();
    const caixaDosCookies = await cookies.boundingBox();
    const caixaDaBarra = await barra(page).boundingBox();
    expect(
      (caixaDosCookies?.y ?? 0) + (caixaDosCookies?.height ?? 0),
    ).toBeLessThanOrEqual((caixaDaBarra?.y ?? 0) + 1);

    // Ao fechar o aviso, a barra continua inteira e tocável.
    await page.getByRole("button", { name: /Recusar/ }).click();
    await expect(cookies).toBeHidden();
    await expect(
      barra(page).getByRole("link", { name: "Explorar" }),
    ).toBeVisible();
  });
});

test.describe("teclado virtual e foco", () => {
  test("@spec:AC-10520 a barra some enquanto o teclado está aberto e volta quando fecha", async ({
    page,
  }) => {
    await jaEscolheuOsCookies(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/explorar/produtos");
    await expect(barra(page)).toBeVisible();
    // O ouvinte do teclado só existe depois da hidratação: focar antes dela
    // perderia o `focusin` (e o encolhimento da janela viraria a referência).
    await esperarAHidratacao(page, 'nav[aria-label="Navegação principal"]');

    // A tela ainda pode refazer o campo ao terminar de carregar e tirar o
    // foco: foca de novo até o foco ficar.
    await expect(async () => {
      await page.locator("#sc-feed-busca").focus();
      await expect(page.locator("#sc-feed-busca")).toBeFocused({
        timeout: 1_000,
      });
    }).toPass({ timeout: 10_000 });
    // Deixa o ouvinte de `focusin` registrar a altura de referência antes de
    // a janela encolher (senão o encolhimento vira a própria referência).
    await page.evaluate(
      () =>
        new Promise<void>((pronto) =>
          requestAnimationFrame(() => requestAnimationFrame(() => pronto())),
        ),
    );
    // O teclado virtual encolhe a área visível: simulado pela altura da janela.
    await page.setViewportSize({ width: 390, height: 420 });
    await expect(barra(page)).toBeHidden();

    await page.locator("#sc-feed-busca").blur();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(barra(page)).toBeVisible();
  });

  test("@spec:AC-10521 percorrendo a página com Tab, o foco nunca fica atrás do topo nem da barra", async ({
    page,
  }) => {
    await jaEscolheuOsCookies(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/loja/${APELIDO_DA_LOJA}/sobre`);
    const encoberto: string[] = [];
    for (let passo = 0; passo < 30; passo++) {
      await page.keyboard.press("Tab");
      const medida = await page.evaluate(() => {
        const foco = document.activeElement;
        if (foco === null || foco === document.body) return null;
        const caixa = foco.getBoundingClientRect();
        const topo = document
          .querySelector(".sc-topo-cliente")
          ?.getBoundingClientRect();
        const barraDeBaixo = document.querySelector<HTMLElement>(
          ".sc-barra-inferior:not([data-oculta])",
        );
        const dentroDoTopo = foco.closest(".sc-topo-cliente") !== null;
        const dentroDaBarra = foco.closest(".sc-barra-inferior") !== null;
        // Dentro de uma janela modal (camada de cima do navegador) o topo e a
        // barra ficam ATRÁS dela: o que importa é se algo cobre o foco.
        const dentroDeJanela = foco.closest("dialog[open]") !== null;
        const alvo = document.elementFromPoint(
          caixa.left + caixa.width / 2,
          caixa.top + caixa.height / 2,
        );
        const coberto =
          alvo === null || !(foco.contains(alvo) || alvo.contains(foco));
        return {
          nome: foco.textContent?.trim().slice(0, 30) ?? foco.tagName,
          dentroDoTopo,
          dentroDaBarra,
          dentroDeJanela,
          coberto,
          abaixoDoTopo: topo === undefined || caixa.top >= topo.bottom - 1,
          acimaDaBarra:
            barraDeBaixo === null ||
            caixa.bottom <= barraDeBaixo.getBoundingClientRect().top + 1,
        };
      });
      if (medida === null || medida.dentroDoTopo || medida.dentroDaBarra)
        continue;
      const escondido = medida.dentroDeJanela
        ? medida.coberto
        : !medida.abaixoDoTopo || !medida.acimaDaBarra;
      if (escondido) encoberto.push(medida.nome);
    }
    expect(encoberto).toEqual([]);
  });
});

test.describe("sacola e retorno", () => {
  test("@spec:AC-10526 a sacola da loja continua com os mesmos itens ao ir ao Explorar e voltar", async ({
    page,
  }) => {
    await jaEscolheuOsCookies(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/loja/${loja.apelido}/produto/${loja.produtoId}`);
    await page.getByRole("button", { name: /Adicionar à sacola/ }).click();
    // No computador o aviso é só para o leitor de tela; a coluna da sacola
    // mostra o item (mesmo padrão de `irAoFechamentoCom`).
    await expect(page.getByText(/Adicionado à sacola/).first()).toBeAttached();
    await expect(
      page.getByRole("button", { name: "Sacola, 1 item" }),
    ).toBeVisible();

    await page.getByRole("link", { name: /SimpleClick, explorar/ }).click();
    await expect(page).toHaveURL(/\/explorar/);
    await page.goto(`/loja/${loja.apelido}/cardapio`);
    await expect(
      page.getByRole("button", { name: "Sacola, 1 item" }),
    ).toBeVisible();
  });

  test("@spec:AC-10510 o ícone da sacola abre a sacola da loja", async ({
    page,
  }) => {
    await jaEscolheuOsCookies(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/loja/${loja.apelido}/produto/${loja.produtoId}`);
    await page.getByRole("button", { name: /Adicionar/ }).click();
    await page
      .getByRole("button", { name: /^Sacola, / })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("@spec:AC-10511 o visitante que abre /conta/pedidos entra e volta para a página", async ({
    page,
  }) => {
    await jaEscolheuOsCookies(page);
    await page.goto("/conta/pedidos");
    await expect(page).toHaveURL(/\/entrar\?proximo=%2Fconta%2Fpedidos/);
  });
});

test.describe("referência", () => {
  test("@spec:AC-10514 o site responde com Referrer-Policy strict-origin-when-cross-origin", async ({
    request,
  }) => {
    for (const caminho of [
      "/explorar/produtos",
      `/loja/${APELIDO_DA_LOJA}`,
      "/entrar",
    ]) {
      const resposta = await request.get(caminho);
      expect(resposta.headers()["referrer-policy"], caminho).toBe(
        "strict-origin-when-cross-origin",
      );
    }
  });

  test("@spec:AC-10514 o endereço de retorno de quem entra no acompanhamento do pedido não leva o código", async ({
    page,
  }) => {
    await jaEscolheuOsCookies(page);
    await page.goto(`/loja/${APELIDO_DA_LOJA}/pedido/CODIGO-SECRETO-123`);
    const entrar = page.getByRole("link", { name: /^Entrar/ }).first();
    if ((await entrar.count()) > 0) {
      const href = (await entrar.getAttribute("href")) ?? "";
      expect(decodeURIComponent(href)).not.toContain("CODIGO-SECRETO-123");
    }
  });
});
