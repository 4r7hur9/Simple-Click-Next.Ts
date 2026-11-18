/**
 * As provas de navegador que o painel do lojista (#112) e a administração
 * (#113) deixaram para o #114.
 *
 * - #112 AC-11209: o menu do painel no celular é gaveta que abre, fecha com
 *   Esc e devolve o foco ao botão; o item atual é dito por texto; sem
 *   rolagem lateral em 344, 768 e 1280.
 * - #112 AC-11218: lista operacional é tabela no computador e cartões no
 *   celular, sem rolagem lateral em 344.
 * - #112 AC-11249: nada sério ou crítico no axe (contraste incluído).
 * - #113 AC-11319: as listas da administração cabem em 344 sem rolagem
 *   lateral; a faixa de filtros rola dentro dela mesma.
 * - #113 AC-11326: as marcas dos gráficos do início têm contraste de pelo
 *   menos 3:1 com o fundo e o gráfico tem texto equivalente.
 * - #113: a janela de confirmação fecha com Esc e devolve o foco a quem a
 *   abriu (sem confirmar nada).
 *
 * Larguras pelo projeto: `celular` 344; `publico` 768 e 1280.
 */
import { expect, test, type Page } from "@playwright/test";

import {
  entrarComoAdministrador,
  garantirAdministrador,
} from "../fixtures/admin.ts";
import { entrarComoDono, garantirLojaDoPainel } from "../fixtures/painel.ts";
import { prepararContaParaATela } from "../fixtures/redesign-lojas.ts";
import {
  alturaPara,
  ehCelular,
  esperarAssentar,
  jaEscolheuOsCookies,
  medirEstouro,
  origemDoSite,
  prepararPagina,
  rodarAxe,
} from "../fixtures/redesign.ts";

const LARGURAS_DO_PROJETO = (celular: boolean) =>
  celular ? [344] : [768, 1280];

async function semEstouro(page: Page, onde: string): Promise<void> {
  const estouro = await medirEstouro(page);
  expect
    .soft(estouro.rolagem, `rolagem lateral em ${onde}`)
    .toBeLessThanOrEqual(estouro.largura);
  expect.soft(estouro.fora, `fora da borda em ${onde}`).toEqual([]);
}

async function semBarreiraSeria(page: Page, onde: string): Promise<void> {
  const axe = await rodarAxe(page);
  expect.soft(axe.rodadas.length, `axe rodou em ${onde}`).toBeGreaterThan(10);
  expect.soft(axe.graves, `axe em ${onde}`).toEqual([]);
}

test.describe("painel do lojista (#112)", () => {
  test.beforeAll(async () => {
    const loja = await garantirLojaDoPainel();
    await prepararContaParaATela(loja.donoId, "dono");
  });

  test.beforeEach(async ({ context }, info) => {
    await jaEscolheuOsCookies(context, origemDoSite(info));
    await entrarComoDono(context, origemDoSite(info));
  });

  for (const rota of ["/painel", "/painel/produtos", "/painel/pedidos"]) {
    test(`[CA-24] @spec:AC-11209 @spec:AC-11249 ${rota} sem rolagem lateral e sem barreira séria`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      for (const largura of LARGURAS_DO_PROJETO(ehCelular(info))) {
        await test.step(`${largura}px`, async () => {
          await page.setViewportSize({
            width: largura,
            height: alturaPara(largura),
          });
          await prepararPagina(page, "escuro");
          await page.goto(rota);
          await esperarAssentar(page);
          await semEstouro(page, `${rota} ${largura}px`);
          await semBarreiraSeria(page, `${rota} ${largura}px`);
        });
      }
    });
  }

  test("[CA-25] @spec:AC-11209 o menu diz a página atual por texto e, no celular, é gaveta que fecha com Esc e devolve o foco", async ({
    page,
  }, info) => {
    await prepararPagina(page, "escuro");
    await page.setViewportSize(
      ehCelular(info)
        ? { width: 344, height: 844 }
        : { width: 1280, height: 800 },
    );
    await page.goto("/painel/produtos");
    if (ehCelular(info)) {
      const abrir = page.getByRole("button", { name: "Abrir menu" });
      await abrir.focus();
      await page.keyboard.press("Enter");
      const gaveta = page.getByRole("dialog", { name: /menu|painel/i });
      await expect(gaveta).toBeVisible();
      await expect(gaveta.locator('[aria-current="page"]')).toContainText(
        /Produtos/,
      );
      await page.keyboard.press("Escape");
      await expect(gaveta).toBeHidden();
      await expect
        .poll(() => abrir.evaluate((el) => el === document.activeElement))
        .toBe(true);
    } else {
      await expect(
        page.locator('[aria-current="page"]').filter({ visible: true }).first(),
      ).toContainText(/Produtos/);
    }
  });

  test("[CA-26] @spec:AC-11218 a lista de produtos é tabela no computador e cartões no celular", async ({
    page,
  }, info) => {
    await prepararPagina(page, "escuro");
    if (ehCelular(info)) {
      await page.setViewportSize({ width: 344, height: 844 });
      await page.goto("/painel/produtos");
      await esperarAssentar(page);
      await expect(page.locator("table").filter({ visible: true })).toHaveCount(
        0,
      );
      await semEstouro(page, "/painel/produtos 344px");
    } else {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/painel/produtos");
      await esperarAssentar(page);
      const tabela = page.locator("table").filter({ visible: true }).first();
      await expect(tabela).toBeVisible();
      await expect(tabela.locator("th").first()).toBeVisible();
    }
  });
});

