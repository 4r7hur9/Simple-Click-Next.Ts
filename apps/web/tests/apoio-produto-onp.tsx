/**
 * Apoio dos testes `.onp` do detalhe do produto (card #109): um produto-modelo,
 * a montagem do formulário e uns atalhos de clique. Não é teste: o nome não
 * casa com `*.onp.test.*`.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ProdutoNoContrato } from "@simpleclick/contracts";

import {
  EscolhasDoProduto,
  type EscolhasDoProdutoProps,
} from "../src/features/produto/EscolhasDoProduto";
import { prepararProduto } from "../src/server/produto";

export const LOJA = "sabor-e-cia";
export const ROTULOS = { variacao: "Tamanho" };

const ID = (n: number) =>
  `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

export function opcao(n: number, nome: string, extra = {}) {
  return {
    id: ID(n),
    nome,
    acrescimoCentavos: 0,
    marcadaPorPadrao: false,
    disponivel: true,
    ...extra,
  };
}

export function grupo(
  n: number,
  nome: string,
  tipo: string,
  opcoes: ReturnType<typeof opcao>[],
  extra: Partial<ProdutoNoContrato["grupos"][number]> = {},
): ProdutoNoContrato["grupos"][number] {
  return {
    id: ID(n),
    nome,
    descricao: null,
    tipo,
    minimo: 0,
    maximo: null,
    permiteRepetir: false,
    eixoDeVariacao: false,
    opcoes,
    ...extra,
  };
}

export function variacao(
  n: number,
  nome: string,
  precoCentavos: number,
  valores: { grupoId: string; opcaoId: string }[] = [],
  extra: Partial<ProdutoNoContrato["variacoes"][number]> = {},
): ProdutoNoContrato["variacoes"][number] {
  return {
    id: ID(n),
    nome,
    precoCentavos,
    precoAnteriorCentavos: null,
    disponivel: true,
    padrao: false,
    valoresDosEixos: valores,
    ...extra,
  };
}

export const ID_DE = ID;

export function daApi(
  sobrescrita: Partial<ProdutoNoContrato> = {},
): ProdutoNoContrato {
  return {
    id: ID(1),
    apelido: "pastel",
    nome: "Pastel de queijo",
    chamada: "Massa fina e queijo derretido",
    descricao: "Feito na hora.",
    imagens: [],
    precoCentavos: 2000,
    precoAnteriorCentavos: 2400,
    grupos: [],
    variacoes: [],
    disponivel: true,
    motivoIndisponivel: null,
    aceitaObservacao: false,
    secao: null,
    ...sobrescrita,
  };
}

export function naTela(
  sobrescrita: Partial<ProdutoNoContrato> = {},
  lojaAberta = true,
) {
  return prepararProduto(daApi(sobrescrita), LOJA, lojaAberta);
}

export function montar(
  produto: ReturnType<typeof naTela>,
  extra: Partial<EscolhasDoProdutoProps> = {},
) {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  let raiz: Root;
  act(() => {
    raiz = createRoot(caixa);
    raiz.render(
      <EscolhasDoProduto
        produto={produto}
        apelidoDaLoja={LOJA}
        rotulos={ROTULOS}
        {...extra}
      />,
    );
  });
  return {
    caixa,
    desmontar: () => {
      act(() => raiz.unmount());
      caixa.remove();
    },
  };
}

export function clicar(elemento: Element) {
  act(() => {
    (elemento as HTMLElement).click();
  });
}

export function marcar(caixa: HTMLElement, rotulo: string) {
  const alvo = [...caixa.querySelectorAll("label")].find((l) =>
    (l.textContent ?? "").includes(rotulo),
  );
  const entrada = alvo?.querySelector("input");
  if (!(entrada instanceof HTMLInputElement)) {
    throw new Error(`não achei o controle de "${rotulo}"`);
  }
  clicar(entrada);
  return entrada;
}

export function botaoDeAdicionar(caixa: HTMLElement) {
  const botao = caixa.querySelector<HTMLButtonElement>(
    ".sc-produto__adicionar",
  );
  if (botao === null) throw new Error("sem botão de adicionar");
  return botao;
}

export function textoDoBotao(caixa: HTMLElement): string {
  return (botaoDeAdicionar(caixa).textContent ?? "").replace(/\s+/g, " ");
}

export function aumentar(caixa: HTMLElement, vezes: number) {
  const mais = caixa.querySelector<HTMLButtonElement>(
    'button[aria-label="Aumentar a quantidade"]',
  );
  if (mais === null) throw new Error("sem botão de aumentar");
  for (let i = 0; i < vezes; i += 1) clicar(mais);
}

export function diminuir(caixa: HTMLElement, vezes: number) {
  const menos = caixa.querySelector<HTMLButtonElement>(
    'button[aria-label="Diminuir a quantidade"]',
  );
  if (menos === null) throw new Error("sem botão de diminuir");
  for (let i = 0; i < vezes; i += 1) clicar(menos);
}

/** O texto como um leitor de tela ouviria, sem espaços repetidos. */
export function lido(caixa: Element): string {
  return (caixa.textContent ?? "").replace(/\s+/g, " ").trim();
}
