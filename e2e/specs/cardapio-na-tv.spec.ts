/**
 * O cardápio na televisão, em navegador de verdade (AC-925, AC-929).
 *
 * O QUE SÓ ESTE CENÁRIO PROVA. Os ganchos e a tela têm prova de unidade com
 * relógio de mentira (`apps/web/tests/cardapio-na-tv.test.tsx`). O que nenhuma
 * delas alcança: a rota `/l/{apelido}/tv` existe no framework, o servidor a
 * desenha com o catálogo de verdade, a página não tem barra de rolagem numa
 * janela de televisão, o rodízio avança no relógio de verdade — e, com a rede
 * cortada pelo navegador, a exibição continua de pé e volta a atualizar quando
 * a rede retorna.
 *
 * O RITMO VEM DO ENDEREÇO. Esperar doze segundos por tela e um minuto por
 * atualização faria cada cenário levar minutos; a página aceita `?segundos=` e
 * `?atualizar=`, dentro de limites, e é isso que o cenário usa.
 */
import { expect, test } from "@playwright/test";

import { ENDERECO_DA_API } from "../playwright.config.ts";
import {
  APELIDO_DA_LOJA,
  garantirLojaDeTeste,
  PRODUTO,
} from "../fixtures/loja-de-teste.ts";

/** Tela de televisão Full HD, deitada. */
const TELEVISAO = { width: 1920, height: 1080 };

/** O endereço da exibição, com o ritmo mais curto que a página aceita. */
const EXIBICAO = `/l/${APELIDO_DA_LOJA}/tv?segundos=5&atualizar=2`;

test.beforeAll(async () => {
  await garantirLojaDeTeste();

  // Aquece a loja na API antes do primeiro cenário: a primeira leitura de
  // uma loja recém-montada pode passar da espera do site.
  await expect
    .poll(
      async () =>
        (
          await fetch(
            `${ENDERECO_DA_API}/v1/vitrine/${APELIDO_DA_LOJA}/catalogo`,
          )
        ).status,
      { timeout: 30_000 },
    )
    .toBe(200);
});

test("@spec:AC-925 a televisão mostra o cardápio sem barra de rolagem, sem cursor e sem nada para tocar", async ({
  page,
}) => {
  await page.setViewportSize(TELEVISAO);
  await page.goto(EXIBICAO);

  // O produto chega pronto do servidor, com o preço escrito.
  await expect(page.getByText(PRODUTO.nome).first()).toBeVisible();
  await expect(page.getByText("R$ 12,00").first()).toBeVisible();

  const medidas = await page.evaluate(() => {
    const raiz = document.documentElement;
    const exibicao = document.querySelector(".sc-exibicao");
    const estilo = exibicao === null ? null : getComputedStyle(exibicao);
    return {
      rolaNaVertical: raiz.scrollHeight > raiz.clientHeight,
      rolaNaHorizontal: raiz.scrollWidth > raiz.clientWidth,
      cursor: estilo?.cursor ?? "",
      interativos: document.querySelectorAll("button, a, input, select").length,
    };
  });

  expect(medidas.rolaNaVertical).toBe(false);
  expect(medidas.rolaNaHorizontal).toBe(false);
  expect(medidas.cursor).toBe("none");
  expect(medidas.interativos).toBe(0);
});

test("@spec:AC-925 a tela avança sozinha, no relógio de verdade", async ({
  page,
}) => {
  await page.setViewportSize(TELEVISAO);
  await page.goto(EXIBICAO);

  const principal = page.locator(".sc-exibicao__tela");
  await expect(principal).toHaveAttribute("data-tela", "0");

  // Sem clique, sem tecla, sem rolagem: só o tempo.
  await expect(principal).not.toHaveAttribute("data-tela", "0", {
    timeout: 15_000,
  });
});

test("@spec:AC-925 o código para o celular está na tela, grande, e leva à vitrine desta loja", async ({
  page,
}) => {
  await page.setViewportSize(TELEVISAO);
  await page.goto(EXIBICAO);

  const codigo = page.getByRole("img", { name: /Código para abrir/ });
  await expect(codigo).toBeVisible();

  const caixa = await codigo.boundingBox();
  // 44% do lado menor de 1080 px: cerca de 475 px. Elemento grande, e não
  // selo de canto.
  expect(caixa?.width ?? 0).toBeGreaterThan(400);
  await expect(page.getByText(`/l/${APELIDO_DA_LOJA}/catalogo`)).toBeVisible();
});

test("@spec:AC-929 com a rede cortada, a exibição continua de pé e volta a atualizar quando a rede retorna", async ({
  page,
  context,
}) => {
  await page.setViewportSize(TELEVISAO);
  await page.goto(EXIBICAO);
  await expect(page.getByText(PRODUTO.nome).first()).toBeVisible();
  await expect(page.locator(".sc-exibicao__atualizado")).toBeVisible();

  // A internet da loja cai.
  await context.setOffline(true);

  // Passam duas atualizações com a rede fora: o cardápio continua, sem tela
  // de erro e sem tela branca — e o rodapé avisa, discreto.
  await expect(page.locator(".sc-exibicao__aviso")).toContainText(
    "Sem conexão",
    {
      timeout: 10_000,
    },
  );
  await expect(page.getByText(PRODUTO.nome).first()).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  // A internet volta.
  await context.setOffline(false);

  await expect(page.locator(".sc-exibicao__aviso")).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(page.locator(".sc-exibicao__atualizado")).toBeVisible();
  await expect(page.getByText(PRODUTO.nome).first()).toBeVisible();
});

test("@spec:AC-925 loja inexistente responde a página de indisponível, e não uma televisão vazia", async ({
  page,
}) => {
  await page.setViewportSize(TELEVISAO);
  await page.goto("/l/loja-que-nunca-existiu/tv");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "não está disponível",
  );
});
