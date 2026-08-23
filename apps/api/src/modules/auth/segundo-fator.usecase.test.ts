import { describe, expect, it, vi } from "vitest";

import {
  confirmarSegundoFator,
  type DependenciasDoSegundoFator,
  type ResultadoDaValidacaoDoDesafio,
} from "./segundo-fator.usecase.ts";

function dependenciasCom(
  validar: (codigo: string) => ResultadoDaValidacaoDoDesafio,
): DependenciasDoSegundoFator {
  return {
    desafios: {
      validarEConsumir: vi
        .fn()
        .mockImplementation(({ codigo }: { codigo: string }) =>
          Promise.resolve(validar(codigo)),
        ),
    },
    criarSessao: vi.fn().mockResolvedValue({ sessaoId: "sessao-123" }),
  };
}

describe("confirmação do segundo fator", () => {
  it("@spec:AC-106 código correto cria a sessão e o código não serve de novo", async () => {
    let consumido = false;
    const dependencias = dependenciasCom((codigo) => {
      if (consumido) return { status: "INVALIDO" };
      if (codigo !== "123456")
        return { status: "CODIGO_INCORRETO", tentativasRestantes: 4 };
      consumido = true;
      return { status: "ACEITO", identidadeId: "identidade-dono" };
    });

    const primeiro = await confirmarSegundoFator(
      { desafioId: "desafio-123", codigo: "123456" },
      dependencias,
    );
    const reuso = await confirmarSegundoFator(
      { desafioId: "desafio-123", codigo: "123456" },
      dependencias,
    );

    expect(primeiro).toEqual({
      status: "SESSAO_CRIADA",
      sessaoId: "sessao-123",
    });
    expect(reuso).toEqual({ status: "DESAFIO_INVALIDO" });
    expect(dependencias.criarSessao).toHaveBeenCalledTimes(1);
  });

  it("@spec:AC-107 código errado tem cinco tentativas, bloqueia e invalida o desafio", async () => {
    let tentativas = 0;
    let bloqueado = false;
    const dependencias = dependenciasCom(() => {
      if (bloqueado) return { status: "INVALIDO" };
      tentativas += 1;
      if (tentativas === 5) {
        bloqueado = true;
        return { status: "BLOQUEADO" };
      }
      return {
        status: "CODIGO_INCORRETO",
        tentativasRestantes: 5 - tentativas,
      };
    });

    for (let tentativa = 1; tentativa < 5; tentativa += 1) {
      await expect(
        confirmarSegundoFator(
          { desafioId: "desafio-123", codigo: "000000" },
          dependencias,
        ),
      ).resolves.toMatchObject({
        status: "CODIGO_INCORRETO",
        tentativasRestantes: 5 - tentativa,
      });
    }

    await expect(
      confirmarSegundoFator(
        { desafioId: "desafio-123", codigo: "000000" },
        dependencias,
      ),
    ).resolves.toEqual({
      status: "BLOQUEADO",
      mensagem: "A tentativa foi bloqueada. Comece o login de novo.",
    });
    await expect(
      confirmarSegundoFator(
        { desafioId: "desafio-123", codigo: "123456" },
        dependencias,
      ),
    ).resolves.toEqual({ status: "DESAFIO_INVALIDO" });
    expect(dependencias.criarSessao).not.toHaveBeenCalled();
  });
});
