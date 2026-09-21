// @vitest-environment jsdom
/**
 * Prova dos dados estruturados (AC-403, AC-414).
 *
 * O QUE ESTE ARQUIVO GUARDA. Dados estruturados são o único conteúdo do site
 * que NINGUÉM VÊ: quebrados, a página continua bonita e o dono não descobre
 * nada — só some do resultado da busca, meses depois, sem sintoma. É o tipo de
 * coisa que só um teste segura.
 *
 * O DESENHO É `renderToStaticMarkup` porque é assim que o buscador recebe: um
 * bloco que só aparecesse depois do JavaScript não seria lido por robô nenhum.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { LojaPublicaNoContrato } from "@simpleclick/contracts";

import type { CatalogoNaTela, ProdutoNaTela } from "../src/lib/catalogo";
import {
  cardapioDaLoja,
  DadosEstruturados,
  negocioDaLoja,
  produtoParaBuscador,
} from "../src/lib/dados-estruturados";

const SITE = "https://simpleclick.exemplo.test";

function loja(
  sobrescrita: Partial<LojaPublicaNoContrato> = {},
): LojaPublicaNoContrato {
  return {
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
    blocos: {
      cadastroProduto: ["identificacao", "preco"],
      detalheProduto: ["foto", "descricao"],
      vitrine: ["destaques", "categorias", "lista"],
    },
    fusoHorario: "America/Sao_Paulo",
    moeda: "BRL",
    formasDeEntrega: ["DELIVERY"],
    boasVindas: "Comida caseira todo dia",
    sobre: null,
    logo: null,
    capa: null,
    cores: null,
    whatsappPublico: null,
    enderecoParaRetirada: {
      logradouro: "Rua das Flores",
      numero: "10",
      complemento: null,
      bairro: "Centro",
      cidade: "Santos",
      uf: "SP",
    },
    ...sobrescrita,
  };
}

function produto(sobrescrita: Partial<ProdutoNaTela> = {}): ProdutoNaTela {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    apelido: "coxinha",
    nome: "Coxinha",
    chamada: "Massa de batata, recheio de frango",
    preco: "R$ 7,50",
    precoCentavos: 750,
    precoAnterior: null,
    imagem: null,
    disponivel: true,
    link: "/l/sabor-e-cia/produto/11111111-1111-4111-8111-111111111111",
    ...sobrescrita,
  };
}

function catalogo(produtos: readonly ProdutoNaTela[]): CatalogoNaTela {
  return {
    secoes: [
      {
        id: "aaaaaaaa-1111-4111-8111-111111111111",
        apelido: "salgados",
        nome: "Salgados",
        produtos,
      },
    ],
    destaques: [],
    abas: [],
    filtroEmVigor: null,
    linkDeTodas: "/l/sabor-e-cia/catalogo",
    termoBuscado: null,
    buscaSemAcerto: false,
    linkSemBusca: "/l/sabor-e-cia/catalogo",
    lojaSemCatalogo: false,
    filtroSemAcerto: false,
  };
}

describe("o negócio da loja é descrito no vocabulário do ramo (AC-403)", () => {
  it("@spec:AC-403 lanchonete vira Restaurant, com cardápio", () => {
    const dados = negocioDaLoja({ loja: loja(), enderecoDoSite: SITE });

    expect(dados["@type"]).toBe("Restaurant");
    expect(dados["hasMenu"]).toBe(`${SITE}/l/sabor-e-cia/catalogo`);
  });

  it("@spec:AC-403 loja de roupa vira Store, e NÃO tem cardápio", () => {
    // O mesmo erro que a tela já cometeu uma vez: "loja de roupa não tem
    // cardápio". Aqui ele custaria mais — `Menu` numa loja de roupa faz o
    // buscador DESCARTAR o bloco inteiro, e a loja some do resultado.
    const dados = negocioDaLoja({
      loja: loja({ alimentacao: false, ramo: "APPAREL" }),
      enderecoDoSite: SITE,
    });

    expect(dados["@type"]).toBe("Store");
    expect(dados["hasMenu"]).toBeUndefined();
    expect(dados["hasOfferCatalog"]).toBeDefined();
  });

  it("@spec:AC-403 o endereço absoluto identifica a loja", () => {
    const dados = negocioDaLoja({ loja: loja(), enderecoDoSite: SITE });

    // Caminho relativo aqui não abre em lugar nenhum: o buscador guarda o
    // endereço fora do contexto da página.
    expect(dados["@id"]).toBe(`${SITE}/l/sabor-e-cia`);
    expect(dados["url"]).toBe(`${SITE}/l/sabor-e-cia`);
  });

  it("@spec:AC-403 o endereço postal sai como o buscador o entende", () => {
    const dados = negocioDaLoja({ loja: loja(), enderecoDoSite: SITE });
    const endereco = dados["address"] as Record<string, unknown>;

    expect(endereco["@type"]).toBe("PostalAddress");
    expect(endereco["streetAddress"]).toBe("Rua das Flores, 10");
    expect(endereco["addressLocality"]).toBe("Santos");
    expect(endereco["addressRegion"]).toBe("SP");
  });

  it("@spec:AC-403 loja sem endereço não manda endereço vazio", () => {
    const dados = negocioDaLoja({
      loja: loja({ enderecoParaRetirada: null }),
      enderecoDoSite: SITE,
    });

    // Campo em branco é pior que campo ausente: o buscador o exibe.
    expect(dados["address"]).toBeUndefined();
  });

  it("@spec:AC-403 não anuncia horário de funcionamento", () => {
    // `abertura` é do MOMENTO; `openingHours` descreve a GRADE da semana.
    // Derivar a segunda da primeira faria a loja aparecer aberta de madrugada.
    const dados = negocioDaLoja({ loja: loja(), enderecoDoSite: SITE });

    expect(dados["openingHours"]).toBeUndefined();
    expect(dados["openingHoursSpecification"]).toBeUndefined();
  });
});

describe("o catálogo é descrito por seção (AC-403)", () => {
  it("@spec:AC-403 lanchonete recebe Menu com MenuSection e MenuItem", () => {
    const dados = cardapioDaLoja({
      loja: loja(),
      catalogo: catalogo([produto()]),
      enderecoDoSite: SITE,
    });

    expect(dados["@type"]).toBe("Menu");

    const secoes = dados["hasMenuSection"] as Record<string, unknown>[];
    expect(secoes).toHaveLength(1);
    expect(secoes[0]?.["@type"]).toBe("MenuSection");
    expect(secoes[0]?.["name"]).toBe("Salgados");

    const itens = secoes[0]?.["hasMenuItem"] as Record<string, unknown>[];
    expect(itens[0]?.["@type"]).toBe("MenuItem");
    expect(itens[0]?.["name"]).toBe("Coxinha");
  });

  it("@spec:AC-403 loja de roupa recebe OfferCatalog com Product", () => {
    const dados = cardapioDaLoja({
      loja: loja({ alimentacao: false }),
      catalogo: catalogo([produto()]),
      enderecoDoSite: SITE,
    });

    expect(dados["@type"]).toBe("OfferCatalog");
    const secoes = dados["itemListElement"] as Record<string, unknown>[];
    const itens = secoes[0]?.["itemListElement"] as Record<string, unknown>[];
    expect(itens[0]?.["@type"]).toBe("Product");
  });

  it("@spec:AC-403 o preço sai como número e moeda, e não como texto", () => {
    const dados = cardapioDaLoja({
      loja: loja(),
      catalogo: catalogo([produto()]),
      enderecoDoSite: SITE,
    });

    const secoes = dados["hasMenuSection"] as Record<string, unknown>[];
    const itens = secoes[0]?.["hasMenuItem"] as Record<string, unknown>[];
    const oferta = itens[0]?.["offers"] as Record<string, unknown>;

    // "R$ 7,50" seria descartado pelo buscador: ele quer os dois separados.
    expect(oferta["price"]).toBe("7.50");
    expect(oferta["priceCurrency"]).toBe("BRL");
    expect(oferta["availability"]).toBe("https://schema.org/InStock");
  });

  it("@spec:AC-403 produto esgotado é anunciado como esgotado, e não escondido", () => {
    const dados = cardapioDaLoja({
      loja: loja(),
      catalogo: catalogo([produto({ disponivel: false })]),
      enderecoDoSite: SITE,
    });

    const secoes = dados["hasMenuSection"] as Record<string, unknown>[];
    const itens = secoes[0]?.["hasMenuItem"] as Record<string, unknown>[];
    const oferta = itens[0]?.["offers"] as Record<string, unknown>;

    expect(oferta["availability"]).toBe("https://schema.org/OutOfStock");
  });

  it("@spec:AC-403 produto com preço por variação não recebe oferta nenhuma", () => {
    const dados = cardapioDaLoja({
      loja: loja(),
      catalogo: catalogo([produto({ preco: null, precoCentavos: null })]),
      enderecoDoSite: SITE,
    });

    const secoes = dados["hasMenuSection"] as Record<string, unknown>[];
    const itens = secoes[0]?.["hasMenuItem"] as Record<string, unknown>[];

    // Escolher um número aqui prometeria ao buscador um valor que a página não
    // cobra — e o buscador mostra o preço prometido, não o cobrado.
    expect(itens[0]?.["offers"]).toBeUndefined();
  });
});

describe("o produto é descrito com preço (AC-414)", () => {
  const dados = produtoParaBuscador({
    loja: loja(),
    nome: "Coxinha",
    descricao: "Massa de batata, recheio de frango",
    imagens: ["https://imagens.exemplo.test/coxinha.jpg"],
    precoCentavos: 750,
    disponivel: true,
    enderecoDoProduto: `${SITE}/l/sabor-e-cia/produto/abc`,
    enderecoDoSite: SITE,
  });

  it("@spec:AC-414 sai como Product, com o endereço próprio", () => {
    expect(dados["@type"]).toBe("Product");
    expect(dados["@id"]).toBe(`${SITE}/l/sabor-e-cia/produto/abc`);
  });

  it("@spec:AC-414 a oferta carrega preço, moeda e quem vende", () => {
    const oferta = dados["offers"] as Record<string, unknown>;

    // Sem a oferta, o produto aparece na busca SEM preço — e preço é o que
    // decide se a pessoa abre o link.
    expect(oferta["price"]).toBe("7.50");
    expect(oferta["priceCurrency"]).toBe("BRL");
    expect((oferta["seller"] as Record<string, unknown>)["name"]).toBe(
      "Sabor & Cia",
    );
  });

  it("@spec:AC-414 a marca é a loja, e não a plataforma", () => {
    // Quem vende é a loja. Anunciar "SimpleClick" como marca faria o buscador
    // atribuir o produto à plataforma, e não a quem o cozinha.
    expect((dados["brand"] as Record<string, unknown>)["name"]).toBe(
      "Sabor & Cia",
    );
  });
});

describe("o bloco chega ao HTML como JSON válido", () => {
  it("@spec:AC-403 sai num script de tipo ld+json, sem script no meio", () => {
    const html = renderToStaticMarkup(
      <DadosEstruturados
        dados={negocioDaLoja({ loja: loja(), enderecoDoSite: SITE })}
      />,
    );

    expect(html).toContain('type="application/ld+json"');
  });

  it("@spec:AC-403 nome com aspas continua sendo JSON legível", () => {
    // O React escaparia as aspas como entidades HTML e o buscador receberia
    // algo que não é JSON — é por isso que este bloco não passa pelo escape
    // normal, e é por isso que ele precisa deste teste.
    const html = renderToStaticMarkup(
      <DadosEstruturados
        dados={negocioDaLoja({
          loja: loja({ nome: 'Bar do "Zé"' }),
          enderecoDoSite: SITE,
        })}
      />,
    );

    const conteudo = html
      .replace(/^<script[^>]*>/, "")
      .replace(/<\/script>$/, "");

    expect(() => JSON.parse(conteudo)).not.toThrow();
    expect(JSON.parse(conteudo).name).toBe('Bar do "Zé"');
  });

  it("@spec:AC-403 nome com etiqueta de script não fecha a etiqueta", () => {
    // É a injeção clássica: `</script>` dentro de um nome de produto encerra o
    // bloco e o resto do JSON vira HTML executável na página.
    const html = renderToStaticMarkup(
      <DadosEstruturados
        dados={negocioDaLoja({
          loja: loja({ nome: "Bar </script><script>alert(1)</script>" }),
          enderecoDoSite: SITE,
        })}
      />,
    );

    expect(html).not.toContain("</script><script>");
    expect(html.match(/<script/g)).toHaveLength(1);
  });
});
