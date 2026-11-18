// @vitest-environment jsdom
/**
 * Stories da loja no painel (card #48), sobre o contrato do card #46.
 *
 * A tela deixa claro que o story some em 24 horas e não fica guardado, lista
 * os que estão no ar com a contagem regressiva e as visualizações, posta o
 * ARQUIVO cru com legenda e link da vitrine, e apaga com confirmação.
 *
 * Desde o card #84 o envio é pelo EDITOR em tela cheia (câmera, desenho,
 * texto, adesivos): aqui só se prova que o botão "Criar story" o abre e que o
 * limite o desliga. O editor em si tem os testes `stories-editor-*`.
 */
import type { StoryDaLoja } from "@simpleclick/contracts";
import { act } from "react";

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TelaDeStories,
  type PerfilDaTela,
} from "../src/features/stories-painel/TelaDeStories";
import {
  fracaoPassada,
  tempoQueFalta,
  textoDasVisualizacoes,
} from "../src/features/stories-painel/tempo";

const AGORA = new Date("2026-10-17T12:00:00Z").getTime();

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function story(parte: Partial<StoryDaLoja> & { id: string }): StoryDaLoja {
  return {
    tipo: "imagem",
    url: "http://localhost:3001/v1/midia/arquivos/s.jpg",
    capa: null,
    duracaoSegundos: null,
    largura: 1080,
    altura: 1920,
    legenda: null,
    link: null,
    criadoEm: new Date(AGORA - 2 * 3_600_000).toISOString(),
    expiraEm: new Date(AGORA + 22 * 3_600_000 + 15 * 60_000).toISOString(),
    visualizacoes: 0,
    ...parte,
  };
}

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const PERFIL: PerfilDaTela = {
  apelido: "pastelaria-da-vila",
  nome: "Pastelaria da Vila",
  fotoDePerfil: null,
  iniciais: "PV",
  podeTrocarFoto: true,
};

interface Chamada {
  readonly url: string;
  readonly metodo: string;
}

function api(listas: StoryDaLoja[][], uso = { limite: 30, uso: 1, restante: 29 }) {
  const chamadas: Chamada[] = [];
  let vez = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, metodo: init?.method ?? "GET" });
      if (url === "/api/loja/midia/limites") {
        return json({
          videoTamanhoMaximoBytes: 50 * 1024 * 1024,
          videoDuracaoMaximaSegundos: 60,
          videosPorProduto: 3,
          imagemDoStoryTamanhoMaximoBytes: 10 * 1024 * 1024,
          duracaoDoStoryHoras: 24,
          formatosDeVideo: ["video/mp4", "video/webm"],
          formatosDeImagem: ["image/jpeg", "image/png", "image/webp"],
        });
      }
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      const lista = listas[Math.min(vez, listas.length - 1)] ?? [];
      vez += 1;
      return json({ stories: lista, limite: uso });
    }),
  );
  return chamadas;
}

async function montar(perfil: PerfilDaTela = PERFIL): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<TelaDeStories perfil={perfil} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

function botao(dentro: HTMLElement, texto: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find(
    (candidato) => candidato.textContent?.trim() === texto,
  );
  if (!achado) throw new Error(`nenhum botão "${texto}"`);
  return achado;
}

describe("o tempo do story", () => {
  it("conta o que falta em horas e minutos", () => {
    const daqui = (ms: number) => new Date(AGORA + ms).toISOString();
    expect(tempoQueFalta(daqui(22 * 3_600_000 + 15 * 60_000), AGORA)).toBe(
      "22 h 15 min",
    );
    expect(tempoQueFalta(daqui(3 * 3_600_000), AGORA)).toBe("3 h");
    expect(tempoQueFalta(daqui(45 * 60_000), AGORA)).toBe("45 min");
    expect(tempoQueFalta(daqui(20_000), AGORA)).toBe("menos de 1 min");
    expect(tempoQueFalta(daqui(-1), AGORA)).toBe("saindo do ar");
  });

  it("a barrinha anda com as 24 horas e as visualizações viram frase", () => {
    const inicio = new Date(AGORA - 6 * 3_600_000).toISOString();
    const fim = new Date(AGORA + 18 * 3_600_000).toISOString();
    expect(fracaoPassada(inicio, fim, AGORA)).toBeCloseTo(0.25);
    expect(textoDasVisualizacoes(0)).toBe("Ninguém viu ainda");
    expect(textoDasVisualizacoes(1)).toBe("1 visualização");
    expect(textoDasVisualizacoes(12)).toBe("12 visualizações");
  });
});

