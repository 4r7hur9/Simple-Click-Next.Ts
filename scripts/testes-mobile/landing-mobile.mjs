#!/usr/bin/env node
/* global window, document, Node, getComputedStyle, innerWidth, innerHeight */
/** QA visual móvel da landing. Rode com a aplicação já disponível em BASE_URL. */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseURL = process.env.BASE_URL ?? "http://localhost:3000/";
const saida = process.env.ARTIFACTS_DIR ?? path.join(tmpdir(), "simpleclick-landing-mobile");
const dispositivos = [
  { nome: "iphone-15-pro-max", largura: 430, altura: 932 },
  { nome: "iphone-se", largura: 375, altura: 667 },
  { nome: "iphone-390", largura: 390, altura: 844 },
  { nome: "pixel-7", largura: 412, altura: 915 },
  { nome: "galaxy-s", largura: 360, altura: 800 },
];
const amostras = new Set(["inicio", "taxas-numeros", "comparar", "comecar"]);

function anotarTrechoInacessivel(condicao, identificador, lista) {
  if (condicao) lista.push(identificador);
}

async function capturarSe(pagina, condicao, caminho) {
  if (condicao) await pagina.screenshot({ path: caminho });
}

async function carregarPlaywright() {
  const store = path.join(raiz, "node_modules/.pnpm");
  const pacotes = (await readdir(store)).filter((item) => item.startsWith("playwright@"));
  assert(pacotes.length, "Playwright não está instalado no node_modules/.pnpm");
  const candidato = pacotes.sort().at(-1);
  const entrada = path.join(store, candidato, "node_modules/playwright/index.mjs");
  return import(pathToFileURL(entrada).href);
}

const { chromium } = await carregarPlaywright();
await mkdir(saida, { recursive: true });
const browser = await chromium.launch({ headless: true });
const relatorio = [];
const falhas = [];

