/**
 * Donos e equipes pela administração da plataforma, pela API de verdade
 * (card #170, T-4), sobre o banco descartável deste arquivo.
 *
 * A aplicação da administração fala pela credencial `sc_admin`; a da loja
 * (situação do lojista) pela `sc_app`. O `migrador` só PREPARA o cenário
 * (senha, sessão, limite) e LÊ o resultado: nenhuma regra é provada por ele.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaFichaDaLoja,
  esquemaDaListaDeVinculos,
  esquemaDaPaginaDaAuditoriaDaPlataforma,
  esquemaDoItemDeVinculo,
} from "@simpleclick/contracts";
import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarCliente,
  criarIdentidade,
  criarLoja,
  criarMembro,
  criarProduto,
  type IdentidadeDeTeste,
  type LojaDeTeste,
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

const comoAdmin = () => comoPapel(administradora.id, "ADMIN");

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao();
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora de vínculos",
  });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** A pessoa já definiu a senha (o vínculo exige conta pronta para entrar). */
async function comSenha<T extends { id: string }>(pessoa: T): Promise<T> {
  await migrador.query(
    `UPDATE app.identities SET password_hash = $2 WHERE id = $1`,
    [pessoa.id, `$argon2id$prova$${randomBytes(8).toString("hex")}`],
  );
  return pessoa;
}

async function pessoaPronta(nome?: string): Promise<IdentidadeDeTeste> {
  return comSenha(await criarIdentidade(nome === undefined ? {} : { nome }));
}

/** Loja nova cujo dono já tem senha. */
async function lojaPronta(): Promise<LojaDeTeste> {
  const loja = await criarLoja();
  await comSenha(loja.dono);
  return loja;
}

/** Uma sessão aberta da pessoa, como o login deixaria. */
async function sessaoAberta(identidadeId: string): Promise<void> {
  await migrador.query(
    `INSERT INTO app.sessions
       (id, identity_id, family_id, token_sha256, role_at_issue, client_kind,
        expires_at)
     VALUES ($1, $2, $3, $4, 'OWNER', 'WEB', now() + interval '1 day')`,
    [randomUUID(), identidadeId, randomUUID(), randomBytes(32).toString("hex")],
  );
}

async function sessoes(identidadeId: string) {
  const { rows } = await migrador.query<{
    revogada: boolean;
    motivo: string | null;
  }>(
    `SELECT revoked_at IS NOT NULL AS revogada, revoked_reason AS motivo
       FROM app.sessions WHERE identity_id = $1 ORDER BY issued_at, id`,
    [identidadeId],
  );
  return rows;
}

/** A linha de vínculo da pessoa na loja, como o banco a guarda. */
async function vinculoNoBanco(lojaId: string, identidadeId: string) {
  const { rows } = await migrador.query<{
    papel: string;
    revogado: boolean;
    aceito: boolean;
  }>(
    `SELECT role AS papel, revoked_at IS NOT NULL AS revogado,
            invite_accepted_at IS NOT NULL AS aceito
       FROM app.store_members WHERE store_id = $1 AND identity_id = $2`,
    [lojaId, identidadeId],
  );
  return rows[0] ?? null;
}

/** Os vínculos inteiros da loja, para provar que nada mudou. */
async function vinculosDaLoja(lojaId: string) {
  const { rows } = await migrador.query(
    `SELECT to_jsonb(m) AS linha FROM app.store_members m
      WHERE store_id = $1 ORDER BY id`,
    [lojaId],
  );
  return rows;
}

/**
 * O que é da loja: a linha dela e as contagens de catálogo, clientes e
 * pedidos. A troca de dono não pode mudar nada disso.
 */
async function retratoDaLoja(lojaId: string) {
  const { rows } = await migrador.query(
    `SELECT to_jsonb(s) AS loja,
            (SELECT count(*)::int FROM app.products WHERE store_id = s.id) AS produtos,
            (SELECT count(*)::int FROM app.categories WHERE store_id = s.id) AS categorias,
            (SELECT count(*)::int FROM app.store_customers WHERE store_id = s.id) AS clientes,
            (SELECT count(*)::int FROM app.orders WHERE store_id = s.id) AS pedidos
       FROM app.stores s WHERE s.id = $1`,
    [lojaId],
  );
  return rows[0];
}

