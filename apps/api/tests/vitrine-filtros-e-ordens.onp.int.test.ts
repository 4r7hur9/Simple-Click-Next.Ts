/**
 * Card #108 · T-10808b — o catálogo público com o filtro "em estoque", a faixa
 * de preço e as ordens "lançamentos" e "maior desconto de atacado", pela API
 * inteira (a mesma que o navegador chama, com as políticas de linha ligadas).
 *
 * Os dados entram direto no banco: o cadastro de variação, promoção e atacado é
 * do painel, e o que esta prova cobre é a LEITURA da vitrine.
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { unitarioNaFaixa } from "@simpleclick/core";
import {
  conectarNoBancoDoArquivo,
  criarLoja,
  type LojaDeTeste,
} from "@simpleclick/testing";

import { ESPERA_DA_ADMINISTRACAO } from "./apoio-da-administracao.ts";
import {
  cliente,
  montarApiCompleta,
  sessao,
  type ApiCompleta,
} from "./apoio-da-fundacao.ts";

let api: ApiCompleta;
let http: ReturnType<typeof cliente>;
let migrador: pg.Client;
let loja: LojaDeTeste;
let vizinha: LojaDeTeste;
let grande: LojaDeTeste;
let categoriaId: string;

const ids = new Map<string, string>();

interface Cartao {
  id: string;
  nome: string;
  precoCentavos: number | null;
}
interface Pagina {
  produtos: Cartao[];
  total: number;
  proximoCursor: string | null;
}

async function categoria(
  dona: LojaDeTeste,
  nome: string,
  visivel = true,
): Promise<string> {
  const criada = await http.post(
    `/v1/lojas/${dona.apelido}/catalogo/categorias`,
    { nome, descricao: null, visivel },
    sessao(dona.dono.id, "OWNER"),
  );
  if (criada.status !== 201) throw new Error(`categoria: ${criada.status}`);
  return String(criada.body.id);
}

async function produto(
  dona: LojaDeTeste,
  nome: string,
  categoria: string,
  preco: number,
  status: "PUBLISHED" | "DRAFT" = "PUBLISHED",
): Promise<string> {
  const criado = await http.post(
    `/v1/lojas/${dona.apelido}/catalogo/produtos`,
    {
      nome,
      descricao: `${nome} da casa`,
      categoriaId: categoria,
      precoCentavos: preco,
      status,
      disponivel: true,
    },
    sessao(dona.dono.id, "OWNER"),
  );
  if (criado.status !== 201) {
    throw new Error(`produto: ${criado.status} ${JSON.stringify(criado.body)}`);
  }
  const id = String(criado.body.id);
  ids.set(nome, id);
  return id;
}

async function variacao(
  produtoId: string,
  nome: string,
  { estoque = null, disponivel = true, apagada = false } = {} as {
    estoque?: number | null;
    disponivel?: boolean;
    apagada?: boolean;
  },
  dona: LojaDeTeste = loja,
) {
  await migrador.query(
    `INSERT INTO app.product_variants
       (store_id, product_id, name, stock_quantity, is_available, deleted_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() END)`,
    [dona.id, produtoId, nome, estoque, disponivel, apagada],
  );
  await migrador.query(
    `UPDATE app.products SET has_variants = true WHERE id = $1`,
    [produtoId],
  );
}

async function preco(
  produtoId: string,
  tipo: "PROMO" | "COST",
  centavos: number,
  dona: LojaDeTeste = loja,
) {
  await migrador.query(
    `INSERT INTO app.product_prices
       (store_id, product_id, kind, amount_cents, min_quantity, is_active,
        starts_at, ends_at)
     VALUES ($1, $2, $3, $4, 1, true, now() - interval '1 day',
             now() + interval '1 day')`,
    [dona.id, produtoId, tipo, centavos],
  );
}

/** Faixa de atacado a partir de 2 unidades: com desconto, ou preço fixo. */
async function faixa(
  produtoId: string,
  desconto: { tipo: "PERCENT" | "AMOUNT"; valor: number } | { fixo: number },
  dona: LojaDeTeste = loja,
) {
  const comDesconto = "tipo" in desconto;
  await migrador.query(
    `INSERT INTO app.product_prices
       (store_id, product_id, kind, amount_cents, min_quantity, is_active,
        discount_kind, discount_value)
     VALUES ($1, $2, 'WHOLESALE', $3, 2, true, $4, $5)`,
    [
      dona.id,
      produtoId,
      comDesconto ? 0 : desconto.fixo,
      comDesconto ? desconto.tipo : null,
      comDesconto ? desconto.valor : null,
    ],
  );
}

