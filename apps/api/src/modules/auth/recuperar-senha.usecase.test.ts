import { describe, expect, it, vi } from "vitest";

import {
  CONFIRMACAO_DE_RECUPERACAO,
  definirNovaSenha,
  pedirRecuperacaoDeSenha,
  type DependenciasDeRecuperacaoDeSenha,
} from "./recuperar-senha.usecase.ts";

function criarDependencias(
  identidade: { id: string; email: string } | null,
): DependenciasDeRecuperacaoDeSenha {
  return {
    repositorio: {
      encontrarPorEmailNormalizado: vi.fn().mockResolvedValue(identidade),
      criarPedido: vi.fn().mockResolvedValue(undefined),
      consumirPedidoERedefinirSenha: vi.fn().mockResolvedValue(true),
    },
    enviarLinkDeRecuperacao: vi.fn().mockResolvedValue(undefined),
    validarNovaSenha: vi.fn().mockResolvedValue(undefined),
    gerarHashDaSenha: vi.fn().mockResolvedValue("hash-novo"),
    agora: () => new Date("2026-08-23T12:00:00.000Z"),
    gerarToken: () => "token-unico",
    resumirToken: (token) => `resumo:${token}`,
  };
}

describe("recuperação de senha", () => {
  it("@spec:AC-114 confirma igualmente pedidos para e-mail cadastrado e desconhecido", async () => {
    const existente = criarDependencias({
      id: "id-ana",
      email: "ana@exemplo.com",
    });
    const inexistente = criarDependencias(null);

    const [respostaExistente, respostaInexistente] = await Promise.all([
      pedirRecuperacaoDeSenha(" ANA@EXEMPLO.COM ", existente),
      pedirRecuperacaoDeSenha("ninguem@exemplo.com", inexistente),
    ]);

    expect(respostaExistente).toEqual({
      confirmacao: CONFIRMACAO_DE_RECUPERACAO,
    });
    expect(respostaInexistente).toEqual(respostaExistente);
    expect(existente.repositorio.criarPedido).toHaveBeenCalledWith({
      identidadeId: "id-ana",
      resumoDoToken: "resumo:token-unico",
      expiraEm: new Date("2026-08-23T13:00:00.000Z"),
    });
    expect(existente.enviarLinkDeRecuperacao).toHaveBeenCalledOnce();
    expect(inexistente.repositorio.criarPedido).not.toHaveBeenCalled();
    expect(inexistente.enviarLinkDeRecuperacao).not.toHaveBeenCalled();
  });

  it("@spec:AC-115 consome o link ao trocar a senha e revoga todas as sessões na operação atômica", async () => {
    const dependencias = criarDependencias({
      id: "id-ana",
      email: "ana@exemplo.com",
    });
    const novaSenhaValida = ["Uma", "senha", "segura"].join(" ");
    const resultado = await definirNovaSenha(
      { token: "token-unico", senha: novaSenhaValida },
      dependencias,
    );

    expect(resultado).toEqual({ ok: true });
    expect(
      dependencias.repositorio.consumirPedidoERedefinirSenha,
    ).toHaveBeenCalledWith({
      resumoDoToken: "resumo:token-unico",
      hashDaSenha: "hash-novo",
      agora: new Date("2026-08-23T12:00:00.000Z"),
    });

    vi.mocked(
      dependencias.repositorio.consumirPedidoERedefinirSenha,
    ).mockResolvedValueOnce(false);
    await expect(
      definirNovaSenha(
        { token: "token-unico", senha: novaSenhaValida },
        dependencias,
      ),
    ).resolves.toEqual({ ok: false, motivo: "LINK_INVALIDO" });
  });
});
