/**
 * Confere os balões "i" (componente Info) de todas as telas com formulário.
 *
 * Rode com o site e a API de pé:
 *
 *   node scripts/campos-explicados/conferir.mjs [http://localhost:3000] [filtro]
 *
 * `filtro` (opcional) limita às rotas cujo nome ou caminho contém o texto.
 * Para cada tela, em 1400×900 e 390×844: tira um print da página, abre cada "i"
 * (print do balão aberto) e confere:
 *
 * - o ícone fica na mesma linha do rótulo;
 * - o ícone não cobre controle, botão nem texto (e nada o cobre);
 * - o balão aberto fica inteiro na tela e não é cortado por rolagem ou modal;
 * - Esc fecha o balão.
 *
 * Também lista os controles sem rótulo visível (só placeholder, número sem
 * unidade, opção em inglês). Sai em /tmp/sc72/: prints e `relatorio.json`.
 * O Chromium é headless e próprio; não usa navegador compartilhado.
 */
/* global document, window, getComputedStyle, CSS -- trechos que rodam dentro da página */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "../../e2e/node_modules/@playwright/test/index.mjs";
import {
  CONTA_CLIENTE,
  CONTA_DONO,
} from "../../packages/database/seed/demo/contas.ts";

const SITE = process.argv[2] ?? "http://localhost:3000";
// O script DIGITA as senhas de demonstração no site: só numa máquina local.
// Apontado para homologação ou produção, entregaria a credencial a esse host.
if (!["localhost", "127.0.0.1"].includes(new URL(SITE).hostname)) {
  console.error(`Recusado: ${SITE} não é local (use localhost ou 127.0.0.1).`);
  process.exit(1);
}
const FILTRO = process.argv[3] ?? "";
const DESTINO = "/tmp/sc72";
mkdirSync(DESTINO, { recursive: true });

// As contas de DEMONSTRAÇÃO vêm de uma fonte só, o seed (card #140): a senha
// não é repetida aqui. Elas valem apenas na base local carregada pelo `demo`.
const CONTAS = {
  dono: CONTA_DONO,
  cliente: CONTA_CLIENTE,
};
// Sem conta de administração (card #163): a demonstração não concede admin, e
// as telas /admin ficam fora deste roteiro.

const APARELHOS = {
  1400: { viewport: { width: 1400, height: 900 } },
  390: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
};

/**
 * O roteiro: cada tela com formulário. `descobrir` acha um id real numa lista
 * (o primeiro link que casa com o padrão). `abrir` são botões que mostram o
 * formulário (modal, "Editar", "Novo").
 */
