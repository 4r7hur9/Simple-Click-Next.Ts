/**
 * Composição do Story no canvas (card #84), com um contexto de mentira que
 * anota o que foi desenhado: ordem das camadas, geometria, borracha, texto e
 * exportação.
 */
import { describe, expect, it, vi } from "vitest";

import {
  comporFoto,
  desenharQuadro,
  exportarFoto,
  linhasDoTexto,
  precisaComporOVideo,
  renderizarSobreposicao,
  type FamiliasDoEditor,
  type Tela,
} from "../src/features/stories/composicao";
import {
  adicionarCamada,
  adicionarTraco,
  criarEmoji,
  criarEtiqueta,
  criarTexto,
  documentoVazio,
  estenderTraco,
  mudarFundo,
  novoTraco,
  type DocumentoDoStory,
} from "../src/features/stories/documento";

type Chamada = [string, ...unknown[]];

function telaDeMentira(largura: number, altura: number) {
  const chamadas: Chamada[] = [];
  const registro =
    (nome: string) =>
    (...args: unknown[]) => {
      chamadas.push([nome, ...args]);
    };
  const propriedades: Record<string, unknown> = {};
  const contexto = new Proxy(
    {
      measureText: (texto: string) => ({ width: texto.length * 40 }),
    } as Record<string, unknown>,
    {
      get(alvo, nome: string) {
        if (nome in alvo) return alvo[nome];
        if (nome in propriedades) return propriedades[nome];
        return registro(nome);
      },
      set(_alvo, nome: string, valor) {
        propriedades[nome] = valor;
        chamadas.push([`set:${nome}`, valor]);
        return true;
      },
    },
  );
  const tela = {
    width: largura,
    height: altura,
    getContext: () => contexto,
    toBlob: vi.fn(),
  };
  return { tela: tela as unknown as Tela, chamadas };
}

const FAMILIAS: FamiliasDoEditor = {
  moderno: "Moderno",
  maquina: "Maquina",
  elegante: "Elegante",
};

function fabrica() {
  const telas: ReturnType<typeof telaDeMentira>[] = [];
  const criar = (largura: number, altura: number) => {
    const nova = telaDeMentira(largura, altura);
    telas.push(nova);
    return nova.tela;
  };
  return { criar, telas };
}

const T = { x: 540, y: 800, escala: 2, rotacao: 0.5 };

function nomes(chamadas: Chamada[]) {
  return chamadas.map((chamada) => chamada[0]);
}

describe("as linhas do texto", () => {
  it("mantém as quebras digitadas e tira as vazias das pontas", () => {
    expect(linhasDoTexto("\n\nOlá\nmundo\n\n")).toEqual(["Olá", "mundo"]);
    expect(linhasDoTexto("a\r\nb")).toEqual(["a", "b"]);
    expect(linhasDoTexto("   ")).toEqual([]);
  });
});

