/**
 * Desempenho que importa para quem abre a vitrine no celular (AC-415, AC-416).
 *
 * O primeiro cenário lê a página como buscador ou navegador sem JavaScript: se
 * o catálogo aparece nessa resposta, ele foi desenhado pelo servidor. O
 * segundo cobre o contrato do loader que o Next usa para as imagens públicas.
 */
import { expect, test, type Browser, type TestInfo } from "@playwright/test";

import { urlDaImagemOtimizada } from "../../apps/web/src/lib/imagem.ts";
import { ENDERECO_DO_SITE } from "../playwright.config.ts";

const LOJA = "pastelaria-da-vila";

async function comoRobo(browser: Browser, testInfo: TestInfo) {
  const contexto = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: ENDERECO_DO_SITE,
  });
  const pagina = await contexto.newPage();

  // A prova de 2,5 s é feita no projeto celular, sob uma rede móvel comum.
  // O SSR continua sendo exercitado sem JavaScript; a emulação limita a rede
  // entre navegador e site, que é a parte que o cliente realmente paga.
  if (testInfo.project.name === "celular") {
    const devtools = await contexto.newCDPSession(pagina);
    await devtools.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1_600 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      connectionType: "cellular3g",
    });
  }

  return { contexto, pagina, inicio: Date.now() };
}

test("@spec:AC-415 a vitrine chega pronta no HTML sem JavaScript", async ({
  browser,
}, testInfo) => {
  const { contexto, pagina, inicio } = await comoRobo(browser, testInfo);

  const resposta = await pagina.goto(`/loja/${LOJA}/cardapio`, {
    waitUntil: "domcontentloaded",
  });

  expect(resposta?.ok()).toBe(true);
  await expect(
    pagina.getByRole("link", { name: /Pastel de Carne/ }).first(),
  ).toBeVisible();
  expect(await pagina.locator(".sc-vitrine__grade").count()).toBeGreaterThan(0);
  if (testInfo.project.name === "celular") {
    expect(Date.now() - inicio).toBeLessThan(2_500);
  }

  await contexto.close();
});

test("@spec:AC-416 a imagem usa formato automático e largura reservada", () => {
  const original =
    "https://res.cloudinary.com/simpleclick/image/upload/v1/lojas/pastel.webp";
  const otimizada = urlDaImagemOtimizada({ src: original, width: 320 });

  expect(otimizada).toContain("/image/upload/f_auto,q_auto,w_320,c_limit/");
  expect(otimizada).not.toContain("w_1200");
  expect({ width: 320, height: 240 }).toEqual({ width: 320, height: 240 });
});

test("@spec:AC-416 a vitrine publica srcset e reserva a moldura da foto", async ({
  page,
}) => {
  await page.goto(`/loja/${LOJA}/cardapio`);

  const imagens = page.locator("img.sc-vitrine__foto");
  await expect(imagens.first()).toBeVisible();

  const atributos = await imagens.evaluateAll((elementos) =>
    elementos.map((elemento) => ({
      src: elemento.getAttribute("src") ?? "",
      srcset: elemento.getAttribute("srcset") ?? "",
      sizes: elemento.getAttribute("sizes") ?? "",
      width: Number(elemento.getAttribute("width")),
      height: Number(elemento.getAttribute("height")),
    })),
  );

  expect(atributos.length).toBeGreaterThan(0);
  for (const imagem of atributos) {
    expect(imagem.src).not.toContain("w_1200");
    // Candidatas por largura (`256w, 384w, …`). As fotos da carga demo são
    // arquivos locais; as hospedadas na Cloudinary levam também a largura
    // pedida na própria URL (`w_<n>`).
    const candidatas = imagem.srcset.split(",").map((c) => c.trim());
    expect(candidatas.length).toBeGreaterThan(1);
    for (const candidata of candidatas) expect(candidata).toMatch(/ \d+w$/);
    if (imagem.src.includes("res.cloudinary.com")) {
      expect(imagem.srcset).toContain("w_");
    }
    // O cartão do catálogo (#108) reserva 96px no celular, um terço da
    // largura no tablet e 320px no computador (`SIZES_DO_CATALOGO`). O
    // "720px" de antes saiu do código no 7e81202 e o teste não acompanhou.
    expect(imagem.sizes).toBe(
      "(max-width: 767px) 96px, (max-width: 1279px) 33vw, 320px",
    );
    expect(imagem.width).toBe(320);
    expect(imagem.height).toBe(240);
  }
});
