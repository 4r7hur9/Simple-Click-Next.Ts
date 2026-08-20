/**
 * Espelho em TypeScript dos valores de cor declarados em `styles/theme.css`.
 *
 * Este é o **único** arquivo do design system autorizado a escrever cor em
 * literal, e por isso está aberto na exceção da regra `cores/sem-cor-literal`.
 * A exceção existe porque o cálculo de contraste da cor da loja (AC-015)
 * acontece no servidor, antes de existir navegador para resolver `var(--…)`:
 * sem os valores em mão, não há como decidir a cor do texto.
 *
 * O par com o CSS é conferido por `tests/tokens.test.ts` — se alguém mudar um
 * lado e esquecer o outro, o teste reprova. Sem essa amarra, o espelho vira
 * mentira silenciosa e a decisão de contraste passa a ser tomada sobre cores
 * que ninguém vê na tela.
 */

/** Cores de um tema completo, na mesma ordem em que aparecem no CSS. */
export type PaletaDeCores = {
  readonly fundo: string;
  readonly superficie: string;
  readonly superficieAlta: string;
  readonly tinta: string;
  readonly tintaSuave: string;
  readonly borda: string;
  readonly bordaForte: string;
  readonly primaria: string;
  readonly emPrimaria: string;
  readonly primariaSuave: string;
  readonly primariaTexto: string;
  readonly sucesso: string;
  readonly emSucesso: string;
  readonly sucessoSuave: string;
  readonly erro: string;
  readonly emErro: string;
  readonly erroSuave: string;
  readonly atencao: string;
  readonly emAtencao: string;
  readonly atencaoSuave: string;
  readonly info: string;
  readonly infoSuave: string;
  readonly foco: string;
};

/** Nome do valor declarado no CSS para cada chave da paleta. */
export const NOME_NO_CSS: Readonly<Record<keyof PaletaDeCores, string>> = {
  fundo: "--cor-fundo",
  superficie: "--cor-superficie",
  superficieAlta: "--cor-superficie-alta",
  tinta: "--cor-tinta",
  tintaSuave: "--cor-tinta-suave",
  borda: "--cor-borda",
  bordaForte: "--cor-borda-forte",
  primaria: "--cor-primaria",
  emPrimaria: "--cor-em-primaria",
  primariaSuave: "--cor-primaria-suave",
  primariaTexto: "--cor-primaria-texto",
  sucesso: "--cor-sucesso",
  emSucesso: "--cor-em-sucesso",
  sucessoSuave: "--cor-sucesso-suave",
  erro: "--cor-erro",
  emErro: "--cor-em-erro",
  erroSuave: "--cor-erro-suave",
  atencao: "--cor-atencao",
  emAtencao: "--cor-em-atencao",
  atencaoSuave: "--cor-atencao-suave",
  info: "--cor-info",
  infoSuave: "--cor-info-suave",
  foco: "--cor-foco",
};

export const PALETA_CLARA: PaletaDeCores = {
  fundo: "#ffffff",
  superficie: "#f5f6f8",
  superficieAlta: "#ffffff",
  tinta: "#14171c",
  tintaSuave: "#565c66",
  borda: "#d3d7de",
  bordaForte: "#7d838c",
  primaria: "#1a4fd6",
  emPrimaria: "#ffffff",
  primariaSuave: "#e9eefc",
  primariaTexto: "#1a4fd6",
  sucesso: "#136c3a",
  emSucesso: "#ffffff",
  sucessoSuave: "#e6f6ec",
  erro: "#b3251c",
  emErro: "#ffffff",
  erroSuave: "#fdeceb",
  atencao: "#8a5300",
  emAtencao: "#ffffff",
  atencaoSuave: "#fdf3e2",
  info: "#1a4fd6",
  infoSuave: "#e9eefc",
  foco: "#1a4fd6",
};

export const PALETA_ESCURA: PaletaDeCores = {
  fundo: "#0d1015",
  superficie: "#161a21",
  superficieAlta: "#1d222b",
  tinta: "#eef1f5",
  tintaSuave: "#a4adba",
  borda: "#2e3641",
  bordaForte: "#6b7380",
  primaria: "#8ab4ff",
  emPrimaria: "#0d1015",
  primariaSuave: "#141d2e",
  primariaTexto: "#8ab4ff",
  sucesso: "#69d597",
  emSucesso: "#0d1015",
  sucessoSuave: "#12281c",
  erro: "#ff938c",
  emErro: "#0d1015",
  erroSuave: "#2d1615",
  atencao: "#f2be5c",
  emAtencao: "#0d1015",
  atencaoSuave: "#2a2110",
  info: "#8ab4ff",
  infoSuave: "#141d2e",
  foco: "#8ab4ff",
};

/**
 * Tintas de último recurso, iguais nos dois temas porque são os extremos
 * absolutos do sRGB.
 *
 * Existem para uma situação específica: a loja escolhe um tom no meio da escala
 * — nem claro, nem escuro — em que nem a tinta clara nem a escura do tema
 * alcançam 4,5:1. Aí só o branco puro ou o preto puro resolvem, e um deles
 * sempre resolve (o pior caso da escala fica em 4,58:1). É o que garante que
 * nenhuma cor escolhida pelo dono deixe o botão da vitrine ilegível.
 */
export const TINTAS_EXTREMAS = {
  clara: "#ffffff",
  escura: "#000000",
} as const;

/** Nome no CSS de cada tinta de último recurso. */
export const NOME_NO_CSS_DAS_EXTREMAS = {
  clara: "--cor-tinta-extrema-clara",
  escura: "--cor-tinta-extrema-escura",
} as const;

export const PALETAS = {
  claro: PALETA_CLARA,
  escuro: PALETA_ESCURA,
} as const;

export type NomeDoTema = keyof typeof PALETAS;

// ---------------------------------------------------------------------------
// A paleta que o DONO DA LOJA escolhe
// ---------------------------------------------------------------------------

/**
 * Uma cor oferecida ao dono, com nome de coisa.
 *
 * O nome importa tanto quanto o valor: "índigo" e "#1b3a6b" não dizem nada a
 * quem vende pastel, e a pessoa acaba escolhendo pela amostra sem saber o que
 * escolheu — o que fica ruim na hora de pedir ajuda por telefone.
 */
export interface CorDeLoja {
  readonly nome: string;
  readonly valor: string;
}

/**
 * As cores que uma loja pode escolher.
 *
 * LISTA CURTA, e não seletor livre. Duas razões: escolher entre seis é decisão
 * de dois segundos, e escolher num círculo de cores é uma tarefa — a pessoa veio
 * vender, não fazer identidade visual. E toda cor daqui já foi conferida contra
 * o ajuste de contraste, então nenhuma escolha produz uma loja ilegível.
 *
 * Mora neste arquivo porque é DECLARAÇÃO de cor, e é o único lugar do projeto
 * onde a regra do ESLint permite escrever uma (AC-014). A prévia da landing e a
 * tela de configuração do dono leem a mesma lista — duas cópias ofereceriam
 * cores diferentes no mesmo produto.
 */
export const PALETA_DE_LOJA: readonly CorDeLoja[] = Object.freeze([
  { nome: "Brasa", valor: "#b3261e" },
  { nome: "Laranja", valor: "#b3541e" },
  { nome: "Mata", valor: "#0f6e5c" },
  { nome: "Oceano", valor: "#1b3a6b" },
  { nome: "Uva", valor: "#5b2d82" },
  { nome: "Grafite", valor: "#2c3038" },
]);
