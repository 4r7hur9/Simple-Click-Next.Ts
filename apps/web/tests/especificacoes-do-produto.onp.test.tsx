// @vitest-environment jsdom
/**
 * Especificações cadastradas no detalhe (card #109, T-10912): só o que a loja
 * cadastrou, seção oculta sem dado.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { DetalheDoProduto } from "../src/features/produto/DetalheDoProduto";
import { esquemaDoProduto } from "@simpleclick/contracts";
import { LOJA, ROTULOS, daApi, lido, naTela } from "./apoio-produto-onp";

function desenhar(especificacoes: readonly { chave: string; nome: string; valor: string }[]) {
  const produto = naTela({ especificacoes: [...especificacoes] });
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  const raiz = createRoot(caixa);
  act(() =>
    raiz.render(
      <DetalheDoProduto
        produto={produto}
        apelidoDaLoja={LOJA}
        rotulos={ROTULOS}
        idDoTitulo="t"
      />,
    ),
  );
  const texto = lido(caixa);
  act(() => raiz.unmount());
  caixa.remove();
  return texto;
}

describe("especificações no detalhe", () => {
  it("[CA-1] @spec:AC-10905 mostra o que a loja cadastrou", () => {
    const texto = desenhar([
      { chave: "largura", nome: "Largura", valor: "195,5 mm" },
      { chave: "aro", nome: "Aro", valor: "15" },
    ]);
    expect(texto).toContain("Especificações");
    expect(texto).toContain("Largura");
    expect(texto).toContain("195,5 mm");
    expect(texto).toContain("Aro");
  });

  it("[CA-2] @spec:AC-10905 sem especificação a seção some", () => {
    expect(desenhar([])).not.toContain("Especificações");
  });

  it("[CA-3] @spec:AC-10905 o contrato aceita o campo e continua aceitando sem ele", () => {
    const base = daApi();
    expect(esquemaDoProduto.safeParse(base).success).toBe(true);
    expect(
      esquemaDoProduto.safeParse({
        ...base,
        especificacoes: [{ chave: "a", nome: "A", valor: "1" }],
      }).success,
    ).toBe(true);
  });
});
