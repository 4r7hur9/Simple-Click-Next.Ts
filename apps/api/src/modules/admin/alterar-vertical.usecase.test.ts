import { describe, expect, it } from "vitest";

import {
  alterarTipoDeNegocio,
  registroDaTroca,
  type RepositorioDoTipoDeNegocio,
  type TipoDeNegocioDaPlataforma,
} from "./alterar-vertical.usecase.ts";

const LANCHONETE: TipoDeNegocioDaPlataforma = {
  codigo: "FOOD_SNACK",
  nome: "Lanchonete",
  versaoDoEsquema: 1,
  controlaEstoque: false,
};

const ROUPAS: TipoDeNegocioDaPlataforma = {
  codigo: "APPAREL",
  nome: "Roupas",
  versaoDoEsquema: 1,
  controlaEstoque: true,
};

function repositorio(atual: TipoDeNegocioDaPlataforma | null) {
  const gravados: { lojaId: string; tipo: TipoDeNegocioDaPlataforma }[] = [];
  const registrados: Parameters<RepositorioDoTipoDeNegocio["registrar"]>[0][] =
    [];
  const repo: RepositorioDoTipoDeNegocio = {
    lerTipoAtual: async () => atual,
    lerTipo: async (codigo) =>
      [LANCHONETE, ROUPAS].find((tipo) => tipo.codigo === codigo) ?? null,
    gravarTipo: async (lojaId, tipo) => {
      gravados.push({ lojaId, tipo });
    },
    registrar: async (ato) => {
      registrados.push(ato);
    },
  };
  return { repo, gravados, registrados };
}

describe("troca do tipo de negócio (AC-214)", () => {
  it("@spec:AC-214 troca o ramo da loja e registra quem trocou, de qual para qual, com o controle de estoque de cada um", async () => {
    const { repo, gravados, registrados } = repositorio(LANCHONETE);

    const resultado = await alterarTipoDeNegocio(
      "loja-1",
      "APPAREL",
      "admin-1",
      repo,
    );

    expect(resultado).toEqual({
      ok: true,
      mudou: true,
      de: LANCHONETE,
      para: ROUPAS,
    });
    expect(gravados).toEqual([{ lojaId: "loja-1", tipo: ROUPAS }]);
    expect(registrados).toEqual([
      {
        lojaId: "loja-1",
        atorId: "admin-1",
        acao: "TIPO_DE_NEGOCIO_ALTERADO",
        antes: {
          campos: { tipoDeNegocio: "FOOD_SNACK", controlaEstoque: false },
        },
        depois: {
          campos: { tipoDeNegocio: "APPAREL", controlaEstoque: true },
        },
      },
    ]);
  });

  it("@spec:AC-214 pedir o tipo que a loja já tem não grava nem registra nada", async () => {
    const { repo, gravados, registrados } = repositorio(ROUPAS);
    const resultado = await alterarTipoDeNegocio(
      "loja-1",
      "APPAREL",
      "admin-1",
      repo,
    );
    expect(resultado).toMatchObject({ ok: true, mudou: false });
    expect(gravados).toEqual([]);
    expect(registrados).toEqual([]);
  });

  it("@spec:AC-214 tipo fora do catálogo da plataforma e loja inexistente são recusados sem gravar", async () => {
    const semTipo = repositorio(LANCHONETE);
    expect(
      await alterarTipoDeNegocio("loja-1", "NAVE", "admin-1", semTipo.repo),
    ).toEqual({ ok: false, motivo: "TIPO_DESCONHECIDO" });
    expect(semTipo.gravados).toEqual([]);

    const semLoja = repositorio(null);
    expect(
      await alterarTipoDeNegocio("loja-x", "APPAREL", "admin-1", semLoja.repo),
    ).toEqual({ ok: false, motivo: "NAO_ENCONTRADA" });
    expect(semLoja.registrados).toEqual([]);
  });

  it("@spec:AC-214 o registro da troca não carrega nada além dos códigos de ramo", () => {
    expect(registroDaTroca(ROUPAS, LANCHONETE)).toEqual({
      antes: { campos: { tipoDeNegocio: "APPAREL", controlaEstoque: true } },
      depois: {
        campos: { tipoDeNegocio: "FOOD_SNACK", controlaEstoque: false },
      },
    });
  });
});
