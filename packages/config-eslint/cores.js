/**
 * Regra de qualidade que acusa cor escrita direto no componente (AC-014).
 *
 * O design system só serve para alguma coisa se ninguém puder contorná-lo. Sem
 * esta regra, a primeira tela com pressa escreve `#ff0000` no lugar de
 * `var(--cor-erro)`, a segunda copia da primeira, e seis meses depois trocar a
 * identidade visual vira uma caçada por hexadecimal espalhado — que foi
 * exatamente o que aconteceu no primeiro SimpleClick.
 *
 * O que a regra procura em TypeScript e TSX:
 *   - hexadecimal (`#fff`, `#ff0000`, `#ff0000cc`), inclusive dentro de classe
 *     utilitária arbitrária como `bg-[#ff0000]`;
 *   - função de cor do CSS (`rgb(`, `rgba(`, `hsl(`, `oklch(`, `color-mix(`…);
 *   - nome de cor do CSS (`red`, `white`…) quando aparece como valor de
 *     propriedade de cor, seja em objeto de estilo, seja em texto de CSS.
 *
 * O que ela deixa passar, de propósito:
 *   - `var(--cor-…)`, que é justamente o caminho certo;
 *   - `currentcolor`, `transparent` e `inherit`, que não são cor escolhida;
 *   - os arquivos declarados em `ARQUIVOS_DE_DECLARACAO`, onde a cor precisa
 *     existir por escrito porque eles **são** a declaração.
 */

/**
 * Onde a cor literal é o conteúdo, e não o desvio. As folhas de estilo do
 * design system também são declaração, mas não entram aqui porque não passam
 * por esta ferramenta — quem as guarda é a revisão da própria lista de valores.
 */
export const ARQUIVOS_DE_DECLARACAO = ["packages/ui/src/tokens.ts"];

/**
 * Hexadecimal em posição de cor. O contexto importa: `#1042` num título de
 * pedido é número, não cor, e uma regra que acusa isso vira ruído que a
 * primeira pessoa com pressa desliga. Contam como posição de cor:
 *   - o texto inteiro (`"#ff0000"`);
 *   - depois de `[`, que é a classe utilitária arbitrária (`bg-[#ff0000]`);
 *   - depois de `:`, que é declaração de CSS (`color: #fff`);
 *   - depois de `(` ou `,`, que é argumento de função de cor.
 */
