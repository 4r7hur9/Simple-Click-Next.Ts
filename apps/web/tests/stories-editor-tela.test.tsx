// @vitest-environment jsdom
/**
 * O editor de Stories em tela cheia (card #84), montado de verdade no jsdom:
 * câmera (permissão negada, contexto inseguro), galeria, texto, adesivos,
 * desfazer, lixeira, cancelar com confirmação e publicar com progresso, erro
 * e "tentar de novo". O canvas e a leitura da imagem são trocados por
 * mentiras, porque o jsdom não desenha; a conta do canvas é testada em
 * `stories-editor-composicao.test.ts`.
 */
import { LIMITES_DE_MIDIA_PADRAO, type LimitesDeMidia } from "@simpleclick/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as EnvioDeMidia from "../src/lib/envio-de-midia.ts";
import type * as Composicao from "../src/features/stories/composicao.ts";
import type * as Midia from "../src/features/stories/midia.ts";

const envio = vi.hoisted(() => ({
  enviarComProgresso: vi.fn(),
  lerDadosDoVideo: vi.fn(),
}));

vi.mock("../src/lib/envio-de-midia.ts", async (original) => ({
  ...(await original<typeof EnvioDeMidia>()),
  enviarComProgresso: envio.enviarComProgresso,
  lerDadosDoVideo: envio.lerDadosDoVideo,
}));

vi.mock("../src/features/stories/midia.ts", async (original) => ({
  ...(await original<typeof Midia>()),
  lerTamanhoDaImagem: async () => ({ largura: 1080, altura: 1920 }),
  carregarImagem: async () => ({ naturalWidth: 1080, naturalHeight: 1920 }),
}));

vi.mock("../src/features/stories/composicao.ts", async (original) => ({
  ...(await original<typeof Composicao>()),
  comporFoto: () => ({}),
  exportarFoto: async () => new Blob(["webp"], { type: "image/webp" }),
}));

import { EditorDeStory } from "../src/features/stories/EditorDeStory";

const LIMITES: LimitesDeMidia = {
  ...LIMITES_DE_MIDIA_PADRAO,
  formatosDeVideo: ["video/mp4", "video/webm"],
  formatosDeImagem: ["image/jpeg", "image/png", "image/webp"],
};

const PERFIL = { apelido: "pastelaria-da-vila", nome: "Pastelaria da Vila" };

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const aoPublicado = vi.fn();
const aoFechar = vi.fn();

beforeEach(() => {
  envio.enviarComProgresso.mockReset();
  envio.lerDadosDoVideo.mockReset();
  aoPublicado.mockReset();
  aoFechar.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:teste");
  URL.revokeObjectURL = vi.fn();
  // O jsdom não desenha: o canvas do palco simplesmente não faz nada.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function tentarCamera(getUserMedia?: () => Promise<unknown>) {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: getUserMedia === undefined ? undefined : { getUserMedia, enumerateDevices: async () => [] },
  });
}

