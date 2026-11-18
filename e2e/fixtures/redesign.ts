/**
 * A base comum das provas de navegador do redesign Stitch (card #114).
 *
 * SEM BANCO. O que fala com o banco mora em `redesign-lojas.ts`; aqui ficam as
 * telas, as larguras, o aviso de cookies, o preparo da página, o axe e a medida
 * do estouro lateral — o que todo cenário do #114 repete.
 *
 * AS LARGURAS ANDAM COM O PROJETO, e não com `test.skip`: o projeto `celular`
 * mede as larguras de celular e o `publico` as de tablet e computador. Assim
 * nenhum teste fica "pulado" (pulado reprova a rodada, design §5) e nenhuma
 * captura sai em dobro.
 */
import { readFile } from "node:fs/promises";

import type { BrowserContext, Page, TestInfo } from "@playwright/test";

/** Larguras de cada projeto (Q-11401, proposta A). */
export const LARGURAS_POR_PROJETO = {
  celular: [344, 390],
  publico: [768, 1024, 1280],
} as const;

/** 200% de zoom num computador de 1280px deixa 640px de largura útil (Q-11411). */
export const LARGURA_DO_ZOOM_200 = 640;

/** A altura usada com cada largura: retrato no celular, paisagem no resto. */
export function alturaPara(largura: number): number {
  if (largura < 768) return 844;
  if (largura < 1024) return 1024;
  return 800;
}

/** As larguras que o projeto deste teste mede. */
export function larguras(info: TestInfo): readonly number[] {
  return info.project.name === "celular"
    ? LARGURAS_POR_PROJETO.celular
    : LARGURAS_POR_PROJETO.publico;
}

/** Verdadeiro no projeto de celular. */
export const ehCelular = (info: TestInfo): boolean =>
  info.project.name === "celular";

export const TEMAS = ["escuro", "claro"] as const;
export type Tema = (typeof TEMAS)[number];

/** O esquema de cor que o navegador emula para cada tema. */
export const ESQUEMA: Readonly<Record<Tema, "dark" | "light">> = {
  escuro: "dark",
  claro: "light",
};

/** A origem do site do cenário (o `baseURL` do projeto). */
export function origemDoSite(info: TestInfo): string {
  const base = info.project.use.baseURL;
  if (base === undefined) throw new Error("o projeto não tem baseURL");
  return new URL(base).origin;
}

/**
 * O aviso de cookies cobriria o pé da tela, a barra da sacola e o foco: a
 * escolha já vem dada (mesmo padrão de `navegacao-do-cliente.onp.spec.ts`).
 */
export async function jaEscolheuOsCookies(
  contexto: BrowserContext,
  origem: string,
): Promise<void> {
  await contexto.addCookies([
    {
      name: "sc_consentimento",
      value: encodeURIComponent(
        JSON.stringify({ v: "2026-10-19", d: false, f: false, t: Date.now() }),
      ),
      url: origem,
    },
  ]);
}

/**
 * Deixa a página no estado que se mede: tema pedido, movimento reduzido (o axe
 * mede a cor de um instante; no meio de um esmaecer o texto é mistura com o
 * fundo) e fontes carregadas.
 */
export async function prepararPagina(
  page: Page,
  tema: Tema = "escuro",
): Promise<void> {
  await page.emulateMedia({
    colorScheme: ESQUEMA[tema],
    reducedMotion: "reduce",
  });
}

/** Espera a página assentar: rede parada e fontes prontas. */
export async function esperarAssentar(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * As regras mínimas que PRECISAM ter rodado (design §6). Sem esta conferência,
 * uma montagem errada (axe sem contexto, página em branco) passa com zero
 * violação.
 */
export const REGRAS_QUE_PRECISAM_RODAR = [
  "color-contrast",
  "button-name",
  "link-name",
  "landmark-one-main",
  "region",
  "aria-valid-attr-value",
] as const;

/** As tags WCAG 2.2 A e AA. */
const TAGS_WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let fonteDoAxe: string | undefined;

async function lerAxe(): Promise<string> {
  fonteDoAxe ??= await readFile(
    new URL("../../apps/web/node_modules/axe-core/axe.js", import.meta.url),
    "utf8",
  );
  return fonteDoAxe;
}

export interface ViolacaoDoAxe {
  readonly id: string;
  readonly impact: string | null;
  readonly alvos: readonly string[];
}

export interface ResultadoDoAxe {
  /** Regras avaliadas (passou, violou ou incompleta). */
  readonly rodadas: readonly string[];
  /** Só as violações sérias ou críticas. */
  readonly graves: readonly ViolacaoDoAxe[];
}

/**
 * Roda o axe com as tags WCAG 2.2 A/AA (mais `best-practice`, onde moram
 * `region` e `landmark-one-main` da lista mínima) na página como ela está.
 * "Rodou" inclui a regra inaplicável (ex.: `link-name` numa janela sem link):
 * o que se quer pegar é o axe que nem chegou a avaliar a regra.
 */
export async function rodarAxe(page: Page): Promise<ResultadoDoAxe> {
  await page.addScriptTag({ content: await lerAxe() });
  return page.evaluate(
    async (tags) => {
      type Regra = {
        id: string;
        impact: string | null;
        nodes: Array<{ target: unknown[] }>;
      };
      const axe = (
        window as unknown as {
          axe: {
            run(
              alvo: Document,
              opcoes: unknown,
            ): Promise<{
              passes: Regra[];
              violations: Regra[];
              incomplete: Regra[];
              inapplicable: Regra[];
            }>;
          };
        }
      ).axe;
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: tags },
      });
      return {
        rodadas: [
          ...r.passes,
          ...r.violations,
          ...r.incomplete,
          ...r.inapplicable,
        ].map((x) => x.id),
        graves: r.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({
            id: v.id,
            impact: v.impact,
            alvos: v.nodes.slice(0, 5).map((n) => String(n.target.join(" "))),
          })),
      };
    },
    [...TAGS_WCAG, "best-practice"],
  );
}