const HEXADECIMAL_SOZINHO = /^\s*#[\da-f]{3,8}\s*$/i;
const HEXADECIMAL_EM_POSICAO_DE_COR = /[[:(,]\s*(#[\da-f]{3,8})\b/i;

/**
 * Função de cor do CSS. Exige que o primeiro argumento comece com número, para
 * não confundir com a documentação que **descreve** o formato — `rgb(r, g, b)`
 * numa mensagem de erro não é cor nenhuma.
 */
const FUNCAO_DE_COR = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(\s*[\d.]/i;

/** `color-mix` não começa por número: o primeiro argumento é o espaço de cor. */
const MISTURA_DE_COR = /\bcolor-mix\s*\(\s*in\b/i;

/**
 * Nomes de cor do CSS que aparecem de verdade em código de produto. A lista
 * completa tem 148 nomes; cobrir os exóticos custaria falso positivo em texto
 * comum ("salmon" é peixe antes de ser cor).
 */
const NOMES_DE_COR = new Set([
  "aqua",
  "beige",
  "black",
  "blue",
  "brown",
  "crimson",
  "cyan",
  "fuchsia",
  "gold",
  "gray",
  "green",
  "grey",
  "indigo",
  "lime",
  "magenta",
  "maroon",
  "navy",
  "olive",
  "orange",
  "pink",
  "purple",
  "red",
  "silver",
  "teal",
  "violet",
  "white",
  "yellow",
]);

/** Propriedades de estilo cujo valor é uma cor. */
const PROPRIEDADES_DE_COR = new Set([
  "color",
  "background",
  "backgroundColor",
  "background-color",
  "borderColor",
  "border-color",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "outline-color",
  "caretColor",
  "caret-color",
  "textDecorationColor",
  "text-decoration-color",
  "fill",
  "stroke",
  "accentColor",
  "accent-color",
  "boxShadow",
  "box-shadow",
  "textShadow",
  "text-shadow",
]);

/** Declaração de CSS escrita dentro de texto: `color: red`, `background:#eee`. */
const DECLARACAO_EM_TEXTO = new RegExp(
  `(?:^|[;{\\s])(${[...PROPRIEDADES_DE_COR].join("|")})\\s*:\\s*([\\w#(]+)`,
  "i",
);

const MENSAGEM =
  "AC-014: cor escrita direto no componente ({{ trecho }}). Use um valor declarado do tema — var(--cor-…) de packages/ui/styles/theme.css.";

/** Diz se o texto carrega uma cor escrita à mão, e qual trecho a denuncia. */
export function corLiteralEm(texto, { propriedade } = {}) {
  if (HEXADECIMAL_SOZINHO.test(texto)) return texto.trim();

  const emPosicao = HEXADECIMAL_EM_POSICAO_DE_COR.exec(texto);
  if (emPosicao !== null) return emPosicao[1];

  const funcao = FUNCAO_DE_COR.exec(texto);
  if (funcao !== null) return `${funcao[0].split("(")[0].trim()}(`;

  const mistura = MISTURA_DE_COR.exec(texto);
  if (mistura !== null) return "color-mix(";

  if (propriedade !== undefined && PROPRIEDADES_DE_COR.has(propriedade)) {
    const nome = texto.trim().toLowerCase();
    if (NOMES_DE_COR.has(nome)) return nome;
  }

  const declaracao = DECLARACAO_EM_TEXTO.exec(texto);
  if (declaracao !== null) {
    const valor = (declaracao[2] ?? "").toLowerCase();
    if (NOMES_DE_COR.has(valor)) return `${declaracao[1]}: ${valor}`;
  }

  return null;
}

/** Nome da propriedade quando o nó é o valor de uma propriedade de objeto. */
function propriedadeDoValor(no) {
  const pai = no.parent;
  if (pai === undefined || pai === null) return undefined;
  if (pai.type !== "Property" || pai.value !== no) return undefined;

  const chave = pai.key;
  if (chave.type === "Identifier") return chave.name;
  if (chave.type === "Literal" && typeof chave.value === "string") {
    return chave.value;
  }
  return undefined;
}

/** @type {import("eslint").Rule.RuleModule} */
export const semCorLiteral = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Proíbe cor escrita à mão em componente; a cor vem de valor declarado no tema.",
    },
    schema: [],
    messages: { corLiteral: MENSAGEM },
  },
  create(context) {
    const acusar = (no, texto, propriedade) => {
      const trecho = corLiteralEm(texto, { propriedade });
      if (trecho === null) return;
      context.report({ node: no, messageId: "corLiteral", data: { trecho } });
    };

    return {
      Literal(no) {
        if (typeof no.value !== "string") return;
        acusar(no, no.value, propriedadeDoValor(no));
      },
      TemplateElement(no) {
        acusar(no, no.value.raw, undefined);
      },
    };
  },
};

/** O plugin, no formato que a configuração plana do ESLint espera. */
export const pluginCores = {
  meta: { name: "cores", version: "1.0.0" },
  rules: { "sem-cor-literal": semCorLiteral },
};

/** Configuração pronta para compor: a regra ligada onde ela precisa valer. */
export function configCores() {
  return [
    {
      files: ["apps/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
      plugins: { cores: pluginCores },
      rules: { "cores/sem-cor-literal": "error" },
    },
    {
      files: ARQUIVOS_DE_DECLARACAO,
      rules: { "cores/sem-cor-literal": "off" },
    },
  ];
}
