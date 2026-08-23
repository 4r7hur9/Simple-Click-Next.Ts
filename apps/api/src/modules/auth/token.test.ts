import { describe, expect, it } from "vitest";

import {
  assinarTokenDeAcesso,
  DURACAO_DO_TOKEN_DE_ACESSO_EM_SEGUNDOS,
  ErroDeTokenInvalido,
  resumirTokenDeRenovacao,
  tokenDoCabecalhoDeAutorizacao,
  verificarTokenDeAcesso,
} from "./token.ts";

const SEGREDO_DE_ASSINATURA_DE_TESTE =
  "assinatura-de-teste-com-entropia-suficiente-para-a-suite";
const AGORA = new Date("2026-08-23T12:00:00.000Z");

function tokenValido(): string {
  return assinarTokenDeAcesso(
    {
      identidadeId: "identidade-1",
      papel: "OWNER",
      sessaoId: "sessao-1",
      familiaId: "familia-1",
    },
    SEGREDO_DE_ASSINATURA_DE_TESTE,
    AGORA,
  );
}

describe("token de acesso", () => {
  it("assina alegações de sessão com prazo curto de quinze minutos", () => {
    const alegacoes = verificarTokenDeAcesso(
      tokenValido(),
      SEGREDO_DE_ASSINATURA_DE_TESTE,
      AGORA,
    );

    expect(alegacoes).toMatchObject({
      identidadeId: "identidade-1",
      papel: "OWNER",
      sessaoId: "sessao-1",
      familiaId: "familia-1",
    });
    expect(alegacoes.expiraEm.getTime() - AGORA.getTime()).toBe(
      DURACAO_DO_TOKEN_DE_ACESSO_EM_SEGUNDOS * 1_000,
    );
  });

  it("recusa token adulterado, assinado com outra chave ou vencido", () => {
    const token = tokenValido();
    const adulterado = `${token.slice(0, -1)}x`;

    expect(() =>
      verificarTokenDeAcesso(adulterado, SEGREDO_DE_ASSINATURA_DE_TESTE, AGORA),
    ).toThrow(ErroDeTokenInvalido);
    expect(() =>
      verificarTokenDeAcesso(token, "outra-assinatura-inaceitavel", AGORA),
    ).toThrow(ErroDeTokenInvalido);
    expect(() =>
      verificarTokenDeAcesso(
        token,
        SEGREDO_DE_ASSINATURA_DE_TESTE,
        new Date(
          AGORA.getTime() + DURACAO_DO_TOKEN_DE_ACESSO_EM_SEGUNDOS * 1_000,
        ),
      ),
    ).toThrow(ErroDeTokenInvalido);
  });
});

describe("credenciais recebidas", () => {
  it("aceita somente Bearer JWT e persiste somente o resumo do refresh", () => {
    expect(tokenDoCabecalhoDeAutorizacao(`Bearer ${tokenValido()}`)).toBe(
      tokenValido(),
    );
    expect(
      tokenDoCabecalhoDeAutorizacao("Basic usuario:senha"),
    ).toBeUndefined();
    expect(resumirTokenDeRenovacao("refresh-original")).not.toBe(
      "refresh-original",
    );
  });
});
