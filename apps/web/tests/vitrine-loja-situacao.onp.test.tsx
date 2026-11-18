// @vitest-environment jsdom
/**
 * Card #107 · a situação da loja é dita em texto, e nunca promete o que a loja
 * não informou.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApresentacaoDaLoja,
  type AberturaNaTela,
  type LojaNaTela,
} from "../src/features/loja/ApresentacaoDaLoja";

const LOJA: LojaNaTela = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  tema: { corDestaque: "#0f6e5c", fundoVitrine: null, topoCardapio: null },
  boasVindas: null,
  logo: null,
  capa: null,
  formasDeEntrega: [],
  enderecoParaRetirada: null,
};

function lerTexto(abertura: AberturaNaTela): string {
  const html = renderToStaticMarkup(
    <ApresentacaoDaLoja
      loja={LOJA}
      abertura={abertura}
      linkDoCardapio="/loja/sabor-e-cia/cardapio"
      rotuloDoCatalogo="Cardápio"
    />,
  );
  const caixa = document.createElement("div");
  caixa.innerHTML = html;
  return (caixa.textContent ?? "").replace(/\s+/g, " ");
}

describe("situação da loja", () => {
  it("[CA-2] @spec:AC-10704 fechada com próxima abertura: diz quando abre e deixa ver o cardápio", () => {
    const texto = lerTexto({
      aberta: false,
      proximaAbertura: "amanhã às 09:00",
      motivo: "FORA_DO_HORARIO",
    });
    expect(texto).toContain("Fechada agora · amanhã às 09:00");
    expect(texto).not.toContain("Aberta agora");
    expect(texto).toContain("Você pode ver o cardápio e voltar depois.");
    expect(texto).not.toMatch(/entrega imediata|atendimento agora/i);
  });

  it("[CA-2] @spec:AC-10705 fechada sem horário não inventa horário", () => {
    const texto = lerTexto({
      aberta: false,
      proximaAbertura: null,
      motivo: "FORA_DO_HORARIO",
    });
    expect(texto).toContain("Fechada agora · horário não informado");
    expect(texto).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("[CA-2] @spec:AC-10706 fechamento por exceção mostra a explicação da loja", () => {
    const texto = lerTexto({
      aberta: false,
      proximaAbertura: "segunda às 08:00",
      motivo: "EXCECAO",
      explicacaoDaExcecao: "Fechado para o feriado",
    });
    expect(texto).toContain("Fechado para o feriado · segunda às 08:00");
    expect(texto).not.toContain("Fechada agora");
  });

  it("[CA-2] @spec:AC-10707 aberta diz isso em texto no selo", () => {
    const html = renderToStaticMarkup(
      <ApresentacaoDaLoja
        loja={LOJA}
        abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
        linkDoCardapio="/loja/sabor-e-cia/cardapio"
        rotuloDoCatalogo="Cardápio"
      />,
    );
    const caixa = document.createElement("div");
    caixa.innerHTML = html;
    const selo = caixa.querySelector(".sc-loja__situacao");
    expect(selo?.textContent).toContain("Aberta agora");
    expect(selo?.getAttribute("data-selo")).not.toBeNull();
    expect(caixa.textContent).not.toContain("voltar depois");
  });
});
