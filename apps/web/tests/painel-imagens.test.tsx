// @vitest-environment jsdom
/**
 * Prova da tela das fotos do produto e do carregador de imagens (AC-305,
 * AC-306).
 *
 * O caminho da API está provado contra o banco em
 * `apps/api/tests/imagens-do-painel.int.test.ts`. Aqui: a tela recusa na hora
 * o arquivo que não é foto (sem enviar nada), manda os BYTES do arquivo bom
 * para a rota do arquivo, deixa trocar a principal — e o carregador pede ao
 * CDN a foto na largura do aparelho, em vez do original.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvioDeImagem } from "../src/features/painel-catalogo/EnvioDeImagem";
import { urlDaImagemOtimizada } from "../src/lib/imagem";

interface Chamada {
  readonly url: string;
  readonly metodo: string;
  readonly corpo: unknown;
  readonly tipo: string | null;
}

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

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

function roteiro(...respostas: (() => Promise<Response>)[]): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const cabecalhos = new Headers(init?.headers);
      chamadas.push({
        url,
        metodo: init?.method ?? "GET",
        corpo: init?.body,
        tipo: cabecalhos.get("content-type"),
      });
      const proxima = respostas.shift();
      if (proxima === undefined) throw new Error(`chamada inesperada: ${url}`);
      return proxima();
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
  return container;
}

function botao(dentro: HTMLElement, texto: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find(
    (candidato) => candidato.textContent?.trim() === texto,
  );
  if (!achado) throw new Error(`nenhum botão "${texto}"`);
  return achado;
}

async function escolherArquivo(tela: HTMLElement, arquivo: File) {
  const campo = tela.querySelector<HTMLInputElement>('input[type="file"]');
  if (!campo) throw new Error("sem o campo de arquivo");
  Object.defineProperty(campo, "files", {
    value: [arquivo],
    configurable: true,
  });
  await act(async () => {
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // A conferência lê os bytes de forma assíncrona.
  await act(async () => {
    await new Promise((pronto) => setTimeout(pronto, 0));
  });
}

const PRINCIPAL = {
  id: "i-1",
  url: "https://res.cloudinary.com/simpleclick/image/upload/v1/um.jpg",
  altText: null,
  principal: true,
  ordem: 0,
};
const SEGUNDA = {
  ...PRINCIPAL,
  id: "i-2",
  url: "https://res.cloudinary.com/simpleclick/image/upload/v1/dois.jpg",
  principal: false,
  ordem: 1,
};

describe("as fotos do produto no painel (AC-305)", () => {
  it("@spec:AC-305 a principal aparece marcada e trocar a principal chama a rota da foto", async () => {
    const chamadas = roteiro(
      async () => json({ imagens: [PRINCIPAL, SEGUNDA] }),
      async () => json({ ...SEGUNDA, principal: true }),
      async () =>
        json({
          imagens: [
            { ...PRINCIPAL, principal: false },
            { ...SEGUNDA, principal: true },
          ],
        }),
    );
    const tela = await montar();

    const itens = [...tela.querySelectorAll("ul > li")];
    expect(itens[0]?.textContent).toContain("Principal");
    expect(itens[1]?.textContent).toContain("Usar como principal");

    await act(async () => {
      botao(tela, "Usar como principal").click();
    });

    expect(chamadas[1]).toMatchObject({
      url: "/api/catalogo/produtos/p-1/imagens/i-2",
      metodo: "PATCH",
      corpo: JSON.stringify({ principal: true }),
    });
    expect([...tela.querySelectorAll("ul > li")][1]?.textContent).toContain(
      "Principal",
    );
  });
});

describe("o arquivo é conferido pelo conteúdo (AC-306)", () => {
  it("@spec:AC-306 texto com nome de foto é recusado na tela e nada é enviado", async () => {
    const chamadas = roteiro(async () => json({ imagens: [] }));
    const tela = await montar();

    await escolherArquivo(
      tela,
      new File(["sou um texto, não uma foto"], "foto.jpg", {
        type: "image/jpeg",
      }),
    );

    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "a checagem considera o conteúdo, não a extensão",
    );
    expect(botao(tela, "Enviar foto").disabled).toBe(true);
    expect(chamadas).toHaveLength(1);
  });

  it("@spec:AC-306 foto de verdade é enviada em bytes para a rota do arquivo", async () => {
    const chamadas = roteiro(
      async () => json({ imagens: [] }),
      async () => json({ ...PRINCIPAL }, 201),
      async () => json({ imagens: [PRINCIPAL] }),
    );
    const tela = await montar();
    const bytes = new Uint8Array(3 * 1024 * 1024);
    bytes.set([0xff, 0xd8, 0xff, 0xe0]);
    const foto = new File([bytes], "pastel.jpeg", { type: "image/jpeg" });

    await escolherArquivo(tela, foto);
    expect(tela.textContent).toContain("Arquivo válido (jpeg");
    await act(async () => {
      botao(tela, "Enviar foto").click();
    });

    expect(chamadas[1]).toMatchObject({
      url: "/api/catalogo/produtos/p-1/imagens/arquivo?principal=true",
      metodo: "POST",
      tipo: "image/jpeg",
    });
    expect(chamadas[1]?.corpo).toBe(foto);
    expect(tela.textContent).toContain("Foto enviada.");
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
    // Endereço que não é do CDN passa intacto: não se inventa transformação.
    expect(
      urlDaImagemOtimizada({ src: "https://exemplo.test/a.jpg", width: 320 }),
    ).toBe("https://exemplo.test/a.jpg");
  });
});
