// @vitest-environment jsdom
/**
 * Teclado e foco na administração (card #113, T-11311, AC-11328).
 *
 * O jsdom não anda com Tab nem prende o foco numa janela modal (isso fica
 * para o e2e do #114). O que se prova aqui: todo controle é um elemento que
 * o teclado já aciona (botão, link, campo), nada clicável é `div`, nenhum
 * `tabindex` positivo, e a janela de confirmação devolve o foco ao botão que
 * a abriu, ao cancelar e ao apertar Esc.
 */
import { join } from "node:path";

import type { FichaDaLojaNoContrato } from "@simpleclick/contracts";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AcoesLoja } from "../src/features/admin/AcoesLoja.tsx";
import { AtosDeAprovacao } from "../src/features/admin/AtosDeAprovacao.tsx";
import { arquivos, ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";
import {
  botao,
  clicar,
  desmontar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

const LOJA = {
  id: "5c1d0e2f-0000-4000-8000-000000000001",
  nome: "Pastel da Joi",
} as const;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  simularApi(() => ({ status: 200, corpo: {} }));
});

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

function atos() {
  const tela = montar(
    <AtosDeAprovacao
      loja={{ ...LOJA, status: "PENDING_APPROVAL" }}
      aoMudar={() => undefined}
    />,
  );
  const abrir = botao(tela, "Recusar");
  act(() => abrir.focus());
  clicar(abrir);
  return { tela, abrir };
}

/** O navegador leva o foco para dentro do modal ao abri-lo; o dublê não. */
function focoParaDentroDaJanela(tela: HTMLElement, abrir: HTMLElement): void {
  const dentro = exigir<HTMLElement>(tela, "dialog button");
  act(() => dentro.focus());
  expect(document.activeElement).toBe(dentro);
  expect(document.activeElement).not.toBe(abrir);
}

describe("janela de confirmação", () => {
  it("[CA-14] @spec:AC-11328 abre como diálogo modal, com nome e botão de fechar acessíveis", async () => {
    const { tela } = atos();
    await esperar();
    const janela = exigir<HTMLDialogElement>(tela, "dialog");
    expect(janela.hasAttribute("open")).toBe(true);
    expect(janela.getAttribute("aria-modal")).toBe("true");
    const titulo = document.getElementById(
      janela.getAttribute("aria-labelledby") ?? "",
    );
    expect(titulo?.textContent).toContain("Recusar Pastel da Joi?");
    const fechar = exigir(janela, ".sc-dialogo__fechar");
    expect(fechar.tagName).toBe("BUTTON");
    expect(fechar.textContent).toContain("Fechar");
  });

  it("[CA-14] @spec:AC-11328 Cancelar devolve o foco ao botão que abriu a janela", async () => {
    const { tela, abrir } = atos();
    await esperar();
    expect(exigir(tela, "dialog").hasAttribute("open")).toBe(true);
    focoParaDentroDaJanela(tela, abrir);
    clicar(botao(tela, "Cancelar"));
    await esperar();
    expect(tela.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it("[CA-14] @spec:AC-11328 Esc (o evento cancel do diálogo) fecha a janela e devolve o foco", async () => {
    const { tela, abrir } = atos();
    await esperar();
    const janela = exigir<HTMLDialogElement>(tela, "dialog");
    focoParaDentroDaJanela(tela, abrir);
    const esc = new Event("cancel", { cancelable: true });
    act(() => {
      janela.dispatchEvent(esc);
    });
    await esperar();
    // O padrão do navegador é adiado: a tela é quem fecha, com o foco devolvido.
    expect(esc.defaultPrevented).toBe(true);
    expect(tela.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it("[CA-14] @spec:AC-11328 o botão de fechar do canto também devolve o foco", async () => {
    const { tela, abrir } = atos();
    await esperar();
    focoParaDentroDaJanela(tela, abrir);
    clicar(exigir(tela, ".sc-dialogo__fechar"));
    await esperar();
    expect(tela.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });
});

describe("atos em passo na tela", () => {
  const FICHA = {
    ...LOJA,
    codigo: "0007",
    status: "ACTIVE",
    suspensao: null,
    retencao: null,
  } as unknown as FichaDaLojaNoContrato;

  it("[CA-14] @spec:AC-11328 suspender é um formulário com botão de envio: Enter no campo e Espaço no botão acionam o ato", () => {
    const tela = montar(<AcoesLoja ficha={FICHA} aoMudar={() => undefined} />);
    const formulario = exigir<HTMLFormElement>(tela, "form");
    const enviar = botao(formulario, "Suspender loja");
    expect(enviar.type).toBe("submit");
    expect(
      formulario.querySelector("textarea")?.tabIndex,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("o código não tem controle que o teclado não alcance", () => {
  const PASTAS = [
    join(RAIZ_WEB, "src/features/admin"),
    join(RAIZ_WEB, "src/features/admin-dashboard"),
    join(RAIZ_WEB, "src/app/(admin)"),
  ];
  const todos = PASTAS.flatMap((p) => arquivos(p, [".tsx"]));

  it("[CA-14] @spec:AC-11328 nada clicável é div, span, li ou linha de tabela", () => {
    const sujos = todos.filter((f) =>
      /<(div|span|li|tr|td|p|section|article)\b[^>]*\bonClick\b/.test(ler(f)),
    );
    expect(sujos).toEqual([]);
    expect(todos.filter((f) => /role="button"/.test(ler(f)))).toEqual([]);
  });

  it("[CA-14] @spec:AC-11328 nenhum tabindex positivo, que quebraria a ordem natural do Tab", () => {
    expect(
      todos.filter((f) => /tabIndex=\{?\s*["']?[1-9]/.test(ler(f))),
    ).toEqual([]);
  });

  it("[CA-14] @spec:AC-11328 o foco visível nunca é apagado sem substituto", () => {
    for (const arquivo of todos) {
      const codigo = ler(arquivo);
      // `outline-none` só vale se a mesma classe traz o foco visível.
      for (const m of codigo.matchAll(
        /className=[`"{]([^`"}]*outline-none[^`"}]*)/g,
      )) {
        expect(m[1], arquivo).toMatch(/focus-visible:outline/);
      }
    }
  });
});
