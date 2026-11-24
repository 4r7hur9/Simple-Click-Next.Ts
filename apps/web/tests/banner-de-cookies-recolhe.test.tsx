// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/entrar" }));

import {
  BannerDeCookies,
  TEMPO_PARA_RECOLHER_MS,
} from "../src/features/legal/BannerDeCookies";
import { consentimentoAtual } from "../src/features/legal/consentimento";
import { clicar, desmontar, montar } from "./apoio-config.tsx";

const cartao = () => document.querySelector<HTMLElement>('[role="dialog"]');
const pilula = () =>
  document.querySelector<HTMLButtonElement>(".sc-cookies__pilula");
const limpar = () => {
  document.cookie = "sc_consentimento=; Path=/; Max-Age=0";
};

function passar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  limpar();
});
afterEach(() => {
  desmontar();
  limpar();
  vi.useRealTimers();
});

describe("aviso de cookies recolhe numa pílula (card #5)", () => {
  it("recolhe depois do tempo sem interação, sem gravar consentimento", () => {
    montar(<BannerDeCookies />);
    expect(cartao()).not.toBeNull();
    passar(TEMPO_PARA_RECOLHER_MS + 50);
    expect(cartao()).toBeNull();
    expect(pilula()?.textContent).toBe("Cookies");
    expect(consentimentoAtual()).toBeNull();
    expect(document.cookie).not.toContain("sc_consentimento=");
  });

  it("recolhe ao rolar a página", () => {
    montar(<BannerDeCookies />);
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(cartao()).toBeNull();
    expect(pilula()).not.toBeNull();
    expect(consentimentoAtual()).toBeNull();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("não recolhe enquanto o foco está dentro do cartão", () => {
    montar(<BannerDeCookies />);
    const botao = cartao()!.querySelector<HTMLButtonElement>("button")!;
    act(() => botao.focus());
    passar(TEMPO_PARA_RECOLHER_MS * 3);
    expect(cartao()).not.toBeNull();
    expect(pilula()).toBeNull();
  });

  it("a interação dentro do cartão adia o recolhimento", () => {
    montar(<BannerDeCookies />);
    passar(TEMPO_PARA_RECOLHER_MS - 1000);
    act(() => {
      cartao()!.dispatchEvent(new Event("pointermove", { bubbles: true }));
    });
    passar(TEMPO_PARA_RECOLHER_MS - 1000);
    expect(cartao()).not.toBeNull();
    passar(1500);
    expect(cartao()).toBeNull();
  });

  it("a pílula reabre o cartão e leva o foco para ele; a escolha segue pendente", () => {
    montar(<BannerDeCookies />);
    passar(TEMPO_PARA_RECOLHER_MS + 50);
    clicar(pilula()!);
    expect(cartao()).not.toBeNull();
    expect(pilula()).toBeNull();
    expect(document.activeElement).toBe(cartao());
    expect(consentimentoAtual()).toBeNull();
  });

  it("escolher depois de reabrir grava normalmente e some tudo", () => {
    montar(<BannerDeCookies />);
    passar(TEMPO_PARA_RECOLHER_MS + 50);
    clicar(pilula()!);
    const recusar = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Recusar não essenciais",
    )!;
    clicar(recusar);
    expect(cartao()).toBeNull();
    expect(pilula()).toBeNull();
    expect(consentimentoAtual()?.desempenho).toBe(false);
  });

  it("a pílula é um botão com rótulo e sem animação própria", () => {
    montar(<BannerDeCookies />);
    passar(TEMPO_PARA_RECOLHER_MS + 50);
    const p = pilula()!;
    expect(p.tagName).toBe("BUTTON");
    expect(p.getAttribute("type")).toBe("button");
    expect(p.getAttribute("aria-expanded")).toBe("false");
  });
});
