import { describe, expect, it } from "vitest";

import {
  ZOOM_MAXIMO,
  acompanharMoldura,
  avaliarNitidez,
  centralizar,
  corMediaDosPixels,
  escalarEstado,
  espelhar,
  estadoInicial,
  estiloDaImagem,
  girar,
  herdarEnquadramento,
  limitarZoom,
  limitesDoDeslocamento,
  matrizDeSaida,
  mover,
  mudarModo,
  mudarZoom,
  nomeDoArquivoRecortado,
  tamanhoGirado,
  tamanhoNaMoldura,
  tipoDoArquivo,
  validarArquivoDeImagem,
  type EstadoDoRecorte,
  type MatrizDoCanvas,
  type Ponto,
} from "../src/recorte-geometria";

const MOLDURA = { largura: 400, altura: 100 }; // 4:1
const FOTO_LARGA = { largura: 2000, altura: 1000 }; // 2:1
const FOTO_ALTA = { largura: 600, altura: 1200 }; // 1:2
const SAIDA = { largura: 1600, altura: 400 };

function aplicar(m: MatrizDoCanvas, u: number, v: number): Ponto {
  return { x: m[0] * u + m[2] * v + m[4], y: m[1] * u + m[3] * v + m[5] };
}

function proximo(real: Ponto, esperado: Ponto) {
  expect(real.x).toBeCloseTo(esperado.x, 6);
  expect(real.y).toBeCloseTo(esperado.y, 6);
}

describe("preencher (cover)", () => {
  it("cobre a moldura inteira: a foto larga encosta nos lados", () => {
    const estado = estadoInicial(MOLDURA, FOTO_LARGA);
    const imagem = tamanhoNaMoldura(MOLDURA, FOTO_LARGA, estado);
    expect(imagem.largura).toBe(400);
    expect(imagem.altura).toBe(200);
    // Sobra 100 na altura: começa centralizada (-50).
    expect(estado.x).toBe(0);
    expect(estado.y).toBe(-50);
  });

  it("foto alta: cobre pela largura e sobra muito na altura", () => {
    const estado = estadoInicial(MOLDURA, FOTO_ALTA);
    const imagem = tamanhoNaMoldura(MOLDURA, FOTO_ALTA, estado);
    expect(imagem.largura).toBeCloseTo(400);
    expect(imagem.altura).toBeCloseTo(800);
    expect(estado.y).toBeCloseTo(-350);
  });

  it("nunca deixa vão: o arrasto é preso nos limites", () => {
    const estado = estadoInicial(MOLDURA, FOTO_LARGA);
    const limites = limitesDoDeslocamento(MOLDURA, FOTO_LARGA, estado);
    expect(limites).toEqual({ minX: 0, maxX: 0, minY: -100, maxY: 0 });

    const paraCima = mover(MOLDURA, FOTO_LARGA, estado, { x: 80, y: -500 });
    expect(paraCima.x).toBe(0);
    expect(paraCima.y).toBe(-100);
    const paraBaixo = mover(MOLDURA, FOTO_LARGA, estado, { x: 0, y: 900 });
    expect(paraBaixo.y).toBe(0);
  });

  it("com zoom, abre folga também na horizontal e ainda sem vão", () => {
    const base = estadoInicial(MOLDURA, FOTO_LARGA);
    const com2 = mudarZoom(MOLDURA, FOTO_LARGA, base, 2);
    const limites = limitesDoDeslocamento(MOLDURA, FOTO_LARGA, com2);
    expect(limites.minX).toBe(-400);
    expect(limites.minY).toBe(-300);
    const arrastada = mover(MOLDURA, FOTO_LARGA, com2, { x: -9999, y: -9999 });
    expect(arrastada.x).toBe(-400);
    expect(arrastada.y).toBe(-300);
  });
});

