import { describe, expect, it } from "vitest";
import { apelidoDaLoja } from "../src/lib/host-loja";

const BASES = ["simpleclick.app", "localhost"];

describe("endereço para apelido de loja", () => {
  it("reconhece a loja no subdomínio, em produção e no ambiente local", () => {
    expect(apelidoDaLoja("padaria-do-ze.simpleclick.app", BASES)).toBe(
      "padaria-do-ze",
    );
    expect(apelidoDaLoja("padaria-do-ze.localhost:3000", BASES)).toBe(
      "padaria-do-ze",
    );
  });

  it("ignora porta, maiúsculas e ponto final do endereço absoluto", () => {
    expect(apelidoDaLoja("Padaria.SimpleClick.app.:443", BASES)).toBe(
      "padaria",
    );
  });

  it("não trata o domínio da plataforma como loja", () => {
    expect(apelidoDaLoja("simpleclick.app", BASES)).toBeNull();
    expect(apelidoDaLoja("www.simpleclick.app", BASES)).toBeNull();
    expect(apelidoDaLoja("api.simpleclick.app", BASES)).toBeNull();
    expect(apelidoDaLoja("painel.simpleclick.app", BASES)).toBeNull();
  });

  it("recusa endereço de fora e subdomínio de segundo nível", () => {
    expect(apelidoDaLoja("padaria.outro-dominio.com", BASES)).toBeNull();
    expect(apelidoDaLoja("a.b.simpleclick.app", BASES)).toBeNull();
    // Endereço que finge ser nosso: quem termina em "falsosimpleclick.app"
    // não está sob o nosso domínio.
    expect(apelidoDaLoja("falsosimpleclick.app", BASES)).toBeNull();
  });

  it("recusa apelido com forma inválida e endereço ausente", () => {
    expect(apelidoDaLoja("-padaria.simpleclick.app", BASES)).toBeNull();
    expect(apelidoDaLoja("pa_daria.simpleclick.app", BASES)).toBeNull();
    expect(apelidoDaLoja(null, BASES)).toBeNull();
    expect(apelidoDaLoja("", BASES)).toBeNull();
  });
});
