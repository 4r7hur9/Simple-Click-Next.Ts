/**
 * O destino depois de entrar (card #105): uma regra só, em `lib/`, que recusa
 * endereço de fora, não leva o código secreto do pedido nem a localização.
 */
import { describe, expect, it } from "vitest";

import {
  comDestino,
  destinoDosParametros,
  destinoSeguro,
} from "../src/lib/destino-seguro.ts";
import * as legado from "../src/features/auth/destino-seguro.ts";
import {
  destinoDepoisDeSair,
  enderecoComRetorno,
} from "../src/lib/quem-esta-logado.ts";

const HOSTIS = [
  "//evil.com",
  "/\\evil",
  "/loja/x\r\nSet-Cookie: a=1",
  "/loja/x%0d%0a",
  "/\t/evil.com",
  "/api/x",
  "/./api/x",
  "/conta/../api/painel/metricas/exportar",
  "/%2e%2e/api/x",
  "/./entrar",
  "/Entrar",
  "/CADASTRAR?proximo=/loja/x",
  "%252F%252Fevil.com",
  "/%2F/evil",
  "/%2f/evil",
  "/%5Cevil",
  "/loja/x%00",
  "https:evil.com",
  "https://evil.com",
  "javascript:alert(1)",
  "//evil.com@site",
  "evil.com",
  "",
  "x".repeat(513),
];

describe("destinoSeguro: casos hostis", () => {
  it.each(HOSTIS)("[CA-1] @spec:AC-10513 recusa %j", (valor) => {
    expect(destinoSeguro(valor)).toBeUndefined();
  });

  it("[CA-1] @spec:AC-10513 recusa o que não é texto", () => {
    expect(destinoSeguro(undefined)).toBeUndefined();
    expect(destinoSeguro(null)).toBeUndefined();
    expect(destinoSeguro(42)).toBeUndefined();
  });

  it("[CA-1] @spec:AC-10513 aceita caminho interno e tira o fragmento", () => {
    expect(destinoSeguro("/loja/padaria")).toBe("/loja/padaria");
    expect(destinoSeguro("/loja/padaria/cardapio?ordem=a-z")).toBe(
      "/loja/padaria/cardapio?ordem=a-z",
    );
    expect(destinoSeguro("/loja/padaria#topo")).toBe("/loja/padaria");
    expect(destinoSeguro("/@evil.com")).toBe("/@evil.com");
    expect(destinoSeguro("/conta/pedidos")).toBe("/conta/pedidos");
  });

  it("[CA-1] @spec:AC-10513 a tela de acesso nunca é destino (sem laço)", () => {
    for (const tela of [
      "/entrar",
      "/entrar/verificacao",
      "/cadastrar",
      "/vender",
      "/recuperar-senha",
      "/definir-senha",
      "/verificar-email",
      "/admin/entrar",
      "/admin/entrar/verificacao",
    ]) {
      expect(destinoSeguro(tela)).toBeUndefined();
    }
  });
});

describe("destinoSeguro: segredo e localização", () => {
  it.each([
    "/loja/x/pedido/ABC123",
    "/loja/x/pedido/ABC123/",
    "/loja/x/pedido/ABC123?a=1#b",
    "/loja/x//pedido/ABC123",
    "/loja/x/pedido/%74oken",
    "/loja/x/%70edido/ABC123",
    "/l/x/pedido/ABC123",
    "/LOJA/x/pedido/ABC123",
  ])("[CA-3] @spec:AC-10514 %j volta só para a loja", (valor) => {
    expect(destinoSeguro(valor)).toBe("/loja/x");
  });

  it("[CA-3] @spec:AC-10514 o código do pedido não aparece no destino", () => {
    const destino = destinoSeguro("/loja/x/pedido/SEGREDO-123") ?? "";
    expect(destino).not.toContain("SEGREDO");
    expect(comDestino("/entrar", "/loja/x/pedido/SEGREDO-123")).not.toContain(
      "SEGREDO",
    );
  });

  it("[CA-3] @spec:AC-10514 lat e lng nunca entram (qualquer caixa e forma)", () => {
    expect(destinoSeguro("/explorar/produtos?lat=-23.5&lng=-46.6")).toBe(
      "/explorar/produtos",
    );
    expect(
      destinoSeguro("/explorar/produtos?busca=pao&LAT=1&%6Cng=2&lat=3"),
    ).toBe("/explorar/produtos?busca=pao");
    expect(destinoSeguro("/explorar/lojas?lat[]=1&entrega=entrega")).toBe(
      "/explorar/lojas?entrega=entrega",
    );
  });
});

