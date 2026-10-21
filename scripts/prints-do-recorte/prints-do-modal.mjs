/**
 * Prints (Playwright, sem navegador compartilhado) do modal "Ajustar a foto"
 * da Aparência e da prévia da loja real (card #36).
 *
 *   node scripts/prints-do-recorte/prints-do-modal.mjs [loja] [http://localhost:3000]
 *
 * Entra como dono da loja de demonstração, abre a Aparência, envia uma foto de
 * teste (3000 × 2000) pelo modal nas DUAS fotos (fundo da vitrine e topo do
 * cardápio), nas DUAS abas (Computador e Celular), confirma, salva, confere que
 * a loja pública já mostra a foto nova e reabre "Ajustar". No fim DEVOLVE a
 * loja ao estado de antes (tema, apresentação). Os prints vão para /tmp/sc36.
 */
/* global document -- trechos que rodam dentro da página */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../../e2e/node_modules/@playwright/test/index.mjs";

const LOJA = process.argv[2] && !process.argv[2].startsWith("http") ? process.argv[2] : "pastelaria-da-vila";
const SITE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const API = "http://localhost:3001";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SAIDA = "/tmp/sc36";
mkdirSync(SAIDA, { recursive: true });
const sharp = createRequire(createRequire(join(RAIZ, "apps/web/package.json")).resolve("next"))("sharp");

const CONTA = { email: "dono.demo@simpleclick.test", senha: "DemoSimpleClick2026" };
const ORIGEM = { origin: SITE, "content-type": "application/json" };

