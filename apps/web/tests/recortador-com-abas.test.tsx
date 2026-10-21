// @vitest-environment jsdom
/**
 * O recortador dos espaços com UMA FOTO PARA CADA TELA (card #36): o fundo da
 * vitrine e o topo do cardápio têm a moldura do computador e a do celular,
 * abas "Computador | Celular", ajuste próprio de cada uma (o celular segue o do
 * computador até a pessoa mexer nele) e o original guardado para reabrir.
 */
import { RecortadorDeImagem, type ResultadoDoRecorte } from "@simpleclick/ui";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { espacoDeImagem } from "../src/lib/espacos-de-imagem.ts";
import {
  esperarRecorte,
  janelaDeRecorte,
  prepararRecorte,
} from "./apoio-recorte.ts";
import { desmontar, montar } from "./apoio-config.tsx";

afterEach(desmontar);

const FUNDO = espacoDeImagem("fundo-da-vitrine");
const TOPO = espacoDeImagem("topo-do-cardapio");
const LOGO = espacoDeImagem("logo");

function foto(nome = "foto.jpg", bytes = 4096) {
  return new File([new Uint8Array(bytes)], nome, { type: "image/jpeg" });
}

async function abrir(
  opcoes: {
    espaco?: typeof FUNDO;
    arquivo?: File;
    ajusteInicial?: React.ComponentProps<
      typeof RecortadorDeImagem
    >["ajusteInicial"];
    aoConfirmar?: (r: ResultadoDoRecorte) => void;
  } = {},
) {
  const aoConfirmar = vi.fn(opcoes.aoConfirmar ?? (() => undefined));
  const aoCancelar = vi.fn();
  const tela = montar(
    <RecortadorDeImagem
      arquivo={opcoes.arquivo ?? foto()}
      espaco={opcoes.espaco ?? FUNDO}
      ajusteInicial={opcoes.ajusteInicial}
      guardarOriginal
      aoConfirmar={aoConfirmar}
      aoCancelar={aoCancelar}
    />,
  );
  await esperarRecorte();
  return { tela, aoConfirmar, aoCancelar };
}

const janela = () => {
  const j = janelaDeRecorte();
  if (j === null) throw new Error("a janela de recorte não abriu");
  return j;
};
const moldura = () =>
  janela().querySelector<HTMLElement>(".sc-recortador__moldura")!;
const abas = () => [...janela().querySelectorAll<HTMLElement>('[role="tab"]')];
const caixinha = () =>
  janela().querySelector<HTMLInputElement>(".sc-recortador__igual input");

async function irPara(rotulo: string) {
  const aba = abas().find((candidata) => candidata.textContent === rotulo);
  if (aba === undefined) throw new Error(`não há a aba ${rotulo}`);
  await act(async () => {
    aba.click();
  });
  await esperarRecorte();
}

function posicaoDaFoto(): { x: number; y: number } {
  const imagem = janela().querySelector<HTMLImageElement>(
    "[data-foto-do-recorte]",
  )!;
  const [x, y] = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/
    .exec(imagem.style.transform)!
    .slice(1);
  return { x: Number(x), y: Number(y) };
}

function teclar(alvo: HTMLElement, key: string, extra: KeyboardEventInit = {}) {
  act(() => {
    alvo.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...extra }),
    );
  });
}

async function confirmar() {
  await act(async () => {
    [...janela().querySelectorAll("button")]
      .find((b) => b.textContent === "Usar esta foto")!
      .click();
  });
  await esperarRecorte();
}

