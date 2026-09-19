import { describe, expect, it, vi } from "vitest";

import {
  criarLojaEConvidarDono,
  definirPrimeiraSenha,
  reenviarConviteDoDono,
  type DependenciasDeConvite,
} from "./convite.usecase.ts";

const AGORA = new Date("2026-08-23T12:00:00.000Z");

function criarDependencias(): DependenciasDeConvite {
  return {
    repositorio: {
      criarLojaEConvite: vi.fn().mockResolvedValue({
        lojaId: "loja-1",
        codigoDaLoja: "0002",
        statusInicial: "ATIVA",
      }),
      consumirConviteEDefinirSenha: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false),
      reenviarConvite: vi
        .fn()
        .mockResolvedValue({ email: "dona@exemplo.test", nome: "Dona" }),
    },
    enviarConvite: vi.fn().mockResolvedValue(undefined),
    validarNovaSenha: vi.fn().mockResolvedValue(undefined),
    gerarHashDaSenha: vi.fn().mockResolvedValue("hash-da-primeira-senha"),
    agora: () => AGORA,
    gerarToken: () => "convite-de-uso-unico",
    resumirToken: (token) => `resumo:${token}`,
  };
}

describe("convite do dono", () => {
  it("@spec:AC-200 cadastro completo cria a loja, o acesso do dono e envia convite para definir a senha", async () => {
    const dependencias = criarDependencias();
    const resultado = await criarLojaEConvidarDono(
      {
        nome: "Loja da Dona",
        apelido: "loja-da-dona",
        tipoDeNegocio: "ALIMENTACAO",
        dono: {
          nome: "Dona",
          email: "dona@exemplo.test",
          telefone: "+5511999999999",
        },
      },
      dependencias,
    );

    expect(resultado).toEqual({
      lojaId: "loja-1",
      codigoDaLoja: "0002",
      statusInicial: "ATIVA",
    });
    expect(dependencias.repositorio.criarLojaEConvite).toHaveBeenCalledWith({
      loja: expect.objectContaining({ apelido: "loja-da-dona" }),
      convite: {
        resumoDoToken: "resumo:convite-de-uso-unico",
        expiraEm: new Date("2026-08-30T12:00:00.000Z"),
      },
    });
    expect(dependencias.enviarConvite).toHaveBeenCalledWith(
      expect.objectContaining({
        para: "dona@exemplo.test",
        token: "convite-de-uso-unico",
      }),
    );
  });

  it("@spec:AC-103 convite válido define a primeira senha, libera o acesso e não funciona uma segunda vez", async () => {
    const dependencias = criarDependencias();

    await expect(
      definirPrimeiraSenha(
        { token: "convite-valido", senha: "Senha muito segura" },
        dependencias,
      ),
    ).resolves.toEqual({ ok: true, acessoLiberado: true });
    await expect(
      definirPrimeiraSenha(
        { token: "convite-valido", senha: "Senha muito segura" },
        dependencias,
      ),
    ).resolves.toEqual({ ok: false, motivo: "CONVITE_INVALIDO" });
    expect(
      dependencias.repositorio.consumirConviteEDefinirSenha,
    ).toHaveBeenCalledWith({
      resumoDoToken: "resumo:convite-valido",
      hashDaSenha: "hash-da-primeira-senha",
      agora: AGORA,
    });
  });

  it("substitui o link ao reenviar o convite pendente", async () => {
    const dependencias = criarDependencias();

    await expect(reenviarConviteDoDono("loja-1", dependencias)).resolves.toBe(
      true,
    );
    expect(dependencias.repositorio.reenviarConvite).toHaveBeenCalledWith({
      lojaId: "loja-1",
      resumoDoToken: "resumo:convite-de-uso-unico",
      expiraEm: new Date("2026-08-30T12:00:00.000Z"),
      agora: AGORA,
    });
  });
});
