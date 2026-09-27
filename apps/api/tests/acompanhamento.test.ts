/**
 * Prova da leitura pública do pedido pelo link, contra PostgreSQL de verdade
 * (AC-612, AC-613, AC-615).
 *
 * O link vai por WhatsApp e abre sem login. Quem o tem vê o pedido — e SÓ o
 * necessário para acompanhá-lo. O contrato público é fechado (campo a mais
 * reprova), e esta prova lê a resposta crua procurando o que não pode estar lá:
 * telefone inteiro, endereço, identificadores internos, chave PIX, anotação da
 * loja.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDoAcompanhamento } from "@simpleclick/contracts";
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
let dono: MembroDeTeste;

const WHATSAPP_DA_LOJA = "+5511911112222";

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = aplicacaoDaOperacao(acesso);
  loja = await criarLoja({ nome: "Açaí da Praça" });
  dono = await criarMembro({ loja });
  await migrador.query(
    `UPDATE app.store_settings SET whatsapp = $2 WHERE store_id = $1`,
    [loja.id, JSON.stringify({ numero: WHATSAPP_DA_LOJA, publico: true })],
  );
}, ESPERA_DA_OPERACAO);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DA_OPERACAO);

function acompanhar(token: string, alvo: LojaDeTeste = loja) {
  return request(app).get(`/v1/vitrine/${alvo.apelido}/pedido/${token}`);
}

describe("a página mostra o estado atual e o que já passou (AC-612)", () => {
  it(
    "@spec:AC-612 o link devolve número, status, linha do tempo, itens, total, pagamento e contato da loja",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      await request(app)
        .patch(`/v1/lojas/${loja.apelido}/pedidos/${pedido.id}/status`)
        .set("Origin", ORIGEM_DO_PAINEL)
        .set(
          "Authorization",
          comoPortador(tokenDeAcesso(dono.identidade.id, "OWNER")),
        )
        .send({ status: "ACCEPTED" });

      const resposta = await acompanhar(pedido.tokenPublico);

      expect(resposta.status).toBe(200);
      // O contrato é fechado: campo a mais, ou a menos, reprova aqui.
      const { pedido: lido } = esquemaDoAcompanhamento.parse(resposta.body);
      expect(lido.numero).toBe(pedido.numero);
      expect(lido.codigo).toBe(pedido.codigo);
      expect(lido.status).toBe("ACCEPTED");
      expect(lido.historico.map((p) => p.para)).toEqual([
        "PENDING",
        "ACCEPTED",
      ]);
      expect(lido.itens).toEqual([
        {
          nome: "Açaí com granola",
          variacao: null,
          quantidade: 2,
          totalCentavos: 4000,
          opcoes: [{ grupo: "Cobertura", nome: "Leite em pó", quantidade: 1 }],
        },
      ]);
      expect(lido.totalCentavos).toBe(4800);
      expect(lido.formaDePagamento).toBe("PIX");
      expect(lido.loja).toEqual({
        nome: "Açaí da Praça",
        whatsappPublico: WHATSAPP_DA_LOJA,
      });
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("a página acompanha a mudança (AC-613)", () => {
  it(
    "@spec:AC-613 a leitura seguinte à mudança já traz o status novo, e nada no caminho a guarda em cache",
    async () => {
      const pedido = await fazerPedido(acesso, loja);
      const antes = await acompanhar(pedido.tokenPublico);

      await request(app)
        .patch(`/v1/lojas/${loja.apelido}/pedidos/${pedido.id}/status`)
        .set("Origin", ORIGEM_DO_PAINEL)
        .set(
          "Authorization",
          comoPortador(tokenDeAcesso(dono.identidade.id, "OWNER")),
        )
        .send({ status: "ACCEPTED" });
      const depois = await acompanhar(pedido.tokenPublico);

      expect(antes.body.pedido.status).toBe("PENDING");
      expect(depois.body.pedido.status).toBe("ACCEPTED");
      expect(depois.headers["cache-control"]).toContain("no-store");
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("a página não expõe dado além do necessário (AC-615)", () => {
  it(
    "@spec:AC-615 o telefone do cliente vem mascarado, e endereço, e-mail e identificadores internos não vêm",
    async () => {
      const pedido = await fazerPedido(acesso, loja, {
        contato: {
          nome: "Maria Conceição",
          telefoneE164: "5511988887777",
          email: "maria@exemplo.test",
          logradouro: "Rua das Flores",
          numero: "123",
          bairro: "Jardim Secreto",
          cidade: "São Paulo",
          estado: "SP",
          cep: "01001000",
        },
        observacaoDoCliente: "Sem cebola",
      });
      await migrador.query(
        `UPDATE app.orders SET store_note = 'cliente caloteiro', pix_key_snapshot = 'chave-pix-da-loja'
          WHERE id = $1`,
        [pedido.id],
      );

      const resposta = await acompanhar(pedido.tokenPublico);
      const cru = JSON.stringify(resposta.body);

      expect(resposta.body.pedido.cliente).toEqual({
        nome: "Maria Conceição",
        telefoneMascarado: "••••••7777",
      });
      for (const proibido of [
        "988887777",
        "maria@exemplo.test",
        "Rua das Flores",
        "Jardim Secreto",
        "01001000",
        "caloteiro",
        "chave-pix-da-loja",
        pedido.id,
        loja.id,
      ]) {
        expect(cru, `a resposta pública traz "${proibido}"`).not.toContain(
          proibido,
        );
      }
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-615 da loja só vem o contato que ela tornou público",
    async () => {
      const discreta = await criarLoja({ nome: "Loja Discreta" });
      await migrador.query(
        `UPDATE app.store_settings SET whatsapp = $2 WHERE store_id = $1`,
        [
          discreta.id,
          JSON.stringify({ numero: "+5511922223333", publico: false }),
        ],
      );
      const pedido = await fazerPedido(acesso, discreta);

      const resposta = await acompanhar(pedido.tokenPublico, discreta);

      expect(resposta.body.pedido.loja).toEqual({
        nome: "Loja Discreta",
        whatsappPublico: null,
      });
      expect(JSON.stringify(resposta.body)).not.toContain("922223333");
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-615 o link não permite alterar nada do pedido pela leitura",
    async () => {
      const pedido = await fazerPedido(acesso, loja);

      const tentativa = await request(app)
        .patch(`/v1/vitrine/${loja.apelido}/pedido/${pedido.tokenPublico}`)
        .set("Origin", ORIGEM_DO_PAINEL)
        .send({ status: "COMPLETED" });

      expect(tentativa.status).toBe(404);
      const lido = await acompanhar(pedido.tokenPublico);
      expect(lido.body.pedido.status).toBe("PENDING");
    },
    ESPERA_DA_OPERACAO,
  );
});
