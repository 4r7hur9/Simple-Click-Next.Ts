/**
 * Apoio comum às provas das telas de configuração da loja (T-900 a T-907).
 *
 * As telas falam com a API pelo `fetch` do navegador. Aqui ele é trocado por
 * uma resposta escrita pelo teste, e cada chamada fica anotada — é o que
 * permite provar o que a tela ENVIA, e não só o que ela mostra.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";

// Sem esta marca, o React avisa que o ambiente não espera `act` — e o aviso
// esconde, no meio da saída, o erro que interessa.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

/** Desenha o componente num contêiner novo, preso ao documento. */
export function montar(elemento: ReactElement): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(elemento));
  return container;
}

/** Desfaz a montagem e o `fetch` trocado. Vai no `afterEach`. */
export function desmontar(): void {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
}

/** Uma chamada que a tela fez à API. */
export interface ChamadaDaApi {
  readonly url: string;
  readonly metodo: string;
  readonly corpo: unknown;
}

/** A resposta que o teste escreve para uma chamada. */
export interface RespostaSimulada {
  readonly status: number;
  readonly corpo?: unknown;
}

/** Troca o `fetch` por respostas escritas pelo teste; devolve as chamadas. */
export function simularApi(
  responder: (chamada: ChamadaDaApi) => RespostaSimulada,
): ChamadaDaApi[] {
  const chamadas: ChamadaDaApi[] = [];
  vi.stubGlobal(
    "fetch",
    async (endereco: RequestInfo | URL, init?: RequestInit) => {
      const chamada: ChamadaDaApi = {
        url: String(endereco),
        metodo: init?.method ?? "GET",
        corpo:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      chamadas.push(chamada);
      const { status, corpo } = responder(chamada);
      return new Response(status === 204 ? null : JSON.stringify(corpo ?? {}), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  );
  return chamadas;
}

/** Deixa as promessas pendentes (rede simulada, efeitos) terminarem. */
export async function esperar(): Promise<void> {
  await act(async () => {
    for (let vez = 0; vez < 8; vez += 1) {
      await new Promise((resolver) => setTimeout(resolver, 0));
    }
  });
}

/** Digita num campo controlado pelo React, como a pessoa digitaria. */
export function digitar(
  campo: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  valor: string,
): void {
  const prototipo =
    campo instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : campo instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const atribuir = Object.getOwnPropertyDescriptor(prototipo, "value")?.set;
  act(() => {
    atribuir?.call(campo, valor);
    campo.dispatchEvent(
      new Event(campo instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

/** Clica, dentro de `act`. */
export function clicar(elemento: Element): void {
  act(() => {
    (elemento as HTMLElement).click();
  });
}

/** Envia o formulário e espera a resposta simulada chegar. */
export async function enviar(formulario: HTMLFormElement): Promise<void> {
  act(() => {
    formulario.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await esperar();
}

/** O elemento pelo seletor, ou falha dizendo o que faltou. */
export function exigir<T extends Element>(
  dentro: ParentNode,
  seletor: string,
): T {
  const achado = dentro.querySelector<T>(seletor);
  if (achado === null) throw new Error(`não achei "${seletor}" na tela`);
  return achado;
}

/** O botão cujo texto contém o trecho. */
export function botao(dentro: ParentNode, trecho: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find((candidato) =>
    (candidato.textContent ?? "").includes(trecho),
  );
  if (!achado) throw new Error(`não existe botão com "${trecho}" na tela`);
  return achado;
}