describe("ajustar (contain)", () => {
  it("mostra a foto inteira, com sobra nas laterais", () => {
    const estado = estadoInicial(MOLDURA, FOTO_LARGA, "ajustar");
    const imagem = tamanhoNaMoldura(MOLDURA, FOTO_LARGA, estado);
    // 2:1 dentro de 4:1: a altura manda (100), a largura fica em 200.
    expect(imagem.altura).toBe(100);
    expect(imagem.largura).toBe(200);
    expect(estado.x).toBe(100); // centralizada
    expect(estado.y).toBe(0);
  });

  it("deixa posicionar a foto em qualquer lugar da moldura, mas não para fora", () => {
    const estado = estadoInicial(MOLDURA, FOTO_LARGA, "ajustar");
    const limites = limitesDoDeslocamento(MOLDURA, FOTO_LARGA, estado);
    expect(limites).toEqual({ minX: 0, maxX: 200, minY: 0, maxY: 0 });
    expect(mover(MOLDURA, FOTO_LARGA, estado, { x: 999, y: 0 }).x).toBe(200);
    expect(mover(MOLDURA, FOTO_LARGA, estado, { x: -999, y: 0 }).x).toBe(0);
  });

  it("quando o zoom passa da moldura, volta a valer a regra de não deixar vão", () => {
    const base = estadoInicial(MOLDURA, FOTO_LARGA, "ajustar");
    const ampliada = mudarZoom(MOLDURA, FOTO_LARGA, base, 4);
    const imagem = tamanhoNaMoldura(MOLDURA, FOTO_LARGA, ampliada);
    expect(imagem.largura).toBe(800);
    expect(imagem.altura).toBe(400);
    const limites = limitesDoDeslocamento(MOLDURA, FOTO_LARGA, ampliada);
    expect(limites).toEqual({ minX: -400, maxX: 0, minY: -300, maxY: 0 });
  });

  it("trocar de modo zera o zoom e recentraliza", () => {
    const preenchida = mudarZoom(
      MOLDURA,
      FOTO_LARGA,
      estadoInicial(MOLDURA, FOTO_LARGA),
      3,
    );
    const ajustada = mudarModo(MOLDURA, FOTO_LARGA, preenchida, "ajustar");
    expect(ajustada.modo).toBe("ajustar");
    expect(ajustada.zoom).toBe(1);
    expect(ajustada.x).toBe(100);
    expect(mudarModo(MOLDURA, FOTO_LARGA, ajustada, "ajustar")).toBe(ajustada);
  });
});

describe("zoom", () => {
  it("fica entre 1 e o máximo", () => {
    expect(limitarZoom(0.2)).toBe(1);
    expect(limitarZoom(99)).toBe(ZOOM_MAXIMO);
    expect(limitarZoom(Number.NaN)).toBe(1);
    const base = estadoInicial(MOLDURA, FOTO_LARGA);
    expect(mudarZoom(MOLDURA, FOTO_LARGA, base, 50).zoom).toBe(ZOOM_MAXIMO);
  });

  it("mantém o ponto sob o dedo no mesmo pedaço da foto", () => {
    const base = mover(
      MOLDURA,
      FOTO_LARGA,
      mudarZoom(MOLDURA, FOTO_LARGA, estadoInicial(MOLDURA, FOTO_LARGA), 2),
      { x: 120, y: 0 },
    );
    const ponto = { x: 300, y: 40 };
    const antes = tamanhoNaMoldura(MOLDURA, FOTO_LARGA, base);
    const naFotoAntes = {
      x: (ponto.x - base.x) / antes.escala,
      y: (ponto.y - base.y) / antes.escala,
    };
    const depois = mudarZoom(MOLDURA, FOTO_LARGA, base, 2.5, ponto);
    const escalaDepois = tamanhoNaMoldura(MOLDURA, FOTO_LARGA, depois).escala;
    proximo(
      {
        x: (ponto.x - depois.x) / escalaDepois,
        y: (ponto.y - depois.y) / escalaDepois,
      },
      naFotoAntes,
    );
  });

  it("voltar ao zoom 1 recoloca a foto sem vão", () => {
    const com3 = mudarZoom(
      MOLDURA,
      FOTO_LARGA,
      estadoInicial(MOLDURA, FOTO_LARGA),
      3,
    );
    const solta = mover(MOLDURA, FOTO_LARGA, com3, { x: -9999, y: -9999 });
    const volta = mudarZoom(MOLDURA, FOTO_LARGA, solta, 1);
    expect(volta.x).toBeCloseTo(0);
    expect(volta.y).toBeGreaterThanOrEqual(-100);
    expect(volta.y).toBeLessThanOrEqual(0);
  });
});

