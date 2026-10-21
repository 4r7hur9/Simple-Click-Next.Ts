// @vitest-environment jsdom
/**
 * Prova da galeria do produto (fotos e vídeos) e do carregador de imagens
 * (AC-305, AC-306, card #48).
 *
 * O caminho da API está provado em `apps/api/tests/midias-e-stories.test.ts`
 * e `imagens-do-painel.int.test.ts`. Aqui: a tela recusa na hora o arquivo
 * que não é foto e o vídeo longo ou grande demais (sem enviar nada), manda os
 * BYTES do arquivo bom para a rota certa com progresso, deixa trocar a capa e
 * reordenar a galeria — e o carregador pede ao CDN a foto na largura do
 * aparelho, em vez do original.
 */
import type { MidiaDoProduto } from "@simpleclick/contracts";
import { act } from "react";

import type * as EnvioDeMidia from "../src/lib/envio-de-midia.ts";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envio = vi.hoisted(() => ({
  enviarComProgresso: vi.fn(),
  lerDadosDoVideo: vi.fn(),
}));

vi.mock("../src/lib/envio-de-midia.ts", async (original) => ({
  ...(await original<typeof EnvioDeMidia>()),
  enviarComProgresso: envio.enviarComProgresso,
  lerDadosDoVideo: envio.lerDadosDoVideo,
}));

import { EnvioDeImagem } from "../src/features/painel-catalogo/EnvioDeImagem";
import { urlDaImagemOtimizada } from "../src/lib/imagem";
import {
  clicarNaJanela,
  confirmarRecorte,
  esperarRecorte,
  janelaDeRecorte,
  prepararRecorte,
} from "./apoio-recorte.ts";

interface Chamada {
  readonly url: string;
  readonly metodo: string;
  readonly corpo: unknown;
}

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  envio.enviarComProgresso.mockReset();
  envio.lerDadosDoVideo.mockReset();
  // Toda foto passa pela janela de recorte antes do envio (card #82).
  prepararRecorte();
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
});

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const LIMITES = {
  videoTamanhoMaximoBytes: 50 * 1024 * 1024,
  videoDuracaoMaximaSegundos: 60,
  videosPorProduto: 3,
  imagemDoStoryTamanhoMaximoBytes: 10 * 1024 * 1024,
  duracaoDoStoryHoras: 24,
  formatosDeVideo: ["video/mp4", "video/webm"],
  formatosDeImagem: ["image/jpeg", "image/png", "image/webp"],
};

function midia(parte: Partial<MidiaDoProduto> & { id: string }): MidiaDoProduto {
  return {
    tipo: "imagem",
    url: `https://res.cloudinary.com/simpleclick/image/upload/v1/${parte.id}.jpg`,
    capa: null,
    duracaoSegundos: null,
    largura: null,
    altura: null,
    texto: null,
    ordem: 0,
    principal: false,
    tamanhoBytes: null,
    formato: null,
    ...parte,
  };
}

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const CAPA = midia({ id: ID(1), principal: true, ordem: 0 });
const SEGUNDA = midia({ id: ID(2), ordem: 1 });
const VIDEO = midia({
  id: ID(3),
  tipo: "video",
  url: "http://localhost:3001/v1/midia/arquivos/v.mp4",
  duracaoSegundos: 12,
  ordem: 2,
  tamanhoBytes: 1000,
  formato: "video/mp4",
});

/** Responde por endereço: a galeria muda conforme o roteiro avança. */
function api(galerias: MidiaDoProduto[][], extra?: (c: Chamada) => Response | null) {
  const chamadas: Chamada[] = [];
  let vez = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const chamada = {
        url,
        metodo: init?.method ?? "GET",
        corpo: init?.body,
      };
      chamadas.push(chamada);
      if (url === "/api/loja/midia/limites") return json(LIMITES);
      const outra = extra?.(chamada);
      if (outra) return outra;
      if (url.endsWith("/midias") && chamada.metodo === "GET") {
        const galeria = galerias[Math.min(vez, galerias.length - 1)];
        vez += 1;
        return json({ midias: galeria });
      }
      return json({}, 200);
    }),
  );
  return chamadas;
}

