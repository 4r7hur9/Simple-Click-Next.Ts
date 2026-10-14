import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  relacaoDeContraste,
} from "../src/contraste";
import {
  MEDIDAS,
  NOME_NO_CSS,
  NOME_NO_CSS_DAS_EXTREMAS,
  NOME_NO_CSS_DAS_MEDIDAS,
  PALETA_CLARA,
  PALETA_ESCURA,
  PALETA_OFICIAL,
  TINTAS_EXTREMAS,
  type PaletaDeCores,
} from "../src/tokens";

/**
 * Duas coisas são provadas aqui.
 *
 * A primeira: o espelho em TypeScript e a folha de estilo dizem a mesma coisa.
 * Sem essa amarra, o cálculo de contraste passaria a decidir sobre cores que
 * ninguém vê na tela — e continuaria dando "verde" em todo teste.
 *
 * A segunda: os pares que o design system realmente coloca um sobre o outro
 * alcançam o mínimo do WCAG nos dois temas. É a metade do AC-016 que a
 * verificação automatizada em jsdom não consegue medir, porque lá não existe
 * pintura de tela para comparar.
 */

// Os comentários saem antes da leitura: eles contêm dois-pontos e chaves, e
// confundiriam o separador de declaração.
const CSS = readFileSync(
  fileURLToPath(new URL("../styles/theme.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** Lê os valores declarados de um bloco do CSS, pelo seletor que o abre. */
function valoresDoBloco(seletor: string): Map<string, string> {
  const inicio = CSS.indexOf(seletor);
  if (inicio === -1) throw new Error(`bloco "${seletor}" não existe no tema`);

  const abertura = CSS.indexOf("{", inicio);
  const fim = CSS.indexOf("}", abertura);
  const corpo = CSS.slice(abertura + 1, fim);

  const valores = new Map<string, string>();
  for (const linha of corpo.split(";")) {
    const separador = linha.indexOf(":");
    if (separador === -1) continue;
    const nome = linha.slice(0, separador).trim();
    if (!nome.startsWith("--")) continue;
    valores.set(nome, linha.slice(separador + 1).trim());
  }
  return valores;
}

const BLOCOS = {
  claro: ":root {",
  escuro: ':root[data-tema="escuro"] {',
} as const;

const PALETAS_ESPERADAS = {
  claro: PALETA_CLARA,
  escuro: PALETA_ESCURA,
} as const;

describe("valores declarados do tema", () => {
  it("@spec:AC-941 preserva toda a paleta cromática oficial como tokens brutos", () => {
    expect(PALETA_OFICIAL).toEqual({
      verdeClick: "#b7ff00",
      verdeDigital: "#72d900",
      mint: "#e5ffb8",
      grafite: "#161c19",
      cinzaUi: "#a8b1ab",
      nevoa: "#f5f7f4",
      branco: "#ffffff",
      pretoTecnologico: "#0b0f0d",
    });

    const noCss = valoresDoBloco(BLOCOS.claro);
    for (const [nome, valor] of [
      ["--marca-verde-click", PALETA_OFICIAL.verdeClick],
      ["--marca-verde-digital", PALETA_OFICIAL.verdeDigital],
      ["--marca-mint", PALETA_OFICIAL.mint],
      ["--marca-grafite", PALETA_OFICIAL.grafite],
      ["--marca-cinza-ui", PALETA_OFICIAL.cinzaUi],
      ["--marca-nevoa", PALETA_OFICIAL.nevoa],
      ["--marca-branco", PALETA_OFICIAL.branco],
      ["--marca-preto-tecnologico", PALETA_OFICIAL.pretoTecnologico],
    ] as const) {
      expect(noCss.get(nome)).toBe(valor);
    }
  });

  for (const tema of ["claro", "escuro"] as const) {
    it(`@spec:AC-014 o espelho em TypeScript repete exatamente o tema ${tema} da folha de estilo`, () => {
      const noCss = valoresDoBloco(BLOCOS[tema]);
      const esperada = PALETAS_ESPERADAS[tema];

      for (const [chave, nome] of Object.entries(NOME_NO_CSS)) {
        const valorNoCss = noCss.get(nome);
        expect(valorNoCss, `${nome} não está declarado no tema ${tema}`).toBe(
          esperada[chave as keyof PaletaDeCores],
        );
      }
    });
  }

  it("@spec:AC-014 as tintas de último recurso também são valor declarado, não literal solto", () => {
    const noCss = valoresDoBloco(BLOCOS.claro);

    for (const [chave, nome] of Object.entries(NOME_NO_CSS_DAS_EXTREMAS)) {
      expect(noCss.get(nome), `${nome} não está declarado`).toBe(
        TINTAS_EXTREMAS[chave as keyof typeof TINTAS_EXTREMAS],
      );
    }
  });

  it("o trecho claro dentro de página escura repete o tema claro inteiro", () => {
    const trecho = valoresDoBloco('[data-tema="claro"] {');

    for (const [chave, nome] of Object.entries(NOME_NO_CSS)) {
      expect(trecho.get(nome), `${nome} não está no trecho claro`).toBe(
        PALETA_CLARA[chave as keyof PaletaDeCores],
      );
    }
    expect(CSS).toContain('[data-tema="escuro"],\n:root[data-tema="escuro"] {');
  });

  it("as medidas da linguagem visual repetem a folha de estilo", () => {
    const noCss = valoresDoBloco(BLOCOS.claro);

    for (const [chave, nome] of Object.entries(NOME_NO_CSS_DAS_MEDIDAS)) {
      expect(noCss.get(nome), `${nome} não está declarado`).toBe(
        MEDIDAS[chave as keyof typeof MEDIDAS],
      );
    }
  });

  it("todo nome antigo que as telas pedem aponta para um valor declarado", () => {
    const noCss = valoresDoBloco(BLOCOS.claro);

    // `--cor-papel` era pedido pelo layout do painel e nunca tinha existido: a
    // tela inteira saía sem fundo, sem erro nenhum para avisar.
    for (const nome of [
      "--cor-papel",
      "--cor-perigo",
      "--raio",
      "--raio-grande",
      "--sombra-baixa",
    ]) {
      const valor = noCss.get(nome);
      expect(valor, `${nome} não está declarado`).toMatch(/^var\(--[a-z-]+\)$/);
      const alvo = valor?.slice(4, -1) ?? "";
      expect(
        noCss.has(alvo),
        `${nome} aponta para ${alvo}, que não existe`,
      ).toBe(true);
    }
  });

  it("@spec:AC-014 o tema declara também espaçamento, tipografia, raio e sombra", () => {
    const noCss = valoresDoBloco(BLOCOS.claro);
    const declarados = [...noCss.keys()];

    // Cor sozinha não é design system: sem escala de espaço e de texto, cada
    // tela volta a inventar a própria margem.
    expect(
      declarados.filter((n) => n.startsWith("--espaco-")).length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      declarados.filter((n) => n.startsWith("--texto-")).length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      declarados.filter((n) => n.startsWith("--peso-")).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      declarados.filter((n) => n.startsWith("--raio-")).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      declarados.filter((n) => n.startsWith("--sombra-")).length,
    ).toBeGreaterThanOrEqual(3);
    expect(noCss.get("--fonte-base")).toBeDefined();
  });

  it("@spec:AC-014 a versão escura redefine cor, e não a escala de espaçamento", () => {
    const escuro = valoresDoBloco(BLOCOS.escuro);

    expect(
      [...escuro.keys()].every((nome) => !nome.startsWith("--espaco-")),
    ).toBe(true);
    expect(escuro.get("--cor-fundo")).toBe(PALETA_ESCURA.fundo);
  });
});

describe("ativos oficiais da marca", () => {
  it("@spec:AC-945 publica somente as variações SVG aprovadas, sem efeitos adicionados", () => {
    const nomes = [
      "logo-primary.svg",
      "logo-reverse.svg",
      "logo-monochrome-black.svg",
      "logo-monochrome-white.svg",
      "app-icon-light.svg",
      "app-icon-dark.svg",
    ];

    for (const nome of nomes) {
      const conteudo = readFileSync(
        fileURLToPath(
          new URL(`../../../apps/web/public/brand/${nome}`, import.meta.url),
        ),
        "utf8",
      );
      expect(conteudo).toMatch(/<svg\b/);
      expect(conteudo).not.toMatch(/<filter\b|drop-shadow|rotate\(/i);
    }
  });
});

/** Pares que o CSS dos componentes realmente empilha, um sobre o outro. */
const paresDeTexto = (p: PaletaDeCores): [string, string, string][] => [
  ["tinta sobre fundo", p.tinta, p.fundo],
  ["tinta sobre superfície", p.tinta, p.superficie],
  ["tinta sobre superfície alta", p.tinta, p.superficieAlta],
  ["tinta suave sobre fundo", p.tintaSuave, p.fundo],
  ["tinta suave sobre superfície alta", p.tintaSuave, p.superficieAlta],
  ["letra do botão principal", p.emPrimaria, p.primaria],
  ["cor principal como texto", p.primariaTexto, p.fundo],
  ["letra do botão de sucesso", p.emSucesso, p.sucesso],
  ["letra do botão de erro", p.emErro, p.erro],
  ["letra do botão de atenção", p.emAtencao, p.atencao],
  ["erro sobre o aviso de erro", p.erro, p.erroSuave],
  ["tinta sobre o aviso de erro", p.tinta, p.erroSuave],
  ["sucesso sobre o aviso de sucesso", p.sucesso, p.sucessoSuave],
  ["tinta sobre o aviso de sucesso", p.tinta, p.sucessoSuave],
  ["atenção sobre o aviso de atenção", p.atencao, p.atencaoSuave],
  ["tinta sobre o aviso de atenção", p.tinta, p.atencaoSuave],
  ["informação sobre o aviso informativo", p.info, p.infoSuave],
  ["cabeçalho da tabela", p.tintaSuave, p.superficie],
  ["tinta sobre o aviso informativo", p.tinta, p.infoSuave],
];

/** Pares que só desenham fronteira: o piso do WCAG aqui é 3:1. */
const paresGraficos = (p: PaletaDeCores): [string, string, string][] => [
  ["contorno de campo sobre o fundo", p.bordaForte, p.fundo],
  ["contorno de campo sobre a superfície", p.bordaForte, p.superficie],
  ["anel de foco sobre o fundo", p.foco, p.fundo],
  ["anel de foco sobre a superfície alta", p.foco, p.superficieAlta],
  // A bolinha do selo é desenho: o texto ao lado é que carrega o sentido.
  ["bolinha do selo de sucesso", p.sucesso, p.sucessoSuave],
  ["bolinha do selo de atenção", p.atencao, p.atencaoSuave],
  ["bolinha do selo de erro", p.erro, p.erroSuave],
  ["bolinha do selo informativo", p.info, p.infoSuave],
  ["bolinha do selo neutro", p.tintaSuave, p.superficie],
];

describe("legibilidade da paleta", () => {
  for (const [tema, paleta] of [
    ["claro", PALETA_CLARA],
    ["escuro", PALETA_ESCURA],
  ] as const) {
    it(`@spec:AC-015 @spec:AC-943 todo par de texto do tema ${tema} alcança ${CONTRASTE_MINIMO_TEXTO}:1`, () => {
      const reprovados = paresDeTexto(paleta)
        .map(([nome, frente, fundo]) => ({
          nome,
          relacao: relacaoDeContraste(frente, fundo),
        }))
        .filter(({ relacao }) => relacao < CONTRASTE_MINIMO_TEXTO);

      expect(reprovados).toEqual([]);
    });

    it(`@spec:AC-015 @spec:AC-943 todo contorno e anel de foco do tema ${tema} alcança ${CONTRASTE_MINIMO_GRAFICO}:1`, () => {
      const reprovados = paresGraficos(paleta)
        .map(([nome, frente, fundo]) => ({
          nome,
          relacao: relacaoDeContraste(frente, fundo),
        }))
        .filter(({ relacao }) => relacao < CONTRASTE_MINIMO_GRAFICO);

      expect(reprovados).toEqual([]);
    });
  }
});