describe("abas Computador | Celular", () => {
  it("cada foto tem as suas duas molduras, com proporções diferentes", async () => {
    prepararRecorte();
    await abrir({ espaco: FUNDO });

    expect(abas().map((aba) => aba.textContent)).toEqual([
      "Computador",
      "Celular",
    ]);
    expect(abas()[0]?.getAttribute("aria-selected")).toBe("true");
    // Computador: o cartão deitado (4:3).
    expect(janela().textContent).toContain(
      "A foto do computador sai com 1600 × 1200 px",
    );
    expect(moldura().style.getPropertyValue("--proporcao")).toBe(
      String(1600 / 1200),
    );
    expect(janela().textContent).toContain("Moldura 1600 × 1200 px (1,33:1)");

    await irPara("Celular");
    // Celular: o cartão em pé (9:20).
    expect(abas()[1]?.getAttribute("aria-selected")).toBe("true");
    expect(janela().textContent).toContain(
      "A foto do celular sai com 720 × 1600 px",
    );
    expect(moldura().style.getPropertyValue("--proporcao")).toBe(
      String(720 / 1600),
    );
    expect(janela().textContent).toContain("Moldura 720 × 1600 px (0,45:1)");
  });

  it("o topo do cardápio é uma faixa larga no computador e mais alta no celular", async () => {
    prepararRecorte();
    await abrir({ espaco: TOPO as typeof FUNDO });
    expect(janela().textContent).toContain("Moldura 1600 × 400 px (4:1)");
    await irPara("Celular");
    expect(janela().textContent).toContain("Moldura 1140 × 600 px (1,9:1)");
  });

  it("a prévia 'como vai aparecer' é a do lugar real de cada aba", async () => {
    prepararRecorte();
    await abrir({ espaco: FUNDO });
    const quadros = () =>
      [...janela().querySelectorAll<HTMLElement>("[data-miniatura]")].map(
        (quadro) => quadro.dataset["miniatura"],
      );
    expect(quadros()).toEqual(["No computador"]);
    await irPara("Celular");
    expect(quadros()).toEqual(["No celular"]);
  });

  it("sem abas num espaço de uma moldura só (a logo)", async () => {
    prepararRecorte();
    await abrir({ espaco: LOGO as typeof FUNDO });
    expect(abas()).toHaveLength(0);
    expect(caixinha()).toBeNull();
  });
});

describe("o celular herda o ajuste do computador até o dono mexer nele", () => {
  it("a caixinha só aparece no celular e começa marcada", async () => {
    prepararRecorte();
    await abrir();
    expect(caixinha()).toBeNull();
    await irPara("Celular");
    expect(caixinha()?.checked).toBe(true);
    expect(janela().textContent).toContain("Usar o mesmo ajuste do computador");
  });

  it("mexer no computador leva o celular junto; mexer no celular desmarca a caixinha", async () => {
    prepararRecorte();
    await abrir();
    // No computador a foto 2400 × 1800 cobre 320 × 240 sem folga: aproxima e move.
    const zoom = janela().querySelector<HTMLInputElement>(
      'input[type="range"]',
    )!;
    await act(async () => {
      const definir = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      definir?.call(zoom, "2");
      zoom.dispatchEvent(new Event("input", { bubbles: true }));
      zoom.dispatchEvent(new Event("change", { bubbles: true }));
    });
    teclar(moldura(), "ArrowLeft", { shiftKey: true });
    const noComputador = posicaoDaFoto();

    await irPara("Celular");
    // Herdando: o celular tem o MESMO zoom (2×) e o mesmo ponto no centro.
    expect(caixinha()?.checked).toBe(true);
    expect(
      Number(
        janela().querySelector<HTMLInputElement>('input[type="range"]')!.value,
      ),
    ).toBeCloseTo(2, 1);
    const herdada = posicaoDaFoto();

    teclar(moldura(), "ArrowDown");
    expect(caixinha()?.checked).toBe(false);
    expect(posicaoDaFoto()).not.toEqual(herdada);

    // O computador não mudou com o que se fez no celular.
    await irPara("Computador");
    expect(posicaoDaFoto()).toEqual(noComputador);

    // Marcar de novo volta a seguir o computador.
    await irPara("Celular");
    await act(async () => {
      caixinha()!.click();
    });
    expect(caixinha()?.checked).toBe(true);
    expect(posicaoDaFoto()).toEqual(herdada);
  });
});

