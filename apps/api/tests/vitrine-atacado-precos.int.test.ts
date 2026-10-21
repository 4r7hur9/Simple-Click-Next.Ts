/**
 * Card #56 — varejo e atacado juntos na vitrine, na página do produto e no feed.
 *
 * Pela API inteira, sobre o banco do arquivo:
 *
 * - o cartão do catálogo (e o destaque) traz `atacado` com o pedido mínimo e as
 *   faixas já em preço sobre o varejo que ele mostra;
 * - a página do produto traz a tabela completa (unitário e economia por faixa)
 *   e cada variação a sua, sobre o próprio preço;
 * - o post do feed traz o mesmo atacado do cartão;
 * - sem faixa, `atacado` é nulo e nada muda; faixa desligada não aparece.
 *
 * As faixas entram direto no banco (o cadastro é do painel, cards #53 e #54).
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
let refri: string;
let agua: string;

interface Faixa {
  quantidadeMinima: number;
  unitarioCentavos: number;
  descontoPorUnidadeCentavos: number;
}
interface Atacado {
  pedidoMinimo: number;
  faixas: Faixa[];
}
interface ProdutoComAtacado {
  id: string;
  nome: string;
  precoCentavos: number | null;
  atacado: Atacado | null;
}

async function produto(nome: string, precoCentavos: number): Promise<string> {
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

/** Uma faixa com desconto (0064), direto no banco. */
async function faixa(
  produtoId: string,
  minimo: number,
  [tipo, valor]: readonly ["PERCENT" | "AMOUNT", number],
  ativo = true,
): Promise<void> {
  await migrador.query(
    `INSERT INTO app.product_prices
       (store_id, product_id, kind, amount_cents, min_quantity, is_active,
        discount_kind, discount_value)
     VALUES ($1, $2, 'WHOLESALE', 0, $3, $4, $5, $6)`,
    [loja.id, produtoId, minimo, ativo, tipo, valor],
  );
}

const doCatalogo = (corpo: {
  secoes: { produtos: ProdutoComAtacado[] }[];
}): Map<string, ProdutoComAtacado> =>
  new Map(
    corpo.secoes.flatMap((s) => s.produtos).map((p) => [p.nome, p] as const),
  );

const ATACADO_DO_REFRI: Atacado = {
  pedidoMinimo: 6,
  faixas: [
    expect.objectContaining({
      quantidadeMinima: 6,
      unitarioCentavos: 570,
      descontoPorUnidadeCentavos: 30,
    }),
    expect.objectContaining({
      quantidadeMinima: 12,
      unitarioCentavos: 540,
      descontoPorUnidadeCentavos: 60,
    }),
  ],
};

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  loja = await criarLoja({ nome: "Distribuidora Atacadão" });

  refri = await produto("Refrigerante lata", 600);
  agua = await produto("Água mineral", 300);
  await produto("Suco natural", 900);

  // Refrigerante: 5% a partir de 6, 10% a partir de 12 (e uma desligada).
  await faixa(refri, 6, ["PERCENT", 5]);
  await faixa(refri, 12, ["PERCENT", 10]);
  await faixa(refri, 24, ["PERCENT", 20], false);
  // Água: R$ 0,50 a menos a partir de 24.
  await faixa(agua, 24, ["AMOUNT", 50]);
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("atacado no cartão do catálogo", () => {
  it("traz varejo e as faixas em preço; sem faixa, atacado nulo", async () => {
    const resposta = await http.get(`/v1/vitrine/${loja.apelido}/catalogo`);
    expect(resposta.status).toBe(200);
    const produtos = doCatalogo(resposta.body);

    const refrigerante = produtos.get("Refrigerante lata");
    expect(refrigerante?.precoCentavos).toBe(600);
    expect(refrigerante?.atacado).toEqual(ATACADO_DO_REFRI);

    expect(produtos.get("Água mineral")?.atacado).toEqual({
      pedidoMinimo: 24,
      faixas: [
        expect.objectContaining({
          quantidadeMinima: 24,
          tipoDeDesconto: "VALOR",
          desconto: 50,
          unitarioCentavos: 250,
        }),
      ],
    });
    expect(produtos.get("Suco natural")?.atacado).toBeNull();
  });
});

describe("atacado na página do produto", () => {
  it("traz a tabela completa de faixas", async () => {
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/produto/${refri}`,
    );
    expect(resposta.status).toBe(200);
    expect(resposta.body.precoCentavos).toBe(600);
    expect(resposta.body.atacado).toEqual(ATACADO_DO_REFRI);
  });

  it("produto sem faixa vem com atacado nulo", async () => {
    const catalogo = await http.get(`/v1/vitrine/${loja.apelido}/catalogo`);
    const suco = doCatalogo(catalogo.body).get("Suco natural");
    const resposta = await http.get(
      `/v1/vitrine/${loja.apelido}/produto/${suco?.id}`,
    );
    expect(resposta.status).toBe(200);
    expect(resposta.body.atacado).toBeNull();
  });
});

describe("atacado no post do feed", () => {
  it("o post traz o mesmo atacado do cartão", async () => {
    const feed = await http.get("/v1/feed/produtos?porPagina=50");
    expect(feed.status).toBe(200);
    const porNome = new Map(
      (feed.body.produtos as ProdutoComAtacado[]).map((p) => [p.nome, p]),
    );
    expect(porNome.get("Refrigerante lata")?.atacado).toEqual(ATACADO_DO_REFRI);
    expect(porNome.get("Água mineral")?.atacado?.pedidoMinimo).toBe(24);
    expect(porNome.get("Suco natural")?.atacado).toBeNull();
  });
});
