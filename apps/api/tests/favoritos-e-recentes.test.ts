/**
 * Card #45 — favoritos de PRODUTO e recentes com janela de tempo.
 *
 * Pela API inteira, sobre o banco do arquivo:
 *
 * - favoritar produto exige conta, só vale para produto publicado de loja no
 *   ar, não duplica e é só da pessoa da sessão;
 * - `GET /v1/feed/favoritos` traz lojas e produtos com o que o cartão mostra,
 *   sem produto excluído/despublicado nem loja fora do ar; indisponível vem
 *   marcado; favorito não expira;
 * - os produtos do feed dizem `favorito` para a pessoa da sessão;
 * - recentes: janela de 30 dias (ou `?dias=`), da última visita para trás,
 *   até 20, sem repetir; visitas velhas demais são apagadas; recentes não
 *   viram favoritos.
 */

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
  type IdentidadeDeTeste,
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
let doceria: LojaDeTeste;
let roupas: LojaDeTeste;
let pessoa: IdentidadeDeTeste;
let bolo = "";
let brigadeiro = "";
let torta = "";
let camiseta = "";

async function produto(
  loja: LojaDeTeste,
  nome: string,
  precoCentavos: number,
): Promise<string> {
  const comoDono = sessao(loja.dono.id, "OWNER");
  const categorias = await http.get(
    `/v1/lojas/${loja.apelido}/catalogo/categorias`,
    comoDono,
  );
  let categoriaId = categorias.body.categorias[0]?.id as string | undefined;
  if (categoriaId === undefined) {
    const criada = await http.post(
      `/v1/lojas/${loja.apelido}/catalogo/categorias`,
      { nome: "Destaques", descricao: null, visivel: true },
      comoDono,
    );
    categoriaId = String(criada.body.id);
  }
  const criado = await http.post(
    `/v1/lojas/${loja.apelido}/catalogo/produtos`,
    {
      nome,
      descricao: `${nome} feito na hora`,
      categoriaId,
      precoCentavos,
      status: "PUBLISHED",
      disponivel: true,
      publicarNoFeed: true,
    },
    comoDono,
  );
  if (criado.status !== 201) {
    throw new Error(
      `produto não criado: ${criado.status} ${JSON.stringify(criado.body)}`,
    );
  }
  return String(criado.body.id);
}

