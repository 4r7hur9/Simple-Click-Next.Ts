/**
 * Compara a LOJA REAL com a PRÉVIA da Aparência, lado a lado (card #36).
 *
 *   node scripts/prints-do-recorte/loja-real-vs-previa.mjs [loja] [http://localhost:3000]
 *
 * Abre `/loja/<loja>` e `/loja/<loja>/previa/vitrine`, e
 * `/loja/<loja>/cardapio` e `/loja/<loja>/previa/cardapio`, no computador
 * (1280 × 800) e no celular (390 × 844), e grava os prints e a diferença em
 * /tmp/sc36. A prévia é a mesma tela da loja: a diferença tem de ser zero (fora
 * a barra do usuário, que só a loja pública tem).
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../../e2e/node_modules/@playwright/test/index.mjs";

const LOJA = process.argv[2] && !process.argv[2].startsWith("http") ? process.argv[2] : "universokar";
const SITE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SAIDA = "/tmp/sc36";
mkdirSync(SAIDA, { recursive: true });
const sharp = createRequire(
  createRequire(join(RAIZ, "apps/web/package.json")).resolve("next"),
)("sharp");

const APARELHOS = {
  computador: { width: 1280, height: 800 },
  celular: { width: 390, height: 844 },
};
const PARES = [
  ["vitrine", `/loja/${LOJA}`, `/loja/${LOJA}/previa/vitrine`],
  ["cardapio", `/loja/${LOJA}/cardapio`, `/loja/${LOJA}/previa/cardapio`],
];
// Só a loja pública tem a barra do usuário e o aviso de cookies.
const ESCONDER = ".sc-cookies, .sc-usuario-lateral, [data-lateral-do-usuario] { display: none !important }";

const navegador = await chromium.launch();
const resultado = [];
for (const [aparelho, tela] of Object.entries(APARELHOS)) {
  const contexto = await navegador.newContext({ viewport: tela, deviceScaleFactor: 1 });
  for (const [parte, real, previa] of PARES) {
    const imagens = {};
    for (const [nome, caminho] of [["real", real], ["previa", previa]]) {
      const pagina = await contexto.newPage();
      await pagina.goto(SITE + caminho, { waitUntil: "networkidle" });
      await pagina.addStyleTag({ content: ESCONDER });
      await pagina.waitForTimeout(1500); // as animações de entrada terminam
      const arquivo = join(SAIDA, `${LOJA}-${parte}-${aparelho}-${nome}.png`);
      imagens[nome] = await pagina.screenshot({ path: arquivo });
      await pagina.close();
    }
    const a = await sharp(imagens.real).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(imagens.previa).raw().toBuffer({ resolveWithObject: true });
    let diferentes = 0;
    const total = a.info.width * a.info.height;
    const mapa = Buffer.alloc(total * 3);
    for (let i = 0; i < total; i += 1) {
      const d =
        Math.abs(a.data[i * a.info.channels] - b.data[i * b.info.channels]) +
        Math.abs(a.data[i * a.info.channels + 1] - b.data[i * b.info.channels + 1]) +
        Math.abs(a.data[i * a.info.channels + 2] - b.data[i * b.info.channels + 2]);
      if (d > 24) {
        diferentes += 1;
        mapa[i * 3] = 255;
      } else {
        mapa[i * 3 + 1] = Math.round(a.data[i * a.info.channels] / 4);
      }
    }
    await sharp(mapa, { raw: { width: a.info.width, height: a.info.height, channels: 3 } })
      .png()
      .toFile(join(SAIDA, `${LOJA}-${parte}-${aparelho}-diferenca.png`));
    // Lado a lado: real | prévia.
    await sharp({
      create: { width: a.info.width * 2 + 20, height: a.info.height, channels: 3, background: "#888" },
    })
      .composite([
        { input: imagens.real, left: 0, top: 0 },
        { input: imagens.previa, left: a.info.width + 20, top: 0 },
      ])
      .png()
      .toFile(join(SAIDA, `${LOJA}-${parte}-${aparelho}-lado-a-lado.png`));
    const percentual = (100 * diferentes) / total;
    resultado.push({ parte, aparelho, diferentes, percentual: Number(percentual.toFixed(3)) });
    process.stdout.write(`${parte} ${aparelho}: ${diferentes} px diferentes (${percentual.toFixed(3)}%)\n`);
  }
  await contexto.close();
}
await navegador.close();
writeFileSync(join(SAIDA, "resultado.json"), JSON.stringify(resultado, null, 2));