export interface Estouro {
  readonly rolagem: number;
  readonly largura: number;
  /** Elementos visíveis que passam da borda direita (até 5, para o relato). */
  readonly fora: readonly string[];
}

/**
 * Mede o estouro lateral: rolagem horizontal do documento e elementos visíveis
 * que passam da borda. Ignora o que está escondido de propósito (fora da tela
 * por `visibility`, `display:none`, clip de leitor de tela) e o que mora dentro
 * de uma faixa que rola sozinha (`overflow-x: auto|scroll`).
 */
export async function medirEstouro(page: Page): Promise<Estouro> {
  return page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    const dentroDeFaixaQueRola = (el: Element): boolean => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (
          ox === "auto" ||
          ox === "scroll" ||
          ox === "hidden" ||
          ox === "clip"
        )
          return true;
      }
      return false;
    };
    const fora = [
      ...document.querySelectorAll("h1,h2,h3,p,a,button,img,input,label"),
    ]
      .filter((el) => {
        const caixa = el.getBoundingClientRect();
        if (caixa.width === 0 || caixa.height === 0) return false;
        const estilo = getComputedStyle(el);
        if (estilo.visibility === "hidden") return false;
        if (el.closest("dialog:not([open]),[hidden],[inert]")) return false;
        if (caixa.width <= 1 && caixa.height <= 1) return false;
        if (dentroDeFaixaQueRola(el)) return false;
        return caixa.right > largura + 1 || caixa.left < -1;
      })
      .slice(0, 5)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")} "${(el.textContent ?? "").trim().slice(0, 30)}"`,
      );
    return {
      rolagem: document.documentElement.scrollWidth,
      largura,
      fora,
    };
  });
}

/** Mediana de uma lista de números (lista vazia vira NaN). */
export function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return Number.NaN;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? (ordenados[meio] as number)
    : ((ordenados[meio - 1] as number) + (ordenados[meio] as number)) / 2;
}

/**
 * Dados do export do Stitch que nunca podem aparecer como conteúdo (P-105,
 * AC-11421). Strings distintivas tiradas dos `code.html` do export; nada
 * genérico ("Comprar") entra, para não acusar texto legítimo.
 */
