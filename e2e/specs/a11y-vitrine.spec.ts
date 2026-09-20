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
  const axeSource = await readFile(
    new URL("../../apps/web/node_modules/axe-core/axe.js", import.meta.url),
    "utf8",
  );

  for (const caminho of [
    `/l/${APELIDO_DA_LOJA}`,
    `/l/${APELIDO_DA_LOJA}/catalogo`,
    `/l/${APELIDO_DA_LOJA}/produto/${produtoId}`,
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
  await page.goto(`/l/${APELIDO_DA_LOJA}/catalogo`);

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
