import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  relacaoDeContraste,
} from "../src/contraste";
import {
  BRILHO_DO_CTA,
  COR_DA_ESTRELA_NO_ESCURO,
  COR_DE_FUNDO_DA_LOJA,
  ESCALA_TIPOGRAFICA,
  ESCALA_TIPOGRAFICA_COMPUTADOR,
  MEDIDAS,
  NOME_NO_CSS,
  NOME_NO_CSS_DA_ESCALA,
  NOME_NO_CSS_DAS_MEDIDAS,
  PALETA_CLARA,
  PALETA_ESCURA,
  type PaletaDeCores,
  type PapelTipografico,
} from "../src/tokens";

/**
 * Base visual do redesign Stitch (card #104, T-10401): os tokens vêm de um
 * lugar só. Os blocos de tema da folha e o espelho em TypeScript dizem a mesma
 * coisa, a escala de letras tem nome de uso, e os pares de cor são legíveis.
 */

const RAIZ = fileURLToPath(new URL("../../..", import.meta.url));
const COMENTARIOS = /\/\*[\s\S]*?\*\//g;
const CSS = readFileSync(
  fileURLToPath(new URL("../styles/theme.css", import.meta.url)),
  "utf8",
).replace(COMENTARIOS, "");

/** Lê as declarações `--x: y;` do corpo de um bloco. */
function declaracoes(corpo: string): Map<string, string> {
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

/** Corpo do bloco aberto por `seletor`, a partir de `inicio` (sem chaves aninhadas). */
function corpoDoBloco(seletor: string, inicio = 0): string {
  const posicao = CSS.indexOf(seletor, inicio);
  if (posicao === -1) throw new Error(`bloco "${seletor}" não existe no tema`);
  const abertura = CSS.indexOf("{", posicao);
  return CSS.slice(abertura + 1, CSS.indexOf("}", abertura));
}

/** Bloco `:root` declarado DENTRO de um `@media` (a escala do computador). */
function raizDoMedia(consulta: string): Map<string, string> {
  const posicao = CSS.indexOf(consulta);
  if (posicao === -1) throw new Error(`@media "${consulta}" não existe`);
  return declaracoes(corpoDoBloco(":root {", posicao));
}

const BLOCOS_ESCUROS = {
  "preferência do sistema": declaracoes(
    corpoDoBloco(':root:not([data-tema="claro"]) {'),
  ),
  "escolha explícita": declaracoes(corpoDoBloco(':root[data-tema="escuro"] {')),
} as const;

const BLOCOS_CLAROS = {
  raiz: declaracoes(corpoDoBloco(":root {")),
  "trecho claro": declaracoes(corpoDoBloco('[data-tema="claro"] {')),
} as const;

/** Arquivos de texto sob as pastas, sem as que o build gera. */
function arquivos(pasta: string, extensoes: readonly string[]): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(pasta)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory())
      achados.push(...arquivos(caminho, extensoes));
    else if (extensoes.some((e) => nome.endsWith(e))) achados.push(caminho);
  }
  return achados;
}

const FUNDOS_DO_ESCURO = [
  ["fundo da página", PALETA_ESCURA.fundo],
  ["superfície dos cartões", PALETA_ESCURA.superficie],
  ["superfície alta", PALETA_ESCURA.superficieAlta],
  ["preto da vitrine", COR_DE_FUNDO_DA_LOJA],
] as const;

const emPx = (rem: string): number => Number.parseFloat(rem) * 16;

