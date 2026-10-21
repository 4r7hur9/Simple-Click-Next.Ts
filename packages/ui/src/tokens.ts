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
  superficie: "#f5f7f4",
  superficieAlta: "#ffffff",
  tinta: "#0b0f0d",
  tintaSuave: "#4d5852",
  borda: "#a8b1ab",
  bordaForte: "#65706a",
  primaria: "#b7ff00",
  emPrimaria: "#0b0f0d",
  primariaSuave: "#e5ffb8",
  primariaTexto: "#3f7900",
  sucesso: "#136c3a",
  emSucesso: "#ffffff",
  sucessoSuave: "#e6f6ec",
  erro: "#b3251c",
  emErro: "#ffffff",
  erroSuave: "#fdeceb",
  atencao: "#8a5300",
  emAtencao: "#ffffff",
  atencaoSuave: "#fdf3e2",
  info: "#3f7900",
  infoSuave: "#e5ffb8",
  foco: "#4f8f00",
};

export const PALETA_ESCURA: PaletaDeCores = {
  fundo: "#0b0f0d",
  superficie: "#161c19",
  superficieAlta: "#202823",
  tinta: "#ffffff",
  tintaSuave: "#a8b1ab",
  borda: "#3d4742",
  bordaForte: "#7a857e",
  primaria: "#b7ff00",
  emPrimaria: "#0b0f0d",
  primariaSuave: "#293514",
  primariaTexto: "#b7ff00",
  sucesso: "#69d597",
  emSucesso: "#0d1015",
  sucessoSuave: "#12281c",
  erro: "#ff938c",
  emErro: "#0d1015",
  erroSuave: "#2d1615",
  atencao: "#f2be5c",
  emAtencao: "#0d1015",
  atencaoSuave: "#2a2110",
  info: "#b7ff00",
  infoSuave: "#293514",
  foco: "#b7ff00",
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

/**
 * Medidas da linguagem visual: curva, sombra e alvo de toque.
 *
 * Ficam espelhadas, como as cores, porque as peças dependem do NOME e o teste
 * precisa saber o VALOR: um raio que volta a ser 6px sem ninguém ver é a
 * reforma visual desfeita em silêncio.
 */
export const MEDIDAS = Object.freeze({
  raioBotao: "0.625rem",
  raioCartao: "1rem",
  raioJanela: "1.5rem",
  raioCompleto: "9999px",
  sombraLarga: "0 8px 24px rgb(11 15 13 / 8%)",
  alturaToque: "2.75rem",
  alturaToqueGrande: "3rem",
});

/** Nome no CSS de cada medida. */
export const NOME_NO_CSS_DAS_MEDIDAS: Readonly<
  Record<keyof typeof MEDIDAS, string>
> = {
  raioBotao: "--raio-botao",
  raioCartao: "--raio-cartao",
  raioJanela: "--raio-janela",
  raioCompleto: "--raio-completo",
  sombraLarga: "--sombra-larga",
  alturaToque: "--altura-toque",
  alturaToqueGrande: "--altura-toque-grande",
};

/** Valores cromáticos publicados no manual oficial, sem derivação semântica. */
export const PALETA_OFICIAL = Object.freeze({
  verdeClick: "#b7ff00",
  verdeDigital: "#72d900",
  mint: "#e5ffb8",
  grafite: "#161c19",
  cinzaUi: "#a8b1ab",
  nevoa: "#f5f7f4",
  branco: "#ffffff",
  pretoTecnologico: "#0b0f0d",
});

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
/**
 * A cor com que a landing NASCE, antes de a pessoa escolher outra.
 *
 * É a "Mata" da paleta abaixo, e não a primeira da lista. A landing já nasceu em
 * azul de sistema e depois em Brasa; ficou verde porque é a cor com que a página
 * quer ser lida — a mesma da marca de aprovado das listas e do gráfico que sobe.
 *
 * Sai daqui, e não de um valor escrito na folha de estilo, porque duas partes
 * precisam concordar sobre ela: o CSS, que pinta a página antes de qualquer
 * script, e a prévia, que precisa nascer com esta opção já marcada. Escritas
 * separadas divergem no primeiro dia em que alguém mudar uma delas.
 */
export const COR_INICIAL_DA_LANDING = "#0f6e5c";

export const PALETA_DE_LOJA: readonly CorDeLoja[] = Object.freeze([
  { nome: "Brasa", valor: "#b3261e" },
  { nome: "Laranja", valor: "#b3541e" },
  { nome: "Mata", valor: "#0f6e5c" },
  { nome: "Oceano", valor: "#1b3a6b" },
  { nome: "Uva", valor: "#5b2d82" },
  { nome: "Grafite", valor: "#2c3038" },
]);

// ---------------------------------------------------------------------------
// A cor de destaque da VITRINE (fundo sempre preto)
// ---------------------------------------------------------------------------

/** O fundo da vitrine: sempre preto, não é configurável. */
export const COR_DE_FUNDO_DA_LOJA = "#000000";

/** A cor de destaque de quem ainda não escolheu: o verde SimpleClick. */
export const COR_DE_DESTAQUE_PADRAO_DA_LOJA = PALETA_OFICIAL.verdeClick;

/**
 * As amostras que o seletor de cor sugere ao dono: cores que aparecem bem
 * sobre o preto. O seletor também aceita qualquer outra (quadro, matiz e
 * código), e a vitrine conserta o contraste das que não servem.
 */
export const AMOSTRAS_DE_DESTAQUE_DA_LOJA: readonly CorDeLoja[] = Object.freeze(
  [
    { nome: "Verde SimpleClick", valor: COR_DE_DESTAQUE_PADRAO_DA_LOJA },
    { nome: "Amarelo", valor: "#ffd60a" },
    { nome: "Laranja", valor: "#ff8a00" },
    { nome: "Vermelho", valor: "#ff4d4d" },
    { nome: "Rosa", valor: "#ff4fa3" },
    { nome: "Roxo", valor: "#a78bfa" },
    { nome: "Azul", valor: "#4da3ff" },
    { nome: "Turquesa", valor: "#2ee6c5" },
    { nome: "Verde", valor: "#3ddc84" },
    { nome: "Branco", valor: PALETA_OFICIAL.branco },
  ],
);