const nomes = (pagina: Pagina) => pagina.produtos.map((p) => p.nome);

async function pagina(
  consulta: string,
  dona: LojaDeTeste = loja,
): Promise<Pagina> {
  const resposta = await http.get(
    `/v1/vitrine/${dona.apelido}/catalogo/produtos?${consulta}${
      consulta.includes("limite=") ? "" : "&limite=48"
    }`,
  );
  expect(resposta.status, consulta).toBe(200);
  return resposta.body as Pagina;
}

const PRECO_DE_FUNDO = 7777;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  loja = await criarLoja({ nome: "Padaria Filtrada" });
  vizinha = await criarLoja({ nome: "Padaria da Vizinha" });
  grande = await criarLoja({ nome: "Atacadão Grande" });
  categoriaId = await categoria(loja, "Geral");
  const oculta = await categoria(loja, "Oculta", false);

  // --- preços: tudo o que não é de preço fica fora da faixa 1200–2500 ---------
  await produto(loja, "Pao", categoriaId, 1000);
  const bolo = await produto(loja, "Bolo", categoriaId, 2000);
  await preco(bolo, "PROMO", 1500); // o que vale é 1500
  const torta = await produto(loja, "Torta", categoriaId, 3000);
  await preco(torta, "COST", 100); // custo mais barato não muda nada

  // Produto de "Ver opções": variações de preços diferentes, sem preço único.
  const variavel = await produto(loja, "Variavel", categoriaId, PRECO_DE_FUNDO);
  await variacao(variavel, "P");
  await variacao(variavel, "G");
  await migrador.query(
    `UPDATE app.products
        SET price_min_cents = 500, price_max_cents = 4000,
            display_price_cents = NULL
      WHERE id = $1`,
    [variavel],
  );

  // Preço zero e sem preço nenhum: nunca pode dar erro 500 numa rota pública.
  const zero = await produto(loja, "Zero", categoriaId, PRECO_DE_FUNDO);
  await migrador.query(
    `UPDATE app.products SET display_price_cents = 0 WHERE id = $1`,
    [zero],
  );
  await migrador.query(
    `UPDATE app.product_prices SET amount_cents = 0 WHERE product_id = $1`,
    [zero],
  );
  await faixa(zero, { tipo: "PERCENT", valor: 10 });
  const semPreco = await produto(loja, "SemPreco", categoriaId, PRECO_DE_FUNDO);
  await migrador.query(
    `UPDATE app.products SET display_price_cents = NULL WHERE id = $1`,
    [semPreco],
  );
  await migrador.query(`DELETE FROM app.product_prices WHERE product_id = $1`, [
    semPreco,
  ]);

  // --- estoque --------------------------------------------------------------
  await produto(loja, "SemVariacao", categoriaId, PRECO_DE_FUNDO);
  const indisponivel = await produto(
    loja,
    "Indisponivel",
    categoriaId,
    PRECO_DE_FUNDO,
  );
  await migrador.query(
    `UPDATE app.products SET is_available = false WHERE id = $1`,
    [indisponivel],
  );
  const zerado = await produto(loja, "Zerado", categoriaId, PRECO_DE_FUNDO);
  await variacao(zerado, "P", { estoque: 0 });
  await variacao(zerado, "G", { estoque: 0 });
  const nulo = await produto(loja, "EstoqueNulo", categoriaId, PRECO_DE_FUNDO);
  await variacao(nulo, "U", { estoque: null });
  const varIndisp = await produto(
    loja,
    "VariacaoIndisponivel",
    categoriaId,
    PRECO_DE_FUNDO,
  );
  await variacao(varIndisp, "U", { estoque: null, disponivel: false });
  const varApagada = await produto(
    loja,
    "VariacaoApagada",
    categoriaId,
    PRECO_DE_FUNDO,
  );
  await variacao(varApagada, "P", { estoque: 0 });
  await variacao(varApagada, "G", { estoque: 5, apagada: true });
  const misto = await produto(loja, "Misto", categoriaId, PRECO_DE_FUNDO);
  await variacao(misto, "P", { estoque: 0 });
  await variacao(misto, "G", { estoque: 3 });
  const foraDoHorario = await produto(
    loja,
    "ForaDoHorario",
    categoriaId,
    PRECO_DE_FUNDO,
  );
  await migrador.query(
    `UPDATE app.products SET unavailable_until = now() + interval '1 day' WHERE id = $1`,
    [foraDoHorario],
  );

  // --- atacado: o preço que vale é o do cartão (promoção vigente) -------------
  const x = await produto(loja, "AtacadoX", categoriaId, 1000);
  await faixa(x, { tipo: "PERCENT", valor: 10 }); // 10 %
  const y = await produto(loja, "AtacadoY", categoriaId, 1000);
  await faixa(y, { tipo: "AMOUNT", valor: 300 }); // 30 %
  const z = await produto(loja, "AtacadoZ", categoriaId, 3500);
  await faixa(z, { fixo: 2625 }); // 25 %
  const v = await produto(loja, "AtacadoV", categoriaId, 1000);
  await preco(v, "PROMO", 800);
  await faixa(v, { tipo: "AMOUNT", valor: 280 }); // 35 % sobre 800 (28 % sobre 1000)
  await produto(loja, "SemAtacado", categoriaId, 1000);

  // --- relevância da busca: três "Pão ..." com um esgotado no meio ------------
  await produto(loja, "Broa de milho", categoriaId, PRECO_DE_FUNDO);
  const broaEsgotada = await produto(
    loja,
    "Broa de fuba",
    categoriaId,
    PRECO_DE_FUNDO,
  );
  await migrador.query(
    `UPDATE app.products SET is_available = false WHERE id = $1`,
    [broaEsgotada],
  );
  await produto(loja, "Broa", categoriaId, PRECO_DE_FUNDO);

  // --- o que NUNCA aparece: rascunho, apagado, categoria oculta, outra loja ---
  const rascunho = await produto(loja, "Rascunho", categoriaId, 1500, "DRAFT");
  await faixa(rascunho, { tipo: "PERCENT", valor: 50 });
  const apagado = await produto(loja, "Apagado", categoriaId, 1500);
  await faixa(apagado, { tipo: "PERCENT", valor: 50 });
  await migrador.query(
    `UPDATE app.products SET deleted_at = now() WHERE id = $1`,
    [apagado],
  );
  const secreto = await produto(loja, "Secreto", oculta, 1500);
  await faixa(secreto, { tipo: "PERCENT", valor: 50 });
  const dela = await produto(
    vizinha,
    "DaVizinha",
    await categoria(vizinha, "Geral"),
    1500,
  );
  await faixa(dela, { tipo: "PERCENT", valor: 50 }, vizinha);

  // --- lançamentos: tudo antigo, e três com datas conhecidas -------------------
  await migrador.query(
    `UPDATE app.products SET created_at = '2020-01-01T00:00:00Z' WHERE store_id = $1`,
    [loja.id],
  );
  for (const [nome, data] of [
    ["Pao", "2021-01-01T00:00:00Z"],
    ["Bolo", "2022-01-01T00:00:00Z"],
    ["Torta", "2023-01-01T00:00:00Z"],
  ] as const) {
    await migrador.query(
      `UPDATE app.products SET created_at = $2 WHERE id = $1`,
      [ids.get(nome), data],
    );
  }
}, ESPERA_DA_ADMINISTRACAO * 6);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

