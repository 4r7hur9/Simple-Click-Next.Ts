import { describe, expect, it } from "vitest";

import { composicaoDoRamo, composicaoVazia, temBloco } from "./vertical.ts";

describe("composição das telas por ramo", () => {
  it("@spec:AC-324 converte o preset do banco e consulta blocos por tela", () => {
    const composicao = composicaoDoRamo({
      cadastro_produto: ["identificacao", "grade"],
      detalhe_produto: ["fotos", "tabela_medidas"],
      vitrine: ["categorias", "filtros", "lista"],
      desconhecido: ["nao-publicar"],
    });

    expect(temBloco(composicao, "cadastroProduto", "grade")).toBe(true);
    expect(temBloco(composicao, "vitrine", "destaques")).toBe(false);
    expect(composicao.detalheProduto).toEqual(["fotos", "tabela_medidas"]);
  });

  it("@spec:AC-324 não deixa JSON inválido habilitar uma tela", () => {
    const composicao = composicaoDoRamo({ vitrine: "lista" });

    expect(composicao).toEqual(composicaoVazia());
    expect(temBloco(composicao, "vitrine", "lista")).toBe(false);
  });
});
