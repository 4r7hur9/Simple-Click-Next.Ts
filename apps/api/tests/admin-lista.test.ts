/**
 * Lista e busca de lojas pela API de verdade (AC-206).
 *
 * As lojas entram pelo MESMO cadastro da administração (T-200), e não por
 * inserção direta: assim a lista prova o que a administração vai encontrar
 * depois de cadastrar — código sequencial, documento sem máscara, ramo. O que
 * a tela não deveria ver (documento, e-mail do responsável) é conferido pelo
 * esquema estrito do contrato e por busca no corpo inteiro.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaListaDeLojas,
  type NovaLojaEnviada,
} from "@simpleclick/contracts";
import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarIdentidade,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  ORIGEM_DA_ADMINISTRACAO,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";

let migrador: pg.Client;
let api: ApiDaAdministracao;
let administradora: IdentidadeDeTeste;

interface LojaDoCenario {
  readonly nome: string;
  readonly documento: string;
  readonly apelido: string;
  readonly tipoDeNegocio: string;
}

/** Quatro lojas com nomes, documentos e ramos distintos, para a busca ter o que separar. */
const CENARIO: readonly LojaDoCenario[] = [
  {
    nome: "Pastel da Joi",
    documento: "11.222.333/0001-81",
    apelido: "pastel-da-joi",
    tipoDeNegocio: "FOOD_SNACK",
  },
  {
    nome: "Açaí do Zé",
    documento: "529.982.247-25",
    apelido: "acai-do-ze",
    tipoDeNegocio: "FOOD_ACAI",
  },
  {
    nome: "Moda Boa Vista",
    documento: "12.345.678/0001-95",
    apelido: "moda-boa-vista",
    tipoDeNegocio: "APPAREL",
  },
  {
    nome: "Loja Apagada",
    documento: "04.252.011/0001-10",
    apelido: "loja-apagada",
    tipoDeNegocio: "RETAIL_GENERIC",
  },
];

