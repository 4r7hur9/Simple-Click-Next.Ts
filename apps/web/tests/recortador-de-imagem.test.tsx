// @vitest-environment jsdom
/**
 * Prova da janela de recorte (card #82): o que a pessoa vê e faz, e o arquivo
 * que sai. A conta do enquadramento é provada à parte, em
 * `packages/ui/tests/recorte-geometria.test.ts`; aqui se prova a LIGAÇÃO: o
 * mouse, o teclado e os botões mexendo no enquadramento, o limite de tamanho,
 * o aviso de foto pequena, a compressão até caber e a saída em WebP nas
 * dimensões exatas do espaço.
 */
import { RecortadorDeImagem, type ResultadoDoRecorte } from "@simpleclick/ui";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ESPACOS_DE_IMAGEM } from "../src/lib/espacos-de-imagem.ts";
import {
  clicarNaJanela,
  esperarRecorte,
  janelaDeRecorte,
  prepararRecorte,
} from "./apoio-recorte.ts";
import { desmontar, montar } from "./apoio-config.tsx";

afterEach(desmontar);

// Uma faixa larga de 4:1, sem abas (os espaços do fundo da vitrine e do topo do
// cardápio têm uma moldura para o computador e outra para o celular: ver
// `recortador-com-abas.test.tsx`).
const FUNDO = {
  rotulo: "Foto de fundo da vitrine",
  largura: 1600,
  altura: 400,
  minimo: { largura: 1200, altura: 300 },
  veu: true,
  miniaturas: [
    { rotulo: "No computador", proporcao: 4, largura: 280, veu: true },
    {
      rotulo: "No celular",
      proporcao: 1.9,
      largura: 150,
      veu: true,
      alinhar: "direita",
    },
  ],
} as const;
const LOGO = ESPACOS_DE_IMAGEM.logo; // 512 × 512

function foto(
  parte: Partial<{ nome: string; tipo: string; bytes: number }> = {},
) {
  const { nome = "foto.jpg", tipo = "image/jpeg", bytes = 2048 } = parte;
  return new File([new Uint8Array(bytes)], nome, { type: tipo });
}

interface Abertura {
  readonly aoConfirmar: ReturnType<typeof vi.fn>;
  readonly aoCancelar: ReturnType<typeof vi.fn>;
}

