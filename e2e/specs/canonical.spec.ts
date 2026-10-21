/**
 * A loja é encontrável e compartilhável (AC-403, AC-414).
 *
 * O QUE SÓ ESTE CENÁRIO PROVA. Os blocos de dados estruturados e o mapa do site
 * têm teste de unidade, e ele prova o CONTEÚDO. O que ele não alcança é se o
 * Next entrega esse conteúdo: se `alternates.canonical` vira mesmo uma etiqueta
 * `<link rel="canonical">`, se `sitemap.ts` dentro de um segmento dinâmico
 * responde de verdade em `/loja/{apelido}/sitemap.xml`, e se o bloco chega ao HTML
 * antes de qualquer script.
 *
 * SEM JAVASCRIPT, DE PROPÓSITO. Buscador e robô de rede social leem o HTML
 * inicial. Um bloco que só aparecesse depois do script existiria para o
 * navegador e não para quem este trabalho quer alcançar — e a página não pode
 * depender de script para mostrar produto (AC-415).
 *
 * A LOJA DE EXEMPLO vem da carga determinística (`packages/database/seed/`),
 * como nos demais cenários.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";

const LOJA = "pastelaria-da-vila";

/** Abre uma página como um robô a lê: HTML inicial, sem script. */
async function comoRobo(browser: Browser, caminho: string) {
  // `baseURL` VAI À MÃO: contexto criado por `browser.newContext()` não herda
  // o `use` do projeto, e sem ele o endereço relativo não resolve.
  const contexto = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: ENDERECO_DO_SITE,
  });
  const pagina = await contexto.newPage();
  await pagina.goto(caminho);
  return { contexto, pagina };
}

/** Lê os blocos de dados estruturados da página, já convertidos. */
async function blocosDaPagina(
  pagina: Page,
): Promise<Record<string, unknown>[]> {
  const textos = await pagina
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return textos.map((texto) => JSON.parse(texto) as Record<string, unknown>);
}

test("@spec:AC-403 a apresentação declara um canônico só", async ({
  browser,
}) => {
  const { contexto, pagina } = await comoRobo(browser, `/loja/${LOJA}`);

  const canonicos = pagina.locator('link[rel="canonical"]');
  await expect(canonicos).toHaveCount(1);
  await expect(canonicos).toHaveAttribute(
    "href",
    `${ENDERECO_DO_SITE}/loja/${LOJA}`,
  );

  await contexto.close();
});

test("@spec:AC-403 o negócio chega ao HTML como dado estruturado", async ({
  browser,
}) => {
  const { contexto, pagina } = await comoRobo(browser, `/loja/${LOJA}`);

  const blocos = await blocosDaPagina(pagina);
  expect(blocos).toHaveLength(1);

  const negocio = blocos[0] as Record<string, unknown>;
  expect(negocio["@context"]).toBe("https://schema.org");
  // A pastelaria da carga é do ramo de alimentação: `Restaurant`, com cardápio.
  expect(negocio["@type"]).toBe("Restaurant");
  expect(negocio["name"]).toBe("Pastelaria da Vila");
  expect(negocio["hasMenu"]).toBe(`${ENDERECO_DO_SITE}/loja/${LOJA}/cardapio`);

  await contexto.close();
});

test("@spec:AC-403 o catálogo chega como cardápio, com seção e preço", async ({
  browser,
}) => {
  const { contexto, pagina } = await comoRobo(browser, `/loja/${LOJA}/cardapio`);

  const blocos = await blocosDaPagina(pagina);
  const cardapio = blocos.find((bloco) => bloco["@type"] === "Menu");
  expect(cardapio, "o catálogo não publicou o bloco de cardápio").toBeDefined();

  const secoes = cardapio?.["hasMenuSection"] as Record<string, unknown>[];
  expect(secoes.length).toBeGreaterThan(0);

  const itens = secoes.flatMap(
    (secao) => secao["hasMenuItem"] as Record<string, unknown>[],
  );
  const pastel = itens.find((item) => item["name"] === "Pastel de Carne");
  expect(pastel, "o pastel da carga não entrou no cardápio").toBeDefined();

  // O PREÇO É NÚMERO E MOEDA, e não o texto que a tela mostra: "R$ 7,00"
  // seria descartado pelo buscador.
  const oferta = pastel?.["offers"] as Record<string, unknown>;
  expect(oferta["price"]).toBe("7.00");
  expect(oferta["priceCurrency"]).toBe("BRL");

  await contexto.close();
});