describe("confirmar gera uma foto para cada tela", () => {
  it("entrega um arquivo por aba, nas medidas exatas de cada moldura", async () => {
    const registro = prepararRecorte();
    const { aoConfirmar } = await abrir();
    registro.telas.length = 0;
    await confirmar();

    expect(aoConfirmar).toHaveBeenCalledTimes(1);
    const resultado = aoConfirmar.mock.calls[0]![0] as ResultadoDoRecorte;
    expect(
      resultado.variantes?.map((v) => [v.id, v.largura, v.altura]),
    ).toEqual([
      ["computador", 1600, 1200],
      ["celular", 720, 1600],
    ]);
    expect(resultado.arquivo).toBe(resultado.variantes?.[0]?.arquivo);
    expect(resultado.variantes?.map((v) => v.arquivo.type)).toEqual([
      "image/webp",
      "image/webp",
    ]);
    // Dois canvas, um de cada moldura.
    expect(registro.telas).toEqual(
      expect.arrayContaining([
        { largura: 1600, altura: 1200 },
        { largura: 720, altura: 1600 },
      ]),
    );
    // O enquadramento fica no resultado, para reabrir o ajuste depois.
    expect(Object.keys(resultado.ajuste.estados).sort()).toEqual([
      "celular",
      "computador",
    ]);
    expect(resultado.ajuste.iguais).toBe(true);
  });

  it("numa moldura só (a logo) entrega um arquivo e nenhuma lista de abas", async () => {
    prepararRecorte();
    const { aoConfirmar } = await abrir({ espaco: LOGO as typeof FUNDO });
    await confirmar();
    const resultado = aoConfirmar.mock.calls[0]![0] as ResultadoDoRecorte;
    expect(resultado.variantes).toBeUndefined();
    expect([resultado.largura, resultado.altura]).toEqual([512, 512]);
  });
});

describe("o original é guardado para reabrir sem perda", () => {
  it("foto leve: o original é a própria foto escolhida", async () => {
    prepararRecorte({ largura: 2400, altura: 1800 });
    const arquivo = foto("minha-foto.jpg", 2048);
    const { aoConfirmar } = await abrir({ arquivo });
    await confirmar();
    const resultado = aoConfirmar.mock.calls[0]![0] as ResultadoDoRecorte;
    expect(resultado.original).toBe(arquivo);
  });

  it("foto enorme: o original é uma cópia reduzida a 3000 px, sem corte", async () => {
    const registro = prepararRecorte({ largura: 6000, altura: 4000 });
    const arquivo = foto("gigante.jpg", 2048);
    const { aoConfirmar } = await abrir({ arquivo });
    registro.telas.length = 0;
    await confirmar();
    const resultado = aoConfirmar.mock.calls[0]![0] as ResultadoDoRecorte;
    expect(resultado.original).not.toBe(arquivo);
    expect(resultado.original?.type).toBe("image/webp");
    // 6000 × 4000 → 3000 × 2000: a foto INTEIRA, só menor.
    expect(registro.telas).toEqual(
      expect.arrayContaining([{ largura: 3000, altura: 2000 }]),
    );
  });
});

describe("reabrir 'Ajustar a foto' com o enquadramento de antes", () => {
  it("a janela volta onde a pessoa tinha deixado a foto, no computador e no celular", async () => {
    prepararRecorte();
    const primeira = await abrir();
    await act(async () => {
      const zoom = janela().querySelector<HTMLInputElement>(
        'input[type="range"]',
      )!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(zoom, "2.5");
      zoom.dispatchEvent(new Event("input", { bubbles: true }));
      zoom.dispatchEvent(new Event("change", { bubbles: true }));
    });
    teclar(moldura(), "ArrowLeft", { shiftKey: true });
    const noComputador = posicaoDaFoto();
    await irPara("Celular");
    teclar(moldura(), "ArrowUp", { shiftKey: true });
    const noCelular = posicaoDaFoto();
    await confirmar();
    const resultado = primeira.aoConfirmar.mock
      .calls[0]![0] as ResultadoDoRecorte;
    desmontar();

    prepararRecorte();
    await abrir({ ajusteInicial: resultado.ajuste });
    expect(posicaoDaFoto()).toEqual(noComputador);
    await irPara("Celular");
    // O celular tinha ajuste próprio: a caixinha volta desmarcada.
    expect(caixinha()?.checked).toBe(false);
    expect(posicaoDaFoto()).toEqual(noCelular);
  });
});

describe("a foto pequena demais é avisada em cada tela", () => {
  it("diz em qual das telas a foto fica borrada", async () => {
    prepararRecorte({ largura: 1300, altura: 975 });
    await abrir();
    // 1300 px serve no computador (mínimo 1200), mas no celular (em pé, 720 × 1600)
    // a foto precisa cobrir 1600 px de altura: fica pequena.
    expect(janela().textContent).toContain(
      "No celular: ela pode ficar borrada",
    );
    expect(janela().textContent).not.toContain(
      "No computador: ela pode ficar borrada",
    );
  });
});
