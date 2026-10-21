/**
 * Suspender, reativar, excluir e restaurar uma loja, pela API de verdade
 * (AC-209, AC-210, AC-211; Q-203).
 *
 * O que se prova contra o banco, e não só na regra:
 *
 * - suspensa, a vitrine e o fechamento respondem como loja inexistente
 *   (AC-402), o dono lê o aviso com o motivo, e o catálogo e os pedidos
 *   continuam lá, linha por linha;
 * - o cliente que já pediu continua acompanhando o pedido (Q-203);
 * - reativada, a vitrine volta com o MESMO catálogo, e o período inteiro da
 *   suspensão fica no histórico;
 * - a exclusão só acontece com o nome digitado, tira a loja das listagens e
 *   do ar, retém os dados por 30 dias — restaurável nesse prazo — e, vencido
 *   o prazo, a remoção definitiva apaga o que identifica e o que dá acesso,
 *   sem tocar pedido nem trilha.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaFichaDaLoja,
  esquemaDaListaDeLojas,
  esquemaDaSituacaoParaODono,
  esquemaDoAcompanhamento,
  type FichaDaLojaNoContrato,
  type NovaLojaEnviada,
} from "@simpleclick/contracts";
import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarLoja,
  criarProduto,
  type IdentidadeDeTeste,
  type LojaDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  retratoDoCatalogo,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";
import {
  codigoDoPostgres,
  comoRequisicao,
  RECUSA_DE_PERMISSAO,
} from "./apoio-de-isolamento.ts";
import { fazerPedido } from "./apoio-de-pedidos.ts";
import { criarRemocaoDefinitiva } from "../src/modules/admin/remocao-definitiva.ts";

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;

let migrador: pg.Client;
let api: ApiDaAdministracao;
let administradora: IdentidadeDeTeste;
/** O relógio da API: `null` é o relógio de verdade. */
let relogio: Date | null = null;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao({}, () => relogio ?? new Date());
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

// ---------------------------------------------------------------------------
// Atalhos
// ---------------------------------------------------------------------------

function comoAdministradora() {
  return comoPapel(administradora.id, "ADMIN");
}

function suspender(lojaId: string, motivo: string) {
  return request(api.app)
    .put(`/v1/admin/lojas/${lojaId}/suspensao`)
    .set(comoAdministradora())
    .send({ motivo });
}

function reativar(lojaId: string) {
  return request(api.app)
    .put(`/v1/admin/lojas/${lojaId}/reativacao`)
    .set(comoAdministradora())
    .send({});
}

function excluir(lojaId: string, confirmacao: string) {
  return request(api.app)
    .delete(`/v1/admin/lojas/${lojaId}`)
    .set(comoAdministradora())
    .send({ confirmacao });
}

function restaurar(lojaId: string) {
  return request(api.app)
    .put(`/v1/admin/lojas/${lojaId}/restauracao`)
    .set(comoAdministradora())
    .send({});
}

function vitrine(apelido: string) {
  return request(api.app).get(`/v1/vitrine/${apelido}`);
}

function situacaoDoDono(apelido: string, donoId: string) {
  return request(api.app)
    .get(`/v1/lojas/${apelido}/situacao`)
    .set(comoPapel(donoId, "OWNER"));
}

function ficha(resposta: { body: unknown }): FichaDaLojaNoContrato {
  return esquemaDaFichaDaLoja.parse(resposta.body);
}