export const DADOS_DO_STITCH: readonly RegExp[] = [
  /00\.000\.000\/0001-00/,
  /5511999999999/,
  /PRIMEIRACOMPRA/i,
  /\b\d{1,2}x\s+sem\s+juros\b/i,
  /Av\.\s*Paulista/i,
  /Distrito Automotivo/i,
  /SimpleClick Brasil Ltda/i,
  /UNIVERSOKAR DISTRIBUIDORA/i,
  /Burger House Garage/i,
  /Auto VIP/i,
  /Drop Street/i,
  /Farma 24h/i,
  /Entrega Flash/i,
  /Motoboy Express/i,
  /Programa Fidelidade/i,
  /\(1\.420 avalia/i,
  /Compatibilidade R[aá]pida/i,
  /Trocar Ve[ií]culo/i,
  /Checar Chassi/i,
];

/** O que as telas precisam para abrir: ids das lojas montadas pelo cenário. */
export interface DadosDasTelas {
  /** Loja da carga de exemplo usada nas telas da loja. */
  readonly lojaDemo: string;
  /** Produto simples da loja da jornada (para a sacola com item). */
  readonly produtoDaJornada: string;
  readonly apelidoDaJornada: string;
}

/** Uma tela do redesign na matriz do #114 (design §4). */
export interface TelaDoRedesign {
  readonly id: string;
  /** Card dono da tela. */
  readonly card: string;
  /** Pasta da referência no export do Stitch, ou `null` (tela sem mockup). */
  readonly referencia: string | null;
  /** Precisa de conta logada (cliente). */
  readonly logada: boolean;
  /** Abre a tela no estado que se mede. */
  abrir(page: Page, dados: DadosDasTelas): Promise<void>;
}

async function abrirPrimeiroProduto(
  page: Page,
  apelido: string,
): Promise<void> {
  await page.goto(`/loja/${apelido}/cardapio`);
  await page.locator("main a.sc-vitrine__link").first().click();
  await page.locator("dialog.sc-janela-produto[open]").waitFor();
}

/**
 * As telas do cliente refeitas no Stitch (cards #105–#111, #128–#130). A
 * ordem é a da jornada. Painel e administração ficam em arquivo próprio
 * (propostas do #112 e do #113).
 */
export const TELAS_DO_REDESIGN: readonly TelaDoRedesign[] = [
  {
    id: "inicio",
    card: "#106/#128",
    referencia: "simpleclick_in_cio_descoberta",
    logada: false,
    abrir: async (page) => {
      await page.goto("/explorar/produtos");
    },
  },
  {
    id: "lojas",
    card: "#106/#128",
    referencia: "simpleclick_desktop_in_cio_descoberta",
    logada: false,
    abrir: async (page) => {
      await page.goto("/explorar/lojas");
    },
  },
  {
    id: "vitrine",
    card: "#107/#129",
    referencia: "vitrine_da_loja_universokar",
    logada: false,
    abrir: async (page, dados) => {
      await page.goto(`/loja/${dados.lojaDemo}`);
    },
  },
  {
    id: "catalogo",
    card: "#108/#130",
    referencia: "cat_logo_de_produtos_universokar",
    logada: false,
    abrir: async (page, dados) => {
      await page.goto(`/loja/${dados.lojaDemo}/cardapio`);
    },
  },
  {
    id: "produto",
    card: "#109",
    referencia: null,
    logada: false,
    abrir: async (page, dados) => abrirPrimeiroProduto(page, dados.lojaDemo),
  },
  {
    id: "sacola",
    card: "#110/#130",
    referencia: "cat_logo_de_produtos_desktop_universokar",
    logada: false,
    abrir: async (page, dados) => {
      await page.goto(
        `/loja/${dados.apelidoDaJornada}/produto/${dados.produtoDaJornada}`,
      );
      await page
        .locator("dialog.sc-janela-produto[open] .sc-produto__adicionar")
        .click();
      await page
        .getByText(/Adicionado à sacola/)
        .first()
        .waitFor({ state: "attached" });
      await page.goto(`/loja/${dados.apelidoDaJornada}/carrinho`);
    },
  },
  {
    id: "sobre",
    card: "#107/#129",
    referencia: null,
    logada: false,
    abrir: async (page, dados) => {
      await page.goto(`/loja/${dados.lojaDemo}/sobre`);
    },
  },
  {
    id: "entrar",
    card: "#111",
    referencia: null,
    logada: false,
    abrir: async (page) => {
      await page.goto("/entrar");
    },
  },
  {
    id: "conta-pedidos",
    card: "#111",
    referencia: null,
    logada: true,
    abrir: async (page) => {
      await page.goto("/conta/pedidos");
    },
  },
  {
    id: "conta-favoritos",
    card: "#111",
    referencia: null,
    logada: true,
    abrir: async (page) => {
      await page.goto("/conta/favoritos");
    },
  },
];

/** A cor de fundo pintada no corpo da página (para provar a troca de tema). */
export async function fundoDaPagina(page: Page): Promise<string> {
  return page.evaluate(() => {
    const candidatos = [
      document.querySelector("main"),
      document.body,
      document.documentElement,
    ];
    for (const el of candidatos) {
      if (!el) continue;
      const cor = getComputedStyle(el).backgroundColor;
      if (cor && cor !== "rgba(0, 0, 0, 0)" && cor !== "transparent")
        return cor;
    }
    return getComputedStyle(document.documentElement).backgroundColor;
  });
}

/**
 * As animações rodando agora que passam do limite do movimento reduzido
 * (AC-11413): mais de 200ms ou repetição infinita.
 */
export async function animacoesLongas(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .map((a) => {
        const t = a.effect?.getComputedTiming();
        const duracao = Number(t?.duration ?? 0);
        const repete = t?.iterations === Number.POSITIVE_INFINITY;
        const alvo = (a.effect as KeyframeEffect | null)?.target;
        const nome =
          alvo instanceof Element
            ? `${alvo.tagName.toLowerCase()}.${[...alvo.classList].slice(0, 2).join(".")}`
            : "?";
        return duracao > 200 || repete
          ? `${nome} ${(a as CSSAnimation).animationName ?? "transição"} ${duracao}ms${repete ? " infinita" : ""}`
          : "";
      })
      .filter(Boolean),
  );
}