try {
  for (const dispositivo of dispositivos) {
    const contexto = await browser.newContext({
      viewport: { width: dispositivo.largura, height: dispositivo.altura },
      screen: { width: dispositivo.largura, height: dispositivo.altura },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "no-preference",
      recordVideo: { dir: saida, size: { width: dispositivo.largura, height: dispositivo.altura } },
    });
    const pagina = await contexto.newPage();
    const cdp = await contexto.newCDPSession(pagina);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 4 * 1024 * 1024 / 8,
      uploadThroughput: 768 * 1024 / 8,
      connectionType: "cellular4g",
    });
    await pagina.addInitScript(() => {
      window.__lpLcp = 0;
      new PerformanceObserver((lista) => {
        const ultimo = lista.getEntries().at(-1);
        if (ultimo) window.__lpLcp = ultimo.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });

    const errosDeConsole = [];
    pagina.on("pageerror", (erro) => errosDeConsole.push(erro.message));
    const resposta = await pagina.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    assert(resposta?.ok(), `${dispositivo.nome}: HTTP ${resposta?.status() ?? "sem resposta"}`);
    await pagina.locator(".sc-lp").waitFor({ state: "visible", timeout: 20_000 });
    await pagina.evaluate(() => document.fonts?.ready.then(() => true));
    await pagina.waitForTimeout(700);
    // O nível de efeitos sai só depois da hidratação e dos 500 ms de medição de FPS.
    await pagina.waitForFunction(() => document.querySelector(".sc-lp")?.hasAttribute("data-efeitos"), null, { timeout: 15_000 }).catch(() => {});

    const medidas = await pagina.evaluate(() => {
      const raiz = document.documentElement;
      const corpo = document.body;
      const seletorAlvos = "a[href], button, summary, [role='button']";
      const alvos = [...document.querySelectorAll(seletorAlvos)].filter((no) => {
        const caixa = no.getBoundingClientRect();
        return caixa.width > 0 && caixa.height > 0 && getComputedStyle(no).visibility !== "hidden";
      });
      const pequenos = alvos.map((no) => {
        const { width, height } = no.getBoundingClientRect();
        return { texto: (no.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80), width: Math.round(width), height: Math.round(height) };
      }).filter((alvo) => alvo.width < 44 || alvo.height < 44);
      const largos = [...document.querySelectorAll(".sc-lp *, footer.sc-rodape")].map((no) => {
        const caixa = no.getBoundingClientRect();
        return { classe: typeof no.className === "string" ? no.className : no.tagName.toLowerCase(), left: Math.round(caixa.left), right: Math.round(caixa.right), width: caixa.width };
      }).filter((caixa) => caixa.width > 0 && (caixa.left < -1 || caixa.right > innerWidth + 1)).slice(0, 30);
      const textoCortado = [...document.querySelectorAll(".sc-lp *")].flatMap((no) => {
        const texto = [...no.childNodes].filter((filho) => filho.nodeType === Node.TEXT_NODE).map((filho) => filho.textContent ?? "").join(" ").trim();
        if (!texto) return [];
        const estilo = getComputedStyle(no);
        const caixa = no.getBoundingClientRect();
        // Texto só para leitor de tela (sr-only: caixa 1×1 ou recortada) não conta.
        const soLeitor = (caixa.width <= 1 && caixa.height <= 1) || /^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(estilo.clip) || estilo.clipPath === "inset(50%)";
        if (soLeitor) return [];
        if (!["hidden", "clip"].includes(estilo.overflowX) && !["hidden", "clip"].includes(estilo.overflowY)) return [];
        if (no.scrollWidth <= no.clientWidth + 1 && no.scrollHeight <= no.clientHeight + 1) return [];
        return [{ texto: texto.replace(/\s+/g, " ").slice(0, 80), classe: typeof no.className === "string" ? no.className : no.tagName.toLowerCase(), largura: Math.round(caixa.width), altura: Math.round(caixa.height) }];
      }).slice(0, 30);
      const secoes = [...document.querySelectorAll(".sc-lp-momento, [data-tela-de-dados], section[data-tela], .sc-lp-convite, footer.sc-rodape")]
        .map((no) => ({ id: no.id || no.getAttribute("data-tela") || no.getAttribute("data-tela-de-dados") || no.tagName.toLowerCase(), texto: (no.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 90) }));
      const cta = document.querySelector(".sc-lp-topo__criar");
      const ctaCaixa = cta?.getBoundingClientRect();
      const cookies = document.querySelector(".sc-cookies");
      const cookiesCaixa = cookies?.getBoundingClientRect();
      const ctAsSobCookies = cookiesCaixa ? [...document.querySelectorAll(".sc-lp-botao")].filter((botao) => {
        const caixa = botao.getBoundingClientRect();
        return caixa.width > 0 && caixa.height > 0 && caixa.left < cookiesCaixa.right && caixa.right > cookiesCaixa.left && caixa.top < cookiesCaixa.bottom && caixa.bottom > cookiesCaixa.top;
      }).map((botao) => (botao.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60)) : [];
      return {
        largura: innerWidth,
        altura: innerHeight,
        alturaVisual: Math.round(window.visualViewport?.height ?? innerHeight),
        escalaVisual: window.visualViewport?.scale ?? 1,
        larguraDocumento: Math.max(raiz.scrollWidth, corpo.scrollWidth),
        rolagemHorizontal: Math.max(raiz.scrollWidth, corpo.scrollWidth) > innerWidth + 1,
        elementosForaDaTela: largos,
        textoCortado,
        alvosMenoresQue44px: pequenos,
        secoes,
        ctaTopoVisivel: Boolean(ctaCaixa && ctaCaixa.width >= 44 && ctaCaixa.height >= 44 && ctaCaixa.top >= 0 && ctaCaixa.bottom <= innerHeight),
        avisoCookies: cookiesCaixa ? { altura: Math.round(cookiesCaixa.height), cobreCtas: ctAsSobCookies } : null,
        nivelDeEfeitos: document.querySelector(".sc-lp")?.getAttribute("data-efeitos"),
        lcpMs: Math.round(window.__lpLcp ?? 0),
      };
    });

    await pagina.screenshot({ path: path.join(saida, `${dispositivo.nome}-topo.png`) });

    const trechos = await pagina.locator(".sc-lp-momento, [data-tela-de-dados], section[data-tela], .sc-lp-convite, footer.sc-rodape").all();
    const trechosInacessiveis = [];
    for (const trecho of trechos) {
      const identificador = await trecho.evaluate((no) => no.id || no.getAttribute("data-tela") || no.getAttribute("data-tela-de-dados") || no.tagName.toLowerCase());
      await trecho.evaluate((no) => no.scrollIntoView({ behavior: "instant", block: "start" }));
      await pagina.waitForTimeout(230);
      const estado = await trecho.evaluate((no) => {
        const caixa = no.getBoundingClientRect();
        const estilo = getComputedStyle(no);
        return {
          visivel: estilo.display !== "none" && estilo.visibility !== "hidden" && caixa.height > 0,
          noDocumento: caixa.bottom > 0 && caixa.top < document.documentElement.scrollHeight,
        };
      });
      anotarTrechoInacessivel(!estado.visivel || !estado.noDocumento, identificador, trechosInacessiveis);
      await capturarSe(pagina, amostras.has(identificador), path.join(saida, `${dispositivo.nome}-${identificador}.png`));
    }
    await pagina.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await pagina.waitForTimeout(250);
    await pagina.screenshot({ path: path.join(saida, `${dispositivo.nome}-pagina.png`), fullPage: true });

    const resultado = {
      dispositivo: dispositivo.nome,
      ...medidas,
      trechosNaPagina: trechos.length,
      trechosInacessiveis,
      errosDeConsole,
    };
    relatorio.push(resultado);
    if (medidas.rolagemHorizontal) falhas.push(`${dispositivo.nome}: rolagem horizontal (${medidas.larguraDocumento}px), fora: ${JSON.stringify(medidas.elementosForaDaTela)}`);
    if (!medidas.ctaTopoVisivel) falhas.push(`${dispositivo.nome}: CTA do topo cortado ou menor que 44px`);
    if (medidas.alvosMenoresQue44px.length) falhas.push(`${dispositivo.nome}: alvos menores que 44px: ${JSON.stringify(medidas.alvosMenoresQue44px)}`);
    if (medidas.textoCortado.length) falhas.push(`${dispositivo.nome}: texto cortado: ${JSON.stringify(medidas.textoCortado)}`);
    if (!medidas.nivelDeEfeitos) falhas.push(`${dispositivo.nome}: data-efeitos não apareceu em .sc-lp`);
    if (!(medidas.lcpMs > 0 && medidas.lcpMs < 2500)) falhas.push(`${dispositivo.nome}: LCP ${medidas.lcpMs}ms (meta < 2500ms)`);
    if (trechosInacessiveis.length) falhas.push(`${dispositivo.nome}: trechos inacessíveis: ${trechosInacessiveis.join(", ")}`);
    if (errosDeConsole.length) falhas.push(`${dispositivo.nome}: erros de runtime: ${errosDeConsole.join(" | ")}`);
    assert.equal(trechosInacessiveis.length, 0, `${dispositivo.nome}: trechos inacessíveis: ${trechosInacessiveis.join(", ")}`);
    assert.equal(errosDeConsole.length, 0, `${dispositivo.nome}: erros de runtime: ${errosDeConsole.join(" | ")}`);
    const video = pagina.video();
    await contexto.close();
    if (video) await video.saveAs(path.join(saida, `${dispositivo.nome}-rolagem.webm`));
  }
} finally {
  await browser.close();
}

const arquivo = path.join(saida, "relatorio.json");
await writeFile(arquivo, `${JSON.stringify({ relatorio, falhas }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ saida, relatorio, falhas }, null, 2)}\n`);
if (falhas.length) process.exitCode = 1;
