import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { exemploDaObservacao } from "../src/features/produto/exemplo-da-observacao";
import { MatrizDeVariacao } from "../src/features/produto/MatrizDeVariacao";
import type { VariacaoNaTela } from "../src/lib/produto";

describe("observação do item: exemplo do ramo (card #70)", () => {
  it("autopeças não fala de cebola", () => {
    expect(exemploDaObservacao("AUTO_PARTS")).toBe(
      "Ex.: confirmar se serve no Gol G5 2012",
    );
    expect(exemploDaObservacao("APPAREL")).toBe("Ex.: embrulhar para presente");
    expect(exemploDaObservacao("FOOD_SNACK")).toContain("cebola");
  });

  it("ramo desconhecido ou ausente cai no exemplo neutro", () => {
    for (const ramo of [null, undefined, "", "QUALQUER"]) {
      const exemplo = exemploDaObservacao(ramo);
      expect(exemplo.startsWith("Ex.: ")).toBe(true);
      expect(exemplo).not.toContain("cebola");
    }
  });
});

const variacao = (id: string, nome: string, disponivel = true): VariacaoNaTela => ({
  id,
  nome,
  preco: null,
  precoCentavos: null,
  disponivel,
  padrao: id === "a",
  valoresDosEixos: [],
});

function desenhar(variacoes: readonly VariacaoNaTela[]) {
  return renderToStaticMarkup(
    <MatrizDeVariacao
      rotuloDaVariacao="Aplicação"
      variacoes={variacoes}
      eixos={[]}
      escolhaDeEixo={{}}
      comSaida={{}}
      variacaoEscolhida="a"
      aoEscolherEixo={() => undefined}
      aoEscolherVariacao={() => undefined}
    />,
  );
}

describe("variação única (card #70)", () => {
  it("só a variação padrão: o grupo não aparece", () => {
    expect(desenhar([variacao("a", "Único")])).toBe("");
  });

  it("duas variações: o grupo aparece", () => {
    const html = desenhar([variacao("a", "P"), variacao("b", "M")]);
    expect(html).toContain("Aplicação");
  });

  it("a única variação esgotada continua aparecendo, marcada como esgotada", () => {
    expect(desenhar([variacao("a", "Único", false)])).toContain("Esgotado");
  });
});
