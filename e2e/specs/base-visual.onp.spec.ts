/**
 * Base visual do redesign Stitch no navegador de verdade (card #104, T-10410).
 *
 * O que o vitest em jsdom NÃO prova mora aqui: largura real sem rolagem
 * lateral, o foco preso dentro da gaveta modal, o `box-shadow` calculado do
 * botão principal e o movimento reduzido de fato. A página é o catálogo `/ui`,
 * que não depende de banco: o ambiente sobe a API e o site, mas os cenários só
 * abrem esta rota. O e2e não roda no `onp-spec verify`: a prova de acessibilidade
 * transversal fica combinada com o #114.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const LARGURAS = [344, 768, 1280] as const;

/** A seção da base visual. O `id="secao-base-visual"` é do TÍTULO dela. */
const SECAO = 'section[aria-labelledby="secao-base-visual"]';

async function abrirCatalogo(page: Page, largura: number): Promise<void> {
  await page.setViewportSize({ width: largura, height: 900 });
  await page.goto("/ui");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

for (const largura of LARGURAS) {
  test(`@spec:AC-10419 o catálogo cabe em ${largura}px: sem rolagem lateral e sem texto cortado`, async ({
    page,
  }) => {
    await abrirCatalogo(page, largura);

    const medidas = await page.evaluate((secao) => {
      const larguraDaTela = document.documentElement.clientWidth;
      const pecas = [
        ...document.querySelectorAll(
          [
            `${secao} h3`,
            `${secao} h4`,
            `${secao} .sc-botao`,
            `${secao} .sc-barra-inferior`,
            `${secao} .sc-gaveta-modal--embutida`,
            `${secao} .sc-aviso-flutuante__cartao`,
            `${secao} .sc-cartao--vitrine`,
          ].join(","),
        ),
      ];
      // A faixa de chips rola por dentro de propósito: o que não pode é a PÁGINA.
      const fora = pecas.filter((elemento) => {
        const caixa = elemento.getBoundingClientRect();
        return caixa.right > larguraDaTela + 1 || caixa.left < -1;
      });
      // Texto cortado: o conteúdo é maior que a caixa e a caixa esconde o resto.
      const cortados = pecas.filter(
        (elemento) =>
          elemento.scrollWidth > elemento.clientWidth + 1 &&
          getComputedStyle(elemento).overflowX === "hidden" &&
          getComputedStyle(elemento).textOverflow !== "ellipsis",
      );
      return {
        pecas: pecas.length,
        rolagemLateral:
          document.documentElement.scrollWidth > larguraDaTela + 1,
        foraDaTela: fora.map((e) => e.className || e.tagName),
        cortados: cortados.map((e) => e.className || e.tagName),
      };
    }, SECAO);

    expect(medidas.pecas, "peças medidas").toBeGreaterThan(20);
    expect(medidas.rolagemLateral, "rolagem lateral na página").toBe(false);
    expect(medidas.foraDaTela, "peças fora da tela").toEqual([]);
    expect(medidas.cortados, "textos cortados").toEqual([]);
  });
}

test("@spec:AC-10419 a seção da base visual não tem violação séria ou crítica de acessibilidade", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await abrirCatalogo(page, 1280);

  const axeSource = await readFile(
    new URL("../../apps/web/node_modules/axe-core/axe.js", import.meta.url),
    "utf8",
  );
  await page.addScriptTag({ content: axeSource });

  const resultado = await page.evaluate(async (secao) => {
    const avaliacao = await (
      window as unknown as {
        axe: {
          run(alvo: string): Promise<{
            passes: unknown[];
            violations: Array<{
              id: string;
              impact: string | null;
              nodes: unknown[];
            }>;
          }>;
        };
      }
    ).axe.run(secao);
    return {
      avaliadas: avaliacao.passes.length + avaliacao.violations.length,
      graves: avaliacao.violations
        .filter((v) => ["critical", "serious"].includes(v.impact ?? ""))
        .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    };
  }, SECAO);

  // Sem esta checagem, um seletor errado faria o axe avaliar nada e passar.
  expect(resultado.avaliadas).toBeGreaterThan(20);
  expect(resultado.graves).toEqual([]);
});

test("@spec:AC-10419 com movimento reduzido o brilho do botão principal e o pulso saem", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await abrirCatalogo(page, 1280);

  const sombras = await page.evaluate(
    (secao) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          `${secao} [data-tema] .sc-botao--cta.sc-botao--primaria:not([disabled])`,
        ),
      ].map((botao) => getComputedStyle(botao).boxShadow),
    SECAO,
  );
  expect(sombras.length).toBeGreaterThan(0);
  for (const sombra of sombras) expect(sombra).toBe("none");

  // Curtir não pulsa: o ícone não anima nem depois do toque.
  const curtir = page
    .locator(`${SECAO} [data-tema="escuro"] .sc-botao--marcavel`)
    .first();
  await curtir.click();
  const animacao = await curtir
    .locator("svg")
    .evaluate((svg) => getComputedStyle(svg).animationName);
  expect(animacao).toBe("none");
});

test("@spec:AC-10419 sem a preferência, o botão principal tem brilho no tema escuro e nenhum no claro", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await abrirCatalogo(page, 1280);

  const sombraDo = (tema: string): Promise<string> =>
    page
      .locator(
        `${SECAO} [data-tema="${tema}"] .sc-botao--cta.sc-botao--primaria:not([disabled])`,
      )
      .first()
      .evaluate((botao) => getComputedStyle(botao).boxShadow);

  expect(await sombraDo("escuro")).not.toBe("none");
  // No claro a força é 0%: a sombra existe, mas transparente.
  // (O navegador escreve a cor transparente como `rgba(… 0)` ou `color(… / 0)`.)
  expect(await sombraDo("claro")).toMatch(/(, | \/ )0\) |^none$/);
});

test("@spec:AC-10412 a gaveta prende o foco, fecha com Esc e devolve o foco ao botão que a abriu", async ({
  page,
}) => {
  await abrirCatalogo(page, 344);

  const gatilho = page.locator("#bv-escuro-abrir-gaveta");
  const janela = page.locator("#bv-escuro-gaveta-modal");
  await gatilho.scrollIntoViewIfNeeded();
  await gatilho.focus();
  await gatilho.click();

  await expect(janela).toHaveAttribute("open", "");
  await expect(janela).toBeVisible();

  // Tab várias vezes: o foco circula DENTRO da janela. Ao passar do último
  // controle ele pode sair para o navegador (`body`), mas nunca cai num
  // elemento da página por trás.
  for (let passo = 0; passo < 6; passo += 1) {
    await page.keyboard.press("Tab");
    const onde = await page.evaluate(() => {
      const ativo = document.activeElement;
      if (ativo === null || ativo === document.body) return "navegador";
      return ativo.closest("dialog#bv-escuro-gaveta-modal") !== null
        ? "dentro"
        : `fora: ${ativo.tagName}#${ativo.id}`;
    });
    expect(
      ["dentro", "navegador"],
      `foco na tecla Tab nº ${passo + 1}`,
    ).toContain(onde);
  }

  // O resto da página não responde enquanto a gaveta está aberta: ela é a
  // janela modal do navegador (camada superior), e não só um painel à vista.
  expect(
    await page.evaluate(() => document.querySelector("dialog:modal")?.id),
  ).toBe("bv-escuro-gaveta-modal");

  await page.keyboard.press("Escape");
  await expect(janela).not.toHaveAttribute("open", "");
  await expect(gatilho).toBeFocused();
});