const NUNCA = ["Rascunho", "Apagado", "Secreto", "DaVizinha"];
const ESGOTADOS = [
  "Indisponivel",
  "Zerado",
  "VariacaoIndisponivel",
  "VariacaoApagada",
  "Broa de fuba",
];

describe("filtro 'em estoque'", () => {
  it("[CA-9] @spec:AC-10816 tira o esgotado e mantém o que tem estoque, o de estoque nulo e o fora do horário", async () => {
    const todos = nomes(await pagina(""));
    const emEstoque = nomes(await pagina("estoque=1"));

    for (const esgotado of ESGOTADOS) {
      expect(todos, esgotado).toContain(esgotado);
      expect(emEstoque, esgotado).not.toContain(esgotado);
    }
    // Estoque nulo é "não controla estoque", e não zero.
    expect(emEstoque).toContain("EstoqueNulo");
    // Variação zerada ao lado de outra com estoque: o produto tem o que vender.
    expect(emEstoque).toContain("Misto");
    // Fora do horário NÃO é esgotado: tem estoque, só não vende agora.
    expect(emEstoque).toContain("ForaDoHorario");
    // Produto sem variações nunca é esgotado por causa delas.
    expect(emEstoque).toContain("SemVariacao");
    expect([...emEstoque].sort()).toEqual(
      todos.filter((nome) => !ESGOTADOS.includes(nome)).sort(),
    );
  });

  it("[CA-9] @spec:AC-10816 estoque=0 e estoque=false não filtram", async () => {
    const todos = nomes(await pagina("")).sort();
    expect(nomes(await pagina("estoque=0")).sort()).toEqual(todos);
    expect(nomes(await pagina("estoque=false")).sort()).toEqual(todos);
  });

  it("[CA-9] @spec:AC-10816 o resumo conta só o que tem estoque", async () => {
    const todos = (await pagina("")).total;
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/resumo?estoque=1`,
    );
    expect(resposta.status).toBe(200);
    const total = (resposta.body.secoes as { total: number }[]).reduce(
      (soma, secao) => soma + secao.total,
      0,
    );
    expect(total).toBe(todos - ESGOTADOS.length);
  });

  it("[CA-9] @spec:AC-10816 a relevância da busca não se perde com o filtro", async () => {
    const semFiltro = nomes(await pagina("busca=broa"));
    const comFiltro = nomes(await pagina("busca=broa&estoque=1"));
    expect(semFiltro.length).toBeGreaterThanOrEqual(3);
    expect(comFiltro).toEqual(semFiltro.filter((n) => n !== "Broa de fuba"));
  });
});

describe("faixa de preço", () => {
  it("[CA-9] @spec:AC-10816 usa o preço que vale: a promoção vigente, e não o preço de tabela", async () => {
    // Bolo custa 2000, mas a promoção vigente é 1500.
    expect(nomes(await pagina("precoMin=1200&precoMax=2500"))).toEqual([
      "Bolo",
    ]);
    expect(nomes(await pagina("precoMin=1600&precoMax=2500"))).toEqual([]);
  });

  it("[CA-9] @spec:AC-10816 os limites são inclusivos", async () => {
    expect(nomes(await pagina("precoMin=1500&precoMax=1500"))).toEqual([
      "Bolo",
    ]);
    expect(nomes(await pagina("precoMin=1000&precoMax=1000"))).toContain("Pao");
    expect(nomes(await pagina("precoMin=1499&precoMax=1500"))).toEqual([
      "Bolo",
    ]);
    expect(nomes(await pagina("precoMin=1501&precoMax=1999"))).toEqual([]);
  });

  it("[CA-9] @spec:AC-10816 um limite só vale sozinho, e min maior que max devolve lista vazia", async () => {
    expect(nomes(await pagina("precoMax=1000"))).toContain("Pao");
    expect(nomes(await pagina("precoMin=7777"))).toContain("SemVariacao");
    expect(nomes(await pagina("precoMin=5000&precoMax=1000"))).toEqual([]);
  });

  it("[CA-9] @spec:AC-10816 custo mais barato não muda a faixa", async () => {
    expect(nomes(await pagina("precoMin=3000&precoMax=3000"))).toEqual([
      "Torta",
    ]);
    expect(nomes(await pagina("precoMin=0&precoMax=200"))).not.toContain(
      "Torta",
    );
  });

  it("[CA-9] @spec:AC-10816 produto de variações de preços diferentes e produto sem preço nunca entram", async () => {
    const tudo = nomes(await pagina("precoMin=0&precoMax=100000000"));
    expect(tudo).not.toContain("Variavel");
    expect(tudo).not.toContain("SemPreco");
    // O de preço zero é um preço, e entra.
    expect(tudo).toContain("Zero");
  });

  it("[CA-9] @spec:AC-10816 o resumo conta só a faixa", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/resumo?precoMin=1200&precoMax=2500`,
    );
    expect(resposta.status).toBe(200);
    const total = (resposta.body.secoes as { total: number }[]).reduce(
      (soma, secao) => soma + secao.total,
      0,
    );
    expect(total).toBe(1);
  });
});

