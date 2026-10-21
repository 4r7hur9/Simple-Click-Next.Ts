/**
 * Refaz as TELAS REAIS do app que a landing mostra dentro dos aparelhos.
 *
 * São capturas do SimpleClick rodando em desenvolvimento, com as lojas e as
 * contas da demonstração (seed/demo). Rode com o site e a API de pé (pode
 * rodar quantas vezes quiser: cada tela apaga e refaz os próprios arquivos):
 *
 *   node scripts/telas-da-landing/gerar.mjs [http://localhost:3000] [so=nome,nome]
 *
 * CELULAR = iPhone Pro Max: tela de 440×956 pt, gravada em 3x (1320×2868).
 * A página é aberta abaixo da barra de status (440×894: os 62 pt de cima são
 * a área segura do iOS) e o print é esticado em cima repetindo a primeira
 * linha da própria página. Embaixo o conteúdo corre até a borda, como no
 * iPhone. A barra de status, a ilha e o indicador de início são desenhados
 * por cima, em CSS (features/landing/cenas/aparelhos.css).
 * NOTEBOOK = 1440×900 em 2x.
 *
 * Cada tela sai em AVIF e WebP, em três larguras (srcset):
 *   celular  480 · 880 (sem sufixo) · 1320
 *   notebook 960 · 1440 (sem sufixo) · 2880
 *
 * A HISTÓRIA É DE UM PRODUTO SÓ: o hambúrguer "Brasa Clássico", da Brasa
 * Burger. A foto ilustrada da demonstração é trocada, só no print, pela foto
 * real em public/landing/produtos/hamburguer-foto.webp — como o dono faria ao
 * cadastrar o produto. Depois a UniversoKar, com o filtro de óleo dela.
 *
 * Grava em apps/web/public/landing/app/ e reescreve
 * apps/web/src/features/landing/telas-do-app.ts com as medidas de cada tela e
 * onde fica, na tela, a foto do produto protagonista (para a landing encaixar
 * a foto exatamente ali).
 *
 * Nada é gravado no banco: a sacola mora no navegador e o fechamento é só
 * aberto, nunca enviado.
 */
/* global document, NodeFilter -- trechos que rodam dentro da página */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../../e2e/node_modules/@playwright/test/index.mjs";

const argumentos = process.argv.slice(2);
const SITE = argumentos.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const SO = argumentos.find((a) => a.startsWith("so="))?.slice(3).split(",");
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DESTINO = join(RAIZ, "apps/web/public/landing/app");
const MEDIDAS = join(RAIZ, "apps/web/src/features/landing/telas-do-app.ts");
const sharp = createRequire(
  createRequire(join(RAIZ, "apps/web/package.json")).resolve("next"),
)("sharp");

const CLIENTE = { email: "ana.ribeiro@cliente.test", senha: "SenhaTeste!2026x" };
const DONO_DA_BRASA = { email: "francisco@brasa-burger.test", senha: "DemoSimpleClick2026" };

/** O produto protagonista e a foto real que entra no lugar da ilustração. */
const PROTAGONISTA = "Brasa Clássico";
const FOTO_DO_PROTAGONISTA = "/landing/app/foto-hamburguer.webp";
/** A peça da UniversoKar que assume o destaque no segundo ramo (a mesma do recorte). */
const PECA = "TAMBOR FR CELTA";
const API = process.env.API ?? "http://localhost:3001";

/** A tela do iPhone Pro Max, em pontos, e as faixas que o iOS reserva. */
const TELA = { largura: 440, altura: 956, status: 62 };
const CELULAR = {
  viewport: { width: TELA.largura, height: TELA.altura - TELA.status },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};
const COMPUTADOR = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };

/** Larguras de cada tela; a do meio é o arquivo sem sufixo (o `src` padrão). */
const LARGURAS = { celular: [480, 880, 1320], notebook: [960, 1440, 2880] };

/** Nada de aviso de desenvolvimento, tutorial, cookies nem barra de rolagem no print. */
const LIMPEZA = `.sc-tutorial,.sc-cookies,nextjs-portal{display:none!important}
*{caret-color:transparent!important;scrollbar-width:none!important}
*::-webkit-scrollbar{display:none!important}`;

