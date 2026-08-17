/**
 * Contraste de cor pela regra do WCAG 2.
 *
 * Mora isolado, sem React e sem CSS, porque é a única parte do design system
 * que decide legibilidade — e decisão de legibilidade precisa ser conferida por
 * cálculo, não por olho. A cor principal de cada loja é escolhida pelo dono, que
 * não tem obrigação nenhuma de saber o que é relação de luminância; é aqui que o
 * sistema descobre se o texto por cima dela ainda dá para ler (AC-015).
 */

/** Cor em componentes de 0 a 255, do jeito que o sRGB entrega. */
export type Rgb = {
  readonly vermelho: number;
  readonly verde: number;
  readonly azul: number;
};

/** Uma cor aceita tanto já decomposta quanto no texto que o dono digitou. */
export type Cor = string | Rgb;

/** Piso do WCAG 2 para texto de tamanho normal (nível AA). */
export const CONTRASTE_MINIMO_TEXTO = 4.5;

/** Piso do WCAG 2 para texto grande e para elemento gráfico, como borda e ícone. */
export const CONTRASTE_MINIMO_GRAFICO = 3;

const HEX_CURTO = /^#([\da-f])([\da-f])([\da-f])$/i;
const HEX_LONGO = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i;
const FUNCIONAL =
  /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})/i;

const limitar = (valor: number): number =>
  Math.min(255, Math.max(0, Math.round(valor)));

const doisDigitos = (valor: number): string =>
  limitar(valor).toString(16).padStart(2, "0");

/**
 * Interpreta a cor escrita em texto. Aceita `#rgb`, `#rrggbb` e `rgb(...)`,
 * que é o repertório que um campo de cor de navegador produz.
 *
 * Recusa o que não entende em vez de devolver preto: cor silenciosamente
 * trocada por preto passaria no cálculo de contraste e entregaria à loja uma
 * identidade visual que ela não escolheu.
 */
export function lerCor(texto: string): Rgb {
  const limpo = texto.trim();

  const curto = HEX_CURTO.exec(limpo);
  if (curto !== null) {
    const [, r = "0", g = "0", b = "0"] = curto;
    return {
      vermelho: Number.parseInt(r + r, 16),
      verde: Number.parseInt(g + g, 16),
      azul: Number.parseInt(b + b, 16),
    };
  }

  const longo = HEX_LONGO.exec(limpo);
  if (longo !== null) {
    const [, r = "00", g = "00", b = "00"] = longo;
    return {
      vermelho: Number.parseInt(r, 16),
      verde: Number.parseInt(g, 16),
      azul: Number.parseInt(b, 16),
    };
  }

  const funcional = FUNCIONAL.exec(limpo);
  if (funcional !== null) {
    const [, r = "0", g = "0", b = "0"] = funcional;
    return {
      vermelho: limitar(Number(r)),
      verde: limitar(Number(g)),
      azul: limitar(Number(b)),
    };
  }

  throw new Error(
    `Cor não reconhecida: "${texto}". Use #rgb, #rrggbb ou rgb(r, g, b).`,
  );
}

/** Escreve a cor no formato que o CSS entende. */
export function emHex(cor: Cor): string {
  const { vermelho, verde, azul } = normalizar(cor);
  return `#${doisDigitos(vermelho)}${doisDigitos(verde)}${doisDigitos(azul)}`;
}

const normalizar = (cor: Cor): Rgb =>
  typeof cor === "string" ? lerCor(cor) : cor;

/** Desfaz a correção de gama de um canal, que é o que o WCAG chama de linearizar. */
function canalLinear(valor: number): number {
  const proporcao = limitar(valor) / 255;
  return proporcao <= 0.03928
    ? proporcao / 12.92
    : ((proporcao + 0.055) / 1.055) ** 2.4;
}

/**
 * Luminância relativa da cor, entre 0 (preto) e 1 (branco).
 *
 * Os pesos não são arbitrários: o olho humano enxerga muito mais o verde do que
 * o azul, e é por isso que amarelo parece claro e azul-marinho parece escuro
 * mesmo com a mesma "quantidade" de cor.
 */
export function luminanciaRelativa(cor: Cor): number {
  const { vermelho, verde, azul } = normalizar(cor);
  return (
    0.2126 * canalLinear(vermelho) +
    0.7152 * canalLinear(verde) +
    0.0722 * canalLinear(azul)
  );
}

/**
 * Relação de contraste entre duas cores, de 1 (idênticas) a 21 (preto e branco).
 * A ordem dos argumentos não importa.
 */
export function relacaoDeContraste(primeira: Cor, segunda: Cor): number {
  const a = luminanciaRelativa(primeira);
  const b = luminanciaRelativa(segunda);
  const clara = Math.max(a, b);
  const escura = Math.min(a, b);
  return (clara + 0.05) / (escura + 0.05);
}

