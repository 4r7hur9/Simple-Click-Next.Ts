/**
 * Refaz TODOS os prints do app que a landing mostra.
 *
 * São prints REAIS do sistema em desenvolvimento, com as contas e as lojas da
 * demonstração (seed/demo). Rode com o site e a API de pé, de preferência
 * depois que as telas mudarem:
 *
 *   node scripts/gerar-prints-da-lp/gerar.mjs [http://localhost:3000]
 *
 * Cada tela sai no computador (1440×900) e no celular (390×844, densidade 2),
 * e cada captura vira quatro arquivos em apps/web/public/landing/:
 * `<nome>-<aparelho>-<largura>.avif|webp`, em duas larguras (a da tela e a
 * metade), para o `srcset` da página escolher. O PNG do Playwright é apagado.
 *
 * Não há navegador compartilhado aqui: o Chromium é headless e próprio.
 */
/* global document, NodeFilter -- trechos que rodam dentro da página */
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../../e2e/node_modules/@playwright/test/index.mjs";

const SITE = process.argv[2] ?? "http://localhost:3000";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DESTINO = join(RAIZ, "apps/web/public/landing");
// O sharp já vem com o Next; não é preciso instalar nada.
const sharp = createRequire(
  createRequire(join(RAIZ, "apps/web/package.json")).resolve("next"),
)("sharp");

const DONO = { email: "dono.demo@simpleclick.test", senha: "DemoSimpleClick2026" };
const CLIENTE = { email: "ana.ribeiro@cliente.test", senha: "SenhaTeste!2026x" };

const APARELHOS = {
  computador: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  celular: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};

/** Avisos de desenvolvimento e o tutorial de primeiro acesso não vão para o print. */
const LIMPEZA = `.sc-tutorial,nextjs-portal{display:none!important}
*{caret-color:transparent!important}`;

/**
 * O banco de desenvolvimento guarda rastros de teste (pedido feito com a conta
 * pessoal de quem desenvolve, cliente "Teste", produto "cadastrado no teste do
 * card 6"). Nome de pessoa real não vai para uma página pública: troca só no
 * print, sem tocar no banco.
 */
const TROCAS = [
  [/arthur[^\n]*/i, "Larissa Campos"],
  [/^Cliente Teste$/i, "Rafael Duarte"],
  [/Novo, cadastrado no teste do card \d+/, "Palmito cremoso com azeitona verde."],
  [/\b[\w.+-]*arthur[\w.+-]*@[\w.-]+/i, "larissa@exemplo.com"],
];

mkdirSync(DESTINO, { recursive: true });
// Recomeça do zero: print velho de tela que saiu da lista não fica para trás.
for (const arquivo of readdirSync(DESTINO)) {
  if (/\.(avif|webp|png)$/.test(arquivo)) unlinkSync(join(DESTINO, arquivo));
}

const navegador = await chromium.launch();

async function entrar(contexto, conta) {
  const pagina = await contexto.newPage();
  await pagina.goto(`${SITE}/entrar`, { waitUntil: "networkidle" });
  await pagina.fill('input[name="email"]', conta.email);
  await pagina.fill('input[name="senha"]', conta.senha);
  await Promise.all([
    pagina.waitForURL((url) => !url.pathname.startsWith("/entrar"), {
      timeout: 30_000,
    }),
    pagina.click('button[type="submit"]'),
  ]);
  return pagina;
}

/** O dono da demonstração tem duas lojas: a pastelaria é a de mais movimento. */
async function escolherPastelaria(pagina) {
  await pagina.goto(`${SITE}/escolher-loja`, { waitUntil: "networkidle" });
  const alvo = pagina.getByRole("button", { name: /Abrir Pastelaria/i });
  const link = pagina.getByRole("link", { name: /Abrir Pastelaria/i });
  await ((await alvo.count()) ? alvo : link).first().click();
  await pagina.waitForURL(/\/painel/, { timeout: 30_000 });
}

async function salvar(png, nome, larguraDaTela) {
  for (const largura of [larguraDaTela, Math.round(larguraDaTela / 2)]) {
    const base = join(DESTINO, `${nome}-${largura}`);
    const imagem = sharp(png).resize({ width: largura });
    await imagem.clone().avif({ quality: 55, effort: 6 }).toFile(`${base}.avif`);
    await imagem.clone().webp({ quality: 80 }).toFile(`${base}.webp`);
  }
  unlinkSync(png);
}

async function fotografar(pagina, caminho, nome, aparelho) {
  await pagina.goto(`${SITE}${caminho}`, { waitUntil: "networkidle" });
  await pagina.addStyleTag({ content: LIMPEZA });
  await pagina.evaluate(
    (trocas) => {
      const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let no = andar.nextNode(); no; no = andar.nextNode()) {
        for (const [padrao, flags, novo] of trocas) {
          const re = new RegExp(padrao, flags);
          const texto = no.textContent ?? "";
          if (re.test(texto)) no.textContent = texto.replace(re, novo);
        }
      }
    },
    TROCAS.map(([re, novo]) => [re.source, re.flags, novo]),
  );
  await pagina.waitForTimeout(1800);
  const png = join(DESTINO, `${nome}-${aparelho}.png`);
  await pagina.screenshot({ path: png });
  const { viewport, deviceScaleFactor } = APARELHOS[aparelho];
  await salvar(png, `${nome}-${aparelho}`, viewport.width * deviceScaleFactor);
  process.stdout.write(`✔ ${nome}-${aparelho} ← ${pagina.url()}\n`);
}

async function contexto(aparelho) {
  return navegador.newContext({
    ...APARELHOS[aparelho],
    colorScheme: "light",
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
  });
}

for (const aparelho of Object.keys(APARELHOS)) {
  // --- o painel do dono ---------------------------------------------------
  const doDono = await contexto(aparelho);
  const pagina = await entrar(doDono, DONO);
  await escolherPastelaria(pagina);

  await fotografar(pagina, "/painel?periodo=7d", "metricas", aparelho);
  await fotografar(pagina, "/painel/pedidos", "pedidos", aparelho);

  // A ficha do cliente: o primeiro da lista, que é o de mais pedidos.
  await pagina.goto(`${SITE}/painel/clientes`, { waitUntil: "networkidle" });
  const ficha = await pagina
    .locator('a[href^="/painel/clientes/"]')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .find((href) => /^\/painel\/clientes\/[^/]+$/.test(href ?? "")),
    );
  if (ficha) await fotografar(pagina, ficha, "cliente", aparelho);

  await fotografar(pagina, "/painel/aparencia", "aparencia", aparelho);
  await doDono.close();

  // --- o lado de quem compra ---------------------------------------------
  const doCliente = await contexto(aparelho);
  const daCliente = await entrar(doCliente, CLIENTE);
  await fotografar(daCliente, "/explorar/produtos", "explorar", aparelho);
  await fotografar(daCliente, "/conta", "conta", aparelho);
  await doCliente.close();
}

await navegador.close();
