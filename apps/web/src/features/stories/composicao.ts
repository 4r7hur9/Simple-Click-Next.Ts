/**
 * Composição do Story no canvas (card #84): junta a foto (ou o quadro do
 * vídeo), o desenho, os textos, os emojis e as etiquetas num só quadro de
 * 1080 x 1920 — a mesma geometria que a pessoa viu no editor.
 *
 * As funções recebem o contexto 2D de fora (e uma fábrica de canvas), o que
 * deixa a composição testável com um contexto de mentira que só anota o que
 * foi desenhado.
 */
import {
  ALTURA_DA_ETIQUETA,
  BRANCO,
  COR_DO_FUNDO_DO_PALCO,
  ALTURA_DA_LINHA,
  RAIO_DO_FUNDO,
  RECUO_DA_ETIQUETA,
  RECUO_DO_FUNDO,
  TAMANHO_DA_ETIQUETA,
  TAMANHO_DO_EMOJI,
  TAMANHO_DO_TEXTO,
  fonteDoTexto,
  tintaSobre,
  type Camada,
  type DocumentoDoStory,
  type Emoji,
  type Etiqueta,
  type FonteDoTexto,
  type Texto,
  type Traco,
} from "./documento.ts";
import {
  ALTURA_DO_PALCO,
  LARGURA_DO_PALCO,
  escalaBaseDaMidia,
  type Transformacao,
} from "./geometria.ts";

export type Contexto = CanvasRenderingContext2D;
export type Tela = HTMLCanvasElement;
export type CriarTela = (largura: number, altura: number) => Tela;

/** As famílias de fonte (já resolvidas, sem `var()`) de cada estilo de texto. */
export type FamiliasDoEditor = Readonly<Record<FonteDoTexto, string>>;

export const FAMILIA_DO_EMOJI =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export interface MidiaDesenhavel {
  readonly origem: CanvasImageSource;
  readonly largura: number;
  readonly altura: number;
}

export function criarTelaDoNavegador(largura: number, altura: number): Tela {
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  return tela;
}

function contextoDe(tela: Tela): Contexto {
  const contexto = tela.getContext("2d");
  if (contexto === null) throw new Error("Este navegador não consegue montar a imagem.");
  return contexto;
}

// ---------------------------------------------------------------------------
// Desenho (pincel e borracha)
// ---------------------------------------------------------------------------

export function desenharTraco(contexto: Contexto, traco: Traco): void {
  const [primeiro, ...resto] = traco.pontos;
  if (primeiro === undefined) return;
  contexto.save();
  contexto.globalCompositeOperation = traco.borracha
    ? "destination-out"
    : "source-over";
  contexto.lineCap = "round";
  contexto.lineJoin = "round";
  contexto.lineWidth = traco.espessura;
  contexto.strokeStyle = traco.cor;
  contexto.fillStyle = traco.cor;

  if (resto.length === 0) {
    contexto.beginPath();
    contexto.arc(primeiro.x, primeiro.y, traco.espessura / 2, 0, Math.PI * 2);
    contexto.fill();
    contexto.restore();
    return;
  }

  contexto.beginPath();
  contexto.moveTo(primeiro.x, primeiro.y);
  // Curvas pelos pontos médios deixam o risco liso, sem quinas.
  for (let i = 0; i < resto.length - 1; i += 1) {
    const atual = resto[i]!;
    const proximo = resto[i + 1]!;
    contexto.quadraticCurveTo(
      atual.x,
      atual.y,
      (atual.x + proximo.x) / 2,
      (atual.y + proximo.y) / 2,
    );
  }
  const ultimo = resto[resto.length - 1]!;
  contexto.lineTo(ultimo.x, ultimo.y);
  contexto.stroke();
  contexto.restore();
}

export function desenharTracos(
  contexto: Contexto,
  tracos: readonly Traco[],
): void {
  for (const traco of tracos) desenharTraco(contexto, traco);
}

// ---------------------------------------------------------------------------
// Camadas
// ---------------------------------------------------------------------------

interface Retangulo {
  readonly x: number;
  readonly y: number;
  readonly largura: number;
  readonly altura: number;
}

function caminhoArredondado(
  contexto: Contexto,
  { x, y, largura, altura }: Retangulo,
  raio: number,
): void {
  const r = Math.min(raio, largura / 2, altura / 2);
  contexto.beginPath();
  contexto.moveTo(x + r, y);
  contexto.arcTo(x + largura, y, x + largura, y + altura, r);
  contexto.arcTo(x + largura, y + altura, x, y + altura, r);
  contexto.arcTo(x, y + altura, x, y, r);
  contexto.arcTo(x, y, x + largura, y, r);
  contexto.closePath();
}

