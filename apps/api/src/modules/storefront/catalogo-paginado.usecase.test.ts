/**
 * Card #74 — as regras puras do catálogo em páginas: o cursor opaco, o cursor
 * da página seguinte e quantos produtos cada seção traz no resumo.
 */
import { describe, expect, it } from "vitest";

import {
  codificarCursor,
  lerCursor,
  MINIMO_POR_SECAO,
  produtosPorSecao,
  proximoCursor,
} from "./catalogo-paginado.usecase.ts";

describe("cursor do catálogo", () => {
  it("vai e volta pela mesma posição, só com caracteres de endereço", () => {
    for (const posicao of [0, 1, 24, 48, 10_139]) {
      const cursor = codificarCursor(posicao);
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(lerCursor(cursor)).toBe(posicao);
    }
  });

  it("ausente, ilegível ou negativo volta ao começo, sem erro", () => {
    expect(lerCursor(undefined)).toBe(0);
    expect(lerCursor("")).toBe(0);
    expect(lerCursor("nao-e-cursor")).toBe(0);
    expect(lerCursor(Buffer.from('{"p":-3}').toString("base64url"))).toBe(0);
    expect(lerCursor(Buffer.from('{"p":"24"}').toString("base64url"))).toBe(0);
    expect(lerCursor(Buffer.from("[]").toString("base64url"))).toBe(0);
  });

  it("a página seguinte existe enquanto a lista não acabou", () => {
    expect(lerCursor(proximoCursor(0, 24, 100) ?? "")).toBe(24);
    expect(lerCursor(proximoCursor(72, 24, 100) ?? "")).toBe(96);
    expect(proximoCursor(96, 4, 100)).toBeNull();
    expect(proximoCursor(0, 24, 24)).toBeNull();
    // Página vazia (cursor além do fim) não aponta para lugar nenhum.
    expect(proximoCursor(200, 0, 100)).toBeNull();
  });
});

describe("produtos por seção no resumo", () => {
  it("sem teto, cada seção traz o que foi pedido; zero é só a contagem", () => {
    expect(produtosPorSecao(24, 15)).toBe(24);
    expect(produtosPorSecao(0, 15, 96)).toBe(0);
  });

  it("o teto se reparte entre as seções, sem passar do pedido", () => {
    // Loja pequena (6 seções): 16 por seção — as seções de até 16 vêm inteiras.
    expect(produtosPorSecao(24, 6, 96)).toBe(16);
    // Duas seções: o pedido manda.
    expect(produtosPorSecao(24, 2, 96)).toBe(24);
    // Quinze seções: 6 por seção (duas fileiras de três).
    expect(produtosPorSecao(24, 15, 96)).toBe(6);
  });

  it("nunca abaixo do mínimo, nem com muitas seções", () => {
    expect(produtosPorSecao(24, 80, 96)).toBe(MINIMO_POR_SECAO);
    expect(produtosPorSecao(2, 80, 96)).toBe(2);
  });
});