describe("tokens do redesign Stitch", () => {
  it("[CA-1] @spec:AC-10401 o verde #b2f800 do guia não aparece no site nem no pacote de interface", () => {
    const pastas = [
      "apps/web/src",
      "apps/web/public",
      "packages/ui/src",
      "packages/ui/styles",
    ];
    const proibido = /b2f800|178\s*,\s*248\s*,\s*0\b|178\s+248\s+0\b/i;
    const achados: string[] = [];
    for (const pasta of pastas) {
      for (const arquivo of arquivos(join(RAIZ, pasta), [
        ".ts",
        ".tsx",
        ".css",
        ".svg",
        ".json",
      ])) {
        // Este teste nomeia o valor para poder proibi-lo.
        if (arquivo.endsWith("base-visual-tokens.onp.test.ts")) continue;
        if (proibido.test(readFileSync(arquivo, "utf8"))) achados.push(arquivo);
      }
    }
    expect(achados).toEqual([]);
    expect(PALETA_ESCURA.primaria).toBe("#b7ff00");
    expect(PALETA_ESCURA.emPrimaria).toBe("#0b0f0d");
  });

  for (const [nome, bloco] of Object.entries(BLOCOS_ESCUROS)) {
    it(`[CA-2] @spec:AC-10402 o bloco escuro "${nome}" repete o espelho em TypeScript`, () => {
      for (const [chave, nomeNoCss] of Object.entries(NOME_NO_CSS)) {
        expect(bloco.get(nomeNoCss), `${nomeNoCss} no bloco "${nome}"`).toBe(
          PALETA_ESCURA[chave as keyof PaletaDeCores],
        );
      }
      expect(bloco.get("--cor-estrela")).toBe(COR_DA_ESTRELA_NO_ESCURO);
      expect(bloco.get("--brilho-forca")).toBe(BRILHO_DO_CTA.forcaNoEscuro);
    });
  }

  it("[CA-2] @spec:AC-10402 os blocos escuros têm exatamente as mesmas cores entre si", () => {
    const a = BLOCOS_ESCUROS["preferência do sistema"];
    const b = BLOCOS_ESCUROS["escolha explícita"];
    for (const [nome, valor] of a.entries()) {
      if (nome.startsWith("--sombra") || nome === "--cor-sobreposicao")
        continue;
      expect(b.get(nome), nome).toBe(valor);
    }
  });

  it("[CA-3] @spec:AC-10403 cada papel da escala tem tamanho, altura, peso e espaço, iguais ao espelho", () => {
    const base = BLOCOS_CLAROS.raiz;
    for (const [papel, nomeBase] of Object.entries(NOME_NO_CSS_DA_ESCALA)) {
      const esperado = ESCALA_TIPOGRAFICA[papel as PapelTipografico];
      expect(base.get(`${nomeBase}-tamanho`), `${nomeBase}-tamanho`).toBe(
        esperado.tamanho,
      );
      expect(base.get(`${nomeBase}-altura`), `${nomeBase}-altura`).toBe(
        esperado.altura,
      );
      expect(base.get(`${nomeBase}-peso`), `${nomeBase}-peso`).toBe(
        esperado.peso,
      );
      expect(base.get(`${nomeBase}-espaco`), `${nomeBase}-espaco`).toBe(
        esperado.espaco,
      );
    }
    expect(base.get("--peso-negrito")).toBe("700");
    expect(base.get("--peso-extra")).toBe("800");
  });

  it("[CA-3] @spec:AC-10403 a escala do computador, declarada em @media, repete o espelho", () => {
    const computador = raizDoMedia("@media (min-width: 1024px)");
    for (const [papel, valores] of Object.entries(
      ESCALA_TIPOGRAFICA_COMPUTADOR,
    )) {
      const base = NOME_NO_CSS_DA_ESCALA[papel as PapelTipografico];
      expect(computador.get(`${base}-tamanho`)).toBe(valores.tamanho);
      expect(computador.get(`${base}-altura`)).toBe(valores.altura);
    }
  });

  it("[CA-3] @spec:AC-10403 nenhum texto da escala fica abaixo de 12px", () => {
    for (const [papel, tipo] of Object.entries(ESCALA_TIPOGRAFICA)) {
      expect(emPx(tipo.tamanho), papel).toBeGreaterThanOrEqual(12);
      expect(emPx(tipo.altura), papel).toBeGreaterThanOrEqual(
        emPx(tipo.tamanho),
      );
    }
    for (const [papel, tipo] of Object.entries(ESCALA_TIPOGRAFICA_COMPUTADOR)) {
      expect(emPx(tipo.tamanho), papel).toBeGreaterThanOrEqual(12);
    }
  });

  for (const [nomeDoFundo, fundo] of FUNDOS_DO_ESCURO) {
    it(`[CA-4] @spec:AC-10404 todo texto alcança 4,5:1 e todo contorno de controle 3:1 sobre o ${nomeDoFundo}`, () => {
      const p = PALETA_ESCURA;
      const textos = {
        tinta: p.tinta,
        "tinta suave": p.tintaSuave,
        "cor principal como texto": p.primariaTexto,
        sucesso: p.sucesso,
        erro: p.erro,
        atenção: p.atencao,
        informação: p.info,
      };
      for (const [nome, cor] of Object.entries(textos)) {
        expect(relacaoDeContraste(cor, fundo), nome).toBeGreaterThanOrEqual(
          CONTRASTE_MINIMO_TEXTO,
        );
      }
      const graficos = {
        "contorno de controle": p.bordaForte,
        "anel de foco": p.foco,
        "estrela preenchida": COR_DA_ESTRELA_NO_ESCURO,
      };
      for (const [nome, cor] of Object.entries(graficos)) {
        expect(relacaoDeContraste(cor, fundo), nome).toBeGreaterThanOrEqual(
          CONTRASTE_MINIMO_GRAFICO,
        );
      }
    });
  }

  it("[CA-4] @spec:AC-10404 a divisória decorativa (--cor-borda) não é o contorno de controle", () => {
    expect(PALETA_ESCURA.borda).not.toBe(PALETA_ESCURA.bordaForte);
    // Só `--cor-borda-forte` cumpre o 3:1; a divisória pode ficar abaixo.
    expect(
      relacaoDeContraste(PALETA_ESCURA.bordaForte, PALETA_ESCURA.superficie),
    ).toBeGreaterThanOrEqual(3);
  });

  it("[CA-4] @spec:AC-10404 a letra escura sobre o verde passa de 4,5:1 e o toque do cliente é de 48px", () => {
    expect(
      relacaoDeContraste(PALETA_ESCURA.emPrimaria, PALETA_ESCURA.primaria),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    expect(
      BLOCOS_CLAROS.raiz.get(NOME_NO_CSS_DAS_MEDIDAS.alturaToqueCliente),
    ).toBe(MEDIDAS.alturaToqueCliente);
    expect(MEDIDAS.alturaToqueCliente).toBe("3rem");
    // O painel segue com 44px: o token global não mudou.
    expect(MEDIDAS.alturaToque).toBe("2.75rem");
  });

  for (const [nome, bloco] of Object.entries(BLOCOS_CLAROS)) {
    it(`[CA-20] @spec:AC-10420 o tema claro (${nome}) mantém os valores do espelho claro`, () => {
      for (const [chave, nomeNoCss] of Object.entries(NOME_NO_CSS)) {
        expect(bloco.get(nomeNoCss), `${nomeNoCss} no claro (${nome})`).toBe(
          PALETA_CLARA[chave as keyof PaletaDeCores],
        );
      }
      expect(bloco.get("--cor-estrela")).toBe("currentcolor");
      expect(bloco.get("--brilho-forca")).toBe(BRILHO_DO_CTA.forcaNoClaro);
    });
  }

  it("[CA-20] @spec:AC-10420 o claro não ganhou nem perdeu valor: paleta clara idêntica à de antes do redesign", () => {
    expect(PALETA_CLARA).toEqual({
      fundo: "#ffffff",
      superficie: "#f5f7f4",
      superficieAlta: "#ffffff",
      tinta: "#0b0f0d",
      tintaSuave: "#4d5852",
      borda: "#a8b1ab",
      bordaForte: "#65706a",
      primaria: "#b7ff00",
      emPrimaria: "#0b0f0d",
      primariaSuave: "#e5ffb8",
      primariaTexto: "#3f7900",
      sucesso: "#136c3a",
      emSucesso: "#ffffff",
      sucessoSuave: "#e6f6ec",
      erro: "#b3251c",
      emErro: "#ffffff",
      erroSuave: "#fdeceb",
      atencao: "#8a5300",
      emAtencao: "#ffffff",
      atencaoSuave: "#fdf3e2",
      info: "#3f7900",
      infoSuave: "#e5ffb8",
      foco: "#4f8f00",
    });
  });
});