describe("giro e espelho", () => {
  it("gira 90° no sentido horário e troca largura por altura", () => {
    expect(tamanhoGirado(FOTO_ALTA, 90)).toEqual({
      largura: 1200,
      altura: 600,
    });
    expect(tamanhoGirado(FOTO_ALTA, 180)).toEqual(FOTO_ALTA);
    let estado: EstadoDoRecorte = estadoInicial(MOLDURA, FOTO_ALTA);
    for (const esperado of [90, 180, 270, 0]) {
      estado = girar(MOLDURA, FOTO_ALTA, estado);
      expect(estado.giro).toBe(esperado);
    }
  });

  it("depois de girar, a foto continua cobrindo a moldura", () => {
    const girada = girar(MOLDURA, FOTO_ALTA, estadoInicial(MOLDURA, FOTO_ALTA));
    const imagem = tamanhoNaMoldura(MOLDURA, FOTO_ALTA, girada);
    expect(imagem.largura).toBeCloseTo(400);
    expect(imagem.altura).toBeCloseTo(200);
    const limites = limitesDoDeslocamento(MOLDURA, FOTO_ALTA, girada);
    expect(girada.x).toBeGreaterThanOrEqual(limites.minX);
    expect(girada.y).toBeGreaterThanOrEqual(limites.minY);
  });

  it("espelhar vira a chave e não mexe na posição", () => {
    const base = mover(
      MOLDURA,
      FOTO_LARGA,
      estadoInicial(MOLDURA, FOTO_LARGA),
      { x: 0, y: 20 },
    );
    const espelhada = espelhar(base);
    expect(espelhada.espelhado).toBe(true);
    expect(espelhada.x).toBe(base.x);
    expect(espelhada.y).toBe(base.y);
    expect(espelhar(espelhada).espelhado).toBe(false);
  });

  it("centralizar recoloca no meio sem apagar zoom nem giro", () => {
    const solta = mover(
      MOLDURA,
      FOTO_LARGA,
      mudarZoom(MOLDURA, FOTO_LARGA, estadoInicial(MOLDURA, FOTO_LARGA), 2),
      { x: -9999, y: -9999 },
    );
    const centro = centralizar(MOLDURA, FOTO_LARGA, solta);
    expect(centro.zoom).toBe(2);
    expect(centro.x).toBe(-200);
    expect(centro.y).toBe(-150);
  });
});

