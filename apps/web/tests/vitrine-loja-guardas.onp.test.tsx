// @vitest-environment jsdom
/**
 * Card #107 · guardas de conteúdo: o que está "a decidir" ou não tem base no
 * produto não aparece, e a prévia usa a mesma composição da página pública.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  desenharPerfil,
  destaque,
  LOJA_DO_PERFIL,
  post,
} from "./loja-fixtures";

const OCULTOS: readonly [string, RegExp][] = [
  ["nota e avaliações", /avalia[çc][õo]es|\bnota\b|★\s*\d|\d[.,]\d\s*\(\d+/i],
  ["selo de loja verificada", /verificad[ao]|certificad[ao]|homologad[ao]/i],
  ["mais vendidos", /mais vendid/i],
  ["parcelamento", /\d+\s*x\s*sem juros|parcel|boleto/i],
  [
    "promessas sem base",
    /nf-?e inclusa|compra (100% )?protegida|entrega flash|suporte 24h/i,
  ],
  [
    "atendimento técnico e veículo",
    /placa|chassi|compatível|plantão técnico|consultar técnico/i,
  ],
  [
    "contador de favoritos",
    /\d+(\.\d+)?k?\s*(pessoas|favorit)|favorit\w*\s*\(\d|\(\d+([.,]\d+)?k\)/i,
  ],
];

function fonte(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

function paginaCompleta(): string {
  const pagina = desenharPerfil({
    loja: {
      ...LOJA_DO_PERFIL,
      whatsappPublico: "+55 (11) 91111-0001",
      formasDeEntrega: ["DELIVERY", "PICKUP"],
    } as never,
    destaques: [destaque("pastel", "Pastel de carne")],
    posts: [post("p1", "Coxinha")],
    contagemDeItens: 12,
    logado: true,
  });
  return pagina.textContent ?? "";
}

describe("guardas de conteúdo", () => {
  it.each(OCULTOS)(
    "[CA-7] @spec:AC-10717 %s não aparece na página da loja",
    (_nome, padrao) => {
      expect(paginaCompleta()).not.toMatch(padrao);
    },
  );

  it("[CA-7] @spec:AC-10717 nenhum desses textos entra no código da página", () => {
    for (const arquivo of [
      "apps/web/src/features/loja/PerfilDaLoja.tsx",
      "apps/web/src/features/loja/ApresentacaoDaLoja.tsx",
      "apps/web/src/features/loja/CondicoesDaLoja.tsx",
      "apps/web/src/features/loja/ContatoDaLoja.tsx",
      "apps/web/src/features/loja/BotaoCompartilharLoja.tsx",
    ]) {
      // Só o texto desenhado: os comentários explicam o que NÃO aparece.
      const semComentarios = fonte(arquivo)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(semComentarios, arquivo).not.toMatch(
        /sem juros|NF-e|chassi|plantão técnico|Mais vendidos|verificada/i,
      );
    }
  });

  it("[CA-7] @spec:AC-10718 a prévia, o /sobre e a rota pública desenham a mesma TelaDaLoja", () => {
    const base = "apps/web/src/app/(loja)/loja/[slug]";
    for (const arquivo of [
      "page.tsx",
      "sobre/page.tsx",
      "previa/[parte]/page.tsx",
    ]) {
      expect(fonte(`${base}/${arquivo}`), arquivo).toContain("<TelaDaLoja");
    }
    // A prévia carrega as mesmas folhas que a página pública usa.
    expect(fonte(`${base}/previa/[parte]/page.tsx`)).toContain(
      "@simpleclick/ui/styles/vitrine.css",
    );
    expect(fonte("apps/web/src/features/loja/PerfilDaLoja.tsx")).toContain(
      "@simpleclick/ui/styles/vitrine.css",
    );
    expect(fonte(`${base}/layout.tsx`)).toContain("narrativa.css");
  });

  it("[CA-7] @spec:AC-10719 Favoritar aparece sem publicações e sem contador", () => {
    const pagina = desenharPerfil({ logado: true, posts: [] });
    const botao = pagina.querySelector(".sc-loja__acoes button[aria-pressed]");
    expect(botao).not.toBeNull();
    expect(botao?.textContent).toBe("Favoritar loja");
    expect(botao?.textContent).not.toMatch(/\d/);

    const favorita = desenharPerfil({
      logado: true,
      favorita: true,
      posts: [],
    });
    expect(
      favorita.querySelector(".sc-loja__acoes button[aria-pressed='true']")
        ?.textContent,
    ).toBe("Loja favorita");
  });
});
