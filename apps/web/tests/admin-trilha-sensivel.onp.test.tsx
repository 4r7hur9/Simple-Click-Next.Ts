// @vitest-environment jsdom
/**
 * A trilha de auditoria na tela (card #113, T-11310, AC-11327): o ato
 * sensível é destacado por TEXTO além da cor, e o valor que já chegou
 * mascarado da API não é reformatado como CPF, CNPJ nem telefone. O conteúdo
 * da trilha (`trilha.ts` na API) não muda: a tela só apresenta.
 */
import type { RegistroDaTrilhaNoContrato } from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { ListaDaTrilha } from "../src/features/admin/ListaDaTrilha.tsx";
import { valorNaTela } from "../src/features/admin/trilha-na-tela.ts";

const COMUM: RegistroDaTrilhaNoContrato = {
  id: "t1",
  quando: "2026-10-16T12:00:00.000Z",
  acao: "LOJA_ALTERADA",
  quem: { id: "a1", nome: "Ana Admin" },
  papel: "ADMIN",
  campos: [{ campo: "nome", antes: "Pastel", depois: "Pastel da Joi" }],
  sensivel: false,
};

const SENSIVEL: RegistroDaTrilhaNoContrato = {
  id: "t2",
  quando: "2026-10-16T13:00:00.000Z",
  acao: "CONFIG_SENSIVEL_ALTERADA",
  quem: { id: "a1", nome: "Ana Admin" },
  papel: "ADMIN",
  campos: [
    { campo: "documento", antes: "…1234", depois: "…5678" },
    { campo: "telefone", antes: "…0123", depois: "…4567" },
  ],
  sensivel: true,
};

afterEach(() => {
  document.body.innerHTML = "";
});

function desenhar(registros: RegistroDaTrilhaNoContrato[]): HTMLElement {
  document.body.innerHTML = renderToStaticMarkup(
    <ListaDaTrilha registros={registros} />,
  );
  return document.body;
}

describe("trilha: ato sensível destacado por texto", () => {
  it("[CA-13] @spec:AC-11327 só o ato sensível leva o selo com o texto e a marca data-sensivel", () => {
    const corpo = desenhar([COMUM, SENSIVEL]);
    const itens = [...corpo.querySelectorAll("li")];
    expect(itens).toHaveLength(2);
    expect(itens[0]?.textContent).not.toContain("Alteração sensível");
    expect(itens[0]?.getAttribute("data-sensivel")).toBeNull();
    expect(itens[1]?.textContent).toContain("Alteração sensível");
    expect(itens[1]?.getAttribute("data-sensivel")).toBe("true");
    // O destaque também tem tom (token), mas não depende dele.
    expect(itens[1]?.querySelector(".sc-selo--atencao")).not.toBeNull();
  });

  it("[CA-13] @spec:AC-11327 o ato aparece pelo nome em português, nunca pelo código", () => {
    const corpo = desenhar([SENSIVEL]);
    expect(corpo.textContent).toContain("Dado sensível alterado");
    expect(corpo.textContent).not.toContain("CONFIG_SENSIVEL_ALTERADA");
  });
});

describe("trilha: valor mascarado preservado", () => {
  it("[CA-13] @spec:AC-11327 o valor mascarado chega à tela exatamente como veio", () => {
    expect(valorNaTela("…1234", "documento")).toBe("…1234");
    expect(valorNaTela("…0123", "telefone")).toBe("…0123");
    const corpo = desenhar([SENSIVEL]);
    expect(corpo.textContent).toContain("…1234 → …5678");
    expect(corpo.textContent).toContain("…0123 → …4567");
    // Nada de CPF, CNPJ nem telefone remontado a partir da máscara.
    expect(corpo.textContent).not.toMatch(
      /\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\(\d{2}\)\s?\d{4,5}-\d{4}/,
    );
  });
});
