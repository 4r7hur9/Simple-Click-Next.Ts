/**
 * Variantes menores das FOTOS DE PRODUTO recortadas da landing, para o
 * navegador baixar só o que cabe na tela (srcset em
 * features/landing/cenas/Aparelhos.tsx):
 *
 *  - produtos recortados → `<produto>-480.webp`
 *
 * As telas do app NÃO passam por aqui: `gerar.mjs` já grava cada uma em AVIF e
 * WebP nas três larguras. Rode depois de trocar uma foto de produto:
 *   node scripts/telas-da-landing/variantes.mjs
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sharp = createRequire(
  createRequire(join(RAIZ, "apps/web/package.json")).resolve("next"),
)("sharp");

const PRODUTOS = join(RAIZ, "apps/web/public/landing/produtos");

for (const produto of ["hamburguer", "peca"]) {
  const para = join(PRODUTOS, `${produto}-480.webp`);
  const { size } = await sharp(join(PRODUTOS, `${produto}-800.webp`))
    .resize({ width: 480 })
    .webp({ quality: 84, effort: 5 })
    .toFile(para);
  process.stdout.write(`${`${produto}-480.webp`.padEnd(28)} ${Math.round(size / 1024)} KB\n`);
}
