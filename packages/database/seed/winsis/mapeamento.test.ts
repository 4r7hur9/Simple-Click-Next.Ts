import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { medidasDaImagem } from "./fotos.ts";
import {
  apelidoDoProduto,
  categoriaDoNome,
  centavosDoPreco,
  coberturaDoMapa,
  descricaoDoProduto,
  ErroNoArquivo,
  lerArquivoWinsis,
  nomeDaFoto,
  palavrasDoNome,
  planejarProduto,
  quantidadeDoEstoque,
  separarReferencia,
  situacaoAoImportar,
  validarMapa,
  type ProdutoWinsis,
} from "./mapeamento.ts";

/**
 * Regras do importador WinSIS (card #73): o mapa de categorias de verdade
 * (o JSON que o dono edita), preço em centavos e as decisões de estoque 0 e
 * preço 0. Funções puras — nada aqui fala com o banco.
 */

const MAPA = validarMapa(
  JSON.parse(readFileSync(new URL("./mapa-de-categorias.json", import.meta.url), "utf8")),
);

const produto = (campos: Partial<ProdutoWinsis> = {}): ProdutoWinsis => ({
  codigo: "16590",
  referencia: "FAC906 (SIMILAR SK959/ACP906/AKX35323)",
  nome: "FILTRO CABINE NOVO UNO 10/ GRAND SIENA/MOBI/FIAT 500.",
  preco: 9.72,
  estoque: 232,
  marca: "VOX",
  descricao: "",
  sem_foto: false,
  ...campos,
});

describe("categoria pelo nome", () => {
  it.each([
    ["FILTRO CABINE NOVO UNO 10/.", "filtros"],
    ["PAST FR NOVO UNO/NOVO PALIO 10/.", "freios"],
    ["AMORT DT GOL G5.", "suspensao-e-direcao"],
    ["JUNTA CABE PALIO 1.0.", "motor"],
    ["RADIADOR GOL G5 1.6.", "arrefecimento"],
    ["SENSOR ROTACAO CORSA.", "eletrica-e-sensores"],
    ["LAMPADA H4 12V 60/55W.", "iluminacao"],
    ["PARAC DT PALIO 04/17.", "carroceria-e-acabamento"],
    ["RETROV LE GOL G5 C/CONTROLE.", "vidros-retrovisores-e-limpadores"],
    ["BOR PORTA GOL G2.", "borrachas-e-vedacao"],
    ["SELETOR MARCHA CORSA.", "transmissao-e-embreagem"],
    ["PARAFUSO RODA M12.", "fixacao"],
    ["OLEO 5W30 SINTETICO 1L.", "oleos-fluidos-e-quimicos"],
    ["BICO INJ PALIO FIRE.", "injecao-e-combustivel"],
  ])("%s → %s", (nome, chave) => {
    expect(categoriaDoNome(nome, MAPA).chave).toBe(chave);
  });

  it("KIT e JG olham a segunda palavra", () => {
    expect(categoriaDoNome("KIT AMORT DT GOL G1/G2/G3/G4.", MAPA)).toMatchObject({
      chave: "suspensao-e-direcao",
      palavra: "AMORT",
    });
    expect(categoriaDoNome("JG JUNTA MTR CORSA 1.0.", MAPA).chave).toBe("motor");
    expect(categoriaDoNome("KIT EMBREAGEM PALIO 1.0.", MAPA).chave).toBe("transmissao-e-embreagem");
    expect(categoriaDoNome("JG PALHETA 22/18.", MAPA).chave).toBe("vidros-retrovisores-e-limpadores");
  });

  it("o par de palavras vence a palavra sozinha", () => {
    expect(categoriaDoNome("BOMBA DAGUA GOL 1.0.", MAPA).chave).toBe("arrefecimento");
    expect(categoriaDoNome("BOMBA OLEO GOL 1.0.", MAPA).chave).toBe("motor");
    expect(categoriaDoNome("CABO FR MAO CORSA.", MAPA).chave).toBe("freios");
    expect(categoriaDoNome("CABO VELAS PALIO.", MAPA).chave).toBe("eletrica-e-sensores");
    expect(categoriaDoNome("MAC VIDRO DT LE GOL.", MAPA).chave).toBe("vidros-retrovisores-e-limpadores");
    expect(categoriaDoNome("MAC EXT DT LE GOL.", MAPA).chave).toBe("carroceria-e-acabamento");
    expect(categoriaDoNome("KIT ROL RODA TS GOL.", MAPA).chave).toBe("suspensao-e-direcao");
  });

  it("o que não casa vai para Outras peças", () => {
    expect(categoriaDoNome("CARRITEL DESC CL/PP GRANDE.", MAPA)).toEqual({
      chave: "outras-pecas",
      regra: "outras",
      palavra: "",
    });
    expect(categoriaDoNome("", MAPA).chave).toBe("outras-pecas");
  });

  it("palavras sem acento, sem * na frente, sem ponto e até a primeira barra", () => {
    expect(palavrasDoNome("***ÓLEO 5W30.")).toEqual(["OLEO", "5W30"]);
    expect(palavrasDoNome("MOLA/PINO TRAVA.")).toEqual(["MOLA", "TRAVA"]);
    expect(palavrasDoNome("( BLOQUEADO P/ VENDA )TAMPA")).toEqual(["BLOQUEADO", "P", "VENDA", "TAMPA"]);
  });

  it("o mapa recusa palavra que aponta para categoria inexistente", () => {
    expect(() =>
      validarMapa({ ...MAPA, palavras: { FILTRO: "nao-existe" } }),
    ).toThrow(ErroNoArquivo);
  });

  it("a cobertura conta por categoria e lista as palavras de Outras", () => {
    const cobertura = coberturaDoMapa(["FILTRO AR.", "CARRITEL X.", "CARRITEL Y.", "BOLA Z."], MAPA, 2);
    expect(cobertura.total).toBe(4);
    expect(cobertura.porCategoria.find((c) => c.chave === "outras-pecas")?.produtos).toBe(3);
    expect(cobertura.palavrasEmOutras[0]).toEqual({ palavra: "CARRITEL", produtos: 2 });
    expect(cobertura.nomesEmOutras).toEqual(["CARRITEL X.", "BOLA Z."]);
  });
});

