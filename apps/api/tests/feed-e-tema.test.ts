/**
 * Card #25 — feed, favoritos, recentes e o tema da vitrine.
 *
 * Pela API inteira, sobre o banco do arquivo:
 *
 * - só produto marcado "publicar no feed", de loja ativa que aceita o feed,
 *   aparece em `/v1/feed/produtos`; filtros de tipo, entrega, busca, ordem por
 *   preço e por distância;
 * - o dono tira a loja do feed e liga a publicação automática;
 * - favoritos e recentes são da pessoa da sessão;
 * - o tema (cor de destaque, fundo da vitrine, topo do cardápio) é do dono e
 *   sai na vitrine, com o fundo sempre preto.
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
let pastelaria: LojaDeTeste;
let roupas: LojaDeTeste;
let pendente: LojaDeTeste;
let pessoa: IdentidadeDeTeste;
let coxinhaId = "";

const nomes = (resposta: { body: { produtos: { nome: string }[] } }) =>
  resposta.body.produtos.map((produto) => produto.nome);

async function produto(
  loja: LojaDeTeste,
  nome: string,
  precoCentavos: number,
  publicarNoFeed?: boolean,
): Promise<string> {
  const categorias = await http.get(
    `/v1/lojas/${loja.apelido}/catalogo/categorias`,
    sessao(loja.dono.id, "OWNER"),
  );
  let categoriaId = categorias.body.categorias[0]?.id as string | undefined;
  if (categoriaId === undefined) {
    const criada = await http.post(
      `/v1/lojas/${loja.apelido}/catalogo/categorias`,
      { nome: "Destaques", descricao: null, visivel: true },
      sessao(loja.dono.id, "OWNER"),
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
      ...(publicarNoFeed === undefined ? {} : { publicarNoFeed }),
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

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  pastelaria = await criarLoja({
    nome: "Pastelaria da Praça",
    ramo: "lanchonete",
  });
  roupas = await criarLoja({ nome: "Moda Centro", ramo: "roupas" });
  pendente = await criarLoja({ nome: "Loja Nova", status: "PENDING_APPROVAL" });
  // Pastelaria na Praça da Sé (SP), entrega e retirada; roupas em Campinas, só
  // retirada.
  await migrador.query(
    `UPDATE app.stores SET lat = -23.5505, lng = -46.6333, city = 'São Paulo',
            neighborhood = 'Sé', fulfillment_modes = '{DELIVERY,PICKUP}'
      WHERE id = $1`,
    [pastelaria.id],
  );
  await migrador.query(
    `UPDATE app.stores SET lat = -22.9056, lng = -47.0608, city = 'Campinas',
            fulfillment_modes = '{PICKUP}'
      WHERE id = $1`,
    [roupas.id],
  );
  await produto(pastelaria, "Pastel de queijo", 1200, true);
  coxinhaId = await produto(pastelaria, "Coxinha", 800);
  await produto(roupas, "Camiseta preta", 5000, true);
  pessoa = await criarIdentidade();
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("produtos do feed", () => {
  it("só o que foi marcado, com loja e paginação", async () => {
    const feed = await http.get("/v1/feed/produtos");
    expect(feed.status).toBe(200);
    expect(feed.body).toMatchObject({ pagina: 1, porPagina: 20, total: 2 });
    expect(nomes(feed).sort()).toEqual(["Camiseta preta", "Pastel de queijo"]);
    const pastel = feed.body.produtos.find(
      (p: { nome: string }) => p.nome === "Pastel de queijo",
    );
    expect(pastel).toMatchObject({
      precoCentavos: 1200,
      categoria: "Destaques",
      distanciaKm: null,
      loja: {
        apelido: pastelaria.apelido,
        tipoDeNegocio: "FOOD_SNACK",
        cidade: "São Paulo",
        formasDeEntrega: ["DELIVERY", "PICKUP"],
      },
    });
    expect(JSON.stringify(feed.body)).not.toContain(pastelaria.id);
  });

  it("filtra por tipo, entrega e busca, e ordena por preço e distância", async () => {
    expect(nomes(await http.get("/v1/feed/produtos?tipo=FOOD_SNACK"))).toEqual([
      "Pastel de queijo",
    ]);
    expect(
      nomes(await http.get("/v1/feed/produtos?tipo=APPAREL,FOOD_ACAI")),
    ).toEqual(["Camiseta preta"]);
    expect(nomes(await http.get("/v1/feed/produtos?entrega=entrega"))).toEqual([
      "Pastel de queijo",
    ]);
    expect(nomes(await http.get("/v1/feed/produtos?busca=CAMISETA"))).toEqual([
      "Camiseta preta",
    ]);
    expect(nomes(await http.get("/v1/feed/produtos?busca=praca"))).toEqual([
      "Pastel de queijo",
    ]);
    expect(
      nomes(await http.get("/v1/feed/produtos?ordem=preco-maior")),
    ).toEqual(["Camiseta preta", "Pastel de queijo"]);
    const perto = await http.get(
      "/v1/feed/produtos?ordem=distancia&lat=-22.91&lng=-47.06",
    );
    expect(nomes(perto)).toEqual(["Camiseta preta", "Pastel de queijo"]);
    expect(perto.body.produtos[0].distanciaKm).toBeLessThan(2);
    expect(perto.body.produtos[1].distanciaKm).toBeGreaterThan(70);

    const pagina = await http.get(
      "/v1/feed/produtos?porPagina=1&pagina=2&ordem=preco-menor",
    );
    expect(nomes(pagina)).toEqual(["Camiseta preta"]);
    expect(pagina.body.total).toBe(2);

    expect((await http.get("/v1/feed/produtos?ordem=aleatoria")).status).toBe(
      400,
    );
    expect((await http.get("/v1/feed/produtos?lat=200")).status).toBe(400);
  });

  it("marcar depois publica; o dono tira a loja do feed e liga a publicação automática", async () => {
    const marcado = await http.patch(
      `/v1/lojas/${pastelaria.apelido}/catalogo/produtos/${coxinhaId}`,
      { publicarNoFeed: true },
      sessao(pastelaria.dono.id, "OWNER"),
    );
    expect(marcado.status).toBe(200);
    expect(marcado.body.publicarNoFeed).toBe(true);
    expect(
      nomes(await http.get("/v1/feed/produtos?tipo=FOOD_SNACK")).sort(),
    ).toEqual(["Coxinha", "Pastel de queijo"]);
    const posts = await migrador.query(
      `SELECT kind FROM app.feed_posts WHERE product_id = $1`,
      [coxinhaId],
    );
    expect(posts.rows).toEqual([{ kind: "PRODUTO_PUBLICADO" }]);

    const fora = await http.put(
      `/v1/lojas/${pastelaria.apelido}/feed`,
      { aparecerNoFeed: false },
      sessao(pastelaria.dono.id, "OWNER"),
    );
    expect(fora.body).toEqual({
      aparecerNoFeed: false,
      publicarProdutosNovos: false,
    });
    expect(nomes(await http.get("/v1/feed/produtos"))).toEqual([
      "Camiseta preta",
    ]);
    expect(
      (await http.get("/v1/feed/lojas")).body.lojas.map(
        (l: { apelido: string }) => l.apelido,
      ),
    ).toEqual([roupas.apelido]);

    await http.put(
      `/v1/lojas/${pastelaria.apelido}/feed`,
      { aparecerNoFeed: true, publicarProdutosNovos: true },
      sessao(pastelaria.dono.id, "OWNER"),
    );
    await produto(pastelaria, "Pastel de carne", 1300);
    // Produto novo, sem dizer nada da marca, já nasce no feed.
    expect(nomes(await http.get("/v1/feed/produtos?busca=carne"))).toEqual([
      "Pastel de carne",
    ]);
  });
});

describe("lojas do feed, favoritos e recentes", () => {
  it("lista as lojas ativas do feed; a pendente fica de fora", async () => {
    const lojas = await http.get("/v1/feed/lojas?ordem=nome");
    expect(lojas.status).toBe(200);
    expect(lojas.body.lojas.map((l: { apelido: string }) => l.apelido)).toEqual(
      [roupas.apelido, pastelaria.apelido],
    );
    expect(lojas.body.lojas[1]).toMatchObject({
      nome: "Pastelaria da Praça",
      tipoDeNegocio: "FOOD_SNACK",
      tipoDeNegocioNome: "Lanchonete",
      corDestaque: "#b7ff00",
      favorita: false,
      ultimaVisita: null,
    });
    expect(
      (await http.get("/v1/feed/lojas?tipo=APPAREL")).body.lojas.map(
        (l: { apelido: string }) => l.apelido,
      ),
    ).toEqual([roupas.apelido]);
  });

  it("favoritar e registrar visita exigem conta e só valem para loja no ar", async () => {
    expect(
      (await http.post(`/v1/conta/favoritos/${pastelaria.apelido}`, {})).status,
    ).toBe(401);
    expect((await http.get("/v1/conta/favoritos")).status).toBe(401);

    const comoPessoa = sessao(pessoa.id, "CUSTOMER");
    const favorita = await http.post(
      `/v1/conta/favoritos/${pastelaria.apelido}`,
      {},
      comoPessoa,
    );
    expect(favorita.body).toEqual({
      apelido: pastelaria.apelido,
      favorita: true,
    });
    // Repetir não duplica.
    await http.post(
      `/v1/conta/favoritos/${pastelaria.apelido}`,
      {},
      comoPessoa,
    );
    expect(
      (
        await http.post(
          `/v1/conta/favoritos/${pendente.apelido}`,
          {},
          comoPessoa,
        )
      ).status,
    ).toBe(404);

    const favoritos = await http.get("/v1/conta/favoritos", comoPessoa);
    expect(
      favoritos.body.lojas.map((l: { apelido: string }) => l.apelido),
    ).toEqual([pastelaria.apelido]);
    const noFeed = await http.get("/v1/feed/lojas", comoPessoa);
    expect(
      noFeed.body.lojas.find(
        (l: { apelido: string }) => l.apelido === pastelaria.apelido,
      ).favorita,
    ).toBe(true);
    // A outra pessoa não vê os favoritos desta.
    const outra = await criarIdentidade();
    expect(
      (await http.get("/v1/conta/favoritos", sessao(outra.id, "CUSTOMER"))).body
        .lojas,
    ).toEqual([]);

    const tirada = await http.delete(
      `/v1/conta/favoritos/${pastelaria.apelido}`,
      comoPessoa,
    );
    expect(tirada.body.favorita).toBe(false);
    expect((await http.get("/v1/conta/favoritos", comoPessoa)).body.total).toBe(
      0,
    );

    const primeira = await http.post(
      `/v1/conta/recentes/${roupas.apelido}`,
      {},
      comoPessoa,
    );
    expect(primeira.body.visitas).toBe(1);
    const segunda = await http.post(
      `/v1/conta/recentes/${roupas.apelido}`,
      {},
      comoPessoa,
    );
    expect(segunda.body.visitas).toBe(2);
    await http.post(`/v1/conta/recentes/${pastelaria.apelido}`, {}, comoPessoa);
    const recentes = await http.get("/v1/conta/recentes", comoPessoa);
    expect(
      recentes.body.lojas.map((l: { apelido: string }) => l.apelido),
    ).toEqual([pastelaria.apelido, roupas.apelido]);
    expect(recentes.body.lojas[0].ultimaVisita).not.toBeNull();
  });

  it("os tipos de negócio são públicos", async () => {
    const tipos = await http.get("/v1/tipos-de-negocio");
    expect(tipos.status).toBe(200);
    expect(tipos.body.tipos).toEqual(
      expect.arrayContaining([
        { codigo: "FOOD_SNACK", nome: "Lanchonete", alimentacao: true },
        { codigo: "APPAREL", nome: "Roupas", alimentacao: false },
      ]),
    );
  });
});

describe("o tema da vitrine", () => {
  it("o dono escolhe cor e imagens; a vitrine mostra, sempre sobre fundo preto", async () => {
    const comoDono = sessao(pastelaria.dono.id, "OWNER");
    const padrao = await http.get(
      `/v1/lojas/${pastelaria.apelido}/tema`,
      comoDono,
    );
    expect(padrao.body).toEqual({
      corDestaque: "#b7ff00",
      corDeFundo: "#000000",
      fundoVitrine: null,
      topoCardapio: null,
      fundoVitrineCelular: null,
      topoCardapioCelular: null,
      seloDeStatus: "AUTOMATICO",
      coresDasImagens: {},
      ajustesDasFotos: {},
    });

    expect(
      (
        await http.put(
          `/v1/lojas/${pastelaria.apelido}/tema`,
          { corDestaque: "verde" },
          comoDono,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await http.put(
          `/v1/lojas/${pastelaria.apelido}/tema`,
          { fundoVitrine: "http://inseguro.test/f.jpg" },
          comoDono,
        )
      ).status,
    ).toBe(400);

    const gravado = await http.put(
      `/v1/lojas/${pastelaria.apelido}/tema`,
      {
        corDestaque: "#FF0055",
        fundoVitrine: "https://img.exemplo.test/fundo.jpg",
      },
      comoDono,
    );
    expect(gravado.status).toBe(200);
    // Não há cor própria por loja (`temaDaLoja`, contrato do tema): a cor
    // enviada é validada e aceita, mas a vitrine segue com a cor do
    // SimpleClick. A imagem, essa, é gravada e volta.
    expect(gravado.body).toEqual({
      corDestaque: "#b7ff00",
      corDeFundo: "#000000",
      fundoVitrine: "https://img.exemplo.test/fundo.jpg",
      topoCardapio: null,
      fundoVitrineCelular: null,
      topoCardapioCelular: null,
      seloDeStatus: "AUTOMATICO",
      coresDasImagens: {},
      ajustesDasFotos: {},
    });

    const vitrine = await http.get(`/v1/vitrine/${pastelaria.apelido}`);
    expect(vitrine.status).toBe(200);
    expect(vitrine.body.loja.tema).toEqual(gravado.body);

    const noFeed = await http.get("/v1/feed/lojas?tipo=FOOD_SNACK");
    expect(noFeed.body.lojas[0].corDestaque).toBe("#b7ff00");

    const trilha = await migrador.query(
      `SELECT action FROM app.audit_log WHERE store_id = $1 AND action = 'TEMA_ALTERADO'`,
      [pastelaria.id],
    );
    expect(trilha.rows).toHaveLength(1);
  });
});
