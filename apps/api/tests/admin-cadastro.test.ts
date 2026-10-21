/**
 * Cadastro de loja pela administração, pela API de verdade (AC-200..AC-202).
 *
 * O caso de uso já tem prova de unidade. O que só esta prova mostra é a
 * costura com o banco: a credencial `sc_admin`, o código sequencial saindo da
 * função com trava, o vínculo do dono com o RESUMO do convite, a linha na
 * trilha — e que a recusa acontece antes de qualquer gravação.
 */
import { createHash } from "node:crypto";

import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MENSAGEM_DE_APELIDO_EM_USO,
  MENSAGEM_DE_DOCUMENTO_INVALIDO,
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

function cadastro(sobrescrita: Partial<NovaLojaEnviada> = {}): NovaLojaEnviada {
  return {
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
    ...sobrescrita,
  };
}

async function totalDeLojas(): Promise<number> {
  const { rows } = await migrador.query<{ total: number }>(
    "SELECT count(*)::int AS total FROM app.stores",
  );
  return rows[0]?.total ?? 0;
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao();
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("cadastro completo (AC-200)", () => {
  it(
    "@spec:AC-200 cria a loja com código sequencial de quatro dígitos, o dono convidado e o convite enviado ao e-mail do responsável",
    async () => {
      const resposta = await request(api.app)
        .post("/v1/admin/lojas")
        .set(comoPapel(administradora.id, "ADMIN"))
        .send(cadastro());

      expect(resposta.status).toBe(201);
      expect(resposta.body).toMatchObject({
        apelido: "pastel-da-joi",
        status: "PENDING_APPROVAL",
        conviteEnviado: true,
      });
      expect(resposta.body.codigo).toMatch(/^\d{4}$/);

      const lojaId = String(resposta.body.id);
      const { rows: lojas } = await migrador.query(
        `SELECT code, name, legal_name, doc_number, doc_type, slug, status,
                vertical_code, email, phone1, zip, uf, created_by::text
           FROM app.stores WHERE id = $1`,
        [lojaId],
      );
      expect(lojas[0]).toMatchObject({
        code: resposta.body.codigo,
        name: "Pastel da Joi",
        legal_name: "Joice Almeida Pastelaria ME",
        doc_number: "11222333000181",
        doc_type: "CNPJ",
        slug: "pastel-da-joi",
        status: "PENDING_APPROVAL",
        vertical_code: "FOOD_SNACK",
        email: "joice.almeida@exemplo.test",
        phone1: "+5511988887777",
        zip: "01310100",
        uf: "SP",
        created_by: administradora.id,
      });

      // O convite saiu para o responsável, com o token em claro…
      expect(api.convitesEnviados).toHaveLength(1);
      const convite = api.convitesEnviados[0];
      expect(convite?.para).toBe("joice.almeida@exemplo.test");
      expect(convite?.nomeDaLoja).toBe("Pastel da Joi");

      // …e o banco guarda só o resumo dele, no vínculo de dono ainda não aceito.
      const { rows: membros } = await migrador.query(
        `SELECT m.role, m.invite_token_hash, m.invite_accepted_at,
                i.email_norm, i.password_hash
           FROM app.store_members m
           JOIN app.identities i ON i.id = m.identity_id
          WHERE m.store_id = $1`,
        [lojaId],
      );
      expect(membros).toHaveLength(1);
      expect(membros[0]).toMatchObject({
        role: "OWNER",
        invite_token_hash: createHash("sha256")
          .update(convite?.token ?? "")
          .digest("hex"),
        invite_accepted_at: null,
        email_norm: "joice.almeida@exemplo.test",
        password_hash: null,
      });

      // A configuração da loja nasce junto, e a trilha registra quem criou.
      const { rows: configuracao } = await migrador.query(
        "SELECT 1 FROM app.store_settings WHERE store_id = $1",
        [lojaId],
      );
      expect(configuracao).toHaveLength(1);
      const { rows: trilha } = await migrador.query(
        `SELECT actor_id::text, actor_role, action, after_data
           FROM app.audit_log WHERE store_id = $1`,
        [lojaId],
      );
      expect(trilha).toEqual([
        {
          actor_id: administradora.id,
          actor_role: "ADMIN",
          action: "LOJA_CRIADA",
          after_data: {
            codigo: resposta.body.codigo,
            apelido: "pastel-da-joi",
            tipoDeNegocio: "FOOD_SNACK",
            status: "PENDING_APPROVAL",
          },
        },
      ]);
      // Nada do responsável na trilha: documento, e-mail e telefone (P-009).
      expect(JSON.stringify(trilha)).not.toContain("11222333000181");
      expect(JSON.stringify(trilha)).not.toContain("joice.almeida");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-200 o código segue a sequência: a próxima loja recebe o número seguinte",
    async () => {
      const primeira = await request(api.app)
        .post("/v1/admin/lojas")
        .set(comoPapel(administradora.id, "ADMIN"))
        .send(
          cadastro({
            apelido: "loja-sequencia-um",
            responsavel: {
              nome: "Um",
              email: "um@exemplo.test",
              telefone: "11911110001",
            },
          }),
        );
      const segunda = await request(api.app)
        .post("/v1/admin/lojas")
        .set(comoPapel(administradora.id, "ADMIN"))
        .send(
          cadastro({
            apelido: "loja-sequencia-dois",
            responsavel: {
              nome: "Dois",
              email: "dois@exemplo.test",
              telefone: "11911110002",
            },
          }),
        );

      expect(primeira.status).toBe(201);
      expect(segunda.status).toBe(201);
      expect(Number(segunda.body.codigo)).toBe(
        Number(primeira.body.codigo) + 1,
      );
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-200 se o convite não sai, a loja continua criada e a resposta avisa para reenviar",
    async () => {
      api.falharProximoConvite();
      const resposta = await request(api.app)
        .post("/v1/admin/lojas")
        .set(comoPapel(administradora.id, "ADMIN"))
        .send(
          cadastro({
            apelido: "loja-sem-convite",
            responsavel: {
              nome: "Sem Convite",
              email: "sem.convite@exemplo.test",
              telefone: "11911110003",
            },
          }),
        );

      expect(resposta.status).toBe(201);
      expect(resposta.body.conviteEnviado).toBe(false);
      const { rows } = await migrador.query(
        "SELECT 1 FROM app.stores WHERE slug = 'loja-sem-convite'",
      );
      expect(rows).toHaveLength(1);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("apelido repetido (AC-201)", () => {
  it(
    "@spec:AC-201 o segundo cadastro com o mesmo apelido é recusado apontando o campo, com variação livre sugerida, e nenhuma loja é criada",
    async () => {
      const primeira = await request(api.app)
        .post("/v1/admin/lojas")
        .set(comoPapel(administradora.id, "ADMIN"))
        .send(
          cadastro({
            apelido: "pastel-repetido",
            responsavel: {
              nome: "Primeira",
              email: "primeira@exemplo.test",
              telefone: "11922220001",
            },
          }),
        );
      expect(primeira.status).toBe(201);

      const antes = await totalDeLojas();
      const convitesAntes = api.convitesEnviados.length;
      const repetida = await request(api.app)
        .post("/v1/admin/lojas")
        .set(comoPapel(administradora.id, "ADMIN"))
        .send(
          cadastro({
            apelido: "Pastel-Repetido",
            responsavel: {
              nome: "Segunda",
              email: "segunda@exemplo.test",
              telefone: "11922220002",
            },
          }),
        );

      expect(repetida.status).toBe(409);
      expect(repetida.body).toEqual({
        erro: "apelido_em_uso",
        campos: [
          {
            onde: "body",
            caminho: "apelido",
            mensagem: MENSAGEM_DE_APELIDO_EM_USO,
          },
        ],
        sugestao: "pastel-repetido-2",
      });
      expect(await totalDeLojas()).toBe(antes);
      expect(api.convitesEnviados).toHaveLength(convitesAntes);

      // A sugestão é livre de verdade: cadastrar com ela passa.
      const comSugestao = await request(api.app)
        .post("/v1/admin/lojas")
        .set(comoPapel(administradora.id, "ADMIN"))
        .send(
          cadastro({
            apelido: repetida.body.sugestao,
            responsavel: {
              nome: "Segunda",
              email: "segunda@exemplo.test",
              telefone: "11922220002",
            },
          }),
        );
      expect(comSugestao.status).toBe(201);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("documento inválido (AC-202)", () => {
  it(
    "@spec:AC-202 CPF com dígito verificador errado é recusado explicando o motivo, antes de qualquer gravação",
    async () => {
      const antes = await totalDeLojas();
      const identidadesAntes = await migrador.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM app.identities",
      );

      const resposta = await request(api.app)
        .post("/v1/admin/lojas")
        .set(comoPapel(administradora.id, "ADMIN"))
        .send(
          cadastro({
            apelido: "loja-documento-errado",
            documento: "529.982.247-24",
            responsavel: {
              nome: "Documento Errado",
              email: "documento.errado@exemplo.test",
              telefone: "11933330001",
            },
          }),
        );

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toBe("entrada_invalida");
      expect(resposta.body.campos).toContainEqual({
        onde: "body",
        caminho: "documento",
        mensagem: MENSAGEM_DE_DOCUMENTO_INVALIDO,
      });
      expect(await totalDeLojas()).toBe(antes);
      const identidadesDepois = await migrador.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM app.identities",
      );
      expect(identidadesDepois.rows[0]?.total).toBe(
        identidadesAntes.rows[0]?.total,
      );
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("só a administração cadastra loja", () => {
  it(
    "sem sessão é 401, e dono de loja, cliente ou administrador revogado recebem a mesma recusa",
    async () => {
      const semSessao = await request(api.app)
        .post("/v1/admin/lojas")
        .set("origin", ORIGEM_DA_ADMINISTRACAO)
        .send(cadastro({ apelido: "loja-intrusa" }));
      expect(semSessao.status).toBe(401);

      const dona = await criarIdentidade({ nome: "Dona de outra loja" });
      for (const papel of ["OWNER", "CUSTOMER"] as const) {
        const recusa = await request(api.app)
          .post("/v1/admin/lojas")
          .set(comoPapel(dona.id, papel))
          .send(cadastro({ apelido: "loja-intrusa" }));
        expect(recusa.status).toBe(403);
      }

      // Token que diz ADMIN, de alguém que não está (ou não está mais) na
      // tabela de administradores: a segunda trava recusa.
      const naoAdministradora = await criarIdentidade({ nome: "Ex-admin" });
      const recusada = await request(api.app)
        .post("/v1/admin/lojas")
        .set(comoPapel(naoAdministradora.id, "ADMIN"))
        .send(cadastro({ apelido: "loja-intrusa" }));
      expect(recusada.status).toBe(403);

      const { rows } = await migrador.query(
        "SELECT 1 FROM app.stores WHERE slug = 'loja-intrusa'",
      );
      expect(rows).toHaveLength(0);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