describe("preço em centavos", () => {
  it.each([
    [9.72, 972],
    [40.46, 4046],
    [2838.6, 283_860],
    [0.09, 9],
    [0.1 + 0.2, 30],
    [0, 0],
  ])("R$ %s → %s centavos", (reais, centavos) => {
    expect(centavosDoPreco(reais)).toBe(centavos);
  });

  it("recusa preço negativo ou que não é número", () => {
    expect(() => centavosDoPreco(-1)).toThrow(ErroNoArquivo);
    expect(() => centavosDoPreco(Number.NaN)).toThrow(ErroNoArquivo);
  });
});

describe("estoque e situação na vitrine", () => {
  it("estoque 0 continua 0 (esgotado, com controle de estoque)", () => {
    expect(quantidadeDoEstoque(0)).toEqual({ quantidade: 0, aviso: null });
    expect(planejarProduto(produto({ estoque: 0 }), MAPA).estoque).toBe(0);
  });

  it("estoque negativo entra como 0, com aviso; fração arredonda para baixo", () => {
    expect(quantidadeDoEstoque(-3)).toMatchObject({ quantidade: 0 });
    expect(quantidadeDoEstoque(-3).aviso).toContain("negativo");
    expect(quantidadeDoEstoque(2.5)).toMatchObject({ quantidade: 2 });
  });

  it("preço 0 oculta (rascunho) e marca que foi o importador", () => {
    expect(situacaoAoImportar(0, null)).toEqual({ status: "DRAFT", ocultoPorPreco: true });
    expect(situacaoAoImportar(0, { status: "PUBLISHED", ocultoPorPreco: false })).toEqual({
      status: "DRAFT",
      ocultoPorPreco: true,
    });
  });

  it("com preço, o ocultado pelo importador volta a ser publicado", () => {
    expect(situacaoAoImportar(972, null)).toEqual({ status: "PUBLISHED", ocultoPorPreco: false });
    expect(situacaoAoImportar(972, { status: "DRAFT", ocultoPorPreco: true })).toEqual({
      status: "PUBLISHED",
      ocultoPorPreco: false,
    });
  });

  it("rascunho que o dono fez continua rascunho", () => {
    expect(situacaoAoImportar(972, { status: "DRAFT", ocultoPorPreco: false })).toEqual({
      status: "DRAFT",
      ocultoPorPreco: false,
    });
  });
});

