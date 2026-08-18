/**
 * A declaração das três filas e o motor de cada uma.
 *
 * Este arquivo existe para que a decisão de 17/08 — "Fila de impressão em
 * PostgreSQL, não em Redis" — pare de ser uma promessa em comentário e passe a
 * ser algo que quebra quando contrariado. Sem ele, alguém acrescenta a fila de
 * impressão ao Redis numa tarde de pressa e nada acusa até a primeira queda do
 * plano gratuito levar junto a comanda da cozinha.
 */

import { describe, expect, it } from "vitest";

import {
  abrirFilaEmRedis,
  ErroDeMotorDeFila,
  MOTOR_DAS_FILAS,
  NOMES_DAS_FILAS,
} from "./index.ts";

describe("filas declaradas", () => {
  it("prevê as três filas da arquitetura", () => {
    expect([...NOMES_DAS_FILAS]).toEqual(["email", "webhook", "impressao"]);
    expect(Object.keys(MOTOR_DAS_FILAS).sort()).toEqual(
      [...NOMES_DAS_FILAS].sort(),
    );
  });

  it("mantém a impressão fora do Redis, e o e-mail dentro", () => {
    // E-mail atrasado custa um reenvio; cupom perdido custa um pedido que a
    // cozinha nunca vê. A assimetria é a decisão inteira.
    expect(MOTOR_DAS_FILAS.impressao).toBe("postgres");
    expect(MOTOR_DAS_FILAS.email).toBe("redis");
    expect(MOTOR_DAS_FILAS.webhook).toBe("redis");
  });

  it("recusa abrir a fila de impressão no Redis, explicando o porquê", () => {
    let recusa: unknown;
    try {
      abrirFilaEmRedis("impressao", {
        urlDoRedis: "redis://maquina-inexistente:6379/0",
      });
    } catch (erro) {
      recusa = erro;
    }

    expect(recusa).toBeInstanceOf(ErroDeMotorDeFila);
    expect((recusa as ErroDeMotorDeFila).motorEsperado).toBe("postgres");
    expect((recusa as Error).message).toContain("PostgreSQL");
  });
});