describe("comDestino e retorno", () => {
  it("[CA-2] @spec:AC-10513 comDestino valida o destino que recebe", () => {
    expect(comDestino("/entrar", undefined)).toBe("/entrar");
    expect(comDestino("/entrar", "//evil.com")).toBe("/entrar");
    expect(comDestino("/entrar", "/entrar")).toBe("/entrar");
    expect(comDestino("/entrar", "/loja/a?x=1")).toBe(
      "/entrar?proximo=%2Floja%2Fa%3Fx%3D1",
    );
    expect(comDestino("/entrar/verificacao?desafio=d", "/loja/a")).toBe(
      "/entrar/verificacao?desafio=d&proximo=%2Floja%2Fa",
    );
  });

  it("[CA-2] @spec:AC-10513 enderecoComRetorno usa a regra única", () => {
    expect(enderecoComRetorno("/entrar", null)).toBe("/entrar");
    expect(enderecoComRetorno("/entrar", "/")).toBe("/entrar");
    expect(enderecoComRetorno("/entrar", "//evil.com")).toBe("/entrar");
    expect(enderecoComRetorno("/entrar", "/./api/x")).toBe("/entrar");
    expect(enderecoComRetorno("/entrar", "/entrar")).toBe("/entrar");
    expect(enderecoComRetorno("/cadastrar", "/loja/a/cardapio")).toBe(
      "/cadastrar?proximo=%2Floja%2Fa%2Fcardapio",
    );
    expect(enderecoComRetorno("/entrar", "/loja/a/pedido/TOKEN")).toBe(
      "/entrar?proximo=%2Floja%2Fa",
    );
  });

  it("[CA-2] @spec:AC-10513 destinoDepoisDeSair usa a regra única", () => {
    expect(destinoDepoisDeSair("/loja/padaria/cardapio")).toBe(
      "/loja/padaria/cardapio",
    );
    expect(destinoDepoisDeSair("/loja/x/pedido/TOKEN")).toBe("/loja/x");
    expect(destinoDepoisDeSair("/conta/pedidos")).toBe("/");
    expect(destinoDepoisDeSair("/painel")).toBe("/");
    expect(destinoDepoisDeSair("//evil.com")).toBe("/");
    expect(destinoDepoisDeSair("/loja/x\r\nSet-Cookie: a")).toBe("/");
    expect(destinoDepoisDeSair(undefined)).toBe("/");
  });

  it("[CA-2] @spec:AC-10513 proximo vence retorno, e ambos passam pela regra", () => {
    expect(
      destinoDosParametros(new URLSearchParams("proximo=/loja/a&retorno=/loja/b")),
    ).toBe("/loja/a");
    expect(
      destinoDosParametros(new URLSearchParams("proximo=//fora&retorno=/loja/b")),
    ).toBe("/loja/b");
    expect(
      destinoDosParametros(new URLSearchParams("proximo=/entrar&retorno=/x")),
    ).toBe("/x");
  });

  it("[CA-2] @spec:AC-10513 o caminho antigo em features/auth reexporta a mesma regra", () => {
    expect(legado.destinoSeguro).toBe(destinoSeguro);
    expect(legado.comDestino).toBe(comDestino);
    expect(legado.destinoDosParametros).toBe(destinoDosParametros);
  });
});