/** Rastro de teste do banco de desenvolvimento não vai para página pública. */
const TROCAS = [
  [/Novo, cadastrado no teste do card \d+\.?/, "Blend de 160 g na brasa, cheddar e cebola caramelizada."],
  [/^Cliente Teste$/i, "Rafael Duarte"],
  [/arthur[^\n]*/i, "Larissa Campos"],
];

mkdirSync(DESTINO, { recursive: true });
const medidas = existsSync(MEDIDAS)
  ? JSON.parse(readFileSync(MEDIDAS, "utf8").match(/\/\* json \*\/ ([\s\S]*) as const;/)?.[1] ?? "{}")
  : {};
const quer = (nome) => !SO || SO.includes(nome);

/**
 * A foto "do dono" do Brasa Clássico: o MESMO hambúrguer recortado da landing
 * (public/landing/produtos, card #86), sobre fundo escuro de estúdio, quadrada
 * como a foto de produto que o painel pede.
 */
{
  const PRODUTOS = join(RAIZ, "apps/web/public/landing/produtos");
  const lado = 1000;
  const burger = await sharp(join(PRODUTOS, "hamburguer-800.webp")).resize({ width: 820 }).toBuffer();
  const { height: alturaDoBurger } = await sharp(burger).metadata();
  const sombra = await sharp(join(PRODUTOS, "sombra.webp")).resize({ width: 900, height: 200, fit: "fill" }).toBuffer();
  const topo = Math.round((lado - alturaDoBurger) / 2) - 20;
  const fundo = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"><defs><radialGradient id="l" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#2a2d2b"/><stop offset="1" stop-color="#0d0f0e"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#l)"/></svg>`,
  );
  await sharp(fundo)
    .composite([
      { input: sombra, left: 50, top: topo + alturaDoBurger - 110 },
      { input: burger, left: 90, top: topo },
    ])
    .webp({ quality: 84 })
    .toFile(join(DESTINO, "foto-hamburguer.webp"));
}

const navegador = await chromium.launch();

async function novoContexto(aparelho) {
  return navegador.newContext({
    ...aparelho,
    colorScheme: "dark",
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
  });
}

/** Limpa a tela, troca textos de teste e põe a foto real no protagonista. */
async function arrumar(pagina) {
  await pagina.addStyleTag({ content: LIMPEZA });
  await pagina.evaluate(
    ({ trocas, protagonista, foto }) => {
      const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let no = andar.nextNode(); no; no = andar.nextNode()) {
        for (const [padrao, flags, novo] of trocas) {
          const re = new RegExp(padrao, flags);
          if (re.test(no.textContent ?? "")) no.textContent = (no.textContent ?? "").replace(re, novo);
        }
      }
      // A foto do protagonista: no cartão do cardápio e na página do produto.
      for (const imagem of document.querySelectorAll("img")) {
        const doCartao = imagem.closest(".sc-vitrine__cartao, li");
        const nome = doCartao
          ? (doCartao.querySelector(".sc-vitrine__nome")?.textContent ?? doCartao.textContent ?? "")
          : imagem.alt ?? "";
        if (!nome.trim().startsWith(protagonista) && !(imagem.alt ?? "").startsWith(protagonista)) continue;
        imagem.removeAttribute("srcset");
        imagem.src = foto;
        Object.assign(imagem.style, {
          objectFit: "cover",
          inlineSize: "100%",
          blockSize: "100%",
          transform: "none",
          filter: "none",
        });
      }
    },
    {
      trocas: TROCAS.map(([re, novo]) => [re.source, re.flags, novo]),
      protagonista: PROTAGONISTA,
      foto: `${SITE}${FOTO_DO_PROTAGONISTA}`,
    },
  );
  await pagina.waitForLoadState("networkidle");
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForTimeout(500);
}

/**
 * O banco de desenvolvimento envelhece: no quadro, "há 69 h 32 min" e
 * "· de 17/10" viram tempos de um balcão de verdade, do mais novo ao mais velho.
 */