describe("referência, descrição e endereço", () => {
  it("separa referência e similares", () => {
    expect(separarReferencia("FAC906 (SIMILAR SK959/ACP906/AKX35323)")).toEqual({
      referencia: "FAC906",
      similares: ["SK959", "ACP906", "AKX35323"],
    });
    expect(separarReferencia("16010 (108010/KFE10)")).toEqual({
      referencia: "16010",
      similares: ["108010", "KFE10"],
    });
    expect(separarReferencia("AGN026006 (**TR5059 /TC3061)").similares).toEqual(["TR5059", "TC3061"]);
    expect(separarReferencia("MB4139S (SK402S/35401").similares).toEqual(["SK402S", "35401"]);
    expect(separarReferencia("AFF3040006 AFF3040001 9X13")).toEqual({
      referencia: "AFF3040006 AFF3040001 9X13",
      similares: [],
    });
  });

  it("a descrição leva marca, referência, similares e código", () => {
    expect(
      descricaoDoProduto({
        marca: "VOX",
        referencia: "FAC906",
        similares: ["SK959", "ACP906"],
        codigo: "16590",
        descricao: "",
      }),
    ).toBe("Marca: VOX\nReferência do fabricante: FAC906\nSimilares: SK959, ACP906\nCódigo: 16590");
  });

  it("o plano mantém o nome original e põe o código no endereço", () => {
    const plano = planejarProduto(produto(), MAPA);
    expect(plano.nome).toBe("FILTRO CABINE NOVO UNO 10/ GRAND SIENA/MOBI/FIAT 500.");
    expect(plano.apelido).toBe("filtro-cabine-novo-uno-10-grand-siena-mobi-fiat-500-16590");
    expect(plano.precoCentavos).toBe(972);
    expect(plano.categoria.chave).toBe("filtros");
    expect(plano.chamada).toBe("VOX · Ref. FAC906");
    expect(apelidoDoProduto("***", "7")).toBe("peca-7");
  });

  it("nome com bloqueio vai para os avisos", () => {
    const plano = planejarProduto(produto({ nome: "( BLOQUEADO P/ VENDA )TAMPA RESERV GOL." }), MAPA);
    expect(plano.avisos).toContain("o nome diz que está bloqueado para venda");
  });

  it("o arquivo da foto é o código sem zeros à esquerda", () => {
    expect(nomeDaFoto("005403")).toBe("5403");
    expect(nomeDaFoto("0")).toBe("0");
  });
});

describe("arquivo do fornecedor", () => {
  it("lê o formato exportado e recusa linha sem código", () => {
    const arquivo = lerArquivoWinsis(
      JSON.stringify({ exportado_em: "2026-10-18T16:05:16.040Z", total: 1, produtos: [{ codigo: 461, nome: "X", preco: 0.33, estoque: 1 }] }),
    );
    expect(arquivo.produtos[0]).toMatchObject({ codigo: "461", preco: 0.33, marca: "" });
    expect(() => lerArquivoWinsis(JSON.stringify({ produtos: [{ nome: "sem código" }] }))).toThrow(ErroNoArquivo);
    expect(() => lerArquivoWinsis("não é json")).toThrow(ErroNoArquivo);
  });
});

describe("medidas da foto", () => {
  it("lê largura e altura do cabeçalho do JPEG", () => {
    // SOI, APP0 curto, SOF0 com altura 414 e largura 332.
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x9e, 0x01, 0x4c, 0x03,
    ]);
    expect(medidasDaImagem(jpeg, "jpeg")).toEqual({ largura: 332, altura: 414 });
  });
});
