/**
 * O pareamento do agente de impressão e a entrega por HTTP, pela porta de
 * verdade (T-608 — AC-623; P-003).
 *
 * O limite de tentativas do pareamento conta no Redis. A regra do script já
 * está provada contra o Redis de verdade (`core/limite.redis.test.ts`); aqui o
 * cache é trocado por dublês que deixam passar, que barram ou que caem, para
 * provar o que a ROTA faz com cada resposta — inclusive fechar quando o Redis
 * não responde. Os atores moram em `apoio-de-impressao-automatica.ts`.
 */
import { createHash } from "node:crypto";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { esquemaDoAgentePareado } from "@simpleclick/contracts";
import { criarLoja } from "@simpleclick/testing";

import { ORIGEM_DO_PAINEL, tokenDoDono } from "./apoio-de-configuracao.ts";
import {
  agentesDa,
  aplicacao,
  cacheQueBarra,
  cacheQueCaiu,
  cacheQueDeixa,
  chaveDoAutomatico,
  codigoAbertoDa,
  esperar,
  estadoNoPainel,
  gerarCodigo,
  migradorDoArquivo,
  parear,
  pedidoDoCliente,
  pedirPareamento,
  prepararBancoDaImpressaoAutomatica,
  trabalhosDoPedido,
  viasDoPedido,
} from "./apoio-de-impressao-automatica.ts";
import { ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { cacheDoLimiteSobDemanda } from "../src/core/limite.ts";
import { MAXIMO_DE_FALHAS_POR_CODIGO } from "../src/modules/printing/parear.usecase.ts";

prepararBancoDaImpressaoAutomatica();

// ---------------------------------------------------------------------------
// AC-623 — o cupom sai sozinho
// ---------------------------------------------------------------------------

describe("com o automático ligado, o cupom sai sem ninguém clicar (AC-623)", () => {
  it(
    "@spec:AC-623 o agente pareado recebe o pedido confirmado, imprime, confirma, e o trabalho registra que foi ele",
    async () => {
      const app = aplicacao();
      const loja = await criarLoja({ nome: "Açaí do Agente" });
      await chaveDoAutomatico(app, loja, true);
      const agente = await parear(app, loja, "PC do balcão");

      const pedidoId = await pedidoDoCliente(loja);
      const [trabalho, ...outros] = await agente.rodar();

      expect(outros).toEqual([]);
      expect(trabalho?.pedido.id).toBe(pedidoId);
      expect(trabalho?.cupom.via).toBe(1);
      expect(JSON.stringify(trabalho?.cupom.blocos)).toContain(
        "Açaí com granola",
      );
      expect(agente.impressora).toEqual([pedidoId]);

      const [noBanco] = await trabalhosDoPedido(pedidoId);
      expect(noBanco).toMatchObject({ status: "PRINTED", agent_id: agente.id });
      expect(noBanco?.printed_at).not.toBeNull();
      expect(await viasDoPedido(pedidoId)).toBe(1);

      // Ninguém tocou na tela: o painel só vê o agente vivo e nada pendente.
      const estado = await estadoNoPainel(app, loja);
      expect(estado).toMatchObject({
        automatico: true,
        situacao: "conectada",
        pendentes: 0,
      });
      expect(estado.ultimoContatoEm).not.toBeNull();

      // A próxima consulta não traz o mesmo cupom de novo.
      expect(await agente.rodar()).toEqual([]);
      expect(agente.impressora).toEqual([pedidoId]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-623 a credencial chega uma vez e o banco guarda só o resumo dela; o código não serve duas vezes",
    async () => {
      const app = aplicacao();
      const loja = await criarLoja({ nome: "Lanchonete do Resumo" });
      const codigo = await gerarCodigo(app, loja);

      const pareamento = await pedirPareamento(app, {
        apelido: loja.apelido,
        codigo,
      });
      expect(pareamento.status).toBe(201);
      expect(pareamento.headers["cache-control"]).toBe("no-store");
      const { credencial, agente } = esquemaDoAgentePareado.parse(
        pareamento.body,
      );

      const linha = await migradorDoArquivo().query<{
        resumo: Buffer;
        tudo: string;
      }>(
        `SELECT token_sha256 AS resumo, row_to_json(a)::text AS tudo
           FROM app.print_agents a WHERE id = $1`,
        [agente.id],
      );
      expect(linha.rows[0]?.resumo).toEqual(
        createHash("sha256").update(credencial).digest(),
      );
      expect(linha.rows[0]?.tudo).not.toContain(credencial);

      const deNovo = await pedirPareamento(app, {
        apelido: loja.apelido,
        codigo,
      });
      expect(deNovo.status).toBe(401);
      expect(deNovo.body).toEqual({ erro: "codigo_invalido" });
      expect(await agentesDa(loja)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-623 código errado fecha no limite de tentativas, código vencido não vale, e loja inexistente responde igual",
    async () => {
      const app = aplicacao();
      const loja = await criarLoja({ nome: "Pastelaria Cadeado" });
      const codigo = await gerarCodigo(app, loja);
      const errado = codigo === "000000" ? "000001" : "000000";

      const recusas: unknown[] = [];
      for (let i = 0; i < MAXIMO_DE_FALHAS_POR_CODIGO; i += 1) {
        const resposta = await pedirPareamento(app, {
          apelido: loja.apelido,
          codigo: errado,
        });
        expect(resposta.status).toBe(401);
        recusas.push(resposta.body);
      }
      expect(await codigoAbertoDa(loja)).toMatchObject({
        failed_attempts: MAXIMO_DE_FALHAS_POR_CODIGO,
      });
      expect((await codigoAbertoDa(loja))?.consumed_at).not.toBeNull();

      // O código certo já não vale: quem errou cinco vezes não acerta na sexta.
      const certoTarde = await pedirPareamento(app, {
        apelido: loja.apelido,
        codigo,
      });
      expect(certoTarde.status).toBe(401);
      expect(await agentesDa(loja)).toEqual([]);

      // Loja que não existe responde exatamente como código errado.
      const semLoja = await pedirPareamento(app, {
        apelido: "loja-que-nao-existe",
        codigo,
      });
      expect(semLoja.status).toBe(401);
      const respostas = [...recusas, semLoja.body, certoTarde.body];
      expect(new Set(respostas.map((r) => JSON.stringify(r)))).toEqual(
        new Set([JSON.stringify({ erro: "codigo_invalido" })]),
      );

      // Código vencido.
      const apressada = aplicacao({ geracao: { validadeMs: 1 } });
      const vencido = await gerarCodigo(apressada, loja);
      await esperar(20);
      const tarde = await pedirPareamento(apressada, {
        apelido: loja.apelido,
        codigo: vencido,
      });
      expect(tarde.status).toBe(401);
      expect(await agentesDa(loja)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-623 parear de novo revoga o agente anterior: uma impressora por loja",
    async () => {
      const app = aplicacao();
      const loja = await criarLoja({ nome: "Pizzaria Troca de PC" });
      await chaveDoAutomatico(app, loja, true);
      const antigo = await parear(app, loja, "PC velho");
      const novo = await parear(app, loja, "PC novo");

      expect((await antigo.consultar()).status).toBe(401);
      expect((await novo.consultar()).status).toBe(200);
      const agentes = await agentesDa(loja);
      expect(agentes.map((a) => [a.id, a.revoked_at === null])).toEqual([
        [antigo.id, false],
        [novo.id, true],
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-623 o limite do pareamento barra antes do banco, e com o Redis fora do ar o pareamento fecha",
    async () => {
      const loja = await criarLoja({ nome: "Sorveteria Trancada" });
      const codigo = await gerarCodigo(aplicacao(), loja);

      const barrada = await pedirPareamento(
        aplicacao({ cacheDoLimite: cacheQueBarra }),
        { apelido: loja.apelido, codigo },
      );
      expect(barrada.status).toBe(429);
      expect(barrada.headers["retry-after"]).toBe("60");

      for (const cache of [
        cacheQueCaiu,
        cacheDoLimiteSobDemanda("redis://127.0.0.1:1/0", 500),
        cacheDoLimiteSobDemanda(undefined),
      ]) {
        const fechada = await pedirPareamento(
          aplicacao({ cacheDoLimite: cache }),
          { apelido: loja.apelido, codigo },
        );
        expect(fechada.status).toBe(503);
        expect(fechada.body).toEqual({ erro: "indisponivel" });
      }

      // Nada chegou ao banco: nenhuma tentativa contada, nenhum agente.
      expect(await codigoAbertoDa(loja)).toMatchObject({
        failed_attempts: 0,
        consumed_at: null,
      });
      expect(await agentesDa(loja)).toEqual([]);

      // Com o Redis de volta, o mesmo código pareia.
      const cache = cacheQueDeixa();
      const pareada = await pedirPareamento(
        aplicacao({ cacheDoLimite: cache }),
        {
          apelido: loja.apelido,
          codigo,
        },
      );
      expect(pareada.status).toBe(201);
      expect(cache.chamadas).toBeGreaterThan(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-623 @principle:P-003 a credencial do agente só alcança a fila da loja dele, e o token do dono não abre a porta do agente",
    async () => {
      const app = aplicacao();
      const lojaA = await criarLoja({ nome: "Pastelaria A" });
      const lojaB = await criarLoja({ nome: "Pastelaria B" });
      await chaveDoAutomatico(app, lojaA, true);
      await chaveDoAutomatico(app, lojaB, true);
      const agenteA = await parear(app, lojaA);

      const pedidoDaB = await pedidoDoCliente(lojaB);
      expect(await agenteA.trabalhos()).toEqual([]);
      const [trabalhoDaB] = await trabalhosDoPedido(pedidoDaB);
      if (trabalhoDaB === undefined) throw new Error("a fila da B está vazia");

      // Confirmar o trabalho da outra loja: não existe para este agente.
      expect((await agenteA.confirmar(trabalhoDaB.id)).status).toBe(404);
      expect((await trabalhosDoPedido(pedidoDaB))[0]?.status).toBe("QUEUED");

      for (const cabecalho of [
        undefined,
        "Bearer qualquer-coisa",
        `Bearer sca_${"A".repeat(43)}`,
        `Bearer ${tokenDoDono(lojaB.dono.id)}`,
      ]) {
        const tentativa = request(app).get("/v1/impressao/agente/trabalhos");
        const resposta = await (cabecalho === undefined
          ? tentativa
          : tentativa.set("Authorization", cabecalho));
        expect(resposta.status, cabecalho).toBe(401);
      }

      // E o dono de uma loja não gera código nem lê o estado da outra.
      const codigoAlheio = await request(app)
        .post(`/v1/lojas/${lojaA.apelido}/impressao/pareamento`)
        .set("Origin", ORIGEM_DO_PAINEL)
        .set("Authorization", `Bearer ${tokenDoDono(lojaB.dono.id)}`);
      expect(codigoAlheio.status).toBe(404);
      const estadoAlheio = await request(app)
        .get(`/v1/lojas/${lojaA.apelido}/impressao/estado`)
        .set("Authorization", `Bearer ${tokenDoDono(lojaB.dono.id)}`);
      expect(estadoAlheio.status).toBe(404);
    },
    ESPERA_LONGA,
  );
});
