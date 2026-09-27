import { describe, expect, it } from "vitest";

import { decidirTransicao } from "@simpleclick/core";

import { autorDaMudanca } from "./mudar-status.usecase.ts";

describe("mudança de status do pedido", () => {
  it("@spec:AC-604 aceita cada passo válido do fluxo de entrega", () => {
    expect(decidirTransicao("PENDING", "ACCEPTED", "DELIVERY").ok).toBe(true);
    expect(decidirTransicao("ACCEPTED", "PREPARING", "DELIVERY").ok).toBe(true);
    expect(
      decidirTransicao("PREPARING", "OUT_FOR_DELIVERY", "DELIVERY").ok,
    ).toBe(true);
    expect(
      decidirTransicao("OUT_FOR_DELIVERY", "COMPLETED", "DELIVERY").ok,
    ).toBe(true);
  });

  it("@spec:AC-605 não oferece saída para entrega numa retirada", () => {
    expect(decidirTransicao("PREPARING", "OUT_FOR_DELIVERY", "PICKUP").ok).toBe(
      false,
    );
  });

  it("@spec:AC-606 mantém concluído como estado final", () => {
    expect(decidirTransicao("COMPLETED", "PREPARING", "DELIVERY").ok).toBe(
      false,
    );
  });

  it("@spec:AC-607 aceita cancelamento somente com motivo", () => {
    expect(decidirTransicao("ACCEPTED", "CANCELLED", "DELIVERY").ok).toBe(
      false,
    );
    expect(
      decidirTransicao("ACCEPTED", "CANCELLED", "DELIVERY", "Cliente desistiu"),
    ).toMatchObject({ ok: true, motivo: "Cliente desistiu" });
  });

  it("@spec:AC-608 cria decisão independente para cada linha do histórico", () => {
    const primeira = decidirTransicao("PENDING", "ACCEPTED", "DELIVERY");
    const segunda = decidirTransicao("ACCEPTED", "PREPARING", "DELIVERY");

    expect(primeira).toMatchObject({
      ok: true,
      de: "PENDING",
      para: "ACCEPTED",
    });
    expect(segunda).toMatchObject({
      ok: true,
      de: "ACCEPTED",
      para: "PREPARING",
    });
  });
});

describe("quem fez cada passo (AC-608)", () => {
  it("@spec:AC-608 a identidade de quem mudou é guardada quando é uma identidade de verdade", () => {
    expect(autorDaMudanca("9b1f2c3d-0000-4000-8000-000000000001")).toBe(
      "9b1f2c3d-0000-4000-8000-000000000001",
    );
  });

  it("@spec:AC-608 identificador que não é de identidade não impede o dono de trabalhar", () => {
    // O usuário local de desenvolvimento não é uma linha de `identities`:
    // gravá-lo derrubaria a mudança inteira. A trilha guarda o papel.
    expect(autorDaMudanca("usuario-de-teste-local")).toBeNull();
    expect(autorDaMudanca(undefined)).toBeNull();
  });
});
