// @vitest-environment jsdom
/**
 * Prova da caixa da chave PIX (AC-510).
 *
 * Aqui o clique acontece de verdade: `createRoot` do react-dom e `act` do
 * React, ambos já instalados. Nenhuma biblioteca nova entrou para isso (P-014).
 * Renderizar só a marcação provaria que o botão EXISTE — e um botão que existe
 * e não confirma nada é exatamente o defeito que este critério quer impedir.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CaixaPix } from "../src/features/checkout/CaixaPix";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

/** Monta a caixa num documento de verdade e devolve o elemento montado. */
function montar(propriedades: Parameters<typeof CaixaPix>[0]): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(<CaixaPix {...propriedades} />));
  return container;
}

function botaoDeCopiar(dentro: HTMLElement): HTMLButtonElement {
  const botao = [...dentro.querySelectorAll("button")].find((candidato) =>
    (candidato.textContent ?? "").includes("Copiar"),
  );
  if (!botao) throw new Error("não existe botão de copiar na caixa do PIX");
  return botao;
}

const CHAVE = "loja@sabor.com.br";

describe("chave PIX exibida e copiável (AC-510)", () => {
  it("@spec:AC-510 a chave e o nome do recebedor aparecem na tela", () => {
    const tela = montar({
      chave: CHAVE,
      tipoDaChave: "EMAIL",
      nomeDoRecebedor: "Sabor & Cia",
    });

    expect(tela.textContent).toContain(CHAVE);
    expect(tela.textContent).toContain("Sabor & Cia");
    // O tipo aparece por extenso: "EMAIL" em maiúsculas é vocabulário do banco
    // de dados, e quem está pagando não tem por que aprender.
    expect(tela.textContent).toContain("E-mail");
    expect(tela.textContent).not.toContain("EMAIL");
  });

  it("@spec:AC-510 o botão copia a chave e confirma que copiou", async () => {
    let copiado: string | null = null;
    const tela = montar({
      chave: CHAVE,
      copiar: async (texto) => {
        copiado = texto;
      },
    });

    expect(tela.textContent).not.toContain("Chave copiada");

    await act(async () => {
      botaoDeCopiar(tela).click();
    });

    expect(copiado).toBe(CHAVE);
    expect(tela.textContent).toContain("Chave copiada");
  });

  it("@spec:AC-510 a confirmação é anunciada, e não só pintada na tela", async () => {
    // Confirmação que existe apenas como cor deixa de fora justamente quem mais
    // depende dela.
    const tela = montar({ chave: CHAVE, copiar: async () => {} });

    await act(async () => {
      botaoDeCopiar(tela).click();
    });

    const anuncio = tela.querySelector('[role="status"], [role="alert"]');
    expect(anuncio).not.toBeNull();
    expect(anuncio?.textContent).toContain("Chave copiada");
  });

  it("@spec:AC-510 cópia que falha não anuncia sucesso — manda copiar à mão", async () => {
    // Confirmação falsa é pior que nenhuma: o cliente cola o que estava na área
    // de transferência antes e paga outra pessoa.
    const tela = montar({
      chave: CHAVE,
      copiar: async () => {
        throw new Error("área de transferência bloqueada");
      },
    });

    await act(async () => {
      botaoDeCopiar(tela).click();
    });

    expect(tela.textContent).not.toContain("Chave copiada");
    expect(tela.textContent).toContain("copie");
    // E a chave continua na tela, que é o que torna o conselho executável.
    expect(tela.textContent).toContain(CHAVE);
  });

  it("@spec:AC-510 loja sem nome de recebedor mostra a chave sem linha vazia", () => {
    const tela = montar({ chave: CHAVE, copiar: async () => {} });

    expect(tela.textContent).toContain(CHAVE);
    expect(tela.textContent).not.toContain("Recebedor");
  });
});