/** As linhas do texto: as quebras são as que a pessoa digitou, sem vazias nas pontas. */
export function linhasDoTexto(texto: string): string[] {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  while (linhas.length > 0 && linhas[0]!.trim() === "") linhas.shift();
  while (linhas.length > 0 && linhas[linhas.length - 1]!.trim() === "") {
    linhas.pop();
  }
  return linhas;
}

export function fonteDoCanvas(
  fonte: FonteDoTexto,
  tamanho: number,
  familias: FamiliasDoEditor,
): string {
  const estilo = fonteDoTexto(fonte);
  return `${estilo.italico ? "italic " : ""}${estilo.peso} ${tamanho}px ${familias[fonte]}`;
}

function desenharTexto(
  contexto: Contexto,
  texto: Texto,
  familias: FamiliasDoEditor,
): void {
  const linhas = linhasDoTexto(texto.texto);
  if (linhas.length === 0) return;
  contexto.font = fonteDoCanvas(texto.fonte, TAMANHO_DO_TEXTO, familias);
  contexto.textBaseline = "middle";
  contexto.textAlign = "left";
  const recuo = RECUO_DO_FUNDO * TAMANHO_DO_TEXTO;
  const alturaDaLinha = ALTURA_DA_LINHA * TAMANHO_DO_TEXTO;
  const larguras = linhas.map(
    (linha) => contexto.measureText(linha).width + recuo * 2,
  );
  const larguraDoBloco = Math.max(...larguras);
  const topo = -(linhas.length * alturaDaLinha) / 2;
  const tinta = texto.comFundo ? tintaSobre(texto.cor) : texto.cor;

  linhas.forEach((linha, i) => {
    const largura = larguras[i]!;
    const esquerda =
      texto.alinhamento === "esquerda"
        ? -larguraDoBloco / 2
        : texto.alinhamento === "direita"
          ? larguraDoBloco / 2 - largura
          : -largura / 2;
    const y = topo + i * alturaDaLinha;
    if (texto.comFundo && linha.trim() !== "") {
      contexto.fillStyle = texto.cor;
      caminhoArredondado(
        contexto,
        { x: esquerda, y, largura, altura: alturaDaLinha },
        RAIO_DO_FUNDO * TAMANHO_DO_TEXTO,
      );
      contexto.fill();
    }
    contexto.fillStyle = tinta;
    contexto.fillText(linha, esquerda + recuo, y + alturaDaLinha / 2);
  });
}

function desenharEmoji(contexto: Contexto, emoji: Emoji): void {
  contexto.font = `${TAMANHO_DO_EMOJI}px ${FAMILIA_DO_EMOJI}`;
  contexto.textAlign = "center";
  contexto.textBaseline = "middle";
  contexto.fillStyle = BRANCO;
  contexto.fillText(emoji.emoji, 0, 0);
}

function desenharEtiqueta(
  contexto: Contexto,
  etiqueta: Etiqueta,
  familias: FamiliasDoEditor,
): void {
  contexto.font = fonteDoCanvas("moderno", TAMANHO_DA_ETIQUETA, familias);
  contexto.textAlign = "center";
  contexto.textBaseline = "middle";
  const largura =
    contexto.measureText(etiqueta.texto).width +
    2 * RECUO_DA_ETIQUETA * TAMANHO_DA_ETIQUETA;
  const altura = ALTURA_DA_ETIQUETA * TAMANHO_DA_ETIQUETA;
  contexto.fillStyle = etiqueta.fundo;
  caminhoArredondado(
    contexto,
    { x: -largura / 2, y: -altura / 2, largura, altura },
    altura / 2,
  );
  contexto.fill();
  contexto.fillStyle = etiqueta.tinta;
  contexto.fillText(etiqueta.texto, 0, 0);
}

function aplicar(contexto: Contexto, t: Transformacao): void {
  contexto.translate(t.x, t.y);
  contexto.rotate(t.rotacao);
  contexto.scale(t.escala, t.escala);
}

export function desenharCamada(
  contexto: Contexto,
  camada: Camada,
  familias: FamiliasDoEditor,
): void {
  contexto.save();
  aplicar(contexto, camada.t);
  if (camada.tipo === "texto") desenharTexto(contexto, camada, familias);
  else if (camada.tipo === "emoji") desenharEmoji(contexto, camada);
  else desenharEtiqueta(contexto, camada, familias);
  contexto.restore();
}

// ---------------------------------------------------------------------------
// Quadro final
// ---------------------------------------------------------------------------