/** Uma foto de teste com grade, círculo e rótulos: dá para ver o que o corte pega. */
async function fotoDeTeste() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b3a6b"/><stop offset="1" stop-color="#e63946"/></linearGradient></defs>
    <rect width="3000" height="2000" fill="url(#g)"/>
    ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 300}" y1="0" x2="${i * 300}" y2="2000" stroke="#fff" stroke-opacity=".25" stroke-width="4"/>`).join("")}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 300}" x2="3000" y2="${i * 300}" stroke="#fff" stroke-opacity=".25" stroke-width="4"/>`).join("")}
    <circle cx="1500" cy="1000" r="520" fill="#ffd60a"/>
    <text x="1500" y="1060" font-size="190" font-family="Arial" font-weight="700" text-anchor="middle" fill="#111">CENTRO</text>
    <text x="60" y="190" font-size="150" font-family="Arial" font-weight="700" fill="#fff">ESQUERDA</text>
    <text x="2940" y="1900" font-size="150" font-family="Arial" font-weight="700" text-anchor="end" fill="#fff">DIREITA</text>
  </svg>`;
  const arquivo = join(SAIDA, "foto-de-teste.png");
  await sharp(Buffer.from(svg)).png().toFile(arquivo);
  return arquivo;
}

async function entrarNaApi() {
  const resposta = await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: ORIGEM,
    body: JSON.stringify(CONTA),
  });
  return (await resposta.json()).tokenDeAcesso;
}
const comToken = (token) => ({ ...ORIGEM, authorization: `Bearer ${token}` });

const token = await entrarNaApi();
const guardar = async (caminho) => (await fetch(`${API}/v1/lojas/${LOJA}${caminho}`, { headers: comToken(token) })).json();
const antes = { tema: await guardar("/tema"), aparencia: await guardar("/configuracao/aparencia") };

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1400, height: 1000 } });
const pagina = await contexto.newPage();
const imagem = await fotoDeTeste();
pagina.on("response", async (resposta) => {
  if (resposta.url().includes("/api/loja/imagem/") && !resposta.ok()) {
    process.stdout.write(`envio recusado: ${resposta.url()} ${resposta.status()} ${(await resposta.text()).slice(0, 160)}\n`);
  }
});
const registro = [];
const nota = (texto) => {
  registro.push(texto);
  process.stdout.write(`${texto}\n`);
};

try {
  await pagina.goto(`${SITE}/entrar`, { waitUntil: "networkidle" });
  await pagina.locator('input[type="email"], input[name="email"]').first().fill(CONTA.email);
  await pagina.locator('input[type="password"]').first().fill(CONTA.senha);
  await pagina.keyboard.press("Enter");
  await pagina.waitForURL((url) => !url.pathname.startsWith("/entrar"), { timeout: 20000 });
  // A conta tem duas lojas: escolhe a da prova, sempre.
  await pagina.goto(`${SITE}/escolher-loja`, { waitUntil: "networkidle" });
  const aceitar = pagina.getByRole("button", { name: "Aceitar todos" });
  if (await aceitar.isVisible().catch(() => false)) await aceitar.click();
  const nome = LOJA === "lojaboavista" ? "Moda Boa Vista" : "Pastelaria da Vila";
  await pagina.getByRole("button", { name: `Abrir ${nome}` }).click();
  await pagina.waitForURL((url) => url.pathname.startsWith("/painel"), { timeout: 20000 });
  await pagina.goto(`${SITE}/painel/aparencia`, { waitUntil: "networkidle" });
  await pagina.waitForSelector('[data-foto="fundo"]', { timeout: 15000 }).catch(async (erro) => {
    await pagina.screenshot({ path: join(SAIDA, "erro-aparencia.png") });
    throw new Error(`a Aparência não abriu (${pagina.url()}): ${erro.message}`);
  });
  await pagina.screenshot({ path: join(SAIDA, "01-aparencia-1400.png"), fullPage: true });
  nota("01 página Aparência (1400 px)");

  // As duas fotos, cada uma com o modal nas duas abas.
  for (const [chave, rotulo] of [["fundo", "fundo da vitrine"], ["topo", "topo do cardápio"]]) {
    await pagina.setInputFiles(`input[name="arquivo-${chave}"]`, imagem);
    await pagina.waitForSelector("dialog.sc-recortador[open] [data-foto-do-recorte]");
    await pagina.waitForTimeout(400);
    const modal = pagina.locator("dialog.sc-recortador");
    await modal.screenshot({ path: join(SAIDA, `02-modal-${chave}-computador.png`) });
    nota(`02 modal ${rotulo} · aba Computador`);
    await modal.getByRole("tab", { name: "Celular" }).click();
    await pagina.waitForTimeout(300);
    await modal.screenshot({ path: join(SAIDA, `03-modal-${chave}-celular-herdando.png`) });
    nota(`03 modal ${rotulo} · aba Celular (herdando o ajuste do computador)`);
    // Mexe no celular: sobe a foto com o teclado e desmarca a herança.
    await modal.locator(".sc-recortador__moldura").focus();
    for (let i = 0; i < 6; i += 1) await pagina.keyboard.press("Shift+ArrowLeft");
    await pagina.waitForTimeout(200);
    await modal.screenshot({ path: join(SAIDA, `04-modal-${chave}-celular-ajustado.png`) });
    nota(`04 modal ${rotulo} · Celular com ajuste próprio`);
    await modal.getByRole("button", { name: "Usar esta foto" }).click();
    await pagina.waitForSelector("dialog.sc-recortador", { state: "detached", timeout: 30000 }).catch(async (erro) => {
      await pagina.screenshot({ path: join(SAIDA, "erro-modal.png") });
      throw erro;
    });
    await pagina.waitForTimeout(600);
  }

  // A prévia da loja de verdade, nos dois aparelhos.
  await pagina.waitForTimeout(1500);
  const previa = pagina.locator('[data-previa="loja-real"]');
  await previa.screenshot({ path: join(SAIDA, "05-previa-computador.png") });
  await previa.getByRole("button", { name: "Celular" }).click();
  await pagina.waitForTimeout(1800);
  await previa.screenshot({ path: join(SAIDA, "06-previa-celular.png") });
  nota("05/06 prévia da loja real (computador e celular), com as fotos novas");

  // Salvar e conferir na loja pública, na hora.
  await pagina.getByRole("button", { name: "Salvar e publicar" }).click();
  await pagina.waitForFunction(() => document.body.innerText.includes("Aparência publicada"), null, { timeout: 30000 });
  const publica = await contexto.newPage();
  await publica.setViewportSize({ width: 1280, height: 800 });
  await publica.goto(`${SITE}/loja/${LOJA}`, { waitUntil: "networkidle" });
  const fundo = await publica.locator("img.sc-loja__fundo").first().evaluate((img) => ({
    src: img.currentSrc || img.src,
    largura: img.naturalWidth,
    altura: img.naturalHeight,
  }));
  const temaDepois = await guardar("/tema");
  nota(`loja pública logo após salvar: ${fundo.src.split("/").pop()} ${fundo.largura}×${fundo.altura}`);
  nota(`tema salvo: fundo ${temaDepois.fundoVitrine?.split("/").pop()} celular ${temaDepois.fundoVitrineCelular?.split("/").pop()} · ajuste guardado: ${Boolean(temaDepois.ajustesDasFotos?.fundoVitrine?.original)}`);
  if (fundo.src !== temaDepois.fundoVitrine) throw new Error("a loja pública NÃO mostra a foto recém-salva");
  if (Math.abs(fundo.largura / fundo.altura - 4 / 3) > 0.01) throw new Error("a foto de fundo não saiu na moldura 4:3");
  await publica.waitForTimeout(1200);
  await publica.screenshot({ path: join(SAIDA, "07-loja-publica-depois-de-salvar-1280.png") });
  await publica.setViewportSize({ width: 390, height: 844 });
  await publica.reload({ waitUntil: "networkidle" });
  await publica.waitForTimeout(1200);
  const noCelular = await publica.locator("img.sc-loja__fundo").first().evaluate((img) => img.currentSrc);
  nota(`loja pública no celular usa: ${noCelular.split("/").pop()}`);
  if (noCelular !== temaDepois.fundoVitrineCelular) throw new Error("o celular não usa a versão do celular");
  await publica.screenshot({ path: join(SAIDA, "08-loja-publica-depois-de-salvar-390.png") });
  await publica.close();

  // Com a foto nova no ar: a loja real e a prévia continuam idênticas.
  nota(
    execFileSync("node", [join(RAIZ, "scripts/prints-do-recorte/loja-real-vs-previa.mjs"), LOJA, SITE], {
      encoding: "utf8",
    }).trim(),
  );

  // Ajustar de novo: abre com o original e o enquadramento guardados.
  await pagina.locator('[data-ajustar="fundo"]').click();
  await pagina.waitForSelector("dialog.sc-recortador[open] [data-foto-do-recorte]");
  await pagina.waitForTimeout(500);
  await pagina.locator("dialog.sc-recortador").screenshot({ path: join(SAIDA, "09-ajustar-de-novo-computador.png") });
  await pagina.locator("dialog.sc-recortador").getByRole("tab", { name: "Celular" }).click();
  await pagina.waitForTimeout(300);
  await pagina.locator("dialog.sc-recortador").screenshot({ path: join(SAIDA, "10-ajustar-de-novo-celular.png") });
  nota("09/10 'Ajustar' reabre com o original e o ajuste de cada aba");
  await pagina.locator("dialog.sc-recortador").getByRole("button", { name: "Cancelar", exact: true }).click();
} finally {
  // Devolve a loja ao que era.
  const { ajustesDasFotos: _a, corDeFundo: _f, coresDasImagens, ...tema } = antes.tema;
  await fetch(`${API}/v1/lojas/${LOJA}/tema`, {
    method: "PUT",
    headers: comToken(token),
    body: JSON.stringify({ ...tema, coresDasImagens: coresDasImagens ?? {}, ajustesDasFotos: antes.tema.ajustesDasFotos ?? {} }),
  });
  await fetch(`${API}/v1/lojas/${LOJA}/configuracao/aparencia`, {
    method: "PUT",
    headers: comToken(token),
    body: JSON.stringify(antes.aparencia),
  });
  await navegador.close();
  nota("loja devolvida ao estado de antes");
}
