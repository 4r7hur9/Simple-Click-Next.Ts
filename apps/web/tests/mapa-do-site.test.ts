/**
 * Prova do mapa do site de uma loja (AC-403).
 *
 * O MAPA É O CAMINHO DE ENTRADA de uma loja recém-criada: ela não está linkada
 * de lugar nenhum, e sem o mapa o buscador só a encontra quando alguém
 * compartilhar o endereço. Como os dados estruturados, é conteúdo que ninguém
 * vê — quebrado, não tem sintoma.
 *
 * `buscar` ENTRA POR PARÂMETRO, e é o que torna esta prova possível sem rede: a
 * regra mora em `server/mapa-do-site.ts`, e não no arquivo de rota — arquivo de
 * rota do Next só pode exportar verbos HTTP, e o que não se pode injetar não se
 * prova sem subir a API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CatalogoDaVitrineNoContrato,
  Vitrine,
} from "@simpleclick/contracts";

import { mapaDaLoja, xmlDoMapa } from "../src/server/mapa-do-site";

const SITE = "https://simpleclick.exemplo.test";

const LOJA: Vitrine["loja"] = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  ramo: "FOOD_SNACK",
  alimentacao: true,
  rotulos: {
    catalogo: "Cardápio",
    variacao: "Sabor",
    grupoOpcao: "Ingredientes",
    buscaPlaceholder: "O que você gostaria de comer?",
  },
  fusoHorario: "America/Sao_Paulo",
  moeda: "BRL",
  formasDeEntrega: ["DELIVERY"],
  boasVindas: null,
  sobre: null,
  logo: null,
  capa: null,
  cores: null,
  whatsappPublico: null,
  enderecoParaRetirada: null,
};

const VITRINE: Vitrine = {
  loja: LOJA,
  abertura: { aberta: true, proximaAbertura: null, motivo: "ABERTA" },
  redirecionarPara: null,
};

function produtoNoContrato(id: string, nome: string) {
  return {
    id,
    apelido: nome.toLowerCase(),
    nome,
    chamada: null,
    precoCentavos: 750,
    precoAnteriorCentavos: null,
    imagem: null,
    destaque: false,
    disponivel: true,
  };
}

const CATALOGO: CatalogoDaVitrineNoContrato = {
  secoes: [
    {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      apelido: "salgados",
      nome: "Salgados",
      produtos: [
        produtoNoContrato("11111111-1111-4111-8111-111111111111", "Coxinha"),
        produtoNoContrato("22222222-2222-4222-8222-222222222222", "Empada"),
      ],
    },
    {
      id: "bbbbbbbb-2222-4222-8222-222222222222",
      apelido: "promocoes",
      nome: "Promoções",
      // O MESMO PRODUTO EM DUAS SEÇÕES: a coxinha está em Salgados e em
      // Promoções, e o endereço dela é um só.
      produtos: [
        produtoNoContrato("11111111-1111-4111-8111-111111111111", "Coxinha"),
      ],
    },
  ],
  destaques: [],
  versao: "1",
};

/**
 * Responde às duas buscas do mapa: a apresentação e o catálogo.
 *
 * O dublê olha o CAMINHO, e não a ordem das chamadas: o mapa as dispara em
 * paralelo, e um dublê que respondesse por ordem seria uma corrida.
 */
