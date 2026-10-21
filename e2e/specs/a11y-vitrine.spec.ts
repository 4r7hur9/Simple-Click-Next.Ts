import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import {
  APELIDO_DA_LOJA,
  garantirLojaDeTeste,
} from "../fixtures/loja-de-teste.ts";

let produtoId: string;

test.beforeAll(async () => {
  produtoId = (await garantirLojaDeTeste()).produtoId;
});

test("@spec:AC-419 página pública não tem violação séria ou crítica", async ({
  page,
}) => {
  // O AXE MEDE A COR DE UM INSTANTE. A página da loja entra com um esmaecer
  // de meio segundo (EntradaDaLoja), e no meio dele o texto é uma mistura com
  // o fundo: na execução completa de 06/10 o axe pegou o botão do cardápio a
  // 60% de opacidade (contraste 1,88) e reprovou uma cor que, parada, passa.
  // Com movimento reduzido a página entrega direto o estado final — o mesmo
  // que toda pessoa vê depois da entrada —, e é ele que este critério mede.
  await page.emulateMedia({ reducedMotion: "reduce" });

  const axeSource = await readFile(
    new URL("../../apps/web/node_modules/axe-core/axe.js", import.meta.url),
    "utf8",
  );

  for (const caminho of [
    `/loja/${APELIDO_DA_LOJA}`,
    `/loja/${APELIDO_DA_LOJA}/cardapio`,
    `/loja/${APELIDO_DA_LOJA}/produto/${produtoId}`,
  ]) {
    await page.goto(caminho);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ content: axeSource });

    const resultado = await page.evaluate(async () => {
      const avaliacao = await (
        window as unknown as {
          axe: {
            run(
              alvo: Document,
              opcoes?: unknown,
            ): Promise<{
              passes: unknown[];
              violations: Array<{
                id: string;
                impact: string | null;
                nodes: unknown[];
              }>;
            }>;
          };
        }
      ).axe.run(document);
      return {
        avaliadas: avaliacao.passes.length + avaliacao.violations.length,
        graves: avaliacao.violations
          .filter((violacao) =>
            ["critical", "serious"].includes(violacao.impact ?? ""),
          )
          .map((violacao) => ({
            id: violacao.id,
            impact: violacao.impact,
            nodes: violacao.nodes,
          })),
      };
    });

    expect(resultado.avaliadas, caminho).toBeGreaterThan(0);
    expect(resultado.graves, caminho).toEqual([]);
  }
});

test("@spec:AC-420 a vitrine cabe na menor largura suportada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 344, height: 882 });
  await page.goto(`/loja/${APELIDO_DA_LOJA}/cardapio`);

  const medidas = await page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    const imagensFora = [...document.images].filter(
      (imagem) => imagem.getBoundingClientRect().right > largura + 1,
    ).length;
    const textosFora = [
      ...document.querySelectorAll("h1,h2,h3,p,a,button"),
    ].filter(
      (elemento) => elemento.getBoundingClientRect().right > largura + 1,
    ).length;
    return {
      rolagemHorizontal: document.documentElement.scrollWidth,
      largura,
      imagensFora,
      textosFora,
      botoesConfortaveis: [...document.querySelectorAll("button")].every(
        (botao) => botao.getBoundingClientRect().height >= 44,
      ),
    };
  });

  expect(medidas.rolagemHorizontal).toBeLessThanOrEqual(medidas.largura);
  expect(medidas.imagensFora).toBe(0);
  expect(medidas.textosFora).toBe(0);
  expect(medidas.botoesConfortaveis).toBe(true);
});