describe("a tela de stories do painel", () => {
  it("avisa que some em 24 horas e lista os stories no ar com contagem e visualizações", async () => {
    api([
      [
        story({ id: ID(1), visualizacoes: 12, legenda: "Fornada nova" }),
        // Já venceu: a tela não mostra, mesmo que a lista ainda traga.
        story({ id: ID(2), expiraEm: new Date(AGORA - 1000).toISOString() }),
      ],
    ]);
    const tela = await montar();

    expect(tela.textContent).toContain("Some sozinho em 24 horas");
    expect(tela.textContent).toContain("não fica guardado");
    expect(tela.textContent).toContain("1 de 30 stories no ar");
    const cartoes = tela.querySelectorAll("#stories-no-ar ~ ul > li");
    expect(cartoes).toHaveLength(1);
    expect(cartoes[0]?.textContent).toContain("Some em 22 h 15 min");
    expect(cartoes[0]?.textContent).toContain("12 visualizações");
    expect(cartoes[0]?.textContent).toContain("Fornada nova");
  });

  it("mostra a foto de perfil (ou as iniciais) e leva à Aparência para trocar", async () => {
    api([[]]);
    const tela = await montar();

    expect(tela.textContent).toContain("PV");
    const link = [...tela.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("foto de perfil"),
    );
    expect(link?.getAttribute("href")).toBe("/painel/aparencia#foto-de-perfil");
    expect(tela.textContent).toContain("Nenhum story no ar.");
  });

  it("a equipe sem personalização não vê o link de trocar a foto", async () => {
    api([[]]);
    const tela = await montar({ ...PERFIL, podeTrocarFoto: false });
    expect(tela.textContent).toContain("A foto de perfil é a logo da loja.");
    expect(tela.querySelector('a[href*="aparencia"]')).toBeNull();
  });

  it("Criar story abre o editor em tela cheia, que fecha pelo X", async () => {
    api([[]]);
    vi.stubGlobal("isSecureContext", false);
    const tela = await montar();

    await act(async () => {
      botao(tela, "Criar story").click();
    });
    const editor = document.querySelector('[role="dialog"][aria-label="Criar story"]');
    expect(editor).not.toBeNull();
    expect(editor?.textContent).toContain("A câmera pede conexão segura");

    await act(async () => {
      editor
        ?.querySelector<HTMLButtonElement>('button[aria-label^="Fechar"]')
        ?.click();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("limite atingido desliga o envio e explica", async () => {
    api([[story({ id: ID(1) })]], { limite: 1, uso: 1, restante: 0 });
    const tela = await montar();
    expect(tela.textContent).toContain("apague um para postar outro");
    expect(botao(tela, "Criar story").disabled).toBe(true);
  });

  it("excluir pede confirmação e apaga pela rota do story", async () => {
    const chamadas = api([[story({ id: ID(1) })], []]);
    const tela = await montar();

    await act(async () => {
      botao(tela, "Excluir").click();
    });
    await act(async () => {
      botao(tela, "Apagar agora").click();
    });

    expect(chamadas).toContainEqual({
      url: `/api/loja/midia/stories/${ID(1)}`,
      metodo: "DELETE",
    });
    expect(tela.textContent).toContain("Story apagado.");
    expect(tela.textContent).toContain("Nenhum story no ar.");
  });
});
