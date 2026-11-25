// @vitest-environment jsdom
/**
 * Janela de novo aceite (card #79): aparece quando a conta tem versão pendente,
 * e QUALQUER 403 `aceite_pendente` de qualquer tela a reabre.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clicar,
  desmontar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

vi.mock("next/navigation", () => ({ usePathname: () => "/painel" }));

import { JanelaDeConfirmacao } from "../src/features/admin/JanelaDeConfirmacao.tsx";
import { JanelaDeNovoAceite } from "../src/features/legal/JanelaDeNovoAceite.tsx";

const PENDENTES = [
  { documento: "TERMS_OF_USE", versao: "2026-10-19" },
  { documento: "PRIVACY_POLICY", versao: "2026-10-19" },
];

/** Ordem em que cada `<dialog>` foi aberto por `showModal()`. */
let aberturas: string[] = [];
const protoOriginal = {
  showModal: HTMLDialogElement.prototype.showModal,
  close: HTMLDialogElement.prototype.close,
};

beforeEach(() => {
  vi.unstubAllGlobals();
  aberturas = [];
  // O jsdom não implementa `showModal`/`close`: o stub abre/fecha pelo atributo.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    aberturas.push(this.id);
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  desmontar();
  HTMLDialogElement.prototype.showModal = protoOriginal.showModal;
  HTMLDialogElement.prototype.close = protoOriginal.close;
});

function botao(tela: HTMLElement, texto: string): HTMLButtonElement {
  return [...tela.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(texto),
  )!;
}

