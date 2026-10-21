// @vitest-environment jsdom
/**
 * Janela de novo aceite (card #79): aparece quando a conta tem versão pendente,
 * e QUALQUER 403 `aceite_pendente` de qualquer tela a reabre.
 */
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

import { JanelaDeNovoAceite } from "../src/features/legal/JanelaDeNovoAceite.tsx";

const PENDENTES = [
  { documento: "TERMS_OF_USE", versao: "2026-10-19" },
  { documento: "PRIVACY_POLICY", versao: "2026-10-19" },
];

beforeEach(() => vi.unstubAllGlobals());
afterEach(desmontar);

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
        ? { status: 403, corpo: { erro: "aceite_pendente", pendentes: PENDENTES } }
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
});
