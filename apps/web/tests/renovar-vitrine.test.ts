/**
 * Card #81 — depois de gravar uma imagem, a vitrine esquece a versão de antes.
 *
 * A etiqueta da vitrine e o caminho de cada página são renovados quando o site
 * encaminha uma gravação que deu certo; leitura, recusa e erro não renovam.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const next = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn(),
}));
vi.mock("next/cache", () => next);

import type { MotorDeCacheDoSite } from "../src/server/cache";
import {
  renovarAposGravar,
  renovarVitrineDaLoja,
} from "../src/server/renovar-vitrine";

function motor() {
  const vencidas: string[] = [];
  const m: MotorDeCacheDoSite = {
    lembrar: (pedido) => pedido.calcular(),
    invalidar: () => {},
    vencer: (etiqueta) => {
      vencidas.push(etiqueta);
    },
  };
  return { m, vencidas };
}

beforeEach(() => {
  next.revalidatePath.mockReset();
  next.revalidateTag.mockReset();
});

describe("renovarVitrineDaLoja", () => {
  it("vence a etiqueta da vitrine e renova as páginas da loja", () => {
    const { m, vencidas } = motor();
    renovarVitrineDaLoja("pastelaria-da-vila", m);
    expect(vencidas).toEqual(["vitrine:pastelaria-da-vila"]);
    expect(next.revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/loja/pastelaria-da-vila",
      "/loja/pastelaria-da-vila/sobre",
      "/loja/pastelaria-da-vila/cardapio",
      "/loja/pastelaria-da-vila/carrinho",
      "/loja/pastelaria-da-vila/checkout",
    ]);
  });

  it("sem o contexto do Next (ou apelido impossível), não lança: o prazo assume", () => {
    next.revalidatePath.mockImplementation(() => {
      throw new Error("fora do contexto");
    });
    expect(() => renovarVitrineDaLoja("com:dois-pontos")).not.toThrow();
  });
});

describe("renovarAposGravar", () => {
  it("renova quando uma gravação dá certo", () => {
    for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
      next.revalidatePath.mockClear();
      renovarAposGravar("loja-a", metodo, 200);
      expect(next.revalidatePath).toHaveBeenCalled();
    }
    next.revalidatePath.mockClear();
    renovarAposGravar("loja-a", "DELETE", 204);
    expect(next.revalidatePath).toHaveBeenCalled();
  });

  it("não renova leitura, recusa nem erro", () => {
    renovarAposGravar("loja-a", "GET", 200);
    renovarAposGravar("loja-a", "PUT", 400);
    renovarAposGravar("loja-a", "POST", 503);
    expect(next.revalidatePath).not.toHaveBeenCalled();
  });
});
