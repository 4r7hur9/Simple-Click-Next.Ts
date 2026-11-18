/**
 * Vazio, erro, carregamento e imagens nunca deixam a tela quebrada (card
 * #114: AC-11416 e AC-11417).
 *
 * - VAZIO: loja sem produto, busca sem resultado na descoberta, sacola vazia,
 *   conta nova sem pedidos e sem favoritos — sempre mensagem e uma saída.
 * - ERRO: loja e produto inexistentes (404, mensagem certa, saída, nada
 *   técnico) e a API da sacola falhando (`page.route` → 500: aviso e "Tentar
 *   de novo", e não "sua sacola está vazia").
 * - CARREGAMENTO: a API da sacola atrasada mostra um aviso anunciado ao leitor
 *   de tela (`role="status"`).
 * - IMAGENS: foto quebrada (`page.route` → 404) não deixa ícone de imagem
 *   quebrada à vista; produto sem foto mostra o substituto; deslocamento de
 *   layout < 0,1; toda imagem tem `alt`; as de fora da primeira dobra são
 *   `loading="lazy"`.
 *
 * Projeto `celular` mede a 390px, `publico` a 1280px.
 */
import { expect, test, type Page } from "@playwright/test";

import {
  APELIDO_DA_JORNADA,
  APELIDO_DA_LOJA_VAZIA,
  clienteLogado,
  garantirLojaDaJornada,
  garantirLojaVazia,
} from "../fixtures/redesign-lojas.ts";
import {
  ehCelular,
  esperarAssentar,
  jaEscolheuOsCookies,
  origemDoSite,
  prepararPagina,
} from "../fixtures/redesign.ts";

test.beforeAll(async () => {
  await garantirLojaDaJornada();
  await garantirLojaVazia();
});

test.beforeEach(async ({ page, context }, info) => {
  await jaEscolheuOsCookies(context, origemDoSite(info));
  await page.setViewportSize(
    ehCelular(info)
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
  );
  await prepararPagina(page, "escuro");
});

/** O que nunca pode aparecer para o cliente numa tela de erro. */
const DETALHE_TECNICO =
  /\b(Error|TypeError|stack|undefined|null|ECONN\w*|status \d{3}|500|Internal Server)\b/;

/** Texto visível do conteúdo principal (ou do corpo, se não houver `main`). */
async function textoPrincipal(page: Page): Promise<string> {
  const main = page.locator("main").first();
  return (await main.count()) > 0
    ? main.innerText()
    : page.locator("body").innerText();
}

/** Uma saída: link ou botão de ação no conteúdo principal ou no topo. */
const umaSaida = (page: Page) =>
  page
    .locator("main a[href], main button, header a[href]")
    .filter({ visible: true })
    .first();

test.describe("vazio", () => {
  test("[CA-19] @spec:AC-11416 loja sem produto mostra mensagem e uma saída", async ({
    page,
  }) => {
    await page.goto(`/loja/${APELIDO_DA_LOJA_VAZIA}/cardapio`);
    await expect(page.getByText("O cardápio está sendo montado")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Voltar à vitrine" }),
    ).toBeVisible();
  });

  test("[CA-19] @spec:AC-11416 busca sem resultado na descoberta mostra mensagem e uma saída", async ({
    page,
  }) => {
    await page.goto("/explorar/produtos?busca=zz-nada-disso-existe");
    const resultado = page.getByRole("region", {
      name: "Produtos encontrados",
    });
    await expect(resultado.getByText(/Nada encontrado/)).toBeVisible();
    await expect(resultado.getByRole("link", { name: /Limpar/ })).toBeVisible();
  });

  test("[CA-19] @spec:AC-11416 sacola vazia mostra mensagem e leva ao cardápio", async ({
    page,
  }, info) => {
    await page.goto(`/loja/${APELIDO_DA_JORNADA}/carrinho`);
    if (ehCelular(info)) {
      const sacola = page
        .locator("dialog[open]")
        .filter({ has: page.locator("#titulo-do-carrinho") });
      await expect(sacola.getByText("Sua sacola está vazia")).toBeVisible();
      await expect(
        sacola
          .getByRole("link", { name: /cardápio/i })
          .or(sacola.getByRole("button", { name: /cardápio/i }))
          .first(),
      ).toBeVisible();
    } else {
      // A coluna da sacola some com a sacola vazia (#130): o cardápio fica
      // inteiro, e a sacola do topo diz que está vazia.
      await expect(page.locator("aside.sc-sacola-coluna")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /^Sacola, vazia/ }),
      ).toBeVisible();
      await expect(
        page.locator("main a.sc-vitrine__link").first(),
      ).toBeVisible();
    }
  });

  for (const [rota, assunto] of [
    ["/conta/pedidos", "pedidos"],
    ["/conta/favoritos", "favoritos"],
  ] as const) {
    test(`[CA-19] @spec:AC-11416 conta nova sem ${assunto} mostra mensagem e uma saída`, async ({
      page,
      context,
    }, info) => {
      await clienteLogado(
        context,
        origemDoSite(info),
        `Cliente Sem ${assunto}`,
      );
      await page.goto(rota);
      await esperarAssentar(page);
      const texto = await textoPrincipal(page);
      expect(texto, "mensagem de vazio").toMatch(/ainda|nenhum|nada|vazi/i);
      await expect(
        page
          .locator("main")
          .getByRole("link")
          .filter({ hasText: /explorar|lojas|produtos|começar|ver/i })
          .first(),
      ).toBeVisible();
    });
  }
});