function responder(opcoes: {
  readonly vitrine?: Vitrine | number;
  readonly catalogo?: CatalogoDaVitrineNoContrato | number;
}) {
  return vi.fn(async (entrada: string | URL | Request) => {
    const endereco = String(entrada);
    const alvo = endereco.endsWith("/catalogo")
      ? opcoes.catalogo
      : opcoes.vitrine;

    if (typeof alvo === "number") {
      return new Response(null, { status: alvo });
    }
    return new Response(JSON.stringify(alvo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/** O endereço do site vem do ambiente: o mapa é absoluto por definição. */
function comSite() {
  vi.stubEnv("URL_DO_SITE", SITE);
}

describe("o mapa lista as páginas da loja (AC-403)", () => {
  it("@spec:AC-403 traz a apresentação, o catálogo e cada produto", async () => {
    comSite();

    const mapa = await mapaDaLoja(
      "sabor-e-cia",
      responder({ vitrine: VITRINE, catalogo: CATALOGO }),
    );

    expect(mapa.map((pagina) => pagina.url)).toEqual([
      `${SITE}/l/sabor-e-cia`,
      `${SITE}/l/sabor-e-cia/sobre`,
      `${SITE}/l/sabor-e-cia/catalogo`,
      `${SITE}/l/sabor-e-cia/produto/11111111-1111-4111-8111-111111111111`,
      `${SITE}/l/sabor-e-cia/produto/22222222-2222-4222-8222-222222222222`,
    ]);
  });

  it("@spec:AC-403 o produto que está em duas seções aparece uma vez", async () => {
    comSite();

    const mapa = await mapaDaLoja(
      "sabor-e-cia",
      responder({ vitrine: VITRINE, catalogo: CATALOGO }),
    );
    const enderecos = mapa.map((pagina) => pagina.url);

    // Duplicata no mapa é exatamente o que o canônico existe para desfazer —
    // não custa nada não criar.
    expect(new Set(enderecos).size).toBe(enderecos.length);
  });

  it("@spec:AC-403 os endereços são absolutos", async () => {
    comSite();

    const mapa = await mapaDaLoja(
      "sabor-e-cia",
      responder({ vitrine: VITRINE, catalogo: CATALOGO }),
    );

    // Caminho relativo num mapa do site não é interpretado por buscador
    // nenhum: o arquivo é lido fora do contexto de qualquer página.
    for (const pagina of mapa) {
      expect(pagina.url.startsWith("https://")).toBe(true);
    }
  });
});

describe("o mapa não conta o que o AC-402 manda não contar", () => {
  it("@spec:AC-402 loja inexistente ou suspensa devolve mapa vazio", async () => {
    comSite();

    const mapa = await mapaDaLoja(
      "nao-existe",
      responder({ vitrine: 404, catalogo: 404 }),
    );

    // Vazio, e não erro: um 500 aqui contaria — pela diferença de resposta —
    // que aquele endereço existe.
    expect(mapa).toEqual([]);
  });

  it("@spec:AC-403 catálogo fora do ar ainda entrega as duas páginas fixas", async () => {
    comSite();

    const mapa = await mapaDaLoja(
      "sabor-e-cia",
      responder({ vitrine: VITRINE, catalogo: 503 }),
    );

    // Um mapa que falha inteiro por causa de uma rota faz o buscador desistir
    // das duas páginas que estavam certas.
    expect(mapa.map((pagina) => pagina.url)).toEqual([
      `${SITE}/l/sabor-e-cia`,
      `${SITE}/l/sabor-e-cia/sobre`,
      `${SITE}/l/sabor-e-cia/catalogo`,
    ]);
  });
});

describe("o XML sai no formato que o protocolo define", () => {
  it("@spec:AC-403 declara o esquema de sitemaps e uma entrada por página", async () => {
    comSite();

    const xml = xmlDoMapa(
      await mapaDaLoja(
        "sabor-e-cia",
        responder({ vitrine: VITRINE, catalogo: CATALOGO }),
      ),
    );

    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml.match(/<loc>/g)).toHaveLength(5);
  });

  it("@spec:AC-402 mapa vazio continua sendo XML válido", () => {
    // Um documento truncado seria descartado inteiro pelo buscador, e a loja
    // inexistente passaria a ser distinguível da suspensa pela forma da
    // resposta — que é o que o AC-402 proíbe.
    const xml = xmlDoMapa([]);

    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
    expect(xml).not.toContain("<loc>");
  });

  it("@spec:AC-403 escapa o que o XML não aceita cru", () => {
    const xml = xmlDoMapa([
      {
        url: "https://exemplo.test/l/a?x=1&y=2",
        mudaCom: "weekly",
        prioridade: 1,
      },
    ]);

    // `&` cru corta o documento: o buscador o descarta sem avisar ninguém.
    expect(xml).toContain("x=1&amp;y=2");
    expect(xml).not.toContain("x=1&y=2");
  });
});