/**
 * Desenho + camadas, sobre fundo transparente. Fica numa tela à parte porque a
 * borracha só apaga o desenho (nunca a foto) e porque, no vídeo, isto é feito
 * UMA vez e colado em todos os quadros.
 */
export function renderizarSobreposicao(
  documento: DocumentoDoStory,
  familias: FamiliasDoEditor,
  criarTela: CriarTela = criarTelaDoNavegador,
): Tela {
  const tela = criarTela(LARGURA_DO_PALCO, ALTURA_DO_PALCO);
  const contexto = contextoDe(tela);
  desenharTracos(contexto, documento.tracos);
  for (const camada of documento.camadas) {
    desenharCamada(contexto, camada, familias);
  }
  return tela;
}

export function desenharMidia(
  contexto: Contexto,
  documento: DocumentoDoStory,
  midia: MidiaDesenhavel,
): void {
  const { fundo } = documento;
  const escala =
    escalaBaseDaMidia(midia.largura, midia.altura, fundo.modo) * fundo.t.escala;
  contexto.save();
  contexto.translate(fundo.t.x, fundo.t.y);
  contexto.rotate(fundo.t.rotacao);
  contexto.scale(escala, escala);
  contexto.drawImage(
    midia.origem,
    -midia.largura / 2,
    -midia.altura / 2,
    midia.largura,
    midia.altura,
  );
  contexto.restore();
}

/**
 * Um quadro completo no `contexto`, na escala pedida (1 = 1080 x 1920).
 * `sobreposicao` vem de `renderizarSobreposicao`.
 */
export function desenharQuadro(
  contexto: Contexto,
  documento: DocumentoDoStory,
  camadas: { readonly midia: MidiaDesenhavel; readonly sobreposicao: Tela },
  escala = 1,
): void {
  contexto.save();
  contexto.scale(escala, escala);
  contexto.fillStyle = COR_DO_FUNDO_DO_PALCO;
  contexto.fillRect(0, 0, LARGURA_DO_PALCO, ALTURA_DO_PALCO);
  desenharMidia(contexto, documento, camadas.midia);
  contexto.drawImage(camadas.sobreposicao, 0, 0, LARGURA_DO_PALCO, ALTURA_DO_PALCO);
  contexto.restore();
}

/** O Story de foto pronto, em 1080 x 1920. */
export function comporFoto(
  documento: DocumentoDoStory,
  midia: MidiaDesenhavel,
  familias: FamiliasDoEditor,
  criarTela: CriarTela = criarTelaDoNavegador,
): Tela {
  const sobreposicao = renderizarSobreposicao(documento, familias, criarTela);
  const tela = criarTela(LARGURA_DO_PALCO, ALTURA_DO_PALCO);
  desenharQuadro(contextoDe(tela), documento, { midia, sobreposicao });
  return tela;
}

/** WebP a ~0,85; se o navegador não sabe WebP, cai para JPEG. */
export async function exportarFoto(
  tela: Tela,
  qualidade = 0.85,
): Promise<Blob> {
  const gerar = (tipo: string) =>
    new Promise<Blob | null>((pronto) => tela.toBlob(pronto, tipo, qualidade));
  const webp = await gerar("image/webp");
  if (webp !== null && webp.type === "image/webp") return webp;
  const jpeg = await gerar("image/jpeg");
  if (jpeg !== null) return jpeg;
  throw new Error("Não foi possível gerar a imagem do story.");
}

/**
 * O vídeo precisa ser regravado (para levar texto, desenho e adesivos por
 * cima) quando a pessoa fez ALGUMA coisa; sem edição, o arquivo original sobe
 * como está, sem perder qualidade.
 */
export function precisaComporOVideo(
  documento: DocumentoDoStory,
  larguraDoVideo: number,
  alturaDoVideo: number,
): boolean {
  if (documento.tracos.length > 0 || documento.camadas.length > 0) return true;
  const { fundo } = documento;
  const padrao =
    fundo.t.x === LARGURA_DO_PALCO / 2 &&
    fundo.t.y === ALTURA_DO_PALCO / 2 &&
    fundo.t.escala === 1 &&
    fundo.t.rotacao === 0;
  if (!padrao) return true;
  // Em pé e do tamanho certo, o vídeo já ocupa o palco; deitado ou em outra
  // proporção, "preencher" corta e "ajustar" põe faixas — precisa regravar.
  const proporcaoDoPalco = LARGURA_DO_PALCO / ALTURA_DO_PALCO;
  const proporcao = larguraDoVideo / Math.max(1, alturaDoVideo);
  return Math.abs(proporcao - proporcaoDoPalco) > 0.02 && fundo.modo === "ajustar";
}
