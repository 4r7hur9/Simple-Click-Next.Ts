import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Carregando from "../src/app/loading";
import ErroDaTela from "../src/app/error";
import NaoEncontrado from "../src/app/not-found";

/** Procura o primeiro elemento de um tipo na árvore devolvida pelo componente. */
function encontrar(no: unknown, tipo: string): ReactElement | null {
  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = encontrar(filho, tipo);
      if (achado !== null) return achado;
    }
    return null;
  }
  if (!isValidElement(no)) return null;
  if (no.type === tipo) return no;
  return encontrar((no.props as { children?: unknown }).children, tipo);
}

describe("estados de tela do esqueleto", () => {
  it("@principle:P-011 a espera é anunciada, e não fica em tela muda", () => {
    const html = renderToStaticMarkup(<Carregando />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Carregando");
  });

  it("@principle:P-011 o endereço inexistente explica e oferece saída", () => {
    const html = renderToStaticMarkup(<NaoEncontrado />);

    expect(html).toContain("Página não encontrada");
    expect(html).toContain('href="/"');
  });

  it("@principle:P-011 o erro aparece como aviso, com código de referência", () => {
    const erro = Object.assign(new Error("conexão recusada em 10.0.0.7:5432"), {
      digest: "ref-7f3a",
    });

    const html = renderToStaticMarkup(
      <ErroDaTela error={erro} reset={() => {}} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Algo deu errado");
    expect(html).toContain("ref-7f3a");
    // Detalhe interno não vai para a tela: vaza topologia e, em outro erro,
    // vazaria dado pessoal junto (P-009, AC-024).
    expect(html).not.toContain("10.0.0.7");
  });

  it("@principle:P-011 o erro oferece nova tentativa, e o botão realmente tenta de novo", () => {
    const tentarDeNovo = vi.fn();

    const arvore = ErroDaTela({
      error: new Error("qualquer"),
      reset: tentarDeNovo,
    });
    const botao = encontrar(arvore, "button");
    (botao?.props as { onClick?: () => void }).onClick?.();

    expect(botao).not.toBeNull();
    expect(tentarDeNovo).toHaveBeenCalledTimes(1);
  });
});