describe("a sobreposição (desenho + camadas)", () => {
  it("é 1080 x 1920 e a borracha apaga só o desenho", () => {
    const { criar, telas } = fabrica();
    let doc: DocumentoDoStory = documentoVazio();
    doc = adicionarTraco(
      doc,
      estenderTraco(novoTraco("#ff3b30", 26, false, { x: 10, y: 10 }), { x: 90, y: 90 }),
    );
    doc = adicionarTraco(
      doc,
      estenderTraco(novoTraco("#000", 56, true, { x: 10, y: 10 }), { x: 90, y: 90 }),
    );
    const tela = renderizarSobreposicao(doc, FAMILIAS, criar);

    expect(tela.width).toBe(1080);
    expect(tela.height).toBe(1920);
    const { chamadas } = telas[0]!;
    const modos = chamadas
      .filter(([nome]) => nome === "set:globalCompositeOperation")
      .map((chamada) => chamada[1]);
    expect(modos).toEqual(["source-over", "destination-out"]);
    expect(chamadas.filter(([nome]) => nome === "stroke")).toHaveLength(2);
  });

  it("um toque sem arrastar vira um ponto", () => {
    const { criar, telas } = fabrica();
    const doc = adicionarTraco(
      documentoVazio(),
      novoTraco("#fff", 26, false, { x: 100, y: 200 }),
    );
    renderizarSobreposicao(doc, FAMILIAS, criar);
    const arco = telas[0]!.chamadas.find(([nome]) => nome === "arc");
    expect(arco).toEqual(["arc", 100, 200, 13, 0, Math.PI * 2]);
  });

  it("texto: aplica a transformação e escreve cada linha", () => {
    const { criar, telas } = fabrica();
    const texto = criarTexto(
      { texto: "Oi\nTudo bem", fonte: "maquina", cor: "#ffd60a", alinhamento: "esquerda", comFundo: false },
      T,
    );
    renderizarSobreposicao(adicionarCamada(documentoVazio(), texto), FAMILIAS, criar);
    const { chamadas } = telas[0]!;
    expect(chamadas).toContainEqual(["translate", 540, 800]);
    expect(chamadas).toContainEqual(["rotate", 0.5]);
    expect(chamadas).toContainEqual(["scale", 2, 2]);
    const escritas = chamadas.filter(([nome]) => nome === "fillText");
    expect(escritas.map((c) => c[1])).toEqual(["Oi", "Tudo bem"]);
    expect(chamadas).toContainEqual(["set:font", "700 84px Maquina"]);
    // Sem fundo: nada de retângulo arredondado.
    expect(nomes(chamadas)).not.toContain("arcTo");
  });

  it("texto com fundo pinta o fundo na cor e escreve com tinta que contrasta", () => {
    const { criar, telas } = fabrica();
    const texto = criarTexto(
      { texto: "Oferta", fonte: "moderno", cor: "#b7ff00", alinhamento: "centro", comFundo: true },
      T,
    );
    renderizarSobreposicao(adicionarCamada(documentoVazio(), texto), FAMILIAS, criar);
    const { chamadas } = telas[0]!;
    expect(nomes(chamadas)).toContain("arcTo");
    const cores = chamadas.filter(([nome]) => nome === "set:fillStyle").map((c) => c[1]);
    expect(cores).toEqual(["#b7ff00", "#000000"]);
  });

  it("o alinhamento muda onde a linha curta começa", () => {
    function xDaSegundaLinha(alinhamento: "esquerda" | "centro" | "direita") {
      const { criar, telas } = fabrica();
      const texto = criarTexto(
        { texto: "AAAAAAAA\nA", fonte: "moderno", cor: "#fff", alinhamento, comFundo: false },
        { x: 0, y: 0, escala: 1, rotacao: 0 },
      );
      renderizarSobreposicao(adicionarCamada(documentoVazio(), texto), FAMILIAS, criar);
      const escritas = telas[0]!.chamadas.filter(([nome]) => nome === "fillText");
      return escritas[1]![2] as number;
    }
    const esquerda = xDaSegundaLinha("esquerda");
    const centro = xDaSegundaLinha("centro");
    const direita = xDaSegundaLinha("direita");
    expect(esquerda).toBeLessThan(centro);
    expect(centro).toBeLessThan(direita);
  });

  it("emoji e etiqueta entram na ordem, uma sobre a outra", () => {
    const { criar, telas } = fabrica();
    let doc = adicionarCamada(documentoVazio(), criarEmoji("🔥", T));
    doc = adicionarCamada(
      doc,
      criarEtiqueta({ texto: "OFERTA", fundo: "#ff3b30", tinta: "#fff" }, T),
    );
    renderizarSobreposicao(doc, FAMILIAS, criar);
    const escritas = telas[0]!.chamadas.filter(([nome]) => nome === "fillText");
    expect(escritas.map((c) => c[1])).toEqual(["🔥", "OFERTA"]);
  });
});

