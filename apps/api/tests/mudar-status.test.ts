/**
 * Prova da máquina de status pela API, contra PostgreSQL de verdade
 * (AC-604, AC-605, AC-606, AC-607, AC-608, P-003).
 *
 * A regra de transição já é provada em `packages/core`. O que só esta prova
 * mostra é a costura inteira: o dono muda pelo endereço da API, a mudança e a
 * linha do tempo são gravadas juntas com quem e quando, o cliente vê o passo
 * novo pelo link público, e o histórico não aceita ser reescrito — nem pelo
 * dono, nem pela administração.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  comoAdministracao,
  conectarNoBancoDoArquivo,
  criarLoja,
  criarMembro,
} from "@simpleclick/testing";
import type { LojaDeTeste, MembroDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
} from "./apoio-de-isolamento.ts";
import {
  aplicacaoDaOperacao,
  comoPortador,
  ESPERA_DA_OPERACAO,
  fazerPedido,
  ORIGEM_DO_PAINEL,
  tokenDeAcesso,
} from "./apoio-de-pedidos.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  mudarStatusDoPedido,
  PedidoNaoEncontrado,
} from "../src/modules/orders/mudar-status.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof aplicacaoDaOperacao>;
let loja: LojaDeTeste;
let dono: MembroDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 6 });
  app = aplicacaoDaOperacao(acesso);
  loja = await criarLoja({ nome: "Açaí do Porto" });
  dono = await criarMembro({ loja });
}, ESPERA_DA_OPERACAO);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DA_OPERACAO);

function autorizacao(): string {
  return comoPortador(tokenDeAcesso(dono.identidade.id, "OWNER"));
}

function mudar(pedidoId: string, status: string, motivo?: string | null) {
  return request(app)
    .patch(`/v1/lojas/${loja.apelido}/pedidos/${pedidoId}/status`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Authorization", autorizacao())
    .send(motivo === undefined ? { status } : { status, motivo });
}

function detalhe(pedidoId: string) {
  return request(app)
    .get(`/v1/lojas/${loja.apelido}/pedidos/${pedidoId}`)
    .set("Authorization", autorizacao());
}

function acompanhar(token: string) {
  return request(app).get(`/v1/vitrine/${loja.apelido}/pedido/${token}`);
}

interface PassoGuardado {
  readonly id: string;
  readonly from_status: string | null;
  readonly to_status: string;
  readonly changed_by_identity_id: string | null;
  readonly actor_role: string | null;
  readonly reason: string | null;
  readonly occurred_at: Date;
}

async function passos(pedidoId: string): Promise<PassoGuardado[]> {
  const resultado = await migrador.query<PassoGuardado>(
    `SELECT id, from_status, to_status, changed_by_identity_id, actor_role,
            reason, occurred_at
       FROM app.order_status_history
      WHERE order_id = $1
      ORDER BY occurred_at, created_at`,
    [pedidoId],
  );
  return resultado.rows;
}

async function statusGuardado(pedidoId: string): Promise<string> {
  const resultado = await migrador.query<{ status: string }>(
    `SELECT status FROM app.orders WHERE id = $1`,
    [pedidoId],
  );
  return resultado.rows[0]?.status ?? "(sem pedido)";
}

describe("o caminho normal do pedido (AC-604)", () => {
  it(
    "@spec:AC-604 aceitar, preparar, sair para entrega e concluir, cada passo com horário e quem fez",
    async () => {
      const pedido = await fazerPedido(acesso, loja, { entrega: "DELIVERY" });

      for (const status of [
        "ACCEPTED",
        "PREPARING",
        "OUT_FOR_DELIVERY",
        "COMPLETED",
      ]) {
        const resposta = await mudar(pedido.id, status);
        expect(resposta.status, `mudar para ${status}`).toBe(200);
        expect(resposta.body.status).toBe(status);
      }

      expect(await statusGuardado(pedido.id)).toBe("COMPLETED");
      const linha = await passos(pedido.id);
      expect(linha.map((p) => [p.from_status, p.to_status])).toEqual([
        [null, "PENDING"],
        ["PENDING", "ACCEPTED"],
        ["ACCEPTED", "PREPARING"],
        ["PREPARING", "OUT_FOR_DELIVERY"],
        ["OUT_FOR_DELIVERY", "COMPLETED"],
      ]);
      for (const passo of linha.slice(1)) {
        expect(passo.changed_by_identity_id).toBe(dono.identidade.id);
        expect(passo.actor_role).toBe("OWNER");
        expect(passo.occurred_at).toBeInstanceOf(Date);
      }

      const datas = await migrador.query<{
        accepted_at: Date | null;
        completed_at: Date | null;
      }>(`SELECT accepted_at, completed_at FROM app.orders WHERE id = $1`, [
        pedido.id,
      ]);
      expect(datas.rows[0]?.accepted_at).not.toBeNull();
      expect(datas.rows[0]?.completed_at).not.toBeNull();
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-604 o cliente vê cada mudança pela página de acompanhamento",
    async () => {
      const pedido = await fazerPedido(acesso, loja);

      await mudar(pedido.id, "ACCEPTED");
      const depoisDeAceito = await acompanhar(pedido.tokenPublico);
      await mudar(pedido.id, "PREPARING");
      const emPreparo = await acompanhar(pedido.tokenPublico);

      expect(depoisDeAceito.status).toBe(200);
      expect(depoisDeAceito.body.pedido.status).toBe("ACCEPTED");
      expect(emPreparo.body.pedido.status).toBe("PREPARING");
      expect(
        emPreparo.body.pedido.historico.map((p: { para: string }) => p.para),
      ).toEqual(["PENDING", "ACCEPTED", "PREPARING"]);
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("retirada não passa por entrega (AC-605)", () => {
  it(
    "@spec:AC-605 em preparo, o pedido de retirada oferece pronto para retirada e nunca saiu para entrega",
    async () => {
      const pedido = await fazerPedido(acesso, loja, { entrega: "PICKUP" });
      await mudar(pedido.id, "ACCEPTED");
      await mudar(pedido.id, "PREPARING");

      const aberto = await detalhe(pedido.id);
      const oferecidos = aberto.body.pedido.proximosStatus.map(
        (opcao: { status: string }) => opcao.status,
      );
      expect(oferecidos).toEqual(["READY_FOR_PICKUP", "CANCELLED"]);

      const pelaPortaDosFundos = await mudar(pedido.id, "OUT_FOR_DELIVERY");
      expect(pelaPortaDosFundos.status).toBe(409);
      expect(await statusGuardado(pedido.id)).toBe("PREPARING");

      expect((await mudar(pedido.id, "READY_FOR_PICKUP")).status).toBe(200);
      expect((await mudar(pedido.id, "COMPLETED")).status).toBe(200);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-605 o pedido de entrega, em preparo, oferece saiu para entrega",
    async () => {
      const pedido = await fazerPedido(acesso, loja, { entrega: "DELIVERY" });
      await mudar(pedido.id, "ACCEPTED");
      await mudar(pedido.id, "PREPARING");

      const aberto = await detalhe(pedido.id);

      expect(
        aberto.body.pedido.proximosStatus.map(
          (opcao: { status: string }) => opcao.status,
        ),
      ).toEqual(["OUT_FOR_DELIVERY", "CANCELLED"]);
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("caminho que não existe é recusado (AC-606)", () => {
  it(
    "@spec:AC-606 voltar um pedido concluído para em preparo é recusado com explicação, e o status fica concluído",
    async () => {
      const pedido = await fazerPedido(acesso, loja, { entrega: "PICKUP" });
      for (const status of [
        "ACCEPTED",
        "PREPARING",
        "READY_FOR_PICKUP",
        "COMPLETED",
      ]) {
        await mudar(pedido.id, status);
      }
      const antes = await passos(pedido.id);

      const resposta = await mudar(pedido.id, "PREPARING");

      expect(resposta.status).toBe(409);
      expect(resposta.body).toEqual({
        erro: "transicao_invalida",
        explicacao: "Não é possível mudar de Concluído para Em preparo.",
      });
      expect(await statusGuardado(pedido.id)).toBe("COMPLETED");
      expect(await passos(pedido.id)).toHaveLength(antes.length);
      expect((await detalhe(pedido.id)).body.pedido.proximosStatus).toEqual([]);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-606 status inventado é recusado, e o pedido não muda",
    async () => {
      const pedido = await fazerPedido(acesso, loja);

      const resposta = await mudar(pedido.id, "ENTREGUE_AO_VIZINHO");

      expect(resposta.status).toBe(409);
      expect(resposta.body.explicacao).toBe("Este status não existe.");
      expect(await statusGuardado(pedido.id)).toBe("PENDING");
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("recusar e cancelar exigem motivo e avisam o cliente (AC-607)", () => {
  it(
    "@spec:AC-607 recusar sem motivo é recusado, e o pedido continua aguardando",
    async () => {
      const pedido = await fazerPedido(acesso, loja);

      const semMotivo = await mudar(pedido.id, "CANCELLED");
      const motivoEmBranco = await mudar(pedido.id, "CANCELLED", "   ");

      expect(semMotivo.status).toBe(409);
      expect(semMotivo.body.explicacao).toBe(
        "Informe o motivo para recusar ou cancelar o pedido.",
      );
      expect(motivoEmBranco.status).toBe(409);
      expect(await statusGuardado(pedido.id)).toBe("PENDING");
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-607 o motivo fica no pedido e o cliente vê que foi cancelado e por quê",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      await mudar(pedido.id, "ACCEPTED");

      const resposta = await mudar(pedido.id, "CANCELLED", "Acabou o açaí");

      expect(resposta.status).toBe(200);
      const guardado = await migrador.query<{
        status: string;
        cancel_reason: string | null;
        cancelled_at: Date | null;
      }>(
        `SELECT status, cancel_reason, cancelled_at FROM app.orders WHERE id = $1`,
        [pedido.id],
      );
      expect(guardado.rows[0]).toMatchObject({
        status: "CANCELLED",
        cancel_reason: "Acabou o açaí",
      });
      expect(guardado.rows[0]?.cancelled_at).not.toBeNull();

      const publico = await acompanhar(pedido.tokenPublico);
      expect(publico.body.pedido.status).toBe("CANCELLED");
      const ultimo = publico.body.pedido.historico.at(-1);
      expect(ultimo).toMatchObject({
        para: "CANCELLED",
        motivo: "Acabou o açaí",
      });
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("a linha do tempo é completa e imutável (AC-608)", () => {
  it(
    "@spec:AC-608 o detalhe mostra cada passo, o horário exato e quem fez",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      await mudar(pedido.id, "ACCEPTED");
      await mudar(pedido.id, "CANCELLED", "Cliente desistiu");

      const aberto = await detalhe(pedido.id);

      const linha = aberto.body.pedido.historico as {
        para: string;
        papel: string | null;
        motivo: string | null;
        ocorridoEm: string;
      }[];
      expect(linha.map((p) => p.para)).toEqual([
        "PENDING",
        "ACCEPTED",
        "CANCELLED",
      ]);
      expect(linha.map((p) => p.papel)).toEqual(["CUSTOMER", "OWNER", "OWNER"]);
      expect(linha[2]?.motivo).toBe("Cliente desistiu");
      for (const passo of linha) {
        // Instante completo, com segundos e milissegundos — não um resumo.
        expect(passo.ocorridoEm).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        );
      }
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-608 nem o dono da loja consegue alterar ou apagar um passo já registrado",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      await mudar(pedido.id, "ACCEPTED");
      const antes = await passos(pedido.id);
      const primeiro = antes[0];
      // Sem alvo, "zero linhas" seria acaso, e não recusa.
      if (primeiro === undefined) throw new Error("o pedido nasceu sem passo");

      const comoDono = {
        lojaId: loja.id,
        usuarioId: dono.identidade.id,
        papel: "OWNER" as const,
      };
      const alteradas = await comoRequisicao(acesso, comoDono, (tx) =>
        tx.orderStatusEntry.updateMany({
          where: { id: primeiro.id },
          data: { toStatus: "COMPLETED", reason: "reescrito" },
        }),
      );
      const apagadas = await comoRequisicao(acesso, comoDono, (tx) =>
        tx.orderStatusEntry.deleteMany({ where: { orderId: pedido.id } }),
      );

      // O dono ENXERGA a linha (a leitura é dele), mas não há política de
      // alteração nem de remoção no histórico: o banco não entrega a linha a
      // nenhum dos dois comandos, e nada muda.
      const visiveis = await comoRequisicao(acesso, comoDono, (tx) =>
        tx.orderStatusEntry.count({ where: { orderId: pedido.id } }),
      );
      expect(visiveis).toBe(antes.length);
      expect(alteradas.count).toBe(0);
      expect(apagadas.count).toBe(0);
      expect(await passos(pedido.id)).toEqual(antes);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-608 nem a administração da plataforma reescreve o histórico",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      const antes = await passos(pedido.id);
      const primeiro = antes[0];
      if (primeiro === undefined) throw new Error("o pedido nasceu sem passo");

      // A administração lê todas as lojas — e só lê: enxergar não é licença
      // para reescrever o passado de um pedido (guarda G8).
      const vistos = await comoAdministracao((tx) =>
        tx.query(`SELECT id FROM app.order_status_history WHERE id = $1`, [
          primeiro.id,
        ]),
      );
      const alterados = await comoAdministracao((tx) =>
        tx.query(
          `UPDATE app.order_status_history SET reason = 'reescrito' WHERE id = $1`,
          [primeiro.id],
        ),
      );
      const apagados = await comoAdministracao((tx) =>
        tx.query(`DELETE FROM app.order_status_history WHERE id = $1`, [
          primeiro.id,
        ]),
      );

      expect(vistos.rowCount).toBe(1);
      expect(alterados.rowCount).toBe(0);
      expect(apagados.rowCount).toBe(0);
      expect(await passos(pedido.id)).toEqual(antes);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-608 dois aparelhos aceitando o mesmo pedido ao mesmo tempo geram UM passo só",
    async () => {
      const pedido = await fazerPedido(acesso, loja);

      const respostas = await Promise.all([
        mudar(pedido.id, "ACCEPTED"),
        mudar(pedido.id, "ACCEPTED"),
        mudar(pedido.id, "ACCEPTED"),
      ]);

      const status = respostas.map((r) => r.status).sort();
      expect(status).toEqual([200, 409, 409]);
      const aceites = (await passos(pedido.id)).filter(
        (p) => p.to_status === "ACCEPTED",
      );
      expect(aceites).toHaveLength(1);
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("uma loja não muda pedido de outra (P-003)", () => {
  it(
    "@principle:P-003 no contexto da vizinha, o pedido desta loja não existe e não muda",
    async () => {
      const vizinha = await criarLoja({ nome: "Lanchonete Vizinha" });
      const donoDaVizinha = await criarMembro({ loja: vizinha });
      const pedido = await fazerPedido(acesso, loja);

      const falha = await comoRequisicao(
        acesso,
        {
          lojaId: vizinha.id,
          usuarioId: donoDaVizinha.identidade.id,
          papel: "OWNER",
        },
        () => mudarStatusDoPedido(pedido.id, "ACCEPTED"),
      ).then(
        () => null,
        (erro: unknown) => erro,
      );

      expect(falha).toBeInstanceOf(PedidoNaoEncontrado);
      expect(await statusGuardado(pedido.id)).toBe("PENDING");
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@principle:P-003 identificador que não é de pedido responde que não existe, sem erro interno",
    async () => {
      const resposta = await mudar("nao-e-um-identificador", "ACCEPTED");
      const lido = await detalhe("nao-e-um-identificador");

      expect(resposta.status).toBe(404);
      expect(lido.status).toBe(404);
    },
    ESPERA_DA_OPERACAO,
  );
});
