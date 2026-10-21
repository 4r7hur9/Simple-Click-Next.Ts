/**
 * As telas construídas respondem, e respondem sem depender de script (AC-016).
 *
 * O QUE ELE PROVA QUE NENHUM TESTE DE UNIDADE PROVA: que a rota existe de
 * verdade no framework, que o servidor a desenha, e que o conteúdo principal
 * chega no HTML — em navegador de verdade, contra a API de verdade, contra o
 * banco de verdade.
 *
 * A LOJA DE EXEMPLO vem da carga determinística (`packages/database/seed/`).
 * Usar dado inventado aqui provaria que o teste sabe montar um cenário; usar a
 * carga prova que o caminho inteiro funciona com o que o produto realmente tem.
 */
import { expect, test } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";

/** A loja da carga de exemplo, e o produto que ela publica. */
const LOJA = "pastelaria-da-vila";

test("@spec:AC-016 a apresentação da loja responde e traz o nome", async ({
  page,
}) => {
  await page.goto(`/loja/${LOJA}`);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Pastelaria da Vila",
  );
});

test("@spec:AC-415 o catálogo chega PRONTO, sem depender de script", async ({
  browser,
}) => {
  // SEM JAVASCRIPT: é o que o AC-415 exige da vitrine, e o que faz o cardápio
  // abrir na fila do ônibus. Um teste com script ligado passaria mesmo que a
  // página só se montasse no navegador.
  // `baseURL` VAI À MÃO aqui: contexto criado por `browser.newContext()` não
  // herda o `use` do projeto, e sem ele o endereço relativo não resolve — a
  // página abre em branco e o teste reprova por motivo que não é o dele.
  const contexto = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: ENDERECO_DO_SITE,
  });
  const pagina = await contexto.newPage();

  await pagina.goto(`/loja/${LOJA}/cardapio`);

  await expect(pagina.getByText("Pastel de Carne").first()).toBeVisible();
  await expect(pagina.getByText("R$ 7,00").first()).toBeVisible();

  await contexto.close();
});

test("@spec:AC-405 filtrar por categoria funciona sem script, pelo endereço", async ({
  browser,
}) => {
  // O filtro é link, e não botão que troca estado: é isso que o faz funcionar
  // com script desligado, ser compartilhável e o "voltar" desfazê-lo.
  // `baseURL` VAI À MÃO aqui: contexto criado por `browser.newContext()` não
  // herda o `use` do projeto, e sem ele o endereço relativo não resolve — a
  // página abre em branco e o teste reprova por motivo que não é o dele.
  const contexto = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: ENDERECO_DO_SITE,
  });
  const pagina = await contexto.newPage();

  await pagina.goto(`/loja/${LOJA}/cardapio`);
  await pagina.getByRole("link", { name: "Bebidas" }).click();

  await expect(pagina.getByText("Refrigerante Lata").first()).toBeVisible();
  await expect(pagina.getByText("Pastel de Carne")).toHaveCount(0);

  await contexto.close();
});

test("@spec:AC-402 loja inexistente responde a página de indisponível", async ({
  page,
}) => {
  await page.goto("/loja/loja-que-nunca-existiu");

  // A página não conta QUAL das duas é — inexistente ou suspensa. Dizer que o
  // endereço já existiu e foi suspenso é informação que serve para mapear
  // concorrente, e não para quem está navegando.
  await expect(page.getByText("não está disponível")).toBeVisible();

  // O STATUS NÃO É CONFERIDO AQUI, e isso é uma lacuna anotada, não um
  // esquecimento: o servidor de desenvolvimento devolve 200 nesta página
  // (soft 404), e o que decide a resposta de produção é a construção. Conferir
  // 200 aqui gravaria o comportamento errado como esperado. Ver a dívida 82.
});
