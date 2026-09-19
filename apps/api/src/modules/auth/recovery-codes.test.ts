import { describe, expect, it, vi } from "vitest";

import {
  criarCodigosDeRecuperacao,
  resumirCodigo,
  usarCodigoDeRecuperacao,
  type RepositorioDeCodigosDeRecuperacao,
} from "./recovery-codes.ts";

describe("códigos de recuperação", () => {
  it("@spec:AC-123 consumo único libera a sessão, avisa por e-mail e orienta recadastrar o aplicativo", async () => {
    const consumir = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const criarSessao = vi.fn().mockResolvedValue({ sessaoId: "sessao-nova" });
    const avisarUso = vi.fn().mockResolvedValue(undefined);
    const repositorio: RepositorioDeCodigosDeRecuperacao = {
      criar: vi.fn().mockResolvedValue(undefined),
      consumir,
    };

    await expect(
      usarCodigoDeRecuperacao(
        { identidadeId: "dono-1", codigo: "ABCD-EFGH" },
        { repositorio, avisador: { avisarUso }, criarSessao },
      ),
    ).resolves.toEqual({
      status: "SESSAO_LIBERADA",
      sessaoId: "sessao-nova",
      orientarPara: "/minha-conta/seguranca/aplicativo",
    });
    await expect(
      usarCodigoDeRecuperacao(
        { identidadeId: "dono-1", codigo: "ABCD-EFGH" },
        { repositorio, avisador: { avisarUso }, criarSessao },
      ),
    ).resolves.toEqual({ status: "CODIGO_INVALIDO" });
    expect(avisarUso).toHaveBeenCalledOnce();
    expect(criarSessao).toHaveBeenCalledOnce();
  });

  it("códigos gerados são devolvidos uma vez e persistidos somente como resumo", async () => {
    const criar = vi.fn().mockResolvedValue(undefined);
    const repositorio: RepositorioDeCodigosDeRecuperacao = { criar, consumir: vi.fn() };
    const codigos = await criarCodigosDeRecuperacao(
      "dono-1",
      repositorio,
      2,
      () => Uint8Array.from([1, 2, 3, 4, 5]),
    );

    expect(codigos).toHaveLength(2);
    expect(criar).toHaveBeenCalledWith(
      codigos.map((codigo) => ({ identidadeId: "dono-1", resumo: resumirCodigo(codigo) })),
    );
    expect(JSON.stringify(criar.mock.calls[0])).not.toContain(codigos[0]);
  });
});
