/**
 * Prova da guarda das áreas do dono (card #31): a equipe que abre o endereço
 * de uma área só do dono vê a tela "Sem permissão", e a página nem é montada;
 * o dono entra normalmente.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessao = vi.hoisted(() => ({
  loja: { apelido: "pastelaria", nome: "Pastelaria da Vila", papel: "STAFF" },
}));
vi.mock("../src/server/loja-da-pagina.ts", () => ({
  exigirLojaDaPagina: async () => ({ loja: sessao.loja, lojas: [sessao.loja] }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/painel" }));

import { GuardaDoPainel } from "../src/app/_painel/GuardaDoPainel.tsx";

async function desenhar(
  permissao: Parameters<typeof GuardaDoPainel>[0]["permissao"],
) {
  return renderToStaticMarkup(
    await GuardaDoPainel({
      permissao,
      children: <p>conteúdo da área</p>,
    }),
  );
}

beforeEach(() => {
  sessao.loja = {
    apelido: "pastelaria",
    nome: "Pastelaria da Vila",
    papel: "STAFF",
  };
});

describe("a guarda das áreas do dono", () => {
  it.each(["equipe", "feed", "configuracoes", "personalizacao"] as const)(
    "a equipe vê 'Sem permissão' em %s e o conteúdo não aparece",
    async (permissao) => {
      const html = await desenhar(permissao);
      expect(html).toContain("Sem permissão");
      expect(html).toContain("Pastelaria da Vila");
      expect(html).toContain("Equipe");
      expect(html).toContain('href="/painel"');
      expect(html).not.toContain("conteúdo da área");
    },
  );

  it("o dono entra em qualquer área", async () => {
    sessao.loja = { ...sessao.loja, papel: "OWNER" };
    for (const permissao of ["equipe", "feed", "configuracoes"] as const) {
      const html = await desenhar(permissao);
      expect(html).toContain("conteúdo da área");
      expect(html).not.toContain("Sem permissão");
    }
  });

  it("respeita a lista de permissões vinda da API", async () => {
    sessao.loja = {
      ...sessao.loja,
      permissoes: ["feed"],
    } as typeof sessao.loja;
    expect(await desenhar("feed")).toContain("conteúdo da área");
    expect(await desenhar("equipe")).toContain("Sem permissão");
  });
});
