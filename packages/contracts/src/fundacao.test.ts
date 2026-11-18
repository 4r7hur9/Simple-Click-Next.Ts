/**
 * Card #25 — as regras puras da fundação: matriz de permissões, etapas do
 * pedido, tema da loja, transições da loja e a leitura da consulta do feed.
 */

import { describe, expect, it } from "vitest";

import {
  COR_DE_DESTAQUE_PADRAO,
  esquemaDaConsultaDeProdutosDoFeed,
  esquemaDaEdicaoDoTema,
  esquemaDaLojaSolicitada,
  etapaDoStatus,
  etapasDaForma,
  MATRIZ_DE_PERMISSOES,
  mensagemDoLimiteAtingido,
  PERMISSOES_DA_LOJA,
  podeNaLoja,
  rotuloDaEtapa,
  temaDaLoja,
  corDaImagem,
  tiposDaConsulta,
  buscaDaConsulta,
  TRANSICOES_DA_LOJA,
} from "./index.ts";

describe("matriz de permissões", () => {
  it("o dono pode tudo; a equipe não mexe em configurações, equipe, feed e personalização", () => {
    expect(MATRIZ_DE_PERMISSOES.OWNER).toEqual(PERMISSOES_DA_LOJA);
    for (const vedada of [
      "configuracoes",
      "equipe",
      "feed",
      "personalizacao",
    ] as const) {
      expect(podeNaLoja("STAFF", vedada)).toBe(false);
      expect(podeNaLoja("OWNER", vedada)).toBe(true);
    }
    for (const liberada of [
      "loja.ver",
      "catalogo.categorias",
      "catalogo.produtos",
      "pedidos.operar",
      "pedidos.manual",
      "clientes",
      "metricas",
    ] as const) {
      expect(podeNaLoja("STAFF", liberada)).toBe(true);
    }
    expect(podeNaLoja("CUSTOMER", "loja.ver")).toBe(false);
  });
});

describe("etapas do pedido", () => {
  it("retirada não passa por 'saiu para entrega', e entrega não passa por 'retirada'", () => {
    expect(etapasDaForma("PICKUP").map((etapa) => etapa.rotulo)).toEqual([
      "Pedido gerado",
      "Confirmado",
      "Em preparo",
      "Retirada",
      "Concluída",
    ]);
    expect(etapasDaForma("DELIVERY").map((etapa) => etapa.status)).toEqual([
      "PENDING",
      "ACCEPTED",
      "PREPARING",
      "OUT_FOR_DELIVERY",
      "COMPLETED",
    ]);
    expect(etapaDoStatus("CANCELLED")).toBeNull();
    expect(rotuloDaEtapa("CANCELLED")).toBe("Cancelado");
    expect(rotuloDaEtapa("READY_FOR_PICKUP")).toBe("Retirada");
  });
});

describe("tema da loja", () => {
  it("tem padrão, valida a cor e só aceita imagem https; o fundo é sempre preto", () => {
    expect(temaDaLoja({})).toEqual({
      corDestaque: COR_DE_DESTAQUE_PADRAO,
      corDeFundo: "#000000",
      fundoVitrine: null,
      topoCardapio: null,
      fundoVitrineCelular: null,
      topoCardapioCelular: null,
      seloDeStatus: "AUTOMATICO",
      coresDasImagens: {},
      ajustesDasFotos: {},
    });
    // A cor guardada é ignorada: não há cor própria por loja.
    expect(temaDaLoja({ corDestaque: "#ff0000" }).corDestaque).toBe(
      COR_DE_DESTAQUE_PADRAO,
    );
    expect(
      temaDaLoja({
        fundoVitrineCelular: "https://img.exemplo.test/f-m.webp",
        topoCardapioCelular: "http://inseguro",
      }),
    ).toMatchObject({
      fundoVitrineCelular: "https://img.exemplo.test/f-m.webp",
      topoCardapioCelular: null,
    });
    expect(
      esquemaDaEdicaoDoTema.parse({
        fundoVitrineCelular: "https://img.exemplo.test/f-m.webp",
        topoCardapioCelular: null,
      }),
    ).toEqual({
      fundoVitrineCelular: "https://img.exemplo.test/f-m.webp",
      topoCardapioCelular: null,
    });
    expect(
      temaDaLoja({ corDestaque: "#ABCDEF", fundoVitrine: "http://x" })
        .corDestaque,
    ).toBe("#b7ff00");
    expect(
      temaDaLoja({ fundoVitrine: "http://inseguro" }).fundoVitrine,
    ).toBeNull();
    expect(
      esquemaDaEdicaoDoTema.safeParse({ corDestaque: "#12345" }).success,
    ).toBe(false);
    expect(esquemaDaEdicaoDoTema.safeParse({}).success).toBe(false);
    expect(esquemaDaEdicaoDoTema.parse({ corDestaque: "#FF0055" })).toEqual({
      corDestaque: "#ff0055",
    });
  });

  it("selo de status: padrão automático, só as três opções e cor da capa validada (card #64)", () => {
    const capa = "https://img.exemplo.test/capa.webp";
    const tema = temaDaLoja({
      seloDeStatus: "CLARO",
      coresDasImagens: {
        [capa]: "#6B1414",
        "http://inseguro.test/x.png": "#000000",
        "https://img.exemplo.test/y.png": "red; x: y",
      },
    });
    expect(tema).toMatchObject({
      seloDeStatus: "CLARO",
      coresDasImagens: { [capa]: "#6b1414" },
    });
    expect(corDaImagem(tema, capa)).toBe("#6b1414");
    expect(corDaImagem(tema, "https://outra.test/z.png")).toBeNull();
    expect(corDaImagem(tema, null)).toBeNull();
    expect(
      temaDaLoja({ seloDeStatus: "ROXO", coresDasImagens: "x" }),
    ).toMatchObject({ seloDeStatus: "AUTOMATICO", coresDasImagens: {} });
    expect(
      esquemaDaEdicaoDoTema.safeParse({ seloDeStatus: "ROXO" }).success,
    ).toBe(false);
    expect(
      esquemaDaEdicaoDoTema.safeParse({ coresDasImagens: { [capa]: "azul" } })
        .success,
    ).toBe(false);
    expect(
      esquemaDaEdicaoDoTema.parse({
        seloDeStatus: "ESCURO",
        coresDasImagens: { [capa]: "#ABCDEF" },
      }),
    ).toEqual({
      seloDeStatus: "ESCURO",
      coresDasImagens: { [capa]: "#abcdef" },
    });
  });
});

