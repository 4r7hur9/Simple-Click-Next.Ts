/**
 * Captura do Story (card #84): contexto seguro, erros da câmera, botão de
 * toque/segurar, gravação com limite e escolha do formato.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  classificarErroDaCamera,
  criarBotaoDeCaptura,
  escolherTipoDeGravacao,
  explicarProblemaDaCamera,
  fracaoDaGravacao,
  iniciarGravacao,
  restricoesDaCamera,
  situacaoDaCamera,
  tipoSemCodec,
  tochaSuportada,
} from "../src/features/stories/captura";

describe("a câmera pode ser usada?", () => {
  it("só em contexto seguro e com getUserMedia", () => {
    expect(situacaoDaCamera({ isSecureContext: true, mediaDevices: { getUserMedia: () => {} } })).toBe("disponivel");
    expect(situacaoDaCamera({ isSecureContext: false, mediaDevices: undefined })).toBe("inseguro");
    expect(situacaoDaCamera({ isSecureContext: false, mediaDevices: { getUserMedia: () => {} } })).toBe("inseguro");
    expect(situacaoDaCamera({ isSecureContext: true, mediaDevices: undefined })).toBe("sem-suporte");
  });

  it("traduz o erro do navegador", () => {
    expect(classificarErroDaCamera({ name: "NotAllowedError" })).toBe("negada");
    expect(classificarErroDaCamera({ name: "NotFoundError" })).toBe("sem-camera");
    expect(classificarErroDaCamera({ name: "NotReadableError" })).toBe("ocupada");
    expect(classificarErroDaCamera(new Error("x"))).toBe("falha");
    expect(classificarErroDaCamera(null)).toBe("falha");
  });

  it("cada problema tem uma explicação em português simples", () => {
    for (const problema of ["negada", "sem-camera", "ocupada", "inseguro", "sem-suporte", "falha"] as const) {
      const { titulo, texto } = explicarProblemaDaCamera(problema);
      expect(titulo.length).toBeGreaterThan(5);
      expect(texto).toMatch(/galeria/i);
    }
    expect(explicarProblemaDaCamera("inseguro").texto).toContain("https://");
  });

  it("pede a câmera de trás por padrão, ou a da frente", () => {
    expect(restricoesDaCamera("environment")).toMatchObject({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    expect(restricoesDaCamera("user")).toMatchObject({
      video: { facingMode: { ideal: "user" } },
    });
  });

  it("detecta se há tocha", () => {
    const com = { getCapabilities: () => ({ torch: true }) } as unknown as MediaStreamTrack;
    const sem = { getCapabilities: () => ({}) } as unknown as MediaStreamTrack;
    expect(tochaSuportada(com)).toBe(true);
    expect(tochaSuportada(sem)).toBe(false);
    expect(tochaSuportada(undefined)).toBe(false);
    expect(tochaSuportada({} as MediaStreamTrack)).toBe(false);
  });
});

describe("formato da gravação", () => {
  it("usa o primeiro que o navegador grava", () => {
    expect(escolherTipoDeGravacao((t) => t === "video/mp4")).toBe("video/mp4");
    expect(escolherTipoDeGravacao(() => true)).toBe("video/webm;codecs=vp9,opus");
    expect(escolherTipoDeGravacao(() => false)).toBeUndefined();
    expect(
      escolherTipoDeGravacao(() => {
        throw new Error("x");
      }),
    ).toBeUndefined();
    expect(tipoSemCodec("video/webm;codecs=vp9,opus")).toBe("video/webm");
  });

  it("o anel anda de 0 a 1 e para no limite", () => {
    expect(fracaoDaGravacao(0, 15_000)).toBe(0);
    expect(fracaoDaGravacao(7_500, 15_000)).toBe(0.5);
    expect(fracaoDaGravacao(99_000, 15_000)).toBe(1);
    expect(fracaoDaGravacao(10, 0)).toBe(0);
  });
});

describe("o botão redondo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function montar() {
    const eventos: string[] = [];
    const botao = criarBotaoDeCaptura({
      aoTirarFoto: () => eventos.push("foto"),
      aoComecarVideo: () => eventos.push("video+"),
      aoTerminarVideo: () => eventos.push("video-"),
    });
    return { botao, eventos };
  }

  it("toque rápido tira foto", () => {
    const { botao, eventos } = montar();
    botao.apertou();
    vi.advanceTimersByTime(100);
    botao.soltou();
    vi.advanceTimersByTime(1000);
    expect(eventos).toEqual(["foto"]);
  });

  it("segurar começa o vídeo, soltar termina e não tira foto", () => {
    const { botao, eventos } = montar();
    botao.apertou();
    vi.advanceTimersByTime(400);
    expect(eventos).toEqual(["video+"]);
    botao.soltou();
    expect(eventos).toEqual(["video+", "video-"]);
  });

  it("o dedo que sai da tela cancela sem foto; durante o vídeo, termina o vídeo", () => {
    const a = montar();
    a.botao.apertou();
    a.botao.cancelou();
    vi.advanceTimersByTime(1000);
    expect(a.eventos).toEqual([]);

    const b = montar();
    b.botao.apertou();
    vi.advanceTimersByTime(400);
    b.botao.cancelou();
    expect(b.eventos).toEqual(["video+", "video-"]);
  });

  it("soltar sem ter apertado não faz nada, e apertar duas vezes conta uma", () => {
    const { botao, eventos } = montar();
    botao.soltou();
    botao.apertou();
    botao.apertou();
    botao.soltou();
    expect(eventos).toEqual(["foto"]);
  });
});

class GravadorDeMentira {
  static ultimo: GravadorDeMentira | null = null;
  state: "inactive" | "recording" = "inactive";
  mimeType = "video/webm;codecs=vp9,opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(
    public fluxo: unknown,
    public opcoes: unknown,
  ) {
    GravadorDeMentira.ultimo = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["abc"]) });
    this.onstop?.();
  }
}

describe("a gravação de vídeo curto", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function gravar(maximoSegundos = 15) {
    const progresso: number[] = [];
    const terminou = vi.fn();
    const falhou = vi.fn();
    let agora = 0;
    const gravador = iniciarGravacao({
      fluxo: {} as MediaStream,
      maximoSegundos,
      aoProgredir: (f) => progresso.push(f),
      aoTerminar: terminou,
      aoFalhar: falhou,
      criarGravador: (fluxo, opcoes) =>
        new GravadorDeMentira(fluxo, opcoes) as unknown as MediaRecorder,
      suporta: (tipo) => tipo.startsWith("video/webm"),
      agora: () => agora,
    });
    return {
      gravador,
      progresso,
      terminou,
      falhou,
      passar(ms: number) {
        agora += ms;
        vi.advanceTimersByTime(ms);
      },
    };
  }

  it("grava no formato escolhido e entrega o arquivo ao parar", () => {
    const g = gravar();
    expect((GravadorDeMentira.ultimo?.opcoes as { mimeType: string }).mimeType).toBe(
      "video/webm;codecs=vp9,opus",
    );
    g.passar(3000);
    g.gravador.parar();
    expect(g.terminou).toHaveBeenCalledTimes(1);
    const gravacao = g.terminou.mock.calls[0]![0] as { arquivo: Blob; duracaoSegundos: number };
    expect(gravacao.arquivo.type).toBe("video/webm");
    expect(gravacao.duracaoSegundos).toBeCloseTo(3, 0);
    expect(g.progresso.at(-1)).toBe(1);
  });

  it("para sozinha no limite de 15 s", () => {
    const g = gravar(15);
    g.passar(14_000);
    expect(g.terminou).not.toHaveBeenCalled();
    g.passar(1_100);
    expect(g.terminou).toHaveBeenCalledTimes(1);
    expect((g.terminou.mock.calls[0]![0] as { duracaoSegundos: number }).duracaoSegundos).toBe(15);
  });

  it("cancelar descarta o que foi gravado", () => {
    const g = gravar();
    g.passar(1000);
    g.gravador.cancelar();
    g.passar(20_000);
    expect(g.terminou).not.toHaveBeenCalled();
  });

  it("se o gravador não nasce, avisa", () => {
    const falhou = vi.fn();
    iniciarGravacao({
      fluxo: {} as MediaStream,
      maximoSegundos: 15,
      aoProgredir: () => {},
      aoTerminar: () => {},
      aoFalhar: falhou,
      criarGravador: () => {
        throw new Error("sem suporte");
      },
      suporta: () => true,
    });
    expect(falhou).toHaveBeenCalled();
  });
});
