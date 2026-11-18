/**
 * Verde único legível em todas as lojas e alvos de toque do tamanho certo
 * (card #114: AC-11411, AC-11412; princípio P-106).
 *
 * NO NAVEGADOR, PINTADO: o vitest (`contraste-das-lojas.onp.test.ts`) prova o
 * que o CSS declara; aqui se mede a página de cada loja da carga de exemplo,
 * de ramos diferentes:
 *
 * - o verde calculado na página é #B7FF00 (nenhuma loja injeta cor própria);
 * - todo elemento pintado de verde tem texto com contraste de pelo menos 4,5:1;
 * - todo controle de ação (botão, campo, aba, link em forma de botão ou chip,
 *   link da navegação) tem pelo menos 48px (`--altura-toque-cliente`, card
 *   #104) — exceto link dentro de texto corrido.
 *
 * TOQUE DE VERDADE: o contexto nasce com `hasTouch` (os projetos do e2e são
 * "Desktop Chrome"; mudar a configuração não é deste card). Larguras pelo
 * projeto: `celular` 344 e 390; `publico` 768 (tablet, também de toque).
 */
import { expect, test, type Page } from "@playwright/test";

import {
  LOJAS_DA_CARGA_DEMO,
  conferirCargaDemo,
} from "../fixtures/redesign-lojas.ts";
import {
  alturaPara,
  ehCelular,
  esperarAssentar,
  jaEscolheuOsCookies,
  origemDoSite,
  prepararPagina,
} from "../fixtures/redesign.ts";

/** Mínimo de toque das telas do cliente (Q-10405 respondida no #104: 48px). */
const TOQUE_MINIMO = 48;

test.beforeAll(async () => {
  await conferirCargaDemo();
});

interface Medidas {
  readonly verde: string;
  readonly contrasteRuim: string[];
  readonly pequenos: string[];
}

/** Lê, na página como está, o verde, o texto sobre o verde e os alvos de toque. */
async function medir(page: Page, minimo: number): Promise<Medidas> {
  return page.evaluate((min) => {
    const canal = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const rgb = (cor: string) => (cor.match(/[\d.]+/g) ?? []).map(Number);
    const luz = ([r = 0, g = 0, b = 0]: number[]) =>
      0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    const contraste = (a: string, b: string) => {
      const [x, y] = [luz(rgb(a)), luz(rgb(b))].sort((m, n) => n - m);
      return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
    };
    const nome = (el: Element) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}"`;

    const raiz =
      document.querySelector(".sc-tema-loja") ?? document.documentElement;
    const verde = getComputedStyle(raiz)
      .getPropertyValue("--cor-primaria")
      .trim()
      .toLowerCase();

    const visiveis = [
      ...document.querySelectorAll<HTMLElement>("body *"),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        getComputedStyle(el).visibility !== "hidden"
      );
    });

    const VERDE = "rgb(183, 255, 0)";
    const contrasteRuim = visiveis
      .filter((el) => getComputedStyle(el).backgroundColor === VERDE)
      .filter((el) => (el.textContent ?? "").trim().length > 0)
      .filter((el) => contraste(getComputedStyle(el).color, VERDE) < 4.5)
      .map((el) => `${nome(el)} ${getComputedStyle(el).color}`);

    const ehAcao = (el: HTMLElement) => {
      if (
        el.matches(
          "button, select, summary, [role=button], [role=tab], input:not([type=hidden])",
        )
      )
        return true;
      if (!el.matches("a[href]")) return false;
      // Link dentro de texto corrido é a exceção do critério.
      if (el.closest("p, li p, dd")) return false;
      return (
        /botao|chip|acao|aba|mais|abrir|voltar|sobre|marca/.test(
          el.className,
        ) || el.closest("nav") !== null
      );
    };
    const pequenos = visiveis
      .filter(ehAcao)
      .filter((el) => !el.closest("[aria-hidden=true], .sc-so-leitor"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        // Campo e caixa de marcar contam pelo rótulo clicável, se houver.
        const alvo = el.matches("input[type=checkbox], input[type=radio]")
          ? (el.closest("label")?.getBoundingClientRect() ?? r)
          : r;
        return Math.min(alvo.width, alvo.height) < min - 0.5;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${nome(el)} ${Math.round(r.width)}×${Math.round(r.height)}`;
      });

    return { verde, contrasteRuim, pequenos: [...new Set(pequenos)] };
  }, minimo);
}

for (const loja of LOJAS_DA_CARGA_DEMO) {
  test(`[CA-16] @spec:AC-11411 @spec:AC-11412 @principle:P-106 ${loja.apelido} (${loja.ramo}): verde único legível e alvos de toque de ${TOQUE_MINIMO}px`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000);
    const larguras = ehCelular(info) ? [344, 390] : [768];
    const contexto = await browser.newContext({
      baseURL: origemDoSite(info),
      hasTouch: true,
    });
    try {
      await jaEscolheuOsCookies(contexto, origemDoSite(info));
      const page = await contexto.newPage();
      for (const largura of larguras) {
        for (const caminho of [
          `/loja/${loja.apelido}`,
          `/loja/${loja.apelido}/cardapio`,
        ]) {
          await test.step(`${caminho} a ${largura}px`, async () => {
            await page.setViewportSize({
              width: largura,
              height: alturaPara(largura),
            });
            await prepararPagina(page, "escuro");
            await page.goto(caminho);
            await esperarAssentar(page);
            const m = await medir(page, TOQUE_MINIMO);
            const onde = `${caminho} ${largura}px`;
            expect.soft(m.verde, `verde da página em ${onde}`).toBe("#b7ff00");
            expect
              .soft(m.contrasteRuim, `texto ilegível sobre o verde em ${onde}`)
              .toEqual([]);
            expect
              .soft(
                m.pequenos,
                `alvos menores que ${TOQUE_MINIMO}px em ${onde}`,
              )
              .toEqual([]);
          });
        }
      }
    } finally {
      await contexto.close();
    }
  });
}