describe("transições da loja e limites", () => {
  it("aprovar parte de pendente ou recusada; ativar só da desativada", () => {
    expect(TRANSICOES_DA_LOJA.aprovar.de).toEqual([
      "PENDING_APPROVAL",
      "REJECTED",
    ]);
    expect(TRANSICOES_DA_LOJA.recusar).toEqual({
      de: ["PENDING_APPROVAL"],
      para: "REJECTED",
    });
    expect(TRANSICOES_DA_LOJA.desativar).toEqual({
      de: ["ACTIVE"],
      para: "INACTIVE",
    });
    expect(TRANSICOES_DA_LOJA.ativar).toEqual({
      de: ["INACTIVE"],
      para: "ACTIVE",
    });
    expect(mensagemDoLimiteAtingido("staff", 1)).toContain("1 pessoa");
  });

  it("a loja do lojista exige nome e tipo, e o apelido vira minúsculo", () => {
    expect(
      esquemaDaLojaSolicitada.parse({
        nome: "Pastel",
        tipoDeNegocio: "FOOD_SNACK",
        apelido: "Meu-Pastel",
        aceitouTermosDoLojista: true,
      }).apelido,
    ).toBe("meu-pastel");
    expect(
      esquemaDaLojaSolicitada.safeParse({
        nome: "P",
        tipoDeNegocio: "FOOD_SNACK",
        aceitouTermosDoLojista: true,
      }).success,
    ).toBe(false);
    // Sem o aceite dos termos do lojista a loja não abre (card #79).
    expect(
      esquemaDaLojaSolicitada.safeParse({
        nome: "Pastel",
        tipoDeNegocio: "FOOD_SNACK",
      }).success,
    ).toBe(false);
  });
});

describe("consulta do feed", () => {
  it("lê tipos separados por vírgula, busca vazia e padrões de página", () => {
    const consulta = esquemaDaConsultaDeProdutosDoFeed.parse({
      tipo: "food_snack,APPAREL",
      busca: "  ",
    });
    expect(tiposDaConsulta(consulta.tipo)).toEqual(["FOOD_SNACK", "APPAREL"]);
    expect(buscaDaConsulta(consulta.busca)).toBeUndefined();
    expect(consulta).toMatchObject({
      pagina: 1,
      porPagina: 20,
      ordem: "relevancia",
    });
    expect(
      esquemaDaConsultaDeProdutosDoFeed.safeParse({ porPagina: "51" }).success,
    ).toBe(false);
    expect(
      esquemaDaConsultaDeProdutosDoFeed.safeParse({ tipo: "a;b" }).success,
    ).toBe(false);
  });
});

describe("ajuste das fotos do tema (card #36)", () => {
  const AJUSTE = {
    original: "https://img.exemplo.test/original.webp",
    computador: "https://img.exemplo.test/fundo.webp",
    celular: "https://img.exemplo.test/fundo-celular.webp",
    iguais: false,
    fundo: { tipo: "media" },
    estados: {
      computador: {
        modo: "preencher",
        zoom: 2,
        x: -800,
        y: -300,
        giro: 0,
        espelhado: false,
      },
      celular: {
        modo: "ajustar",
        zoom: 1,
        x: 0,
        y: 120,
        giro: 90,
        espelhado: true,
      },
    },
  };

  it("guarda só ajuste válido; o resto some em silêncio", () => {
    const tema = temaDaLoja({
      ajustesDasFotos: {
        fundoVitrine: AJUSTE,
        topoCardapio: { ...AJUSTE, original: "http://inseguro.test/x.jpg" },
        logo: {
          ...AJUSTE,
          estados: { computador: { ...AJUSTE.estados.computador, zoom: 99 } },
        },
        qualquerCoisa: AJUSTE,
      },
    });
    expect(Object.keys(tema.ajustesDasFotos ?? {})).toEqual(["fundoVitrine"]);
    expect(temaDaLoja({ ajustesDasFotos: "lixo" }).ajustesDasFotos).toEqual({});
  });

  it("a edição do tema aceita os ajustes e recusa número fora do limite", () => {
    expect(
      esquemaDaEdicaoDoTema.safeParse({
        ajustesDasFotos: { fundoVitrine: AJUSTE },
      }).success,
    ).toBe(true);
    expect(
      esquemaDaEdicaoDoTema.safeParse({ ajustesDasFotos: {} }).success,
    ).toBe(true);
    expect(
      esquemaDaEdicaoDoTema.safeParse({
        ajustesDasFotos: {
          fundoVitrine: {
            ...AJUSTE,
            estados: { computador: { ...AJUSTE.estados.computador, giro: 45 } },
          },
        },
      }).success,
    ).toBe(false);
  });
});
