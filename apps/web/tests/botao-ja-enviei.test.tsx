// @vitest-environment jsdom
/**
 * Prova do "já enviei" na tela (AC-610).
 *
 * O botão é a única forma de o cliente dizer que a mensagem saiu de fato. Ele
 * precisa avisar a loja pelo link DESTE pedido e, se falhar, dizer isso e
 * continuar disponível — o cliente não pode achar que avisou quando não avisou.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { BotaoJaEnviei } from "../src/features/pedido/BotaoJaEnviei";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

async function montar(
  confirmar: (apelido: string, token: string) => Promise<boolean>,
): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(
      <BotaoJaEnviei
        apelidoDaLoja="acai-da-praca"
        tokenDoPedido="token-longo-e-aleatorio"
        confirmar={confirmar}
      />,
    );
  });
  return container;
}

function botaoJaEnviei(tela: HTMLElement): HTMLButtonElement | undefined {
  return [...tela.querySelectorAll("button")].find((botao) =>
    (botao.textContent ?? "").includes("Já enviei a mensagem"),
  );
}

describe("o cliente sinaliza que já enviou (AC-610)", () => {
  it("@spec:AC-610 tocar em 'já enviei' avisa a loja pelo link deste pedido", async () => {
    const confirmar = vi.fn(async () => true);
    const tela = await montar(confirmar);

    await act(async () => {
      botaoJaEnviei(tela)?.click();
    });

    expect(confirmar).toHaveBeenCalledWith(
      "acai-da-praca",
      "token-longo-e-aleatorio",
    );
    expect(tela.textContent).toContain("Mensagem sinalizada");
    expect(botaoJaEnviei(tela)).toBeUndefined();
  });

  it("@spec:AC-610 se a sinalização falhar, o cliente fica sabendo e pode tentar de novo", async () => {
    const confirmar = vi.fn(async () => false);
    const tela = await montar(confirmar);

    await act(async () => {
      botaoJaEnviei(tela)?.click();
    });

    expect(tela.textContent).toContain("Não conseguimos registrar agora");
    expect(botaoJaEnviei(tela)).toBeDefined();
  });
});
