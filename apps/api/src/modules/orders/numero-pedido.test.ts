/**
 * Prova do código do pedido (AC-514).
 *
 * O código é lido em voz alta na cozinha e ditado por telefone. O que está sob
 * prova é que ele continua curto, começa no 1 e não se repete dentro da loja.
 */
import { describe, expect, it } from "vitest";

import { codigoDoPedido, tokenPublico } from "./numero-pedido.ts";

describe("código do pedido (AC-514)", () => {
  it("@spec:AC-514 a primeira venda da loja é A-0001, e não um número da plataforma", () => {
    // Uma sequência global daria "84317" à loja que acabou de abrir, revelando
    // quanto a plataforma inteira já vendeu.
    expect(codigoDoPedido(1)).toBe("A-0001");
  });

  it("@spec:AC-514 o código acompanha o número sem pular", () => {
    expect(codigoDoPedido(2)).toBe("A-0002");
    expect(codigoDoPedido(42)).toBe("A-0042");
    expect(codigoDoPedido(1042)).toBe("A-1042");
    expect(codigoDoPedido(9999)).toBe("A-9999");
  });

  it("@spec:AC-514 passados 9.999 pedidos a letra avança e o código segue curto", () => {
    // Sem a letra, a loja movimentada chegaria a cinco dígitos no primeiro ano,
    // e cinco dígitos ditados por telefone viram erro.
    expect(codigoDoPedido(10_000)).toBe("B-0001");
    expect(codigoDoPedido(19_998)).toBe("B-9999");
    expect(codigoDoPedido(19_999)).toBe("C-0001");
    expect(codigoDoPedido(10_000).length).toBeLessThanOrEqual(6);
  });

  it("@spec:AC-514 nenhum código se repete dentro de uma loja", () => {
    // A prova do que o índice único (store_id, code) exige: se dois números
    // gerassem o mesmo código, o segundo pedido seria recusado pelo banco e o
    // cliente veria um erro sem entender por quê.
    const codigos = new Set<string>();
    for (let numero = 1; numero <= 30_000; numero += 1) {
      codigos.add(codigoDoPedido(numero));
    }

    expect(codigos.size).toBe(30_000);
  });

  it("@spec:AC-514 número inválido é recusado em vez de gerar código sem sentido", () => {
    expect(() => codigoDoPedido(0)).toThrow(RangeError);
    expect(() => codigoDoPedido(-1)).toThrow(RangeError);
    expect(() => codigoDoPedido(1.5)).toThrow(RangeError);
  });
});

describe("endereço público do acompanhamento (AC-518)", () => {
  it("@spec:AC-518 o endereço tem pelo menos 128 bits de aleatoriedade", () => {
    // É a única coisa que protege o pedido de um estranho: nome, telefone e
    // endereço de entrega estão atrás dele.
    const token = tokenPublico();

    // 16 bytes em base64url dão 22 caracteres, cada um valendo 6 bits.
    expect(token.length).toBeGreaterThanOrEqual(22);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("@spec:AC-518 dois endereços seguidos nunca são iguais nem adivinháveis", () => {
    // Um contador deixaria qualquer um ler os pedidos da loja inteira somando 1.
    const tokens = new Set(Array.from({ length: 1000 }, () => tokenPublico()));

    expect(tokens.size).toBe(1000);
  });
});