async function pedidosDeAgora(pagina) {
  await pagina.evaluate(() => {
    const tempos = ["há 3 min", "há 8 min", "há 14 min", "há 19 min", "há 26 min", "há 32 min", "há 41 min", "há 47 min"];
    let i = 0;
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let no = andar.nextNode(); no; no = andar.nextNode()) {
      const texto = no.textContent ?? "";
      if (/há \d+ h( \d+ min)?/.test(texto)) no.textContent = texto.replace(/há \d+ h( \d+ min)?/, tempos[i++ % tempos.length]);
      else if (/^\s*·?\s*de \d{2}\/\d{2}\s*$/.test(texto)) no.textContent = "";
    }
  });
}

async function entrar(contexto, conta) {
  const pagina = await contexto.newPage();
  await pagina.goto(`${SITE}/entrar`, { waitUntil: "networkidle" });
  await pagina.addStyleTag({ content: LIMPEZA });
  await pagina.fill('input[name="email"]', conta.email);
  await pagina.fill('input[name="senha"]', conta.senha);
  await Promise.all([
    pagina.waitForURL((url) => !url.pathname.startsWith("/entrar"), { timeout: 30_000 }),
    pagina.click('button[type="submit"]'),
  ]);
  return pagina;
}

async function abrir(pagina, caminho, espera = 1200) {
  await pagina.goto(`${SITE}${caminho}`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(espera);
  await arrumar(pagina);
}

/**
 * Grava o print em AVIF e WebP nas larguras do aparelho e guarda as medidas.
 * No celular, estica antes a faixa da barra de status.
 */
async function salvar(png, nome, aparelho = "celular") {
  let mestre = png;
  if (aparelho === "celular") {
    const escala = CELULAR.deviceScaleFactor;
    mestre = await sharp(png)
      .extend({ top: TELA.status * escala, extendWith: "copy" })
      .png()
      .toBuffer();
  }
  const { width, height } = await sharp(mestre).metadata();
  for (const arquivo of readdirSync(DESTINO)) {
    if (new RegExp(`^${nome}(-\\d+)?\\.(webp|avif)$`).test(arquivo)) rmSync(join(DESTINO, arquivo));
  }
  const larguras = LARGURAS[aparelho];
  const padrao = larguras[1];
  const pesos = [];
  for (const largura of larguras) {
    const sufixo = largura === padrao ? "" : `-${largura}`;
    const reduzido = sharp(mestre).resize({ width: largura });
    const webp = await reduzido.clone().webp({ quality: 80, effort: 6 }).toFile(join(DESTINO, `${nome}${sufixo}.webp`));
    const avif = await reduzido.clone().avif({ quality: 52, effort: 6 }).toFile(join(DESTINO, `${nome}${sufixo}.avif`));
    pesos.push(`${largura}: ${Math.round(avif.size / 1024)}/${Math.round(webp.size / 1024)} KB`);
  }
  const anterior = medidas[nome] ?? {};
  medidas[nome] = {
    largura: width,
    altura: height,
    larguras,
    padrao,
    ...(anterior.foto ? { foto: anterior.foto } : {}),
  };
  process.stdout.write(`✔ ${nome} (${width}×${height}; avif/webp ${pesos.join(" · ")})\n`);
}

/** Onde está, na tela inteira (fração de 440×956), a foto do cartão que tem o nome dado. */
async function ondeEstaAFoto(pagina, nome) {
  return pagina.evaluate(
    ({ nome, tela }) => {
      const cartao = [...document.querySelectorAll(".sc-vitrine__cartao")].find((el) =>
        (el.querySelector(".sc-vitrine__nome")?.textContent ?? "").startsWith(nome),
      );
      const foto = cartao?.querySelector(".sc-vitrine__moldura") ?? cartao?.querySelector("img");
      if (!foto) return null;
      const r = foto.getBoundingClientRect();
      return {
        x: +(r.left / tela.largura).toFixed(4),
        y: +((r.top + tela.status) / tela.altura).toFixed(4),
        largura: +(r.width / tela.largura).toFixed(4),
        altura: +(r.height / tela.altura).toFixed(4),
      };
    },
    { nome, tela: TELA },
  );
}

// --- 1. a vitrine da Brasa Burger e a da UniversoKar --------------------------
{
  const contexto = await novoContexto(CELULAR);
  const pagina = await contexto.newPage();
  if (quer("loja")) {
    await abrir(pagina, "/loja/brasa-burger");
    await salvar(await pagina.screenshot(), "loja");
  }
  if (quer("cardapio")) {
    await abrir(pagina, "/loja/brasa-burger/cardapio");
    const foto = await ondeEstaAFoto(pagina, PROTAGONISTA);
    await salvar(await pagina.screenshot(), "cardapio");
    if (foto) medidas.cardapio.foto = foto;
  }
  if (quer("produto-autopecas")) {
    const resposta = await fetch(
      `${API}/v1/vitrine/universokar/catalogo/produtos?busca=${encodeURIComponent("tambor celta")}&limite=5`,
    ).then((r) => r.json());
    const peca = resposta.produtos.find((p) => p.nome.startsWith(PECA));
    await abrir(pagina, `/loja/universokar/produto/${peca.id}`, 1500);
    await salvar(await pagina.screenshot(), "produto-autopecas");
  }
  await contexto.close();
}

// --- 2. quem compra: produto → sacola → fechamento ---------------------------
if (quer("produto") || quer("sacola") || quer("fechamento")) {
  const contexto = await novoContexto(CELULAR);
  const pagina = await entrar(contexto, CLIENTE);
  await abrir(pagina, "/loja/brasa-burger/cardapio");
  const endereco = await pagina
    .locator("a.sc-vitrine__link", { hasText: PROTAGONISTA })
    .first()
    .getAttribute("href");
  await abrir(pagina, endereco, 1500);
  if (quer("produto")) await salvar(await pagina.screenshot(), "produto");

  // Duas unidades, pelo botão de verdade da página do produto.
  await pagina.getByRole("button", { name: /Aumentar/i }).first().click().catch(() => {});
  await pagina.getByRole("button", { name: /Adicionar/i }).last().click();
  await pagina.waitForTimeout(1000);
  await abrir(pagina, "/loja/brasa-burger/cardapio");
  await pagina.getByRole("button", { name: /Abrir o carrinho/i }).first().click();
  await pagina.waitForTimeout(1300);
  await arrumar(pagina);
  if (quer("sacola")) await salvar(await pagina.screenshot(), "sacola");

  if (quer("fechamento")) {
    await pagina.getByRole("button", { name: /^Fechar pedido/i }).last().click();
    await pagina.waitForTimeout(2200);
    await arrumar(pagina);
    await salvar(await pagina.screenshot(), "fechamento");
  }
  await contexto.close();
}

// --- 3. o painel do dono da Brasa Burger (no computador) --------------------------
if (quer("painel-pedidos") || quer("painel-metricas")) {
  const contexto = await novoContexto(COMPUTADOR);
  const pagina = await entrar(contexto, DONO_DA_BRASA);
  if (quer("painel-pedidos")) {
    await abrir(pagina, "/painel/pedidos", 1800);
    await pedidosDeAgora(pagina);
    await salvar(await pagina.screenshot(), "painel-pedidos", "notebook");
  }
  if (quer("painel-metricas")) {
    await abrir(pagina, "/painel?periodo=7d", 1800);
    await salvar(await pagina.screenshot(), "painel-metricas", "notebook");
  }
  await contexto.close();
}

await navegador.close();

writeFileSync(
  MEDIDAS,
  `/**
 * GERADO por scripts/telas-da-landing/gerar.mjs — não edite à mão.
 *
 * As medidas de cada tela real em public/landing/app/ (o maior arquivo), as
 * larguras gravadas (\`padrao\` é o arquivo sem sufixo) e, nas telas de
 * cardápio, onde fica a foto do produto protagonista (fração da tela inteira
 * do celular, 440×956).
 */
export const TELAS_DO_APP = /* json */ ${JSON.stringify(medidas, null, 2)} as const;
`,
);
