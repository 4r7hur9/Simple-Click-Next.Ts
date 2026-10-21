/**
 * Card #74 — o catálogo público em pedaços, pela API inteira:
 *
 * - `/catalogo/resumo` dá as seções com a contagem, sem produtos (ou com os N
 *   primeiros de cada uma, e o cursor para continuar);
 * - `/catalogo/produtos` percorre uma lista por cursor, sem repetir nem pular,
 *   com categoria, busca, atacado e ordem aplicados no servidor;
 * - rascunho, categoria oculta e produto de outra loja não entram em nenhum.
 */

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

const LANCHES = 30;

interface Produto {
  id: string;
  nome: string;
  precoCentavos: number | null;
}

interface Pagina {
  produtos: Produto[];
  total: number;
  proximoCursor: string | null;
}

interface Resumo {
  secoes: {
    apelido: string;
    nome: string;
    total: number;
    produtos: Produto[];
    proximoCursor: string | null;
  }[];
  destaques: Produto[];
  atacado?: { produtos: number };
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
  if (criada.status !== 201) {
    throw new Error(`categoria não criada: ${criada.status}`);
  }
  return String(criada.body.id);
}

async function produto(
  dona: LojaDeTeste,
  nome: string,
  categoriaId: string,
  { preco, status = "PUBLISHED" }: { preco: number; status?: "PUBLISHED" | "DRAFT" },
): Promise<string> {
  const criado = await http.post(
    `/v1/lojas/${dona.apelido}/catalogo/produtos`,
    {
      nome,
      descricao: `${nome} da casa`,
      categoriaId,
      precoCentavos: preco,
      status,
      disponivel: true,
    },
    sessao(dona.dono.id, "OWNER"),
  );
  if (criado.status !== 201) {
    throw new Error(
      `produto não criado: ${criado.status} ${JSON.stringify(criado.body)}`,
    );
  }
  return String(criado.body.id);
}