describe("saída em dimensões exatas", () => {
  it("preencher: a foto cobre o arquivo de ponta a ponta", () => {
    const estado = estadoInicial(MOLDURA, FOTO_LARGA);
    const m = matrizDeSaida(MOLDURA, FOTO_LARGA, estado, SAIDA);
    // A foto 2000×1000 vira 1600×800; o recorte mostra a faixa do meio (y de -200).
    proximo(aplicar(m, 0, 0), { x: 0, y: -200 });
    proximo(aplicar(m, 2000, 1000), { x: 1600, y: 600 });
    // O arquivo 1600×400 está inteiro dentro da foto: sem vão.
    const topo = aplicar(m, 0, 0);
    const base = aplicar(m, 2000, 1000);
    expect(topo.x).toBeLessThanOrEqual(0);
    expect(topo.y).toBeLessThanOrEqual(0);
    expect(base.x).toBeGreaterThanOrEqual(SAIDA.largura);
    expect(base.y).toBeGreaterThanOrEqual(SAIDA.altura);
  });

  it("ajustar: a foto inteira cabe no arquivo, centralizada", () => {
    const estado = estadoInicial(MOLDURA, FOTO_LARGA, "ajustar");
    const m = matrizDeSaida(MOLDURA, FOTO_LARGA, estado, SAIDA);
    proximo(aplicar(m, 0, 0), { x: 400, y: 0 });
    proximo(aplicar(m, 2000, 1000), { x: 1200, y: 400 });
  });

  it("segue o arrasto e o zoom da moldura", () => {
    const zoom = mudarZoom(
      MOLDURA,
      FOTO_LARGA,
      estadoInicial(MOLDURA, FOTO_LARGA),
      2,
    );
    const movida = mover(MOLDURA, FOTO_LARGA, zoom, { x: -100, y: -50 });
    const m = matrizDeSaida(MOLDURA, FOTO_LARGA, movida, SAIDA);
    // O canto da foto vai para (x, y) da moldura × 4.
    proximo(aplicar(m, 0, 0), { x: movida.x * 4, y: movida.y * 4 });
    const imagem = tamanhoNaMoldura(MOLDURA, FOTO_LARGA, movida);
    proximo(aplicar(m, 2000, 1000), {
      x: (movida.x + imagem.largura) * 4,
      y: (movida.y + imagem.altura) * 4,
    });
  });

  it("gira: o canto de cima à esquerda da foto vai para o canto de cima à direita", () => {
    const base = estadoInicial({ largura: 100, altura: 100 }, FOTO_ALTA);
    const girada = girar({ largura: 100, altura: 100 }, FOTO_ALTA, base);
    const saida = { largura: 400, altura: 400 };
    const m = matrizDeSaida(
      { largura: 100, altura: 100 },
      FOTO_ALTA,
      girada,
      saida,
    );
    const imagem = tamanhoNaMoldura(
      { largura: 100, altura: 100 },
      FOTO_ALTA,
      girada,
    );
    // 90° horário: (0,0) da foto → canto superior DIREITO da foto girada.
    proximo(aplicar(m, 0, 0), {
      x: (girada.x + imagem.largura) * 4,
      y: girada.y * 4,
    });
    // E o canto inferior esquerdo da foto → canto superior esquerdo da girada.
    proximo(aplicar(m, 0, FOTO_ALTA.altura), {
      x: girada.x * 4,
      y: girada.y * 4,
    });
  });

  it("espelha na horizontal o que se vê (depois do giro)", () => {
    const quadrada = { largura: 100, altura: 100 };
    const foto = { largura: 300, altura: 300 };
    const base = estadoInicial(quadrada, foto);
    const espelhada = espelhar(base);
    const m = matrizDeSaida(quadrada, foto, espelhada, {
      largura: 100,
      altura: 100,
    });
    proximo(aplicar(m, 0, 0), { x: 100, y: 0 });
    proximo(aplicar(m, 300, 300), { x: 0, y: 100 });

    // Girada e espelhada: o canto (0,0) da foto vai para o canto superior
    // ESQUERDO (o direito, espelhado).
    const girada = espelhar(girar(quadrada, foto, base));
    const g = matrizDeSaida(quadrada, foto, girada, {
      largura: 100,
      altura: 100,
    });
    proximo(aplicar(g, 0, 0), { x: 0, y: 0 });
  });

  it("a tela e o canvas contam a mesma história (tamanho e centro da foto)", () => {
    const estado = girar(
      MOLDURA,
      FOTO_ALTA,
      mudarZoom(MOLDURA, FOTO_ALTA, estadoInicial(MOLDURA, FOTO_ALTA), 1.5),
    );
    const estilo = estiloDaImagem(MOLDURA, FOTO_ALTA, estado);
    const imagem = tamanhoNaMoldura(MOLDURA, FOTO_ALTA, estado);
    expect(estilo.width).toBeCloseTo(FOTO_ALTA.largura * imagem.escala);
    expect(estilo.height).toBeCloseTo(FOTO_ALTA.altura * imagem.escala);
    expect(estilo.transform).toContain("rotate(90deg)");
    expect(estilo.transform).not.toContain("scaleX");
    expect(
      estiloDaImagem(MOLDURA, FOTO_ALTA, espelhar(estado)).transform,
    ).toContain("scaleX(-1) rotate(90deg)");
    // Em outra escala (miniatura), tudo encolhe junto.
    const pequeno = estiloDaImagem(MOLDURA, FOTO_ALTA, estado, 0.5);
    expect(pequeno.width).toBeCloseTo(estilo.width / 2);
  });

  it("acompanhar a moldura quando a janela muda de tamanho", () => {
    const estado = { ...estadoInicial(MOLDURA, FOTO_LARGA), x: -40, y: -20 };
    const maior = acompanharMoldura(estado, 400, 600);
    expect(maior.x).toBe(-60);
    expect(maior.y).toBe(-30);
    expect(acompanharMoldura(estado, 400, 400)).toBe(estado);
  });
});