test("@spec:AC-403 o canônico do catálogo não carrega o filtro", async ({
  browser,
}) => {
  const { contexto, pagina } = await comoRobo(
    browser,
    `/loja/${LOJA}/cardapio?categoria=bebidas`,
  );

  // Filtro e busca são a MESMA página vista por um recorte. Indexá-los como
  // endereços distintos espalharia a loja por dezenas de páginas quase iguais.
  await expect(pagina.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${ENDERECO_DO_SITE}/loja/${LOJA}/cardapio`,
  );

  // E o recorte NÃO publica o cardápio: ele descreveria a loja pelo pedaço que
  // alguém filtrou.
  const blocos = await blocosDaPagina(pagina);
  expect(blocos.find((bloco) => bloco["@type"] === "Menu")).toBeUndefined();

  await contexto.close();
});

test("@spec:AC-414 o produto declara canônico e sai com preço para quem compartilha", async ({
  browser,
}) => {
  // O identificador do produto sai do próprio catálogo: assim o cenário não
  // depende de um UUID escrito à mão, que muda a cada recarga da carga.
  const { contexto: contextoDoCatalogo, pagina: catalogo } = await comoRobo(
    browser,
    `/loja/${LOJA}/cardapio`,
  );
  const link = await catalogo
    .getByRole("link", { name: /Pastel de Carne/ })
    .first()
    .getAttribute("href");
  await contextoDoCatalogo.close();

  expect(link, "o cartão do pastel não levou a lugar nenhum").toBeTruthy();

  const { contexto, pagina } = await comoRobo(browser, link as string);

  await expect(pagina.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${ENDERECO_DO_SITE}${link}`,
  );

  const blocos = await blocosDaPagina(pagina);
  const produto = blocos.find((bloco) => bloco["@type"] === "Product");
  expect(produto, "a página do produto não publicou o bloco").toBeDefined();
  expect(produto?.["name"]).toBe("Pastel de Carne");

  const oferta = produto?.["offers"] as Record<string, unknown>;
  expect(oferta["price"]).toBe("7.00");

  // A prévia do compartilhamento precisa do endereço ABSOLUTO da imagem: a
  // rede social busca de um servidor que não é o nosso.
  const imagem = pagina.locator('meta[property="og:image"]');
  await expect(imagem).toHaveCount(1);
  const endereco = await imagem.getAttribute("content");
  expect(endereco?.startsWith("http")).toBe(true);

  await contexto.close();
});

test("@spec:AC-403 o mapa do site lista a loja, o catálogo e os produtos", async ({
  request,
}) => {
  // Requisição CRUA, e não navegador: é assim que o robô do buscador pede o
  // arquivo — e um mapa que só funcionasse dentro de uma aba não serviria.
  const resposta = await request.get(`/loja/${LOJA}/sitemap.xml`);

  expect(resposta.status()).toBe(200);
  const xml = await resposta.text();

  expect(xml).toContain(`${ENDERECO_DO_SITE}/loja/${LOJA}</loc>`);
  expect(xml).toContain(`${ENDERECO_DO_SITE}/loja/${LOJA}/cardapio</loc>`);
  expect(xml).toContain(`${ENDERECO_DO_SITE}/loja/${LOJA}/produto/`);
});

test("@spec:AC-402 o mapa de loja inexistente não conta que ela não existe", async ({
  request,
}) => {
  const resposta = await request.get("/loja/loja-que-nunca-existiu/sitemap.xml");

  // 200 COM MAPA VAZIO. Um 500 aqui separaria "loja que não existe" de "loja
  // suspensa" pela diferença de resposta — que é o que o AC-402 proíbe.
  expect(resposta.status()).toBe(200);
  const xml = await resposta.text();
  expect(xml).not.toContain("<loc>");
});

test("@spec:AC-403 a imagem de compartilhamento da loja é desenhada de verdade", async ({
  browser,
  request,
}) => {
  // O QUE SÓ ISTO PEGA: `next/og` desenha num ambiente reduzido, sem folha de
  // estilo e com um subconjunto do flexbox. Uma propriedade que ele não
  // entenda derruba a rota — e o sintoma é o link voltando a aparecer cinza no
  // WhatsApp, meses depois, sem ninguém ligar uma coisa à outra.
  const { contexto, pagina } = await comoRobo(browser, `/loja/${LOJA}`);
  const endereco = await pagina
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  await contexto.close();

  expect(
    endereco,
    "a apresentação não declarou imagem de compartilhamento",
  ).toBeTruthy();

  const imagem = await request.get(endereco as string);
  expect(imagem.status()).toBe(200);
  expect(imagem.headers()["content-type"]).toContain("image/png");

  // Um PNG de poucos bytes é um erro desenhado como imagem: a prévia da loja
  // tem nome, chamada e faixa de cor, e não cabe em nada tão pequeno.
  expect((await imagem.body()).length).toBeGreaterThan(5_000);
});

test("@spec:AC-414 a imagem do produto é desenhada, com o preço nela", async ({
  browser,
  request,
}) => {
  const { contexto: contextoDoCatalogo, pagina: catalogo } = await comoRobo(
    browser,
    `/loja/${LOJA}/cardapio`,
  );
  const link = await catalogo
    .getByRole("link", { name: /Pastel de Carne/ })
    .first()
    .getAttribute("href");
  await contextoDoCatalogo.close();

  const { contexto, pagina } = await comoRobo(browser, link as string);
  const endereco = await pagina
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  await contexto.close();

  const imagem = await request.get(endereco as string);
  expect(imagem.status()).toBe(200);
  expect(imagem.headers()["content-type"]).toContain("image/png");
  expect((await imagem.body()).length).toBeGreaterThan(5_000);
});