/** Verdadeiro quando o par serve para texto de tamanho normal. */
export const contrasteSuficienteParaTexto = (
  frente: Cor,
  fundo: Cor,
): boolean => relacaoDeContraste(frente, fundo) >= CONTRASTE_MINIMO_TEXTO;

export type EscolhaDeTexto = {
  /** A cor vencedora, em hexadecimal. */
  readonly cor: string;
  /** A relação de contraste que ela alcança sobre o fundo. */
  readonly relacao: number;
  /** Falso quando nem a melhor candidata chega ao piso do WCAG. */
  readonly suficiente: boolean;
};

/**
 * Escolhe a cor de texto sobre o fundo.
 *
 * A ordem das candidatas é a preferência do tema, e ela é respeitada: vence a
 * **primeira** que alcança o mínimo, não a de maior contraste. Escolher sempre
 * o maior contraste jogaria toda vitrine para preto ou branco puro, mesmo
 * quando a tinta do tema já servia — o design system perderia o próprio tom.
 *
 * Quando nenhuma alcança o mínimo, devolve a de maior contraste com
 * `suficiente: false`, para quem chamou decidir o que fazer.
 */
export function textoLegivelSobre(
  fundo: Cor,
  candidatas: readonly string[],
  minimo: number = CONTRASTE_MINIMO_TEXTO,
): EscolhaDeTexto {
  const primeira = candidatas[0];
  if (primeira === undefined) {
    throw new Error("É preciso oferecer ao menos uma cor de texto candidata.");
  }

  let escolhida = primeira;
  let melhor = relacaoDeContraste(primeira, fundo);

  for (const candidata of candidatas) {
    const relacao = relacaoDeContraste(candidata, fundo);
    if (relacao >= minimo) {
      return { cor: emHex(candidata), relacao, suficiente: true };
    }
    if (relacao > melhor) {
      escolhida = candidata;
      melhor = relacao;
    }
  }

  return { cor: emHex(escolhida), relacao: melhor, suficiente: false };
}

/** Mistura duas cores; `fator` 0 devolve a primeira e 1 devolve a segunda. */
export function misturar(primeira: Cor, segunda: Cor, fator: number): Rgb {
  const a = normalizar(primeira);
  const b = normalizar(segunda);
  const peso = Math.min(1, Math.max(0, fator));
  return {
    vermelho: limitar(a.vermelho + (b.vermelho - a.vermelho) * peso),
    verde: limitar(a.verde + (b.verde - a.verde) * peso),
    azul: limitar(a.azul + (b.azul - a.azul) * peso),
  };
}

export type Ajuste = {
  /** A cor final, em hexadecimal — igual à original quando nada foi preciso. */
  readonly cor: string;
  /** Relação de contraste alcançada pela cor final sobre o fundo. */
  readonly relacao: number;
  /** Verdadeiro quando a cor precisou ser alterada. */
  readonly ajustada: boolean;
};

const PASSOS_DA_BUSCA = 24;

/**
 * Aproxima a cor do extremo oposto ao fundo até ela alcançar o contraste
 * mínimo, e para no primeiro ponto que serve.
 *
 * O objetivo é mexer o menos possível: a cor da loja continua reconhecível,
 * apenas escura o bastante (ou clara o bastante) para o texto dela ser lido.
 * Por isso a busca é binária sobre a quantidade de mistura, e não um salto
 * direto para preto ou branco.
 */
export function ajustarParaContraste(
  cor: Cor,
  fundo: Cor,
  minimo: number = CONTRASTE_MINIMO_TEXTO,
): Ajuste {
  const relacaoOriginal = relacaoDeContraste(cor, fundo);
  if (relacaoOriginal >= minimo) {
    return { cor: emHex(cor), relacao: relacaoOriginal, ajustada: false };
  }

  // Fundo claro pede cor mais escura; fundo escuro pede cor mais clara.
  const extremo =
    luminanciaRelativa(fundo) > 0.1791
      ? { vermelho: 0, verde: 0, azul: 0 }
      : { vermelho: 255, verde: 255, azul: 255 };

  let piso = 0;
  let teto = 1;
  for (let passo = 0; passo < PASSOS_DA_BUSCA; passo += 1) {
    const meio = (piso + teto) / 2;
    if (relacaoDeContraste(misturar(cor, extremo, meio), fundo) >= minimo) {
      teto = meio;
    } else {
      piso = meio;
    }
  }

  const final = misturar(cor, extremo, teto);
  return {
    cor: emHex(final),
    relacao: relacaoDeContraste(final, fundo),
    ajustada: true,
  };
}