describe("janela de novo aceite", () => {
  it("visitante (401) não vê nada", async () => {
    simularApi(() => ({ status: 401, corpo: { erro: "nao_autenticado" } }));
    const tela = montar(<JanelaDeNovoAceite />);
    await esperar();
    expect(tela.querySelector("dialog")).toBeNull();
  });

  it("com versão pendente pede o aceite, só libera com a caixa marcada e registra", async () => {
    const chamadas = simularApi((c) =>
      c.metodo === "POST"
        ? { status: 200, corpo: { pendentes: [], historico: [] } }
        : { status: 200, corpo: { pendentes: PENDENTES, historico: [] } },
    );
    const tela = montar(<JanelaDeNovoAceite />);
    await esperar();
    expect(tela.textContent).toContain("Atualizamos nossos termos");
    const aceitar = [...tela.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Aceitar e continuar"),
    )!;
    expect(aceitar.disabled).toBe(true);
    clicar(exigir(tela, "#novo-aceite-marca"));
    expect(aceitar.disabled).toBe(false);
    clicar(aceitar);
    await esperar();
    expect(chamadas.at(-1)).toMatchObject({
      metodo: "POST",
      url: "/api/conta/aceites",
      corpo: { documentos: ["TERMS_OF_USE", "PRIVACY_POLICY"] },
    });
    expect(tela.querySelector("dialog")).toBeNull();
  });

  it("um 403 aceite_pendente de qualquer chamada reabre a janela depois de dispensada", async () => {
    simularApi((c) =>
      c.url.startsWith("/api/painel")
        ? {
            status: 403,
            corpo: { erro: "aceite_pendente", pendentes: PENDENTES },
          }
        : { status: 200, corpo: { pendentes: [], historico: [] } },
    );
    const tela = montar(<JanelaDeNovoAceite />);
    await esperar();
    expect(tela.querySelector("dialog")).toBeNull();
    // O fetch embrulhado vale para qualquer tela: aqui, um formulário do painel.
    await window.fetch("/api/painel/produtos", { method: "POST", body: "{}" });
    await esperar();
    expect(tela.querySelector("dialog")).not.toBeNull();
  });

  it("[CA-7] um 403 aceite_pendente abre a janela por showModal(), flutuante; sem pendência não há dialog", async () => {
    simularApi((c) =>
      c.url.startsWith("/api/painel")
        ? {
            status: 403,
            corpo: { erro: "aceite_pendente", pendentes: PENDENTES },
          }
        : { status: 200, corpo: { pendentes: [], historico: [] } },
    );
    const tela = montar(<JanelaDeNovoAceite />);
    await esperar();
    expect(tela.querySelector("dialog")).toBeNull();
    await window.fetch("/api/painel/produtos", { method: "POST", body: "{}" });
    await esperar();
    const janela = exigir(tela, "#janela-de-novo-aceite");
    expect(aberturas).toEqual(["janela-de-novo-aceite"]);
    expect(janela.classList.contains("sc-dialogo--flutuante")).toBe(true);
  });

  it("[CA-7] pendentes de documento desconhecido ou herdado do protótipo são descartados", async () => {
    simularApi(() => ({
      status: 200,
      corpo: {
        pendentes: [
          { documento: "toString", versao: "2026-10-19" },
          { documento: "__proto__", versao: "2026-10-19" },
          { documento: "TERMS_OF_USE", versao: "2026-10-19" },
        ],
        historico: [],
      },
    }));
    const tela = montar(<JanelaDeNovoAceite />);
    await esperar();
    expect(tela.querySelectorAll(".sc-aceite__lista li")).toHaveLength(1);
  });

  it("[CA-7] um 403 que fica vazio depois do filtro mantém a lista e refaz o GET", async () => {
    const chamadas = simularApi((c) =>
      c.url.startsWith("/api/painel")
        ? {
            status: 403,
            corpo: {
              erro: "aceite_pendente",
              pendentes: [{ documento: "toString", versao: "2026-10-19" }],
            },
          }
        : { status: 200, corpo: { pendentes: PENDENTES, historico: [] } },
    );
    const tela = montar(<JanelaDeNovoAceite />);
    await esperar();
    const antes = chamadas.filter((c) => c.metodo === "GET").length;
    await window.fetch("/api/painel/produtos", { method: "POST", body: "{}" });
    await esperar();
    expect(chamadas.filter((c) => c.metodo === "GET").length).toBe(antes + 1);
    expect(tela.querySelectorAll(".sc-aceite__lista li")).toHaveLength(2);
  });

  it("[CA-8] abre depois da confirmação, aceitar fecha só o aceite e o foco volta à confirmação", async () => {
    simularApi((c) =>
      c.metodo === "POST" && c.url === "/api/conta/aceites"
        ? { status: 200, corpo: { pendentes: [], historico: [] } }
        : c.url.startsWith("/api/painel")
          ? {
              status: 403,
              corpo: { erro: "aceite_pendente", pendentes: PENDENTES },
            }
          : { status: 200, corpo: { pendentes: [], historico: [] } },
    );
    const tela = montar(
      <div>
        <JanelaDeConfirmacao
          id="confirmacao"
          titulo="Confirmar"
          aoFechar={() => undefined}
          rodape={
            <button type="button" id="ok-confirmacao">
              OK
            </button>
          }
        >
          texto
        </JanelaDeConfirmacao>
        <JanelaDeNovoAceite />
      </div>,
    );
    await esperar();
    const ok = exigir(tela, "#ok-confirmacao") as HTMLElement;
    ok.focus();
    await window.fetch("/api/painel/produtos", { method: "POST", body: "{}" });
    await esperar();
    expect(aberturas).toEqual(["confirmacao", "janela-de-novo-aceite"]);
    clicar(exigir(tela, "#novo-aceite-marca"));
    clicar(botao(tela, "Aceitar e continuar"));
    await esperar();
    expect(tela.querySelector("#janela-de-novo-aceite")).toBeNull();
    expect(tela.querySelector("#confirmacao")).not.toBeNull();
    expect(document.activeElement).toBe(ok);
  });

  it("[CA-8] se quem abriu foi o body, o foco vai para o outro dialog modal aberto", async () => {
    simularApi((c) =>
      c.metodo === "POST" && c.url === "/api/conta/aceites"
        ? { status: 200, corpo: { pendentes: [], historico: [] } }
        : c.url.startsWith("/api/painel")
          ? {
              status: 403,
              corpo: { erro: "aceite_pendente", pendentes: PENDENTES },
            }
          : { status: 200, corpo: { pendentes: [], historico: [] } },
    );
    const tela = montar(
      <div>
        <JanelaDeConfirmacao
          id="confirmacao"
          titulo="Confirmar"
          aoFechar={() => undefined}
          rodape={
            <button type="button" id="ok-confirmacao">
              OK
            </button>
          }
        >
          texto
        </JanelaDeConfirmacao>
        <JanelaDeNovoAceite />
      </div>,
    );
    await esperar();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await window.fetch("/api/painel/produtos", { method: "POST", body: "{}" });
    await esperar();
    clicar(exigir(tela, "#novo-aceite-marca"));
    clicar(botao(tela, "Aceitar e continuar"));
    await esperar();
    expect(exigir(tela, "#confirmacao").contains(document.activeElement)).toBe(
      true,
    );
  });

  it("[CA-9] o Esc (cancel) sai com defaultPrevented e dispensa a janela", async () => {
    simularApi(() => ({
      status: 200,
      corpo: { pendentes: PENDENTES, historico: [] },
    }));
    const tela = montar(<JanelaDeNovoAceite />);
    await esperar();
    const evento = new Event("cancel", { cancelable: true });
    act(() => {
      exigir(tela, "#janela-de-novo-aceite").dispatchEvent(evento);
    });
    expect(evento.defaultPrevented).toBe(true);
    expect(tela.querySelector("dialog")).toBeNull();
  });

  it("[CA-11] reaberta depois de dispensar, a caixa vem desmarcada e o botão desabilitado; depois de aceitar vale a lista do POST", async () => {
    const restante = [{ documento: "MERCHANT_TERMS", versao: "2026-11-01" }];
    simularApi((c) =>
      c.metodo === "POST" && c.url === "/api/conta/aceites"
        ? { status: 200, corpo: { pendentes: restante, historico: [] } }
        : c.url.startsWith("/api/painel")
          ? {
              status: 403,
              corpo: { erro: "aceite_pendente", pendentes: PENDENTES },
            }
          : { status: 200, corpo: { pendentes: PENDENTES, historico: [] } },
    );
    const tela = montar(<JanelaDeNovoAceite />);
    await esperar();
    clicar(exigir(tela, "#novo-aceite-marca"));
    clicar(botao(tela, "Agora não"));
    expect(tela.querySelector("dialog")).toBeNull();
    await window.fetch("/api/painel/produtos", { method: "POST", body: "{}" });
    await esperar();
    const marca = exigir(tela, "#novo-aceite-marca") as HTMLInputElement;
    expect(marca.checked).toBe(false);
    expect(botao(tela, "Aceitar e continuar").disabled).toBe(true);
    clicar(marca);
    clicar(botao(tela, "Aceitar e continuar"));
    await esperar();
    expect(tela.querySelectorAll(".sc-aceite__lista li")).toHaveLength(1);
    expect(
      (exigir(tela, "#novo-aceite-marca") as HTMLInputElement).checked,
    ).toBe(false);
  });
});
