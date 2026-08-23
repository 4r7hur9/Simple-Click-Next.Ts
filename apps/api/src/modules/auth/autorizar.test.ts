import { describe, expect, it, vi } from "vitest";

import {
  ErroDeAcessoNegado,
  exigirAcessoALoja,
  podeAcessarAreaAdministrativa,
  podeAcessarPainelDaLoja,
  consultarDadosDaLojaComoAdministrador,
  rotaSeguraParaAreaDeGestao,
} from "./autorizar.ts";

const LOJA_A = "11111111-1111-4111-8111-111111111111";
const LOJA_B = "22222222-2222-4222-8222-222222222222";

describe("autorização por papel", () => {
  it("@spec:AC-116 dono não passa pela autorização da aplicação ao informar a URL de outra loja", () => {
    const donoDaLojaA = {
      identidadeId: "identidade-dono-a",
      papel: "OWNER" as const,
      lojasPermitidas: [LOJA_A],
    };

    expect(() => exigirAcessoALoja(donoDaLojaA, LOJA_B)).toThrow(
      ErroDeAcessoNegado,
    );
    expect(() => exigirAcessoALoja(donoDaLojaA, LOJA_B)).toThrow(
      "Você não tem permissão para acessar esta área.",
    );
    expect(() => exigirAcessoALoja(donoDaLojaA, LOJA_B)).not.toThrow(LOJA_B);
  });

  it("@spec:AC-117 cliente final recebe rota neutra e não ganha acesso a nenhuma área de gestão", () => {
    const cliente = {
      identidadeId: "identidade-cliente",
      papel: "CUSTOMER" as const,
      lojasPermitidas: [],
    };

    expect(podeAcessarPainelDaLoja(cliente)).toBe(false);
    expect(podeAcessarAreaAdministrativa(cliente)).toBe(false);
    expect(rotaSeguraParaAreaDeGestao(cliente, "painel")).toBe(
      "/sem-permissao",
    );
    expect(rotaSeguraParaAreaDeGestao(cliente, "administracao")).toBe(
      "/sem-permissao",
    );
  });

  it("@spec:AC-118 administrador consulta qualquer loja e registra quem, o que e quando", async () => {
    const registrarAcesso = vi.fn().mockResolvedValue(undefined);
    const consultar = vi.fn().mockResolvedValue([{ id: "pedido-1" }]);
    const agora = new Date("2026-08-23T15:00:00.000Z");

    await expect(
      consultarDadosDaLojaComoAdministrador(
        {
          identidadeId: "identidade-admin",
          papel: "ADMIN",
          lojasPermitidas: [],
        },
        {
          lojaId: LOJA_B,
          entidade: "orders",
          entidadeId: "pedido-1",
          registrarAcesso,
          consultar,
          agora: () => agora,
        },
      ),
    ).resolves.toEqual([{ id: "pedido-1" }]);

    expect(registrarAcesso).toHaveBeenCalledWith({
      lojaId: LOJA_B,
      atorId: "identidade-admin",
      papelDoAtor: "ADMIN",
      acao: "ADMIN_ACCESS",
      entidade: "orders",
      entidadeId: "pedido-1",
      ocorridoEm: agora,
    });
    expect(consultar).toHaveBeenCalledOnce();
  });
});