describe("nitidez", () => {
  it("foto grande: sem aviso", () => {
    const estado = estadoInicial(MOLDURA, FOTO_LARGA);
    const nitidez = avaliarNitidez(MOLDURA, FOTO_LARGA, estado, SAIDA, 1200);
    expect(nitidez.baixa).toBe(false);
    expect(nitidez.pixelsDaFotoNaLargura).toBe(2000);
  });

  it("foto pequena: avisa", () => {
    const pequena = { largura: 800, altura: 400 };
    const estado = estadoInicial(MOLDURA, pequena);
    const nitidez = avaliarNitidez(MOLDURA, pequena, estado, SAIDA, 1200);
    expect(nitidez.baixa).toBe(true);
    expect(nitidez.ampliacao).toBeCloseTo(2);
  });

  it("aproximar uma foto boa pode passar a avisar", () => {
    const media = { largura: 1600, altura: 800 };
    const base = estadoInicial(MOLDURA, media);
    expect(avaliarNitidez(MOLDURA, media, base, SAIDA, 1200).baixa).toBe(false);
    const perto = mudarZoom(MOLDURA, media, base, 2);
    expect(avaliarNitidez(MOLDURA, media, perto, SAIDA, 1200).baixa).toBe(true);
  });

  it("no limite exato do mínimo não avisa", () => {
    const limite = { largura: 1200, altura: 600 };
    const estado = estadoInicial(MOLDURA, limite);
    expect(avaliarNitidez(MOLDURA, limite, estado, SAIDA, 1200).baixa).toBe(
      false,
    );
  });
});

describe("cor média", () => {
  it("faz a média ponderada pela opacidade", () => {
    expect(corMediaDosPixels([255, 0, 0, 255, 0, 0, 255, 255])).toBe("#800080");
    // Pixel transparente não conta.
    expect(corMediaDosPixels([255, 0, 0, 255, 0, 255, 0, 0])).toBe("#ff0000");
    expect(corMediaDosPixels([])).toBe("#161c19");
  });
});

describe("arquivo", () => {
  const jpg = (
    sobre: Partial<{ type: string; name: string; size: number }> = {},
  ) => ({
    type: "image/jpeg",
    name: "foto.jpg",
    size: 2 * 1024 * 1024,
    ...sobre,
  });

  it("aceita JPG, PNG, WebP e HEIC", () => {
    for (const type of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ]) {
      expect(validarArquivoDeImagem(jpg({ type }))).toBeNull();
    }
  });

  it("HEIC sem tipo informado é reconhecido pela extensão", () => {
    expect(tipoDoArquivo({ type: "", name: "IMG_0001.HEIC" })).toBe(
      "image/heic",
    );
    expect(
      validarArquivoDeImagem(jpg({ type: "", name: "IMG_0001.HEIC" })),
    ).toBeNull();
    expect(tipoDoArquivo({ type: "", name: "texto.txt" })).toBe("");
  });

  it("recusa o que não é foto, com a frase clara", () => {
    expect(
      validarArquivoDeImagem(jpg({ type: "application/pdf", name: "a.pdf" })),
    ).toMatch(/não é uma foto/);
    expect(
      validarArquivoDeImagem(jpg({ type: "video/mp4", name: "a.mp4" })),
    ).not.toBeNull();
  });

  it("recusa arquivo vazio e pesado demais, dizendo o tamanho", () => {
    expect(validarArquivoDeImagem(jpg({ size: 0 }))).toMatch(/vazio/);
    const pesada = validarArquivoDeImagem(jpg({ size: 30 * 1024 * 1024 }));
    expect(pesada).toContain("30 MB");
    expect(pesada).toContain("25 MB");
    expect(
      validarArquivoDeImagem(jpg({ size: 6 * 1024 * 1024 }), {
        limiteEmBytes: 5 * 1024 * 1024,
      }),
    ).toContain("6,0 MB");
  });

  it("respeita a lista de tipos de quem pede", () => {
    expect(
      validarArquivoDeImagem(jpg({ type: "image/png", name: "a.png" }), {
        tipos: ["image/jpeg"],
      }),
    ).not.toBeNull();
  });

  it("troca a extensão para webp", () => {
    expect(nomeDoArquivoRecortado("foto da loja.JPEG")).toBe(
      "foto da loja.webp",
    );
    expect(nomeDoArquivoRecortado("sem-extensao")).toBe("sem-extensao.webp");
    expect(nomeDoArquivoRecortado(".png")).toBe("foto.webp");
  });
});

