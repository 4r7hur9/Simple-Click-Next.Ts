/**
 * A parte pura do histórico da conta (AC-616): quem pode pedir e como a linha
 * do banco vira o pedido da API. A costura com o PostgreSQL de verdade — a
 * função `app.meus_pedidos()`, o vínculo no fechamento e o isolamento entre
 * lojas — mora em `apps/api/tests/meus-pedidos.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { ErroDeDominio } from "../../core/erros.ts";
import {
  exigirClienteDaConta,
  montarPedidoDaConta,
  type LinhaDeMeusPedidos,
} from "./meus-pedidos.usecase.ts";

const IDENTIDADE = "2f6d1c0e-5b7a-4c6d-9e8f-0a1b2c3d4e5f";

function comoPapel(papel: "PUBLIC" | "CUSTOMER" | "OWNER", usuarioId?: string) {
  return executarComoRequisicao({ papel, usuarioId }, () =>
    exigirClienteDaConta(),
  );
}

describe("só o cliente logado alcança a própria conta (AC-616)", () => {
  it("@spec:AC-616 o papel CUSTOMER com identidade válida é aceito", () => {
    expect(comoPapel("CUSTOMER", IDENTIDADE)).toEqual({
      identidadeId: IDENTIDADE,
    });
  });

  it("@spec:AC-616 dono, vitrine pública e sessão sem identidade são recusados antes de qualquer consulta", () => {
    for (const tentativa of [
      () => comoPapel("OWNER", IDENTIDADE),
      () => comoPapel("PUBLIC", IDENTIDADE),
      () => comoPapel("CUSTOMER"),
      () => comoPapel("CUSTOMER", "usuario-de-teste-local"),
    ]) {
      expect(tentativa).toThrow(ErroDeDominio);
      expect(tentativa).toThrow("Esta conta não tem permissão");
    }
  });

  it("@spec:AC-616 fora de uma requisição não há conta nenhuma", () => {
    expect(() => exigirClienteDaConta()).toThrow(
      "fora de um contexto de requisição",
    );
  });
});

describe("a linha do banco vira o pedido da conta", () => {
  it("@spec:AC-616 número, total e contagem chegam como bigint e saem como inteiros; datas saem em ISO", () => {
    const linha: LinhaDeMeusPedidos = {
      order_id: "6e2f3a4b-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      store_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      store_name: "Açaí da Praça",
      store_slug: "acai-da-praca",
      number: 42n,
      code: "A-0042",
      status: "PREPARING",
      fulfillment: "PICKUP",
      total_cents: 4_800n,
      placed_at: new Date("2026-09-22T12:00:00.000Z"),
      updated_at: new Date("2026-09-22T12:05:00.000Z"),
      public_token: "token-longo-e-aleatorio",
      items_count: 2n,
    };

    expect(montarPedidoDaConta(linha)).toEqual({
      id: "6e2f3a4b-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      loja: {
        id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        nome: "Açaí da Praça",
        apelido: "acai-da-praca",
      },
      numero: 42,
      codigo: "A-0042",
      status: "PREPARING",
      entrega: "PICKUP",
      totalCentavos: 4_800,
      quantidadeDeItens: 2,
      criadoEm: "2026-09-22T12:00:00.000Z",
      atualizadoEm: "2026-09-22T12:05:00.000Z",
      tokenPublico: "token-longo-e-aleatorio",
    });
  });
});
