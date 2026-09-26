import { describe, expect, it } from "vitest";

import { proximoEstadoDaConfirmacaoWhatsapp } from "./confirmacao-whatsapp.usecase.ts";

const agora = new Date("2026-09-22T12:00:00.000Z");

describe("confirmação do pedido pelo WhatsApp", () => {
  it("@spec:AC-609 separa conversa aberta de mensagem confirmada", () => {
    expect(
      proximoEstadoDaConfirmacaoWhatsapp(
        { clicadoEm: null, confirmadoEm: null },
        "CLIQUE",
        agora,
      ),
    ).toEqual({ clicadoEm: agora, confirmadoEm: null });
  });

  it("@spec:AC-610 registra que o cliente já enviou", () => {
    expect(
      proximoEstadoDaConfirmacaoWhatsapp(
        { clicadoEm: agora, confirmadoEm: null },
        "CONFIRMACAO",
        new Date("2026-09-22T12:01:00.000Z"),
      ),
    ).toEqual({
      clicadoEm: agora,
      confirmadoEm: new Date("2026-09-22T12:01:00.000Z"),
    });
  });

  // A marca era AC-611, mas o que se prova aqui é o horário da sinalização
  // que não se perde (AC-610); o faturamento (AC-611) tem prova própria em
  // packages/core/src/situacao-na-venda.test.ts.
  it("@spec:AC-610 é idempotente e não apaga a confirmação anterior", () => {
    const confirmadoEm = new Date("2026-09-22T12:01:00.000Z");
    expect(
      proximoEstadoDaConfirmacaoWhatsapp(
        { clicadoEm: agora, confirmadoEm },
        "CONFIRMACAO",
        new Date("2026-09-22T12:02:00.000Z"),
      ),
    ).toEqual({ clicadoEm: agora, confirmadoEm });
  });
});

describe("tocar de novo não reescreve o passado", () => {
  it("@spec:AC-609 abrir a conversa outra vez mantém o primeiro horário e não confirma nada", () => {
    const depois = new Date("2026-09-22T12:05:00.000Z");

    expect(
      proximoEstadoDaConfirmacaoWhatsapp(
        { clicadoEm: agora, confirmadoEm: null },
        "CLIQUE",
        depois,
      ),
    ).toEqual({ clicadoEm: agora, confirmadoEm: null });
  });

  it("@spec:AC-610 confirmar sem ter aberto registra os dois instantes juntos", () => {
    // O cliente pode ter mandado a mensagem por outro aparelho.
    expect(
      proximoEstadoDaConfirmacaoWhatsapp(
        { clicadoEm: null, confirmadoEm: null },
        "CONFIRMACAO",
        agora,
      ),
    ).toEqual({ clicadoEm: agora, confirmadoEm: agora });
  });
});
