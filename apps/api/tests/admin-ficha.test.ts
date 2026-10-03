/**
 * Ficha da loja e edição do cadastro, pela API de verdade (AC-207, AC-118).
 *
 * A diferença entre antes e depois tem prova de unidade. O que só esta prova
 * mostra é a costura com o banco: a credencial `sc_admin`, a gravação e a
 * linha da trilha na MESMA transação, o nome de quem alterou lido da
 * identidade, o dado pessoal mascarado no que ficou gravado — e que a
 * abertura da ficha também deixa rastro (AC-118).
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
let lojaId: string;

const CADASTRO: NovaLojaEnviada = {
  nome: "Pastel da Joi",
  razaoSocial: "Joice Almeida Pastelaria ME",
  documento: "11.222.333/0001-81",
  responsavel: {
    nome: "Joice Almeida",
    email: "joice.almeida@exemplo.test",
    telefone: "(11) 98888-7777",
  },
  endereco: {
    cep: "01310-100",
    logradouro: "Avenida Paulista",
    numero: "1000",
    complemento: "Loja 2",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP",
  },
  tipoDeNegocio: "FOOD_SNACK",
  apelido: "pastel-da-joi",
};

function ficha() {
  return request(api.app)
    .get(`/v1/admin/lojas/${lojaId}`)
    .set(comoPapel(administradora.id, "ADMIN"));
}

function editar(corpo: unknown) {
  return request(api.app)
    .patch(`/v1/admin/lojas/${lojaId}`)
    .set(comoPapel(administradora.id, "ADMIN"))
    .send(corpo as object);
}

/**
 * O dono que o cadastro convidou, com o convite aceito. Desde a 0041 (dívida
 * 92) só membro ATIVO age pela loja, e a loja cadastrada pela administração
 * nasce com o dono só convidado — aceitar é o que o dono faria ao entrar.
 */