const ids = (lista: { id: string }[]) => lista.map((item) => item.id);
const apelidos = (lista: { apelido: string }[]) =>
  lista.map((item) => item.apelido);

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  doceria = await criarLoja({ nome: "Doceria da Vila", ramo: "lanchonete" });
  roupas = await criarLoja({ nome: "Moda Bairro", ramo: "roupas" });
  bolo = await produto(doceria, "Bolo de pote", 1500);
  brigadeiro = await produto(doceria, "Brigadeiro", 300);
  torta = await produto(doceria, "Torta de limão", 4000);
  camiseta = await produto(roupas, "Camiseta branca", 4500);
  pessoa = await criarIdentidade();
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("favoritos de produto", () => {
  it("exige conta, valida o identificador e só vale para produto no ar", async () => {
    expect(
      (await http.post(`/v1/feed/favoritos/produtos/${bolo}`, {})).status,
    ).toBe(401);
    expect((await http.get("/v1/feed/favoritos")).status).toBe(401);

    const comoPessoa = sessao(pessoa.id, "CUSTOMER");
    expect(
      (await http.post("/v1/feed/favoritos/produtos/abc", {}, comoPessoa))
        .status,
    ).toBe(400);
    expect(
      (
        await http.post(
          "/v1/feed/favoritos/produtos/00000000-0000-4000-8000-000000000000",
          {},
          comoPessoa,
        )
      ).status,
    ).toBe(404);
  });

  it("favorita, não duplica, marca no feed e lista com os dados do cartão", async () => {
    const comoPessoa = sessao(pessoa.id, "CUSTOMER");
    const marcado = await http.post(
      `/v1/feed/favoritos/produtos/${bolo}`,
      {},
      comoPessoa,
    );
    expect(marcado.status).toBe(200);
    expect(marcado.body).toEqual({ produtoId: bolo, favorito: true });
    await http.post(`/v1/feed/favoritos/produtos/${bolo}`, {}, comoPessoa);
    // O caminho da conta (usado pelo /explorar do #49) faz o mesmo.
    expect(
      (
        await http.post(
          `/v1/conta/favoritos/produtos/${camiseta}`,
          {},
          comoPessoa,
        )
      ).body,
    ).toEqual({ produtoId: camiseta, favorito: true });
    await http.post(`/v1/conta/favoritos/${doceria.apelido}`, {}, comoPessoa);

    const favoritos = await http.get("/v1/feed/favoritos", comoPessoa);
    expect(favoritos.status).toBe(200);
    expect(apelidos(favoritos.body.lojas)).toEqual([doceria.apelido]);
    // Do mais novo para o mais antigo, uma linha por produto.
    expect(ids(favoritos.body.produtos)).toEqual([camiseta, bolo]);
    expect(favoritos.body.produtos[1]).toMatchObject({
      nome: "Bolo de pote",
      precoCentavos: 1500,
      disponivel: true,
      indisponivelAte: null,
      loja: { apelido: doceria.apelido, nome: "Doceria da Vila" },
    });
    expect(favoritos.body.produtos[1].favoritadoEm).toEqual(expect.any(String));

    const feed = await http.get("/v1/feed/produtos", comoPessoa);
    const marca = Object.fromEntries(
      feed.body.produtos.map((p: { id: string; favorito: boolean }) => [
        p.id,
        p.favorito,
      ]),
    );
    expect(marca).toEqual({
      [bolo]: true,
      [camiseta]: true,
      [brigadeiro]: false,
      [torta]: false,
    });
    // Sem sessão, nada é favorito.
    const publico = await http.get("/v1/feed/produtos");
    expect(
      publico.body.produtos.every((p: { favorito: boolean }) => !p.favorito),
    ).toBe(true);
    // A loja do feed diz `favorita` para a pessoa.
    const lojas = await http.get("/v1/feed/lojas", comoPessoa);
    expect(
      lojas.body.lojas.find(
        (l: { apelido: string }) => l.apelido === doceria.apelido,
      ).favorita,
    ).toBe(true);

    // A outra pessoa não vê os favoritos desta.
    const outra = await criarIdentidade();
    expect(
      (await http.get("/v1/feed/favoritos", sessao(outra.id, "CUSTOMER"))).body,
    ).toEqual({ lojas: [], produtos: [] });
  });

  it("indisponível aparece marcado; excluído, despublicado ou de loja fora do ar some", async () => {
    const comoPessoa = sessao(pessoa.id, "CUSTOMER");
    await http.post(
      `/v1/feed/favoritos/produtos/${brigadeiro}`,
      {},
      comoPessoa,
    );
    await http.post(`/v1/feed/favoritos/produtos/${torta}`, {}, comoPessoa);

    await migrador.query(
      `UPDATE app.products SET is_available = false WHERE id = $1`,
      [brigadeiro],
    );
    await migrador.query(
      `UPDATE app.products SET deleted_at = now() WHERE id = $1`,
      [torta],
    );
    await migrador.query(
      `UPDATE app.stores SET status = 'INACTIVE' WHERE id = $1`,
      [roupas.id],
    );
    try {
      const favoritos = await http.get("/v1/feed/favoritos", comoPessoa);
      expect(ids(favoritos.body.produtos)).toEqual([brigadeiro, bolo]);
      expect(favoritos.body.produtos[0].disponivel).toBe(false);
      // Produto fora do ar não se favorita de novo...
      expect(
        (
          await http.post(
            `/v1/feed/favoritos/produtos/${torta}`,
            {},
            comoPessoa,
          )
        ).status,
      ).toBe(404);
      // ...mas tirar dos favoritos sempre funciona.
      expect(
        (await http.delete(`/v1/feed/favoritos/produtos/${torta}`, comoPessoa))
          .body,
      ).toEqual({ produtoId: torta, favorito: false });
    } finally {
      await migrador.query(
        `UPDATE app.stores SET status = 'ACTIVE' WHERE id = $1`,
        [roupas.id],
      );
    }
    // A loja voltou: o favorito dela volta junto.
    const depois = await http.get("/v1/feed/favoritos", comoPessoa);
    expect(ids(depois.body.produtos)).toEqual([brigadeiro, camiseta, bolo]);
  });

  it("favorito não expira e sai quando a pessoa tira", async () => {
    const comoPessoa = sessao(pessoa.id, "CUSTOMER");
    await migrador.query(
      `UPDATE app.favorite_products SET created_at = now() - interval '400 days'
        WHERE identity_id = $1 AND product_id = $2`,
      [pessoa.id, bolo],
    );
    expect(
      ids((await http.get("/v1/feed/favoritos", comoPessoa)).body.produtos),
    ).toContain(bolo);

    const tirado = await http.delete(
      `/v1/conta/favoritos/produtos/${bolo}`,
      comoPessoa,
    );
    expect(tirado.body).toEqual({ produtoId: bolo, favorito: false });
    expect(
      ids((await http.get("/v1/feed/favoritos", comoPessoa)).body.produtos),
    ).not.toContain(bolo);
  });
});