const ROTEIRO = [
  // --- sem conta ---------------------------------------------------------
  { conta: null, nome: "entrar", caminho: "/entrar" },
  { conta: null, nome: "cadastrar", caminho: "/cadastrar" },
  { conta: null, nome: "vender", caminho: "/vender" },
  { conta: null, nome: "recuperar-senha", caminho: "/recuperar-senha" },
  // --- cliente -----------------------------------------------------------
  { conta: "cliente", nome: "conta-dados", caminho: "/conta/dados" },
  {
    conta: "cliente",
    nome: "conta-enderecos",
    caminho: "/conta/enderecos",
    abrir: [/Cadastrar endereço|Novo endereço|Adicionar endereço/i],
  },
  { conta: "cliente", nome: "conta-seguranca", caminho: "/conta/seguranca" },
  {
    conta: "cliente",
    nome: "loja-vitrine",
    caminho: "/loja/pastelaria-da-vila",
  },
  {
    conta: "cliente",
    nome: "loja-cardapio",
    caminho: "/loja/pastelaria-da-vila/cardapio",
  },
  {
    conta: "cliente",
    nome: "loja-produto",
    descobrir: {
      de: "/loja/pastelaria-da-vila/cardapio",
      padrao: "^/loja/pastelaria-da-vila/produto/[^/]+$",
    },
  },
  {
    conta: "cliente",
    nome: "loja-produto-atacado",
    descobrir: {
      de: "/loja/pastelaria-da-vila/cardapio?atacado=1",
      padrao: "^/loja/pastelaria-da-vila/produto/[^/]+$",
    },
  },
  {
    conta: "cliente",
    nome: "loja-carrinho",
    caminho: "/loja/pastelaria-da-vila/carrinho",
  },
  {
    conta: "cliente",
    nome: "loja-checkout",
    caminho: "/loja/pastelaria-da-vila/checkout",
  },
  {
    conta: "cliente",
    nome: "explorar-produtos",
    caminho: "/explorar/produtos",
  },
  // --- dono --------------------------------------------------------------
  { conta: "dono", nome: "painel-home", caminho: "/painel" },
  { conta: "dono", nome: "painel-produtos", caminho: "/painel/produtos" },
  {
    conta: "dono",
    nome: "painel-produto-novo",
    caminho: "/painel/produtos/novo",
  },
  {
    conta: "dono",
    nome: "painel-produto",
    descobrir: {
      de: "/painel/produtos",
      padrao: "^/painel/produtos/(?!novo)[^/]+$",
    },
  },
  {
    conta: "dono",
    nome: "painel-produto-variacoes",
    descobrir: {
      de: "/painel/produtos",
      padrao: "^/painel/produtos/(?!novo)[^/]+$",
      sufixo: "/variacoes",
    },
  },
  {
    conta: "dono",
    nome: "painel-produto-opcoes",
    descobrir: {
      de: "/painel/produtos",
      padrao: "^/painel/produtos/(?!novo)[^/]+$",
      sufixo: "/opcoes",
    },
  },
  {
    conta: "dono",
    nome: "painel-produto-estoque",
    descobrir: {
      de: "/painel/produtos",
      padrao: "^/painel/produtos/(?!novo)[^/]+$",
      sufixo: "/estoque",
    },
  },
  { conta: "dono", nome: "painel-categorias", caminho: "/painel/categorias" },
  {
    conta: "dono",
    nome: "painel-especificacoes",
    descobrir: {
      de: "/painel/categorias",
      padrao: "^/painel/categorias/[^/]+/especificacoes$",
    },
  },
  { conta: "dono", nome: "painel-estoque", caminho: "/painel/estoque" },
  { conta: "dono", nome: "painel-variacoes", caminho: "/painel/variacoes" },
  { conta: "dono", nome: "painel-opcoes", caminho: "/painel/opcoes" },
  { conta: "dono", nome: "painel-pedidos", caminho: "/painel/pedidos" },
  {
    conta: "dono",
    nome: "painel-pedido-novo",
    caminho: "/painel/pedidos/novo",
  },
  {
    conta: "dono",
    nome: "painel-pedido",
    // O quadro abre o pedido numa janela; o id sai do cartão (data-pedido).
    descobrir: {
      de: "/painel/pedidos",
      atributo: "data-pedido",
      prefixo: "/painel/pedidos/",
    },
  },
  {
    conta: "dono",
    nome: "painel-pedido-janela",
    caminho: "/painel/pedidos",
    clicar: [".sc-cartao-pedido__abrir"],
  },
  { conta: "dono", nome: "painel-clientes", caminho: "/painel/clientes" },
  {
    conta: "dono",
    nome: "painel-cliente",
    descobrir: {
      de: "/painel/clientes",
      padrao: "^/painel/clientes/(?!importar)[^/]+$",
    },
  },
  {
    conta: "dono",
    nome: "painel-clientes-importar",
    caminho: "/painel/clientes/importar",
  },
  {
    conta: "dono",
    nome: "painel-config-contato",
    caminho: "/painel/config/contato",
  },
  {
    conta: "dono",
    nome: "painel-config-entrega",
    caminho: "/painel/config/entrega",
  },
  {
    conta: "dono",
    nome: "painel-config-horarios",
    caminho: "/painel/config/horarios",
  },
  {
    conta: "dono",
    nome: "painel-config-impressao",
    caminho: "/painel/config/impressao",
  },
  {
    conta: "dono",
    nome: "painel-config-pagamento",
    caminho: "/painel/config/pagamento",
  },
  { conta: "dono", nome: "painel-aparencia", caminho: "/painel/aparencia" },
  { conta: "dono", nome: "painel-equipe", caminho: "/painel/equipe" },
  { conta: "dono", nome: "painel-feed", caminho: "/painel/feed" },
  { conta: "dono", nome: "painel-stories", caminho: "/painel/stories" },
  { conta: "dono", nome: "painel-comentarios", caminho: "/painel/comentarios" },
  { conta: "dono", nome: "escolher-loja-nova", caminho: "/escolher-loja/nova" },
];

