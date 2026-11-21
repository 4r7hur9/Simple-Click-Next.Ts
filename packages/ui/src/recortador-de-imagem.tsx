"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as EventoDeTeclado,
  type PointerEvent as EventoDePonteiro,
  type ReactNode,
} from "react";

import { Aviso } from "./aviso";
import { Botao } from "./botao";
import {
  IconeAfastar,
  IconeAproximar,
  IconeCentralizar,
  IconeDesfazer,
  IconeEspelhar,
  IconeFechar,
  IconeGirar,
} from "./icones";
import {
  LIMITE_DA_FOTO_ESCOLHIDA_EM_BYTES,
  QUALIDADES_DO_WEBP,
  TIPOS_DE_FOTO_PARA_RECORTAR,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  avaliarNitidez,
  centralizar,
  corMediaDosPixels,
  escalarEstado,
  espelhar,
  estadoInicial,
  estiloDaImagem,
  formatarMegabytes,
  girar,
  herdarEnquadramento,
  limitarZoom,
  manterDentro,
  matrizDeSaida,
  mover,
  mudarModo,
  mudarZoom,
  nomeDoArquivoRecortado,
  tipoDoArquivo,
  validarArquivoDeImagem,
  type EstadoDoRecorte,
  type ModoDoRecorte,
  type Tamanho,
} from "./recorte-geometria";
import { PALETA_OFICIAL } from "./tokens";

/**
 * Recortador de imagem (card #82): a janela que abre quando a pessoa escolhe
 * uma foto, mostra o ESPAÇO FINAL na proporção exata e deixa arrastar, aproximar,
 * girar, espelhar e escolher entre preencher e ajustar. Ao confirmar, desenha
 * a foto num canvas com as dimensões finais do espaço e entrega um arquivo
 * WebP já leve — pronto para o envio de sempre.
 *
 * TUDO É NATIVO: eventos de ponteiro (mouse, toque e caneta), pinça com dois
 * dedos, roda do mouse e `canvas`. Nenhuma biblioteca de recorte, nenhum
 * `backdrop-filter`: o fundo do "ajustar" é uma cor (a média da foto ou uma
 * escolhida), nunca um desfoque.
 *
 * A conta do enquadramento está em `recorte-geometria.ts`, em funções puras e
 * testadas; este arquivo só liga essas contas ao mouse, ao dedo e ao canvas.
 */

export type FormaDoEspaco = "retangulo" | "arredondado" | "redondo";

/** Um quadro "como vai aparecer": o mesmo recorte, visto no lugar onde será usado. */
export interface MiniaturaDoRecorte {
  readonly rotulo: string;
  /** Largura e altura do quadro (largura ÷ altura). */
  readonly proporcao: number;
  /** Largura do quadro na janela, em pixels. */
  readonly largura: number;
  readonly forma?: FormaDoEspaco | undefined;
  /** Mostra o véu escuro do topo da vitrine por cima. */
  readonly veu?: boolean | undefined;
  /** Onde a foto se ancora quando o quadro corta (a capa do celular fica à direita). */
  readonly alinhar?: "centro" | "direita" | undefined;
  /**
   * O que vai POR CIMA da foto no quadro: o texto, o logo e o selo do lugar
   * onde ela aparece (o cartão da vitrine, o topo do cardápio). Recebe o
   * tamanho do quadro, em pixels, para quem desenha escalar o resto.
   */
  readonly sobreposicao?:
    | ((quadro: {
        readonly largura: number;
        readonly altura: number;
      }) => ReactNode)
    | undefined;
}

/**
 * Uma das telas onde a mesma foto aparece com outra moldura (o computador e o
 * celular). Cada uma tem a sua saída, o seu enquadramento e a sua prévia.
 */
export interface VarianteDoRecorte {
  readonly id: string;
  /** "Computador", "Celular": o nome da aba. */
  readonly rotulo: string;
  /** Em que telas esta foto aparece, em uma frase. */
  readonly dica?: string | undefined;
  readonly largura: number;
  readonly altura: number;
  readonly minimo?: Tamanho | undefined;
  readonly miniaturas?: readonly MiniaturaDoRecorte[] | undefined;
}

/** O espaço onde a foto vai ficar: as medidas da saída e como mostrar a prévia. */
export interface EspacoDoRecorte {
  /** Nome do espaço, para o título: "Logo da loja". */
  readonly rotulo: string;
  /** Dimensões do arquivo final, em pixels. */
  readonly largura: number;
  readonly altura: number;
  /** O mínimo recomendado; abaixo dele a janela avisa que pode ficar borrado. */
  readonly minimo?: Tamanho | undefined;
  readonly forma?: FormaDoEspaco | undefined;
  readonly veu?: boolean | undefined;
  readonly miniaturas?: readonly MiniaturaDoRecorte[] | undefined;
  /** O modo de partida. Padrão: preencher. */
  readonly modoInicial?: ModoDoRecorte | undefined;
  /**
   * Quando a foto aparece com molduras diferentes (computador e celular), a
   * janela ganha uma aba por tela e gera UM arquivo para cada. A primeira é a
   * principal: o celular herda o ajuste dela até a pessoa mexer nele.
   */
  readonly variantes?: readonly VarianteDoRecorte[] | undefined;
}

export interface ArquivoDaVariante {
  readonly id: string;
  readonly arquivo: File;
  readonly largura: number;
  readonly altura: number;
}

export interface ResultadoDoRecorte {
  /** O arquivo da primeira variante (ou o único, sem abas). */
  readonly arquivo: File;
  /** O enquadramento escolhido, para reabrir o ajuste (ver `ajusteInicial`). */
  readonly ajuste: AjusteDoRecorte;
  /**
   * A foto ORIGINAL, sem corte, pronta para guardar (só com `guardarOriginal`):
   * a própria foto escolhida quando já é leve; senão, uma cópia reduzida a
   * 3000 px no lado maior, sem perda visível.
   */
  readonly original?: File | undefined;
  readonly largura: number;
  readonly altura: number;
  readonly modo: ModoDoRecorte;
  /** Um arquivo por aba, na ordem das variantes. Só existe com abas. */
  readonly variantes?: readonly ArquivoDaVariante[] | undefined;
}

