// @vitest-environment jsdom
/**
 * A capa padrão por tipo de negócio: quando o dono não envia capa, o painel
 * da apresentação ganha o ladrilho do ramo dele; quando envia, a dele manda.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApresentacaoDaLoja,
  type LojaNaTela,
} from "../src/features/loja/ApresentacaoDaLoja";
import {
  CAPA_PADRAO_GENERICA,
  capaPadraoDe,
  RAMOS_COM_CAPA_PADRAO,
} from "../src/lib/capa-padrao";

const LOJA: LojaNaTela = {
  apelido: "pastelaria-da-vila",
  nome: "Pastelaria da Vila",
  ramo: "FOOD_SNACK",
  boasVindas: null,
  logo: null,
  capa: null,
  formasDeEntrega: [],
  enderecoParaRetirada: null,
};

function painelDe(loja: LojaNaTela): HTMLElement {
  const caixa = document.createElement("div");
  caixa.innerHTML = renderToStaticMarkup(
    <ApresentacaoDaLoja
      loja={loja}
      abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
      linkDoCardapio="/loja/x/cardapio"
      rotuloDoCatalogo="Cardápio"
    />,
  );
  const painel = caixa.querySelector<HTMLElement>(".sc-loja__painel");
  if (!painel) throw new Error("sem painel");
  return painel;
}

function arquivoPublico(endereco: string): string {
  return join(import.meta.dirname, "..", "public", endereco);
}

describe("capa padrão por tipo de negócio", () => {
  it("cobre os 22 ramos do banco (0003 e 0063), cada um com o seu desenho, e o arquivo existe", () => {
    const enderecos = RAMOS_COM_CAPA_PADRAO.map((ramo) => capaPadraoDe(ramo));
    expect(RAMOS_COM_CAPA_PADRAO).toHaveLength(22);
    expect(new Set(enderecos).size).toBe(22);
    for (const endereco of [...enderecos, CAPA_PADRAO_GENERICA]) {
      expect(existsSync(arquivoPublico(endereco)), endereco).toBe(true);
    }
  });

  it("ramo desconhecido ou ausente cai na capa genérica", () => {
    expect(capaPadraoDe("PADARIA")).toBe(CAPA_PADRAO_GENERICA);
    expect(capaPadraoDe("toString")).toBe(CAPA_PADRAO_GENERICA);
    expect(capaPadraoDe(null)).toBe(CAPA_PADRAO_GENERICA);
    expect(capaPadraoDe(undefined)).toBe(CAPA_PADRAO_GENERICA);
  });

  it("loja sem capa mostra a capa padrão do ramo dela, escondida do leitor de tela", () => {
    const padrao =
      painelDe(LOJA).querySelector<HTMLElement>(".sc-loja__padrao");
    expect(padrao?.style.getPropertyValue("--capa-url")).toContain(
      "/capas-padrao/food_snack.svg",
    );
    expect(padrao?.getAttribute("aria-hidden")).toBe("true");

    const roupa = painelDe({ ...LOJA, ramo: "APPAREL" });
    expect(
      roupa
        .querySelector<HTMLElement>(".sc-loja__padrao")
        ?.style.getPropertyValue("--capa-url"),
    ).toContain("/capas-padrao/apparel.svg");
  });

  it("loja sem ramo informado ainda recebe a capa genérica", () => {
    const { ramo: _ramo, ...semRamo } = LOJA;
    const padrao =
      painelDe(semRamo).querySelector<HTMLElement>(".sc-loja__padrao");
    expect(padrao?.style.getPropertyValue("--capa-url")).toContain(
      CAPA_PADRAO_GENERICA,
    );
  });

  it("a capa enviada pelo dono manda: nada de capa padrão por trás dela", () => {
    const painel = painelDe({ ...LOJA, capa: "https://exemplo.test/capa.png" });
    expect(painel.querySelector(".sc-loja__fundo")).not.toBeNull();
    expect(painel.querySelector(".sc-loja__padrao")).toBeNull();
  });
});
