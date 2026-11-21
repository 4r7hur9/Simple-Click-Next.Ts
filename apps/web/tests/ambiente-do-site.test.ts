import { describe, expect, it } from "vitest";

import {
  ErroDeAmbienteDoSite,
  exigirAmbienteDoSite,
  problemasDoAmbienteDoSite,
} from "../src/server/ambiente-do-site";

// Valores sorteados de mentira (não são segredos de ninguém).
const SEGREDO_A = "Zk3mQ9vT1xW7bN4pL8sR2yH6dF0gJ5cA+eU/uI1oXaV3kBqM";
const SEGREDO_B = "Pq7LmV2xN9bT4kR8sW1yH5dF3gJ6cA0eUzI+oXaV/kBqMnZ2";

const PUBLICADO = {
  NODE_ENV: "production",
  URL_DO_SITE: "https://staging.exemplo.com.br",
  NEXT_PUBLIC_API_URL: "https://api.staging.exemplo.com.br",
  NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: "staging.exemplo.com.br",
  SEGREDO_DE_REVALIDACAO: SEGREDO_A,
  SEGREDO_DA_PONTE: SEGREDO_B,
} as const;

function variaveis(fonte: Record<string, string | undefined>): string[] {
  return problemasDoAmbienteDoSite(fonte).map((p) => p.variavel);
}

describe("ambiente do site na partida", () => {
  it("aceita um ambiente publicado completo", () => {
    expect(problemasDoAmbienteDoSite(PUBLICADO)).toEqual([]);
  });

  it("fora de production não cobra nada", () => {
    expect(problemasDoAmbienteDoSite({ NODE_ENV: "development" })).toEqual([]);
    expect(problemasDoAmbienteDoSite({})).toEqual([]);
  });

  it("o compose local (production em http://localhost) continua subindo sem cookie nem segredo", () => {
    expect(
      problemasDoAmbienteDoSite({
        NODE_ENV: "production",
        URL_DO_SITE: "http://localhost:4000",
        NEXT_PUBLIC_API_URL: "http://localhost:4001",
      }),
    ).toEqual([]);
  });

  it("em production exige os dois endereços", () => {
    expect(variaveis({ NODE_ENV: "production" })).toEqual([
      "URL_DO_SITE",
      "NEXT_PUBLIC_API_URL",
    ]);
  });

  it("recusa publicado sem o domínio do cookie (o login falharia calado)", () => {
    const { NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: _omitida, ...fonte } = PUBLICADO;
    expect(variaveis(fonte)).toEqual(["NEXT_PUBLIC_SESSION_COOKIE_DOMAIN"]);
  });

  it("recusa domínio de cookie que não cobre site e API", () => {
    expect(
      variaveis({
        ...PUBLICADO,
        NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: "api.staging.exemplo.com.br",
      }),
    ).toEqual(["NEXT_PUBLIC_SESSION_COOKIE_DOMAIN"]);
    expect(
      variaveis({
        ...PUBLICADO,
        NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: "outro.com.br",
      }),
    ).toEqual(["NEXT_PUBLIC_SESSION_COOKIE_DOMAIN"]);
  });

  it("aceita ponto na frente do domínio do cookie", () => {
    expect(
      problemasDoAmbienteDoSite({
        ...PUBLICADO,
        NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: ".staging.exemplo.com.br",
      }),
    ).toEqual([]);
  });

  it("não deixa o domínio 'exemplo.com.br' cobrir 'meuexemplo.com.br'", () => {
    expect(
      variaveis({
        ...PUBLICADO,
        URL_DO_SITE: "https://meuexemplo.com.br",
        NEXT_PUBLIC_API_URL: "https://api.exemplo.com.br",
        NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: "exemplo.com.br",
      }),
    ).toEqual(["NEXT_PUBLIC_SESSION_COOKIE_DOMAIN"]);
  });

  it("recusa API local ou http com o site publicado (argumento de construção esquecido)", () => {
    expect(
      variaveis({
        ...PUBLICADO,
        NEXT_PUBLIC_API_URL: "https://api.simpleclick.localhost",
      }),
    ).toContain("NEXT_PUBLIC_API_URL");
  });

  it("recusa segredo ausente, curto, de exemplo ou repetitivo", () => {
    expect(
      variaveis({ ...PUBLICADO, SEGREDO_DA_PONTE: undefined }),
    ).toEqual(["SEGREDO_DA_PONTE"]);
    expect(
      variaveis({ ...PUBLICADO, SEGREDO_DE_REVALIDACAO: "curto" }),
    ).toEqual(["SEGREDO_DE_REVALIDACAO"]);
    expect(
      variaveis({
        ...PUBLICADO,
        SEGREDO_DA_PONTE: "TROQUE_POR_UM_SEGREDO_GERADO_COM_AO_MENOS_32_CARACTERES",
      }),
    ).toEqual(["SEGREDO_DA_PONTE"]);
    expect(
      variaveis({ ...PUBLICADO, SEGREDO_DE_REVALIDACAO: "a".repeat(48) }),
    ).toEqual(["SEGREDO_DE_REVALIDACAO"]);
  });

  it("a mensagem nomeia a variável e nunca repete o valor do segredo", () => {
    const fraco = "b".repeat(48);
    let erro: unknown;
    try {
      exigirAmbienteDoSite({ ...PUBLICADO, SEGREDO_DE_REVALIDACAO: fraco });
    } catch (causa) {
      erro = causa;
    }
    expect(erro).toBeInstanceOf(ErroDeAmbienteDoSite);
    const mensagem = (erro as ErroDeAmbienteDoSite).message;
    expect(mensagem).toContain("SEGREDO_DE_REVALIDACAO");
    expect(mensagem).not.toContain(fraco);
  });
});