export interface RecortadorDeImagemProps {
  /** A foto escolhida. `null` mantém a janela fechada. */
  readonly arquivo: File | null;
  readonly espaco: EspacoDoRecorte;
  /** Ex.: "Foto 2 de 5", quando várias fotos são recortadas em sequência. */
  readonly posicaoNaFila?:
    { readonly atual: number; readonly total: number } | undefined;
  /** Tipos que a janela abre. Padrão: JPG, PNG, WebP e HEIC. */
  readonly tiposAceitos?: readonly string[] | undefined;
  /** Limite da foto ESCOLHIDA (antes do recorte). Padrão: 25 MB. */
  readonly limiteDaFotoEmBytes?: number | undefined;
  /** Limite do arquivo FINAL; a qualidade desce até caber. */
  readonly limiteDaSaidaEmBytes?: number | undefined;
  readonly rotuloDeConfirmar?: string | undefined;
  /** Reabre com este enquadramento (a foto escolhida é o original guardado). */
  readonly ajusteInicial?: AjusteDoRecorte | undefined;
  /** Entrega também o original, para quem guarda o ajuste. */
  readonly guardarOriginal?: boolean | undefined;
  /**
   * Chamado com o arquivo pronto. Pode devolver (ou prometer) uma frase de erro,
   * e a janela continua aberta mostrando-a; sem retorno, quem abriu fecha.
   */
  readonly aoConfirmar: (
    resultado: ResultadoDoRecorte,
  ) => void | string | Promise<void | string>;
  readonly aoCancelar: () => void;
  /** Substitui a origem de todos os enquadramentos, sem confirmar o envio. */
  readonly aoTrocarArquivo?: ((arquivo: File) => void) | undefined;
}

/** O fundo das sobras no modo "ajustar". */
export type FundoDoRecorte =
  | { readonly tipo: "media" }
  | { readonly tipo: "preto" }
  | { readonly tipo: "branco" }
  | { readonly tipo: "transparente" }
  | { readonly tipo: "cor"; readonly cor: string };
type Fundo = FundoDoRecorte;

/**
 * Como a pessoa enquadrou a foto: o enquadramento de cada moldura (na medida
 * do arquivo de saída), se o celular segue o computador e o fundo das sobras.
 * É o que se guarda junto do ORIGINAL para reabrir o ajuste sem perda.
 */
export interface AjusteDoRecorte {
  readonly estados: Readonly<Record<string, EstadoDoRecorte>>;
  readonly iguais: boolean;
  readonly fundo: FundoDoRecorte;
}

const COR_PRETA = PALETA_OFICIAL.pretoTecnologico;
const COR_BRANCA = PALETA_OFICIAL.branco;
const COR_PADRAO_DO_FUNDO = PALETA_OFICIAL.grafite;
const PASSO_DA_SETA = 6;
const PASSO_DA_SETA_GRANDE = 24;
const PASSO_DO_ZOOM = 0.1;

function corDoFundo(fundo: Fundo, media: string): string | null {
  switch (fundo.tipo) {
    case "media":
      return media;
    case "preto":
      return COR_PRETA;
    case "branco":
      return COR_BRANCA;
    case "cor":
      return fundo.cor;
    case "transparente":
      return null;
  }
}

function dimensoes(tamanho: Tamanho): string {
  return `${String(Math.round(tamanho.largura))} × ${String(Math.round(tamanho.altura))} px`;
}

function paraBlob(
  tela: HTMLCanvasElement,
  tipo: string,
  qualidade: number,
): Promise<Blob | null> {
  return new Promise((resolver) => tela.toBlob(resolver, tipo, qualidade));
}

/** Desenha a foto na saída e comprime até caber no limite. */
async function gerarArquivo(opcoes: {
  readonly imagem: HTMLImageElement;
  readonly origem: Tamanho;
  readonly moldura: Tamanho;
  readonly estado: EstadoDoRecorte;
  readonly saida: Tamanho;
  readonly cor: string | null;
  readonly limiteEmBytes: number | undefined;
  readonly nomeOriginal: string;
}): Promise<File> {
  const { imagem, origem, moldura, estado, saida, cor } = opcoes;
  const tela = document.createElement("canvas");
  tela.width = saida.largura;
  tela.height = saida.altura;
  const contexto = tela.getContext("2d");
  if (contexto === null) throw new Error("sem-canvas");

  const desenhar = (preencherCom: string | null) => {
    contexto.setTransform(1, 0, 0, 1, 0, 0);
    contexto.clearRect(0, 0, saida.largura, saida.altura);
    if (preencherCom !== null) {
      contexto.fillStyle = preencherCom;
      contexto.fillRect(0, 0, saida.largura, saida.altura);
    }
    contexto.imageSmoothingEnabled = true;
    contexto.imageSmoothingQuality = "high";
    const [a, b, c, d, e, f] = matrizDeSaida(moldura, origem, estado, saida);
    contexto.setTransform(a, b, c, d, e, f);
    contexto.drawImage(imagem, 0, 0);
    contexto.setTransform(1, 0, 0, 1, 0, 0);
  };

  desenhar(cor);
  let tipo = "image/webp";
  let blob: Blob | null = null;
  for (const qualidade of QUALIDADES_DO_WEBP) {
    blob = await paraBlob(tela, tipo, qualidade);
    // Navegador sem codificador WebP devolve PNG: cai para JPEG (sem
    // transparência, então o fundo vira branco se a pessoa pediu "transparente").
    if (blob !== null && blob.type !== "image/webp" && tipo === "image/webp") {
      tipo = "image/jpeg";
      desenhar(cor ?? COR_BRANCA);
      blob = await paraBlob(tela, tipo, qualidade);
    }
    if (blob === null) break;
    if (
      opcoes.limiteEmBytes === undefined ||
      blob.size <= opcoes.limiteEmBytes
    ) {
      break;
    }
  }
  if (blob === null) throw new Error("sem-arquivo");
  if (opcoes.limiteEmBytes !== undefined && blob.size > opcoes.limiteEmBytes) {
    throw new Error(`pesado:${String(opcoes.limiteEmBytes)}`);
  }
  const extensao = blob.type === "image/jpeg" ? "jpg" : "webp";
  return new File(
    [blob],
    nomeDoArquivoRecortado(opcoes.nomeOriginal, extensao),
    {
      type: blob.type,
    },
  );
}

