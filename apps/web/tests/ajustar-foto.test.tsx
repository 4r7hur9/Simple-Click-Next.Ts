// @vitest-environment jsdom
/**
 * "Ajustar" uma foto que já foi enviada (card #36): reabre a janela de recorte
 * com a foto e o enquadramento de agora, sem reenviar o arquivo, e guarda o
 * original para reeditar sem perda de qualidade.
 */
import type { AjusteDaFoto } from "@simpleclick/contracts";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormularioAparencia } from "../src/features/config/FormularioAparencia.tsx";
import {
  confirmarRecorte,
  esperarRecorte,
  janelaDeRecorte,
  prepararRecorte,
} from "./apoio-recorte.ts";
import { clicar, desmontar, esperar, exigir, montar } from "./apoio-config.tsx";

const ORIGINAL = "http://localhost:3001/v1/midia/arquivos/l/loja/original.webp";
const DO_COMPUTADOR =
  "http://localhost:3001/v1/midia/arquivos/l/loja/fundo.webp";
const DO_CELULAR =
  "http://localhost:3001/v1/midia/arquivos/l/loja/fundo-celular.webp";
const NOVA = "http://localhost:3001/v1/midia/arquivos/l/loja/nova";

const AJUSTE: AjusteDaFoto = {
  original: ORIGINAL,
  computador: DO_COMPUTADOR,
  celular: DO_CELULAR,
  iguais: false,
  fundo: { tipo: "media" },
  estados: {
    // Foto 2400 × 1800 na moldura 1600 × 1200, aproximada 2× e levada para a esquerda/cima.
    computador: {
      modo: "preencher",
      zoom: 2,
      x: -800,
      y: -300,
      giro: 0,
      espelhado: false,
    },
    celular: {
      modo: "preencher",
      zoom: 1.5,
      x: -100,
      y: -200,
      giro: 0,
      espelhado: false,
    },
  },
};

const APARENCIA = {
  nome: "Pastelaria da Zica",
  boasVindas: null,
  sobre: null,
  logo: null,
  capa: DO_COMPUTADOR,
  corPrimaria: null,
};

interface Chamada {
  readonly url: string;
  readonly metodo: string;
  readonly corpo: unknown;
}
let chamadas: Chamada[];

function simular(
  tema: Record<string, unknown>,
  aparencia: Record<string, unknown> = APARENCIA,
) {
  chamadas = [];
  vi.stubGlobal(
    "fetch",
    async (endereco: RequestInfo | URL, init?: RequestInit) => {
      const url = String(endereco);
      const metodo = init?.method ?? "GET";
      chamadas.push({
        url,
        metodo,
        corpo:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      if (url.startsWith("/api/loja/foto?")) {
        return new Response(
          new Blob([new Uint8Array(32)], { type: "image/webp" }),
          {
            status: 200,
            headers: { "content-type": "image/webp" },
          },
        );
      }
      const envio = /\/api\/loja\/imagem\/(\w+)$/.exec(url);
      if (envio !== null) {
        return Response.json({ url: `${NOVA}-${envio[1]}.webp` });
      }
      if (metodo === "PUT") return new Response(null, { status: 204 });
      if (url.endsWith("/api/loja/tema")) return Response.json(tema);
      if (url.endsWith("/api/loja/contato"))
        return Response.json({
          numero: "11912345678",
          saudacao: null,
          publico: true,
        });
      return Response.json(aparencia);
    },
  );
}

const TEMA_BASE = {
  corDestaque: "#b7ff00",
  corDeFundo: "#000000",
  fundoVitrine: DO_COMPUTADOR,
  fundoVitrineCelular: DO_CELULAR,
  topoCardapio: null,
  topoCardapioCelular: null,
};

beforeEach(() => {
  prepararRecorte({ largura: 2400, altura: 1800 });
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: () => {},
  });
});
afterEach(() => {
  desmontar();
  Reflect.deleteProperty(document, "cookie");
});