/** Tutorial e avisos do Next não entram no print nem atrapalham o clique. */
const LIMPEZA = `.sc-tutorial,nextjs-portal{display:none!important}
*{caret-color:transparent!important;transition:none!important;animation:none!important}
html,*{scroll-behavior:auto!important}`;

/**
 * Como achar um "i": o botão do componente Info (@simpleclick/ui, card #66).
 * Ele mora num `span.sc-info` junto do texto escondido (`.sc-so-leitor`) que
 * o campo liga em `aria-describedby`.
 */
const SELETOR_DO_I = ".sc-info__botao";

const relatorio = [];
const navegador = await chromium.launch();

async function entrar(contexto, conta) {
  const pagina = await contexto.newPage();
  if (!conta) return pagina;
  await pagina.goto(`${SITE}/entrar`, { waitUntil: "networkidle" });
  await pagina.fill('input[name="email"]', CONTAS[conta].email);
  await pagina.fill('input[name="senha"]', CONTAS[conta].senha);
  await Promise.all([
    pagina.waitForURL((url) => !url.pathname.startsWith("/entrar"), {
      timeout: 30_000,
    }),
    pagina.click('button[type="submit"]'),
  ]);
  if (conta === "dono") {
    await pagina.goto(`${SITE}/escolher-loja`, { waitUntil: "networkidle" });
    const alvo = pagina.getByRole("button", { name: /Abrir Pastelaria/i });
    const link = pagina.getByRole("link", { name: /Abrir Pastelaria/i });
    const escolha = (await alvo.count()) ? alvo : link;
    if (await escolha.count()) {
      await escolha.first().click();
      await pagina.waitForURL(/\/painel/, { timeout: 30_000 });
    }
  }
  return pagina;
}

async function resolverCaminho(pagina, tela) {
  if (tela.caminho) return tela.caminho;
  await pagina.goto(`${SITE}${tela.descobrir.de}`, {
    waitUntil: "networkidle",
  });
  if (tela.descobrir.atributo) {
    const valor = await pagina.evaluate(
      (a) => document.querySelector(`[${a}]`)?.getAttribute(a),
      tela.descobrir.atributo,
    );
    return valor ? tela.descobrir.prefixo + valor : null;
  }
  const href = await pagina.evaluate((padrao) => {
    const re = new RegExp(padrao);
    return [...document.querySelectorAll("a[href]")]
      .map((a) => new URL(a.href).pathname)
      .find((p) => re.test(p));
  }, tela.descobrir.padrao);
  return href ? href + (tela.descobrir.sufixo ?? "") : null;
}

