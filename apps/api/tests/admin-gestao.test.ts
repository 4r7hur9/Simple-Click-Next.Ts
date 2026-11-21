/**
 * Gestão de lojas pela API de verdade (card #29): a lista com dono, pedidos e
 * faturamento, o filtro por tipo, a ordenação e as contagens por situação; os
 * números e a equipe de cada loja. As contas viraram as Pessoas (card #170,
 * `admin-pessoas.test.ts`); o `/v1/admin/contas` antigo saiu.
 *
 * As lojas entram pelo MESMO cadastro da administração (T-200). Os pedidos
 * entram direto no banco: o que se prova aqui é como a administração os conta,
 * e não como nascem.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaEquipeDaLojaNaAdministracao,
  esquemaDaListaDeLojas,
  esquemaDasMetricasDaLoja,
  type NovaLojaEnviada,
} from "@simpleclick/contracts";
import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";

let migrador: pg.Client;
let api: ApiDaAdministracao;
let administradora: IdentidadeDeTeste;
const ids = new Map<string, string>();

const CENARIO = [
  {
    nome: "Pastel da Joi",
    doc: "11.222.333/0001-81",
    apelido: "gestao-pastel",
    tipo: "FOOD_SNACK",
  },
  {
    nome: "Moda Boa Vista",
    doc: "12.345.678/0001-95",
    apelido: "gestao-moda",
    tipo: "APPAREL",
  },
  {
    nome: "Brechó da Lu",
    doc: "529.982.247-25",
    apelido: "gestao-brecho",
    tipo: "APPAREL",
  },
] as const;

function cadastro(loja: (typeof CENARIO)[number]): NovaLojaEnviada {
  return {
    nome: loja.nome,
    razaoSocial: null,
    documento: loja.doc,
    responsavel: {
      nome: `Dono de ${loja.nome}`,
      email: `${loja.apelido}@exemplo.test`,
      telefone: "(11) 98888-7777",
    },
    endereco: {
      cep: "01310-100",
      logradouro: "Avenida Paulista",
      numero: "1000",
      complemento: null,
      bairro: "Bela Vista",
      cidade: "São Paulo",
      uf: "SP",
    },
    tipoDeNegocio: loja.tipo,
    apelido: loja.apelido,
  };
}

const comoAdmin = () => comoPapel(administradora.id, "ADMIN");

/** Um pedido direto no banco: `status` e `total` são o que a conta olha. */
async function pedido(dados: {
  readonly lojaId: string;
  readonly status: string;
  readonly totalCentavos: number;
  readonly diasAtras: number;
  readonly numero: number;
}) {
  const { lojaId, status, totalCentavos, diasAtras, numero } = dados;
  await migrador.query(
    `INSERT INTO app.orders
       (store_id, number, code, public_token, status, channel, total_cents,
        subtotal_cents, placed_at)
     VALUES ($1, $2, $3, $4, $5, 'ONLINE', $6, $6,
             now() - ($7 || ' days')::interval)`,
    [
      lojaId,
      numero,
      `G${numero}`,
      `token-de-teste-${lojaId}-${numero}`,
      status,
      totalCentavos,
      String(diasAtras),
    ],
  );
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao();
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });
  for (const loja of CENARIO) {
    const resposta = await request(api.app)
      .post("/v1/admin/lojas")
      .set(comoAdmin())
      .send(cadastro(loja));
    if (resposta.status !== 201) {
      throw new Error(`cadastro falhou: ${JSON.stringify(resposta.body)}`);
    }
    ids.set(loja.apelido, (resposta.body as { id: string }).id);
  }
  await migrador.query(
    `UPDATE app.stores SET status = 'ACTIVE' WHERE slug = ANY($1)`,
    [["gestao-pastel", "gestao-moda"]],
  );
  const pastel = ids.get("gestao-pastel") ?? "";
  // Duas vendas (uma recente, uma antiga), um cancelado e um ainda aguardando.
  await pedido({
    lojaId: pastel,
    status: "COMPLETED",
    totalCentavos: 5000,
    diasAtras: 2,
    numero: 1,
  });
  await pedido({
    lojaId: pastel,
    status: "COMPLETED",
    totalCentavos: 3000,
    diasAtras: 60,
    numero: 2,
  });
  await pedido({
    lojaId: pastel,
    status: "CANCELLED",
    totalCentavos: 9900,
    diasAtras: 1,
    numero: 3,
  });
  await pedido({
    lojaId: pastel,
    status: "PENDING",
    totalCentavos: 1200,
    diasAtras: 0,
    numero: 4,
  });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("a lista de lojas com dono, pedidos e faturamento (card #29)", () => {
  it(
    "cada loja traz o dono (só o nome), os pedidos sem os cancelados e o faturamento só das vendas",
    async () => {
      const resposta = await request(api.app)
        .get("/v1/admin/lojas")
        .set(comoAdmin());
      expect(resposta.status).toBe(200);
      const lista = esquemaDaListaDeLojas.parse(resposta.body);
      const pastel = lista.lojas.find(
        (loja) => loja.apelido === "gestao-pastel",
      );
      expect(pastel).toMatchObject({
        dono: { nome: "Dono de Pastel da Joi" },
        pedidos: 3,
        faturamentoCentavos: 8000,
      });
      expect(JSON.stringify(resposta.body)).not.toContain("exemplo.test");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "filtra por tipo de negócio, ordena por faturamento e conta as lojas por situação",
    async () => {
      const porTipo = esquemaDaListaDeLojas.parse(
        (
          await request(api.app)
            .get("/v1/admin/lojas")
            .query({ tipo: "APPAREL", ordem: "nome" })
            .set(comoAdmin())
        ).body,
      );
      expect(porTipo.lojas.map((loja) => loja.nome)).toEqual([
        "Brechó da Lu",
        "Moda Boa Vista",
      ]);
      // As contagens respeitam o tipo, mas não o filtro de situação.
      expect(porTipo.contagens).toMatchObject({
        todas: 2,
        ACTIVE: 1,
        PENDING_APPROVAL: 1,
      });

      const porFaturamento = esquemaDaListaDeLojas.parse(
        (
          await request(api.app)
            .get("/v1/admin/lojas")
            .query({ ordem: "faturamento" })
            .set(comoAdmin())
        ).body,
      );
      expect(porFaturamento.lojas[0]?.apelido).toBe("gestao-pastel");

      const pendentes = esquemaDaListaDeLojas.parse(
        (
          await request(api.app)
            .get("/v1/admin/lojas")
            .query({ situacao: "PENDING_APPROVAL" })
            .set(comoAdmin())
        ).body,
      );
      expect(pendentes.lojas.map((loja) => loja.apelido)).toEqual([
        "gestao-brecho",
      ]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "a busca também acha a loja pelo nome ou e-mail do dono",
    async () => {
      const porEmail = esquemaDaListaDeLojas.parse(
        (
          await request(api.app)
            .get("/v1/admin/lojas")
            .query({ busca: "gestao-moda@exemplo" })
            .set(comoAdmin())
        ).body,
      );
      expect(porEmail.lojas.map((loja) => loja.apelido)).toEqual([
        "gestao-moda",
      ]);
      const porNome = esquemaDaListaDeLojas.parse(
        (
          await request(api.app)
            .get("/v1/admin/lojas")
            .query({ busca: "dono de brecho" })
            .set(comoAdmin())
        ).body,
      );
      expect(porNome.lojas.map((loja) => loja.apelido)).toEqual([
        "gestao-brecho",
      ]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("os números e a equipe de uma loja (card #29)", () => {
  it(
    "faturamento total e do período, pedidos, ticket médio e último pedido",
    async () => {
      const pastel = ids.get("gestao-pastel") ?? "";
      const resposta = await request(api.app)
        .get(`/v1/admin/lojas/${pastel}/metricas`)
        .query({ dias: "30" })
        .set(comoAdmin());
      expect(resposta.status).toBe(200);
      const numeros = esquemaDasMetricasDaLoja.parse(resposta.body);
      expect(numeros.faturamento).toEqual({
        totalCentavos: 8000,
        periodoCentavos: 5000,
      });
      expect(numeros.pedidos).toEqual({ total: 3, periodo: 2 });
      expect(numeros.vendas).toEqual({ total: 2, periodo: 1 });
      expect(numeros.ticketMedioCentavos).toBe(4000);
      expect(numeros.ultimoPedidoEm).not.toBeNull();
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "loja sem pedido tem ticket médio nulo, período inválido é recusado e loja inexistente é 404",
    async () => {
      const brecho = ids.get("gestao-brecho") ?? "";
      const vazia = esquemaDasMetricasDaLoja.parse(
        (
          await request(api.app)
            .get(`/v1/admin/lojas/${brecho}/metricas`)
            .set(comoAdmin())
        ).body,
      );
      expect(vazia.ticketMedioCentavos).toBeNull();
      expect(vazia.ultimoPedidoEm).toBeNull();
      expect(vazia.dias).toBe(30);

      const invalido = await request(api.app)
        .get(`/v1/admin/lojas/${brecho}/metricas`)
        .query({ dias: "13" })
        .set(comoAdmin());
      expect(invalido.status).toBe(400);

      const inexistente = await request(api.app)
        .get("/v1/admin/lojas/00000000-0000-4000-8000-000000000000/metricas")
        .set(comoAdmin());
      expect(inexistente.status).toBe(404);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "a equipe lista o dono da loja, e quem não é administrador não alcança nada disso",
    async () => {
      const moda = ids.get("gestao-moda") ?? "";
      const equipe = esquemaDaEquipeDaLojaNaAdministracao.parse(
        (
          await request(api.app)
            .get(`/v1/admin/lojas/${moda}/equipe`)
            .set(comoAdmin())
        ).body,
      );
      expect(equipe.membros).toHaveLength(1);
      expect(equipe.membros[0]).toMatchObject({
        papel: "OWNER",
        ativo: true,
        email: "gestao-moda@exemplo.test",
      });

      const comoDono = await request(api.app)
        .get(`/v1/admin/lojas/${moda}/metricas`)
        .set(comoPapel(administradora.id, "OWNER"));
      expect(comoDono.status).toBe(403);
      const semSessao = await request(api.app).get("/v1/admin/pessoas");
      expect(semSessao.status).toBe(401);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("o /contas antigo saiu (card #170)", () => {
  it(
    "as duas rotas antigas não existem mais, nem para a administração",
    async () => {
      const lista = await request(api.app)
        .get("/v1/admin/contas")
        .set(comoAdmin());
      expect(lista.status).toBe(404);
      const conta = await request(api.app)
        .get("/v1/admin/contas/00000000-0000-4000-8000-000000000000")
        .set(comoAdmin());
      expect(conta.status).toBe(404);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
