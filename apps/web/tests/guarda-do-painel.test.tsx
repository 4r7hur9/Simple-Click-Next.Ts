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
vi.mock("../src/features/dashboard/InicioDoPainel.tsx", () => ({
  InicioDoPainel: () => "resumo da loja",
}));

import PaginaInicialDoPainel from "../src/app/(painel)/painel/page.tsx";
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

describe("o aviso de loja trocada no início do painel (card #170, CA-16)", () => {
  async function inicio(busca: Record<string, string | string[] | undefined>) {
    return renderToStaticMarkup(
      await PaginaInicialDoPainel({ searchParams: Promise.resolve(busca) }),
    );
  }

  it("[CA-16] quem chega por escolher-loja/propria vê o aviso com o nome da loja da própria conta", async () => {
    const html = await inicio({ loja: "trocada" });
    expect(html).toContain("Abrimos a sua loja");
    expect(html).toContain("Pastelaria da Vila");
    expect(html).toContain("resumo da loja");
    // Um texto só, que não diz se a loja antiga era inexistente ou alheia.
    expect(html).toContain("não está mais entre as suas");
  });

  it("[CA-16] só o valor exato ?loja=trocada mostra o aviso, e o valor nunca é refletido", async () => {
    for (const loja of [undefined, "", "outra", "TROCADA", "<b>trocada</b>", ["trocada", "x"]]) {
      const html = await inicio({ loja });
      expect(html).not.toContain("Abrimos a sua loja");
      expect(html).toContain("resumo da loja");
      expect(html).not.toContain("outra");
      expect(html).not.toContain("<b>");
    }
  });
});