/** Mede tudo do "i" de índice `i`, ainda fechado. Roda na página. */
function medirIcone({ seletor, i }) {
  const botao = document.querySelectorAll(seletor)[i];
  if (!botao) return null;
  // Com uma janela aberta, só contam os "i" de dentro dela (o resto está atrás).
  const janela = [
    ...document.querySelectorAll(
      'dialog[open], [role="dialog"][aria-modal="true"]',
    ),
  ].at(-1);
  if (janela && !janela.contains(botao)) return null;
  // Sem rolagem suave: a medida sai com o "i" já no lugar (e longe das barras fixas).
  botao.scrollIntoView({ block: "center", behavior: "instant" });
  const r = botao.getBoundingClientRect();
  const nome =
    botao.getAttribute("aria-label") ?? botao.textContent?.trim() ?? "";
  const visivel =
    r.width > 0 &&
    r.height > 0 &&
    getComputedStyle(botao).visibility !== "hidden";
  const problemas = [];

  // 1. Na linha do rótulo. O "i" fica FORA do <label>, ao lado dele: o rótulo é
  // o irmão anterior do `.sc-info`, ou o label/legend mais perto subindo até
  // três níveis.
  const caixa = botao.closest(".sc-info") ?? botao;
  let rotulo = botao.closest("label, legend");
  for (
    let no = caixa.previousElementSibling;
    !rotulo && no;
    no = no.previousElementSibling
  ) {
    if (no.textContent?.trim()) rotulo = no;
  }
  for (
    let pai = caixa.parentElement, n = 0;
    !rotulo && pai && n < 3;
    pai = pai.parentElement, n += 1
  ) {
    rotulo = pai.querySelector(
      "label, legend, .sc-campo__rotulo, .sc-info-linha",
    );
    if (
      !rotulo &&
      pai.matches("label, legend, h2, h3, h4, p, span, div") &&
      pai.textContent?.replace(caixa.textContent ?? "", "").trim()
    ) {
      rotulo = pai;
    }
  }
  if (rotulo) {
    const rr = rotulo.getBoundingClientRect();
    const centro = r.top + r.height / 2;
    if (!(centro >= rr.top - 2 && centro <= rr.bottom + 2)) {
      problemas.push(
        `ícone fora da linha do rótulo (rótulo y=${Math.round(rr.top)}–${Math.round(rr.bottom)}, ícone y=${Math.round(r.top)})`,
      );
    }
  } else {
    problemas.push("não achei o rótulo do ícone");
  }

  // 2. Nada por cima do ícone, e o ícone não cobre controle/texto vizinho.
  const pontos = [
    [r.left + r.width / 2, r.top + r.height / 2],
    // Dentro do círculo do botão redondo, não no canto da caixa.
    [r.left + r.width * 0.3, r.top + r.height * 0.3],
    [r.right - r.width * 0.3, r.bottom - r.height * 0.3],
  ];
  for (const [x, y] of pontos) {
    const topo = document.elementFromPoint(x, y);
    if (topo && !caixa.contains(topo)) {
      problemas.push(
        `algo cobre o ícone: <${topo.tagName.toLowerCase()} class="${topo.className}">`,
      );
      break;
    }
  }
  const controles = document.querySelectorAll(
    "input,select,textarea,button,a,[role=combobox],[role=switch]",
  );
  for (const c of controles) {
    if (caixa.contains(c) || c.contains(caixa)) continue;
    if (janela && !janela.contains(c)) continue;
    // Conteúdo de <details> fechado mantém a caixa no Chromium, mas não aparece.
    if (c.closest("details:not([open])") && !c.closest("summary")) continue;
    const cr = c.getBoundingClientRect();
    if (cr.width === 0 || cr.height === 0) continue;
    const x = Math.min(r.right, cr.right) - Math.max(r.left, cr.left);
    const y = Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top);
    if (x > 1 && y > 1) {
      problemas.push(
        `ícone sobreposto a <${c.tagName.toLowerCase()}> "${(c.getAttribute("aria-label") ?? c.textContent ?? c.getAttribute("name") ?? "").trim().slice(0, 40)}"`,
      );
    }
  }
  // Texto: nós de texto que se cruzam com o ícone (exceto o do próprio rótulo, que fica ao lado).
  const andar = document.createTreeWalker(document.body, 4);
  for (let no = andar.nextNode(); no; no = andar.nextNode()) {
    // O texto escondido do próprio Info (.sc-so-leitor) não conta.
    if (!no.textContent?.trim() || caixa.contains(no)) continue;
    if (janela && !janela.contains(no)) continue;
    // Texto só para leitor de tela (sr-only, .sc-so-leitor) e de <details> fechado não aparece.
    const dono = no.parentElement;
    if (
      !dono ||
      dono.closest(".sc-so-leitor, .sr-only, .sc-visualmente-oculto")
    )
      continue;
    if (dono.closest("details:not([open])") && !dono.closest("summary"))
      continue;
    const dr = dono.getBoundingClientRect();
    if (
      dr.width <= 1 ||
      dr.height <= 1 ||
      getComputedStyle(dono).clipPath.includes("inset(50%)")
    )
      continue;
    const faixa = document.createRange();
    faixa.selectNodeContents(no);
    for (const tr of faixa.getClientRects()) {
      const x = Math.min(r.right, tr.right) - Math.max(r.left, tr.left);
      const y = Math.min(r.bottom, tr.bottom) - Math.max(r.top, tr.top);
      if (x > 2 && y > 2) {
        problemas.push(
          `ícone por cima do texto "${no.textContent.trim().slice(0, 40)}"`,
        );
        break;
      }
    }
  }
  return {
    nome,
    visivel,
    rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    problemas: [...new Set(problemas)],
  };
}

