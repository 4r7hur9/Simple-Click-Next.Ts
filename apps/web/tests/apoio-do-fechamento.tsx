/**
 * Apoio dos testes do fechamento da sacola (card #110): os dados de exemplo, a
 * montagem em jsdom e os gestos (clicar, digitar, confirmar). Não é teste: o
 * vitest só roda arquivos `*.test.*`.
 *
 * Os dados são inventados para esta prova. Nada do mockup do Stitch entra aqui.
 */
import { vi, type Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  FechamentoDaCompra,
  type FechamentoDaCompraProps,
} from "../src/features/checkout/FechamentoDaCompra";
import type {
  ConferenciaNaTela,
  PedidoNaTela,
  ResultadoDoFechamento,
} from "../src/lib/carrinho-do-navegador";
import type { EnderecoSalvo } from "../src/lib/enderecos-da-conta";

// O React só aceita `act` quando o ambiente diz que é um teste.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

export const LOJA = "loja-de-teste";

export const CONFERENCIA: ConferenciaNaTela = {
  mudancas: [],
  precisaConfirmar: false,
  itens: [
    {
      itemId: "11111111-1111-4111-8111-111111111111",
      produtoId: "22222222-2222-4222-8222-222222222222",
      nome: "Camiseta lisa",
      quantidade: 2,
      precoUnitarioCentavos: 1200,
      totalDaLinhaCentavos: 2400,
    },
  ],
  subtotalCentavos: 2400,
};

export const CONFERENCIA_VAZIA: ConferenciaNaTela = {
  mudancas: [],
  precisaConfirmar: false,
  itens: [],
  subtotalCentavos: 0,
};

export const CASA: EnderecoSalvo = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rotulo: "Casa",
  destinatario: null,
  logradouro: "Rua das Flores",
  numero: "120",
  complemento: null,
  bairro: "Centro",
  cidade: "Fortaleza",
  estado: "CE",
  cep: null,
  pontoDeReferencia: null,
  padrao: false,
};

export const TRABALHO: EnderecoSalvo = {
  ...CASA,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  rotulo: "Trabalho",
  logradouro: "Av. Santos Dumont",
  numero: "900",
  padrao: true,
};

export const CONTA = {
  nome: "Ana Paula",
  email: "ana@cliente.test",
  telefone: "+5585999998888",
};

export const OUTRA_CONTA = {
  nome: "Bia Souza",
  email: "bia@cliente.test",
  telefone: "+5585911112222",
};

export const PEDIDO: PedidoNaTela = {
  id: "33333333-3333-4333-8333-333333333333",
  numero: 7,
  codigo: "A-0007",
  tokenPublico: "token-do-pedido",
  jaExistia: false,
  subtotalCentavos: 2400,
  taxaDeEntregaCentavos: 500,
  totalCentavos: 2900,
  whatsapp: null,
};

export const CRIADO: ResultadoDoFechamento = {
  estado: "criado",
  pedido: PEDIDO,
};

/** Um UUID v4, como o que o fechamento gera. */
export const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const montadas: Array<{ raiz: Root; caixa: HTMLElement }> = [];

export function desmontarTudo(): void {
  for (const { raiz, caixa } of montadas.splice(0)) {
    act(() => raiz.unmount());
    caixa.remove();
  }
}

export async function esperar(): Promise<void> {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
}

export async function montar(elemento: React.ReactElement): Promise<{
  caixa: HTMLElement;
  desmontar: () => void;
}> {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  const raiz = createRoot(caixa);
  await act(async () => {
    raiz.render(elemento);
  });
  await esperar();
  montadas.push({ raiz, caixa });
  return {
    caixa,
    desmontar: () => {
      act(() => raiz.unmount());
      caixa.remove();
      const indice = montadas.findIndex((m) => m.raiz === raiz);
      if (indice >= 0) montadas.splice(indice, 1);
    },
  };
}

/** O fechamento com a rede simulada. */
export function fechamento(props: Partial<FechamentoDaCompraProps> = {}): {
  elemento: React.ReactElement;
  fechar: Mock;
  conferir: Mock;
} {
  const fechar = vi.fn().mockResolvedValue(CRIADO);
  const conferir = vi
    .fn()
    .mockResolvedValue({ estado: "conferido", conferencia: CONFERENCIA });
  const elemento = (
    <FechamentoDaCompra
      apelidoDaLoja={LOJA}
      formas={{
        aceitaEntrega: true,
        aceitaRetirada: true,
        enderecoDaLoja: "Rua da Vila, 10 · Centro",
      }}
      formasDePagamento={["PIX", "CASH"]}
      pix={{ chave: "loja@pix.test", tipo: "EMAIL", titular: "Loja" }}
      entrega={{
        taxaCentavos: 500,
        nomeDaTaxa: "Taxa de entrega",
        gratisAcimaDeCentavos: null,
        minimoParaEntregaCentavos: null,
      }}
      linkDoCatalogo={`/loja/${LOJA}/cardapio`}
      rotuloDoCatalogo="Cardápio"
      conta={CONTA}
      enderecos={[TRABALHO, CASA]}
      conferir={conferir as never}
      fechar={fechar as never}
      salvarEndereco={vi.fn() as never}
      {...props}
    />
  );
  return { elemento, fechar, conferir };
}

export function clicar(elemento: Element | null): void {
  act(() => {
    elemento?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export async function clicarAsync(elemento: Element | null): Promise<void> {
  await act(async () => {
    elemento?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export function digitar(
  elemento: HTMLInputElement | HTMLTextAreaElement | null,
  texto: string,
): void {
  if (elemento === null) return;
  const prototipo =
    elemento instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototipo, "value")?.set?.call(
      elemento,
      texto,
    );
    elemento.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export async function confirmar(caixa: HTMLElement): Promise<void> {
  await act(async () => {
    caixa
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

export function botao(dentro: HTMLElement, trecho: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find(
    (candidato) =>
      (candidato.getAttribute("aria-label") ?? "").includes(trecho) ||
      (candidato.textContent ?? "").includes(trecho),
  );
  if (!achado) throw new Error(`nenhum botão com "${trecho}"`);
  return achado;
}

/** Uma promessa que o teste resolve na hora em que quiser. */
export function adiada<T>(): {
  promessa: Promise<T>;
  resolver: (valor: T) => void;
} {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((aoResolver) => {
    resolver = aoResolver;
  });
  return { promessa, resolver };
}