describe("a ordem 'lançamentos'", () => {
  it("[CA-9] @spec:AC-10816 põe o cadastro mais recente primeiro, com desempate fixo", async () => {
    const lista = nomes(await pagina("ordem=lancamentos"));
    expect(lista.slice(0, 3)).toEqual(["Torta", "Bolo", "Pao"]);
  });

  it("[CA-9] @spec:AC-10816 atravessa as páginas sem repetir nem pular", async () => {
    const completa = nomes(await pagina("ordem=lancamentos"));
    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let volta = 0; volta < 60; volta += 1) {
      const p = await pagina(
        `ordem=lancamentos&limite=5${cursor === null ? "" : `&cursor=${cursor}`}`,
      );
      vistos.push(...nomes(p));
      cursor = p.proximoCursor;
      if (cursor === null) break;
    }
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos).toEqual(completa);
  });
});

describe("a ordem 'maior desconto de atacado'", () => {
  /** A fração de desconto que o core calcularia para cada produto de atacado. */
  const esperado = () => {
    const calcular = (
      varejo: number,
      faixa: { tipoDeDesconto: "PERCENTUAL" | "VALOR"; desconto: number },
    ) => {
      const unitario = unitarioNaFaixa(varejo, faixa);
      return unitario === null ? 0 : (varejo - unitario) / varejo;
    };
    return [
      ["AtacadoV", calcular(800, { tipoDeDesconto: "VALOR", desconto: 280 })],
      ["AtacadoY", calcular(1000, { tipoDeDesconto: "VALOR", desconto: 300 })],
      // Preço fixo de 2625 sobre 3500: o desconto é (3500 - 2625) / 3500.
      ["AtacadoZ", (3500 - 2625) / 3500],
      [
        "AtacadoX",
        calcular(1000, { tipoDeDesconto: "PERCENTUAL", desconto: 10 }),
      ],
    ]
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([nome]) => String(nome));
  };

  it("[CA-9] @spec:AC-10816 ordena como o core calcularia, sobre o preço que vale (com promoção)", async () => {
    const lista = nomes(await pagina("ordem=maior-desconto-atacado"));
    expect(esperado()).toEqual([
      "AtacadoV",
      "AtacadoY",
      "AtacadoZ",
      "AtacadoX",
    ]);
    expect(lista.slice(0, 4)).toEqual(esperado());
    // Sem atacado vai para o fim, e não "ganha" de ninguém.
    expect(lista.indexOf("SemAtacado")).toBeGreaterThan(3);
  });

  it("[CA-9] @spec:AC-10816 produto com preço zero ou sem preço não derruba a página", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?ordem=maior-desconto-atacado&limite=48`,
    );
    expect(resposta.status).toBe(200);
    const lista = nomes(resposta.body as Pagina);
    expect(lista).toContain("Zero");
    expect(lista).toContain("SemPreco");
  });

  it("[CA-9] @spec:AC-10816 atravessa as páginas sem repetir", async () => {
    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let volta = 0; volta < 60; volta += 1) {
      const p = await pagina(
        `ordem=maior-desconto-atacado&limite=4${cursor === null ? "" : `&cursor=${cursor}`}`,
      );
      vistos.push(...nomes(p));
      cursor = p.proximoCursor;
      if (cursor === null) break;
    }
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos.slice(0, 4)).toEqual(esperado());
  });
});

describe("isolamento: o que nunca aparece", () => {
  const consultas = [
    "",
    "estoque=1",
    "precoMin=1000&precoMax=2000",
    "precoMin=0",
    "ordem=lancamentos",
    "ordem=maior-desconto-atacado",
    "ordem=maior-preco",
    "atacado=1",
  ];

  for (const consulta of consultas) {
    it(`[CA-9] @spec:AC-10816 rascunho, apagado, categoria oculta e outra loja não entram em "?${consulta}"`, async () => {
      const lista = nomes(await pagina(consulta));
      for (const nome of NUNCA) expect(lista, nome).not.toContain(nome);
    });
  }

  it("[CA-9] @spec:AC-10816 a outra loja continua vendo só o que é dela", async () => {
    const dela = nomes(await pagina("ordem=maior-desconto-atacado", vizinha));
    expect(dela).toEqual(["DaVizinha"]);
  });
});

describe("entrada fora do contrato", () => {
  const ruins = [
    "precoMin=abc",
    "precoMin=",
    "precoMin=-1",
    "precoMin=1e3",
    "precoMax=10.5",
    "precoMax=100000001",
    "estoque=sim",
    "ordem=aleatoria",
    `filtro=${Array.from({ length: 21 }, (_, i) => `k${i}=v`).join("&filtro=")}`,
    `filtro=${"x".repeat(121)}`,
  ];

  for (const consulta of ruins) {
    it(`[CA-9] @spec:AC-10816 ?${consulta.slice(0, 40)} dá 400 entrada_invalida`, async () => {
      const resposta = await http.get(
        `/v1/vitrine/${loja.apelido}/catalogo/produtos?${consulta}`,
      );
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toBe("entrada_invalida");
    });
  }

  it("[CA-9] @spec:AC-10816 o resumo e o catálogo inteiro também recusam preço inválido", async () => {
    for (const caminho of ["catalogo", "catalogo/resumo"]) {
      const resposta = await http.get(
        `/v1/vitrine/${loja.apelido}/${caminho}?precoMin=abc`,
      );
      expect(resposta.status, caminho).toBe(400);
    }
  });
});

describe("custo das consultas novas numa loja de 10.000 produtos", () => {
  const TOTAL = 10_000;
  const medidas: Record<string, number> = {};

  beforeAll(async () => {
    const geral = await categoria(grande, "Geral");
    const base = await produto(grande, "Base", geral, 1000);
    // 10.000 produtos de uma vez: preço de tabela, atacado em 1 de cada 4 e
    // promoção em 1 de cada 10.
    await migrador.query(
      `WITH novos AS (
         INSERT INTO app.products
           (store_id, name, slug, vertical_code, status, display_price_cents,
            price_min_cents, price_max_cents, created_at)
         SELECT $1, 'Produto ' || n, 'produto-' || n,
                (SELECT vertical_code FROM app.products WHERE id = $2),
                'PUBLISHED', 500 + (n % 400) * 10, 500 + (n % 400) * 10,
                500 + (n % 400) * 10, now() - (n || ' minutes')::interval
           FROM generate_series(1, $3::int) AS n
         RETURNING id, display_price_cents, slug
       ), vinculos AS (
         INSERT INTO app.product_categories (store_id, product_id, category_id, sort_order)
         SELECT $1, id, $4, 0 FROM novos
       ), bases AS (
         INSERT INTO app.product_prices (store_id, product_id, kind, amount_cents, min_quantity)
         SELECT $1, id, 'BASE', display_price_cents, 1 FROM novos
       ), promocoes AS (
         INSERT INTO app.product_prices
           (store_id, product_id, kind, amount_cents, min_quantity, starts_at, ends_at)
         SELECT $1, id, 'PROMO', display_price_cents - 100, 1,
                now() - interval '1 day', now() + interval '1 day'
           FROM novos WHERE (display_price_cents / 10) % 10 = 0
       )
       INSERT INTO app.product_prices
         (store_id, product_id, kind, amount_cents, min_quantity,
          discount_kind, discount_value)
       SELECT $1, id, 'WHOLESALE', 0, 2, 'PERCENT', 5 + (display_price_cents / 10) % 20
         FROM novos WHERE (display_price_cents / 10) % 4 = 0`,
      [grande.id, base, TOTAL, geral],
    );
  }, ESPERA_DA_ADMINISTRACAO * 6);

  // A evidência de custo fica num arquivo (o console de teste que passa é
  // descartado): medianas em ms de ponta a ponta, e as razões sobre a base.
  afterAll(() => {
    writeFileSync(
      join(tmpdir(), "sc-108-medidas-das-consultas.json"),
      JSON.stringify(
        {
          produtos: TOTAL,
          medianasEmMs: medidas,
          razoesSobreABase: razoes,
        },
        null,
        2,
      ),
    );
  });

  const mediana = (valores: number[]): number => {
    const ordenados = [...valores].sort((a, b) => a - b);
    return ordenados[Math.floor(ordenados.length / 2)]!;
  };

  async function cronometrar(caminho: string): Promise<number> {
    const inicio = performance.now();
    const resposta = await http.get(`/v1/vitrine/${grande.apelido}/${caminho}`);
    const fim = performance.now();
    expect(resposta.status, caminho).toBe(200);
    return fim - inicio;
  }

  /**
   * Mede o caso e a sua base INTERCALADOS: em cada rodada, uma chamada de um e
   * logo depois do outro (a ordem alterna). O runner compartilhado do CI muda
   * de ritmo em segundos; assim o ruído atinge os dois lados da mesma rodada e
   * a razão caso/base o cancela. A primeira rodada aquece o plano e não conta.
   * Devolve a mediana das razões.
   */
  async function medirContraBase(
    nome: string,
    caminho: string,
    caminhoDaBase: string,
  ): Promise<number> {
    const tempos: number[] = [];
    const temposDaBase: number[] = [];
    const razoesDasRodadas: number[] = [];
    for (let i = 0; i <= RODADAS; i += 1) {
      let caso: number;
      let base: number;
      if (i % 2 === 0) {
        base = await cronometrar(caminhoDaBase);
        caso = await cronometrar(caminho);
      } else {
        caso = await cronometrar(caminho);
        base = await cronometrar(caminhoDaBase);
      }
      if (i === 0) continue;
      tempos.push(caso);
      temposDaBase.push(base);
      razoesDasRodadas.push(caso / base);
    }
    medidas[nome] = Math.round(mediana(tempos) * 10) / 10;
    medidas[`${nome} (base da rodada)`] =
      Math.round(mediana(temposDaBase) * 10) / 10;
    razoes[nome] = Math.round(mediana(razoesDasRodadas) * 100) / 100;
    return razoes[nome]!;
  }

  // Rodadas pareadas por caso (a primeira aquece o plano e não conta). A razão
  // é a mediana delas, então um pico isolado do runner não decide sozinho.
  const RODADAS = 9;
  const razoes: Record<string, number> = {};
  // Limite da razão caso/base. Uma consulta que perde o índice fica várias
  // vezes mais lenta que a base: esse limite pega isso, e não o ruído do
  // runner. Medido localmente: 1,0 a 1,8 nos casos comuns e cerca de 2,1 no
  // desconto de atacado (preço e faixas por produto), que tem teto próprio.
  const RAZAO_MAXIMA = 2.5;
  const RAZAO_MAXIMA_DO_ATACADO = 3;
  const BASES = {
    // Sem filtro nenhum: o custo que a loja já tinha, para comparar.
    página: "catalogo/produtos?limite=48",
    resumo: "catalogo/resumo?porSecao=24&totalMaximo=72",
  } as const;
  const casos: Array<[string, string, keyof typeof BASES]> = [
    ["lancamentos", "catalogo/produtos?ordem=lancamentos&limite=48", "página"],
    [
      "maior-desconto-atacado",
      "catalogo/produtos?ordem=maior-desconto-atacado&limite=48",
      "página",
    ],
    [
      "maior-preco (refatorada)",
      "catalogo/produtos?ordem=maior-preco&limite=48",
      "página",
    ],
    [
      "faixa de preço",
      "catalogo/produtos?precoMin=700&precoMax=1500&limite=48",
      "página",
    ],
    [
      "resumo com estoque",
      "catalogo/resumo?estoque=1&porSecao=24&totalMaximo=72",
      "resumo",
    ],
    ["página com estoque", "catalogo/produtos?estoque=1&limite=48", "página"],
  ];

  for (const base of Object.keys(BASES) as Array<keyof typeof BASES>) {
    it(`[CA-9] @spec:AC-10816 base: ${base} sem filtro, em ${TOTAL} produtos (só registra)`, async () => {
      const tempos: number[] = [];
      for (let i = 0; i <= RODADAS; i += 1) {
        const tempo = await cronometrar(BASES[base]);
        if (i > 0) tempos.push(tempo);
      }
      medidas[`base: ${base} sem filtro`] =
        Math.round(mediana(tempos) * 10) / 10;
      expect(medidas[`base: ${base} sem filtro`]).toBeGreaterThan(0);
    });
  }

  for (const [nome, caminho, base] of casos) {
    const limite = nome.startsWith("maior-desconto")
      ? RAZAO_MAXIMA_DO_ATACADO
      : RAZAO_MAXIMA;
    it(`[CA-9] @spec:AC-10816 ${nome}: custo até ${limite}x a base sem filtro, em ${TOTAL} produtos`, async () => {
      const razao = await medirContraBase(nome, caminho, BASES[base]);
      expect(razao).toBeLessThan(limite);
    });
  }
});
