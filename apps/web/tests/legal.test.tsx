// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/explorar/produtos" }));

import { BannerDeCookies } from "../src/features/legal/BannerDeCookies";
import { PaginaLegal } from "../src/features/legal/PaginaLegal";
import { RodapeLegal } from "../src/features/legal/RodapeLegal";
import {
  consentimentoAtual,
  temConsentimento,
} from "../src/features/legal/consentimento";
import { secoesDaLgpd } from "../src/features/legal/textos/lgpd";
import { secoesDaPrivacidade } from "../src/features/legal/textos/politica-de-privacidade";
import { secoesDosCookies } from "../src/features/legal/textos/cookies";
import { secoesDosTermos } from "../src/features/legal/textos/termos-de-uso";
import { clicar, desmontar, montar } from "./apoio-config.tsx";

function botao(nome: string): HTMLElement {
  const achado = [...document.querySelectorAll<HTMLElement>("button")].find(
    (b) => b.textContent?.trim() === nome,
  );
  if (!achado) throw new Error(`sem botão "${nome}"`);
  return achado;
}
const dialogo = () => document.querySelector<HTMLElement>('[role="dialog"]');
function caixa(rotulo: string): HTMLInputElement {
  const label = [...document.querySelectorAll("label")].find((l) =>
    l.textContent?.includes(rotulo),
  );
  const campo = label?.querySelector("input");
  if (!campo) throw new Error(`sem caixa "${rotulo}"`);
  return campo;
}

function limparCookie() {
  document.cookie = "sc_consentimento=; Path=/; Max-Age=0";
}

beforeEach(limparCookie);
afterEach(() => {
  desmontar();
  limparCookie();
});

describe("aviso de cookies", () => {
  it("aparece na primeira visita e 'Aceitar todos' libera as categorias", () => {
    montar(<BannerDeCookies />);
    expect(dialogo()).not.toBeNull();
    expect(temConsentimento("desempenho")).toBe(false);
    clicar(botao("Aceitar todos"));
    expect(dialogo()).toBeNull();
    expect(temConsentimento("desempenho")).toBe(true);
    expect(temConsentimento("funcionais")).toBe(true);
  });

  it("'Recusar não essenciais' grava a recusa", () => {
    montar(<BannerDeCookies />);
    clicar(botao("Recusar não essenciais"));
    expect(consentimentoAtual()).toMatchObject({
      desempenho: false,
      funcionais: false,
    });
    expect(temConsentimento("desempenho")).toBe(false);
  });

  it("'Personalizar' deixa escolher; essenciais ficam ligadas e travadas", () => {
    montar(<BannerDeCookies />);
    clicar(botao("Personalizar"));
    expect(caixa("Essenciais").checked).toBe(true);
    expect(caixa("Essenciais").disabled).toBe(true);
    clicar(caixa("Desempenho e análise"));
    clicar(botao("Salvar escolhas"));
    expect(temConsentimento("desempenho")).toBe(true);
    expect(temConsentimento("funcionais")).toBe(false);
  });

  it("não reaparece com escolha vigente, mas reabre pelo rodapé e fecha com Esc", () => {
    montar(
      <>
        <BannerDeCookies />
        <RodapeLegal />
      </>,
    );
    clicar(botao("Recusar não essenciais"));
    expect(dialogo()).toBeNull();
    clicar(botao("Preferências de cookies"));
    expect(dialogo()).not.toBeNull();
    act(() => {
      dialogo()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(dialogo()).toBeNull();
  });
});

describe("rodapé e páginas legais", () => {
  it("o rodapé liga as quatro páginas", () => {
    montar(<RodapeLegal />);
    for (const rota of [
      "/termos-de-uso",
      "/politica-de-privacidade",
      "/cookies",
      "/lgpd",
    ]) {
      expect(document.querySelector(`a[href="${rota}"]`)).not.toBeNull();
    }
  });

  it("cada texto tem seções com âncora única e menciona o canal do encarregado", () => {
    const email = "dpo@exemplo.test";
    for (const secoes of [
      secoesDosTermos(email),
      secoesDaPrivacidade(email),
      secoesDosCookies(email),
      secoesDaLgpd(email),
    ]) {
      const ids = secoes.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(JSON.stringify(secoes)).toContain(email);
    }
  });

  it("a página mostra índice com âncoras e data de atualização", () => {
    montar(
      <PaginaLegal
        rotaAtual="/lgpd"
        titulo="Seus direitos"
        resumo="Resumo"
        secoes={secoesDaLgpd("dpo@exemplo.test")}
      />,
    );
    expect(document.querySelector("h1")?.textContent).toBe("Seus direitos");
    expect(
      document.querySelector(
        'nav[aria-label="Nesta página"] a[href="#como-pedir"]',
      ),
    ).not.toBeNull();
    expect(document.querySelector("time")).not.toBeNull();
  });
});