async function pedidoNaLoja(loja: LojaDeTeste): Promise<void> {
  const cliente = await criarCliente({ loja });
  await migrador.query(
    `INSERT INTO app.orders
       (store_id, store_customer_id, number, code, public_token, status,
        channel, total_cents, subtotal_cents, placed_at)
     VALUES ($1, $2, 1, 'P1', $3, 'COMPLETED', 'ONLINE', 1000, 1000, now())`,
    [loja.id, cliente.id, `token-vinculos-${loja.id}`],
  );
}

function adicionarDono(lojaId: string, identidadeId: string, motivo = "Prova") {
  return request(api.app)
    .post(`/v1/admin/lojas/${lojaId}/donos`)
    .set(comoAdmin())
    .send({ identidadeId, motivo });
}

function trocarDono(
  lojaId: string,
  antigoId: string,
  novoDonoId: string,
  motivo = "Prova de troca",
) {
  return request(api.app)
    .put(`/v1/admin/lojas/${lojaId}/donos/${antigoId}/substituicao`)
    .set(comoAdmin())
    .send({ novoDonoId, motivo });
}

function removerDono(lojaId: string, identidadeId: string) {
  return request(api.app)
    .delete(`/v1/admin/lojas/${lojaId}/donos/${identidadeId}`)
    .set(comoAdmin())
    .send({ motivo: "Prova de remoção" });
}

function adicionarEquipe(lojaId: string, identidadeId: string) {
  return request(api.app)
    .post(`/v1/admin/lojas/${lojaId}/equipe`)
    .set(comoAdmin())
    .send({ identidadeId, motivo: "Prova de equipe" });
}

function removerEquipe(lojaId: string, identidadeId: string) {
  return request(api.app)
    .delete(`/v1/admin/lojas/${lojaId}/equipe/${identidadeId}`)
    .set(comoAdmin())
    .send({ motivo: "Prova de equipe" });
}

/** Desativa pela rota da administração (só ela mexe em `disabled_at`). */
async function desativarPelaAdministracao(identidadeId: string) {
  const resposta = await request(api.app)
    .put(`/v1/admin/pessoas/${identidadeId}/desativacao`)
    .set(comoAdmin())
    .send({ motivo: "Prova de desativação", lojasSemDonoCiente: true });
  expect(resposta.status).toBe(200);
}

// ---------------------------------------------------------------------------
// CA-8: regras de posse
// ---------------------------------------------------------------------------

