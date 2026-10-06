/**
 * A impressão automática pela porta de verdade: a chave do dono, o aviso do
 * agente fora do ar e a volta ao clique (T-608 — AC-622, AC-624, AC-626).
 *
 * A fila em si (travas, prazo, via somada uma vez, confirmação perdida) está
 * provada em `impressao-sem-duplicar.test.ts`, e o pareamento do agente em
 * `impressao-automatica-pareamento.test.ts`. Os atores (o dono no painel, o
 * agente na rede, o cliente que pede) moram em
 * `apoio-de-impressao-automatica.ts`.
 */
import { describe, expect, it } from "vitest";

import { criarLoja } from "@simpleclick/testing";

import { lerSecao, tokenDoDono } from "./apoio-de-configuracao.ts";
import {
  agenteSomeHaCincoMinutos,
  aplicacao,
  cancelarPedidoPeloDono,
  chaveDoAutomatico,
  CONTEUDO_PADRAO,
  estadoNoPainel,
  imprimirPorClique,
  parear,
  pedidoDoCliente,
  pendentesNoPainel,
  prepararBancoDaImpressaoAutomatica,
  salvarImpressao,
  trabalhosDoPedido,
  viasDoPedido,
} from "./apoio-de-impressao-automatica.ts";
import { ESPERA_LONGA } from "./apoio-de-isolamento.ts";

prepararBancoDaImpressaoAutomatica();

// ---------------------------------------------------------------------------
// AC-622 — nasce desligada, e liga por escolha do dono
// ---------------------------------------------------------------------------