async function montar(): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<EnvioDeImagem produtoId="p-1" />);
  });
  await act(async () => {
    await new Promise((pronto) => setTimeout(pronto, 0));
  });
  return container;
}

function botao(dentro: HTMLElement, texto: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find(
    (candidato) =>
      candidato.textContent?.trim() === texto ||
      candidato.getAttribute("aria-label") === texto,
  );
  if (!achado) throw new Error(`nenhum botão "${texto}"`);
  return achado;
}

async function escolherArquivo(tela: HTMLElement, arquivo: File) {
  const campo = [
    ...tela.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  ].find((c) => c.getAttribute("aria-label") === null);
  if (!campo) throw new Error("sem o campo de arquivo");
  Object.defineProperty(campo, "files", {
    value: [arquivo],
    configurable: true,
  });
  await act(async () => {
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((pronto) => setTimeout(pronto, 0));
  });
}

describe("a galeria do produto no painel (AC-305, #48)", () => {
  it("@spec:AC-305 mostra fotos e vídeos na ordem, com a capa marcada, e troca a capa", async () => {
    const chamadas = api([
      [CAPA, SEGUNDA, VIDEO],
      [{ ...SEGUNDA, principal: true }, { ...CAPA, principal: false }, VIDEO],
    ]);
    const tela = await montar();

    const itens = [...tela.querySelectorAll("ol > li")];
    expect(itens).toHaveLength(3);
    expect(itens[0]?.textContent).toContain("Capa do produto");
    expect(itens[2]?.getAttribute("data-midia")).toBe("video");
    expect(itens[2]?.textContent).toContain("Vídeo · 12 s");
    expect(tela.textContent).toContain("até 3, MP4 ou WebM de até 50 MB e 1 min");

    await act(async () => {
      botao(tela, "Usar como capa").click();
    });

    expect(chamadas).toContainEqual({
      url: `/api/catalogo/produtos/p-1/imagens/${ID(2)}`,
      metodo: "PATCH",
      corpo: JSON.stringify({ principal: true }),
    });
    expect(tela.querySelector("ol > li")?.textContent).toContain(
      "Capa do produto",
    );
  });

  it("reordenar manda a galeria inteira na ordem nova", async () => {
    const chamadas = api([[CAPA, SEGUNDA, VIDEO]], (chamada) =>
      chamada.metodo === "PUT"
        ? json({ midias: [CAPA, VIDEO, SEGUNDA] })
        : null,
    );
    const tela = await montar();

    await act(async () => {
      botao(tela, "Mover o 3º item para antes").click();
    });

    const ordem = chamadas.find((c) => c.metodo === "PUT");
    expect(ordem?.url).toBe("/api/loja/midia/catalogo/produtos/p-1/midias/ordem");
    expect(JSON.parse(String(ordem?.corpo))).toEqual({
      ordem: [
        { tipo: "imagem", id: ID(1) },
        { tipo: "video", id: ID(3) },
        { tipo: "imagem", id: ID(2) },
      ],
    });
    expect(tela.querySelectorAll("ol > li")[1]?.getAttribute("data-midia")).toBe(
      "video",
    );
  });
});

