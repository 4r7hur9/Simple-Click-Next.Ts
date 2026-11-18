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

  it("loja sem capa: a vitrine usa o degradê neutro do Stitch, sem o padrão de ícones do ramo", () => {
    // Card #129: o padrão de ícones saiu da página da loja (o /cardapio segue
    // com a capa padrão do ramo, coberta pelos testes de capaPadraoDe acima).
    for (const loja of [LOJA, { ...LOJA, ramo: "APPAREL" }]) {
      const painel = painelDe(loja);
      expect(painel.querySelector(".sc-loja__capa")).not.toBeNull();
      expect(painel.querySelector(".sc-loja__padrao")).toBeNull();
      expect(painel.innerHTML).not.toContain("--capa-url");
    }
  });

  it("a capa enviada pelo dono manda: nada de capa padrão por trás dela", () => {
    const painel = painelDe({ ...LOJA, capa: "https://exemplo.test/capa.png" });
    expect(painel.querySelector(".sc-loja__fundo")).not.toBeNull();
    expect(painel.querySelector(".sc-loja__padrao")).toBeNull();
  });
});