describe("o quadro final", () => {
  const midia = { origem: {} as CanvasImageSource, largura: 4000, altura: 3000 };

  it("preenche o fundo, desenha a mídia centrada e cola a sobreposição por cima", () => {
    const { criar, telas } = fabrica();
    const saida = comporFoto(documentoVazio(), midia, FAMILIAS, criar);
    expect(saida.width).toBe(1080);
    expect(saida.height).toBe(1920);
    const chamadas = telas[telas.length - 1]!.chamadas;
    expect(nomes(chamadas).indexOf("fillRect")).toBeLessThan(
      nomes(chamadas).indexOf("drawImage"),
    );
    const desenhos = chamadas.filter(([nome]) => nome === "drawImage");
    expect(desenhos).toHaveLength(2);
    // Foto deitada, "preencher": escala 1920/3000.
    expect(chamadas).toContainEqual(["scale", 1920 / 3000, 1920 / 3000]);
    expect(desenhos[0]).toEqual(["drawImage", midia.origem, -2000, -1500, 4000, 3000]);
    expect(desenhos[1]?.slice(2)).toEqual([0, 0, 1080, 1920]);
  });

  it("zoom e giro da foto entram na conta", () => {
    const { telas, criar } = fabrica();
    const sobre = criar(1080, 1920);
    const alvo = telaDeMentira(1080, 1920);
    const doc = mudarFundo(documentoVazio(), { x: 600, y: 900, escala: 2, rotacao: 0.3 });
    const contexto = alvo.tela.getContext("2d") as CanvasRenderingContext2D;
    desenharQuadro(contexto, doc, { midia, sobreposicao: sobre });
    expect(telas.length).toBe(1);
    expect(alvo.chamadas).toContainEqual(["translate", 600, 900]);
    expect(alvo.chamadas).toContainEqual(["rotate", 0.3]);
    expect(alvo.chamadas).toContainEqual(["scale", (1920 / 3000) * 2, (1920 / 3000) * 2]);
  });

  it("na escala do vídeo, o quadro inteiro encolhe junto", () => {
    const alvo = telaDeMentira(720, 1280);
    const { criar } = fabrica();
    desenharQuadro(
      alvo.tela.getContext("2d") as CanvasRenderingContext2D,
      documentoVazio(),
      { midia, sobreposicao: criar(1080, 1920) },
      2 / 3,
    );
    expect(alvo.chamadas[1]).toEqual(["scale", 2 / 3, 2 / 3]);
  });
});

describe("exportação", () => {
  function telaQueExporta(tipos: Record<string, string>) {
    const pedidos: string[] = [];
    const tela = {
      toBlob(retorno: (blob: Blob | null) => void, tipo: string, qualidade: number) {
        pedidos.push(`${tipo}@${qualidade}`);
        const real = tipos[tipo];
        retorno(real === undefined ? null : new Blob(["x"], { type: real }));
      },
    } as unknown as Tela;
    return { tela, pedidos };
  }

  it("prefere WebP a 0,85", async () => {
    const { tela, pedidos } = telaQueExporta({ "image/webp": "image/webp" });
    const blob = await exportarFoto(tela);
    expect(blob.type).toBe("image/webp");
    expect(pedidos).toEqual(["image/webp@0.85"]);
  });

  it("sem WebP (o navegador devolve PNG), cai para JPEG", async () => {
    const { tela, pedidos } = telaQueExporta({
      "image/webp": "image/png",
      "image/jpeg": "image/jpeg",
    });
    const blob = await exportarFoto(tela);
    expect(blob.type).toBe("image/jpeg");
    expect(pedidos).toEqual(["image/webp@0.85", "image/jpeg@0.85"]);
  });

  it("sem nenhum formato, avisa", async () => {
    const { tela } = telaQueExporta({});
    await expect(exportarFoto(tela)).rejects.toThrow(/imagem do story/);
  });
});

describe("vídeo: quando precisa regravar", () => {
  it("sem edição, o arquivo original sobe como está", () => {
    expect(precisaComporOVideo(documentoVazio(), 1080, 1920)).toBe(false);
    expect(precisaComporOVideo(documentoVazio(), 1920, 1080)).toBe(false);
  });

  it("texto, desenho ou foto mexida pedem regravação", () => {
    expect(
      precisaComporOVideo(
        adicionarCamada(documentoVazio(), criarEmoji("🔥", T)),
        1080,
        1920,
      ),
    ).toBe(true);
    expect(
      precisaComporOVideo(
        mudarFundo(documentoVazio(), { x: 540, y: 960, escala: 1.2, rotacao: 0 }),
        1080,
        1920,
      ),
    ).toBe(true);
  });
});