describe("o arquivo é conferido antes do envio (AC-306, #48)", () => {
  it("@spec:AC-306 texto com nome de foto é recusado na tela e nada é enviado", async () => {
    // O navegador não consegue abrir um texto que se diz foto.
    prepararRecorte({ quebrada: true });
    api([[]]);
    const tela = await montar();

    await escolherArquivo(
      tela,
      new File(["sou um texto, não uma foto"], "foto.jpg", {
        type: "image/jpeg",
      }),
    );

    await esperarRecorte();

    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "Não consegui abrir essa foto",
    );
    expect(tela.textContent).not.toContain("Enviar foto");
    expect(envio.enviarComProgresso).not.toHaveBeenCalled();
  });

  it("@spec:AC-306 foto de verdade é enviada em bytes para a rota do arquivo, com progresso", async () => {
    api([[], [CAPA]]);
    envio.enviarComProgresso.mockImplementation(
      async (_url: string, _arquivo: Blob, aoProgredir: (f: number) => void) => {
        aoProgredir(0.5);
        return { status: 201, corpo: CAPA };
      },
    );
    const tela = await montar();
    const bytes = new Uint8Array(3 * 1024 * 1024);
    bytes.set([0xff, 0xd8, 0xff, 0xe0]);
    const foto = new File([bytes], "pastel.jpeg", { type: "image/jpeg" });

    await escolherArquivo(tela, foto);
    // A foto abre na janela de recorte; a pessoa confirma o enquadramento.
    expect(janelaDeRecorte()).not.toBeNull();
    await confirmarRecorte();
    expect(janelaDeRecorte()).toBeNull();
    expect(tela.textContent).toContain("Arquivo válido (webp");
    await act(async () => {
      botao(tela, "Enviar foto").click();
    });

    // Vai o arquivo RECORTADO: WebP, com o nome da foto escolhida.
    const [, enviado] = envio.enviarComProgresso.mock.calls[0] as [string, File];
    expect(envio.enviarComProgresso).toHaveBeenCalledWith(
      "/api/catalogo/produtos/p-1/imagens/arquivo?principal=true",
      expect.any(File),
      expect.any(Function),
    );
    expect(enviado.type).toBe("image/webp");
    expect(enviado.name).toBe("pastel.webp");
    expect(tela.textContent).toContain("Foto enviada.");
  });

  it("vídeo acima de 60 segundos é recusado na tela", async () => {
    api([[CAPA]]);
    envio.lerDadosDoVideo.mockResolvedValue({
      duracaoSegundos: 95,
      largura: 1080,
      altura: 1920,
    });
    const tela = await montar();

    await escolherArquivo(
      tela,
      new File([new Uint8Array(1000)], "longo.mp4", { type: "video/mp4" }),
    );

    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "Este vídeo tem 1 min 35 s. O máximo é 1 min.",
    );
    expect(envio.enviarComProgresso).not.toHaveBeenCalled();
  });

  it("vídeo bom vai para a rota de vídeos com a duração lida pelo navegador", async () => {
    api([[CAPA], [CAPA, VIDEO]]);
    envio.lerDadosDoVideo.mockResolvedValue({
      duracaoSegundos: 12.34,
      largura: 1080,
      altura: 1920,
    });
    envio.enviarComProgresso.mockResolvedValue({ status: 201, corpo: VIDEO });
    const tela = await montar();
    const video = new File([new Uint8Array(1000)], "pastel.webm", {
      type: "video/webm",
    });

    await escolherArquivo(tela, video);
    await act(async () => {
      botao(tela, "Enviar vídeo").click();
    });

    expect(envio.enviarComProgresso).toHaveBeenCalledWith(
      "/api/loja/midia/catalogo/produtos/p-1/videos?duracaoSegundos=12.3",
      video,
      expect.any(Function),
    );
    expect(tela.textContent).toContain("Vídeo enviado.");
  });

  it("recusa da API vira frase simples", async () => {
    api([[CAPA]]);
    envio.lerDadosDoVideo.mockResolvedValue({
      duracaoSegundos: null,
      largura: null,
      altura: null,
    });
    envio.enviarComProgresso.mockResolvedValue({
      status: 400,
      corpo: {
        erro: "video_sem_duracao",
        mensagem: "Não deu para ler a duração do vídeo.",
      },
    });
    const tela = await montar();

    await escolherArquivo(
      tela,
      new File([new Uint8Array(1000)], "gravado.webm", { type: "video/webm" }),
    );
    await act(async () => {
      botao(tela, "Enviar vídeo").click();
    });

    expect(envio.enviarComProgresso.mock.calls[0]?.[0]).toBe(
      "/api/loja/midia/catalogo/produtos/p-1/videos",
    );
    expect(tela.textContent).toContain("Não deu para ler a duração do vídeo.");
  });

  it("@spec:AC-306 o carregador pede ao CDN a largura do aparelho, e não o original", () => {
    const original =
      "https://res.cloudinary.com/simpleclick/image/upload/v1/pastel.jpg";

    expect(urlDaImagemOtimizada({ src: original, width: 320 })).toBe(
      "https://res.cloudinary.com/simpleclick/image/upload/f_auto,q_auto,w_320,c_limit/v1/pastel.jpg",
    );
    expect(
      urlDaImagemOtimizada({ src: original, width: 640, quality: 70 }),
    ).toBe(
      "https://res.cloudinary.com/simpleclick/image/upload/f_auto,q_70,w_640,c_limit/v1/pastel.jpg",
    );
    expect(
      urlDaImagemOtimizada({ src: "https://exemplo.test/a.jpg", width: 320 }),
    ).toBe("https://exemplo.test/a.jpg");
  });
});