async function abrir(
  opcoes: {
    arquivo?: File;
    espaco?: typeof FUNDO | typeof LOGO;
    limiteDaSaidaEmBytes?: number;
    limiteDaFotoEmBytes?: number;
    posicaoNaFila?: { atual: number; total: number };
    aoConfirmar?: (
      r: ResultadoDoRecorte,
    ) => void | string | Promise<void | string>;
  } = {},
): Promise<Abertura & { tela: HTMLElement }> {
  const aoConfirmar = vi.fn(opcoes.aoConfirmar ?? (() => undefined));
  const aoCancelar = vi.fn();
  const tela = montar(
    <RecortadorDeImagem
      arquivo={opcoes.arquivo ?? foto()}
      espaco={opcoes.espaco ?? FUNDO}
      limiteDaSaidaEmBytes={opcoes.limiteDaSaidaEmBytes}
      limiteDaFotoEmBytes={opcoes.limiteDaFotoEmBytes}
      posicaoNaFila={opcoes.posicaoNaFila}
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
const imagemDoRecorte = () =>
  janela().querySelector<HTMLImageElement>("[data-foto-do-recorte]")!;
const zoom = () =>
  janela().querySelector<HTMLInputElement>('input[type="range"]')!;

/** Os números do `translate(x, y)` da foto na moldura. */
function posicaoDaFoto(): { x: number; y: number } {
  const [x, y] = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/
    .exec(imagemDoRecorte().style.transform)!
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

function ponteiro(
  alvo: HTMLElement,
  tipo: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
  pointerId = 1,
) {
  const evento = Object.assign(
    new MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y, button: 0 }),
    { pointerId, pointerType: "mouse" },
  );
  act(() => {
    alvo.dispatchEvent(evento);
  });
}

describe("a janela abre com o espaço certo", () => {
  it("fechada (sem arquivo) não desenha nada", () => {
    const tela = montar(
      <RecortadorDeImagem
        arquivo={null}
        espaco={FUNDO}
        aoConfirmar={() => undefined}
        aoCancelar={() => undefined}
      />,
    );
    expect(tela.querySelector("dialog")).toBeNull();
  });

  it("é uma janela modal com nome, descrição e a moldura na proporção exata", async () => {
    prepararRecorte();
    await abrir();
    const j = janela();
    expect(j.getAttribute("aria-modal")).toBe("true");
    const titulo = j.querySelector(
      `#${CSS.escape(j.getAttribute("aria-labelledby")!)}`,
    );
    expect(titulo?.textContent).toContain("Foto de fundo da vitrine");
    expect(j.textContent).toContain("A foto sai com 1600 × 400 px");
    expect(j.textContent).toContain("Moldura 1600 × 400 px (4:1)");
    expect(moldura().style.getPropertyValue("--proporcao")).toBe("4");
    // A foto escolhida (2400 × 1800) aparece e o corpo mostra o tamanho dela.
    expect(j.textContent).toContain("sua foto: 2400 × 1800 px");
  });

  it("mostra o 'como vai aparecer' do espaço, com o véu escuro do topo da vitrine", async () => {
    prepararRecorte();
    await abrir();
    const quadros = [...janela().querySelectorAll("[data-miniatura]")].map(
      (q) => q.getAttribute("data-miniatura"),
    );
    expect(quadros).toEqual(["No computador", "No celular"]);
    expect(janela().querySelectorAll(".sc-recortador__veu").length).toBe(3);
  });

  it("logo redonda ganha a guia circular e as miniaturas redondas", async () => {
    prepararRecorte();
    await abrir({ espaco: LOGO });
    expect(janela().querySelector(".sc-recortador__guia")).not.toBeNull();
    expect(
      janela().querySelector(".sc-recortador__quadro--redondo"),
    ).not.toBeNull();
    expect(moldura().style.getPropertyValue("--proporcao")).toBe("1");
  });

  it("várias fotos em sequência dizem em qual está", async () => {
    prepararRecorte();
    await abrir({ posicaoNaFila: { atual: 2, total: 4 } });
    expect(janela().textContent).toContain("Foto 2 de 4.");
  });
});

describe("arquivo que não serve", () => {
  it("tipo que não é foto é recusado com frase clara, sem abrir o recorte", async () => {
    prepararRecorte();
    await abrir({
      arquivo: foto({ nome: "cardapio.pdf", tipo: "application/pdf" }),
    });
    expect(janela().textContent).toContain(
      "não é uma foto que eu consiga abrir",
    );
    expect(janela().querySelector("[data-foto-do-recorte]")).toBeNull();
    const confirmar = [...janela().querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Usar esta foto"),
    );
    expect(confirmar?.disabled).toBe(true);
  });

  it("foto acima do limite diz o tamanho dela e o limite", async () => {
    prepararRecorte();
    await abrir({
      arquivo: foto({ bytes: 6 * 1024 * 1024 }),
      limiteDaFotoEmBytes: 5 * 1024 * 1024,
    });
    expect(janela().textContent).toContain(
      "Essa foto tem 6,0 MB e o limite para escolher é 5,0 MB",
    );
  });

  it("foto que o navegador não abre (HEIC fora do Safari) orienta a salvar como JPG", async () => {
    prepararRecorte({ quebrada: true });
    await abrir({ arquivo: foto({ nome: "IMG_1.HEIC", tipo: "image/heic" }) });
    expect(janela().textContent).toContain("Se for HEIC, salve como JPG");
  });

  it("HEIC que o navegador lê é aceito", async () => {
    prepararRecorte();
    await abrir({ arquivo: foto({ nome: "IMG_1.HEIC", tipo: "" }) });
    expect(janela().querySelector("[data-foto-do-recorte]")).not.toBeNull();
  });
});

describe("posicionar e aproximar", () => {
  it("preencher: a foto começa centralizada, cobrindo a moldura", async () => {
    prepararRecorte(); // 2400 × 1800 na moldura 320 × 80 (jsdom)
    await abrir();
    const img = imagemDoRecorte();
    expect(Number.parseFloat(img.style.width)).toBeCloseTo(2400 * (320 / 2400));
    expect(Number.parseFloat(img.style.height)).toBeCloseTo(
      1800 * (320 / 2400),
    );
    // Sobra 160 na altura, repartida: a foto sobe 80.
    expect(posicaoDaFoto().x).toBeCloseTo(0);
    expect(posicaoDaFoto().y).toBeCloseTo(-80);
  });

  it("setas movem a foto e ela nunca deixa vão na moldura", async () => {
    prepararRecorte();
    await abrir();
    teclar(moldura(), "ArrowUp");
    expect(posicaoDaFoto().y).toBeCloseTo(-86);
    teclar(moldura(), "ArrowDown", { shiftKey: true }); // passo grande: 24
    expect(posicaoDaFoto().y).toBeCloseTo(-62);
    for (let vez = 0; vez < 30; vez += 1)
      teclar(moldura(), "ArrowDown", { shiftKey: true });
    expect(posicaoDaFoto().y).toBeCloseTo(0); // encostou no topo; para
    for (let vez = 0; vez < 30; vez += 1)
      teclar(moldura(), "ArrowUp", { shiftKey: true });
    expect(posicaoDaFoto().y).toBeCloseTo(-160); // encostou embaixo; para
    teclar(moldura(), "ArrowLeft"); // sem folga na horizontal: não sai do lugar
    expect(posicaoDaFoto().x).toBeCloseTo(0);
  });

  it("arrastar com o mouse move a foto, e soltar encerra o arrasto", async () => {
    prepararRecorte();
    await abrir();
    ponteiro(moldura(), "pointerdown", 100, 100);
    ponteiro(moldura(), "pointermove", 100, 70);
    expect(posicaoDaFoto().y).toBeCloseTo(-110);
    ponteiro(moldura(), "pointermove", 100, 20);
    expect(posicaoDaFoto().y).toBeCloseTo(-160); // preso no limite
    ponteiro(moldura(), "pointerup", 100, 20);
    ponteiro(moldura(), "pointermove", 100, 90);
    expect(posicaoDaFoto().y).toBeCloseTo(-160); // sem botão, não arrasta
  });

  it("pinça com dois dedos aproxima (e afastar volta)", async () => {
    prepararRecorte();
    await abrir();
    ponteiro(moldura(), "pointerdown", 100, 40, 1);
    ponteiro(moldura(), "pointerdown", 200, 40, 2);
    ponteiro(moldura(), "pointermove", 50, 40, 1); // abre: 100 → 150
    expect(Number(zoom().value)).toBeCloseTo(1.5, 1);
    ponteiro(moldura(), "pointermove", 100, 40, 1); // fecha de volta
    expect(Number(zoom().value)).toBeCloseTo(1, 1);
    ponteiro(moldura(), "pointerup", 100, 40, 1);
    ponteiro(moldura(), "pointerup", 200, 40, 2);
  });

  it("roda do mouse aproxima sem rolar a página", async () => {
    prepararRecorte();
    await abrir();
    const roda = new WheelEvent("wheel", {
      deltaY: -200,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      moldura().dispatchEvent(roda);
    });
    expect(roda.defaultPrevented).toBe(true);
    expect(Number(zoom().value)).toBeGreaterThan(1.5);
    const afasta = new WheelEvent("wheel", {
      deltaY: 4000,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      moldura().dispatchEvent(afasta);
    });
    expect(Number(zoom().value)).toBe(1); // nunca abaixo do enquadramento
  });

  it("+ e - do teclado aproximam e afastam; o controle de zoom também", async () => {
    prepararRecorte();
    await abrir();
    teclar(moldura(), "+");
    expect(Number(zoom().value)).toBeCloseTo(1.1);
    teclar(moldura(), "-");
    teclar(moldura(), "-");
    expect(Number(zoom().value)).toBe(1);
    await clicarNaJanela("Aproximar");
    expect(Number(zoom().value)).toBeCloseTo(1.2);
    expect(zoom().getAttribute("aria-valuetext")).toBe("120%");
    await clicarNaJanela("Afastar");
    expect(Number(zoom().value)).toBe(1);
  });

  it("zoom não passa do máximo", async () => {
    prepararRecorte();
    await abrir();
    for (let vez = 0; vez < 50; vez += 1) teclar(moldura(), "+");
    expect(Number(zoom().value)).toBe(4);
  });

  it("girar 90°, espelhar, centralizar e redefinir", async () => {
    prepararRecorte();
    await abrir();
    expect(imagemDoRecorte().style.transform).toContain("rotate(0deg)");
    await clicarNaJanela("Girar 90°");
    expect(imagemDoRecorte().style.transform).toContain("rotate(90deg)");

    await clicarNaJanela("Espelhar");
    expect(imagemDoRecorte().style.transform).toContain("scaleX(-1)");
    const espelhar = [...janela().querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Espelhar"),
    )!;
    expect(espelhar.getAttribute("aria-pressed")).toBe("true");

    teclar(moldura(), "+");
    teclar(moldura(), "+");
    teclar(moldura(), "ArrowLeft", { shiftKey: true });
    await clicarNaJanela("Centralizar");
    expect(Number(zoom().value)).toBeCloseTo(1.2); // centralizar não mexe no zoom

    await clicarNaJanela("Redefinir");
    expect(Number(zoom().value)).toBe(1);
    expect(imagemDoRecorte().style.transform).toContain("rotate(0deg)");
    expect(imagemDoRecorte().style.transform).not.toContain("scaleX");
  });
});

describe("preencher e ajustar", () => {
  it("ajustar mostra a foto inteira, com opções de fundo para as sobras", async () => {
    prepararRecorte();
    await abrir();
    expect(janela().textContent).not.toContain("Fundo nas sobras");
    await clicarNaJanela("Ajustar");
    const img = imagemDoRecorte();
    // A foto inteira dentro de 320 × 80: a altura manda (80), a largura fica em 106,7.
    expect(Number.parseFloat(img.style.height)).toBeCloseTo(80);
    expect(Number.parseFloat(img.style.width)).toBeCloseTo(106.667, 2);
    expect(janela().textContent).toContain("Fundo nas sobras");
    for (const opcao of ["Cor da foto", "Preto", "Branco", "Transparente"]) {
      expect(janela().textContent).toContain(opcao);
    }
    await clicarNaJanela("Preto");
    expect(moldura().style.backgroundColor).toBe("rgb(11, 15, 13)");
    await clicarNaJanela("Transparente");
    expect(moldura().className).toContain("sc-recortador__xadrez");
    await clicarNaJanela("Preencher");
    expect(janela().textContent).not.toContain("Fundo nas sobras");
  });

  it("o fundo 'cor da foto' usa a cor média da imagem", async () => {
    prepararRecorte();
    await abrir();
    await clicarNaJanela("Ajustar");
    // O canvas de mentira devolve (120, 80, 40).
    expect(moldura().style.backgroundColor).toBe("rgb(120, 80, 40)");
  });
});

describe("foto pequena demais", () => {
  it("avisa quando a foto não chega ao mínimo recomendado do espaço", async () => {
    prepararRecorte({ largura: 800, altura: 300 }); // o mínimo da vitrine é 1200 × 300
    await abrir();
    expect(janela().textContent).toContain("A foto é pequena para este espaço");
    expect(janela().textContent).toContain("1200 × 300 px");
  });

  it("foto grande não ganha aviso; aproximar demais faz o aviso aparecer", async () => {
    prepararRecorte({ largura: 2400, altura: 600 });
    await abrir();
    expect(janela().textContent).not.toContain("A foto é pequena");
    for (let vez = 0; vez < 12; vez += 1) teclar(moldura(), "+"); // zoom 2,2
    expect(janela().textContent).toContain("A foto é pequena para este espaço");
  });
});

describe("a saída", () => {
  it("gera um WebP nas dimensões EXATAS do espaço e entrega ao envio", async () => {
    const registro = prepararRecorte();
    const { aoConfirmar } = await abrir({
      arquivo: foto({ nome: "praia.JPG" }),
    });
    await clicarNaJanela("Usar esta foto");
    await esperarRecorte();

    expect(registro.telas.at(-1)).toEqual({ largura: 1600, altura: 400 });
    expect(registro.pedidos[0]).toEqual({
      tipo: "image/webp",
      qualidade: 0.85,
    });
    expect(aoConfirmar).toHaveBeenCalledTimes(1);
    const resultado = aoConfirmar.mock.calls[0]![0] as ResultadoDoRecorte;
    expect(resultado.arquivo).toBeInstanceOf(File);
    expect(resultado.arquivo.type).toBe("image/webp");
    expect(resultado.arquivo.name).toBe("praia.webp");
    expect(resultado).toMatchObject({
      largura: 1600,
      altura: 400,
      modo: "preencher",
    });
    // A foto é desenhada com a matriz do enquadramento: escala 1600 ÷ 320 × 0,1333.
    const [a = 1, b = 1, c = 1, d = 0] = registro.matrizes.at(-1) ?? [];
    expect(a).toBeCloseTo(0.6667, 3);
    expect(d).toBeCloseTo(0.6667, 3);
    expect(b).toBe(0);
    expect(c).toBe(0);
  });

  it("a matriz acompanha o giro e o espelho", async () => {
    const registro = prepararRecorte();
    await abrir();
    await clicarNaJanela("Girar 90°");
    await clicarNaJanela("Espelhar");
    await clicarNaJanela("Usar esta foto");
    const [a = 1, b = 0, c = 0, d = 1] = registro.matrizes.at(-1) ?? [];
    // Girada 90° e espelhada: o eixo x da foto vira o eixo y da saída.
    expect(a).toBe(0);
    expect(d).toBe(0);
    expect(Math.abs(b)).toBeGreaterThan(0);
    expect(Math.abs(c)).toBeGreaterThan(0);
  });

  it("comprime mais até caber no limite do espaço", async () => {
    const registro = prepararRecorte({ pesoDaSaida: 5000 });
    const { aoConfirmar } = await abrir({ limiteDaSaidaEmBytes: 4000 });
    await clicarNaJanela("Usar esta foto");
    await esperarRecorte();
    const qualidades = registro.pedidos.map((p) => p.qualidade);
    expect(qualidades[0]).toBe(0.85);
    expect(qualidades.length).toBeGreaterThan(1);
    expect(qualidades.at(-1)).toBeLessThan(0.85);
    const resultado = aoConfirmar.mock.calls[0]![0] as ResultadoDoRecorte;
    expect(resultado.arquivo.size).toBeLessThanOrEqual(4000);
  });

  it("se nem a menor qualidade cabe, diz o limite e não entrega nada", async () => {
    prepararRecorte({ pesoDaSaida: 90_000 });
    const { aoConfirmar } = await abrir({
      limiteDaSaidaEmBytes: (1024 * 1024) / 1000,
    });
    await clicarNaJanela("Usar esta foto");
    await esperarRecorte();
    expect(aoConfirmar).not.toHaveBeenCalled();
    expect(janela().textContent).toContain("Mesmo comprimida, a foto passa de");
  });

  it("recusa do envio fica na janela, que continua aberta para tentar de novo", async () => {
    prepararRecorte();
    await abrir({
      aoConfirmar: () => "O envio não está disponível agora.",
    });
    await clicarNaJanela("Usar esta foto");
    await esperarRecorte();
    expect(janela().textContent).toContain(
      "O envio não está disponível agora.",
    );
    const confirmar = [...janela().querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Usar esta foto"),
    );
    expect(confirmar?.disabled).toBe(false);
  });
});

describe("cancelar e acessibilidade", () => {
  it("Esc cancela (sem fechar à força: quem abriu decide)", async () => {
    prepararRecorte();
    const { aoCancelar } = await abrir();
    const cancelamento = new Event("cancel", { cancelable: true });
    act(() => {
      janela().dispatchEvent(cancelamento);
    });
    expect(cancelamento.defaultPrevented).toBe(true);
    expect(aoCancelar).toHaveBeenCalledTimes(1);
  });

  it("os botões Cancelar e Fechar chamam o cancelamento", async () => {
    prepararRecorte();
    const { aoCancelar } = await abrir();
    await clicarNaJanela("Cancelar");
    await clicarNaJanela("Cancelar e fechar");
    expect(aoCancelar).toHaveBeenCalledTimes(2);
  });

  it("a moldura é focável, tem nome e os botões de modo dizem o estado", async () => {
    prepararRecorte();
    await abrir();
    expect(moldura().tabIndex).toBe(0);
    expect(moldura().getAttribute("aria-label")).toContain(
      "Arraste para mover",
    );
    const modos = [...janela().querySelectorAll("button[aria-pressed]")].filter(
      (b) => ["Preencher", "Ajustar"].includes(b.textContent?.trim() ?? ""),
    );
    expect(modos.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
    ]);
    expect(zoom().id).not.toBe("");
    expect(
      janela().querySelector(`label[for="${CSS.escape(zoom().id)}"]`)
        ?.textContent,
    ).toBe("Zoom");
  });
});
