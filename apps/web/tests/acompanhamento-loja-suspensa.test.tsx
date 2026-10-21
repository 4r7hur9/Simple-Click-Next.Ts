/**
 * A página de acompanhamento do pedido de loja SUSPENSA (AC-209; Q-203).
 *
 * A loja suspensa some da vitrine — a página da loja responde "não
 * disponível" —, mas o cliente que já pediu continua acompanhando o pedido
 * pelo link (decisão de 03/10/2026). Antes, a página do pedido pedia a
 * vitrine e, sem ela, respondia "não encontrado". Agora quem decide é o
 * acompanhamento; a vitrine só empresta a cor.
 *
 * Que a API devolve o pedido da loja suspensa, e não o da excluída, está
 * provado contra o banco em `apps/api/tests/admin-situacao.test.ts`.
 */
import { PALETA_CLARA } from "@simpleclick/ui";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const vitrine = vi.hoisted(() => ({ buscarVitrine: vi.fn() }));
const acompanhamento = vi.hoisted(() => ({ buscarAcompanhamento: vi.fn() }));

vi.mock("../src/server/vitrine.ts", () => vitrine);
vi.mock("../src/lib/acompanhamento.ts", () => acompanhamento);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import PaginaDeAcompanhamento from "../src/app/(loja)/loja/[slug]/pedido/[token]/page.tsx";

const PEDIDO = { numero: 12, status: "ACCEPTED" };

function parametros() {
  return {
    params: Promise.resolve({ slug: "pastel-da-joi", token: "t".repeat(32) }),
  };
}

beforeEach(() => {
  vitrine.buscarVitrine.mockReset();
  acompanhamento.buscarAcompanhamento.mockReset();
});

describe("o pedido da loja suspensa continua acompanhável (AC-209, Q-203)", () => {
  it("@spec:AC-209 sem a vitrine (loja suspensa), a página mostra o pedido, com a cor padrão", async () => {
    vitrine.buscarVitrine.mockResolvedValue({ estado: "nao-encontrada" });
    acompanhamento.buscarAcompanhamento.mockResolvedValue({
      estado: "encontrado",
      acompanhamento: { pedido: PEDIDO },
    });

    const pagina = (await PaginaDeAcompanhamento(
      parametros(),
    )) as ReactElement<{
      inicial: unknown;
      corPrincipal: string;
      apelidoDaLoja: string;
    }>;

    expect(pagina.props.inicial).toEqual(PEDIDO);
    expect(pagina.props.apelidoDaLoja).toBe("pastel-da-joi");
    expect(pagina.props.corPrincipal).toBe(PALETA_CLARA.primaria);
  });

  it("@spec:AC-209 pedido que o acompanhamento não encontra (loja excluída, link errado) continua sendo página inexistente", async () => {
    vitrine.buscarVitrine.mockResolvedValue({ estado: "nao-encontrada" });
    acompanhamento.buscarAcompanhamento.mockResolvedValue({
      estado: "nao-encontrado",
    });

    await expect(PaginaDeAcompanhamento(parametros())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("@spec:AC-209 com a loja no ar, a cor continua sendo a da loja", async () => {
    vitrine.buscarVitrine.mockResolvedValue({
      estado: "encontrada",
      vitrine: {
        loja: {
          nome: "Pastel da Joi",
          tema: {
            corDestaque: "#aa3300",
            fundoVitrine: null,
            topoCardapio: null,
          },
        },
      },
    });
    acompanhamento.buscarAcompanhamento.mockResolvedValue({
      estado: "encontrado",
      acompanhamento: { pedido: PEDIDO },
    });

    const pagina = (await PaginaDeAcompanhamento(
      parametros(),
    )) as ReactElement<{
      corPrincipal: string;
    }>;

    expect(pagina.props.corPrincipal).toBe("#aa3300");
  });
});