/** Acha o balão aberto do botão `i` e confere se está inteiro e visível. */
function medirBalao({ seletor, i }) {
  const botao = document.querySelectorAll(seletor)[i];
  const id =
    botao?.getAttribute("aria-controls") ??
    botao?.getAttribute("aria-describedby");
  const balao =
    (id && document.getElementById(id)) ??
    [...document.querySelectorAll(".sc-info__balao")].find(
      (el) => el.getBoundingClientRect().width > 0,
    );
  if (!balao) return { aberto: false, problemas: ["balão não abriu"] };
  const b = balao.getBoundingClientRect();
  const problemas = [];
  if (
    b.width === 0 ||
    b.height === 0 ||
    getComputedStyle(balao).visibility === "hidden"
  ) {
    return { aberto: false, problemas: ["balão não ficou visível"] };
  }
  if (
    b.left < 0 ||
    b.top < 0 ||
    b.right > window.innerWidth ||
    b.bottom > window.innerHeight
  ) {
    problemas.push(
      `balão sai da tela (${Math.round(b.left)},${Math.round(b.top)}–${Math.round(b.right)},${Math.round(b.bottom)} em ${window.innerWidth}×${window.innerHeight})`,
    );
  }
  const pontos = [
    [b.left + 6, b.top + 6],
    [b.right - 6, b.top + 6],
    [b.left + 6, b.bottom - 6],
    [b.right - 6, b.bottom - 6],
    [b.left + b.width / 2, b.top + b.height / 2],
  ];
  for (const [x, y] of pontos) {
    const topo = document.elementFromPoint(x, y);
    if (topo && !balao.contains(topo)) {
      problemas.push(
        `balão cortado/coberto por <${topo.tagName.toLowerCase()} class="${String(topo.className).slice(0, 60)}">`,
      );
      break;
    }
  }
  // Cortado por um ancestral com overflow. Na camada de topo (popover aberto)
  // nenhum overflow corta, então só vale sem popover.
  const naCamadaDeTopo = balao.matches(":popover-open");
  for (
    let pai = naCamadaDeTopo ? null : balao.parentElement;
    pai && pai !== document.body;
    pai = pai.parentElement
  ) {
    const s = getComputedStyle(pai);
    if (
      /(hidden|auto|scroll|clip)/.test(s.overflow + s.overflowX + s.overflowY)
    ) {
      const pr = pai.getBoundingClientRect();
      if (
        b.left < pr.left - 1 ||
        b.right > pr.right + 1 ||
        b.top < pr.top - 1 ||
        b.bottom > pr.bottom + 1
      ) {
        problemas.push(
          `balão passa da caixa com rolagem <${pai.tagName.toLowerCase()} class="${String(pai.className).slice(0, 60)}">`,
        );
        break;
      }
    }
  }
  return {
    aberto: true,
    texto: balao.textContent?.trim().slice(0, 160),
    problemas,
  };
}

