/**
 * Mede o painel do catálogo numa loja grande (card #76).
 *
 *   node scripts/desempenho-painel/medir.mjs [http://localhost:3000] [rotulo]
 *
 * Entra como dono da UniversoKar (10 mil produtos) e cronometra, em 1400×900:
 * a casca do painel sozinha (/painel/ajuda, como referência), abrir /painel/produtos, ordenar por preço, buscar, abrir /painel/estoque,
 * buscar no estoque, abrir /painel/variacoes e /painel/opcoes. Cada medida vai
 * do comando até a tabela/lista estar na tela. Também tira um print de cada
 * tela em 1400 e 390. Sai em /tmp/sc76/<rotulo>/ (relatorio.json e prints).
 * O Chromium é headless e próprio; não usa navegador compartilhado.
 */
/* global document */
/* eslint-disable no-console -- o relatório da medida sai no terminal */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "../../e2e/node_modules/@playwright/test/index.mjs";

const SITE = process.argv[2] ?? "http://localhost:3000";
const ROTULO = process.argv[3] ?? "medida";
const DESTINO = join("/tmp/sc76", ROTULO);
mkdirSync(DESTINO, { recursive: true });
const CONTA = { email: "dono@universokar.test", senha: "DemoSimpleClick2026" };
const LIMITE = 90_000;

async function entrar(contexto) {
  const pagina = await contexto.newPage();
  await pagina.goto(`${SITE}/entrar`, { waitUntil: "networkidle" });
  await pagina.fill('input[name="email"]', CONTA.email);
  await pagina.fill('input[name="senha"]', CONTA.senha);
  await Promise.all([
    pagina.waitForURL((url) => !url.pathname.startsWith("/entrar"), {
      timeout: 30_000,
    }),
    pagina.click('button[type="submit"]'),
  ]);
  if (pagina.url().includes("escolher-loja")) {
    const alvo = pagina.getByRole("button", { name: /UniversoKar/i });
    const link = pagina.getByRole("link", { name: /UniversoKar/i });
    const escolha = (await alvo.count()) ? alvo : link;
    if (await escolha.count()) {
      await escolha.first().click();
      await pagina.waitForURL(/\/painel/, { timeout: 30_000 });
    }
  }
  return pagina;
}

/** Espera a lista assentar: sem "Carregando", com linhas ou cartões. */
async function esperarLista(pagina, seletor) {
  await pagina.waitForFunction(
    (sel) =>
      !document.querySelector('[aria-busy="true"]') &&
      document.querySelectorAll(sel).length > 0,
    seletor,
    { timeout: LIMITE, polling: 50 },
  );
}

async function cronometrar(nome, acao) {
  const inicio = performance.now();
  try {
    await acao();
    const ms = Math.round(performance.now() - inicio);
    console.log(`${nome}: ${ms} ms`);
    return { nome, ms };
  } catch (causa) {
    const ms = Math.round(performance.now() - inicio);
    console.log(`${nome}: FALHOU depois de ${ms} ms (${causa.message.split("\n")[0]})`);
    return { nome, ms, falhou: true };
  }
}

const LINHAS = "table tbody tr, .sc-tabela__cartao, ul.grid > li";

const navegador = await chromium.launch({ headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 } });
const pagina = await entrar(contexto);
const medidas = [];

async function contarLinhas() {
  return pagina.evaluate((sel) => document.querySelectorAll(sel).length, LINHAS);
}

// Referência: a casca do painel sozinha (menu, avisos), sem lista nenhuma.
await pagina.goto(`${SITE}/painel/ajuda`, { waitUntil: "networkidle" });
medidas.push(
  await cronometrar("referência: abrir /painel/ajuda", async () => {
    await pagina.goto(`${SITE}/painel/ajuda`, { waitUntil: "commit" });
    await pagina.waitForFunction(() => document.querySelector("main h1"), undefined, {
      timeout: LIMITE,
      polling: 50,
    });
  }),
);

medidas.push(
  await cronometrar("produtos: abrir", async () => {
    await pagina.goto(`${SITE}/painel/produtos`, { waitUntil: "commit" });
    await esperarLista(pagina, LINHAS);
  }),
);
medidas.push({ nome: "produtos: linhas na tela", valor: await contarLinhas() });
await pagina.screenshot({ path: join(DESTINO, "produtos-1400.png") });

medidas.push(
  await cronometrar("produtos: ordenar por preço", async () => {
    const seletor = pagina.getByLabel(/Ordenar por/i);
    if (await seletor.count()) {
      const antes = pagina.url();
      await seletor.first().click();
      await pagina.getByRole("option", { name: /Maior preço/i }).click();
      await pagina.waitForURL((url) => url.toString() !== antes, { timeout: LIMITE });
    } else {
      await pagina.getByRole("button", { name: /^Preço/ }).first().click();
      await pagina.getByRole("button", { name: /^Preço/ }).first().click();
    }
    await esperarLista(pagina, LINHAS);
  }),
);

medidas.push(
  await cronometrar("produtos: buscar 'amortecedor'", async () => {
    const busca = pagina.getByRole("searchbox");
    if (!(await busca.count())) throw new Error("a lista não tem busca");
    const antes = pagina.url();
    await busca.first().fill("amortecedor");
    await pagina.waitForURL((url) => url.toString() !== antes, { timeout: LIMITE });
    await esperarLista(pagina, LINHAS);
  }),
);

for (const [nome, caminho, termo] of [
  ["estoque", "/painel/estoque", "amortecedor"],
  ["variacoes", "/painel/variacoes", null],
  ["opcoes", "/painel/opcoes", null],
]) {
  medidas.push(
    await cronometrar(`${nome}: abrir`, async () => {
      await pagina.goto(`${SITE}${caminho}`, { waitUntil: "commit" });
      await pagina.waitForFunction(
        () =>
          !document.querySelector('[aria-busy="true"]') &&
          document.querySelector('[role="search"]'),
        undefined,
        { timeout: LIMITE, polling: 50 },
      );
    }),
  );
  medidas.push({ nome: `${nome}: linhas na tela`, valor: await contarLinhas() });
  await pagina.screenshot({ path: join(DESTINO, `${nome}-1400.png`) });
  if (termo) {
    medidas.push(
      await cronometrar(`${nome}: buscar '${termo}'`, async () => {
        const busca = pagina.getByRole("searchbox").first();
        await busca.fill(termo);
        await pagina.waitForFunction(
          (t) =>
            !document.querySelector('[aria-busy="true"]') &&
            [...document.querySelectorAll("table tbody tr")].every((tr) =>
              tr.textContent.toLowerCase().includes(t),
            ),
          termo,
          { timeout: LIMITE, polling: 50 },
        );
      }),
    );
  }
}

// Celular: só os prints, para conferir o layout.
const celular = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  storageState: await contexto.storageState(),
});
const pc = await celular.newPage();
for (const nome of ["produtos", "estoque", "variacoes", "opcoes"]) {
  await pc.goto(`${SITE}/painel/${nome}`, { waitUntil: "commit" });
  await pc
    .waitForFunction(() => !document.querySelector('[aria-busy="true"]') && document.querySelector("main h1"), undefined, { timeout: LIMITE })
    .catch(() => {});
  await pc.waitForTimeout(300);
  await pc.screenshot({ path: join(DESTINO, `${nome}-390.png`), fullPage: false });
}

writeFileSync(join(DESTINO, "relatorio.json"), JSON.stringify(medidas, null, 2));
await navegador.close();
