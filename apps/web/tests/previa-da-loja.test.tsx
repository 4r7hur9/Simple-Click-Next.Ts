// @vitest-environment jsdom
/**
 * A prévia da Aparência é a LOJA DE VERDADE (card #36).
 *
 * Provas:
 * - o rascunho que o formulário deixa no cookie é conferido antes de usar (cor,
 *   endereços de foto, tamanhos, loja certa);
 * - o rascunho por cima da vitrine vira exatamente o que a loja pública
 *   desenha (os MESMOS componentes `ApresentacaoDaLoja` e `CapaDaVitrine`);
 * - as rotas da prévia usam as mesmas telas da loja pública, e as telas
 *   públicas só mudam quando recebem um rascunho.
 */
import { readFileSync } from "node:fs";
import type { Vitrine } from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApresentacaoDaLoja } from "../src/features/loja/ApresentacaoDaLoja.tsx";
import { CapaDaVitrine } from "../src/features/vitrine/CapaDaVitrine.tsx";
import {
  codificarRascunho,
  lerRascunho,
  vitrineComRascunho,
  type RascunhoDaVitrine,
} from "../src/lib/rascunho-da-vitrine.ts";

const RASCUNHO: RascunhoDaVitrine = {
  apelido: "pastelaria",
  nome: "Pastel & Cia",
  boasVindas: "Feito na hora!",
  logo: "https://img.exemplo.test/logo.png",
  fundoVitrine: "https://img.exemplo.test/fundo.webp",
  fundoVitrineCelular: "https://img.exemplo.test/fundo-celular.webp",
  topoCardapio: "https://img.exemplo.test/topo.webp",
  topoCardapioCelular: "https://img.exemplo.test/topo-celular.webp",
  seloDeStatus: "CLARO",
  coresDasImagens: { "https://img.exemplo.test/fundo.webp": "#2a0a0a" },
};

const VITRINE = {
  loja: {
    apelido: "pastelaria",
    nome: "Pastelaria da Zica",
    ramo: "FOOD_SNACK",
    boasVindas: "O pastel mais crocante do bairro.",
    sobre: null,
    logo: null,
    capa: null,
    formasDeEntrega: ["PICKUP"],
    enderecoParaRetirada: null,
    rotulos: { catalogo: "Cardápio" },
    tema: {
      corDestaque: "#b7ff00",
      corDeFundo: "#000000",
      fundoVitrine: null,
      topoCardapio: null,
    },
  },
} as unknown as Vitrine;

describe("o rascunho que a prévia recebe é conferido", () => {
  it("vai e volta pelo cookie sem perder nada, inclusive acentos", () => {
    const texto = codificarRascunho({ ...RASCUNHO, nome: "Pão & Açaí da Vó" });
    // Cabe num cookie: só letras, números, `-` e `_`.
    expect(texto).toMatch(/^[\w-]+$/);
    expect(lerRascunho(texto, "pastelaria")).toMatchObject({
      nome: "Pão & Açaí da Vó",
      fundoVitrineCelular: "https://img.exemplo.test/fundo-celular.webp",
    });
  });

  it("recusa rascunho de outra loja, torto ou vazio", () => {
    const texto = codificarRascunho(RASCUNHO);
    expect(lerRascunho(texto, "outra-loja")).toBeNull();
    expect(lerRascunho("isto-nao-e-base64-de-json", "pastelaria")).toBeNull();
    expect(lerRascunho("", "pastelaria")).toBeNull();
    expect(lerRascunho(undefined, "pastelaria")).toBeNull();
  });

  it("nunca leva cor, endereço ou texto estranho para a página", () => {
    const sujo = codificarRascunho({
      ...RASCUNHO,
      nome: "x".repeat(500),
      logo: "javascript:alert(1)",
      fundoVitrine: "http://inseguro.test/a.jpg",
      topoCardapio: "https://ok.exemplo.test/topo.webp",
      seloDeStatus: "QUALQUER",
    });
    const lido = lerRascunho(sujo, "pastelaria")!;
    expect(lido.nome).toHaveLength(80);
    expect(lido).not.toHaveProperty("corDestaque");
    expect(lido.logo).toBe("");
    expect(lido.fundoVitrine).toBe("");
    expect(lido.topoCardapio).toBe("https://ok.exemplo.test/topo.webp");
    expect(lido.seloDeStatus).toBe("");
  });
});

