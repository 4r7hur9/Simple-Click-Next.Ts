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

  it("@spec:AC-611 é idempotente e não apaga a confirmação anterior", () => {
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
