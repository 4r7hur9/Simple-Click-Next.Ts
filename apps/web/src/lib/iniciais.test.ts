/**
 * Prova das iniciais (AC-939).
 *
 * A regra parece trivial e tem uma armadilha: descartar palavra curta resolve o
 * "do" e come o "Zé" junto — e "Zé" é o nome da pessoa. A lista de ligações
 * existe para separar as duas coisas.
 */
import { describe, expect, it } from "vitest";

import { iniciaisDe } from "./iniciais.ts";

describe("iniciais para a marca sem logo (AC-939)", () => {
  it("@spec:AC-939 duas palavras viram duas letras", () => {
    expect(iniciaisDe("Sabor Caseiro")).toBe("SC");
  });

  it("@spec:AC-939 a ligação não vira inicial, mas o nome da pessoa vira", () => {
    // É a armadilha: "descarte palavra curta" resolveria o "do" e comeria o
    // "Zé" junto.
    expect(iniciaisDe("Pastelaria do Zé")).toBe("PZ");
    expect(iniciaisDe("Casa da Ana")).toBe("CA");
    expect(iniciaisDe("Pão e Cia")).toBe("PC");
  });

  it("@spec:AC-939 uma palavra só vira uma letra, e não uma sigla inventada", () => {
    expect(iniciaisDe("Pastelaria")).toBe("P");
  });

  it("@spec:AC-939 nome com muitas palavras para nas duas primeiras", () => {
    // Três ou quatro letras num círculo pequeno viram borrão.
    expect(iniciaisDe("Restaurante Sabor Caseiro Premium")).toBe("RS");
  });

  it("@spec:AC-939 nome vazio ou só de ligações recebe a reserva", () => {
    // Acontece enquanto a pessoa apaga o campo para digitar de novo: um círculo
    // vazio piscando ali lê como defeito.
    expect(iniciaisDe("")).toBe("SL");
    expect(iniciaisDe("   ")).toBe("SL");
    expect(iniciaisDe("do da")).toBe("SL");
  });

  it("@spec:AC-939 símbolo no meio do nome não vira inicial", () => {
    // "Sabor & Cia" tem três pedaços, e o do meio é um símbolo. Sem conferir,
    // a sigla sai "S&" — que não é inicial de nada.
    expect(iniciaisDe("Sabor & Cia")).toBe("SC");
    expect(iniciaisDe("Bar 100% Natural")).toBe("BN");
  });

  it("@spec:AC-939 espaço extra não produz letra em branco", () => {
    expect(iniciaisDe("  Sabor   Caseiro  ")).toBe("SC");
  });
});
