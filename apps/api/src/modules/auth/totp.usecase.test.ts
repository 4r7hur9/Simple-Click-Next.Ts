import { describe, expect, it, vi } from "vitest";

import {
  ativarAplicativoTotp,
  decidirSegundoFatorObrigatorio,
  gerarCodigoTotp,
  prepararAtivacaoTotp,
  validarCodigoTotp,
  type RepositorioTotp,
} from "./totp.usecase.ts";

const AGORA = new Date("2026-08-23T15:00:00.000Z");
const SEGREDO = "JBSWY3DPEHPK3PXP";

function repositorioCom(
  ajustes: Partial<RepositorioTotp> = {},
): RepositorioTotp {
  return {
    guardarPendente: vi.fn().mockResolvedValue(undefined),
    ativarSeCodigoConfere: vi.fn().mockResolvedValue(true),
    buscar: vi.fn().mockResolvedValue(null),
    validarEConsumir: vi.fn().mockResolvedValue(true),
    ...ajustes,
  };
}

describe("aplicativo autenticador", () => {
  it("@spec:AC-121 ativação confirma o código, cifra o segredo e entrega recuperações", async () => {
    const repositorio = repositorioCom();
    const cifrar = vi.fn().mockResolvedValue("cifrado-do-segredo");
    const gerarRecuperacoes = vi
      .fn()
      .mockResolvedValue(["ABCD-EFGH", "JKLM-NPQR"]);

    const preparada = await prepararAtivacaoTotp(
      "dono-1",
      "dono@exemplo.com",
      { repositorio, cifrador: { cifrar } },
      () => Uint8Array.from([65, 66, 67, 68, 69, 70, 71, 72, 73, 74]),
    );
    const resultado = await ativarAplicativoTotp("dono-1", "123456", {
      repositorio,
      cifrador: { cifrar },
      gerarCodigosDeRecuperacao: gerarRecuperacoes,
      agora: () => AGORA,
    });

    expect(preparada.uriDoAplicativo).toContain("otpauth://totp/");
    expect(cifrar).toHaveBeenCalledWith(preparada.segredo);
    expect(repositorio.guardarPendente).toHaveBeenCalledWith({
      identidadeId: "dono-1",
      segredoCifrado: "cifrado-do-segredo",
      ativo: false,
    });
    expect(resultado).toEqual({
      status: "ATIVADO",
      codigosDeRecuperacao: ["ABCD-EFGH", "JKLM-NPQR"],
    });
  });

  it("@spec:AC-122 administrador sem aplicativo só pode ir para a configuração", () => {
    expect(decidirSegundoFatorObrigatorio("ADMINISTRADOR", false)).toEqual({
      status: "CONFIGURACAO_OBRIGATORIA",
      caminho: "/conta/seguranca/aplicativo",
    });
    expect(decidirSegundoFatorObrigatorio("ADMINISTRADOR", true)).toEqual({
      status: "PODE_CONTINUAR",
    });
  });

  it("@spec:AC-124 código do aplicativo consumido não pode ser usado outra vez", async () => {
    const validarEConsumir = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const repositorio = repositorioCom({ validarEConsumir });
    const codigo = gerarCodigoTotp(SEGREDO, AGORA);

    await expect(
      validarCodigoTotp("dono-1", codigo, { repositorio, agora: () => AGORA }),
    ).resolves.toBe("ACEITO");
    await expect(
      validarCodigoTotp("dono-1", codigo, { repositorio, agora: () => AGORA }),
    ).resolves.toBe("INVALIDO");
    expect(validarEConsumir).toHaveBeenNthCalledWith(1, {
      identidadeId: "dono-1",
      codigo,
      agora: AGORA,
    });
  });
});