describe("molduras diferentes para o computador e para o celular", () => {
  const COMPUTADOR = { largura: 1600, altura: 1200 }; // 4:3
  const CELULAR = { largura: 720, altura: 1600 }; // 9:20
  const FOTO = { largura: 4000, altura: 3000 };

  it("escalarEstado leva o deslocamento de uma moldura para outra do mesmo formato", () => {
    const estado = mover(
      { largura: 400, altura: 300 },
      FOTO,
      mudarZoom(
        { largura: 400, altura: 300 },
        FOTO,
        estadoInicial({ largura: 400, altura: 300 }, FOTO),
        2,
      ),
      { x: -30, y: -10 },
    );
    const grande = escalarEstado(estado, 4);
    expect(grande.x).toBeCloseTo(estado.x * 4);
    expect(grande.y).toBeCloseTo(estado.y * 4);
    expect(grande.zoom).toBe(estado.zoom);
    expect(escalarEstado(estado, 1)).toBe(estado);
  });

  it("o celular herda o ponto central do computador, com o mesmo zoom", () => {
    // O dono aproximou 2× e levou a foto para mostrar o lado esquerdo.
    const base = mudarZoom(
      COMPUTADOR,
      FOTO,
      estadoInicial(COMPUTADOR, FOTO),
      2,
    );
    const noComputador = mover(COMPUTADOR, FOTO, base, { x: 500, y: 0 });
    const noCelular = herdarEnquadramento(
      FOTO,
      COMPUTADOR,
      noComputador,
      CELULAR,
    );

    expect(noCelular.zoom).toBe(2);
    expect(noCelular.modo).toBe(noComputador.modo);
    // O mesmo ponto da foto no centro das duas molduras.
    const a = tamanhoNaMoldura(COMPUTADOR, FOTO, noComputador);
    const b = tamanhoNaMoldura(CELULAR, FOTO, noCelular);
    const focoA = (COMPUTADOR.largura / 2 - noComputador.x) / a.largura;
    const focoB = (CELULAR.largura / 2 - noCelular.x) / b.largura;
    // O celular em pé é estreito: o ponto pode ter sido preso para não deixar vão.
    expect(Math.abs(focoA - focoB)).toBeLessThan(0.2);
    // E a foto cobre a moldura do celular inteira, sem vão.
    const limites = limitesDoDeslocamento(CELULAR, FOTO, noCelular);
    expect(noCelular.x).toBeGreaterThanOrEqual(limites.minX);
    expect(noCelular.x).toBeLessThanOrEqual(limites.maxX);
    expect(noCelular.y).toBeGreaterThanOrEqual(limites.minY);
    expect(noCelular.y).toBeLessThanOrEqual(limites.maxY);
  });

  it("sem mexer em nada, o celular herda a foto centralizada", () => {
    const inicial = estadoInicial(COMPUTADOR, FOTO);
    const herdado = herdarEnquadramento(FOTO, COMPUTADOR, inicial, CELULAR);
    expect(herdado).toEqual(estadoInicial(CELULAR, FOTO));
  });

  it("a saída do celular é 9:20 e a do computador 4:3, com a conta de sempre", () => {
    const estado = estadoInicial(CELULAR, FOTO);
    const matriz = matrizDeSaida(CELULAR, FOTO, estado, CELULAR);
    // Os cantos da foto caem fora da saída (a foto cobre tudo).
    const canto = aplicar(matriz, 0, 0);
    expect(canto.x).toBeLessThanOrEqual(0);
    expect(canto.y).toBeLessThanOrEqual(0);
    const oposto = aplicar(matriz, FOTO.largura, FOTO.altura);
    expect(oposto.x).toBeGreaterThanOrEqual(CELULAR.largura - 1e-6);
    expect(oposto.y).toBeGreaterThanOrEqual(CELULAR.altura - 1e-6);
  });
});