/** Percorre a lista inteira pelo cursor, como o "Ver mais" faz. */
async function percorrer(consulta: string, limite: number): Promise<Produto[]> {
  const vistos: Produto[] = [];
  let cursor: string | null = null;
  for (let volta = 0; volta < 50; volta += 1) {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?${consulta}&limite=${limite}${
        cursor === null ? "" : `&cursor=${cursor}`
      }`,
    );
    expect(resposta.status).toBe(200);
    const pagina = resposta.body as Pagina;
    expect(pagina.produtos.length).toBeLessThanOrEqual(limite);
    vistos.push(...pagina.produtos);
    cursor = pagina.proximoCursor;
    if (cursor === null) return vistos;
  }
  throw new Error("a lista não acabou em 50 páginas");
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  loja = await criarLoja({ nome: "Lanchonete Paginada" });
  vizinha = await criarLoja({ nome: "Vizinha Paginada" });

  const lanches = await categoria(loja, "Lanches");
  const bebidas = await categoria(loja, "Bebidas");
  const oculta = await categoria(loja, "Cardápio secreto", false);

  // Preços fora da ordem dos nomes, para a ordem por preço ter o que provar.
  for (let i = 1; i <= LANCHES; i += 1) {
    const nome = `Lanche ${String(i).padStart(2, "0")}`;
    await produto(loja, nome, lanches, { preco: 1000 + ((i * 7) % LANCHES) * 100 });
  }
  await produto(loja, "Refrigerante", bebidas, { preco: 600 });
  await produto(loja, "Suco de laranja", bebidas, { preco: 900 });
  const combo = await produto(loja, "Combo da casa", bebidas, { preco: 2500 });
  // O combo também está em Lanches: na lista sem categoria, aparece uma vez.
  await migrador.query(
    `INSERT INTO app.product_categories (store_id, product_id, category_id, sort_order)
     VALUES ($1, $2, $3, 999)`,
    [loja.id, combo, lanches],
  );
  await produto(loja, "Lanche em rascunho", lanches, { preco: 100, status: "DRAFT" });
  await produto(loja, "Prato secreto", oculta, { preco: 100 });
  await produto(vizinha, "Lanche da vizinha", await categoria(vizinha, "Lanches"), {
    preco: 100,
  });
}, ESPERA_DA_ADMINISTRACAO * 3);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("resumo do catálogo", () => {
  it("sem porSecao, dá as seções visíveis com a contagem e nenhum produto", async () => {
    const resposta = await http.get(`/v1/vitrine/${loja.apelido}/catalogo/resumo`);
    expect(resposta.status).toBe(200);
    const resumo = resposta.body as Resumo;
    expect(
      resumo.secoes.map((s) => [s.nome, s.total, s.produtos.length, s.proximoCursor]),
    ).toEqual([
      ["Lanches", LANCHES + 1, 0, null],
      ["Bebidas", 3, 0, null],
    ]);
  });

  it("com porSecao, traz os primeiros de cada seção e o cursor de quem tem mais", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/resumo?porSecao=10`,
    );
    const resumo = resposta.body as Resumo;
    const [lanches, bebidas] = resumo.secoes;
    expect(lanches?.produtos.map((p) => p.nome)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Lanche ${String(i + 1).padStart(2, "0")}`),
    );
    expect(lanches?.proximoCursor).not.toBeNull();
    expect(bebidas?.produtos).toHaveLength(3);
    expect(bebidas?.proximoCursor).toBeNull();

    // O cursor da seção continua na página da categoria, sem repetir.
    const seguinte = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?categoria=lanches&limite=5&cursor=${lanches?.proximoCursor}`,
    );
    expect((seguinte.body as Pagina).produtos[0]?.nome).toBe("Lanche 11");
  });

  it("totalMaximo reparte o teto entre as seções, com mínimo de 4", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/resumo?porSecao=24&totalMaximo=8`,
    );
    const resumo = resposta.body as Resumo;
    expect(resumo.secoes.map((s) => s.produtos.length)).toEqual([4, 3]);
  });

  it("com busca, seção sem acerto some e não há destaques", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/resumo?busca=suco&porSecao=5`,
    );
    const resumo = resposta.body as Resumo;
    expect(resumo.secoes.map((s) => [s.nome, s.total])).toEqual([["Bebidas", 1]]);
    expect(resumo.destaques).toEqual([]);
  });

  it("porSecao fora do limite é recusado", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/resumo?porSecao=500`,
    );
    expect(resposta.status).toBe(400);
  });
});

describe("página do catálogo", () => {
  it("percorre a categoria inteira por cursor, sem repetir nem pular", async () => {
    const todos = await percorrer("categoria=lanches", 7);
    const nomes = todos.map((p) => p.nome);
    expect(nomes).toHaveLength(LANCHES + 1);
    expect(new Set(nomes).size).toBe(LANCHES + 1);
    // Ordem do dono: todos com a mesma posição saem por nome; o combo,
    // vinculado com posição 999, por último.
    expect(nomes.at(0)).toBe("Lanche 01");
    expect(nomes.at(-1)).toBe("Combo da casa");
    expect(nomes).not.toContain("Lanche em rascunho");
  });

  it("devolve o total e a página padrão de 24", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?categoria=lanches`,
    );
    const pagina = resposta.body as Pagina;
    expect(pagina.total).toBe(LANCHES + 1);
    expect(pagina.produtos).toHaveLength(24);
    expect(pagina.proximoCursor).not.toBeNull();
  });

  it("sem categoria junta as seções visíveis, cada produto uma vez", async () => {
    const todos = await percorrer("ordem=a-z", 48);
    const nomes = todos.map((p) => p.nome);
    expect(nomes).toHaveLength(LANCHES + 3);
    expect(nomes.filter((n) => n === "Combo da casa")).toHaveLength(1);
    expect(nomes).not.toContain("Prato secreto");
    expect(nomes).not.toContain("Lanche da vizinha");
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });

  it("ordena por preço no servidor, nas duas direções e atravessando páginas", async () => {
    const menor = (await percorrer("ordem=menor-preco", 10)).map(
      (p) => p.precoCentavos ?? 0,
    );
    expect(menor).toEqual([...menor].sort((a, b) => a - b));
    expect(menor[0]).toBe(600);

    const maior = (await percorrer("categoria=lanches&ordem=maior-preco", 10)).map(
      (p) => p.precoCentavos ?? 0,
    );
    expect(maior).toEqual([...maior].sort((a, b) => b - a));
    expect(maior[0]).toBe(3900);
  });

  it("cruza categoria com busca", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?categoria=bebidas&busca=refrigerante`,
    );
    const pagina = resposta.body as Pagina;
    expect(pagina.produtos.map((p) => p.nome)).toEqual(["Refrigerante"]);
    expect(pagina.total).toBe(1);
    expect(pagina.proximoCursor).toBeNull();
  });

  it("atacado ligado sem nenhum produto com atacado devolve lista vazia", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?atacado=1`,
    );
    expect(resposta.body).toMatchObject({ produtos: [], total: 0, proximoCursor: null });
  });

  it("categoria oculta ou desconhecida não mostra nada", async () => {
    for (const apelido of ["cardapio-secreto", "nao-existe"]) {
      const resposta = await http.get(
        `/v1/vitrine/${loja.apelido}/catalogo/produtos?categoria=${apelido}`,
      );
      expect(resposta.status).toBe(200);
      expect((resposta.body as Pagina).total).toBe(0);
    }
  });

  it("cursor ilegível recomeça; cursor com caractere estranho é recusado; limite tem teto", async () => {
    const recomeca = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?categoria=lanches&cursor=bGl4bw`,
    );
    expect((recomeca.body as Pagina).produtos[0]?.nome).toBe("Lanche 01");

    const estranho = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?cursor=${encodeURIComponent("a'b")}`,
    );
    expect(estranho.status).toBe(400);

    const grande = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?limite=49`,
    );
    expect(grande.status).toBe(400);
  });

  it("página além do fim vem vazia, com o total certo", async () => {
    const alem = Buffer.from(JSON.stringify({ p: 500 })).toString("base64url");
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/catalogo/produtos?categoria=lanches&cursor=${alem}`,
    );
    expect(resposta.body).toMatchObject({
      produtos: [],
      total: LANCHES + 1,
      proximoCursor: null,
    });
  });

  it("loja inexistente responde 404", async () => {
    const resposta = await http.get("/v1/vitrine/nao-existe-mesmo/catalogo/produtos");
    expect(resposta.status).toBe(404);
  });
});