/** Controles sem rótulo visível, número sem unidade, opção em inglês. */
function procurarSemRotulo() {
  const achados = [];
  const ingles =
    /^(PENDING|ACTIVE|INACTIVE|DRAFT|PUBLISHED|DELIVERY|PICKUP|PERCENT|AMOUNT|FIXED|BASE|WHOLESALE|OWNER|STAFF|ADMIN|CUSTOMER|TRUE|FALSE|YES|NO|NONE|OTHER|CASH|CARD|PIX|[A-Z_]{4,})$/;
  for (const el of document.querySelectorAll(
    "input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea",
  )) {
    const r = el.getBoundingClientRect();
    // Controle escondido de propósito (input de arquivo aberto por um botão, sr-only).
    if (r.width <= 1 || r.height <= 1 || getComputedStyle(el).opacity === "0")
      continue;
    if (el.closest(".sr-only, .sc-so-leitor, .sc-visualmente-oculto")) continue;
    const id = el.id;
    const label =
      el.closest("label") ??
      (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null) ??
      (el.getAttribute("aria-labelledby")
        ? document.getElementById(
            el.getAttribute("aria-labelledby").split(" ")[0],
          )
        : null);
    const textoDoRotulo = label?.textContent?.trim() ?? "";
    const visivel =
      label &&
      label.getBoundingClientRect().width > 0 &&
      !label.classList.contains("sr-only") &&
      !label.classList.contains("sc-visualmente-oculto");
    const descr =
      `${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? "?"}] ${el.getAttribute("placeholder") ? `placeholder="${el.getAttribute("placeholder")}"` : ""}`.trim();
    if (!visivel || !textoDoRotulo) {
      achados.push(
        `sem rótulo visível: ${descr}${el.getAttribute("aria-label") ? ` (aria-label="${el.getAttribute("aria-label")}")` : ""}`,
      );
    }
    if (el.type === "number" && el.value === "0") {
      const vizinho = (el.parentElement?.textContent ?? "") + textoDoRotulo;
      if (
        !/(R\$|%|un|dias?|min|horas?|km|cm|kg|g\b|ml|pedidos?|itens?|vezes|px)/i.test(
          vizinho,
        )
      ) {
        achados.push(
          `número 0 sem unidade: ${descr} rótulo="${textoDoRotulo.slice(0, 40)}"`,
        );
      }
    }
    const opcoes =
      el.tagName === "SELECT"
        ? [...el.options].map((o) => o.textContent.trim())
        : [];
    for (const t of opcoes.filter((o) => ingles.test(o)))
      achados.push(`opção em inglês: ${descr} → "${t}"`);
  }
  for (const opcao of document.querySelectorAll(
    '[role="option"], [role="radio"], .sc-selo',
  )) {
    const t = opcao.textContent?.trim() ?? "";
    if (ingles.test(t)) achados.push(`texto em inglês: "${t}"`);
  }
  return [...new Set(achados)];
}

/** Esc fecha o balão (só ele, não o modal em volta) e o foco volta ao "i". */
async function conferirEsc(pagina, i) {
  const problemas = [];
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(200);
  // Fechado = o botão diz aria-expanded=false e nenhum balão do Info ficou.
  const aindaAberto = await pagina.evaluate(
    ({ seletor, i: n }) =>
      document.querySelectorAll(seletor)[n]?.getAttribute("aria-expanded") ===
        "true" || document.querySelectorAll(".sc-info__balao").length > 0,
    { seletor: SELETOR_DO_I, i },
  );
  if (aindaAberto) problemas.push("Esc não fechou o balão");
  const foco = await pagina.evaluate(
    ({ seletor, i: n }) =>
      document.activeElement === document.querySelectorAll(seletor)[n],
    { seletor: SELETOR_DO_I, i },
  );
  if (!foco) problemas.push("depois do Esc o foco não voltou para o ícone");
  return problemas;
}