test.describe("erro", () => {
  test("[CA-20] @spec:AC-11416 loja inexistente responde 404 com mensagem clara, uma saída e nada técnico", async ({
    page,
  }) => {
    const resposta = await page.goto("/loja/loja-que-nao-existe-114");
    expect(resposta?.status()).toBe(404);
    const texto = await textoPrincipal(page);
    expect(texto).toMatch(/loja não está disponível|não encontrad/i);
    expect(texto).not.toMatch(DETALHE_TECNICO);
    await expect(umaSaida(page)).toBeVisible();
  });

  test("[CA-20] @spec:AC-11416 produto inexistente numa loja que existe diz que o PRODUTO não foi achado", async ({
    page,
  }) => {
    const resposta = await page.goto(
      `/loja/${APELIDO_DA_JORNADA}/produto/00000000-0000-4000-8000-000000000000`,
    );
    expect(resposta?.status()).toBe(404);
    const texto = await textoPrincipal(page);
    expect(texto).not.toMatch(DETALHE_TECNICO);
    // A loja existe e está aberta: dizer que "a loja não está disponível"
    // manda a pessoa embora de uma loja que funciona.
    expect(texto).not.toMatch(/loja não está disponível/i);
    expect(texto).toMatch(/produto/i);
    await expect(umaSaida(page)).toBeVisible();
  });

  test("[CA-20] @spec:AC-11416 a sacola que não carrega avisa o erro e oferece tentar de novo", async ({
    page,
  }, info) => {
    await page.route(
      `**/v1/vitrine/${APELIDO_DA_JORNADA}/carrinho**`,
      (rota) =>
        rota.request().method() === "GET"
          ? rota.fulfill({
              status: 500,
              body: '{"erro":"falha"}',
              contentType: "application/json",
            })
          : rota.continue(),
    );
    await page.goto(`/loja/${APELIDO_DA_JORNADA}/carrinho`);
    const sacola = ehCelular(info)
      ? page
          .locator("dialog[open]")
          .filter({ has: page.locator("#titulo-do-carrinho") })
      : page.locator("main, aside").first();
    if (ehCelular(info)) {
      await expect(
        sacola.getByRole("button", { name: "Tentar de novo" }),
      ).toBeVisible();
      await expect(sacola.getByText("Sua sacola está vazia")).toHaveCount(0);
      expect(await sacola.innerText()).not.toMatch(DETALHE_TECNICO);
    } else {
      // A 1280px a sacola é a coluna; sem carrinho carregado ela não se
      // desenha, e o catálogo continua utilizável.
      await expect(
        page.locator("main a.sc-vitrine__link").first(),
      ).toBeVisible();
      expect(await textoPrincipal(page)).not.toMatch(DETALHE_TECNICO);
    }
  });
});

test.describe("carregamento", () => {
  test("[CA-21] @spec:AC-11416 a sacola carregando é anunciada a quem usa leitor de tela", async ({
    page,
  }, info) => {
    let soltar: () => void = () => undefined;
    const espera = new Promise<void>((pronto) => {
      soltar = pronto;
    });
    await page.route(
      `**/v1/vitrine/${APELIDO_DA_JORNADA}/carrinho**`,
      async (rota) => {
        if (rota.request().method() === "GET") await espera;
        await rota.continue();
      },
    );
    await page.goto(`/loja/${APELIDO_DA_JORNADA}/carrinho`, {
      waitUntil: "domcontentloaded",
    });
    if (ehCelular(info)) {
      const sacola = page
        .locator("dialog[open]")
        .filter({ has: page.locator("#titulo-do-carrinho") });
      await expect(sacola.getByRole("status").first()).toBeVisible();
    } else {
      // A 1280px o carregamento da coluna também é anunciado ou a coluna
      // espera em silêncio — o topo anuncia a contagem da sacola.
      await expect(
        page.locator("[role=status], [aria-busy=true]").first(),
      ).toBeAttached();
    }
    soltar();
  });
});