const LADO_MAXIMO_DO_ORIGINAL = 3000;
const PESO_MAXIMO_DO_ORIGINAL = 6 * 1024 * 1024 - 4096;
const TIPOS_SEGUROS_DO_ORIGINAL: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** O original que se guarda: o próprio arquivo, se leve; senão uma cópia reduzida. */
async function prepararOriginal(opcoes: {
  readonly imagem: HTMLImageElement;
  readonly origem: Tamanho;
  readonly arquivo: File;
}): Promise<File> {
  const { imagem, origem, arquivo } = opcoes;
  const maior = Math.max(origem.largura, origem.altura);
  if (
    TIPOS_SEGUROS_DO_ORIGINAL.includes(tipoDoArquivo(arquivo)) &&
    maior <= LADO_MAXIMO_DO_ORIGINAL &&
    arquivo.size <= PESO_MAXIMO_DO_ORIGINAL
  ) {
    return arquivo;
  }
  const fator = Math.min(1, LADO_MAXIMO_DO_ORIGINAL / maior);
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(origem.largura * fator));
  tela.height = Math.max(1, Math.round(origem.altura * fator));
  const contexto = tela.getContext("2d");
  if (contexto === null) throw new Error("sem-canvas");
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(imagem, 0, 0, tela.width, tela.height);
  for (const qualidade of [0.92, 0.85, 0.75, 0.6]) {
    const blob = await paraBlob(tela, "image/webp", qualidade);
    if (blob === null) break;
    if (blob.type === "image/webp" && blob.size <= PESO_MAXIMO_DO_ORIGINAL) {
      return new File([blob], nomeDoArquivoRecortado(arquivo.name, "webp"), {
        type: "image/webp",
      });
    }
  }
  // Sem WebP (ou ainda pesado): JPEG de boa qualidade.
  const blob = await paraBlob(tela, "image/jpeg", 0.85);
  if (blob === null) throw new Error("sem-arquivo");
  return new File([blob], nomeDoArquivoRecortado(arquivo.name, "jpg"), {
    type: "image/jpeg",
  });
}

/** A cor média da foto, lida de uma cópia minúscula dela. */
function lerCorMedia(imagem: HTMLImageElement): string {
  try {
    const tela = document.createElement("canvas");
    tela.width = 8;
    tela.height = 8;
    const contexto = tela.getContext("2d", { willReadFrequently: true });
    if (contexto === null) return COR_PADRAO_DO_FUNDO;
    contexto.drawImage(imagem, 0, 0, 8, 8);
    return corMediaDosPixels(contexto.getImageData(0, 0, 8, 8).data);
  } catch {
    return COR_PADRAO_DO_FUNDO;
  }
}

/**
 * Os enquadramentos guardados na medida da SAÍDA de cada variante (a moldura
 * é o próprio arquivo final), e por isso não dependem do tamanho da janela.
 */
type EstadosPorVariante = Readonly<Record<string, EstadoDoRecorte>>;

const medidasDaSaida = (variante: {
  readonly largura: number;
  readonly altura: number;
}): Tamanho => ({ largura: variante.largura, altura: variante.altura });

/**
 * O enquadramento de uma variante: o que a pessoa ajustou nela — ou, enquanto
 * ela usa "o mesmo ajuste do computador", o da primeira variante levado para
 * a moldura desta (mesmo ponto no centro, mesmo zoom).
 */
function estadoDaVariante(opcoes: {
  readonly variantes: readonly VarianteDoRecorte[];
  readonly estados: EstadosPorVariante | null;
  readonly iguais: boolean;
  readonly id: string;
  readonly origem: Tamanho;
}): EstadoDoRecorte | null {
  const { variantes, estados, iguais, id, origem } = opcoes;
  if (estados === null) return null;
  const primeira = variantes[0];
  const variante = variantes.find((candidata) => candidata.id === id);
  if (primeira === undefined || variante === undefined) return null;
  if (variante !== primeira && iguais) {
    const base = estados[primeira.id];
    return base === undefined
      ? null
      : herdarEnquadramento(
          origem,
          medidasDaSaida(primeira),
          base,
          medidasDaSaida(variante),
        );
  }
  return estados[id] ?? null;
}

const mesmoEnquadramento = (a: EstadoDoRecorte, b: EstadoDoRecorte): boolean =>
  a.modo === b.modo &&
  a.zoom === b.zoom &&
  a.giro === b.giro &&
  a.espelhado === b.espelhado &&
  Math.abs(a.x - b.x) < 1e-6 &&
  Math.abs(a.y - b.y) < 1e-6;

// ---------------------------------------------------------------------------
// O quadro "como vai aparecer"
// ---------------------------------------------------------------------------

