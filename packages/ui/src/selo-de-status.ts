/**
 * O selo ABERTO/FECHADO sobre a capa da loja (card #64).
 *
 * O SELO TEM FUNDO PRÓPRIO. Sobre uma foto qualquer não há como garantir a
 * leitura de um ponto verde ou vermelho: a capa vermelho-escura apaga o ponto
 * de "fechado", a clara apaga o texto branco. Por isso o selo é uma pílula
 * sólida, clara ou escura, e o texto e o ponto são escolhidos para ela — o
 * contraste deles não depende da imagem.
 *
 * O que depende da imagem é a PÍLULA aparecer: no automático, ganha a variação
 * que mais contrasta com a cor dominante da capa (sem cor conhecida, a escura,
 * que é a do véu grafite das capas). No manual, a escolha é do dono, e a
 * avaliação diz quando a pílula se mistura com a capa.
 *
 * Verde é aberto e vermelho é fechado nas duas variações; o texto continua
 * dizendo ABERTO/FECHADO, para quem não distingue as cores.
 */
import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  emHex,
  lerCor,
  relacaoDeContraste,
  type Cor,
  type Rgb,
} from "./contraste";
import { PALETA_CLARA, PALETA_ESCURA } from "./tokens";

export const PREFERENCIAS_DO_SELO = ["AUTOMATICO", "CLARO", "ESCURO"] as const;
export type PreferenciaDoSelo = (typeof PREFERENCIAS_DO_SELO)[number];
export type VariacaoDoSelo = Exclude<PreferenciaDoSelo, "AUTOMATICO">;

export interface CoresDoSelo {
  readonly fundo: string;
  readonly texto: string;
  readonly pontoAberto: string;
  readonly pontoFechado: string;
}

/**
 * As duas variações, nas paletas do design system: a escura (preto
 * tecnológico, verde click e o vermelho claro de erro) e a clara (branco, o
 * verde e o vermelho de estado).
 */
export const CORES_DO_SELO: Readonly<Record<VariacaoDoSelo, CoresDoSelo>> = {
  ESCURO: {
    fundo: PALETA_ESCURA.fundo,
    texto: PALETA_ESCURA.tinta,
    pontoAberto: PALETA_ESCURA.primaria,
    pontoFechado: PALETA_ESCURA.erro,
  },
  CLARO: {
    fundo: PALETA_CLARA.fundo,
    texto: PALETA_CLARA.tinta,
    pontoAberto: PALETA_CLARA.sucesso,
    pontoFechado: PALETA_CLARA.erro,
  },
};

/** Lê a cor sem lançar: o que não é cor vira nulo. */
function corOuNulo(cor: Cor | null | undefined): Rgb | null {
  if (cor === null || cor === undefined) return null;
  if (typeof cor !== "string") return cor;
  try {
    return lerCor(cor);
  } catch {
    return null;
  }
}

/**
 * A cor puxa para o vermelho? Matiz perto de 0°/360° (inclui o vinho e o
 * rosa) e saturação que se note — um cinza quente não conta.
 */
export function ehAvermelhada(cor: Cor): boolean {
  const lida = corOuNulo(cor);
  if (lida === null) return false;
  const { vermelho: r, verde: g, azul: b } = lida;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const croma = max - min;
  if (max === 0 || croma / max < 0.25 || croma < 24 || max !== r) return false;
  // Matiz em graus, com o vermelho no 0.
  let matiz = (60 * (g - b)) / croma;
  if (matiz < 0) matiz += 360;
  return matiz <= 25 || matiz >= 320;
}

/**
 * A cor média de uma área da imagem (pixels RGBA, como os do `canvas`),
 * pesada pela opacidade: o transparente não puxa a média para o preto.
 * Sem nenhum pixel visível, nulo.
 */
export function corMedia(pixels: ArrayLike<number>): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let peso = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alfa = (pixels[i + 3] ?? 0) / 255;
    if (alfa === 0) continue;
    r += (pixels[i] ?? 0) * alfa;
    g += (pixels[i + 1] ?? 0) * alfa;
    b += (pixels[i + 2] ?? 0) * alfa;
    peso += alfa;
  }
  if (peso === 0) return null;
  return emHex({
    vermelho: Math.round(r / peso),
    verde: Math.round(g / peso),
    azul: Math.round(b / peso),
  });
}

/**
 * A variação do selo que vale na tela.
 *
 * Manual, vale a do dono. Automático, a que mais contrasta com a cor da capa;
 * sem cor conhecida, a escura. A pílula é sempre neutra (preta ou branca),
 * então o ponto de "fechado" nunca fica vermelho sobre vermelho.
 */
export function variacaoDoSelo(
  preferencia: PreferenciaDoSelo | null | undefined,
  corDoFundo: Cor | null | undefined,
): VariacaoDoSelo {
  if (preferencia === "CLARO" || preferencia === "ESCURO") return preferencia;
  const fundo = corOuNulo(corDoFundo);
  if (fundo === null) return "ESCURO";
  const comEscuro = relacaoDeContraste(CORES_DO_SELO.ESCURO.fundo, fundo);
  const comClaro = relacaoDeContraste(CORES_DO_SELO.CLARO.fundo, fundo);
  return comClaro > comEscuro ? "CLARO" : "ESCURO";
}

export interface AvaliacaoDoSelo {
  readonly variacao: VariacaoDoSelo;
  readonly cores: CoresDoSelo;
  /** Texto contra a pílula (mínimo 4,5). */
  readonly contrasteDoTexto: number;
  /** O pior dos dois pontos contra a pílula (mínimo 3). */
  readonly contrasteDoPonto: number;
  /** A pílula contra a cor da capa; nulo sem cor conhecida (mínimo 3). */
  readonly contrasteComOFundo: number | null;
  /** Texto e ponto passam no AA. */
  readonly legivel: boolean;
  /** A pílula se destaca da capa (ou a capa é desconhecida). */
  readonly destacada: boolean;
}

/** Avalia o selo para a preferência do dono e a cor da capa. */
export function avaliarSelo(
  preferencia: PreferenciaDoSelo | null | undefined,
  corDoFundo: Cor | null | undefined,
): AvaliacaoDoSelo {
  const variacao = variacaoDoSelo(preferencia, corDoFundo);
  const cores = CORES_DO_SELO[variacao];
  const contrasteDoTexto = relacaoDeContraste(cores.texto, cores.fundo);
  const contrasteDoPonto = Math.min(
    relacaoDeContraste(cores.pontoAberto, cores.fundo),
    relacaoDeContraste(cores.pontoFechado, cores.fundo),
  );
  const fundo = corOuNulo(corDoFundo);
  const contrasteComOFundo =
    fundo === null ? null : relacaoDeContraste(cores.fundo, fundo);
  return {
    variacao,
    cores,
    contrasteDoTexto,
    contrasteDoPonto,
    contrasteComOFundo,
    legivel:
      contrasteDoTexto >= CONTRASTE_MINIMO_TEXTO &&
      contrasteDoPonto >= CONTRASTE_MINIMO_GRAFICO,
    destacada:
      contrasteComOFundo === null ||
      contrasteComOFundo >= CONTRASTE_MINIMO_GRAFICO,
  };
}