async function abrir(
  tema: Record<string, unknown>,
  aparencia: Record<string, unknown> = APARENCIA,
) {
  simular(tema, aparencia);
  const tela = montar(<FormularioAparencia apelido="pastelaria" />);
  await esperar();
  return tela;
}

const janela = () => janelaDeRecorte()!;
const posicaoDaFoto = () => {
  const imagem = janela().querySelector<HTMLImageElement>(
    "[data-foto-do-recorte]",
  )!;
  const [x, y] = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/
    .exec(imagem.style.transform)!
    .slice(1);
  return { x: Number(x), y: Number(y) };
};
const aba = (rotulo: string) =>
  [...janela().querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (a) => a.textContent === rotulo,
  )!;

async function ajustar(tela: HTMLElement, qual = "fundo") {
  clicar(exigir(tela, `[data-ajustar="${qual}"]`));
  await esperar();
  await esperarRecorte();
}

describe("o botão Ajustar", () => {
  it("só aparece quando já há uma foto", async () => {
    const tela = await abrir(
      { ...TEMA_BASE, fundoVitrine: null, fundoVitrineCelular: null },
      { ...APARENCIA, capa: null },
    );
    expect(tela.querySelector('[data-ajustar="fundo"]')).toBeNull();
    expect(tela.querySelector('[data-ajustar="topo"]')).toBeNull();
  });

  it("com o original guardado, abre o ORIGINAL (sem corte) e o enquadramento de antes", async () => {
    const tela = await abrir({
      ...TEMA_BASE,
      ajustesDasFotos: { fundoVitrine: AJUSTE },
    });
    await ajustar(tela);

    // A foto que se abre é o original, e não a já recortada.
    const pedido = chamadas.find((c) => c.url.startsWith("/api/loja/foto?"));
    expect(pedido?.url).toBe(
      `/api/loja/foto?u=${encodeURIComponent(ORIGINAL)}`,
    );
    expect(janela().textContent).toContain(
      "Ajustar a foto: Foto de fundo da vitrine",
    );

    // Computador: zoom 2× e a posição guardada (na moldura de 320 px de largura: ×0,2).
    expect(
      Number(
        janela().querySelector<HTMLInputElement>('input[type="range"]')!.value,
      ),
    ).toBeCloseTo(2, 1);
    expect(posicaoDaFoto().x).toBeCloseTo(-160);
    expect(posicaoDaFoto().y).toBeCloseTo(-60);

    // Celular: ajuste próprio, então a caixinha volta desmarcada.
    await act(async () => aba("Celular").click());
    await esperarRecorte();
    expect(
      janela().querySelector<HTMLInputElement>(".sc-recortador__igual input")
        ?.checked,
    ).toBe(false);
    expect(
      Number(
        janela().querySelector<HTMLInputElement>('input[type="range"]')!.value,
      ),
    ).toBeCloseTo(1.5, 1);
  });

  it("confirmar reenvia só as duas fotos recortadas e guarda o MESMO original", async () => {
    const tela = await abrir({
      ...TEMA_BASE,
      ajustesDasFotos: { fundoVitrine: AJUSTE },
    });
    await ajustar(tela);
    await confirmarRecorte();
    await esperar();

    const envios = chamadas.filter((c) => c.metodo === "PUT").map((c) => c.url);
    expect(envios).toEqual([
      "/api/loja/imagem/fundo",
      "/api/loja/imagem/fundoCelular",
    ]);
    // O original não é reenviado: o ajuste continua apontando para ele.
    expect(envios).not.toContain("/api/loja/imagem/original");

    act(() => {
      exigir<HTMLFormElement>(tela, "form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await esperar();
    const tema = chamadas
      .filter((c) => c.metodo === "PUT" && c.url.endsWith("/api/loja/tema"))
      .at(-1);
    const corpo = tema?.corpo as {
      fundoVitrine: string;
      fundoVitrineCelular: string;
      ajustesDasFotos: { fundoVitrine: AjusteDaFoto };
    };
    expect(corpo.fundoVitrine).toBe(`${NOVA}-fundo.webp`);
    expect(corpo.fundoVitrineCelular).toBe(`${NOVA}-fundoCelular.webp`);
    expect(corpo.ajustesDasFotos.fundoVitrine).toMatchObject({
      original: ORIGINAL,
      computador: `${NOVA}-fundo.webp`,
      celular: `${NOVA}-fundoCelular.webp`,
      iguais: false,
    });
  });

  it("cancelar não envia nada", async () => {
    const tela = await abrir({
      ...TEMA_BASE,
      ajustesDasFotos: { fundoVitrine: AJUSTE },
    });
    await ajustar(tela);
    await act(async () => {
      [...janela().querySelectorAll("button")]
        .find((b) => b.textContent === "Cancelar")!
        .click();
    });
    await esperarRecorte();
    expect(chamadas.some((c) => c.metodo === "PUT")).toBe(false);
  });
});

describe("foto enviada antes de existir o ajuste", () => {
  it("abre a foto que está no ar e, ao confirmar, guarda uma cópia como original", async () => {
    const tela = await abrir(TEMA_BASE);
    await ajustar(tela);
    expect(chamadas.find((c) => c.url.startsWith("/api/loja/foto?"))?.url).toBe(
      `/api/loja/foto?u=${encodeURIComponent(DO_COMPUTADOR)}`,
    );

    await confirmarRecorte();
    await esperar();
    const envios = chamadas.filter((c) => c.metodo === "PUT").map((c) => c.url);
    expect(envios).toEqual([
      "/api/loja/imagem/fundo",
      "/api/loja/imagem/fundoCelular",
      "/api/loja/imagem/original",
    ]);

    act(() => {
      exigir<HTMLFormElement>(tela, "form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await esperar();
    const tema = chamadas
      .filter((c) => c.metodo === "PUT" && c.url.endsWith("/api/loja/tema"))
      .at(-1);
    expect(
      (tema?.corpo as { ajustesDasFotos: { fundoVitrine: AjusteDaFoto } })
        .ajustesDasFotos.fundoVitrine.original,
    ).toBe(`${NOVA}-original.webp`);
  });

  it("ajuste de outra foto (a foto foi trocada) é ignorado: parte da foto atual", async () => {
    const velho = {
      ...AJUSTE,
      computador: "http://localhost:3001/v1/midia/arquivos/l/loja/antiga.webp",
    };
    const tela = await abrir({
      ...TEMA_BASE,
      ajustesDasFotos: { fundoVitrine: velho },
    });
    await ajustar(tela);
    expect(chamadas.find((c) => c.url.startsWith("/api/loja/foto?"))?.url).toBe(
      `/api/loja/foto?u=${encodeURIComponent(DO_COMPUTADOR)}`,
    );
    // Sem enquadramento guardado: começa centralizada, sem zoom.
    expect(
      Number(
        janela().querySelector<HTMLInputElement>('input[type="range"]')!.value,
      ),
    ).toBe(1);
  });

  it("foto que não abre dá uma frase que diz o que fazer", async () => {
    const tela = await abrir(TEMA_BASE);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 502 }));
    clicar(exigir(tela, '[data-ajustar="fundo"]'));
    await esperar();
    expect(tela.textContent).toContain(
      "Não consegui abrir a foto atual para ajustar",
    );
    expect(janelaDeRecorte()).toBeNull();
  });
});

describe("remover leva o ajuste junto", () => {
  it("sem foto não há ajuste para guardar", async () => {
    const tela = await abrir({
      ...TEMA_BASE,
      ajustesDasFotos: { fundoVitrine: AJUSTE },
    });
    const remover = [...tela.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Remover e voltar à capa padrão"),
    )!;
    clicar(remover);
    act(() => {
      exigir<HTMLFormElement>(tela, "form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await esperar();
    const tema = chamadas
      .filter((c) => c.metodo === "PUT" && c.url.endsWith("/api/loja/tema"))
      .at(-1);
    expect(tema?.corpo).toMatchObject({
      fundoVitrine: null,
      ajustesDasFotos: {},
    });
  });
});