describe("recentes com janela", () => {
  it("lista as lojas da janela pela última visita, sem repetir, e não viram favoritas", async () => {
    const visitante = await criarIdentidade();
    const comoVisitante = sessao(visitante.id, "CUSTOMER");
    expect((await http.get("/v1/feed/recentes")).status).toBe(401);

    await http.post(`/v1/conta/recentes/${roupas.apelido}`, {}, comoVisitante);
    await http.post(`/v1/conta/recentes/${doceria.apelido}`, {}, comoVisitante);
    await http.post(`/v1/conta/recentes/${doceria.apelido}`, {}, comoVisitante);

    const recentes = await http.get("/v1/feed/recentes", comoVisitante);
    expect(recentes.status).toBe(200);
    expect(apelidos(recentes.body.lojas)).toEqual([
      doceria.apelido,
      roupas.apelido,
    ]);
    expect(recentes.body.dias).toBe(30);
    expect(
      recentes.body.lojas.every((l: { favorita: boolean }) => !l.favorita),
    ).toBe(true);
    expect((await http.get("/v1/feed/favoritos", comoVisitante)).body).toEqual({
      lojas: [],
      produtos: [],
    });

    // A visita à roupas ficou para 40 dias atrás: some da janela padrão,
    // volta com ?dias=60.
    await migrador.query(
      `UPDATE app.store_visits SET last_visited_at = now() - interval '40 days'
        WHERE identity_id = $1 AND store_id = $2`,
      [visitante.id, roupas.id],
    );
    expect(
      apelidos((await http.get("/v1/feed/recentes", comoVisitante)).body.lojas),
    ).toEqual([doceria.apelido]);
    expect(
      apelidos(
        (await http.get("/v1/conta/recentes", comoVisitante)).body.lojas,
      ),
    ).toEqual([doceria.apelido]);
    const sessenta = await http.get("/v1/feed/recentes?dias=60", comoVisitante);
    expect(apelidos(sessenta.body.lojas)).toEqual([
      doceria.apelido,
      roupas.apelido,
    ]);
    expect(sessenta.body.dias).toBe(60);
    expect(
      (await http.get("/v1/feed/recentes?dias=0", comoVisitante)).status,
    ).toBe(400);
    expect(
      (await http.get("/v1/feed/recentes?dias=91", comoVisitante)).status,
    ).toBe(400);
  });

  it(
    "apaga as visitas mais velhas que a maior janela e mostra no máximo 20",
    async () => {
      const visitante = await criarIdentidade();
      const comoVisitante = sessao(visitante.id, "CUSTOMER");
      await http.post(
        `/v1/conta/recentes/${roupas.apelido}`,
        {},
        comoVisitante,
      );
      await migrador.query(
        `UPDATE app.store_visits SET last_visited_at = now() - interval '120 days'
        WHERE identity_id = $1 AND store_id = $2`,
        [visitante.id, roupas.id],
      );
      // Outra visita qualquer faz a limpeza.
      await http.post(
        `/v1/conta/recentes/${doceria.apelido}`,
        {},
        comoVisitante,
      );
      const sobrou = await migrador.query(
        `SELECT store_id FROM app.store_visits WHERE identity_id = $1`,
        [visitante.id],
      );
      expect(sobrou.rows).toEqual([{ store_id: doceria.id }]);

      // 22 lojas visitadas: só as 20 mais recentes aparecem.
      const extras: LojaDeTeste[] = [];
      for (let i = 0; i < 22; i += 1) {
        extras.push(await criarLoja({ nome: `Loja extra ${i}` }));
      }
      await migrador.query(
        `INSERT INTO app.store_visits (identity_id, store_id, last_visited_at)
       SELECT $1, id, now() - make_interval(mins => ordem::int)
         FROM unnest($2::uuid[]) WITH ORDINALITY AS t(id, ordem)`,
        [visitante.id, extras.map((loja) => loja.id)],
      );
      const recentes = await http.get("/v1/feed/recentes", comoVisitante);
      expect(recentes.body.lojas).toHaveLength(20);
      expect(recentes.body.lojas[0].apelido).toBe(doceria.apelido);
      expect(new Set(apelidos(recentes.body.lojas)).size).toBe(20);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
