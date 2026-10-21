/**
 * Apoio das provas que passam pela janela de recorte (card #82).
 *
 * O jsdom não decodifica imagem, não tem `canvas` e não implementa
 * `showModal`. Aqui os três são trocados por versões mínimas e HONESTAS: a
 * "imagem" carrega com o tamanho que o teste mandar (ou quebra, se o teste
 * pedir), o "canvas" devolve um arquivo WebP de tamanho conhecido e a janela
 * abre como aberta. O que NÃO é simulado é a conta do recorte, que roda de
 * verdade e é provada à parte, em `packages/ui/tests/recorte-geometria`.
 */
import { act } from "react";
import { vi } from "vitest";

export interface OpcoesDoRecorteSimulado {
  /** Tamanho natural da foto "decodificada". */
  readonly largura?: number;
  readonly altura?: number;
  /** A imagem não abre (arquivo que não é foto de verdade). */
  readonly quebrada?: boolean;
  /** Peso do arquivo que o canvas "gera", em bytes. */
  readonly pesoDaSaida?: number;
}

export interface RegistroDoCanvas {
  /** Cada chamada a `toBlob`: o tipo e a qualidade pedidos. */
  readonly pedidos: { tipo: string; qualidade: number }[];
  /** As dimensões dos canvas criados para gerar o arquivo. */
  readonly telas: { largura: number; altura: number }[];
  /** As matrizes aplicadas antes de desenhar a foto. */
  readonly matrizes: number[][];
}

export function prepararRecorte(
  opcoes: OpcoesDoRecorteSimulado = {},
): RegistroDoCanvas {
  const registro: RegistroDoCanvas = { pedidos: [], telas: [], matrizes: [] };
  const { largura = 2400, altura = 1800, quebrada = false, pesoDaSaida = 4000 } = opcoes;

  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:provisoria",
      revokeObjectURL: () => {},
    }),
  );

  class ImagemSimulada {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = quebrada ? 0 : largura;
    naturalHeight = quebrada ? 0 : altura;
    set src(_endereco: string) {
      setTimeout(() => {
        if (quebrada) this.onerror?.();
        else this.onload?.();
      }, 0);
    }
  }
  vi.stubGlobal("Image", ImagemSimulada);

  const contexto = {
    fillStyle: "",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
    setTransform: (...matriz: number[]) => {
      // A matriz de identidade só zera o canvas: o que importa é a do desenho.
      const ehIdentidade = matriz.join() === "1,0,0,1,0,0";
      if (matriz.length === 6 && !ehIdentidade) registro.matrizes.push(matriz);
    },
    clearRect: () => {},
    fillRect: () => {},
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray([120, 80, 40, 255]) }),
  };
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value(this: HTMLCanvasElement) {
      registro.telas.push({ largura: this.width, altura: this.height });
      return contexto;
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value(
      this: HTMLCanvasElement,
      resolver: (blob: Blob | null) => void,
      tipo = "image/png",
      qualidade = 1,
    ) {
      registro.pedidos.push({ tipo, qualidade });
      // O peso cai com a qualidade, como no codificador de verdade.
      const peso = Math.max(16, Math.round(pesoDaSaida * (qualidade / 0.85)));
      const bytes = new Uint8Array(peso);
      // Cabeçalho de um WebP de verdade: a tela confere o conteúdo, não o nome.
      bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
      bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
      resolver(new Blob([bytes], { type: tipo }));
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  return registro;
}

/** Espera a janela abrir a foto (o `onload` é assíncrono) e o React assentar. */
export async function esperarRecorte(): Promise<void> {
  await act(async () => {
    await new Promise((pronto) => setTimeout(pronto, 5));
  });
}

export function janelaDeRecorte(): HTMLDialogElement | null {
  return document.querySelector<HTMLDialogElement>("dialog.sc-recortador");
}

function botaoDaJanela(texto: string): HTMLButtonElement {
  const janela = janelaDeRecorte();
  if (janela === null) throw new Error("a janela de recorte não está aberta");
  const achado = [...janela.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === texto || b.getAttribute("aria-label") === texto,
  );
  if (achado === undefined) throw new Error(`a janela não tem o botão "${texto}"`);
  return achado;
}

/** Clica num botão da janela de recorte. */
export async function clicarNaJanela(texto: string): Promise<void> {
  await act(async () => {
    botaoDaJanela(texto).click();
  });
  await esperarRecorte();
}

/** Abre a foto (espera carregar) e confirma o recorte, como a pessoa faria. */
export async function confirmarRecorte(rotulo = "Usar esta foto"): Promise<void> {
  await esperarRecorte();
  await clicarNaJanela(rotulo);
  // O arquivo é gerado e entregue de forma assíncrona.
  await esperarRecorte();
}
