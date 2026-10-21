/**
 * Card #46 — a conferência da mídia pelos BYTES: tipo real, duração e quadro;
 * os limites do ambiente; as iniciais da loja e a ordem das bolinhas dos
 * stories.
 */

import { iniciaisDaLoja } from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import {
  mp4DeProva,
  pngDeProva,
  webmDeProva,
} from "../../tests/apoio-de-midia.ts";
import {
  agruparPorLoja,
  type LinhaDoStoryAtivo,
} from "../modules/stories/stories.usecase.ts";
import {
  conferirMidia,
  duracaoDoVideoMs,
  limitesDeMidiaDoAmbiente,
} from "./conferencia-de-midia.ts";

describe("conferirMidia: o que o arquivo é de verdade", () => {
  it("lê o mp4: formato, duração e quadro vertical", () => {
    expect(conferirMidia(mp4DeProva(12_345))).toEqual({
      tipo: "video",
      formato: "mp4",
      tipoDeConteudo: "video/mp4",
      extensao: "mp4",
      duracaoMs: 12_345,
      largura: 1080,
      altura: 1920,
    });
  });

  it("lê o webm com duração e quadro", () => {
    expect(conferirMidia(webmDeProva(8_000))).toMatchObject({
      tipo: "video",
      formato: "webm",
      duracaoMs: 8_000,
      largura: 720,
      altura: 1280,
    });
  });

  it("webm gravado no navegador (sem duração) é vídeo, com duração nula", () => {
    expect(conferirMidia(webmDeProva())).toMatchObject({
      tipo: "video",
      formato: "webm",
      duracaoMs: null,
    });
  });

  it("recusa QuickTime (.mov), texto com nome de vídeo e arquivo vazio", () => {
    expect(conferirMidia(mp4DeProva(1_000, { marca: "qt  " }))).toBeNull();
    expect(conferirMidia(Buffer.from("isto nao e um video".repeat(20)))).toBeNull();
    expect(conferirMidia(new Uint8Array())).toBeNull();
  });

  it("reconhece a foto pela assinatura", () => {
    expect(conferirMidia(pngDeProva())).toEqual({
      tipo: "imagem",
      formato: "png",
      tipoDeConteudo: "image/png",
      extensao: "png",
    });
  });

  it("mp4 truncado não derruba a conferência", () => {
    const inteiro = mp4DeProva(5_000);
    expect(conferirMidia(inteiro.subarray(0, 40))).toMatchObject({
      tipo: "video",
      duracaoMs: null,
    });
  });
});

describe("limites e duração", () => {
  it("padrões do contrato e ajuste pelo ambiente", () => {
    expect(limitesDeMidiaDoAmbiente({})).toMatchObject({
      videoTamanhoMaximoBytes: 50 * 1024 * 1024,
      videoDuracaoMaximaSegundos: 60,
      videosPorProduto: 3,
      limpezaDosStoriesMinutos: 10,
    });
    expect(
      limitesDeMidiaDoAmbiente({
        MIDIA_VIDEO_MAX_MB: "20",
        MIDIA_VIDEO_MAX_SEGUNDOS: "30",
        STORIES_LIMPEZA_MINUTOS: "0",
      }),
    ).toMatchObject({
      videoTamanhoMaximoBytes: 20 * 1024 * 1024,
      videoDuracaoMaximaSegundos: 30,
      limpezaDosStoriesMinutos: 0,
    });
  });

  it("a duração lida do arquivo vence a declarada", () => {
    expect(duracaoDoVideoMs(9_000, 3)).toBe(9_000);
    expect(duracaoDoVideoMs(null, 3.5)).toBe(3_500);
    expect(duracaoDoVideoMs(null, undefined)).toBeNull();
  });
});

describe("perfil da loja e ordem das bolinhas", () => {
  it("iniciais sem 'da/de/do'", () => {
    expect(iniciaisDaLoja("Pastelaria da Vila")).toBe("PV");
    expect(iniciaisDaLoja("Açaí")).toBe("AÇ");
    expect(iniciaisDaLoja("  ")).toBe("?");
  });

  const linha = (
    loja: string,
    minutosAtras: number,
    extra: Partial<LinhaDoStoryAtivo> = {},
  ): LinhaDoStoryAtivo => ({
    story_id: `${loja}-${minutosAtras}`,
    kind: "IMAGEM",
    media_url: `https://midia.teste/${loja}`,
    poster_url: null,
    duration_ms: null,
    width: null,
    height: null,
    caption: null,
    link: null,
    created_at: new Date(Date.UTC(2026, 9, 17, 12, 0) - minutosAtras * 60_000),
    expires_at: new Date(Date.UTC(2026, 9, 18, 12, 0)),
    store_slug: loja,
    store_name: `Loja ${loja}`,
    store_logo: null,
    accent_color: null,
    favorited: false,
    seen: false,
    ...extra,
  });

  it("não vistas primeiro, favoritas primeiro, depois a mais recente", () => {
    const lojas = agruparPorLoja([
      linha("vista", 1, { seen: true }),
      linha("nova", 30),
      linha("favorita", 50, { favorited: true }),
      linha("favorita", 40, { favorited: true, seen: true }),
      linha("recente", 5),
    ]);
    expect(lojas.map((l) => l.loja.apelido)).toEqual([
      "favorita",
      "recente",
      "nova",
      "vista",
    ]);
    const favorita = lojas[0];
    expect(favorita?.stories.map((s) => s.visto)).toEqual([false, true]);
    expect(favorita?.temNaoVistos).toBe(true);
    expect(favorita?.loja).toMatchObject({ iniciais: "LF", fotoDePerfil: null });
  });
});
