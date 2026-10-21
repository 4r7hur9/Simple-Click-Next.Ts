// @vitest-environment jsdom
/**
 * Prova do tutorial de primeiro acesso (card #39): conteúdo por papel, abre
 * sozinho só quando a conta ainda não viu, "Pular" sempre à vista e gravando
 * no servidor, "Ver tutorial" reabrindo, e o passo sem alvo na tela caindo no
 * meio em vez de travar.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rota = vi.hoisted(() => ({ busca: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/painel",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(rota.busca),
}));

import { permissoesDoPapel, type PapelNaLoja } from "@simpleclick/contracts";

import { secoesDoPainel } from "../src/features/painel/secoes-do-painel.ts";
import {
  ENDERECO_VER_TUTORIAL_DO_PAINEL,
  EVENTO_VER_TUTORIAL,
  PASSOS_DO_TUTORIAL,
  papelDoTutorialNoPainel,
  passosVisiveis,
} from "../src/features/tutorial/passos.ts";
import { Tutorial } from "../src/features/tutorial/Tutorial.tsx";
import { tutorialJaVisto } from "../src/server/tutorial-da-sessao.ts";
import { clicar, desmontar, montar } from "./apoio-config.tsx";

function dialogo(): HTMLElement | null {
  return document.querySelector('[role="dialog"]');
}

function botaoComTexto(texto: string): HTMLButtonElement {
  const achado = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(texto),
  );
  if (achado === undefined) throw new Error(`sem botão "${texto}"`);
  return achado;
}

describe("conteúdo do tutorial", () => {
  it("cada papel fala do que usa", () => {
    const titulos = (papel: keyof typeof PASSOS_DO_TUTORIAL) =>
      PASSOS_DO_TUTORIAL[papel].map((passo) => passo.id);
    expect(titulos("cliente")).toEqual(
      expect.arrayContaining(["explorar", "favoritar", "pedir", "acompanhar"]),
    );
    expect(titulos("dono")).toEqual(
      expect.arrayContaining(["menu", "pedidos", "produtos", "aparencia", "feed", "equipe"]),
    );
    expect(titulos("equipe")).toEqual(
      expect.arrayContaining(["pedidos", "produtos", "categorias"]),
    );
    expect(titulos("equipe")).not.toContain("equipe");
    expect(titulos("equipe")).not.toContain("aparencia");
  });

  it("o fluxo do pedido aparece como demonstração", () => {
    const pedidos = PASSOS_DO_TUTORIAL.dono.find((passo) => passo.id === "pedidos");
    expect(pedidos?.demonstracao?.etapas).toContain("Em preparo");
  });

  it("o papel do painel vira o tutorial certo", () => {
    expect(papelDoTutorialNoPainel("OWNER")).toBe("dono");
    expect(papelDoTutorialNoPainel("STAFF")).toBe("equipe");
    expect(papelDoTutorialNoPainel("ADMIN")).toBeNull();
  });

  it("tira o passo cujo item de menu não existe nesta página", () => {
    const existe = (seletor: string) => !seletor.includes("/painel/aparencia");
    const ids = passosVisiveis(PASSOS_DO_TUTORIAL.dono, existe).map((p) => p.id);
    expect(ids).not.toContain("aparencia");
    expect(ids).toContain("boas-vindas");
    expect(ids).toContain("menu");
  });

  it("'Ver tutorial' está na seção Conta do painel, para dono e equipe", () => {
    for (const papel of ["OWNER", "STAFF"] as PapelNaLoja[]) {
      const secoes = secoesDoPainel({
        apelidoDaLoja: "loja",
        permissoes: new Set(permissoesDoPapel(papel)),
        temOutrasLojas: false,
      });
      const conta = secoes.find((secao) => secao.titulo === "Conta");
      expect(conta?.itens.map((item) => item.href)).toContain(
        ENDERECO_VER_TUTORIAL_DO_PAINEL,
      );
    }
  });
});

describe("já viu o tutorial? (servidor)", () => {
  const cookie = "sc_access=abc";
  const resposta = (corpo: unknown, status = 200) =>
    vi.fn(() => Promise.resolve(Response.json(corpo, { status }))) as unknown as typeof fetch;

  it("pergunta à API e responde por papel", async () => {
    const buscar = resposta({ vistos: ["cliente"] });
    expect(await tutorialJaVisto("cliente", cookie, buscar)).toBe(true);
    expect(await tutorialJaVisto("dono", cookie, buscar)).toBe(false);
  });

  it("na dúvida, não abre sozinho", async () => {
    expect(await tutorialJaVisto("dono", null)).toBe(true);
    expect(await tutorialJaVisto("dono", cookie, resposta({}, 500))).toBe(true);
    expect(await tutorialJaVisto("dono", cookie, resposta({ outra: 1 }))).toBe(true);
  });
});

describe("tutorial na tela", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rota.busca = "";
  });
  afterEach(() => {
    desmontar();
    vi.useRealTimers();
  });

  it("abre sozinho no primeiro acesso e Pular grava 'pulou'", () => {
    const marcar = vi.fn(() => Promise.resolve());
    montar(<Tutorial papel="equipe" abrirSozinho marcar={marcar} />);
    expect(dialogo()).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(dialogo()?.textContent).toContain("Bem-vindo à equipe");
    // Sem o menu na tela, ficam só os passos que não dependem dele.
    expect(dialogo()?.textContent).toMatch(/1 de \d+/);
    clicar(botaoComTexto("Pular"));
    expect(dialogo()).toBeNull();
    expect(marcar).toHaveBeenCalledWith("equipe", "pulou");
  });

  it("não abre sozinho para quem já viu; 'Ver tutorial' reabre", () => {
    const marcar = vi.fn(() => Promise.resolve());
    montar(<Tutorial papel="cliente" abrirSozinho={false} marcar={marcar} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(dialogo()).toBeNull();
    act(() => {
      window.dispatchEvent(new Event(EVENTO_VER_TUTORIAL));
    });
    expect(dialogo()?.textContent).toContain("Que bom ter você aqui");
  });

  it("abre com ?tutorial=1 no endereço", () => {
    rota.busca = "tutorial=1";
    montar(<Tutorial papel="dono" abrirSozinho={false} marcar={vi.fn()} />);
    expect(dialogo()?.textContent).toContain("painel da sua loja");
  });

  it("anda até o fim, Pular segue à vista e Concluir grava 'concluiu'", () => {
    // O menu da conta na tela: os passos que apontam para ele ficam.
    const menu = document.createElement("nav");
    menu.innerHTML = '<a href="/conta/pedidos">Meus pedidos</a>';
    document.body.append(menu);
    const marcar = vi.fn(() => Promise.resolve());
    montar(<Tutorial papel="cliente" abrirSozinho marcar={marcar} />);
    act(() => vi.advanceTimersByTime(1000));
    const total = PASSOS_DO_TUTORIAL.cliente.length;
    for (let passo = 1; passo < total; passo += 1) {
      expect(botaoComTexto("Pular")).toBeTruthy();
      clicar(botaoComTexto(passo === 1 ? "Começar" : "Próximo"));
    }
    expect(dialogo()?.textContent).toContain(`${total} de ${total}`);
    clicar(botaoComTexto("Concluir"));
    expect(dialogo()).toBeNull();
    expect(marcar).toHaveBeenCalledWith("cliente", "concluiu");
    menu.remove();
  });

  it("Esc pula", () => {
    const marcar = vi.fn(() => Promise.resolve());
    montar(<Tutorial papel="dono" abrirSozinho marcar={marcar} />);
    act(() => vi.advanceTimersByTime(1000));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(dialogo()).toBeNull();
    expect(marcar).toHaveBeenCalledWith("dono", "pulou");
  });
});