async function contar(tabela: string, lojaId: string): Promise<number> {
  const { rows } = await migrador.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM app.${tabela} WHERE store_id = $1`,
    [lojaId],
  );
  return rows[0]?.total ?? 0;
}

/** Uma loja no ar, com um produto publicado e um pedido feito. */
async function lojaComCatalogoEPedido(nome: string) {
  const loja = await criarLoja({ nome });
  await criarProduto({ loja, nome: `Carro-chefe de ${nome}` });
  const pedido = await fazerPedido(api.acessoDaAplicacao, loja);
  return { loja, pedido };
}

/** Uma loja cadastrada pela administração, com documento e contato. */
async function lojaCadastrada(
  nome: string,
  apelido: string,
  documento: string,
): Promise<string> {
  const loja: NovaLojaEnviada = {
    nome,
    razaoSocial: `${nome} Ltda`,
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
      complemento: "Sala 2",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      uf: "SP",
    },
    tipoDeNegocio: "FOOD_SNACK",
    apelido,
  };
  const resposta = await request(api.app)
    .post("/v1/admin/lojas")
    .set(comoAdministradora())
    .send(loja);
  if (resposta.status !== 201) {
    throw new Error(`cadastro recusado: ${JSON.stringify(resposta.body)}`);
  }
  return String(resposta.body.id);
}

// ---------------------------------------------------------------------------
// AC-209
// ---------------------------------------------------------------------------

describe("loja suspensa sai do ar sem perder dados (AC-209)", () => {
  let loja: LojaDeTeste;
  let tokenDoPedido: string;
  let retratoAntes: Record<string, unknown[]>;
  let pedidosAntes: number;

  beforeAll(async () => {
    const montada = await lojaComCatalogoEPedido("Pastel da Joi");
    loja = montada.loja;
    tokenDoPedido = montada.pedido.tokenPublico;
    retratoAntes = await retratoDoCatalogo(migrador, loja.id);
    pedidosAntes = await contar("orders", loja.id);
  }, ESPERA_DA_ADMINISTRACAO);

  it(
    "@spec:AC-209 suspender com o motivo tira a vitrine e o fechamento do ar, e a suspensão vai para o histórico",
    async () => {
      expect((await vitrine(loja.apelido)).status).toBe(200);

      const resposta = await suspender(loja.id, "Mensalidade em atraso");

      expect(resposta.status).toBe(200);
      const suspensa = ficha(resposta);
      expect(suspensa.status).toBe("INACTIVE");
      expect(suspensa.suspensao?.motivo).toBe("Mensalidade em atraso");
      expect(suspensa.historico[0]).toMatchObject({
        acao: "LOJA_DESATIVADA",
        quem: { id: administradora.id, nome: "Administradora geral" },
        campos: [
          { campo: "status", antes: "ACTIVE", depois: "INACTIVE" },
          { campo: "motivo", antes: null, depois: "Mensalidade em atraso" },
        ],
      });

      // A vitrine responde igual a loja que nunca existiu (AC-402).
      const daSuspensa = await vitrine(loja.apelido);
      const daInexistente = await vitrine("loja-que-nunca-existiu");
      expect(daSuspensa.status).toBe(404);
      expect(daSuspensa.status).toBe(daInexistente.status);
      expect(JSON.stringify(daSuspensa.body)).not.toContain("INACTIVE");
      // E o fechamento também não atende.
      const fechamento = await request(api.app).get(
        `/v1/vitrine/${loja.apelido}/fechamento`,
      );
      expect(fechamento.status).toBe(404);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-209 nenhum produto ou pedido é apagado: o catálogo é o mesmo, linha por linha",
    async () => {
      expect(await retratoDoCatalogo(migrador, loja.id)).toEqual(retratoAntes);
      expect(await contar("orders", loja.id)).toBe(pedidosAntes);
      expect(await contar("store_members", loja.id)).toBeGreaterThan(0);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-209 o dono, ao entrar, vê o aviso de suspensão com o motivo e desde quando",
    async () => {
      const resposta = await situacaoDoDono(loja.apelido, loja.dono.id);

      expect(resposta.status).toBe(200);
      expect(resposta.headers["cache-control"]).toContain("no-store");
      const situacao = esquemaDaSituacaoParaODono.parse(resposta.body);
      expect(situacao.status).toBe("INACTIVE");
      expect(situacao.suspensao?.motivo).toBe("Mensalidade em atraso");
      expect(Date.parse(situacao.suspensao?.desde ?? "")).not.toBeNaN();
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-209 o aviso é só do dono daquela loja: sem sessão é 401, e o dono de outra loja recebe 404",
    async () => {
      const semSessao = await request(api.app).get(
        `/v1/lojas/${loja.apelido}/situacao`,
      );
      expect(semSessao.status).toBe(401);

      const outra = await criarLoja({ nome: "Outra loja no ar" });
      const intruso = await situacaoDoDono(loja.apelido, outra.dono.id);
      expect(intruso.status).toBe(404);

      // A loja no ar também responde, sem aviso.
      const daOutra = await situacaoDoDono(outra.apelido, outra.dono.id);
      expect(esquemaDaSituacaoParaODono.parse(daOutra.body)).toEqual({
        status: "ACTIVE",
        suspensao: null,
        recusa: null,
        aguardandoAprovacao: false,
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-209 o cliente que já pediu continua acompanhando o pedido da loja suspensa (Q-203)",
    async () => {
      const resposta = await request(api.app).get(
        `/v1/vitrine/${loja.apelido}/pedido/${tokenDoPedido}`,
      );

      expect(resposta.status).toBe(200);
      const { pedido } = esquemaDoAcompanhamento.parse(resposta.body);
      expect(pedido.loja.nome).toBe("Pastel da Joi");
      expect(pedido.status).toBe("PENDING");
      // Token que não é desta loja continua não abrindo nada.
      const outro = await request(api.app).get(
        `/v1/vitrine/${loja.apelido}/pedido/${"x".repeat(tokenDoPedido.length)}`,
      );
      expect(outro.status).toBe(404);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-209 o dono não tira a suspensão sozinho: a rota é da administração e a coluna da situação não é dele no banco",
    async () => {
      const pelaRota = await request(api.app)
        .put(`/v1/admin/lojas/${loja.id}/reativacao`)
        .set(comoPapel(loja.dono.id, "OWNER"))
        .send({});
      expect(pelaRota.status).toBe(403);

      const pelaConexaoDasLojas = comoRequisicao(
        api.acessoDaAplicacao,
        { lojaId: loja.id, usuarioId: loja.dono.id, papel: "OWNER" },
        (tx) =>
          tx.$executeRaw`UPDATE app.stores SET status = 'ACTIVE' WHERE id = ${loja.id}::uuid`,
      );
      await expect(pelaConexaoDasLojas).rejects.toSatisfy(
        (erro: unknown) => codigoDoPostgres(erro) === RECUSA_DE_PERMISSAO,
      );
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// AC-210
// ---------------------------------------------------------------------------

describe("reativação devolve a loja ao ar como estava (AC-210)", () => {
  it(
    "@spec:AC-210 reativada, a vitrine volta com o mesmo catálogo e o período da suspensão fica no histórico",
    async () => {
      const { loja } = await lojaComCatalogoEPedido("Açaí da Praça");
      const catalogoAntes = await request(api.app).get(
        `/v1/vitrine/${loja.apelido}/catalogo`,
      );
      expect(catalogoAntes.status).toBe(200);
      const retratoAntes = await retratoDoCatalogo(migrador, loja.id);

      const suspensa = await suspender(loja.id, "Uso indevido em apuração");
      const desde = ficha(suspensa).suspensao?.desde;
      expect((await vitrine(loja.apelido)).status).toBe(404);

      const resposta = await reativar(loja.id);

      expect(resposta.status).toBe(200);
      const reativada = ficha(resposta);
      expect(reativada.status).toBe("ACTIVE");
      expect(reativada.suspensao).toBeNull();
      expect(reativada.historico[0]?.acao).toBe("LOJA_ATIVADA");
      const campos = Object.fromEntries(
        (reativada.historico[0]?.campos ?? []).map((campo) => [
          campo.campo,
          campo.depois,
        ]),
      );
      expect(campos).toMatchObject({
        status: "ACTIVE",
        suspensaDesde: desde,
        motivo: "Uso indevido em apuração",
      });
      expect(Date.parse(String(campos.suspensaAte))).toBeGreaterThanOrEqual(
        Date.parse(String(desde)),
      );

      // A vitrine atende de novo, com o catálogo de antes.
      expect((await vitrine(loja.apelido)).status).toBe(200);
      const catalogoDepois = await request(api.app).get(
        `/v1/vitrine/${loja.apelido}/catalogo`,
      );
      expect(catalogoDepois.status).toBe(200);
      expect(catalogoDepois.body).toEqual(catalogoAntes.body);
      expect(await retratoDoCatalogo(migrador, loja.id)).toEqual(retratoAntes);

      // E o dono, ao entrar, não vê mais aviso nenhum.
      const situacao = await situacaoDoDono(loja.apelido, loja.dono.id);
      expect(esquemaDaSituacaoParaODono.parse(situacao.body)).toEqual({
        status: "ACTIVE",
        suspensao: null,
        recusa: null,
        aguardandoAprovacao: false,
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-210 reativar a loja que já está no ar não grava nada no histórico",
    async () => {
      const loja = await criarLoja({ nome: "Bazar da Esquina" });

      const resposta = await reativar(loja.id);

      expect(resposta.status).toBe(200);
      expect(
        ficha(resposta).historico.filter(
          (registro) => registro.acao === "LOJA_ATIVADA",
        ),
      ).toEqual([]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// AC-211
// ---------------------------------------------------------------------------

describe("exclusão exige confirmação e é reversível por prazo (AC-211)", () => {
  it(
    "@spec:AC-211 sem o nome da loja digitado, nada é excluído",
    async () => {
      const loja = await criarLoja({ nome: "Lanches do Zé" });

      const diferente = await excluir(loja.id, "lanches do zé");
      expect(diferente.status).toBe(422);
      expect(diferente.body).toMatchObject({
        erro: "confirmacao_diferente",
        campos: [{ caminho: "confirmacao" }],
      });

      const semCorpo = await request(api.app)
        .delete(`/v1/admin/lojas/${loja.id}`)
        .set(comoAdministradora());
      expect(semCorpo.status).toBe(400);

      const { rows } = await migrador.query<{ status: string }>(
        `SELECT status FROM app.stores WHERE id = $1`,
        [loja.id],
      );
      expect(rows[0]?.status).toBe("ACTIVE");
      expect((await vitrine(loja.apelido)).status).toBe(200);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-211 confirmada pelo nome, a loja sai das listagens e do ar, os dados ficam retidos por 30 dias e a exclusão vai para o histórico",
    async () => {
      const { loja, pedido } = await lojaComCatalogoEPedido("Doceria Lua");
      const retratoAntes = await retratoDoCatalogo(migrador, loja.id);

      const resposta = await excluir(loja.id, "  Doceria   Lua ");

      expect(resposta.status).toBe(200);
      const excluida = ficha(resposta);
      expect(excluida.status).toBe("DELETED");
      const excluidaEm = Date.parse(excluida.retencao?.excluidaEm ?? "");
      const removerApos = Date.parse(excluida.retencao?.removerApos ?? "");
      expect(removerApos - excluidaEm).toBe(30 * UM_DIA_EM_MS);
      expect(excluida.historico[0]).toMatchObject({
        acao: "LOJA_EXCLUIDA",
        quem: { id: administradora.id },
      });

      // Sai das listagens...
      const lista = esquemaDaListaDeLojas.parse(
        (
          await request(api.app)
            .get("/v1/admin/lojas")
            .query({ busca: "Doceria Lua" })
            .set(comoAdministradora())
        ).body,
      );
      expect(lista.lojas).toEqual([]);
      // ...menos da consulta das excluídas, durante a retenção.
      const excluidas = esquemaDaListaDeLojas.parse(
        (
          await request(api.app)
            .get("/v1/admin/lojas")
            .query({ busca: "Doceria Lua", situacao: "DELETED" })
            .set(comoAdministradora())
        ).body,
      );
      expect(excluidas.lojas.map((item) => item.id)).toEqual([loja.id]);

      // Sai do ar por inteiro: vitrine, aviso do dono e acompanhamento.
      expect((await vitrine(loja.apelido)).status).toBe(404);
      expect((await situacaoDoDono(loja.apelido, loja.dono.id)).status).toBe(
        404,
      );
      expect(
        (
          await request(api.app).get(
            `/v1/vitrine/${loja.apelido}/pedido/${pedido.tokenPublico}`,
          )
        ).status,
      ).toBe(404);

      // E nada foi apagado ainda: é retenção.
      expect(await retratoDoCatalogo(migrador, loja.id)).toEqual(retratoAntes);
      expect(await contar("orders", loja.id)).toBe(1);
      expect(await contar("store_members", loja.id)).toBe(1);

      // Suspender a excluída não é caminho: ela volta pela restauração.
      expect((await suspender(loja.id, "qualquer")).status).toBe(409);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-211 dentro do prazo, a remoção definitiva não toca a loja e a restauração a devolve como estava",
    async () => {
      const { loja } = await lojaComCatalogoEPedido("Brechó Vintage");
      await suspender(loja.id, "Documentação pendente");
      await excluir(loja.id, "Brechó Vintage");
      const remover = criarRemocaoDefinitiva({
        acesso: api.acessoDaAdministracao,
        armazenamentoPrivado: api.armazenamentoPrivado,
      });

      await remover(new Date(Date.now() + 29 * UM_DIA_EM_MS));
      const { rows } = await migrador.query<{
        name: string;
        status: string;
      }>(`SELECT name, status FROM app.stores WHERE id = $1`, [loja.id]);
      expect(rows[0]).toEqual({ name: "Brechó Vintage", status: "DELETED" });
      expect(await contar("store_members", loja.id)).toBe(1);

      const resposta = await restaurar(loja.id);

      expect(resposta.status).toBe(200);
      const restaurada = ficha(resposta);
      // Estava suspensa quando foi excluída: volta suspensa.
      expect(restaurada.status).toBe("INACTIVE");
      expect(restaurada.retencao).toBeNull();
      expect(restaurada.suspensao?.motivo).toBe("Documentação pendente");
      expect(restaurada.historico[0]).toMatchObject({
        acao: "LOJA_RESTAURADA",
        campos: expect.arrayContaining([
          { campo: "status", antes: "DELETED", depois: "INACTIVE" },
        ]),
      });
      expect(
        esquemaDaSituacaoParaODono.parse(
          (await situacaoDoDono(loja.apelido, loja.dono.id)).body,
        ).status,
      ).toBe("INACTIVE");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-211 vencido o prazo, a remoção definitiva apaga o que identifica e dá acesso, guarda pedidos, contrato e trilha, e não há mais restauração",
    async () => {
      const lojaId = await lojaCadastrada(
        "Mercearia Sol",
        "mercearia-sol",
        "11.222.333/0001-81",
      );
      await migrador.query(
        `UPDATE app.store_settings SET payment = $2 WHERE store_id = $1`,
        [lojaId, JSON.stringify({ pix: { chave: "mercearia@pix.test" } })],
      );
      // Um apelido antigo (que redireciona) e dois documentos guardados.
      const trocado = await request(api.app)
        .put(`/v1/admin/lojas/${lojaId}/apelido`)
        .set(comoAdministradora())
        .send({ apelido: "mercearia-do-sol" });
      expect(trocado.status).toBe(200);
      const contrato = await request(api.app)
        .post(`/v1/admin/lojas/${lojaId}/documentos`)
        .query({ tipo: "CONTRATO" })
        .set(comoAdministradora())
        .set("content-type", "application/pdf")
        .set("x-nome-do-arquivo", "contrato.pdf")
        .send(Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n"));
      const identidade = await request(api.app)
        .post(`/v1/admin/lojas/${lojaId}/documentos`)
        .query({ tipo: "DOCUMENTO_DO_RESPONSAVEL" })
        .set(comoAdministradora())
        .set("content-type", "image/png")
        .set("x-nome-do-arquivo", "rg.png")
        .send(
          Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
          ]),
        );
      expect([contrato.status, identidade.status]).toEqual([201, 201]);
      const chaves = await migrador.query<{
        kind: string;
        storage_key: string;
      }>(
        `SELECT kind, storage_key FROM app.store_contracts WHERE store_id = $1`,
        [lojaId],
      );
      const chaveDoContrato = chaves.rows.find(
        (linha) => linha.kind === "CONTRACT",
      )?.storage_key;
      const chaveDaIdentidade = chaves.rows.find(
        (linha) => linha.kind === "ID_DOC",
      )?.storage_key;

      const excluida = await excluir(lojaId, "Mercearia Sol");
      expect(excluida.status).toBe(200);
      const trilhaAntes = await contar("audit_log", lojaId);

      const remover = criarRemocaoDefinitiva({
        acesso: api.acessoDaAdministracao,
        armazenamentoPrivado: api.armazenamentoPrivado,
      });
      const depoisDoPrazo = new Date(Date.now() + 31 * UM_DIA_EM_MS);
      expect(await remover(depoisDoPrazo)).toBeGreaterThanOrEqual(1);

      // O cadastro fica sem nada que identifique, e o apelido, livre.
      const { rows } = await migrador.query<Record<string, unknown>>(
        `SELECT name, legal_name, doc_number, email, phone1, street, number,
                complement, zip, slug, status, deleted_at IS NOT NULL AS excluida,
                purge_after
           FROM app.stores WHERE id = $1`,
        [lojaId],
      );
      const codigo = String(excluida.body.codigo);
      expect(rows[0]).toEqual({
        name: `Loja ${codigo} (removida)`,
        legal_name: null,
        doc_number: null,
        email: null,
        phone1: null,
        street: null,
        number: null,
        complement: null,
        zip: null,
        slug: `removida-${codigo.toLowerCase()}`,
        status: "DELETED",
        excluida: true,
        purge_after: null,
      });
      // Acesso, endereços e configuração saem.
      expect(await contar("store_members", lojaId)).toBe(0);
      const configuracao = await migrador.query<{ payment: unknown }>(
        `SELECT payment FROM app.store_settings WHERE store_id = $1`,
        [lojaId],
      );
      expect(configuracao.rows[0]?.payment).toEqual({});
      // O documento do responsável sai, do banco e do armazenamento; o
      // contrato assinado fica, como prova da relação.
      const restantes = await migrador.query<{ kind: string }>(
        `SELECT kind FROM app.store_contracts WHERE store_id = $1`,
        [lojaId],
      );
      expect(restantes.rows.map((linha) => linha.kind)).toEqual(["CONTRACT"]);
      expect(api.armazenamentoPrivado.chaves()).toContain(chaveDoContrato);
      expect(api.armazenamentoPrivado.chaves()).not.toContain(
        chaveDaIdentidade,
      );
      // A trilha só cresce: a remoção entra nela, sem pessoa.
      expect(await contar("audit_log", lojaId)).toBe(trilhaAntes + 1);
      const fichaRemovida = ficha(
        await request(api.app)
          .get(`/v1/admin/lojas/${lojaId}`)
          .set(comoAdministradora()),
      );
      expect(fichaRemovida.historico[0]).toMatchObject({
        acao: "LOJA_REMOVIDA",
        quem: null,
        papel: "SYSTEM",
      });
      expect(fichaRemovida.retencao?.removerApos).toBeNull();
      // O apelido antigo já pode ser de outra loja.
      expect(
        (
          await lojaCadastrada(
            "Mercearia Nova",
            "mercearia-sol",
            "529.982.247-25",
          )
        ).length,
      ).toBeGreaterThan(0);

      // Não há mais restauração, nem com o relógio no prazo vencido.
      relogio = depoisDoPrazo;
      try {
        const tarde = await restaurar(lojaId);
        expect(tarde.status).toBe(409);
        expect(tarde.body.erro).toBe("prazo_vencido");
      } finally {
        relogio = null;
      }
      // E rodar de novo não remove nada outra vez.
      expect(await remover(depoisDoPrazo)).toBe(0);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-211 os pedidos ficam depois da remoção definitiva: guarda fiscal",
    async () => {
      const { loja } = await lojaComCatalogoEPedido("Hortifruti Bom Preço");
      await excluir(loja.id, "Hortifruti Bom Preço");
      const remover = criarRemocaoDefinitiva({
        acesso: api.acessoDaAdministracao,
        armazenamentoPrivado: api.armazenamentoPrivado,
      });

      await remover(new Date(Date.now() + 31 * UM_DIA_EM_MS));

      expect(await contar("orders", loja.id)).toBe(1);
      expect(await contar("order_items", loja.id)).toBeGreaterThan(0);
      expect(await contar("store_members", loja.id)).toBe(0);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
