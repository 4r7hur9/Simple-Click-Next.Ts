/**
 * Prova do destino depois de entrar (card #23): o `?proximo=` só leva a
 * caminho interno do site — nunca para fora (open redirect).
 */
import { describe, expect, it } from "vitest";

import {
  comDestino,
  destinoDosParametros,
  destinoSeguro,
} from "../src/features/auth/destino-seguro.ts";

describe("destinoSeguro", () => {
  it("aceita caminho interno, com busca", () => {
    expect(destinoSeguro("/loja/padaria")).toBe("/loja/padaria");
    expect(destinoSeguro("/loja/padaria/cardapio?ordem=a-z")).toBe(
      "/loja/padaria/cardapio?ordem=a-z",
    );
  });

  it.each([
    "https://golpe.example",
    "//golpe.example",
    "/\\golpe.example",
    "javascript:alert(1)",
    "/loja/x\nSet-Cookie: a",
    "/api/auth/login",
    "/entrar",
    "/cadastrar?proximo=/loja/x",
    "",
    "l/padaria",
  ])("recusa %j", (valor) => {
    expect(destinoSeguro(valor)).toBeUndefined();
  });

  it.each([
    "/admin/entrar",
    "/admin/entrar/verificacao",
    "/admin/entrar/",
    "/admin//entrar",
    "/admin/x/../entrar",
    "/ADMIN/ENTRAR",
    "/admin/entrar?proximo=/admin",
  ])("[CA-5] recusa a entrada da administração %j (sem laço)", (valor) => {
    expect(destinoSeguro(valor)).toBeUndefined();
  });

  it.each(["/admin", "/admin/lojas", "/admin?x=1", "/admin/entrarx"])(
    "[CA-5] aceita %j",
    (valor) => {
      expect(destinoSeguro(valor)).toBe(valor);
    },
  );

  it("recusa o que não é texto", () => {
    expect(destinoSeguro(undefined)).toBeUndefined();
    expect(destinoSeguro(null)).toBeUndefined();
  });

  it("lê `proximo` e, na falta dele, `retorno`", () => {
    expect(destinoDosParametros(new URLSearchParams("retorno=/loja/a"))).toBe(
      "/loja/a",
    );
    expect(
      destinoDosParametros(new URLSearchParams("proximo=//fora&retorno=/loja/a")),
    ).toBe("/loja/a");
  });

  it("monta o endereço da tela levando o destino", () => {
    expect(comDestino("/entrar", undefined)).toBe("/entrar");
    expect(comDestino("/entrar", "/loja/a?x=1")).toBe(
      "/entrar?proximo=%2Floja%2Fa%3Fx%3D1",
    );
    expect(comDestino("/entrar/verificacao?desafio=d", "/loja/a")).toBe(
      "/entrar/verificacao?desafio=d&proximo=%2Floja%2Fa",
    );
  });
});