async function donoQueAceitouOConvite(): Promise<string> {
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

async function linhasDaTrilha(acao: string) {
  const { rows } = await migrador.query<{
    actor_id: string | null;
    actor_role: string;
    entity: string;
    entity_id: string | null;
    before_data: unknown;
    after_data: unknown;
    created_at: Date;
  }>(
    `SELECT actor_id::text AS actor_id, actor_role, entity, entity_id,
            before_data, after_data, created_at
       FROM app.audit_log
      WHERE store_id = $1 AND action = $2
      ORDER BY id`,
    [lojaId, acao],
  );
  return rows;
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao();
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });
  const criada = await request(api.app)
    .post("/v1/admin/lojas")
    .set(comoPapel(administradora.id, "ADMIN"))
    .send(CADASTRO);
  if (criada.status !== 201) {
    throw new Error(`cadastro falhou: ${JSON.stringify(criada.body)}`);
  }
  lojaId = String(criada.body.id);
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("a ficha da loja (AC-207, AC-118)", () => {
  it(
    "@spec:AC-207 a ficha mostra o cadastro inteiro que só a administração vê, e o cadastro já aparece no histórico",
    async () => {
      const resposta = await ficha();

      expect(resposta.status).toBe(200);
      const lida = esquemaDaFichaDaLoja.parse(resposta.body);
      expect(lida).toMatchObject({
        id: lojaId,
        nome: "Pastel da Joi",
        razaoSocial: "Joice Almeida Pastelaria ME",
        documento: { numero: "11222333000181", tipo: "CNPJ" },
        apelido: "pastel-da-joi",
        status: "ACTIVE",
        tipoDeNegocio: {
          codigo: "FOOD_SNACK",
          nome: "Lanchonete",
          controlaEstoque: false,
        },
        contato: {
          email: "joice.almeida@exemplo.test",
          telefone: "+5511988887777",
        },
        endereco: { cep: "01310100", numero: "1000", uf: "SP" },
      });
      expect(lida.codigo).toMatch(/^\d{4}$/);
      expect(lida.historico.map((registro) => registro.acao)).toEqual([
        "LOJA_CRIADA",
      ]);
      expect(lida.historico[0]?.quem).toEqual({
        id: administradora.id,
        nome: "Administradora geral",
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-118 cada abertura da ficha fica na trilha com quem abriu, o que abriu e quando",
    async () => {
      const antes = await linhasDaTrilha("ADMIN_ACCESS");
      const inicio = new Date(Date.now() - 1_000);

      expect((await ficha()).status).toBe(200);

      const depois = await linhasDaTrilha("ADMIN_ACCESS");
      expect(depois).toHaveLength(antes.length + 1);
      const ultima = depois.at(-1);
      expect(ultima).toMatchObject({
        actor_id: administradora.id,
        actor_role: "ADMIN",
        entity: "stores",
        entity_id: lojaId,
      });
      expect(ultima?.created_at.getTime()).toBeGreaterThanOrEqual(
        inicio.getTime(),
      );
      // A consulta registra O QUE foi aberto, nunca o dado que apareceu.
      expect(JSON.stringify(ultima)).not.toContain("11222333000181");
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("editar o cadastro (AC-207)", () => {
  it(
    "@spec:AC-207 salvar mostra os dados novos na ficha e registra quem alterou, quando e quais campos mudaram, com o valor anterior",
    async () => {
      const inicio = new Date(Date.now() - 1_000);
      const resposta = await editar({
        nome: "Pastelaria da Joi",
        telefone: "(11) 97777-6666",
        endereco: {
          cep: "01310-100",
          logradouro: "Avenida Paulista",
          numero: "1200",
          complemento: null,
          bairro: "Bela Vista",
          cidade: "São Paulo",
          uf: "SP",
        },
      });

      expect(resposta.status).toBe(200);
      const lida = esquemaDaFichaDaLoja.parse(resposta.body);
      expect(lida.nome).toBe("Pastelaria da Joi");
      expect(lida.contato.telefone).toBe("+5511977776666");
      expect(lida.endereco).toMatchObject({
        numero: "1200",
        complemento: null,
      });

      // A ficha devolvida já traz a alteração no topo do histórico.
      const [ultima] = lida.historico;
      expect(ultima?.acao).toBe("LOJA_ALTERADA");
      expect(ultima?.quem?.nome).toBe("Administradora geral");
      // A ordem das chaves é a do `jsonb`, que não guarda a de gravação: a
      // prova confere o conjunto, e não a sequência.
      expect(ultima?.campos).toHaveLength(4);
      expect(ultima?.campos).toEqual(
        expect.arrayContaining([
          {
            campo: "nome",
            antes: "Pastel da Joi",
            depois: "Pastelaria da Joi",
          },
          { campo: "telefone", antes: "…7777", depois: "…6666" },
          { campo: "numero", antes: "…", depois: "…" },
          { campo: "complemento", antes: "…ja 2", depois: null },
        ]),
      );
      expect(Date.parse(ultima?.quando ?? "")).toBeGreaterThanOrEqual(
        inicio.getTime(),
      );

      // No banco, a linha é da administração, e sem o telefone por extenso.
      const [gravada] = await linhasDaTrilha("LOJA_ALTERADA");
      expect(gravada).toMatchObject({
        actor_id: administradora.id,
        actor_role: "ADMIN",
        entity: "stores",
        entity_id: lojaId,
      });
      expect(JSON.stringify(gravada)).not.toContain("977776666");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-207 salvar sem mudar nada não cria linha nova na trilha",
    async () => {
      const antes = await linhasDaTrilha("LOJA_ALTERADA");
      const resposta = await editar({ nome: "Pastelaria da Joi" });
      expect(resposta.status).toBe(200);
      expect(await linhasDaTrilha("LOJA_ALTERADA")).toHaveLength(antes.length);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-207 documento inválido é recusado na borda e nada muda, nem na loja nem na trilha",
    async () => {
      const antes = await linhasDaTrilha("LOJA_ALTERADA");
      const resposta = await editar({ documento: "111.222.333-44" });

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toBe("entrada_invalida");
      const { rows } = await migrador.query<{ doc_number: string }>(
        "SELECT doc_number FROM app.stores WHERE id = $1",
        [lojaId],
      );
      expect(rows[0]?.doc_number).toBe("11222333000181");
      expect(await linhasDaTrilha("LOJA_ALTERADA")).toHaveLength(antes.length);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-207 o dono da loja não abre a ficha nem edita o cadastro, e loja inexistente responde não encontrada",
    async () => {
      const comoDono = comoPapel(await donoQueAceitouOConvite(), "OWNER");

      const leitura = await request(api.app)
        .get(`/v1/admin/lojas/${lojaId}`)
        .set(comoDono);
      expect(leitura.status).toBe(403);

      const edicao = await request(api.app)
        .patch(`/v1/admin/lojas/${lojaId}`)
        .set(comoDono)
        .send({ nome: "Sequestrada" });
      expect(edicao.status).toBe(403);

      const inexistente = await request(api.app)
        .get("/v1/admin/lojas/00000000-0000-4000-8000-000000000000")
        .set(comoPapel(administradora.id, "ADMIN"));
      expect(inexistente.status).toBe(404);

      const { rows } = await migrador.query<{ name: string }>(
        "SELECT name FROM app.stores WHERE id = $1",
        [lojaId],
      );
      expect(rows[0]?.name).toBe("Pastelaria da Joi");
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