function cadastro(loja: LojaDoCenario): NovaLojaEnviada {
  return {
    nome: loja.nome,
    razaoSocial: null,
    documento: loja.documento,
    responsavel: {
      nome: `Responsável por ${loja.nome}`,
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
    tipoDeNegocio: loja.tipoDeNegocio,
    apelido: loja.apelido,
  };
}

function listar(consulta: Record<string, string> = {}) {
  return request(api.app)
    .get("/v1/admin/lojas")
    .query(consulta)
    .set(comoPapel(administradora.id, "ADMIN"));
}

/** A lista lida pelo esquema ESTRITO do contrato: campo a mais reprova. */
function lida(corpo: unknown) {
  return esquemaDaListaDeLojas.parse(corpo);
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
      .set(comoPapel(administradora.id, "ADMIN"))
      .send(cadastro(loja));
    if (resposta.status !== 201) {
      throw new Error(
        `não consegui cadastrar ${loja.nome}: ${JSON.stringify(resposta.body)}`,
      );
    }
  }

  // A suspensa continua na lista; a excluída sai dela e fica em retenção
  // (AC-211). As duas situações entram direto no banco: o que se prova aqui é
  // a LISTA, e a mudança de situação tem prova própria (T-206).
  await migrador.query(
    `UPDATE app.stores SET status = 'INACTIVE' WHERE slug = 'moda-boa-vista'`,
  );
  await migrador.query(
    `UPDATE app.stores
        SET status = 'DELETED', deleted_at = now(), purge_after = now() + interval '30 days'
      WHERE slug = 'loja-apagada'`,
  );
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("a lista de lojas (AC-206)", () => {
  it(
    "@spec:AC-206 mostra código, nome, tipo de negócio, situação e data de cadastro, da mais nova para a mais antiga, sem a excluída e sem dado pessoal",
    async () => {
      const resposta = await listar();

      expect(resposta.status).toBe(200);
      const lista = lida(resposta.body);
      expect(lista.total).toBe(3);
      expect(lista.lojas.map((loja) => loja.codigo)).toEqual([
        "0003",
        "0002",
        "0001",
      ]);
      expect(lista.lojas[0]).toMatchObject({
        codigo: "0003",
        nome: "Moda Boa Vista",
        apelido: "moda-boa-vista",
        tipoDeNegocio: { codigo: "APPAREL", nome: "Roupas" },
        status: "INACTIVE",
        cidade: "São Paulo",
        uf: "SP",
      });
      expect(Number.isNaN(Date.parse(lista.lojas[0]?.criadaEm ?? ""))).toBe(
        false,
      );

      // Documento e e-mail do responsável não saem na lista (P-009).
      const corpo = JSON.stringify(resposta.body);
      expect(corpo).not.toContain("11222333000181");
      expect(corpo).not.toContain("exemplo.test");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-206 busca por parte do nome sem acento nem maiúscula, por documento com ou sem máscara e por código",
    async () => {
      const porNome = lida((await listar({ busca: "ACAI" })).body);
      expect(porNome.lojas.map((loja) => loja.nome)).toEqual(["Açaí do Zé"]);

      const porTrecho = lida((await listar({ busca: "joi" })).body);
      expect(porTrecho.lojas.map((loja) => loja.nome)).toEqual([
        "Pastel da Joi",
      ]);

      const porDocumentoComMascara = lida(
        (await listar({ busca: "11.222.333/0001-81" })).body,
      );
      expect(porDocumentoComMascara.lojas.map((loja) => loja.nome)).toEqual([
        "Pastel da Joi",
      ]);

      const porDocumentoParcial = lida(
        (await listar({ busca: "529982" })).body,
      );
      expect(porDocumentoParcial.lojas.map((loja) => loja.nome)).toEqual([
        "Açaí do Zé",
      ]);

      const porCodigo = lida((await listar({ busca: "0002" })).body);
      expect(porCodigo.lojas.map((loja) => loja.codigo)).toEqual(["0002"]);

      const nenhuma = lida((await listar({ busca: "nada-a-ver" })).body);
      expect(nenhuma.lojas).toEqual([]);
      expect(nenhuma.total).toBe(0);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-206 o filtro de situação mostra as suspensas e, só quando pedido, as excluídas em retenção",
    async () => {
      const suspensas = lida((await listar({ situacao: "INACTIVE" })).body);
      expect(suspensas.lojas.map((loja) => loja.nome)).toEqual([
        "Moda Boa Vista",
      ]);

      const excluidas = lida((await listar({ situacao: "DELETED" })).body);
      expect(excluidas.lojas.map((loja) => loja.nome)).toEqual([
        "Loja Apagada",
      ]);
      expect(excluidas.lojas[0]?.status).toBe("DELETED");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-206 a lista é paginada e diz o total, para a tela saber quantas páginas existem",
    async () => {
      const primeira = lida(
        (await listar({ porPagina: "2", pagina: "1" })).body,
      );
      expect(primeira.lojas.map((loja) => loja.codigo)).toEqual([
        "0003",
        "0002",
      ]);
      expect(primeira).toMatchObject({ total: 3, pagina: 1, porPagina: 2 });

      const segunda = lida(
        (await listar({ porPagina: "2", pagina: "2" })).body,
      );
      expect(segunda.lojas.map((loja) => loja.codigo)).toEqual(["0001"]);
      expect(segunda.total).toBe(3);

      // Uma página além da última fica vazia, mas o total filtrado continua
      // conhecido; a tela ainda precisa saber que há duas páginas válidas.
      const alemDaUltima = lida(
        (await listar({ porPagina: "2", pagina: "3" })).body,
      );
      expect(alemDaUltima.lojas).toEqual([]);
      expect(alemDaUltima.total).toBe(3);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-206 consulta fora do formato é recusada na borda, e quem não é da administração não vê a lista",
    async () => {
      const foraDoFormato = await listar({ pagina: "0" });
      expect(foraDoFormato.status).toBe(400);
      expect(foraDoFormato.body.erro).toBe("entrada_invalida");

      const semSessao = await request(api.app)
        .get("/v1/admin/lojas")
        .set("origin", ORIGEM_DA_ADMINISTRACAO);
      expect(semSessao.status).toBe(401);

      const dona = await criarIdentidade({ nome: "Dona de loja" });
      const comoDona = await request(api.app)
        .get("/v1/admin/lojas")
        .set(comoPapel(dona.id, "OWNER"));
      expect(comoDona.status).toBe(403);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