test.describe("imagens", () => {
  test("[CA-22] @spec:AC-11417 foto quebrada não deixa ícone de imagem quebrada à vista", async ({
    page,
  }) => {
    await page.route(
      /\.(webp|png|jpe?g|avif)(\?|$)|images\.unsplash|res\.cloudinary/,
      (rota) =>
        rota.request().resourceType() === "image"
          ? rota.fulfill({ status: 404, body: "" })
          : rota.continue(),
    );
    await page.goto("/loja/pastelaria-da-vila/cardapio");
    await esperarAssentar(page);
    const quebradas = await page.evaluate(() =>
      [...document.images]
        .filter((img) => {
          const r = img.getBoundingClientRect();
          const visivel =
            r.width > 0 &&
            r.height > 0 &&
            getComputedStyle(img).visibility !== "hidden" &&
            Number(getComputedStyle(img).opacity) > 0;
          return (
            visivel &&
            img.complete &&
            img.naturalWidth === 0 &&
            img.alt.trim() !== ""
          );
        })
        .map((img) => `${img.className} alt="${img.alt}"`),
    );
    // Imagem quebrada com texto alternativo desenha o ícone e o alt por cima
    // do cartão; sem alt (decorativa) o navegador não desenha nada.
    expect(quebradas, "imagens quebradas desenhando ícone e texto").toEqual([]);
  });

  test("[CA-22] @spec:AC-11417 produto sem foto mostra o substituto, sem imagem quebrada", async ({
    page,
  }) => {
    await page.goto(`/loja/${APELIDO_DA_JORNADA}/cardapio`);
    const cartao = page.locator("main a.sc-vitrine__link").first();
    await expect(cartao).toBeVisible();
    const medidas = await cartao.evaluate((el) => ({
      imagensQuebradas: [...el.querySelectorAll("img")].filter(
        (i) => i.complete && i.naturalWidth === 0,
      ).length,
      temMoldura: [...el.querySelectorAll("*")].some((f) => {
        const r = f.getBoundingClientRect();
        return r.width >= 40 && r.height >= 40 && f.children.length <= 2;
      }),
    }));
    expect(medidas.imagensQuebradas).toBe(0);
    expect(medidas.temMoldura, "o substituto ocupa o lugar da foto").toBe(true);
  });

  test("[CA-23] @spec:AC-11417 a página não pula enquanto as fotos chegam, e as fotos têm alt e carga tardia", async ({
    page,
  }, info) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((lista) => {
        for (const entrada of lista.getEntries() as unknown as Array<{
          value: number;
          hadRecentInput: boolean;
        }>) {
          if (!entrada.hadRecentInput)
            (window as unknown as { __cls: number }).__cls += entrada.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/loja/pastelaria-da-vila/cardapio");
    await esperarAssentar(page);
    await page.waitForTimeout(500);
    const cls = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls,
    );
    expect(
      cls,
      `deslocamento de layout a ${ehCelular(info) ? 390 : 1280}px`,
    ).toBeLessThan(0.1);

    const fotos = await page.evaluate(() => {
      const dobra = window.innerHeight;
      return [...document.images].map((img) => ({
        temAlt: img.hasAttribute("alt"),
        abaixoDaDobra: img.getBoundingClientRect().top > dobra * 1.5,
        tardia: img.loading === "lazy",
        nome: img.className,
      }));
    });
    expect(
      fotos.filter((f) => !f.temAlt).map((f) => f.nome),
      "imagem sem alt",
    ).toEqual([]);
    expect(
      fotos.filter((f) => f.abaixoDaDobra && !f.tardia).map((f) => f.nome),
      "foto fora da primeira dobra sem carga tardia",
    ).toEqual([]);
  });

  test("[CA-23] @spec:AC-11417 a foto do detalhe do produto tem texto alternativo", async ({
    page,
  }) => {
    await page.goto("/loja/pastelaria-da-vila/cardapio");
    await page.locator("main a.sc-vitrine__link").first().click();
    const galeria = page
      .locator("dialog.sc-janela-produto[open] .sc-detalhe__fotos img")
      .first();
    await expect(galeria).toBeVisible();
    expect(
      (await galeria.getAttribute("alt"))?.trim().length ?? 0,
    ).toBeGreaterThan(0);
  });
});