async function conferirTela(pagina, tela, largura) {
  const caminho = await resolverCaminho(pagina, tela);
  const item = {
    tela: tela.nome,
    largura,
    caminho,
    icones: [],
    semRotulo: [],
    erro: null,
  };
  relatorio.push(item);
  if (!caminho) {
    item.erro = "não achei um id real para esta tela";
    return;
  }
  try {
    await pagina.goto(`${SITE}${caminho}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await pagina.addStyleTag({ content: LIMPEZA });
    for (const nome of tela.abrir ?? []) {
      const botao = pagina.getByRole("button", { name: nome });
      if (await botao.count()) {
        await botao.first().click();
        await pagina.waitForTimeout(400);
      }
    }
    for (const seletor of tela.clicar ?? []) {
      const alvo = pagina.locator(seletor).filter({ visible: true });
      if (await alvo.count()) {
        await alvo.first().click();
        await pagina.waitForTimeout(600);
      }
    }
    // Seções recolhidas (<details>) também têm "i": abre todas para conferir.
    await pagina.evaluate(() => {
      for (const d of document.querySelectorAll("details:not([open])"))
        d.open = true;
    });
    await pagina.waitForTimeout(500);
    const base = join(DESTINO, `${tela.nome}-${largura}`);
    await pagina.screenshot({ path: `${base}.png`, fullPage: true });
    item.semRotulo = await pagina.evaluate(procurarSemRotulo);

    const total = await pagina.locator(SELETOR_DO_I).count();
    for (let i = 0; i < total; i += 1) {
      const icone = await pagina.evaluate(medirIcone, {
        seletor: SELETOR_DO_I,
        i,
      });
      if (!icone || !icone.visivel) continue;
      try {
        await pagina.locator(SELETOR_DO_I).nth(i).click({ timeout: 5000 });
      } catch {
        item.icones.push({
          n: i + 1,
          nome: icone.nome,
          problemas: [
            ...icone.problemas,
            "não deu para clicar no ícone (coberto ou fora da tela)",
          ],
        });
        continue;
      }
      await pagina.waitForTimeout(250);
      const balao = await pagina.evaluate(medirBalao, {
        seletor: SELETOR_DO_I,
        i,
      });
      const problemas = [...icone.problemas, ...balao.problemas];
      if (balao.aberto) {
        await pagina.screenshot({ path: `${base}-i${i + 1}.png` });
        problemas.push(...(await conferirEsc(pagina, i)));
      }
      item.icones.push({
        n: i + 1,
        nome: icone.nome,
        texto: balao.texto,
        problemas,
      });
    }
  } catch (erro) {
    item.erro = String(erro?.message ?? erro).split("\n")[0];
  }
  const ruins = item.icones.filter((i) => i.problemas.length).length;
  process.stdout.write(
    `${item.erro ? "✘" : ruins || item.semRotulo.length ? "!" : "✔"} ${tela.nome}@${largura}: ${item.icones.length} "i", ${ruins} com problema, ${item.semRotulo.length} sem rótulo${item.erro ? ` — ${item.erro}` : ""}\n`,
  );
}

const telas = ROTEIRO.filter(
  (t) =>
    !FILTRO || t.nome.includes(FILTRO) || (t.caminho ?? "").includes(FILTRO),
);
for (const largura of Object.keys(APARELHOS)) {
  for (const conta of [null, "cliente", "dono"]) {
    const daConta = telas.filter((t) => t.conta === conta);
    if (!daConta.length) continue;
    const contexto = await navegador.newContext({
      ...APARELHOS[largura],
      colorScheme: "light",
      locale: "pt-BR",
      timezoneId: "America/Fortaleza",
    });
    const pagina = await entrar(contexto, conta);
    for (const tela of daConta)
      await conferirTela(pagina, tela, Number(largura));
    await contexto.close();
  }
}

await navegador.close();
writeFileSync(
  join(DESTINO, FILTRO ? `relatorio-${FILTRO}.json` : "relatorio.json"),
  JSON.stringify(relatorio, null, 2),
);
process.stdout.write(`\nRelatório em ${DESTINO}\n`);