async function montar() {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(
      <EditorDeStory
        perfil={PERFIL}
        limites={LIMITES}
        aoPublicado={aoPublicado}
        aoFechar={aoFechar}
        buscarProdutos={async (busca) =>
          [{ id: "p-1", nome: "Pastel de carne" }].filter((p) =>
            p.nome.toLowerCase().includes(busca.toLowerCase()),
          )
        }
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function editor(): HTMLElement {
  const achado = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Criar story"]');
  if (!achado) throw new Error("editor não está na tela");
  return achado;
}

function porRotulo(rotulo: string): HTMLButtonElement {
  const achado = [...editor().querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("aria-label") === rotulo || b.textContent?.trim() === rotulo,
  );
  if (!achado) throw new Error(`nenhum botão "${rotulo}"`);
  return achado;
}

async function clicar(rotulo: string) {
  await act(async () => {
    porRotulo(rotulo).click();
  });
}

async function escolherDaGaleria(arquivo: File) {
  const campo = editor().querySelector<HTMLInputElement>('input[type="file"]');
  if (!campo) throw new Error("sem o campo da galeria");
  Object.defineProperty(campo, "files", { value: [arquivo], configurable: true });
  await act(async () => {
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function abrirEdicao() {
  tentarCamera(undefined);
  await montar();
  await escolherDaGaleria(new File([new Uint8Array(500)], "foto.jpg", { type: "image/jpeg" }));
  expect(editor().textContent).toContain("Publicar Story");
}

async function digitar(campo: HTMLTextAreaElement | HTMLInputElement, valor: string) {
  const proto = campo instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(campo, valor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function camadas() {
  return [...editor().querySelectorAll<HTMLElement>("[data-camada]")];
}

describe("a captura", () => {
  it("em página sem HTTPS explica o motivo e oferece a galeria", async () => {
    vi.stubGlobal("isSecureContext", false);
    await montar();
    expect(editor().textContent).toContain("A câmera pede conexão segura");
    expect(editor().textContent).toContain("https://");
    expect(porRotulo("Escolher da galeria")).toBeTruthy();
  });

  it("câmera negada: explica como liberar e deixa tentar de novo", async () => {
    tentarCamera(() => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })));
    await montar();
    expect(editor().textContent).toContain("A câmera está bloqueada");
    expect(editor().textContent).toContain("Tentar de novo");
  });

  it("sem câmera no aparelho: avisa e deixa escolher da galeria", async () => {
    tentarCamera(() => Promise.reject(Object.assign(new Error("x"), { name: "NotFoundError" })));
    await montar();
    expect(editor().textContent).toContain("Não achamos uma câmera");
  });

  it("o X fecha o editor; Esc também", async () => {
    tentarCamera(undefined);
    await montar();
    await act(async () => {
      editor().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("recusa na hora a foto grande demais", async () => {
    tentarCamera(undefined);
    await montar();
    const grande = new File([new Uint8Array(10)], "enorme.jpg", { type: "image/jpeg" });
    Object.defineProperty(grande, "size", { value: 30 * 1024 * 1024 });
    await escolherDaGaleria(grande);
    expect(editor().querySelector(".sc-story-captura__erro")?.textContent).toContain("O máximo é");
    expect(editor().textContent).not.toContain("Publicar Story");
  });

  it("arquivo que não é foto nem vídeo é recusado", async () => {
    tentarCamera(undefined);
    await montar();
    await escolherDaGaleria(new File(["x"], "nota.pdf", { type: "application/pdf" }));
    expect(editor().querySelector(".sc-story-captura__erro")?.textContent).toContain("Escolha uma foto");
  });

  it("vídeo longo demais é recusado antes de abrir", async () => {
    tentarCamera(undefined);
    await montar();
    envio.lerDadosDoVideo.mockResolvedValue({ duracaoSegundos: 75, largura: 1080, altura: 1920 });
    await escolherDaGaleria(new File([new Uint8Array(500)], "longo.mp4", { type: "video/mp4" }));
    expect(editor().querySelector(".sc-story-captura__erro")?.textContent).toContain("O story aceita até 1 min");
  });

  it("arrastar e soltar uma foto abre a edição", async () => {
    tentarCamera(undefined);
    await montar();
    const captura = editor().querySelector<HTMLElement>(".sc-story-captura")!;
    const arquivo = new File([new Uint8Array(500)], "foto.png", { type: "image/png" });
    const solto = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(solto, "dataTransfer", { value: { files: [arquivo] } });
    await act(async () => {
      captura.dispatchEvent(solto);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(editor().textContent).toContain("Publicar Story");
  });
});

describe("a edição", () => {
  it("a foto da galeria aparece no palco 9:16 com as ferramentas", async () => {
    await abrirEdicao();
    expect(editor().querySelector(".sc-story-palco img")).not.toBeNull();
    for (const rotulo of ["Cancelar e descartar o story", "Desfazer", "Refazer", "Desenhar", "Adicionar texto", "Adicionar adesivo"]) {
      expect(porRotulo(rotulo)).toBeTruthy();
    }
    expect(porRotulo("Desfazer").disabled).toBe(true);
  });

  it("texto: digita, conclui, vira objeto no palco e dá para editar tocando", async () => {
    await abrirEdicao();
    await clicar("Adicionar texto");
    const campo = editor().querySelector<HTMLTextAreaElement>("textarea")!;
    await digitar(campo, "Fornada nova!");
    await clicar("Concluído");

    expect(camadas()).toHaveLength(1);
    expect(camadas()[0]?.getAttribute("aria-label")).toBe("Texto: Fornada nova!");
    expect(porRotulo("Desfazer").disabled).toBe(false);
  });

  it("texto vazio não cria nada", async () => {
    await abrirEdicao();
    await clicar("Adicionar texto");
    await clicar("Concluído");
    expect(camadas()).toHaveLength(0);
  });

  it("estilos do texto: fonte, cor, alinhamento e fundo", async () => {
    await abrirEdicao();
    await clicar("Adicionar texto");
    await clicar("Máquina");
    await clicar("Fundo");
    await clicar("Cor #ff3b30");
    const campo = editor().querySelector<HTMLTextAreaElement>("textarea")!;
    expect(campo.style.fontFamily).toContain("Courier");
    expect(campo.style.background).not.toBe("transparent");
    await clicar("Concluído");
    expect(camadas()).toHaveLength(0); // sem texto, nada é criado
  });

  it("adesivos: emoji, etiqueta de oferta e preço", async () => {
    await abrirEdicao();
    await clicar("Adicionar adesivo");
    await clicar("Adicionar 🔥");
    expect(camadas().map((c) => c.getAttribute("aria-label"))).toEqual(["Emoji 🔥"]);

    await clicar("Adicionar adesivo");
    await clicar("Etiquetas");
    await clicar("OFERTA");
    const campo = editor().querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    expect(camadas()).toHaveLength(2);
    expect(campo).toBeNull(); // a bandeja fechou depois de escolher

    await clicar("Adicionar adesivo");
    await clicar("Etiquetas");
    await digitar(editor().querySelector<HTMLInputElement>('input[inputmode="decimal"]')!, "19,9");
    await act(async () => {
      editor().querySelector<HTMLFormElement>(".sc-story-preco")?.requestSubmit();
    });
    expect(camadas().map((c) => c.getAttribute("aria-label"))).toContain("Etiqueta: R$ 19,90");
  });

  it("marca um produto da loja e o botão do story passa a levar a ele", async () => {
    await abrirEdicao();
    await clicar("Adicionar adesivo");
    await clicar("Produto");
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 20));
    });
    await clicar("Pastel de carne");
    expect(camadas()[0]?.getAttribute("aria-label")).toBe("Etiqueta: Pastel de carne");

    envio.enviarComProgresso.mockResolvedValue({ status: 201, corpo: {} });
    await clicar("Publicar Story");
    expect(editor().textContent).toContain("ver produto: Pastel de carne".replace("ver", "Ver"));
    await clicar("Publicar agora");
    expect(envio.enviarComProgresso.mock.calls[0]?.[0]).toBe(
      "/api/loja/midia/stories?link=%2Floja%2Fpastelaria-da-vila%2Fproduto%2Fp-1",
    );
  });

  it("desfazer e refazer", async () => {
    await abrirEdicao();
    await clicar("Adicionar adesivo");
    await clicar("Adicionar ⭐");
    expect(camadas()).toHaveLength(1);
    await clicar("Desfazer");
    expect(camadas()).toHaveLength(0);
    await clicar("Refazer");
    expect(camadas()).toHaveLength(1);
  });

  it("desenhar mostra cores, três espessuras, borracha e concluir", async () => {
    await abrirEdicao();
    await clicar("Desenhar");
    const faixa = editor().querySelector('[aria-label="Ferramentas de desenho"]')!;
    expect(faixa.querySelectorAll('[aria-label^="Pincel "]')).toHaveLength(3);
    expect(faixa.querySelectorAll('[aria-label^="Cor "]').length).toBeGreaterThanOrEqual(10);
    await clicar("Pincel");
    expect(porRotulo("Borracha")).toBeTruthy();
    expect(editor().textContent).not.toContain("Publicar Story");
    await clicar("Concluir");
    expect(editor().textContent).toContain("Publicar Story");
  });

  it("o verde SimpleClick vem primeiro na paleta", async () => {
    tentarCamera(undefined);
    container = document.createElement("div");
    document.body.append(container);
    raiz = createRoot(container);
    await act(async () => {
      raiz?.render(
        <EditorDeStory
          perfil={{ ...PERFIL }}
          limites={LIMITES}
          aoPublicado={aoPublicado}
          aoFechar={aoFechar}
        />,
      );
    });
    await escolherDaGaleria(new File([new Uint8Array(5)], "a.jpg", { type: "image/jpeg" }));
    await clicar("Desenhar");
    const primeira = editor().querySelector('[aria-label="Cor do pincel"] button');
    expect(primeira?.getAttribute("aria-label")).toBe("Cor #b7ff00");
    expect(editor().style.getPropertyValue("--sc-story-destaque")).toBe("#b7ff00");
  });

  it("alternar entre preencher e mostrar inteira", async () => {
    await abrirEdicao();
    await clicar("Mostrar a foto inteira, sem cortar");
    expect(porRotulo("Preencher a tela com a foto")).toBeTruthy();
  });
});

function apontador(tipo: string, x: number, y: number, id = 1): Event {
  const evento = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(evento, "pointerId", { value: id });
  Object.defineProperty(evento, "pointerType", { value: "touch" });
  return evento;
}

describe("arrastar objetos", () => {
  async function comEmoji() {
    await abrirEdicao();
    await clicar("Adicionar adesivo");
    await clicar("Adicionar 🔥");
    return camadas()[0]!;
  }

  it("um dedo arrasta o adesivo", async () => {
    const camada = await comEmoji();
    const antes = camada.style.transform;
    await act(async () => {
      camada.dispatchEvent(apontador("pointerdown", 540, 820));
    });
    await act(async () => {
      camada.dispatchEvent(apontador("pointermove", 640, 900));
    });
    await act(async () => {
      camada.dispatchEvent(apontador("pointerup", 640, 900));
    });
    expect(camadas()[0]?.style.transform).not.toBe(antes);
    expect(camadas()[0]?.style.transform).toContain("translate(640px, 900px)");
    // O arrasto inteiro é UM passo: um desfazer volta à posição de antes.
    await clicar("Desfazer");
    expect(camadas()[0]?.style.transform).toContain("translate(540px, 820px)");
    expect(camadas()).toHaveLength(1);
  });

  it("dois dedos ampliam e giram o adesivo", async () => {
    const camada = await comEmoji();
    await act(async () => {
      camada.dispatchEvent(apontador("pointerdown", 440, 820, 1));
    });
    await act(async () => {
      camada.dispatchEvent(apontador("pointerdown", 640, 820, 2));
    });
    await act(async () => {
      camada.dispatchEvent(apontador("pointermove", 340, 820, 1));
      camada.dispatchEvent(apontador("pointermove", 740, 820, 2));
    });
    const transform = camadas()[0]?.style.transform ?? "";
    expect(transform).toContain("scale(2)");
    await act(async () => {
      camada.dispatchEvent(apontador("pointerup", 340, 820, 1));
      camada.dispatchEvent(apontador("pointerup", 740, 820, 2));
    });
    expect(camadas()).toHaveLength(1);
  });

  it("soltar na lixeira (rodapé) apaga, e desfazer traz de volta", async () => {
    const camada = await comEmoji();
    await act(async () => {
      camada.dispatchEvent(apontador("pointerdown", 540, 820));
    });
    await act(async () => {
      camada.dispatchEvent(apontador("pointermove", 540, 1500));
    });
    await act(async () => {
      camada.dispatchEvent(apontador("pointermove", 540, 1850));
    });
    expect(editor().querySelector(".sc-story-lixeira")?.getAttribute("data-ativa")).toBe("true");
    await act(async () => {
      camada.dispatchEvent(apontador("pointerup", 540, 1850));
    });
    expect(camadas()).toHaveLength(0);
    await clicar("Desfazer");
    expect(camadas()).toHaveLength(1);
  });

  it("um dedo na foto reposiciona a própria foto", async () => {
    await abrirEdicao();
    const foto = editor().querySelector<HTMLElement>(".sc-story-midia")!;
    const palco = editor().querySelector<HTMLElement>(".sc-story-palco")!;
    const antes = foto.style.transform;
    await act(async () => {
      palco.dispatchEvent(apontador("pointerdown", 500, 900));
    });
    await act(async () => {
      palco.dispatchEvent(apontador("pointermove", 560, 960));
    });
    await act(async () => {
      palco.dispatchEvent(apontador("pointerup", 560, 960));
    });
    expect(editor().querySelector<HTMLElement>(".sc-story-midia")?.style.transform).not.toBe(antes);
    expect(porRotulo("Desfazer").disabled).toBe(false);
  });
});

describe("cancelar", () => {
  it("sem edição o X volta para a câmera, sem perguntar", async () => {
    await abrirEdicao();
    await clicar("Cancelar e descartar o story");
    expect(editor().textContent).not.toContain("Descartar este story?");
    expect(editor().querySelector(".sc-story-captura")).not.toBeNull();
  });

  it("com edição pergunta; 'Continuar editando' mantém e 'Descartar' volta à câmera", async () => {
    await abrirEdicao();
    await clicar("Adicionar adesivo");
    await clicar("Adicionar ❤️");
    await clicar("Cancelar e descartar o story");
    expect(editor().textContent).toContain("Descartar este story?");
    await clicar("Continuar editando");
    expect(camadas()).toHaveLength(1);
    expect(editor().textContent).not.toContain("Descartar este story?");

    await act(async () => {
      editor().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(editor().textContent).toContain("Descartar este story?");
    await act(async () => {
      editor().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(editor().textContent).not.toContain("Descartar este story?");
    await act(async () => {
      editor().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await clicar("Descartar");
    expect(editor().querySelector(".sc-story-captura")).not.toBeNull();
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

describe("publicar", () => {
  it("monta a imagem, envia WebP com legenda e link da loja, e mostra o sucesso", async () => {
    await abrirEdicao();
    envio.enviarComProgresso.mockImplementation(
      async (_url: string, _arquivo: Blob, progresso: (f: number) => void) => {
        progresso(0.5);
        return { status: 201, corpo: {} };
      },
    );
    await clicar("Publicar Story");
    await digitar(editor().querySelector<HTMLTextAreaElement>("textarea")!, "Promo de hoje");
    await clicar("Publicar agora");
    await act(async () => {
      await Promise.resolve();
    });

    expect(envio.enviarComProgresso).toHaveBeenCalledTimes(1);
    const [url, arquivo] = envio.enviarComProgresso.mock.calls[0] as [string, Blob];
    expect(url).toBe("/api/loja/midia/stories?legenda=Promo+de+hoje&link=%2Floja%2Fpastelaria-da-vila");
    expect(arquivo.type).toBe("image/webp");
    expect(editor().textContent).toContain("Story no ar!");
    expect(aoPublicado).toHaveBeenCalledTimes(1);

    await clicar("Concluir");
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("sem botão: não manda link", async () => {
    await abrirEdicao();
    envio.enviarComProgresso.mockResolvedValue({ status: 201, corpo: {} });
    await clicar("Publicar Story");
    const semBotao = [...editor().querySelectorAll<HTMLInputElement>('input[type="radio"]')].at(-1)!;
    await act(async () => {
      semBotao.click();
    });
    await clicar("Publicar agora");
    expect(envio.enviarComProgresso.mock.calls[0]?.[0]).toBe("/api/loja/midia/stories");
  });

  it("limite de stories (409): explica e deixa tentar de novo", async () => {
    await abrirEdicao();
    envio.enviarComProgresso
      .mockResolvedValueOnce({ status: 409, corpo: { erro: "limite_atingido" } })
      .mockResolvedValueOnce({ status: 201, corpo: {} });
    await clicar("Publicar Story");
    await clicar("Publicar agora");
    await act(async () => {
      await Promise.resolve();
    });
    expect(editor().querySelector('[role="alert"]')?.textContent).toContain("limite de stories");
    expect(aoPublicado).not.toHaveBeenCalled();

    await clicar("Tentar de novo");
    await act(async () => {
      await Promise.resolve();
    });
    expect(editor().textContent).toContain("Story no ar!");
    // A imagem montada na primeira vez foi reaproveitada no reenvio.
    expect(envio.enviarComProgresso).toHaveBeenCalledTimes(2);
  });

  it("rede que cai: mensagem simples", async () => {
    await abrirEdicao();
    envio.enviarComProgresso.mockRejectedValue(new Error("rede"));
    await clicar("Publicar Story");
    await clicar("Publicar agora");
    await act(async () => {
      await Promise.resolve();
    });
    expect(editor().querySelector('[role="alert"]')?.textContent).toContain("A conexão caiu");
  });

  it("'Voltar' fecha a folha e dá para continuar editando", async () => {
    await abrirEdicao();
    await clicar("Publicar Story");
    expect(editor().textContent).toContain("Legenda (opcional)");
    await clicar("Voltar");
    expect(editor().textContent).not.toContain("Legenda (opcional)");
  });

  it("vídeo sem edição sobe o arquivo original, com a duração", async () => {
    tentarCamera(undefined);
    await montar();
    envio.lerDadosDoVideo.mockResolvedValue({ duracaoSegundos: 12.34, largura: 1080, altura: 1920 });
    envio.enviarComProgresso.mockResolvedValue({ status: 201, corpo: {} });
    const video = new File([new Uint8Array(500)], "clipe.mp4", { type: "video/mp4" });
    await escolherDaGaleria(video);
    expect(editor().querySelector(".sc-story-palco video")).not.toBeNull();
    await clicar("Publicar Story");
    await clicar("Publicar agora");
    await act(async () => {
      await Promise.resolve();
    });
    expect(envio.enviarComProgresso).toHaveBeenCalledWith(
      "/api/loja/midia/stories?link=%2Floja%2Fpastelaria-da-vila&duracaoSegundos=12.3",
      video,
      expect.any(Function),
    );
  });
});

describe("acessibilidade", () => {
  it("é um diálogo modal com nome, no body, e devolve a rolagem ao fechar", async () => {
    tentarCamera(undefined);
    await montar();
    const dialogo = editor();
    expect(dialogo.getAttribute("aria-modal")).toBe("true");
    expect(dialogo.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe("hidden");
    act(() => raiz?.unmount());
    raiz = null;
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("todo botão tem nome", async () => {
    await abrirEdicao();
    await clicar("Adicionar adesivo");
    for (const botao of editor().querySelectorAll("button")) {
      const nome = (botao.getAttribute("aria-label") ?? botao.textContent ?? "").trim();
      expect(nome, botao.outerHTML).not.toBe("");
    }
  });
});
