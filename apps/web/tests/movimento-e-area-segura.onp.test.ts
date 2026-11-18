/**
 * Movimento reduzido e área segura declarados no CSS das telas do cliente
 * (card #114: AC-11413 e AC-11414, nível declaração).
 *
 * O navegador mede o resultado (animações ≤ 200ms com movimento reduzido, em
 * `e2e/specs/acessibilidade-redesign.onp.spec.ts`); aqui se prova o que o CSS
 * DECLARA, para uma tela nova não escapar:
 *
 * - o reset global de movimento reduzido existe, é `!important` e vale para
 *   tudo (`*`, `::before`, `::after`), e o layout raiz carrega a folha;
 * - toda animação em laço (`infinite`) das telas do cliente tem o seu próprio
 *   bloco de movimento reduzido — laço é o que mais incomoda quem pediu menos
 *   movimento;
 * - toda barra FIXA no pé da tela das telas do cliente declara a margem da
 *   área segura (`env(safe-area-inset-bottom)`) no próprio componente.
 *
 * Não repete o `barras-fixas.onp.test.ts` (#105), que prova os valores exatos
 * da barra inferior, do aviso de cookies e do aviso flutuante: aqui é a regra
 * geral, que pega a barra que alguém acrescentar depois.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "../../..");
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");
const semComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** As folhas de estilo das telas do cliente (redesign Stitch, #104–#111). */
const FOLHAS_DO_CLIENTE = [
  "packages/ui/styles/componentes.css",
  "packages/ui/styles/vitrine.css",
  "packages/ui/styles/narrativa.css",
  "packages/ui/styles/produto.css",
  "packages/ui/styles/fechamento.css",
  "packages/ui/styles/sobre.css",
  "packages/ui/styles/conta.css",
  "packages/ui/styles/usuario.css",
  "packages/ui/styles/stories.css",
  "packages/ui/styles/legal.css",
  "packages/ui/styles/filtros.css",
  "packages/ui/styles/selo-de-status.css",
  "apps/web/src/features/feed/feed.css",
  "apps/web/src/features/usuario/navegacao.css",
] as const;

interface Bloco {
  readonly seletor: string;
  readonly corpo: string;
}

function blocos(css: string): Bloco[] {
  return [...semComentarios(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (b) => ({
      seletor: (b[1] ?? "").trim().split("\n").at(-1)?.trim() ?? "",
      corpo: b[2] ?? "",
    }),
  );
}

describe("movimento reduzido (AC-11413)", () => {
  it("[CA-17] @spec:AC-11413 o reset global de movimento reduzido vale para tudo e é carregado pela raiz", () => {
    const globais = semComentarios(ler("apps/web/src/app/globals.css"));
    const reset =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(
        globais,
      )?.[1] ?? "";
    expect(reset).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{/);
    expect(reset).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(reset).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(reset).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(ler("apps/web/src/app/layout.tsx")).toMatch(
      /import "\.\/globals\.css";/,
    );
  });

  it("[CA-17] @spec:AC-11413 nenhuma folha das telas do cliente fura o reset com !important", () => {
    // Uma duração ou repetição de animação marcada `!important` fora do reset
    // venceria o movimento reduzido para quem pediu menos movimento.
    // O que mora DENTRO de um bloco `reduce` reforça o reset e não conta,
    // nem o `!important` que desliga (`none`, `0`).
    const foraDoReduce = (css: string) => {
      let resto = css;
      for (;;) {
        const inicio = resto.search(
          /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/,
        );
        if (inicio < 0) return resto;
        let nivel = 0;
        let fim = resto.indexOf("{", inicio);
        for (; fim < resto.length; fim += 1) {
          if (resto[fim] === "{") nivel += 1;
          if (resto[fim] === "}" && (nivel -= 1) === 0) break;
        }
        resto = resto.slice(0, inicio) + resto.slice(fim + 1);
      }
    };
    const furam = FOLHAS_DO_CLIENTE.filter((folha) =>
      [
        ...foraDoReduce(semComentarios(ler(folha))).matchAll(
          /(animation|transition)(-duration|-iteration-count)?\s*:([^;]*)!important/g,
        ),
      ].some((m) => !/^\s*(none|0m?s?)\s*$/.test(m[3] ?? "")),
    );
    expect(furam).toEqual([]);
  });
});

/** Janela de tela cheia → a barra de ação que mora no pé dela. */
const BARRA_DE_DENTRO: Readonly<Record<string, readonly string[]>> = {
  ".sc-janela-produto": [".sc-produto__acao"],
  // A sacola em janela (#110): o mesmo elemento é `.sc-carrinho-janela`, e o
  // rodapé com o "Fechar pedido" é `.sc-carrinho-janela__rodape`.
  ".sc-flutuante": [".sc-carrinho-janela"],
};

/** Componentes fixos dessas folhas que são do PAINEL, não do cliente. */
const DO_LOJISTA = [".sc-story-editor"];

describe("área segura das barras fixas (AC-11414)", () => {
  /**
   * Barra fixa no pé: `position: fixed` com `bottom`/`inset-block-end`, ou
   * `inset` terminando em 0. Janela de tela cheia (`inset: 0`) conta: o rodapé
   * dela também fica sobre o indicador de início do iPhone. Fundo escurecido
   * (`__fundo`) não tem conteúdo e não entra.
   */
  const barrasNoPe = FOLHAS_DO_CLIENTE.flatMap((folha) => {
    const todos = blocos(ler(folha));
    return todos
      .filter(({ seletor, corpo }) => {
        if (!/position:\s*fixed/.test(corpo) || /__fundo\b/.test(seletor))
          return false;
        if (DO_LOJISTA.some((c) => seletor.includes(c))) return false;
        return (
          /(^|[;\s])(bottom|inset-block-end)\s*:/.test(corpo) ||
          /inset:\s*[^;]*\b0\s*;/.test(corpo)
        );
      })
      .map(({ seletor }) => {
        // O componente é o bloco BEM do seletor (`.sc-sacola-barra`,
        // `.sc-sobre-janela`…): a margem pode morar num filho dele.
        const componente =
          (/\.sc-[a-z0-9-]+/.exec(seletor)?.[0] ?? seletor).split("__")[0] ??
          seletor;
        // Janela de tela cheia conta pela barra de ação de dentro dela: a do
        // detalhe do produto (#109) é `.sc-produto__acao`.
        const doComponente = [
          componente,
          ...(BARRA_DE_DENTRO[componente] ?? []),
        ];
        const declara = todos.some(
          (b) =>
            doComponente.some((c) => b.seletor.includes(c)) &&
            /safe-area-inset-bottom/.test(b.corpo),
        );
        return { folha, seletor, componente, declara };
      });
  });

  it("[CA-18] @spec:AC-11414 as telas do cliente têm barras fixas no pé (o teste não roda vazio)", () => {
    expect(barrasNoPe.length).toBeGreaterThanOrEqual(5);
  });

  it("[CA-18] @spec:AC-11414 toda barra fixa no pé declara a margem da área segura", () => {
    const sem = barrasNoPe
      .filter((b) => !b.declara)
      .map((b) => `${b.folha} ${b.seletor} (componente ${b.componente})`);
    expect(sem).toEqual([]);
  });
});
