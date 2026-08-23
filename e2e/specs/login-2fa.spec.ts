import { describe, expect, it, vi } from "vitest";

import {
  entrarComSenha,
  type DependenciasDoLogin,
} from "../../apps/api/src/modules/auth/login.usecase.ts";
import { responderSessaoDoNavegador } from "../../apps/web/src/server/sessao.ts";

describe("login com segundo fator", () => {
  it("@spec:AC-105 senha correta pede o segundo fator antes de liberar a sessão", async () => {
    const criarSessao = vi.fn();
    const dependencias: DependenciasDoLogin = {
      identidades: {
        buscarPorEmail: vi.fn().mockResolvedValue({
          id: "dono-1",
          email: "dono@exemplo.com",
          senhaHash: "resumo-da-senha",
          emailVerificado: true,
          papel: "DONO",
          segundoFatorAtivado: false,
        }),
      },
      conferirSenha: vi.fn().mockResolvedValue(true),
      criarDesafioDeSegundoFator: vi
        .fn()
        .mockResolvedValue({ desafioId: "desafio-2fa" }),
      criarSessao,
    };

    const resposta = await entrarComSenha(
      { email: "dono@exemplo.com", senha: "Cacto azul sob a lua 2026!" },
      dependencias,
    );

    expect(resposta).toEqual({
      status: "DESAFIO_DE_SEGUNDO_FATOR",
      desafioId: "desafio-2fa",
    });
    expect(criarSessao).not.toHaveBeenCalled();
  });

  it("@spec:AC-109 sessão criada no navegador expõe só um cookie inacessível a script", async () => {
    const resposta = responderSessaoDoNavegador(
      {
        tokenDeAcesso: "acesso-inacessivel-ao-script",
        tokenDeRenovacao: "refresh-somente-no-cookie",
        acessoExpiraEm: "2026-08-23T12:15:00.000Z",
      },
      { NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: "simpleclick.test" },
    );

    expect(resposta.headers.get("set-cookie")).toEqual(
      expect.stringMatching(/HttpOnly; Secure; SameSite=Lax/),
    );
    expect(await resposta.json()).toEqual({
      autenticado: true,
      acessoExpiraEm: "2026-08-23T12:15:00.000Z",
    });
  });
});