describe("troca de dono [CA-8]", () => {
  it(
    "[CA-8] a troca é atômica: novo dono ativo, antigo revogado, sessões do antigo com ROLE_CHANGED e nada da loja muda",
    async () => {
      const loja = await lojaPronta();
      await criarProduto({ loja });
      await criarProduto({ loja });
      await pedidoNaLoja(loja);
      await sessaoAberta(loja.dono.id);
      await sessaoAberta(loja.dono.id);
      const novo = await pessoaPronta("Novo dono da troca");
      await sessaoAberta(novo.id);
      const antes = await retratoDaLoja(loja.id);
      expect(antes).toMatchObject({ produtos: 2, pedidos: 1, clientes: 1 });

      const resposta = await trocarDono(loja.id, loja.dono.id, novo.id);
      expect(resposta.status).toBe(200);
      expect(resposta.headers["cache-control"]).toBe("no-store");
      expect(esquemaDoItemDeVinculo.parse(resposta.body)).toMatchObject({
        lojaId: loja.id,
        identidadeId: novo.id,
        papel: "OWNER",
      });

      expect(await vinculoNoBanco(loja.id, novo.id)).toEqual({
        papel: "OWNER",
        revogado: false,
        aceito: true,
      });
      // O vínculo antigo continua lá, revogado: nada é apagado.
      expect(await vinculoNoBanco(loja.id, loja.dono.id)).toEqual({
        papel: "OWNER",
        revogado: true,
        aceito: true,
      });
      expect(await sessoes(loja.dono.id)).toEqual([
        { revogada: true, motivo: "ROLE_CHANGED" },
        { revogada: true, motivo: "ROLE_CHANGED" },
      ]);
      expect(await sessoes(novo.id)).toEqual([
        { revogada: false, motivo: null },
      ]);
      expect(await retratoDaLoja(loja.id)).toEqual(antes);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-8] autotroca é 422 mesma_pessoa; trocar quem não é dono é 404; o novo que já é dono é 409 ja_e_dono",
    async () => {
      const loja = await lojaPronta();
      const outro = await pessoaPronta();
      await criarMembro({ loja, identidade: outro, papel: "OWNER" });
      const equipe = await pessoaPronta();
      await criarMembro({ loja, identidade: equipe, papel: "STAFF" });
      const antes = await vinculosDaLoja(loja.id);

      const autotroca = await trocarDono(loja.id, loja.dono.id, loja.dono.id);
      expect(autotroca.status).toBe(422);
      expect(autotroca.body).toMatchObject({ erro: "mesma_pessoa" });

      const deEquipe = await trocarDono(loja.id, equipe.id, outro.id);
      expect(deEquipe.status).toBe(404);

      const jaDono = await trocarDono(loja.id, loja.dono.id, outro.id);
      expect(jaDono.status).toBe(409);
      expect(jaDono.body).toMatchObject({ erro: "ja_e_dono" });

      expect(await vinculosDaLoja(loja.id)).toEqual(antes);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-8] a equipe que vira dona é UPDATE da mesma linha",
    async () => {
      const loja = await lojaPronta();
      const equipe = await pessoaPronta();
      const membro = await criarMembro({ loja, identidade: equipe, papel: "STAFF" });

      const resposta = await trocarDono(loja.id, loja.dono.id, equipe.id);
      expect(resposta.status).toBe(200);
      const { rows } = await migrador.query<{ id: string; role: string }>(
        `SELECT id::text AS id, role FROM app.store_members
          WHERE store_id = $1 AND identity_id = $2`,
        [loja.id, equipe.id],
      );
      expect(rows).toEqual([{ id: membro.id, role: "OWNER" }]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("adicionar e remover dono [CA-8]", () => {
  it(
    "[CA-8] o último dono ativo não sai (409 ultimo_dono), nem quando o outro dono está desativado; com outro dono ativo, sai com revoked_at e ROLE_CHANGED",
    async () => {
      const loja = await lojaPronta();
      await sessaoAberta(loja.dono.id);

      const sozinho = await removerDono(loja.id, loja.dono.id);
      expect(sozinho.status).toBe(409);
      expect(sozinho.body).toMatchObject({ erro: "ultimo_dono" });

      // Dono desativado não conta como dono ativo.
      const desativado = await pessoaPronta();
      expect((await adicionarDono(loja.id, desativado.id)).status).toBe(201);
      await desativarPelaAdministracao(desativado.id);
      const comDesativado = await removerDono(loja.id, loja.dono.id);
      expect(comDesativado.status).toBe(409);
      expect(comDesativado.body).toMatchObject({ erro: "ultimo_dono" });
      expect(await vinculoNoBanco(loja.id, loja.dono.id)).toMatchObject({
        revogado: false,
      });

      const segundo = await pessoaPronta();
      const adicionado = await adicionarDono(loja.id, segundo.id);
      expect(adicionado.status).toBe(201);
      expect(esquemaDoItemDeVinculo.parse(adicionado.body)).toMatchObject({
        identidadeId: segundo.id,
        papel: "OWNER",
      });

      const removido = await removerDono(loja.id, loja.dono.id);
      expect(removido.status).toBe(204);
      expect(await vinculoNoBanco(loja.id, loja.dono.id)).toEqual({
        papel: "OWNER",
        revogado: true,
        aceito: true,
      });
      expect(await sessoes(loja.dono.id)).toEqual([
        { revogada: true, motivo: "ROLE_CHANGED" },
      ]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-8] adicionar quem já é dono é 409 ja_e_dono; dono removido volta na mesma linha",
    async () => {
      const loja = await lojaPronta();
      const jaDono = await adicionarDono(loja.id, loja.dono.id);
      expect(jaDono.status).toBe(409);
      expect(jaDono.body).toMatchObject({ erro: "ja_e_dono" });

      const segundo = await pessoaPronta();
      expect((await adicionarDono(loja.id, segundo.id)).status).toBe(201);
      expect((await removerDono(loja.id, segundo.id)).status).toBe(204);
      expect((await adicionarDono(loja.id, segundo.id)).status).toBe(201);
      const { rows } = await migrador.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.store_members
          WHERE store_id = $1 AND identity_id = $2`,
        [loja.id, segundo.id],
      );
      expect(rows[0]?.total).toBe(1);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-8] [CA-11] pessoa sem senha, desativada ou protegida não recebe vínculo (409), e nada muda",
    async () => {
      const loja = await lojaPronta();
      const semSenha = await criarIdentidade();
      const desativada = await pessoaPronta();
      await desativarPelaAdministracao(desativada.id);
      const protegida = await comSenha(
        await criarAdministradorDaPlataforma({ nome: "Admin alvo de vínculo" }),
      );
      const antes = await vinculosDaLoja(loja.id);

      const casos: [IdentidadeDeTeste, string][] = [
        [semSenha, "sem_acesso_definido"],
        [desativada, "conta_desativada"],
        [protegida, "conta_protegida"],
      ];
      for (const [pessoa, erro] of casos) {
        for (const resposta of [
          await adicionarDono(loja.id, pessoa.id),
          await adicionarEquipe(loja.id, pessoa.id),
          await trocarDono(loja.id, loja.dono.id, pessoa.id),
        ]) {
          expect(resposta.status, erro).toBe(409);
          expect(resposta.body, erro).toMatchObject({ erro });
        }
      }
      expect(await vinculosDaLoja(loja.id)).toEqual(antes);

      // A conta protegida que já é dona também não PERDE o vínculo por aqui.
      const daAdmin = await criarLoja({ dono: protegida });
      const outro = await pessoaPronta();
      expect((await adicionarDono(daAdmin.id, outro.id)).status).toBe(201);
      const tirar = await removerDono(daAdmin.id, protegida.id);
      expect(tirar.status).toBe(409);
      expect(tirar.body).toMatchObject({ erro: "conta_protegida" });
      const trocar = await trocarDono(daAdmin.id, protegida.id, outro.id);
      expect(trocar.status).toBe(409);
      expect(trocar.body).toMatchObject({ erro: "conta_protegida" });
      expect(await vinculoNoBanco(daAdmin.id, protegida.id)).toMatchObject({
        revogado: false,
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "loja, pessoa ou parâmetro inexistentes: 404; corpo com papel ou campo a mais: 400",
    async () => {
      const loja = await lojaPronta();
      const pessoa = await pessoaPronta();
      expect((await adicionarDono(randomUUID(), pessoa.id)).status).toBe(404);
      expect((await adicionarDono(loja.id, randomUUID())).status).toBe(404);
      const comPapel = await request(api.app)
        .post(`/v1/admin/lojas/${loja.id}/donos`)
        .set(comoAdmin())
        .send({ identidadeId: pessoa.id, motivo: "Prova", papel: "ADMIN" });
      expect(comPapel.status).toBe(400);
      const semMotivo = await request(api.app)
        .post(`/v1/admin/lojas/${loja.id}/equipe`)
        .set(comoAdmin())
        .send({ identidadeId: pessoa.id });
      expect(semMotivo.status).toBe(400);
      expect(await vinculoNoBanco(loja.id, pessoa.id)).toBeNull();
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("equipe [CA-8]", () => {
  it(
    "[CA-8] rotas de equipe não tocam a linha de dono (404) e POST de equipe sobre dono é 409 ja_e_dono; rotas de dono não tocam equipe",
    async () => {
      const loja = await lojaPronta();
      const equipe = await pessoaPronta();
      await criarMembro({ loja, identidade: equipe, papel: "STAFF" });
      const antes = await vinculosDaLoja(loja.id);

      expect((await removerEquipe(loja.id, loja.dono.id)).status).toBe(404);
      const sobreDono = await adicionarEquipe(loja.id, loja.dono.id);
      expect(sobreDono.status).toBe(409);
      expect(sobreDono.body).toMatchObject({ erro: "ja_e_dono" });
      expect((await removerDono(loja.id, equipe.id)).status).toBe(404);
      expect(await vinculosDaLoja(loja.id)).toEqual(antes);

      // Remover equipe é revoked_at: a linha continua.
      expect((await removerEquipe(loja.id, equipe.id)).status).toBe(204);
      expect(await vinculoNoBanco(loja.id, equipe.id)).toEqual({
        papel: "STAFF",
        revogado: true,
        aceito: true,
      });
      // Repetir a remoção não acha mais o vínculo ativo.
      expect((await removerEquipe(loja.id, equipe.id)).status).toBe(404);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-8] adicionar à equipe respeita o limite da loja (409 limite_atingido); quem já está responde 200 sem duplicar",
    async () => {
      const loja = await lojaPronta();
      const primeira = await pessoaPronta();
      const segunda = await pessoaPronta();
      // Padrão da plataforma: 1 pessoa de equipe por loja.
      await migrador.query(
        `INSERT INTO app.store_limits (store_id, max_staff) VALUES ($1, 1)
         ON CONFLICT (store_id) DO UPDATE SET max_staff = 1`,
        [loja.id],
      );
      const criada = await adicionarEquipe(loja.id, primeira.id);
      expect(criada.status).toBe(201);
      expect(esquemaDoItemDeVinculo.parse(criada.body)).toMatchObject({
        identidadeId: primeira.id,
        papel: "STAFF",
      });
      const repetida = await adicionarEquipe(loja.id, primeira.id);
      expect(repetida.status).toBe(200);

      const cheia = await adicionarEquipe(loja.id, segunda.id);
      expect(cheia.status).toBe(409);
      expect(cheia.body).toMatchObject({
        erro: "limite_atingido",
        recurso: "staff",
        limite: 1,
        uso: 1,
      });
      expect(await vinculoNoBanco(loja.id, segunda.id)).toBeNull();
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("concorrência dos limites [CA-8]", () => {
  it(
    "[CA-8] duas atribuições de dono concorrentes em lojas diferentes não passam do limite de lojas da pessoa",
    async () => {
      const pessoa = await pessoaPronta("Dona disputada");
      const lojas = await Promise.all([lojaPronta(), lojaPronta(), lojaPronta()]);
      await migrador.query(
        `INSERT INTO app.owner_limits (identity_id, max_stores) VALUES ($1, 1)
         ON CONFLICT (identity_id) DO UPDATE SET max_stores = 1`,
        [pessoa.id],
      );

      const respostas = await Promise.all(
        lojas.map((loja) => adicionarDono(loja.id, pessoa.id)),
      );
      const status = respostas.map((r) => r.status).sort();
      expect(status).toEqual([201, 409, 409]);
      for (const recusada of respostas.filter((r) => r.status === 409)) {
        expect(recusada.body).toMatchObject({
          erro: "limite_atingido",
          recurso: "lojas",
          limite: 1,
          uso: 1,
        });
      }
      const { rows } = await migrador.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.store_members
          WHERE identity_id = $1 AND role = 'OWNER' AND revoked_at IS NULL`,
        [pessoa.id],
      );
      expect(rows[0]?.total).toBe(1);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-8] duas pessoas postas na equipe da mesma loja ao mesmo tempo não passam do limite de equipe",
    async () => {
      const loja = await lojaPronta();
      const pessoas = await Promise.all([pessoaPronta(), pessoaPronta()]);
      await migrador.query(
        `INSERT INTO app.store_limits (store_id, max_staff) VALUES ($1, 1)
         ON CONFLICT (store_id) DO UPDATE SET max_staff = 1`,
        [loja.id],
      );
      const respostas = await Promise.all(
        pessoas.map((pessoa) => adicionarEquipe(loja.id, pessoa.id)),
      );
      expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
      const { rows } = await migrador.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.store_members
          WHERE store_id = $1 AND role = 'STAFF' AND revoked_at IS NULL`,
        [loja.id],
      );
      expect(rows[0]?.total).toBe(1);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-8] duas remoções concorrentes dos dois donos da loja: só uma passa, e a loja fica com dono",
    async () => {
      const loja = await lojaPronta();
      const segundo = await pessoaPronta();
      expect((await adicionarDono(loja.id, segundo.id)).status).toBe(201);
      const respostas = await Promise.all([
        removerDono(loja.id, loja.dono.id),
        removerDono(loja.id, segundo.id),
      ]);
      expect(respostas.map((r) => r.status).sort()).toEqual([204, 409]);
      const { rows } = await migrador.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.store_members
          WHERE store_id = $1 AND role = 'OWNER' AND revoked_at IS NULL`,
        [loja.id],
      );
      expect(rows[0]?.total).toBe(1);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-9: trilhas
// ---------------------------------------------------------------------------

describe("trilhas dos vínculos [CA-9]", () => {
  it(
    "[CA-9] o audit_log da loja guarda só ids e papel em DONO_*; o motivo fica em audit_platform; a situação do lojista não mostra DONO_*",
    async () => {
      const loja = await lojaPronta();
      const segundo = await pessoaPronta();
      const terceiro = await pessoaPronta();
      const motivo = `Motivo sigiloso ${randomUUID()}`;
      expect((await adicionarDono(loja.id, segundo.id, motivo)).status).toBe(
        201,
      );
      expect(
        (await trocarDono(loja.id, segundo.id, terceiro.id, motivo)).status,
      ).toBe(200);
      expect((await removerDono(loja.id, terceiro.id)).status).toBe(204);

      const { rows: daLoja } = await migrador.query<{
        action: string;
        actor_role: string;
        before_data: Record<string, unknown> | null;
        after_data: Record<string, unknown> | null;
      }>(
        `SELECT action, actor_role, before_data, after_data FROM app.audit_log
          WHERE store_id = $1 AND action LIKE 'DONO_%' ORDER BY created_at, id`,
        [loja.id],
      );
      expect(daLoja.map((linha) => linha.action)).toEqual([
        "DONO_ADICIONADO",
        "DONO_SUBSTITUIDO",
        "DONO_REMOVIDO",
      ]);
      for (const linha of daLoja) {
        expect(linha.actor_role).toBe("ADMIN");
        for (const lado of [linha.before_data, linha.after_data]) {
          if (lado === null) continue;
          expect(Object.keys(lado).sort()).toEqual(["identidadeId", "papel"]);
        }
      }
      expect(JSON.stringify(daLoja)).not.toContain(motivo);

      const { rows: daPlataforma } = await migrador.query<{
        action: string;
        entity: string;
        after_data: { motivo?: string };
      }>(
        `SELECT action, entity, after_data FROM app.audit_platform
          WHERE entity = 'store' AND entity_id = $1 ORDER BY created_at, id`,
        [loja.id],
      );
      expect(daPlataforma.map((linha) => linha.action)).toEqual([
        "DONO_ADICIONADO",
        "DONO_SUBSTITUIDO",
        "DONO_REMOVIDO",
      ]);
      expect(daPlataforma[0]?.after_data.motivo).toBe(motivo);
      expect(daPlataforma[1]?.after_data.motivo).toBe(motivo);

      // A trilha da plataforma, lida pela administração, destaca a troca.
      const pagina = esquemaDaPaginaDaAuditoriaDaPlataforma.parse(
        (
          await request(api.app)
            .get("/v1/admin/auditoria/plataforma")
            .query({ ato: "DONO_SUBSTITUIDO" })
            .set(comoAdmin())
        ).body,
      );
      const troca = pagina.registros.find(
        (registro) => registro.entidadeId === loja.id,
      );
      expect(troca).toMatchObject({ entidade: "store", sensivel: true });

      // A ficha da loja (audit_log) também destaca, sem o motivo.
      const ficha = esquemaDaFichaDaLoja.parse(
        (await request(api.app).get(`/v1/admin/lojas/${loja.id}`).set(comoAdmin()))
          .body,
      );
      const atosDeDono = ficha.historico.filter((r) => r.acao.startsWith("DONO_"));
      expect(atosDeDono.length).toBe(3);
      expect(atosDeDono.every((r) => r.sensivel)).toBe(true);
      expect(JSON.stringify(ficha)).not.toContain(motivo);

      // O lojista lê a situação da própria loja: nada de DONO_* nem motivo.
      const situacao = await request(api.app)
        .get(`/v1/lojas/${loja.apelido}/situacao`)
        .set(comoPapel(loja.dono.id, "OWNER"));
      expect(situacao.status).toBe(200);
      expect(JSON.stringify(situacao.body)).not.toMatch(/DONO_/);
      expect(JSON.stringify(situacao.body)).not.toContain(motivo);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

describe("lista de vínculos", () => {
  it(
    "lista donos e equipe ativos por papel, com busca pela loja ou pela pessoa; revogado e convite pendente não aparecem",
    async () => {
      const loja = await lojaPronta();
      const equipe = await pessoaPronta("Equipe listada");
      await criarMembro({ loja, identidade: equipe, papel: "STAFF" });
      const saiu = await pessoaPronta("Dono que saiu");
      expect((await adicionarDono(loja.id, saiu.id)).status).toBe(201);
      expect((await removerDono(loja.id, saiu.id)).status).toBe(204);
      const convidada = await criarIdentidade();
      await migrador.query(
        `INSERT INTO app.store_members
           (store_id, identity_id, role, invite_token_hash, invite_expires_at)
         VALUES ($1, $2, 'OWNER', $3, now() + interval '2 days')`,
        [loja.id, convidada.id, randomBytes(32).toString("hex")],
      );

      const donos = esquemaDaListaDeVinculos.parse(
        (
          await request(api.app)
            .get("/v1/admin/vinculos")
            .query({ tipo: "donos", busca: loja.apelido })
            .set(comoAdmin())
        ).body,
      );
      expect(donos.vinculos.map((v) => v.identidadeId)).toEqual([loja.dono.id]);
      expect(donos.total).toBe(1);
      expect(donos.vinculos[0]).toMatchObject({
        lojaId: loja.id,
        lojaApelido: loja.apelido,
        papel: "OWNER",
      });

      const daPessoa = esquemaDaListaDeVinculos.parse(
        (
          await request(api.app)
            .get("/v1/admin/vinculos")
            .query({ tipo: "equipe", busca: equipe.email })
            .set(comoAdmin())
        ).body,
      );
      expect(daPessoa.vinculos.map((v) => [v.lojaId, v.identidadeId])).toEqual([
        [loja.id, equipe.id],
      ]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-10: autorização
// ---------------------------------------------------------------------------

describe("autorização por papel [CA-10]", () => {
  it(
    "[CA-10] dono, equipe, cliente e admin com grant revogado recebem 403; anônimo 401; mutação sem origem é recusada; admin passa",
    async () => {
      const loja = await lojaPronta();
      const [p1, p2, p3] = await Promise.all([
        pessoaPronta(),
        pessoaPronta(),
        pessoaPronta(),
      ]);
      const equipe = await pessoaPronta();
      await criarMembro({ loja, identidade: equipe, papel: "STAFF" });
      const cliente = await criarIdentidade();
      const revogada = await criarAdministradorDaPlataforma({
        nome: "Admin revogada de vínculos",
      });
      await migrador.query(
        "UPDATE app.platform_admins SET revoked_at = now() WHERE identity_id = $1",
        [revogada.id],
      );

      type Chamada = (cabecalhos: Record<string, string>) => request.Test;
      const chamar =
        (
          metodo: "get" | "post" | "put" | "delete",
          caminho: string,
          corpo?: object,
        ): Chamada =>
        (cabecalhos) => {
          const pedido = request(api.app)[metodo](caminho).set(cabecalhos);
          return corpo === undefined ? pedido : pedido.send(corpo);
        };
      const base = `/v1/admin/lojas/${loja.id}`;
      // Em ordem: na passada da administração, cada uma deixa o cenário
      // pronto para a seguinte (e todas respondem 2xx).
      const rotas: [string, Chamada, boolean][] = [
        ["GET /vinculos", chamar("get", "/v1/admin/vinculos"), false],
        [
          "POST /lojas/:id/donos",
          chamar("post", `${base}/donos`, { identidadeId: p1.id, motivo: "Prova" }),
          true,
        ],
        [
          "PUT /lojas/:id/donos/:identidadeId/substituicao",
          chamar("put", `${base}/donos/${p1.id}/substituicao`, {
            novoDonoId: p2.id,
            motivo: "Prova",
          }),
          true,
        ],
        [
          "DELETE /lojas/:id/donos/:identidadeId",
          chamar("delete", `${base}/donos/${p2.id}`, { motivo: "Prova" }),
          true,
        ],
        [
          "POST /lojas/:id/equipe",
          chamar("post", `${base}/equipe`, { identidadeId: p3.id, motivo: "Prova" }),
          true,
        ],
        [
          "DELETE /lojas/:id/equipe/:identidadeId",
          chamar("delete", `${base}/equipe/${equipe.id}`, { motivo: "Prova" }),
          true,
        ],
      ];
      // A loja aceita 2 pessoas na equipe para a passada da administração.
      await migrador.query(
        `INSERT INTO app.store_limits (store_id, max_staff) VALUES ($1, 2)
         ON CONFLICT (store_id) DO UPDATE SET max_staff = 2`,
        [loja.id],
      );
      // Para a remoção de dono passar, a loja precisa de outro dono ativo:
      // o dono original segue na loja durante toda a passada.
      const antes = await vinculosDaLoja(loja.id);

      for (const [rota, chamarRota, mutacao] of rotas) {
        const negados: [string, Record<string, string>][] = [
          ["dono", comoPapel(loja.dono.id, "OWNER")],
          ["equipe", comoPapel(equipe.id, "OWNER")],
          ["cliente", comoPapel(cliente.id, "CUSTOMER")],
          ["admin revogada", comoPapel(revogada.id, "ADMIN")],
        ];
        for (const [quem, cabecalhos] of negados) {
          expect(
            (await chamarRota(cabecalhos)).status,
            `${rota} como ${quem}`,
          ).toBe(403);
        }
        expect(
          (await chamarRota({ origin: ORIGEM_DA_ADMINISTRACAO })).status,
          `${rota} anônimo`,
        ).toBe(401);
        if (mutacao) {
          const semOrigem = await chamarRota({
            authorization: comoAdmin().authorization,
          });
          expect(semOrigem.status, `${rota} sem origem`).toBe(403);
        }
      }
      expect(await vinculosDaLoja(loja.id)).toEqual(antes);

      for (const [rota, chamarRota] of rotas) {
        const resposta = await chamarRota(comoAdmin());
        expect(resposta.status, `${rota} como admin`).toBeGreaterThanOrEqual(
          200,
        );
        expect(resposta.status, `${rota} como admin`).toBeLessThan(300);
      }
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-11: nada concede administração, nada apaga vínculo
// ---------------------------------------------------------------------------

describe("nenhuma via concede administração nem apaga vínculo [CA-11]", () => {
  it("[CA-11] os arquivos de vínculos não escrevem em platform_admins nem apagam store_members", () => {
    const pasta = join(
      dirname(fileURLToPath(import.meta.url)),
      "../src/modules/admin",
    );
    for (const arquivo of [
      "vinculos.repo.ts",
      "vinculos.usecase.ts",
      "vinculos.routes.ts",
    ]) {
      const fonte = readFileSync(join(pasta, arquivo), "utf8");
      expect(fonte, arquivo).not.toMatch(
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+(app\.)?platform_admins/i,
      );
      expect(fonte, arquivo).not.toMatch(
        /DELETE\s+FROM\s+(app\.)?store_members/i,
      );
    }
  });
});
