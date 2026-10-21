/**
 * Card #59 — filtro "Atacado" na vitrine da loja e no feed.
 *
 * Pela API inteira, sobre o banco do arquivo:
 *
 * - `?atacado=1` no catálogo da loja deixa só os produtos com ao menos uma
 *   faixa de atacado ativa e vigente; `pedidoMinimo` corta pelo tamanho da
 *   menor faixa; a faceta `atacado` conta sobre o resultado sem o próprio
 *   filtro (e cruzada com a busca);
 * - faixa desligada, fora da janela ou que não baixa o preço não conta; atacado de outra loja não
 *   vaza;
 * - no feed, `?atacado=1` filtra entre lojas e `totalComAtacado` é a faceta.
 *
 * As faixas entram direto no banco: o cadastro delas é do painel (cards #53 e
 * #54), e o que esta prova cobre é a leitura.
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
let atacadista: LojaDeTeste;
let vizinha: LojaDeTeste;

interface Catalogo {
  secoes: { produtos: { nome: string }[] }[];
  atacado?: { produtos: number; menorPedidoMinimo: number | null };
}

const nomesDoCatalogo = (corpo: Catalogo) =>
  corpo.secoes.flatMap((secao) => secao.produtos.map((p) => p.nome)).sort();

const nomesDoFeed = (corpo: { produtos: { nome: string }[] }) =>
  corpo.produtos.map((produto) => produto.nome).sort();

async function produto(
  loja: LojaDeTeste,
  nome: string,
  precoCentavos: number,
): Promise<string> {
  const categorias = await http.get(
    `/v1/lojas/${loja.apelido}/catalogo/categorias`,
    sessao(loja.dono.id, "OWNER"),
  );
  let categoriaId = categorias.body.categorias[0]?.id as string | undefined;
  if (categoriaId === undefined) {
    const criada = await http.post(
      `/v1/lojas/${loja.apelido}/catalogo/categorias`,
      { nome: "Bebidas", descricao: null, visivel: true },
      sessao(loja.dono.id, "OWNER"),
    );
    categoriaId = String(criada.body.id);
  }
  const criado = await http.post(
    `/v1/lojas/${loja.apelido}/catalogo/produtos`,
    {
      nome,
      descricao: `${nome} gelado`,
      categoriaId,
      precoCentavos,
      status: "PUBLISHED",
      disponivel: true,
      publicarNoFeed: true,
    },
    sessao(loja.dono.id, "OWNER"),
  );
  if (criado.status !== 201) {
    throw new Error(
      `produto não criado: ${criado.status} ${JSON.stringify(criado.body)}`,
    );
  }
  return String(criado.body.id);
}

/** Uma linha de atacado (preço fixo, como a 0007), direto no banco. */
async function atacado(
  loja: LojaDeTeste,
  produtoId: string,
  minimo: number,
  extras: { ativo?: boolean; inicio?: string; fim?: string; valor?: number } = {},
): Promise<void> {
  await migrador.query(
    `INSERT INTO app.product_prices
       (store_id, product_id, kind, amount_cents, min_quantity, is_active,
        starts_at, ends_at)
     VALUES ($1, $2, 'WHOLESALE', $7, $3, $4, $5, $6)`,
    [
      loja.id,
      produtoId,
      minimo,
      extras.ativo ?? true,
      extras.inicio ?? null,
      extras.fim ?? null,
      extras.valor ?? 200,
    ],
  );
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  atacadista = await criarLoja({ nome: "Distribuidora Boa Vista" });
  vizinha = await criarLoja({ nome: "Empório da Esquina" });

  const refri = await produto(atacadista, "Refrigerante lata", 600);
  const agua = await produto(atacadista, "Água mineral", 300);
  const suco = await produto(atacadista, "Suco natural", 900);
  const cha = await produto(atacadista, "Chá gelado", 700);
  const energetico = await produto(atacadista, "Energético", 1200);
  const cerveja = await produto(vizinha, "Cerveja long neck", 800);

  // Refrigerante: faixas crescentes (6 e 12); água: só a partir de 24.
  await atacado(atacadista, refri, 6);
  await atacado(atacadista, refri, 12);
  await atacado(atacadista, agua, 24);
  // Chá: faixa desligada; energético: faixa que já venceu. Nenhum conta.
  await atacado(atacadista, cha, 6, { ativo: false });
  await atacado(atacadista, energetico, 6, {
    inicio: "2020-01-01T00:00:00Z",
    fim: "2020-02-01T00:00:00Z",
  });
  // Suco: "atacado" de preço fixo igual ao varejo não baixa o preço, e a
  // regra do core o ignora — o filtro também (recado do #53).
  await atacado(atacadista, suco, 6, { valor: 900 });
  // Atacado da outra loja não aparece na vitrine desta.
  await atacado(vizinha, cerveja, 12);
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("filtro Atacado na vitrine da loja", () => {
  it("sem filtro, o catálogo sai inteiro e a faceta conta quem tem atacado", async () => {
    const resposta = await http.get(`/v1/vitrine/${atacadista.apelido}/catalogo`);
    expect(resposta.status).toBe(200);
    const corpo = resposta.body as Catalogo;
    expect(nomesDoCatalogo(corpo)).toHaveLength(5);
    expect(corpo.atacado).toEqual({ produtos: 2, menorPedidoMinimo: 6 });
  });

  it("?atacado=1 deixa só quem tem faixa ativa e vigente", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${atacadista.apelido}/catalogo?atacado=1`,
    );
    expect(resposta.status).toBe(200);
    const corpo = resposta.body as Catalogo;
    expect(nomesDoCatalogo(corpo)).toEqual([
      "Refrigerante lata",
      "Água mineral",
    ].sort());
    // A faceta não some quando o filtro está ligado.
    expect(corpo.atacado).toEqual({ produtos: 2, menorPedidoMinimo: 6 });
  });

  it("pedidoMinimo corta pela menor faixa do produto", async () => {
    const ate12 = await http.get(
      `/v1/vitrine/${atacadista.apelido}/catalogo?atacado=1&pedidoMinimo=12`,
    );
    expect(nomesDoCatalogo(ate12.body as Catalogo)).toEqual(["Refrigerante lata"]);

    const ate5 = await http.get(
      `/v1/vitrine/${atacadista.apelido}/catalogo?atacado=1&pedidoMinimo=5`,
    );
    expect(nomesDoCatalogo(ate5.body as Catalogo)).toEqual([]);
  });

  it("atacado=0 é o mesmo que sem filtro; valor estranho é recusado", async () => {
    const desligado = await http.get(
      `/v1/vitrine/${atacadista.apelido}/catalogo?atacado=0`,
    );
    expect(nomesDoCatalogo(desligado.body as Catalogo)).toHaveLength(5);

    const estranho = await http.get(
      `/v1/vitrine/${atacadista.apelido}/catalogo?atacado=talvez`,
    );
    expect(estranho.status).toBe(400);
  });

  it("cruza com a busca, e a faceta conta só o que a busca achou", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${atacadista.apelido}/catalogo?busca=refrigerante&atacado=1`,
    );
    const corpo = resposta.body as Catalogo;
    expect(nomesDoCatalogo(corpo)).toEqual(["Refrigerante lata"]);
    expect(corpo.atacado).toEqual({ produtos: 1, menorPedidoMinimo: 6 });

    const semAtacado = await http.get(
      `/v1/vitrine/${atacadista.apelido}/catalogo?busca=suco&atacado=1`,
    );
    expect(nomesDoCatalogo(semAtacado.body as Catalogo)).toEqual([]);
    expect((semAtacado.body as Catalogo).atacado).toEqual({
      produtos: 0,
      menorPedidoMinimo: null,
    });
  });

  it("o atacado de uma loja não vaza para a vitrine de outra", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${vizinha.apelido}/catalogo?atacado=1`,
    );
    const corpo = resposta.body as Catalogo;
    expect(nomesDoCatalogo(corpo)).toEqual(["Cerveja long neck"]);
    expect(corpo.atacado).toEqual({ produtos: 1, menorPedidoMinimo: 12 });
  });
});

describe("filtro Atacado no feed", () => {
  it("sem filtro traz todos e conta quem tem atacado entre as lojas", async () => {
    const feed = await http.get("/v1/feed/produtos");
    expect(feed.status).toBe(200);
    expect(feed.body.total).toBe(6);
    expect(feed.body.totalComAtacado).toBe(3);
  });

  it("?atacado=1 filtra entre lojas, e pedidoMinimo corta pela menor faixa", async () => {
    const feed = await http.get("/v1/feed/produtos?atacado=1");
    expect(nomesDoFeed(feed.body)).toEqual(
      ["Cerveja long neck", "Refrigerante lata", "Água mineral"].sort(),
    );
    expect(feed.body.total).toBe(3);
    expect(feed.body.totalComAtacado).toBe(3);

    const ate12 = await http.get("/v1/feed/produtos?atacado=1&pedidoMinimo=12");
    expect(nomesDoFeed(ate12.body)).toEqual(
      ["Cerveja long neck", "Refrigerante lata"].sort(),
    );
  });

  it("cruza com a busca", async () => {
    const feed = await http.get("/v1/feed/produtos?atacado=1&busca=agua");
    expect(nomesDoFeed(feed.body)).toEqual(["Água mineral"]);
  });
});
