/**
 * Prova da confirmação do pedido pelo WhatsApp, contra PostgreSQL de verdade
 * (AC-609, AC-610, AC-611, P-003).
 *
 * São dois fatos diferentes, e o banco os guarda separados: o cliente ABRIU a
 * conversa, e o cliente disse que ENVIOU. O pedido que só abriu é o candidato a
 * fantasma — a fila o mostra à parte e o faturamento não o conta. A prova passa
 * pelo caminho de verdade: as mesmas rotas públicas que a página chama, com o
 * token do link, e a fila do dono lida pela API.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resumirVendas } from "@simpleclick/core";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
  criarMembro,
} from "@simpleclick/testing";
import type { LojaDeTeste, MembroDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import {
  aplicacaoDaOperacao,
  comoPortador,
  ESPERA_DA_OPERACAO,
  fazerPedido,
  ORIGEM_DO_PAINEL,
  tokenDeAcesso,
} from "./apoio-de-pedidos.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

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
  loja = await criarLoja({ nome: "Pizzaria do Largo" });
  vizinha = await criarLoja({ nome: "Pizzaria da Esquina" });
  dono = await criarMembro({ loja });
}, ESPERA_DA_OPERACAO);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DA_OPERACAO);

function sinalizar(
  token: string,
  acao: "whatsapp-clique" | "whatsapp-confirmado",
  alvo: LojaDeTeste = loja,
) {
  return request(app)
    .post(`/v1/vitrine/${alvo.apelido}/pedidos/${token}/${acao}`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .send({});
}

async function naFila(pedidoId: string) {
  const resposta = await request(app)
    .get(`/v1/lojas/${loja.apelido}/pedidos`)
    .set(
      "Authorization",
      comoPortador(tokenDeAcesso(dono.identidade.id, "OWNER")),
    );
  return (
    resposta.body.pedidos as {
      id: string;
      status: string;
      totalCentavos: number;
      aguardandoConfirmacaoWhatsapp: boolean;
    }[]
  ).find((p) => p.id === pedidoId);
}

async function instantes(pedidoId: string) {
  const resultado = await migrador.query<{
    whatsapp_clicked_at: Date | null;
    whatsapp_confirmed_at: Date | null;
  }>(
    `SELECT whatsapp_clicked_at, whatsapp_confirmed_at
       FROM app.orders WHERE id = $1`,
    [pedidoId],
  );
  const linha = resultado.rows[0];
  if (linha === undefined) throw new Error(`pedido ${pedidoId} sumiu`);
  return linha;
}

describe("pedido que abriu o WhatsApp e não enviou (AC-609)", () => {
  it(
    "@spec:AC-609 abrir a conversa marca o pedido como aguardando confirmação na fila do dono",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      expect((await naFila(pedido.id))?.aguardandoConfirmacaoWhatsapp).toBe(
        false,
      );

      const resposta = await sinalizar(pedido.tokenPublico, "whatsapp-clique");

      expect(resposta.status).toBe(200);
      expect(resposta.body.aguardandoConfirmacaoWhatsapp).toBe(true);
      expect((await naFila(pedido.id))?.aguardandoConfirmacaoWhatsapp).toBe(
        true,
      );
      const guardado = await instantes(pedido.id);
      expect(guardado.whatsapp_clicked_at).not.toBeNull();
      expect(guardado.whatsapp_confirmed_at).toBeNull();
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-609 abrir a conversa não mexe em status, total nem itens",
    async () => {
      const pedido = await fazerPedido(acesso, loja);

      await sinalizar(pedido.tokenPublico, "whatsapp-clique");

      const lido = await naFila(pedido.id);
      expect(lido?.status).toBe("PENDING");
      expect(lido?.totalCentavos).toBe(4_800);
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("o cliente sinaliza que já enviou (AC-610)", () => {
  it(
    "@spec:AC-610 o 'já enviei' tira o pedido do aguardando e registra o horário da sinalização",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      await sinalizar(pedido.tokenPublico, "whatsapp-clique");

      const antes = Date.now();
      const resposta = await sinalizar(
        pedido.tokenPublico,
        "whatsapp-confirmado",
      );

      expect(resposta.status).toBe(200);
      expect(resposta.body.aguardandoConfirmacaoWhatsapp).toBe(false);
      expect(Date.parse(resposta.body.whatsappConfirmedAt)).toBeGreaterThan(
        antes - 60_000,
      );
      expect((await naFila(pedido.id))?.aguardandoConfirmacaoWhatsapp).toBe(
        false,
      );
      const guardado = await instantes(pedido.id);
      expect(guardado.whatsapp_confirmed_at?.toISOString()).toBe(
        resposta.body.whatsappConfirmedAt,
      );
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-610 sinalizar de novo não apaga nem adianta o horário da primeira sinalização",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      await sinalizar(pedido.tokenPublico, "whatsapp-clique");
      const primeira = await sinalizar(
        pedido.tokenPublico,
        "whatsapp-confirmado",
      );

      await sinalizar(pedido.tokenPublico, "whatsapp-confirmado");
      await sinalizar(pedido.tokenPublico, "whatsapp-clique");

      const guardado = await instantes(pedido.id);
      expect(guardado.whatsapp_confirmed_at?.toISOString()).toBe(
        primeira.body.whatsappConfirmedAt,
      );
      expect(guardado.whatsapp_clicked_at?.toISOString()).toBe(
        primeira.body.whatsappClickedAt,
      );
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-610 a página de acompanhamento passa a mostrar a confirmação",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      await sinalizar(pedido.tokenPublico, "whatsapp-clique");
      const antes = await request(app).get(
        `/v1/vitrine/${loja.apelido}/pedido/${pedido.tokenPublico}`,
      );

      await sinalizar(pedido.tokenPublico, "whatsapp-confirmado");
      const depois = await request(app).get(
        `/v1/vitrine/${loja.apelido}/pedido/${pedido.tokenPublico}`,
      );

      expect(antes.body.pedido.whatsappConfirmadoEm).toBeNull();
      expect(depois.body.pedido.whatsappConfirmadoEm).toEqual(
        expect.any(String),
      );
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("pedido fantasma fora do faturamento (AC-611)", () => {
  it(
    "@spec:AC-611 o que só abriu o WhatsApp aparece à parte e não soma no faturamento",
    async () => {
      const alvo = await criarLoja({ nome: "Açaí do Fantasma" });
      const donoDoAlvo = await criarMembro({ loja: alvo });
      const ler = () =>
        request(app)
          .get(`/v1/lojas/${alvo.apelido}/pedidos`)
          .set(
            "Authorization",
            comoPortador(tokenDeAcesso(donoDoAlvo.identidade.id, "OWNER")),
          );

      const confirmado = await fazerPedido(acesso, alvo);
      const fantasma = await fazerPedido(acesso, alvo);
      await sinalizar(confirmado.tokenPublico, "whatsapp-clique", alvo);
      await sinalizar(confirmado.tokenPublico, "whatsapp-confirmado", alvo);
      await sinalizar(fantasma.tokenPublico, "whatsapp-clique", alvo);
      const aceitar = await request(app)
        .patch(`/v1/lojas/${alvo.apelido}/pedidos/${confirmado.id}/status`)
        .set("Origin", ORIGEM_DO_PAINEL)
        .set(
          "Authorization",
          comoPortador(tokenDeAcesso(donoDoAlvo.identidade.id, "OWNER")),
        )
        .send({ status: "ACCEPTED" });
      expect(aceitar.status).toBe(200);

      const fila = await ler();
      const resumo = resumirVendas(fila.body.pedidos);

      expect(resumo.faturamentoCentavos).toBe(4_800);
      expect(resumo.vendas.quantidade).toBe(1);
      expect(resumo.naoConfirmados).toEqual({
        quantidade: 1,
        totalCentavos: 4_800,
      });
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("o link só alcança o próprio pedido (P-003)", () => {
  it(
    "@principle:P-003 o token de um pedido, usado no endereço de outra loja, não encontra nada e não muda nada",
    async () => {
      const pedido = await fazerPedido(acesso, loja);

      const resposta = await sinalizar(
        pedido.tokenPublico,
        "whatsapp-confirmado",
        vizinha,
      );

      expect(resposta.status).toBe(404);
      const guardado = await instantes(pedido.id);
      expect(guardado.whatsapp_confirmed_at).toBeNull();
      expect(guardado.whatsapp_clicked_at).toBeNull();
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@principle:P-003 token inventado responde que não encontrou, sem tocar em pedido nenhum",
    async () => {
      const pedido = await fazerPedido(acesso, loja);

      const resposta = await sinalizar(
        `${pedido.tokenPublico.slice(0, -1)}${pedido.tokenPublico.endsWith("A") ? "B" : "A"}`,
        "whatsapp-confirmado",
      );

      expect(resposta.status).toBe(404);
      expect((await instantes(pedido.id)).whatsapp_confirmed_at).toBeNull();
    },
    ESPERA_DA_OPERACAO,
  );
});
