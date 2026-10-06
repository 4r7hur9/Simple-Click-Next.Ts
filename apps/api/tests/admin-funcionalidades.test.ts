/**
 * Funcionalidades liberadas por loja, pela API de verdade (AC-212, AC-213).
 *
 * O que se prova contra o banco:
 *
 * - loja recém-cadastrada nasce com tudo ligado, sem limite e sem exceção, e
 *   o dono lê isso ao entrar (AC-213);
 * - a administração desliga a impressão térmica de UMA loja: o dono dela lê a
 *   funcionalidade desligada (o painel esconde o menu) e as rotas da área —
 *   a configuração do papel e o cupom — respondem indisponível mesmo
 *   acessadas direto; a outra loja segue igual (AC-212);
 * - o ato fica na trilha com o motivo; religar devolve as rotas;
 * - o dono não religa sozinho: a tabela é só leitura para a conexão das lojas.
 */
import { randomUUID } from "node:crypto";

import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDasFuncionalidadesDaLoja,
  esquemaDasFuncionalidadesParaODono,
} from "@simpleclick/contracts";
import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  bancoDoArquivo,
  criarLoja,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";
import {
  abrirAcessoDaAplicacao,
  codigoDoPostgres,
  comoRequisicao,
  RECUSA_DE_PERMISSAO,
} from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let api: ApiDaAdministracao;
let administradora: IdentidadeDeTeste;
let acessoDasLojas: AcessoAoBanco;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  // As rotas do dono e o portão falam pela credencial das lojas.
  acessoDasLojas = abrirAcessoDaAplicacao(bancoDoArquivo().url, {
    maxDeConexoes: 4,
  });
  const acesso = acessoDasLojas;
  api = montarApiDaAdministracao({
    configuracoes: { acesso },
    cupom: { acesso },
    funcionalidades: { acesso },
    funcionalidadesDaLoja: { acesso },
  });
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await acessoDasLojas?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

function comoAdministradora() {
  return comoPapel(administradora.id, "ADMIN");
}

function lerNaAdministracao(lojaId: string) {
  return request(api.app)
    .get(`/v1/admin/lojas/${lojaId}/funcionalidades`)
    .set(comoAdministradora());
}

function alterar(lojaId: string, chave: string, ligada: boolean) {
  return request(api.app)
    .put(`/v1/admin/lojas/${lojaId}/funcionalidades/${chave}`)
    .set(comoAdministradora())
    .send({ ligada, motivo: "Impressora recolhida pela plataforma" });
}

function doDono(apelido: string, donoId: string) {
  return request(api.app)
    .get(`/v1/lojas/${apelido}/funcionalidades`)
    .set(comoPapel(donoId, "OWNER"));
}

function configuracaoDaImpressao(apelido: string, donoId: string) {
  return request(api.app)
    .get(`/v1/lojas/${apelido}/configuracao/impressao`)
    .set(comoPapel(donoId, "OWNER"));
}

function cupom(apelido: string, donoId: string) {
  return request(api.app)
    .post(`/v1/lojas/${apelido}/pedidos/${randomUUID()}/cupom`)
    .set(comoPapel(donoId, "OWNER"))
    .send({});
}

function ligadaParaODono(corpo: unknown, chave: string): boolean | undefined {
  return esquemaDasFuncionalidadesParaODono
    .parse(corpo)
    .funcionalidades.find((item) => item.chave === chave)?.ligada;
}

