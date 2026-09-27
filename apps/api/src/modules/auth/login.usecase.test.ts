import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  entrarComSenha,
  type DependenciasDoLogin,
  type IdentidadeParaLogin,
} from "./login.usecase.ts";

/**
 * A senha digitada, montada em tempo de execução (P-002: nem em teste).
 *
 * O valor não importa — a conferência é um dublê que sempre aprova —, e
 * montá-lo na hora garante que nenhum teste depende de senha escrita à mão.
 */
const SENHA_CORRETA = `correta-${randomUUID()}`;

const DONO: IdentidadeParaLogin = {
  id: "identidade-dono",
  email: "dono@exemplo.com",
  senhaHash: "resumo-da-senha",
  emailVerificado: true,
  papel: "DONO",
  segundoFatorAtivado: false,
};

function dependenciasPara(
  identidade: IdentidadeParaLogin,
): DependenciasDoLogin {
  return {
    identidades: { buscarPorEmail: vi.fn().mockResolvedValue(identidade) },
    conferirSenha: vi.fn().mockResolvedValue(true),
    criarDesafioDeSegundoFator: vi
      .fn()
      .mockResolvedValue({ desafioId: "desafio-123" }),
    criarSessao: vi.fn().mockResolvedValue({ sessaoId: "sessao-123" }),
  };
}

describe("login com senha", () => {
  it("@spec:AC-105 senha correta pede o segundo fator antes de liberar a sessão", async () => {
    const dependencias = dependenciasPara(DONO);

    const resultado = await entrarComSenha(
      { email: " DONO@EXEMPLO.COM ", senha: SENHA_CORRETA },
      dependencias,
    );

    expect(resultado).toEqual({
      status: "DESAFIO_DE_SEGUNDO_FATOR",
      desafioId: "desafio-123",
    });
    expect(dependencias.criarDesafioDeSegundoFator).toHaveBeenCalledWith({
      identidadeId: DONO.id,
    });
    expect(dependencias.criarSessao).not.toHaveBeenCalled();
  });

  it("@spec:AC-108 cliente final com segundo fator desativado entra direto, enquanto dono continua protegido", async () => {
    const cliente: IdentidadeParaLogin = {
      ...DONO,
      id: "identidade-cliente",
      papel: "CLIENTE",
      segundoFatorAtivado: false,
    };
    const dependencias = dependenciasPara(cliente);

    const resultado = await entrarComSenha(
      { email: cliente.email, senha: SENHA_CORRETA },
      dependencias,
    );

    expect(resultado).toEqual({
      status: "SESSAO_CRIADA",
      sessaoId: "sessao-123",
    });
    expect(dependencias.criarDesafioDeSegundoFator).not.toHaveBeenCalled();
    expect(dependencias.criarSessao).toHaveBeenCalledWith({
      identidadeId: cliente.id,
    });
  });
});