test.describe("administração (#113)", () => {
  test.beforeAll(async () => {
    const id = await garantirAdministrador();
    await prepararContaParaATela(id, "cliente");
  });

  test.beforeEach(async ({ context }, info) => {
    await jaEscolheuOsCookies(context, origemDoSite(info));
    await entrarComoAdministrador(context, origemDoSite(info));
  });

  for (const rota of ["/admin", "/admin/lojas", "/admin/contas"]) {
    test(`[CA-27] @spec:AC-11319 ${rota} cabe sem rolagem lateral e sem barreira séria`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      for (const largura of LARGURAS_DO_PROJETO(ehCelular(info))) {
        await test.step(`${largura}px`, async () => {
          await page.setViewportSize({
            width: largura,
            height: alturaPara(largura),
          });
          await prepararPagina(page, "escuro");
          await page.goto(rota);
          await esperarAssentar(page);
          await semEstouro(page, `${rota} ${largura}px`);
          await semBarreiraSeria(page, `${rota} ${largura}px`);
          if (rota !== "/admin") {
            // A faixa de filtros (Chip + FaixaDeChips, #113) rola dentro dela.
            const faixa = page
              .getByRole("group")
              .filter({ has: page.getByRole("button") })
              .first();
            if ((await faixa.count()) > 0) {
              const rola = await faixa.evaluate((el) => {
                const ox = getComputedStyle(el).overflowX;
                return (
                  el.scrollWidth <= el.clientWidth + 1 ||
                  ox === "auto" ||
                  ox === "scroll"
                );
              });
              expect
                .soft(
                  rola,
                  `faixa de filtros cabe ou rola sozinha em ${rota} ${largura}px`,
                )
                .toBe(true);
            }
          }
        });
      }
    });
  }

  test("[CA-28] @spec:AC-11326 as marcas dos gráficos do início têm contraste de 3:1 e texto equivalente", async ({
    page,
  }) => {
    await prepararPagina(page, "escuro");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");
    await esperarAssentar(page);
    const graficos = page.locator('[role="img"]');
    await expect(graficos.first()).toBeVisible();
    const medidas = await graficos.evaluateAll((lista) => {
      const canal = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const luz = (cor: string) => {
        const [r = 0, g = 0, b = 0] = (cor.match(/[\d.]+/g) ?? []).map(Number);
        return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
      };
      const fundoDe = (el: Element): string => {
        for (let p: Element | null = el; p; p = p.parentElement) {
          const c = getComputedStyle(p).backgroundColor;
          if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
        }
        return "rgb(255, 255, 255)";
      };
      return lista.map((g) => {
        const fundo = fundoDe(g);
        const marcas = [
          ...g.querySelectorAll(
            "rect, path, circle, line, polyline, [class*='barra'], [class*='marca']",
          ),
        ]
          .filter((m) => {
            // Só o que aparece: área de clique transparente, grade escondida e
            // traço sem tinta não são marca do gráfico.
            const e = getComputedStyle(m);
            const r = m.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.height > 0 &&
              e.visibility !== "hidden" &&
              e.display !== "none" &&
              Number(e.opacity) > 0
            );
          })
          .map((m) => {
            const e = getComputedStyle(m);
            if (!(m instanceof SVGElement)) return e.backgroundColor;
            // Área em degradê (`url(#…)`) é enfeite sob a linha: conta o traço.
            const pintaArea =
              e.fill !== "none" &&
              !e.fill.startsWith("url(") &&
              Number(e.fillOpacity) > 0;
            const pintaTraco =
              e.stroke !== "none" &&
              Number(e.strokeOpacity) > 0 &&
              Number.parseFloat(e.strokeWidth) > 0;
            return pintaArea ? e.fill : pintaTraco ? e.stroke : "none";
          })
          .filter((c) => c && c !== "none" && c !== "rgba(0, 0, 0, 0)");
        const baixas = marcas.filter((c) => {
          const [a, b] = [luz(c), luz(fundo)].sort((x, y) => y - x);
          return ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05) < 3;
        });
        return {
          nome: g.getAttribute("aria-label") ?? "",
          marcas: marcas.length,
          baixas: [...new Set(baixas)],
          fundo,
        };
      });
    });
    for (const g of medidas) {
      expect
        .soft(g.nome.trim().length, "gráfico com texto equivalente")
        .toBeGreaterThan(0);
      expect
        .soft(g.baixas, `marcas abaixo de 3:1 em "${g.nome}" sobre ${g.fundo}`)
        .toEqual([]);
    }
  });

  test("[CA-29] @spec:AC-11319 a janela de confirmação fecha com Esc e devolve o foco a quem a abriu", async ({
    page,
  }, info) => {
    await prepararPagina(page, "escuro");
    await page.setViewportSize(
      ehCelular(info)
        ? { width: 344, height: 844 }
        : { width: 1280, height: 800 },
    );
    await page.goto("/admin/lojas");
    await esperarAssentar(page);
    const gatilho = page
      .getByRole("button", {
        name: /^(Desativar loja|Ativar loja|Aprovar|Recusar)$/,
      })
      .filter({ visible: true })
      .first();
    await expect(
      gatilho,
      "a lista tem uma loja com ato de aprovação",
    ).toBeVisible();
    await gatilho.focus();
    await page.keyboard.press("Enter");
    const janela = page
      .locator("dialog[open]")
      .filter({ visible: true })
      .last();
    await expect(janela).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(janela).toBeHidden();
    await expect
      .poll(() => gatilho.evaluate((el) => el === document.activeElement))
      .toBe(true);
  });
});