describe("trocar a foto no lugar (card #81)", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

  function campoDeTroca(tela: HTMLElement, indice = 1): HTMLInputElement {
    const campo = tela.querySelector<HTMLInputElement>(
      `input[aria-label="Trocar a foto do ${indice}º item"]`,
    );
    if (!campo) throw new Error("sem o campo de trocar foto");
    return campo;
  }

  it("a foto escolhida vai por PUT para .../imagens/:id/arquivo e a galeria mostra a nova ao recarregar", async () => {
    const NOVA = midia({
      id: ID(1),
      principal: true,
      ordem: 0,
      url: "http://localhost:3001/v1/midia/arquivos/l/fotos/nova.png",
    });
    api([[CAPA], [NOVA]]);
    envio.enviarComProgresso.mockResolvedValue({ status: 200, corpo: NOVA });
    const tela = await montar();
    expect(tela.querySelector("ol[aria-label='Galeria'] img")?.getAttribute("src")).toBe(
      CAPA.url,
    );

    const arquivo = new File([PNG], "nova.png", { type: "image/png" });
    const campo = campoDeTroca(tela);
    Object.defineProperty(campo, "files", { value: [arquivo], configurable: true });
    await act(async () => {
      campo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await confirmarRecorte();

    expect(envio.enviarComProgresso).toHaveBeenCalledWith(
      `/api/catalogo/produtos/p-1/imagens/${ID(1)}/arquivo`,
      expect.any(File),
      expect.any(Function),
      "PUT",
    );
    expect(tela.textContent).toContain("Foto trocada. A nova já aparece na loja.");
    // A foto antiga saiu da tela: só a nova está na galeria.
    expect(tela.querySelector("ol[aria-label='Galeria'] img")?.getAttribute("src")).toBe(
      NOVA.url,
    );
  });

  it("se o envio falha, a mensagem diz que a foto anterior continua e a galeria não muda", async () => {
    api([[CAPA]]);
    envio.enviarComProgresso.mockResolvedValue({
      status: 503,
      corpo: { erro: "midia_indisponivel" },
    });
    const tela = await montar();
    const campo = campoDeTroca(tela);
    Object.defineProperty(campo, "files", {
      value: [new File([PNG], "nova.png", { type: "image/png" })],
      configurable: true,
    });
    await act(async () => {
      campo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await confirmarRecorte();

    expect(tela.textContent).toContain("A foto anterior continua no produto.");
    expect(tela.querySelector("ol[aria-label='Galeria'] img")?.getAttribute("src")).toBe(
      CAPA.url,
    );
  });

  it("conta com os Termos novos por aceitar recebe a frase que diz o que fazer (e não 'sem permissão')", async () => {
    api([[CAPA]]);
    envio.enviarComProgresso.mockResolvedValue({
      status: 403,
      corpo: { erro: "aceite_pendente" },
    });
    const tela = await montar();
    const campo = campoDeTroca(tela);
    Object.defineProperty(campo, "files", {
      value: [new File([PNG], "nova.png", { type: "image/png" })],
      configurable: true,
    });
    await act(async () => {
      campo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await confirmarRecorte();
    expect(tela.textContent).toContain("Aceite a nova versão");
    expect(tela.textContent).not.toContain("não tem permissão");
  });

  it("arquivo que não é foto não é enviado", async () => {
    prepararRecorte({ quebrada: true });
    api([[CAPA]]);
    const tela = await montar();
    const campo = campoDeTroca(tela);
    Object.defineProperty(campo, "files", {
      value: [new File(["isto é texto"], "foto.jpg", { type: "image/jpeg" })],
      configurable: true,
    });
    await act(async () => {
      campo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await esperarRecorte();
    expect(envio.enviarComProgresso).not.toHaveBeenCalled();
    expect(tela.textContent).toContain("Não consegui abrir essa foto");
  });
});

describe("várias fotos, uma de cada vez (card #82)", () => {
  async function escolherVarias(tela: HTMLElement, arquivos: File[]) {
    const campo = [
      ...tela.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    ].find((c) => c.getAttribute("aria-label") === null);
    if (!campo) throw new Error("sem o campo de arquivo");
    expect(campo.multiple).toBe(true);
    Object.defineProperty(campo, "files", { value: arquivos, configurable: true });
    await act(async () => {
      campo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await esperarRecorte();
  }

  it("cada foto abre para recortar na ordem, e a próxima só abre depois do envio da anterior", async () => {
    api([[], [CAPA], [CAPA, SEGUNDA]]);
    envio.enviarComProgresso.mockResolvedValue({ status: 201, corpo: CAPA });
    const tela = await montar();

    await escolherVarias(tela, [
      new File([new Uint8Array(500)], "um.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array(500)], "dois.png", { type: "image/png" }),
    ]);
    expect(janelaDeRecorte()?.textContent).toContain("Foto 1 de 2.");

    await clicarNaJanela("Usar esta foto");
    // Enquanto a primeira não é enviada, a segunda espera.
    expect(janelaDeRecorte()).toBeNull();
    expect(tela.textContent).toContain("Arquivo válido (webp");
    await act(async () => {
      botao(tela, "Enviar foto").click();
    });
    await esperarRecorte();

    expect(envio.enviarComProgresso).toHaveBeenCalledTimes(1);
    expect(janelaDeRecorte()?.textContent).toContain("Foto 2 de 2.");
    await clicarNaJanela("Usar esta foto");
    await act(async () => {
      botao(tela, "Enviar foto").click();
    });
    await esperarRecorte();

    expect(envio.enviarComProgresso).toHaveBeenCalledTimes(2);
    const enderecos = envio.enviarComProgresso.mock.calls.map((c) => c[0]);
    // A primeira vira a capa (galeria vazia); a segunda, não.
    expect(enderecos[0]).toContain("principal=true");
    expect(enderecos[1]).toContain("principal=false");
    const nomes = envio.enviarComProgresso.mock.calls.map((c) => (c[1] as File).name);
    expect(nomes).toEqual(["um.webp", "dois.webp"]);
    expect(janelaDeRecorte()).toBeNull();
  });

  it("cancelar a conferência da foto dispensa as que ainda esperavam", async () => {
    api([[]]);
    const tela = await montar();
    await escolherVarias(tela, [
      new File([new Uint8Array(500)], "um.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array(500)], "dois.jpg", { type: "image/jpeg" }),
    ]);
    await clicarNaJanela("Usar esta foto");
    await act(async () => {
      botao(tela, "Cancelar").click();
    });
    await esperarRecorte();
    expect(janelaDeRecorte()).toBeNull();
    expect(envio.enviarComProgresso).not.toHaveBeenCalled();
  });

  it("cancelar o recorte não envia nada e não deixa foto escolhida", async () => {
    api([[]]);
    const tela = await montar();
    await escolherVarias(tela, [
      new File([new Uint8Array(500)], "um.jpg", { type: "image/jpeg" }),
    ]);
    await clicarNaJanela("Cancelar");
    expect(janelaDeRecorte()).toBeNull();
    expect(tela.textContent).not.toContain("Enviar foto");
    expect(envio.enviarComProgresso).not.toHaveBeenCalled();
  });

  it("arquivo que não é foto entre as escolhidas é recusado e as boas seguem", async () => {
    api([[]]);
    const tela = await montar();
    await escolherVarias(tela, [
      new File([new Uint8Array(10)], "contrato.pdf", { type: "application/pdf" }),
      new File([new Uint8Array(500)], "bom.jpg", { type: "image/jpeg" }),
    ]);
    expect(tela.textContent).toContain("contrato.pdf: Esse arquivo não é uma foto");
    expect(janelaDeRecorte()?.textContent).toContain("Ajustar a foto");
  });

  it("o campo diz as medidas recomendadas do produto", async () => {
    api([[]]);
    const tela = await montar();
    expect(tela.textContent).toContain(
      "Recomendado: 1200 × 1200 px, JPG/PNG/WebP até 10 MB.",
    );
  });
});
