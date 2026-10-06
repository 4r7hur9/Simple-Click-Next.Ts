/**
 * Alterar o apelido preserva o endereço antigo, pela API de verdade (AC-208).
 *
 * A administração troca `pastel-da-joi` por `pastelaria-joi`. O que se prova
 * contra o banco: o endereço novo funciona, o antigo fica guardado como
 * endereço da loja e a rota `endereco-atual` diz para onde ele leva (é por
 * ela que o site redireciona o link antigo — provado em
 * `apps/web/tests/apelido-antigo.test.ts`), o antigo não pode ser entregue a
 * outra loja, a volta ao antigo é permitida, e loja fora do ar não
 * redireciona (AC-402: não contar que ela existe).
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaFichaDaLoja,
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
let joi: string;
let central: string;

function cadastro(nome: string, apelido: string, documento: string) {
  const loja: NovaLojaEnviada = {
    nome,
    razaoSocial: null,
    documento,
    responsavel: {
      nome: `Responsável por ${nome}`,
      email: `${apelido}@exemplo.test`,
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
    tipoDeNegocio: "FOOD_SNACK",
    apelido,
  };
  return request(api.app)
    .post("/v1/admin/lojas")
    .set(comoPapel(administradora.id, "ADMIN"))
    .send(loja);
}

function trocarApelido(lojaId: string, apelido: string) {
  return request(api.app)
    .put(`/v1/admin/lojas/${lojaId}/apelido`)
    .set(comoPapel(administradora.id, "ADMIN"))
    .send({ apelido });
}

function enderecoAtual(apelido: string) {
  return request(api.app).get(`/v1/vitrine/${apelido}/endereco-atual`);
}

/**
 * O dono que o cadastro convidou, com o convite aceito. Desde a 0041 (dívida
 * 92) só membro ATIVO age pela loja, e a loja cadastrada pela administração
 * nasce com o dono só convidado — aceitar é o que o dono faria ao entrar.
 */
async function donoQueAceitouOConvite(lojaId: string): Promise<string> {
  const { rows } = await migrador.query<{ identity_id: string }>(
    `UPDATE app.store_members SET invite_accepted_at = now()
      WHERE store_id = $1 AND role = 'OWNER' AND revoked_at IS NULL
      RETURNING identity_id::text AS identity_id`,
    [lojaId],
  );
  const donoId = rows[0]?.identity_id;
  if (donoId === undefined)
    throw new Error(`loja ${lojaId} sem dono convidado`);
  return donoId;
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao();
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });
  const primeira = await cadastro(
    "Pastel da Joi",
    "pastel-da-joi",
    "11.222.333/0001-81",
  );
  const segunda = await cadastro(
    "Pastelaria Central",
    "pastelaria-central",
    "529.982.247-25",
  );
  if (primeira.status !== 201 || segunda.status !== 201) {
    throw new Error("não consegui cadastrar as duas lojas da prova");
  }
  joi = String(primeira.body.id);
  central = String(segunda.body.id);
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("alterar o apelido preserva o endereço antigo (AC-208)", () => {
  it(
    "@spec:AC-208 o endereço novo funciona, o antigo leva a ele e a troca fica no histórico",
    async () => {
      const resposta = await trocarApelido(joi, "pastelaria-joi");

      expect(resposta.status).toBe(200);
      const ficha = esquemaDaFichaDaLoja.parse(resposta.body);
      expect(ficha.apelido).toBe("pastelaria-joi");
      expect(ficha.historico[0]).toMatchObject({
        acao: "APELIDO_ALTERADO",
        quem: { id: administradora.id, nome: "Administradora geral" },
        campos: [
          {
            campo: "apelido",
            antes: "pastel-da-joi",
            depois: "pastelaria-joi",
          },
        ],
      });

      // O endereço novo abre a loja.
      const novo = await request(api.app).get("/v1/vitrine/pastelaria-joi");
      expect(novo.status).toBe(200);
      expect(novo.body.loja.nome).toBe("Pastel da Joi");

      // O antigo diz para onde levar — é o que o site usa para redirecionar.
      const antigo = await enderecoAtual("pastel-da-joi");
      expect(antigo.status).toBe(200);
      expect(antigo.body).toEqual({ apelido: "pastelaria-joi" });

      const { rows } = await migrador.query(
        `SELECT host, kind, redirect_to_canonical FROM app.store_domains
          WHERE store_id = $1`,
        [joi],
      );
      expect(rows).toEqual([
        {
          host: "pastel-da-joi",
          kind: "LEGACY_SLUG",
          redirect_to_canonical: true,
        },
      ]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-208 o apelido antigo continua ocupado: outra loja não o recebe, nem na troca nem no cadastro",
    async () => {
      const naTroca = await trocarApelido(central, "pastel-da-joi");
      expect(naTroca.status).toBe(409);
      expect(naTroca.body.erro).toBe("apelido_em_uso");
      expect(naTroca.body.sugestao).toBe("pastel-da-joi-2");

      const oAtual = await trocarApelido(central, "pastelaria-joi");
      expect(oAtual.status).toBe(409);

      const noCadastro = await cadastro(
        "Outra Joi",
        "pastel-da-joi",
        "12.345.678/0001-95",
      );
      expect(noCadastro.status).toBe(409);

      // O link antigo continua levando à loja certa.
      expect((await enderecoAtual("pastel-da-joi")).body).toEqual({
        apelido: "pastelaria-joi",
      });
      const { rows } = await migrador.query<{ slug: string }>(
        "SELECT slug FROM app.stores WHERE id = $1",
        [central],
      );
      expect(rows[0]?.slug).toBe("pastelaria-central");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-208 a loja pode voltar ao apelido antigo, e o que era atual passa a levar a ele",
    async () => {
      const volta = await trocarApelido(joi, "pastel-da-joi");
      expect(volta.status).toBe(200);
      expect(volta.body.apelido).toBe("pastel-da-joi");

      expect((await enderecoAtual("pastelaria-joi")).body).toEqual({
        apelido: "pastel-da-joi",
      });
      expect((await enderecoAtual("pastel-da-joi")).status).toBe(404);
      const vitrine = await request(api.app).get("/v1/vitrine/pastel-da-joi");
      expect(vitrine.status).toBe(200);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-208 loja fora do ar não redireciona, apelido qualquer não é antigo de ninguém, e o dono não troca o apelido",
    async () => {
      await migrador.query(
        "UPDATE app.stores SET status = 'SUSPENDED' WHERE id = $1",
        [joi],
      );
      try {
        // Dizer para onde a loja suspensa foi contaria que ela existe.
        expect((await enderecoAtual("pastelaria-joi")).status).toBe(404);
      } finally {
        await migrador.query(
          "UPDATE app.stores SET status = 'ACTIVE' WHERE id = $1",
          [joi],
        );
      }
      expect((await enderecoAtual("nunca-existiu")).status).toBe(404);

      const donoId = await donoQueAceitouOConvite(joi);
      const peloDono = await request(api.app)
        .put(`/v1/admin/lojas/${joi}/apelido`)
        .set(comoPapel(donoId, "OWNER"))
        .send({ apelido: "roubada" });
      expect(peloDono.status).toBe(403);

      const foraDoFormato = await trocarApelido(joi, "Com Espaço");
      expect(foraDoFormato.status).toBe(400);
      const reservado = await trocarApelido(joi, "admin");
      expect(reservado.status).toBe(400);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