describe("funcionalidades por loja", () => {
  it(
    "@spec:AC-213 loja recém-cadastrada nasce com todas as funcionalidades ligadas, sem limite e sem exceção",
    async () => {
      const loja = await criarLoja({ nome: "Loja Nova" });

      const naAdministracao = await lerNaAdministracao(loja.id);
      expect(naAdministracao.status).toBe(200);
      const lidas = esquemaDasFuncionalidadesDaLoja.parse(naAdministracao.body);
      expect(lidas.funcionalidades.length).toBeGreaterThan(0);
      for (const item of lidas.funcionalidades) {
        expect(item).toMatchObject({
          ligada: true,
          limite: null,
          excecao: null,
        });
      }

      const doPainel = await doDono(loja.apelido, loja.dono.id);
      expect(doPainel.status).toBe(200);
      const paraODono = esquemaDasFuncionalidadesParaODono.parse(doPainel.body);
      expect(paraODono.funcionalidades.every((item) => item.ligada)).toBe(true);

      // Nenhuma linha de exceção, cobrança ou limite foi criada para ela.
      const { rows } = await migrador.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM app.store_feature_overrides WHERE store_id = $1",
        [loja.id],
      );
      expect(rows[0]?.total).toBe(0);

      // E a área de impressão responde normalmente.
      expect(
        (await configuracaoDaImpressao(loja.apelido, loja.dono.id)).status,
      ).toBe(200);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-212 com a impressão térmica desligada, o dono a lê desligada e as rotas da área respondem indisponível mesmo acessadas direto",
    async () => {
      const loja = await criarLoja({ nome: "Loja Sem Impressora" });
      const vizinha = await criarLoja({ nome: "Loja Vizinha" });

      const desligada = await alterar(loja.id, "auto_print", false);
      expect(desligada.status).toBe(200);
      const depois = esquemaDasFuncionalidadesDaLoja.parse(desligada.body);
      expect(
        depois.funcionalidades.find((item) => item.chave === "auto_print"),
      ).toMatchObject({
        ligada: false,
        excecao: {
          motivo: "Impressora recolhida pela plataforma",
          definidaPor: { id: administradora.id },
        },
      });

      // O painel do dono lê a área desligada (e o menu a esconde).
      const doPainel = await doDono(loja.apelido, loja.dono.id);
      expect(ligadaParaODono(doPainel.body, "auto_print")).toBe(false);

      // Acessada direto, cada rota da área responde indisponível.
      const config = await configuracaoDaImpressao(loja.apelido, loja.dono.id);
      expect(config.status).toBe(403);
      expect(config.body).toMatchObject({
        erro: "funcionalidade_indisponivel",
      });
      const via = await cupom(loja.apelido, loja.dono.id);
      expect(via.status).toBe(403);
      expect(via.body).toMatchObject({ erro: "funcionalidade_indisponivel" });

      // A loja vizinha segue com a área no ar.
      expect(
        ligadaParaODono(
          (await doDono(vizinha.apelido, vizinha.dono.id)).body,
          "auto_print",
        ),
      ).toBe(true);
      expect(
        (await configuracaoDaImpressao(vizinha.apelido, vizinha.dono.id))
          .status,
      ).toBe(200);
      // Passou do portão: o pedido inventado é que não existe.
      expect((await cupom(vizinha.apelido, vizinha.dono.id)).status).toBe(404);

      // O ato está na trilha, com quem fez e o motivo.
      const { rows } = await migrador.query<{
        action: string;
        actor_id: string;
        after_data: { motivo?: string; ligada?: boolean };
      }>(
        `SELECT action, actor_id::text AS actor_id, after_data
           FROM app.audit_log
          WHERE store_id = $1 AND action LIKE 'FUNCIONALIDADE_%'
          ORDER BY created_at`,
        [loja.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "FUNCIONALIDADE_DESLIGADA",
        actor_id: administradora.id,
        after_data: {
          ligada: false,
          motivo: "Impressora recolhida pela plataforma",
        },
      });

      // Religada, a área volta, e a exceção some (volta ao padrão).
      const religada = await alterar(loja.id, "auto_print", true);
      expect(religada.status).toBe(200);
      expect(
        (await configuracaoDaImpressao(loja.apelido, loja.dono.id)).status,
      ).toBe(200);
      const { rows: restantes } = await migrador.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM app.store_feature_overrides WHERE store_id = $1",
        [loja.id],
      );
      expect(restantes[0]?.total).toBe(0);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-212 só a administração altera: o dono não tem rota nem privilégio para religar, e chave sem efeito é recusada",
    async () => {
      const loja = await criarLoja({ nome: "Loja Teimosa" });
      expect((await alterar(loja.id, "auto_print", false)).status).toBe(200);

      // Pela rota da administração, o token de dono é recusado.
      const peloDono = await request(api.app)
        .put(`/v1/admin/lojas/${loja.id}/funcionalidades/auto_print`)
        .set(comoPapel(loja.dono.id, "OWNER"))
        .send({ ligada: true, motivo: "Quero de volta" });
      expect(peloDono.status).toBe(403);

      // Pela conexão das lojas, apagar ou alterar a exceção é recusado por
      // privilégio — nem a linha da própria loja.
      for (const comando of [
        "DELETE FROM app.store_feature_overrides",
        "UPDATE app.store_feature_overrides SET is_enabled = true",
      ]) {
        let codigo: string | undefined;
        try {
          await comoRequisicao(
            acessoDasLojas,
            { lojaId: loja.id, usuarioId: loja.dono.id, papel: "OWNER" },
            (tx) => tx.$executeRawUnsafe(comando),
          );
        } catch (erro) {
          codigo = codigoDoPostgres(erro);
        }
        expect(codigo).toBe(RECUSA_DE_PERMISSAO);
      }
      expect(
        ligadaParaODono(
          (await doDono(loja.apelido, loja.dono.id)).body,
          "auto_print",
        ),
      ).toBe(false);

      // Chave que nada consulta nesta versão não é desligável; chave
      // inventada não existe; loja inexistente não existe.
      expect((await alterar(loja.id, "custom_domain", false)).status).toBe(422);
      expect((await alterar(loja.id, "inventada", false)).status).toBe(404);
      expect((await lerNaAdministracao(randomUUID())).status).toBe(404);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