describe("o rascunho por cima da vitrine é o que a loja desenha", () => {
  const vitrine = vitrineComRascunho(VITRINE, RASCUNHO);

  it("troca fotos (com as do celular), nome, descrição e logo", () => {
    expect(vitrine.loja.nome).toBe("Pastel & Cia");
    expect(vitrine.loja.boasVindas).toBe("Feito na hora!");
    expect(vitrine.loja.logo).toBe("https://img.exemplo.test/logo.png");
    expect(vitrine.loja.tema).toMatchObject({
      corDestaque: "#b7ff00", // sempre o verde SimpleClick
      fundoVitrine: "https://img.exemplo.test/fundo.webp",
      fundoVitrineCelular: "https://img.exemplo.test/fundo-celular.webp",
      topoCardapio: "https://img.exemplo.test/topo.webp",
      topoCardapioCelular: "https://img.exemplo.test/topo-celular.webp",
      seloDeStatus: "CLARO",
    });
  });

  it("a página inicial da loja (ApresentacaoDaLoja) sai sem cor de loja, com a foto e o texto do rascunho", () => {
    const html = renderToStaticMarkup(
      <ApresentacaoDaLoja
        loja={{ ...vitrine.loja, capa: vitrine.loja.capa ?? null } as never}
        abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
        linkDoCardapio="/loja/pastelaria/cardapio"
        rotuloDoCatalogo="Cardápio"
      />,
    );
    expect(html).not.toMatch(/--cor-marca|--cor-primaria/);
    expect(html).toContain("Pastel &amp; Cia");
    expect(html).toContain("Feito na hora!");
    expect(html).toContain('src="https://img.exemplo.test/fundo.webp"');
    // A versão do celular entra como `<source>` das telas estreitas.
    expect(html).toContain(
      '<source media="(max-width: 767px)" srcSet="https://img.exemplo.test/fundo-celular.webp"',
    );
  });

  it("o topo do cardápio (CapaDaVitrine) sai com a foto do topo e a do celular", () => {
    const html = renderToStaticMarkup(
      <CapaDaVitrine
        apelidoDaLoja="pastelaria"
        nomeDaLoja="Pastel & Cia"
        capa={vitrine.loja.tema?.topoCardapio}
        capaCelular={vitrine.loja.tema?.topoCardapioCelular}
        rotuloDoCatalogo="Cardápio"
        abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
      />,
    );
    expect(html).toContain('src="https://img.exemplo.test/topo.webp"');
    expect(html).toContain(
      'srcSet="https://img.exemplo.test/topo-celular.webp"',
    );
    expect(html).toContain("Pastel &amp; Cia");
  });

  it("o que o rascunho não diz continua como está salvo", () => {
    const vazio = vitrineComRascunho(VITRINE, {
      ...RASCUNHO,
      nome: "",
      seloDeStatus: "",
    });
    expect(vazio.loja.nome).toBe("Pastelaria da Zica");
    expect(vazio.loja.tema?.corDestaque).toBe("#b7ff00");
  });
});

describe("as rotas da prévia são as telas da loja pública", () => {
  const ler = (caminho: string) =>
    readFileSync(new URL(caminho, import.meta.url), "utf8");

  it("a rota da prévia desenha TelaDaLoja e TelaDoCatalogo, passando o rascunho", () => {
    const rota = ler("../src/app/(loja)/loja/[slug]/previa/[parte]/page.tsx");
    expect(rota).toContain('import { TelaDaLoja } from "../../TelaDaLoja.tsx"');
    expect(rota).toContain("TelaDoCatalogo");
    expect(rota).toMatch(/<TelaDaLoja[^>]*rascunho=\{rascunho\}/);
    expect(rota).toMatch(/<TelaDoCatalogo[^>]*rascunho=\{rascunho\}/);
    // Não é página pública: não vai para o buscador.
    expect(rota).toContain("index: false");
  });

  it("as rotas públicas desenham as mesmas telas sem rascunho (nada muda para o cliente)", () => {
    expect(ler("../src/app/(loja)/loja/[slug]/page.tsx")).toMatch(
      /<TelaDaLoja apelido=\{slug\} sobreAberto=\{false\} \/>/,
    );
    const catalogo = ler("../src/app/(loja)/loja/[slug]/cardapio/page.tsx");
    expect(catalogo).not.toContain("rascunho");
  });

  it("as duas telas só aplicam o rascunho quando ele vem", () => {
    for (const tela of [
      "../src/app/(loja)/loja/[slug]/TelaDaLoja.tsx",
      "../src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx",
    ]) {
      const fonte = ler(tela);
      expect(fonte).toContain("rascunho = null");
      expect(fonte).toContain("resultadoComRascunho(");
    }
  });
});
