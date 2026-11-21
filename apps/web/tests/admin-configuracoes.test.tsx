// @vitest-environment jsdom
/**
 * Configurações da administração: limites padrão com confirmação (card #170,
 * T-11). A gravação e a auditoria (LIMITES_PADRAO_ALTERADOS) são da API.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  corpoDosPadroes,
  LimitesPadrao,
} from "../src/features/admin/LimitesPadrao.tsx";
import { rotuloDoAto } from "../src/features/admin/trilha-na-tela.ts";
import {
  botao,
  clicar,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

const PADROES = {
  lojasPorDono: 2,
  staffPorLoja: 1,
  produtosPorLoja: 500,
  categoriasPorLoja: 50,
  clientesPorLoja: 5000,
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("limites padrão", () => {
  it("monta só o que mudou e recusa o que não é número ou não mudou", () => {
    const digitado = {
      lojasPorDono: "2",
      staffPorLoja: "1",
      produtosPorLoja: "800",
      categoriasPorLoja: "50",
      clientesPorLoja: "5000",
    };
    expect(corpoDosPadroes(PADROES, digitado)).toEqual({
      corpo: { produtosPorLoja: 800 },
    });
    expect(
      corpoDosPadroes(PADROES, { ...digitado, staffPorLoja: "x" }),
    ).toHaveProperty("erro");
    expect(
      corpoDosPadroes(PADROES, { ...digitado, produtosPorLoja: "500" }),
    ).toHaveProperty("erro");
  });

  it("salva só depois da confirmação, e a Cancelar não envia nada", async () => {
    const chamadas = simularApi(({ metodo }) =>
      metodo === "PATCH"
        ? { status: 200, corpo: { ...PADROES, produtosPorLoja: 800 } }
        : { status: 200, corpo: PADROES },
    );
    const tela = montar(<LimitesPadrao />);
    await esperar();
    digitar(exigir<HTMLInputElement>(tela, "#padrao-produtosPorLoja"), "800");
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    expect(tela.querySelector("dialog")?.textContent).toContain("500 → 800");
    expect(chamadas.filter((c) => c.metodo === "PATCH")).toHaveLength(0);

    clicar(botao(tela, "Cancelar"));
    await esperar();
    expect(tela.querySelector("dialog")).toBeNull();
    expect(chamadas.filter((c) => c.metodo === "PATCH")).toHaveLength(0);

    await enviar(exigir<HTMLFormElement>(tela, "form"));
    clicar(botao(tela, "Confirmar e salvar"));
    await esperar();
    const patch = chamadas.find((c) => c.metodo === "PATCH");
    expect(patch?.url).toBe("/api/admin/limites");
    expect(patch?.corpo).toEqual({ produtosPorLoja: 800 });
    expect(tela.textContent).toContain(
      "registrados na auditoria da plataforma",
    );
    expect(tela.querySelector("dialog")).toBeNull();
  });

  it("mantém a janela aberta com a mensagem da API quando o salvamento falha", async () => {
    simularApi(({ metodo }) =>
      metodo === "PATCH"
        ? { status: 422, corpo: { mensagem: "Valor recusado." } }
        : { status: 200, corpo: PADROES },
    );
    const tela = montar(<LimitesPadrao />);
    await esperar();
    digitar(exigir<HTMLInputElement>(tela, "#padrao-clientesPorLoja"), "9000");
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    clicar(botao(tela, "Confirmar e salvar"));
    await esperar();
    expect(tela.querySelector("dialog")?.textContent).toContain(
      "Valor recusado.",
    );
  });

  it("LIMITES_PADRAO_ALTERADOS tem nome em português na auditoria", () => {
    expect(rotuloDoAto("LIMITES_PADRAO_ALTERADOS")).toBe(
      "Limites padrão da plataforma alterados",
    );
  });
});