describe("a impressão automática nasce desligada (AC-622)", () => {
  it(
    "@spec:AC-622 loja recém-configurada: automático desligado, nenhum cupom entra na fila e o clique é o que vale",
    async () => {
      const app = aplicacao();
      const loja = await criarLoja({ nome: "Pastelaria Recém-Aberta" });

      const configuracao = await lerSecao(
        app,
        loja.apelido,
        "impressao",
        tokenDoDono(loja.dono.id),
      );
      expect(configuracao.status).toBe(200);
      expect(configuracao.body.automatico).toBe(false);

      expect(await estadoNoPainel(app, loja)).toEqual({
        automatico: false,
        situacao: "desligada",
        ultimoContatoEm: null,
        pendentes: 0,
      });

      const pedidoId = await pedidoDoCliente(loja);
      expect(await trabalhosDoPedido(pedidoId)).toEqual([]);

      const cupom = await imprimirPorClique(loja, pedidoId);
      expect(cupom.via).toBe(1);
      expect(await viasDoPedido(pedidoId)).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-622 ligar é escolha do dono: a chave liga, a tela antiga que salva sem a chave não desliga, e a chave desliga",
    async () => {
      const app = aplicacao();
      const loja = await criarLoja({ nome: "Pastelaria da Chave" });

      await chaveDoAutomatico(app, loja, true);
      expect((await estadoNoPainel(app, loja)).situacao).toBe("sem_agente");

      // A tela de antes da chave salva só papel e conteúdo.
      const semChave = await salvarImpressao(app, loja, {
        larguraMm: 58,
        conteudo: CONTEUDO_PADRAO,
      });
      expect(semChave.status).toBe(204);
      const guardada = await lerSecao(
        app,
        loja.apelido,
        "impressao",
        tokenDoDono(loja.dono.id),
      );
      expect(guardada.body).toMatchObject({ larguraMm: 58, automatico: true });

      await chaveDoAutomatico(app, loja, false);
      expect(await estadoNoPainel(app, loja)).toMatchObject({
        automatico: false,
        situacao: "desligada",
      });
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-624 — o aviso do agente fora do ar
// ---------------------------------------------------------------------------

describe("agente desconectado avisa e não perde cupom (AC-624)", () => {
  it(
    "@spec:AC-624 com o agente fora do ar o painel avisa, o cupom aguarda, o clique imprime e o agente não duplica quando volta",
    async () => {
      const app = aplicacao();
      const loja = await criarLoja({ nome: "Hamburgueria Sem Rede" });
      await chaveDoAutomatico(app, loja, true);
      const agente = await parear(app, loja);
      expect(await agente.trabalhos()).toEqual([]);
      expect((await estadoNoPainel(app, loja)).situacao).toBe("conectada");

      await agenteSomeHaCincoMinutos(agente.id);
      const pedidoId = await pedidoDoCliente(loja);

      const estado = await estadoNoPainel(app, loja);
      expect(estado).toMatchObject({
        automatico: true,
        situacao: "desconectada",
        pendentes: 1,
      });
      const [pendente] = await pendentesNoPainel(app, loja);
      expect(pendente).toMatchObject({
        pedido: { id: pedidoId },
        estado: "QUEUED",
      });

      // O botão de imprimir por clique continua funcionando — e o trabalho
      // que esperava o agente é cancelado, para não sair duas vezes.
      const cupom = await imprimirPorClique(loja, pedidoId);
      expect(cupom.via).toBe(1);
      expect((await trabalhosDoPedido(pedidoId))[0]?.status).toBe("CANCELED");

      // O agente volta: nada a imprimir, e o painel o vê de novo.
      expect(await agente.rodar()).toEqual([]);
      expect(agente.impressora).toEqual([]);
      expect(await estadoNoPainel(app, loja)).toMatchObject({
        situacao: "conectada",
        pendentes: 0,
      });
      expect(await viasDoPedido(pedidoId)).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-624 pedido cancelado enquanto o agente estava fora do ar não sai quando ele volta, e some dos pendentes",
    async () => {
      const app = aplicacao();
      const loja = await criarLoja({ nome: "Pizzaria Cancelada" });
      await chaveDoAutomatico(app, loja, true);
      const agente = await parear(app, loja);
      await agenteSomeHaCincoMinutos(agente.id);

      const cancelado = await pedidoDoCliente(loja);
      const valendo = await pedidoDoCliente(loja);
      expect((await pendentesNoPainel(app, loja)).length).toBe(2);

      await cancelarPedidoPeloDono(loja, cancelado);

      // O cupom do pedido cancelado não espera mais ninguém: a cozinha não
      // pode receber, na volta do agente, um pedido que não existe mais.
      expect((await trabalhosDoPedido(cancelado))[0]?.status).toBe("CANCELED");
      expect(
        (await pendentesNoPainel(app, loja)).map((p) => p.pedido.id),
      ).toEqual([valendo]);

      const entregues = await agente.rodar();
      expect(entregues.map((t) => t.pedido.id)).toEqual([valendo]);
      expect(agente.impressora).toEqual([valendo]);
      expect(await viasDoPedido(cancelado)).toBe(0);
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-626 — desligar volta ao clique sem perder nada
// ---------------------------------------------------------------------------

describe("desligar o automático volta ao clique sem perder nada (AC-626)", () => {
  it(
    "@spec:AC-626 desligado, o agente não recebe nada, os pendentes continuam à vista e saem por clique, e o pedido novo não entra na fila",
    async () => {
      const app = aplicacao();
      const loja = await criarLoja({ nome: "Doceria Volta ao Clique" });
      await chaveDoAutomatico(app, loja, true);
      const agente = await parear(app, loja);
      await agenteSomeHaCincoMinutos(agente.id);

      const primeiro = await pedidoDoCliente(loja);
      const segundo = await pedidoDoCliente(loja);
      expect((await pendentesNoPainel(app, loja)).length).toBe(2);

      await chaveDoAutomatico(app, loja, false);

      // O agente consulta e não recebe nada, mas continua dando sinal de vida.
      expect(await agente.rodar()).toEqual([]);
      expect(agente.impressora).toEqual([]);
      const estado = await estadoNoPainel(app, loja);
      expect(estado).toMatchObject({
        automatico: false,
        situacao: "desligada",
        pendentes: 2,
      });

      // Os pendentes continuam disponíveis para o clique, na ordem em que
      // entraram — nada se perdeu.
      expect(
        (await pendentesNoPainel(app, loja)).map((p) => p.pedido.id),
      ).toEqual([primeiro, segundo]);

      // Pedido novo, com o automático desligado: vai para o clique.
      const terceiro = await pedidoDoCliente(loja);
      expect(await trabalhosDoPedido(terceiro)).toEqual([]);

      // O dono imprime o primeiro por clique.
      expect((await imprimirPorClique(loja, primeiro)).via).toBe(1);
      expect(
        (await pendentesNoPainel(app, loja)).map((p) => p.pedido.id),
      ).toEqual([segundo]);

      // Religar devolve ao agente só o que ainda espera: nada sai duas vezes.
      await chaveDoAutomatico(app, loja, true);
      const entregues = await agente.rodar();
      expect(entregues.map((t) => t.pedido.id)).toEqual([segundo]);
      expect(agente.impressora).toEqual([segundo]);
      expect(await viasDoPedido(primeiro)).toBe(1);
      expect(await viasDoPedido(segundo)).toBe(1);
      expect(await pendentesNoPainel(app, loja)).toEqual([]);
    },
    ESPERA_LONGA,
  );
});