function Miniatura({
  miniatura,
  moldura,
  origem,
  estado,
  src,
  cor,
}: {
  readonly miniatura: MiniaturaDoRecorte;
  readonly moldura: Tamanho;
  readonly origem: Tamanho;
  readonly estado: EstadoDoRecorte;
  readonly src: string;
  readonly cor: string | null;
}) {
  const largura = miniatura.largura;
  const altura = largura / miniatura.proporcao;
  // O quadro mostra a saída "cobrindo" ele, como o `object-fit: cover` do site.
  const fator = Math.max(largura / moldura.largura, altura / moldura.altura);
  const palco = {
    largura: moldura.largura * fator,
    altura: moldura.altura * fator,
  };
  const esquerda =
    miniatura.alinhar === "direita"
      ? largura - palco.largura
      : (largura - palco.largura) / 2;
  const topo = (altura - palco.altura) / 2;
  const forma = miniatura.forma ?? "retangulo";
  return (
    <figure className="sc-recortador__miniatura">
      <div
        className={`sc-recortador__quadro sc-recortador__quadro--${forma}`}
        style={{ width: largura, height: altura }}
        data-miniatura={miniatura.rotulo}
      >
        <div
          className={`sc-recortador__palco${cor === null ? " sc-recortador__xadrez" : ""}`}
          style={{
            width: palco.largura,
            height: palco.altura,
            left: esquerda,
            top: topo,
            ...(cor === null ? {} : { backgroundColor: cor }),
          }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            className="sc-recortador__foto"
            style={estiloDaImagem(moldura, origem, estado, fator)}
          />
        </div>
        {miniatura.veu === true ? (
          <span className="sc-recortador__veu" aria-hidden="true" />
        ) : null}
        {miniatura.sobreposicao === undefined ? null : (
          <div className="sc-recortador__sobre" aria-hidden="true">
            {miniatura.sobreposicao({ largura, altura })}
          </div>
        )}
      </div>
      <figcaption>{miniatura.rotulo}</figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// A janela
// ---------------------------------------------------------------------------

let contadorDeArquivos = 0;
const numeroDoArquivo = new WeakMap<File, number>();
function chaveDoArquivo(arquivo: File): number {
  let numero = numeroDoArquivo.get(arquivo);
  if (numero === undefined) {
    contadorDeArquivos += 1;
    numero = contadorDeArquivos;
    numeroDoArquivo.set(arquivo, numero);
  }
  return numero;
}

/** Janela de recorte. Fechada (`arquivo` nulo) não desenha nada. */
export function RecortadorDeImagem(props: RecortadorDeImagemProps) {
  if (props.arquivo === null) return null;
  return (
    <JanelaDoRecorte
      key={chaveDoArquivo(props.arquivo)}
      {...props}
      arquivo={props.arquivo}
    />
  );
}

type Carga =
  | { readonly fase: "lendo" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | {
      readonly fase: "pronta";
      readonly src: string;
      readonly origem: Tamanho;
    };

function JanelaDoRecorte({
  arquivo,
  espaco,
  posicaoNaFila,
  tiposAceitos = TIPOS_DE_FOTO_PARA_RECORTAR,
  limiteDaFotoEmBytes = LIMITE_DA_FOTO_ESCOLHIDA_EM_BYTES,
  limiteDaSaidaEmBytes,
  rotuloDeConfirmar = "Usar esta foto",
  ajusteInicial,
  guardarOriginal = false,
  aoConfirmar,
  aoCancelar,
  aoTrocarArquivo,
}: RecortadorDeImagemProps & { readonly arquivo: File }) {
  const id = useId();
  const janela = useRef<HTMLDialogElement>(null);
  const entradaDeFoto = useRef<HTMLInputElement>(null);
  const molduraNaTela = useRef<HTMLDivElement>(null);
  const imagemLida = useRef<HTMLImageElement | null>(null);

  // Sem abas há uma moldura só (a do espaço); com abas, uma por variante.
  const variantes = useMemo<readonly VarianteDoRecorte[]>(
    () =>
      espaco.variantes !== undefined && espaco.variantes.length > 0
        ? espaco.variantes
        : [
            {
              id: "unica",
              rotulo: "",
              largura: espaco.largura,
              altura: espaco.altura,
              minimo: espaco.minimo,
              miniaturas: espaco.miniaturas,
            },
          ],
    [espaco],
  );
  const temAbas = variantes.length > 1;
  const primeira = variantes[0] as VarianteDoRecorte;
  const [idAtivo, setIdAtivo] = useState(primeira.id);
  const ativa = variantes.find((v) => v.id === idAtivo) ?? primeira;
  const saida: Tamanho = useMemo(() => medidasDaSaida(ativa), [ativa]);
  const proporcao = saida.largura / saida.altura;

  const [carga, setCarga] = useState<Carga>(() => {
    const recusa = validarArquivoDeImagem(arquivo, {
      tipos: tiposAceitos,
      limiteEmBytes: limiteDaFotoEmBytes,
    });
    return recusa === null
      ? { fase: "lendo" }
      : { fase: "erro", mensagem: recusa };
  });
  const [larguraDaMoldura, setLarguraDaMoldura] = useState(320);
  const moldura: Tamanho = useMemo(
    () => ({ largura: larguraDaMoldura, altura: larguraDaMoldura / proporcao }),
    [larguraDaMoldura, proporcao],
  );
  const molduraAtual = useRef(moldura);
  molduraAtual.current = moldura;
  // Os enquadramentos ficam na medida da saída de cada variante (ver
  // `estadoDaVariante`); o da tela é o do arquivo, escalado para a moldura.
  const [estados, setEstados] = useState<EstadosPorVariante | null>(null);
  const [iguais, setIguais] = useState(ajusteInicial?.iguais ?? true);
  const estadosAtuais = useRef(estados);
  estadosAtuais.current = estados;
  const iguaisAtual = useRef(iguais);
  iguaisAtual.current = iguais;
  const idAtivoAtual = useRef(ativa.id);
  idAtivoAtual.current = ativa.id;
  const [fundo, setFundo] = useState<Fundo>(
    ajusteInicial?.fundo ?? { tipo: "media" },
  );
  const [corMedia, setCorMedia] = useState<string>(COR_PADRAO_DO_FUNDO);
  const [corEscolhida, setCorEscolhida] = useState<string>(
    ajusteInicial?.fundo.tipo === "cor" ? ajusteInicial.fundo.cor : COR_BRANCA,
  );
  const [gerando, setGerando] = useState(false);
  const [erroDaSaida, setErroDaSaida] = useState<string | null>(null);

  const origem = carga.fase === "pronta" ? carga.origem : null;
  const estadoDoArquivo =
    origem === null
      ? null
      : estadoDaVariante({ variantes, estados, iguais, id: ativa.id, origem });
  const estado =
    estadoDoArquivo === null
      ? null
      : escalarEstado(estadoDoArquivo, moldura.largura / saida.largura);

  // Abre como janela modal de verdade: o navegador prende o foco dentro dela,
  // escurece o resto e entrega o Esc como pedido de cancelamento.
  useEffect(() => {
    const elemento = janela.current;
    if (elemento === null || elemento.open) return;
    if (typeof elemento.showModal === "function") elemento.showModal();
    else elemento.setAttribute("open", "");
    return () => {
      if (elemento.open && typeof elemento.close === "function") {
        elemento.close();
      }
    };
  }, []);

  // Lê a foto escolhida.
  useEffect(() => {
    if (carga.fase === "erro") return;
    if (typeof URL.createObjectURL !== "function") {
      setCarga({
        fase: "erro",
        mensagem: "Este navegador não consegue abrir a foto.",
      });
      return;
    }
    let ativo = true;
    const src = URL.createObjectURL(arquivo);
    const imagem = new Image();
    imagem.onload = () => {
      if (!ativo) return;
      if (imagem.naturalWidth <= 0 || imagem.naturalHeight <= 0) {
        setCarga({
          fase: "erro",
          mensagem: "Essa foto não tem tamanho. Tente outra.",
        });
        return;
      }
      imagemLida.current = imagem;
      const tamanho = {
        largura: imagem.naturalWidth,
        altura: imagem.naturalHeight,
      };
      setCorMedia(lerCorMedia(imagem));
      setEstados(
        Object.fromEntries(
          variantes.map((variante) => {
            const medidas = medidasDaSaida(variante);
            const guardado = ajusteInicial?.estados[variante.id];
            // Reabrindo: parte do enquadramento guardado (preso ao que cobre a moldura).
            return [
              variante.id,
              guardado === undefined
                ? estadoInicial(
                    medidas,
                    tamanho,
                    espaco.modoInicial ?? "preencher",
                  )
                : manterDentro(medidas, tamanho, {
                    ...guardado,
                    zoom: limitarZoom(guardado.zoom),
                  }),
            ];
          }),
        ),
      );
      setCarga({ fase: "pronta", src, origem: tamanho });
    };
    imagem.onerror = () => {
      if (!ativo) return;
      setCarga({
        fase: "erro",
        mensagem:
          "Não consegui abrir essa foto. Se for HEIC, salve como JPG antes de enviar; senão, tente outra foto.",
      });
    };
    imagem.src = src;
    return () => {
      ativo = false;
      URL.revokeObjectURL(src);
    };
    // A leitura é por arquivo: o modo inicial só vale na abertura.
  }, [arquivo]);

  // Acompanha o tamanho da moldura (a janela muda com a tela) sem perder o enquadramento.
  useLayoutEffect(() => {
    const elemento = molduraNaTela.current;
    if (elemento === null) return;
    const medir = () => {
      const largura = elemento.clientWidth;
      if (largura <= 0) return;
      setLarguraDaMoldura((antes) =>
        Math.abs(antes - largura) < 0.5 ? antes : largura,
      );
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [proporcao, carga.fase]);

  /** Aplica uma mudança de enquadramento com a moldura e a foto de agora. */
  const alterar = useCallback(
    (
      mudanca: (
        estadoAtual: EstadoDoRecorte,
        moldura: Tamanho,
        origem: Tamanho,
      ) => EstadoDoRecorte,
    ) => {
      const tamanho = imagemLida.current;
      if (tamanho === null) return;
      const fotoAgora = {
        largura: tamanho.naturalWidth,
        altura: tamanho.naturalHeight,
      };
      const guardados = estadosAtuais.current;
      const variante = variantes.find((v) => v.id === idAtivoAtual.current);
      if (guardados === null || variante === undefined) return;
      const herdando = iguaisAtual.current;
      const base = estadoDaVariante({
        variantes,
        estados: guardados,
        iguais: herdando,
        id: variante.id,
        origem: fotoAgora,
      });
      if (base === null) return;
      const fator = molduraAtual.current.largura / variante.largura;
      const novo = escalarEstado(
        mudanca(escalarEstado(base, fator), molduraAtual.current, fotoAgora),
        1 / fator,
      );
      if (mesmoEnquadramento(novo, base)) return;
      const proximos = { ...guardados, [variante.id]: novo };
      estadosAtuais.current = proximos;
      setEstados(proximos);
      // Mexeu no celular: ele deixa de seguir o computador.
      if (variante !== variantes[0] && herdando) {
        iguaisAtual.current = false;
        setIguais(false);
      }
    },
    [variantes],
  );

  // Roda do mouse: aproxima em torno do cursor. Precisa ser um ouvinte NÃO
  // passivo para segurar a rolagem da página enquanto se aproxima.
  useEffect(() => {
    const elemento = molduraNaTela.current;
    if (elemento === null || carga.fase !== "pronta") return;
    const aoRolar = (evento: WheelEvent) => {
      evento.preventDefault();
      const caixa = elemento.getBoundingClientRect();
      const unidade = evento.deltaMode === 1 ? 16 : 1;
      const fator = Math.exp((-evento.deltaY * unidade) / 400);
      alterar((atual, quadro, foto) =>
        mudarZoom(quadro, foto, atual, atual.zoom * fator, {
          x: evento.clientX - caixa.left,
          y: evento.clientY - caixa.top,
        }),
      );
    };
    elemento.addEventListener("wheel", aoRolar, { passive: false });
    return () => elemento.removeEventListener("wheel", aoRolar);
  }, [carga.fase, alterar]);

  // Ponteiros: um dedo arrasta, dois dedos fazem a pinça (aproximar e arrastar juntos).
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const pinca = useRef<{ distancia: number; zoom: number } | null>(null);

  function distanciaEMeio() {
    const [a, b] = [...ponteiros.current.values()];
    if (a === undefined || b === undefined) return null;
    return {
      distancia: Math.hypot(a.x - b.x, a.y - b.y),
      meio: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  function aoPressionar(evento: EventoDePonteiro<HTMLDivElement>) {
    if (carga.fase !== "pronta" || estado === null) return;
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
    ponteiros.current.set(evento.pointerId, {
      x: evento.clientX,
      y: evento.clientY,
    });
    if (ponteiros.current.size === 2) {
      const medida = distanciaEMeio();
      pinca.current =
        medida === null
          ? null
          : { distancia: medida.distancia, zoom: estado.zoom };
    }
  }

  function aoArrastar(evento: EventoDePonteiro<HTMLDivElement>) {
    const anterior = ponteiros.current.get(evento.pointerId);
    if (anterior === undefined) return;
    const atual = { x: evento.clientX, y: evento.clientY };
    const meioAntes =
      ponteiros.current.size === 2 ? (distanciaEMeio()?.meio ?? null) : null;
    ponteiros.current.set(evento.pointerId, atual);

    if (ponteiros.current.size === 2 && pinca.current !== null) {
      const medida = distanciaEMeio();
      if (medida === null || medida.distancia <= 0) return;
      const caixa = evento.currentTarget.getBoundingClientRect();
      const base = pinca.current;
      const andou =
        meioAntes === null
          ? { x: 0, y: 0 }
          : { x: medida.meio.x - meioAntes.x, y: medida.meio.y - meioAntes.y };
      alterar((estadoAtual, quadro, foto) =>
        mover(
          quadro,
          foto,
          mudarZoom(
            quadro,
            foto,
            estadoAtual,
            base.zoom * (medida.distancia / base.distancia),
            { x: medida.meio.x - caixa.left, y: medida.meio.y - caixa.top },
          ),
          andou,
        ),
      );
      return;
    }
    if (ponteiros.current.size === 1) {
      const dx = atual.x - anterior.x;
      const dy = atual.y - anterior.y;
      alterar((estadoAtual, quadro, foto) =>
        mover(quadro, foto, estadoAtual, { x: dx, y: dy }),
      );
    }
  }

  function aoSoltar(evento: EventoDePonteiro<HTMLDivElement>) {
    ponteiros.current.delete(evento.pointerId);
    pinca.current = null;
  }

  function aoTeclar(evento: EventoDeTeclado<HTMLDivElement>) {
    if (carga.fase !== "pronta") return;
    const passo = evento.shiftKey ? PASSO_DA_SETA_GRANDE : PASSO_DA_SETA;
    const setas: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -passo, y: 0 },
      ArrowRight: { x: passo, y: 0 },
      ArrowUp: { x: 0, y: -passo },
      ArrowDown: { x: 0, y: passo },
    };
    const seta = setas[evento.key];
    if (seta !== undefined) {
      evento.preventDefault();
      alterar((atual, quadro, foto) => mover(quadro, foto, atual, seta));
      return;
    }
    if (evento.key === "+" || evento.key === "=") {
      evento.preventDefault();
      alterar((atual, quadro, foto) =>
        mudarZoom(quadro, foto, atual, atual.zoom + PASSO_DO_ZOOM),
      );
    } else if (evento.key === "-" || evento.key === "_") {
      evento.preventDefault();
      alterar((atual, quadro, foto) =>
        mudarZoom(quadro, foto, atual, atual.zoom - PASSO_DO_ZOOM),
      );
    }
  }

  async function confirmar() {
    const imagem = imagemLida.current;
    if (imagem === null || estado === null || origem === null || gerando)
      return;
    setGerando(true);
    setErroDaSaida(null);
    try {
      // Um arquivo por variante, cada um na medida da própria saída.
      const gerados: ArquivoDaVariante[] = [];
      for (const variante of variantes) {
        const doArquivo = estadoDaVariante({
          variantes,
          estados,
          iguais,
          id: variante.id,
          origem,
        });
        if (doArquivo === null) continue;
        const medidas = medidasDaSaida(variante);
        const feito = await gerarArquivo({
          imagem,
          origem,
          moldura: medidas,
          estado: doArquivo,
          saida: medidas,
          cor: corDoFundo(fundo, corMedia),
          limiteEmBytes: limiteDaSaidaEmBytes,
          nomeOriginal: temAbas
            ? `${variante.id}-${arquivo.name}`
            : arquivo.name,
        });
        gerados.push({
          id: variante.id,
          arquivo: feito,
          largura: variante.largura,
          altura: variante.altura,
        });
      }
      const principal = gerados[0];
      if (principal === undefined) throw new Error("sem-arquivo");
      const estadosFinais: Record<string, EstadoDoRecorte> = {};
      for (const variante of variantes) {
        const doArquivo = estadoDaVariante({
          variantes,
          estados,
          iguais,
          id: variante.id,
          origem,
        });
        if (doArquivo !== null) estadosFinais[variante.id] = doArquivo;
      }
      const original = guardarOriginal
        ? await prepararOriginal({ imagem, origem, arquivo })
        : undefined;
      const recusa = await aoConfirmar({
        arquivo: principal.arquivo,
        ajuste: { estados: estadosFinais, iguais, fundo },
        ...(original === undefined ? {} : { original }),
        largura: principal.largura,
        altura: principal.altura,
        modo:
          estadoDaVariante({
            variantes,
            estados,
            iguais,
            id: primeira.id,
            origem,
          })?.modo ?? estado.modo,
        ...(temAbas ? { variantes: gerados } : {}),
      });
      if (typeof recusa === "string") setErroDaSaida(recusa);
    } catch (erro) {
      const texto = erro instanceof Error ? erro.message : "";
      setErroDaSaida(
        texto.startsWith("pesado:")
          ? `Mesmo comprimida, a foto passa de ${formatarMegabytes(Number(texto.slice(7)))}. Escolha outra foto.`
          : "Não consegui preparar a foto agora. Tente de novo ou escolha outra.",
      );
    } finally {
      setGerando(false);
    }
  }

  const cancelar = () => {
    if (!gerando) aoCancelar();
  };

  const idDoTitulo = `${id}-titulo`;
  const idDaDescricao = `${id}-descricao`;
  const pronta = carga.fase === "pronta" && estado !== null && origem !== null;
  // A nitidez de CADA tela: a foto pode servir no computador e ficar pequena
  // demais para a moldura em pé do celular.
  const pequenasDemais: readonly VarianteDoRecorte[] =
    pronta && origem !== null
      ? variantes.filter((variante) => {
          const doArquivo = estadoDaVariante({
            variantes,
            estados,
            iguais,
            id: variante.id,
            origem,
          });
          return (
            doArquivo !== null &&
            avaliarNitidez(
              medidasDaSaida(variante),
              origem,
              doArquivo,
              medidasDaSaida(variante),
              variante.minimo?.largura,
            ).baixa
          );
        })
      : [];
  const cor = corDoFundo(fundo, corMedia);
  const forma = espaco.forma ?? "retangulo";
  const miniaturasDaTela = temAbas ? ativa.miniaturas : espaco.miniaturas;
  const estiloDaMoldura = { "--proporcao": String(proporcao) } as CSSProperties;
  const modo = estado?.modo ?? espaco.modoInicial ?? "preencher";

  return (
    <dialog
      ref={janela}
      id={id}
      className="sc-dialogo sc-recortador"
      aria-labelledby={idDoTitulo}
      aria-describedby={idDaDescricao}
      aria-modal="true"
      onCancel={(evento) => {
        evento.preventDefault();
        cancelar();
      }}
    >
      <div className="sc-dialogo__corpo sc-recortador__corpo">
        <div className="sc-dialogo__cabecalho">
          <div>
            <h2 className="sc-dialogo__titulo" id={idDoTitulo}>
              Ajustar a foto: {espaco.rotulo}
            </h2>
            <p className="sc-dialogo__descricao" id={idDaDescricao}>
              {posicaoNaFila === undefined
                ? ""
                : `Foto ${String(posicaoNaFila.atual)} de ${String(posicaoNaFila.total)}. `}
              Arraste para posicionar e aproxime com o zoom.{" "}
              {temAbas
                ? `A foto do ${ativa.rotulo.toLowerCase()} sai com `
                : "A foto sai com "}
              {dimensoes(saida)}.
            </p>
          </div>
          <button
            type="button"
            className="sc-dialogo__fechar"
            onClick={cancelar}
            disabled={gerando}
          >
            <IconeFechar />
            <span className="sc-so-leitor">Cancelar e fechar</span>
          </button>
        </div>

        {aoTrocarArquivo === undefined ? null : (
          <div className="sc-recortador__grupo">
            <Botao
              variante="secundaria"
              desabilitado={gerando}
              onClick={() => entradaDeFoto.current?.click()}
            >
              Escolher outra foto
            </Botao>
            <input
              ref={entradaDeFoto}
              type="file"
              hidden
              aria-label="Escolher outra foto"
              accept={tiposAceitos.join(",")}
              disabled={gerando}
              onChange={(evento) => {
                const nova = evento.currentTarget.files?.[0];
                evento.currentTarget.value = "";
                if (nova === undefined || gerando) return;
                const recusa = validarArquivoDeImagem(nova, {
                  tipos: tiposAceitos,
                  limiteEmBytes: limiteDaFotoEmBytes,
                });
                setErroDaSaida(recusa);
                if (recusa === null) aoTrocarArquivo(nova);
              }}
            />
          </div>
        )}
        {temAbas ? (
          <p className="sc-recortador__dica">
            Uma única foto para computador e celular. Adaptamos os dois
            enquadramentos automaticamente, sem esticar a imagem. Se quiser,
            ajuste cada tela nas abas abaixo.
          </p>
        ) : null}

        {temAbas && carga.fase !== "erro" ? (
          <div className="sc-recortador__abas-caixa">
            <div
              className="sc-recortador__abas"
              role="tablist"
              aria-label="Onde a foto aparece"
            >
              {variantes.map((variante) => (
                <button
                  key={variante.id}
                  type="button"
                  role="tab"
                  id={`${id}-aba-${variante.id}`}
                  aria-selected={variante.id === ativa.id}
                  aria-controls={`${id}-painel`}
                  className="sc-recortador__aba"
                  disabled={gerando}
                  onClick={() => setIdAtivo(variante.id)}
                >
                  {variante.rotulo}
                </button>
              ))}
            </div>
            {ativa.dica === undefined ? null : (
              <p className="sc-recortador__dica">{ativa.dica}</p>
            )}
            {ativa !== primeira ? (
              <label className="sc-recortador__igual">
                <input
                  type="checkbox"
                  checked={iguais}
                  disabled={!pronta || gerando}
                  onChange={(evento) => {
                    const marcado = evento.target.checked;
                    if (!marcado && origem !== null && estados !== null) {
                      // Desmarcar começa do que a pessoa está vendo agora.
                      const vendo = estadoDaVariante({
                        variantes,
                        estados,
                        iguais: true,
                        id: ativa.id,
                        origem,
                      });
                      if (vendo !== null) {
                        const proximos = { ...estados, [ativa.id]: vendo };
                        estadosAtuais.current = proximos;
                        setEstados(proximos);
                      }
                    }
                    iguaisAtual.current = marcado;
                    setIguais(marcado);
                  }}
                />
                <span>
                  Usar o mesmo ajuste do {primeira.rotulo.toLowerCase()}
                </span>
              </label>
            ) : null}
          </div>
        ) : null}

        {carga.fase === "erro" ? (
          <Aviso tom="erro">{carga.mensagem}</Aviso>
        ) : (
          <div
            className="sc-recortador__area"
            id={`${id}-painel`}
            role={temAbas ? "tabpanel" : undefined}
            aria-labelledby={temAbas ? `${id}-aba-${ativa.id}` : undefined}
          >
            <div className="sc-recortador__previa">
              <div
                ref={molduraNaTela}
                className={`sc-recortador__moldura sc-recortador__moldura--${forma}${
                  cor === null ? " sc-recortador__xadrez" : ""
                }`}
                style={{
                  ...estiloDaMoldura,
                  ...(cor === null ? {} : { backgroundColor: cor }),
                }}
                data-modo={modo}
                role="group"
                tabIndex={pronta ? 0 : -1}
                aria-label="Área da foto. Arraste para mover. Setas movem, mais e menos aproximam ou afastam."
                onPointerDown={aoPressionar}
                onPointerMove={aoArrastar}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                onKeyDown={aoTeclar}
              >
                {carga.fase === "pronta" && estado !== null ? (
                  <img
                    src={carga.src}
                    alt=""
                    draggable={false}
                    className="sc-recortador__foto"
                    style={estiloDaImagem(moldura, carga.origem, estado)}
                    data-foto-do-recorte=""
                  />
                ) : (
                  <p className="sc-recortador__lendo" role="status">
                    Abrindo a foto…
                  </p>
                )}
                {espaco.veu === true ? (
                  <span className="sc-recortador__veu" aria-hidden="true" />
                ) : null}
                <span className="sc-recortador__grade" aria-hidden="true" />
                {forma === "redondo" ? (
                  <span className="sc-recortador__guia" aria-hidden="true" />
                ) : null}
              </div>
              <p className="sc-recortador__medidas">
                Moldura {dimensoes(saida)} (
                {String(Math.round(proporcao * 100) / 100).replace(".", ",")}
                :1)
                {origem === null ? "" : ` · sua foto: ${dimensoes(origem)}`}
              </p>
            </div>

            <div className="sc-recortador__controles">
              <div className="sc-recortador__grupo">
                <span className="sc-recortador__rotulo" id={`${id}-modo`}>
                  Como encaixar
                </span>
                <div
                  className="sc-recortador__segmentos"
                  role="group"
                  aria-labelledby={`${id}-modo`}
                >
                  {(
                    [
                      [
                        "preencher",
                        "Preencher",
                        "Cobre tudo, sem barras. Corta o que sobra.",
                      ],
                      [
                        "ajustar",
                        "Ajustar",
                        "Mostra a foto inteira e preenche o resto.",
                      ],
                    ] as const
                  ).map(([valor, rotulo, dica]) => (
                    <button
                      key={valor}
                      type="button"
                      className="sc-recortador__segmento"
                      aria-pressed={modo === valor}
                      title={dica}
                      disabled={!pronta}
                      onClick={() =>
                        alterar((atual, quadro, foto) =>
                          mudarModo(quadro, foto, atual, valor),
                        )
                      }
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
                <p className="sc-recortador__dica">
                  {modo === "preencher"
                    ? "Preencher: a foto cobre o espaço todo, sem barras."
                    : "Ajustar: a foto aparece inteira; as sobras recebem o fundo escolhido."}
                </p>
              </div>

              <div className="sc-recortador__grupo">
                <label className="sc-recortador__rotulo" htmlFor={`${id}-zoom`}>
                  Zoom
                </label>
                <div className="sc-recortador__zoom">
                  <button
                    type="button"
                    className="sc-recortador__icone"
                    aria-label="Afastar"
                    disabled={!pronta}
                    onClick={() =>
                      alterar((atual, quadro, foto) =>
                        mudarZoom(
                          quadro,
                          foto,
                          atual,
                          atual.zoom - PASSO_DO_ZOOM * 2,
                        ),
                      )
                    }
                  >
                    <IconeAfastar size={18} />
                  </button>
                  <input
                    id={`${id}-zoom`}
                    type="range"
                    min={ZOOM_MINIMO}
                    max={ZOOM_MAXIMO}
                    step={0.01}
                    value={estado?.zoom ?? ZOOM_MINIMO}
                    disabled={!pronta}
                    aria-valuetext={`${String(Math.round((estado?.zoom ?? 1) * 100))}%`}
                    onChange={(evento) => {
                      const novo = Number(evento.target.value);
                      alterar((atual, quadro, foto) =>
                        mudarZoom(quadro, foto, atual, novo),
                      );
                    }}
                  />
                  <button
                    type="button"
                    className="sc-recortador__icone"
                    aria-label="Aproximar"
                    disabled={!pronta}
                    onClick={() =>
                      alterar((atual, quadro, foto) =>
                        mudarZoom(
                          quadro,
                          foto,
                          atual,
                          atual.zoom + PASSO_DO_ZOOM * 2,
                        ),
                      )
                    }
                  >
                    <IconeAproximar size={18} />
                  </button>
                </div>
              </div>

              <div className="sc-recortador__ferramentas">
                <button
                  type="button"
                  className="sc-recortador__ferramenta"
                  disabled={!pronta}
                  onClick={() =>
                    alterar((atual, quadro, foto) => girar(quadro, foto, atual))
                  }
                >
                  <IconeGirar size={18} /> Girar 90°
                </button>
                <button
                  type="button"
                  className="sc-recortador__ferramenta"
                  aria-pressed={estado?.espelhado === true}
                  disabled={!pronta}
                  onClick={() => alterar((atual) => espelhar(atual))}
                >
                  <IconeEspelhar size={18} /> Espelhar
                </button>
                <button
                  type="button"
                  className="sc-recortador__ferramenta"
                  disabled={!pronta}
                  onClick={() =>
                    alterar((atual, quadro, foto) =>
                      centralizar(quadro, foto, atual),
                    )
                  }
                >
                  <IconeCentralizar size={18} /> Centralizar
                </button>
                <button
                  type="button"
                  className="sc-recortador__ferramenta"
                  disabled={!pronta}
                  onClick={() =>
                    alterar((atual, quadro, foto) =>
                      estadoInicial(quadro, foto, atual.modo),
                    )
                  }
                >
                  <IconeDesfazer size={18} /> Redefinir
                </button>
              </div>

              {modo === "ajustar" ? (
                <div className="sc-recortador__grupo">
                  <span className="sc-recortador__rotulo" id={`${id}-fundo`}>
                    Fundo nas sobras
                  </span>
                  <div
                    className="sc-recortador__fundos"
                    role="group"
                    aria-labelledby={`${id}-fundo`}
                  >
                    {(
                      [
                        ["media", "Cor da foto"],
                        ["preto", "Preto"],
                        ["branco", "Branco"],
                        ["transparente", "Transparente"],
                      ] as const
                    ).map(([valor, rotulo]) => (
                      <button
                        key={valor}
                        type="button"
                        className="sc-recortador__segmento"
                        aria-pressed={fundo.tipo === valor}
                        onClick={() => setFundo({ tipo: valor })}
                      >
                        {rotulo}
                      </button>
                    ))}
                    <label className="sc-recortador__cor">
                      <input
                        type="color"
                        value={corEscolhida}
                        aria-label="Escolher outra cor de fundo"
                        onChange={(evento) => {
                          setCorEscolhida(evento.target.value);
                          setFundo({ tipo: "cor", cor: evento.target.value });
                        }}
                      />
                      <span aria-hidden="true">Outra cor</span>
                    </label>
                  </div>
                </div>
              ) : null}

              {pronta &&
              origem !== null &&
              estado !== null &&
              (miniaturasDaTela?.length ?? 0) > 0 ? (
                <div className="sc-recortador__grupo">
                  <span className="sc-recortador__rotulo">
                    Como vai aparecer
                  </span>
                  <div className="sc-recortador__miniaturas">
                    {miniaturasDaTela?.map((miniatura) => (
                      <Miniatura
                        key={miniatura.rotulo}
                        miniatura={miniatura}
                        moldura={moldura}
                        origem={origem}
                        estado={estado}
                        src={carga.fase === "pronta" ? carga.src : ""}
                        cor={cor}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {pequenasDemais.length > 0 ? (
          <Aviso tom="atencao" titulo="A foto é pequena para este espaço">
            {pequenasDemais.map((variante) => {
              const minimo = variante.minimo ?? medidasDaSaida(variante);
              return (
                <span key={variante.id} className="sc-recortador__pequena">
                  {temAbas ? `No ${variante.rotulo.toLowerCase()}: ela` : "Ela"}{" "}
                  pode ficar borrada. O ideal é ter pelo menos{" "}
                  {dimensoes(minimo)} na parte usada.{" "}
                </span>
              );
            })}
            Afaste o zoom ou escolha uma foto maior.
          </Aviso>
        ) : null}
        {erroDaSaida === null ? null : <Aviso tom="erro">{erroDaSaida}</Aviso>}

        <div className="sc-dialogo__rodape">
          <Botao
            variante="secundaria"
            onClick={cancelar}
            desabilitado={gerando}
          >
            Cancelar
          </Botao>
          <Botao
            onClick={() => void confirmar()}
            carregando={gerando}
            rotuloDeEspera="Preparando a foto…"
            desabilitado={!pronta}
          >
            {gerando ? "Preparando…" : rotuloDeConfirmar}
          </Botao>
        </div>
      </div>
    </dialog>
  );
}
