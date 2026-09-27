/**
 * Prova da fila de pedidos do dono pela API, contra PostgreSQL de verdade
 * (AC-600, AC-601, AC-602, AC-609, P-003).
 *
 * A tela prova que mostra o que recebe. Esta prova mostra o que ela RECEBE: que
 * o pedido criado pelo fechamento está na fila na leitura seguinte, que a fila
 * é a inteira (e por isso a reconexão não perde nada), e que ela nunca traz
 * pedido de outra loja — mesmo que alguém peça pelo identificador direto.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
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
  tokenDeAcesso,
} from "./apoio-de-pedidos.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { lerFilaDaLoja } from "../src/modules/orders/fila.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof aplicacaoDaOperacao>;
let loja: LojaDeTeste;
let vizinha: LojaDeTeste;
let dono: MembroDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = aplicacaoDaOperacao(acesso);
  loja = await criarLoja({ nome: "Açaí da Praça" });
  vizinha = await criarLoja({ nome: "Lanches do Vizinho" });
  dono = await criarMembro({ loja });
}, ESPERA_DA_OPERACAO);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DA_OPERACAO);

function lerFila(alvo: LojaDeTeste = loja) {
  return request(app)
    .get(`/v1/lojas/${alvo.apelido}/pedidos`)
    .set(
      "Authorization",
      comoPortador(tokenDeAcesso(dono.identidade.id, "OWNER")),
    );
}

function idsDa(resposta: request.Response): string[] {
  return (resposta.body.pedidos as { id: string }[]).map((p) => p.id);
}

async function marcarStatus(pedidoId: string, status: string): Promise<void> {
  await migrador.query(`UPDATE app.orders SET status = $2 WHERE id = $1`, [
    pedidoId,
    status,
  ]);
}

describe("pedido novo chega à fila (AC-600)", () => {
  it(
    "@spec:AC-600 o pedido feito pelo cliente está na fila na leitura seguinte, aguardando confirmação",
    async () => {
      const antes = await lerFila();
      expect(antes.status).toBe(200);

      const pedido = await fazerPedido(acesso, loja);
      const depois = await lerFila();

      expect(depois.status).toBe(200);
      expect(idsDa(depois)).toEqual([...idsDa(antes), pedido.id]);
      const naFila = depois.body.pedidos.find(
        (p: { id: string }) => p.id === pedido.id,
      );
      expect(naFila.status).toBe("PENDING");
      // Fila é estado do momento: em cache, a tela mostraria o passado.
      expect(depois.headers["cache-control"]).toContain("no-store");
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-600 sem sessão de dono a fila não responde",
    async () => {
      const semSessao = await request(app).get(
        `/v1/lojas/${loja.apelido}/pedidos`,
      );
      const comoCliente = await request(app)
        .get(`/v1/lojas/${loja.apelido}/pedidos`)
        .set(
          "Authorization",
          comoPortador(tokenDeAcesso(dono.identidade.id, "CUSTOMER")),
        );

      expect(semSessao.status).toBe(401);
      expect(comoCliente.status).toBe(401);
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("a fila traz o que o dono precisa ver (AC-601)", () => {
  it(
    "@spec:AC-601 cada pedido vem com número, horário, cliente, valor, canal e forma de entrega",
    async () => {
      const pedido = await fazerPedido(acesso, loja, { entrega: "PICKUP" });
      // O pedido lançado no balcão (T-704) nasce pelo dono; aqui o canal é
      // trocado por fora só para provar que a fila o diz.
      await migrador.query(
        `UPDATE app.orders SET channel = 'MANUAL' WHERE id = $1`,
        [pedido.id],
      );

      const resposta = await lerFila();
      const naFila = resposta.body.pedidos.find(
        (p: { id: string }) => p.id === pedido.id,
      );

      expect(naFila).toEqual({
        id: pedido.id,
        numero: pedido.numero,
        codigo: pedido.codigo,
        status: "PENDING",
        canal: "MANUAL",
        entrega: "PICKUP",
        cliente: "Maria Conceição",
        totalCentavos: 4000,
        criadoEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        aguardandoConfirmacaoWhatsapp: false,
      });
      // A fila fica aberta no balcão: telefone e endereço não viajam nela.
      expect(JSON.stringify(resposta.body)).not.toContain("988887777");
      expect(JSON.stringify(resposta.body)).not.toContain("Rua das Flores");
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-601 concluído e cancelado saem da fila; o mais antigo vem primeiro",
    async () => {
      const alvo = await criarLoja({ nome: "Pastelaria Ordem" });
      const donoDoAlvo = await criarMembro({ loja: alvo });
      const primeiro = await fazerPedido(acesso, alvo);
      const segundo = await fazerPedido(acesso, alvo);
      const concluido = await fazerPedido(acesso, alvo);
      const cancelado = await fazerPedido(acesso, alvo);
      await marcarStatus(segundo.id, "PREPARING");
      await marcarStatus(concluido.id, "COMPLETED");
      await marcarStatus(cancelado.id, "CANCELLED");

      const resposta = await request(app)
        .get(`/v1/lojas/${alvo.apelido}/pedidos`)
        .set(
          "Authorization",
          comoPortador(tokenDeAcesso(donoDoAlvo.identidade.id, "OWNER")),
        );

      expect(idsDa(resposta)).toEqual([primeiro.id, segundo.id]);
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("reconexão não perde pedido (AC-602)", () => {
  it(
    "@spec:AC-602 a leitura depois da queda é a fila inteira, com todos os que entraram no intervalo",
    async () => {
      const alvo = await criarLoja({ nome: "Sorveteria Sem Sinal" });
      const donoDoAlvo = await criarMembro({ loja: alvo });
      const ler = () =>
        request(app)
          .get(`/v1/lojas/${alvo.apelido}/pedidos`)
          .set(
            "Authorization",
            comoPortador(tokenDeAcesso(donoDoAlvo.identidade.id, "OWNER")),
          );

      const antesDaQueda = await ler();
      // A internet da loja caiu: três pedidos entram, um deles já aceito por
      // outro aparelho. Nenhuma leitura acontece nesse intervalo.
      const a = await fazerPedido(acesso, alvo);
      const b = await fazerPedido(acesso, alvo);
      const c = await fazerPedido(acesso, alvo);
      await marcarStatus(a.id, "ACCEPTED");

      const depois = await ler();

      expect(idsDa(antesDaQueda)).toEqual([]);
      expect(idsDa(depois)).toEqual([a.id, b.id, c.id]);
      expect(depois.body.pedidos[0].status).toBe("ACCEPTED");
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("pedido sem confirmação no WhatsApp vem marcado (AC-609)", () => {
  it(
    "@spec:AC-609 o pedido que abriu o WhatsApp e não confirmou chega marcado na fila",
    async () => {
      const aberto = await fazerPedido(acesso, loja);
      const confirmado = await fazerPedido(acesso, loja);
      await migrador.query(
        `UPDATE app.orders SET whatsapp_clicked_at = now() WHERE id = ANY($1)`,
        [[aberto.id, confirmado.id]],
      );
      await migrador.query(
        `UPDATE app.orders SET whatsapp_confirmed_at = now() WHERE id = $1`,
        [confirmado.id],
      );

      const resposta = await lerFila();
      const marca = (id: string) =>
        resposta.body.pedidos.find((p: { id: string }) => p.id === id)
          .aguardandoConfirmacaoWhatsapp;

      expect(marca(aberto.id)).toBe(true);
      expect(marca(confirmado.id)).toBe(false);
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("a fila de uma loja nunca mostra a de outra (P-003)", () => {
  it(
    "@principle:P-003 a leitura no contexto de uma loja não traz pedido da vizinha",
    async () => {
      const daVizinha = await fazerPedido(acesso, vizinha);
      const daLoja = await fazerPedido(acesso, loja);

      const fila = await comoRequisicao(
        acesso,
        { lojaId: loja.id, usuarioId: dono.identidade.id, papel: "OWNER" },
        () => lerFilaDaLoja(),
      );

      const ids = fila.map((p) => p.id);
      expect(ids).toContain(daLoja.id);
      expect(ids).not.toContain(daVizinha.id);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@principle:P-003 o pedido da vizinha pedido pelo identificador direto responde que não existe",
    async () => {
      const daVizinha = await fazerPedido(acesso, vizinha);

      const resposta = await request(app)
        .get(`/v1/lojas/${loja.apelido}/pedidos/${daVizinha.id}`)
        .set(
          "Authorization",
          comoPortador(tokenDeAcesso(dono.identidade.id, "OWNER")),
        );

      expect(resposta.status).toBe(404);
      expect(JSON.stringify(resposta.body)).not.toContain(daVizinha.codigo);
    },
    ESPERA_DA_OPERACAO,
  );
});
