import { esquemaDaConsultaDeLojas } from "@simpleclick/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  listarLojas,
  prepararBuscaDeLojas,
  type BuscaDeLojas,
  type RepositorioDaListagem,
} from "./listar-lojas.usecase.ts";

/** A consulta como a borda a entrega: já com os padrões preenchidos. */
function consulta(bruta: Record<string, unknown> = {}) {
  return esquemaDaConsultaDeLojas.parse(bruta);
}

describe("busca de lojas (AC-206)", () => {
  it("@spec:AC-206 um campo só serve para nome, documento e código: o texto vai em minúsculas e o documento vira só dígitos", () => {
    expect(
      prepararBuscaDeLojas(consulta({ busca: "  Pastel da JOI " })),
    ).toMatchObject({
      texto: "pastel da joi",
      digitos: "",
    });
    expect(
      prepararBuscaDeLojas(consulta({ busca: "11.222.333/0001-81" })),
    ).toMatchObject({ texto: "11.222.333/0001-81", digitos: "11222333000181" });
    // O código de atendimento é numérico e casa pelos dois caminhos.
    expect(prepararBuscaDeLojas(consulta({ busca: "0002" }))).toMatchObject({
      texto: "0002",
      digitos: "0002",
    });
  });

  it("@spec:AC-206 dígito solto não vira busca por documento, senão casaria com toda a plataforma", () => {
    expect(prepararBuscaDeLojas(consulta({ busca: "1" })).digitos).toBe("");
    expect(prepararBuscaDeLojas(consulta({ busca: "loja 2" })).digitos).toBe(
      "",
    );
  });

  it("@spec:AC-206 sem filtro a lista traz tudo que não foi excluído; com filtro, só a situação pedida", () => {
    expect(prepararBuscaDeLojas(consulta()).situacao).toBeNull();
    expect(
      prepararBuscaDeLojas(consulta({ situacao: "SUSPENDED" })).situacao,
    ).toBe("SUSPENDED");
  });

  it("@spec:AC-206 a página vira limite e deslocamento, e a resposta devolve o total para a tela paginar", async () => {
    const recebidas: BuscaDeLojas[] = [];
    const repositorio: RepositorioDaListagem = {
      buscarLojas: vi.fn(async (busca: BuscaDeLojas) => {
        recebidas.push(busca);
        return { lojas: [], total: 57 };
      }),
    };

    const lista = await listarLojas(
      consulta({ pagina: "3", porPagina: "20" }),
      repositorio,
    );

    expect(recebidas[0]).toMatchObject({ limite: 20, deslocamento: 40 });
    expect(lista).toEqual({ lojas: [], total: 57, pagina: 3, porPagina: 20 });
  });
});
