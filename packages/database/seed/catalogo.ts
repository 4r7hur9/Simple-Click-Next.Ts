/**
 * O catálogo do cenário de exemplo (AC-036).
 *
 * Este arquivo é onde a diferença entre os dois ramos deixa de ser rótulo e
 * vira dado. Quatro coisas que a carga precisa demonstrar moram aqui:
 *
 * 1. **Especificação pertence à CATEGORIA, não ao ramo.** É o ajuste de
 *    17/08/2026 que tem precedência sobre o desenho original. Por isso cada
 *    definição de atributo do cenário nasce presa a uma categoria criada pela
 *    dona da loja — "gramatura" existe em Camisetas, não em "roupas em geral".
 * 2. **Preço é entidade, nunca coluna.** Cada produto tem mais de um preço
 *    NOMEADO — balcão, promoção, atacado, custo —, pendurado na variante. É o
 *    que permite ao dono chamar de "Dúzia" o que o sistema trata como faixa.
 * 3. **Grupo de opção é UM mecanismo para dois problemas.** O mesmo desenho
 *    atende ingrediente de pastel e grade de camiseta; o que muda é `kind` e
 *    `is_variant_axis`. O cenário traz os dois lados para que ninguém precise
 *    acreditar na promessa.
 * 4. **Estoque só onde a unidade é contável.** As variantes da pastelaria têm
 *    quantidade nula (não controla); as da loja de roupa têm número — inclusive
 *    um tamanho ZERADO, porque "M acabou e P continua à venda" é o caso que
 *    justifica o estoque morar na variante e não no produto.
 *
 * Todo valor monetário é inteiro em centavos (P-005).
 */

import {
  type ConjuntoDeExemplo,
  idDeExemplo,
  instanteDeExemplo,
  json,
  type LinhaDeExemplo,
} from "./deterministico.ts";
import { type LojaDeExemplo, LOJAS, MODA, PASTELARIA } from "./lojas.ts";

// ---------------------------------------------------------------------------
// Descrição do catálogo
// ---------------------------------------------------------------------------

/** Uma especificação criada pela dona dentro de uma categoria. */
export interface EspecificacaoDeExemplo {
  readonly chave: string;
  readonly rotulo: string;
  readonly tipo: "TEXT" | "NUMBER" | "BOOLEAN" | "ENUM";
  readonly unidade: string | null;
  readonly opcoes: readonly string[] | null;
  readonly filtravel: boolean;
}

/** Uma categoria da loja, com as especificações que ela própria define. */
export interface CategoriaDeExemplo {
  readonly chave: string;
  readonly nome: string;
  readonly slug: string;
  readonly descricao: string;
  readonly especificacoes: readonly EspecificacaoDeExemplo[];
}

/** Um valor de especificação preenchido num produto. */
export interface ValorDeEspecificacao {
  readonly especificacao: string;
  readonly texto?: string;
  readonly numero?: number;
  readonly booleano?: boolean;
}

/** Um item dentro de um grupo de opção. */
export interface OpcaoDeExemplo {
  readonly chave: string;
  readonly nome: string;
  readonly acrescimoCents: number;
  readonly marcadaPorPadrao: boolean;
  readonly disponivel: boolean;
}

/** Um grupo de opção: ingrediente, adicional ou eixo de variação. */
export interface GrupoDeOpcaoDeExemplo {
  readonly chave: string;
  readonly nome: string;
  readonly kind: "INGREDIENT" | "ADDON" | "VARIATION" | "SPEC";
  /** Verdadeiro quando a escolha resolve uma variante com estoque próprio. */
  readonly eixoDeVariacao: boolean;
  readonly minimo: number;
  readonly maximo: number | null;
  readonly opcoes: readonly OpcaoDeExemplo[];
}

/** Um preço nomeado de uma variante. */
export interface PrecoDeExemplo {
  readonly kind: "BASE" | "PROMO" | "WHOLESALE" | "COST";
  /** O nome que o DONO deu ao preço — é ele que aparece na vitrine. */
  readonly rotulo: string;
  readonly valorCents: number;
  readonly quantidadeMinima: number;
}

/** Uma unidade vendável: é ela que tem código, estoque e preço. */
export interface VarianteDeExemplo {
  readonly chave: string;
  readonly nome: string;
  readonly sku: string | null;
  readonly padrao: boolean;
  /** Nulo quando a loja não controla estoque. */
  readonly estoque: number | null;
  readonly disponivel: boolean;
  /** Grupo → opção, para as variantes que nascem de eixos de variação. */
  readonly combinacao: readonly (readonly [string, string])[];
  readonly precos: readonly PrecoDeExemplo[];
}

/** Um produto do cenário. */
export interface ProdutoDeExemplo {
  readonly loja: LojaDeExemplo;
  readonly chave: string;
  readonly nome: string;
  readonly slug: string;
  readonly descricao: string;
  readonly resumo: string;
  readonly categoria: string;
  readonly tipo: "SIMPLE" | "VARIABLE";
  readonly status: "DRAFT" | "PUBLISHED";
  readonly destaque: boolean;
  readonly tempoDePreparoMinutos: number | null;
  readonly imagens: readonly string[];
  readonly especificacoes: readonly ValorDeEspecificacao[];
  readonly grupos: readonly GrupoDeOpcaoDeExemplo[];
  readonly variantes: readonly VarianteDeExemplo[];
}

// ---------------------------------------------------------------------------
// Categorias e as especificações de cada uma
// ---------------------------------------------------------------------------

const CATEGORIAS: Readonly<Record<string, readonly CategoriaDeExemplo[]>> = {
  pastelaria: [
    {
      chave: "pasteis",
      nome: "Pastéis",
      slug: "pasteis",
      descricao: "Massa fina, fritos na hora.",
      especificacoes: [
        {
          chave: "recheio",
          rotulo: "Recheio",
          tipo: "ENUM",
          unidade: null,
          opcoes: ["Carne", "Queijo", "Frango", "Palmito"],
          filtravel: true,
        },
        {
          chave: "vegetariano",
          rotulo: "Vegetariano",
          tipo: "BOOLEAN",
          unidade: null,
          opcoes: null,
          filtravel: true,
        },
      ],
    },
    {
      chave: "bebidas",
      nome: "Bebidas",
      slug: "bebidas",
      descricao: "Para acompanhar.",
      especificacoes: [
        {
          chave: "volume",
          rotulo: "Volume",
          tipo: "NUMBER",
          unidade: "ml",
          opcoes: null,
          filtravel: true,
        },
      ],
    },
  ],
  moda: [
    {
      chave: "camisetas",
      nome: "Camisetas",
      slug: "camisetas",
      descricao: "Malha para o dia a dia.",
      especificacoes: [
        {
          chave: "tecido",
          rotulo: "Tecido",
          tipo: "ENUM",
          unidade: null,
          opcoes: ["Algodão", "Poliéster", "Mescla"],
          filtravel: true,
        },
        {
          chave: "gramatura",
          rotulo: "Gramatura",
          tipo: "NUMBER",
          unidade: "g/m²",
          opcoes: null,
          filtravel: true,
        },
      ],
    },
    {
      chave: "calcados",
      nome: "Calçados",
      slug: "calcados",
      descricao: "Do tênis à meia.",
      especificacoes: [
        {
          chave: "material",
          rotulo: "Material",
          tipo: "TEXT",
          unidade: null,
          opcoes: null,
          filtravel: false,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Grupos de opção reaproveitados
// ---------------------------------------------------------------------------

/** Ingredientes que vêm marcados e podem ser retirados ("sem cebola"). */
const INGREDIENTES_DO_PASTEL: GrupoDeOpcaoDeExemplo = {
  chave: "ingredientes",
  nome: "Ingredientes",
  kind: "INGREDIENT",
  eixoDeVariacao: false,
  minimo: 0,
  maximo: null,
  opcoes: [
    {
      chave: "queijo",
      nome: "Queijo",
      acrescimoCents: 0,
      marcadaPorPadrao: true,
      disponivel: true,
    },
    {
      chave: "cebola",
      nome: "Cebola",
      acrescimoCents: 0,
      marcadaPorPadrao: true,
      disponivel: true,
    },
    {
      chave: "azeitona",
      nome: "Azeitona",
      acrescimoCents: 0,
      marcadaPorPadrao: false,
      disponivel: true,
    },
  ],
};

/** Adicionais pagos: o mesmo mecanismo, outro `kind` e preço por opção. */
const ADICIONAIS_DO_PASTEL: GrupoDeOpcaoDeExemplo = {
  chave: "adicionais",
  nome: "Adicionais",
  kind: "ADDON",
  eixoDeVariacao: false,
  minimo: 0,
  maximo: 3,
  opcoes: [
    {
      chave: "bacon",
      nome: "Bacon",
      acrescimoCents: 300,
      marcadaPorPadrao: false,
      disponivel: true,
    },
    {
      chave: "cheddar",
      nome: "Cheddar",
      acrescimoCents: 250,
      marcadaPorPadrao: false,
      disponivel: false,
    },
    {
      chave: "ovo",
      nome: "Ovo",
      acrescimoCents: 200,
      marcadaPorPadrao: false,
      disponivel: true,
    },
  ],
};

/** Eixo de grade: a escolha resolve uma variante com código e estoque. */
const TAMANHO_DA_CAMISETA: GrupoDeOpcaoDeExemplo = {
  chave: "tamanho",
  nome: "Tamanho",
  kind: "VARIATION",
  eixoDeVariacao: true,
  minimo: 1,
  maximo: 1,
  opcoes: [
    {
      chave: "p",
      nome: "P",
      acrescimoCents: 0,
      marcadaPorPadrao: false,
      disponivel: true,
    },
    {
      chave: "m",
      nome: "M",
      acrescimoCents: 0,
      marcadaPorPadrao: false,
      disponivel: true,
    },
    {
      chave: "g",
      nome: "G",
      acrescimoCents: 0,
      marcadaPorPadrao: false,
      disponivel: true,
    },
  ],
};

const COR_DA_CAMISETA: GrupoDeOpcaoDeExemplo = {
  chave: "cor",
  nome: "Cor",
  kind: "VARIATION",
  eixoDeVariacao: true,
  minimo: 1,
  maximo: 1,
  opcoes: [
    {
      chave: "azul",
      nome: "Azul",
      acrescimoCents: 0,
      marcadaPorPadrao: false,
      disponivel: true,
    },
    {
      chave: "preto",
      nome: "Preto",
      acrescimoCents: 0,
      marcadaPorPadrao: false,
      disponivel: true,
    },
  ],
};

const NUMERACAO_DO_TENIS: GrupoDeOpcaoDeExemplo = {
  chave: "numeracao",
  nome: "Numeração",
  kind: "VARIATION",
  eixoDeVariacao: true,
  minimo: 1,
  maximo: 1,
  opcoes: [
    {
      chave: "38",
      nome: "38",
      acrescimoCents: 0,
      marcadaPorPadrao: false,
      disponivel: true,
    },
    {
      chave: "40",
      nome: "40",
      acrescimoCents: 0,
      marcadaPorPadrao: false,
      disponivel: true,
    },
    {
      chave: "42",
      nome: "42",
      acrescimoCents: 0,
      marcadaPorPadrao: false,
      disponivel: false,
    },
  ],
};

/** A variante única de um produto que não tem grade. */
function variantePadrao(
  precos: readonly PrecoDeExemplo[],
  estoque: number | null,
): VarianteDeExemplo {
  return {
    chave: "padrao",
    nome: "Padrão",
    sku: null,
    padrao: true,
    estoque,
    disponivel: true,
    combinacao: [],
    precos,
  };
}

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

export const PRODUTOS: readonly ProdutoDeExemplo[] = [
  {
    loja: PASTELARIA,
    chave: "pastel-de-carne",
    nome: "Pastel de Carne",
    slug: "pastel-de-carne",
    descricao:
      "Pastel de massa fina com carne moída temperada, frito na hora do pedido.",
    resumo: "O mais pedido da casa.",
    categoria: "pasteis",
    tipo: "SIMPLE",
    status: "PUBLISHED",
    destaque: true,
    tempoDePreparoMinutos: 12,
    imagens: ["frente", "corte"],
    especificacoes: [
      { especificacao: "recheio", texto: "Carne" },
      { especificacao: "vegetariano", booleano: false },
    ],
    grupos: [INGREDIENTES_DO_PASTEL, ADICIONAIS_DO_PASTEL],
    variantes: [
      variantePadrao(
        [
          {
            kind: "BASE",
            rotulo: "Balcão",
            valorCents: 900,
            quantidadeMinima: 1,
          },
          {
            kind: "PROMO",
            rotulo: "Terça do pastel",
            valorCents: 700,
            quantidadeMinima: 1,
          },
          {
            kind: "WHOLESALE",
            rotulo: "Dúzia",
            valorCents: 800,
            quantidadeMinima: 12,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 320,
            quantidadeMinima: 1,
          },
        ],
        null,
      ),
    ],
  },
  {
    loja: PASTELARIA,
    chave: "pastel-de-queijo",
    nome: "Pastel de Queijo",
    slug: "pastel-de-queijo",
    descricao: "Muçarela derretida em massa fina.",
    resumo: "Clássico vegetariano.",
    categoria: "pasteis",
    tipo: "SIMPLE",
    status: "PUBLISHED",
    destaque: false,
    tempoDePreparoMinutos: 10,
    imagens: ["frente"],
    especificacoes: [
      { especificacao: "recheio", texto: "Queijo" },
      { especificacao: "vegetariano", booleano: true },
    ],
    grupos: [INGREDIENTES_DO_PASTEL, ADICIONAIS_DO_PASTEL],
    variantes: [
      variantePadrao(
        [
          {
            kind: "BASE",
            rotulo: "Balcão",
            valorCents: 850,
            quantidadeMinima: 1,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 300,
            quantidadeMinima: 1,
          },
        ],
        null,
      ),
    ],
  },
  {
    loja: PASTELARIA,
    chave: "refrigerante-lata",
    nome: "Refrigerante Lata",
    slug: "refrigerante-lata",
    descricao: "Lata de 350 ml, sempre gelada.",
    resumo: "Para acompanhar.",
    categoria: "bebidas",
    tipo: "SIMPLE",
    status: "PUBLISHED",
    destaque: false,
    tempoDePreparoMinutos: 1,
    imagens: ["frente"],
    especificacoes: [{ especificacao: "volume", numero: 350 }],
    grupos: [],
    variantes: [
      variantePadrao(
        [
          {
            kind: "BASE",
            rotulo: "Balcão",
            valorCents: 600,
            quantidadeMinima: 1,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 280,
            quantidadeMinima: 1,
          },
        ],
        null,
      ),
    ],
  },
  {
    // Rascunho de propósito: é o que permite provar, na própria carga, que a
    // vitrine NÃO enxerga produto não publicado — nem por endereço direto.
    loja: PASTELARIA,
    chave: "pastel-do-chef",
    nome: "Pastel do Chef",
    slug: "pastel-do-chef",
    descricao: "Receita em teste, ainda não publicada.",
    resumo: "Em desenvolvimento.",
    categoria: "pasteis",
    tipo: "SIMPLE",
    status: "DRAFT",
    destaque: false,
    tempoDePreparoMinutos: 15,
    imagens: ["frente"],
    especificacoes: [{ especificacao: "vegetariano", booleano: false }],
    grupos: [],
    variantes: [
      variantePadrao(
        [
          {
            kind: "BASE",
            rotulo: "Balcão",
            valorCents: 1600,
            quantidadeMinima: 1,
          },
        ],
        null,
      ),
    ],
  },
  {
    loja: MODA,
    chave: "camiseta-basica",
    nome: "Camiseta Básica",
    slug: "camiseta-basica",
    descricao:
      "Camiseta de algodão penteado, corte reto, gola redonda reforçada.",
    resumo: "Grade P ao G, duas cores.",
    categoria: "camisetas",
    tipo: "VARIABLE",
    status: "PUBLISHED",
    destaque: true,
    tempoDePreparoMinutos: null,
    imagens: ["frente", "costas"],
    especificacoes: [
      { especificacao: "tecido", texto: "Algodão" },
      { especificacao: "gramatura", numero: 160 },
    ],
    grupos: [TAMANHO_DA_CAMISETA, COR_DA_CAMISETA],
    variantes: [
      {
        chave: "p-azul",
        nome: "P / Azul",
        sku: "CAM-BAS-P-AZ",
        padrao: true,
        estoque: 12,
        disponivel: true,
        combinacao: [
          ["tamanho", "p"],
          ["cor", "azul"],
        ],
        precos: [
          {
            kind: "BASE",
            rotulo: "Vitrine",
            valorCents: 5990,
            quantidadeMinima: 1,
          },
          {
            kind: "PROMO",
            rotulo: "Semana da moda",
            valorCents: 4990,
            quantidadeMinima: 1,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 2200,
            quantidadeMinima: 1,
          },
        ],
      },
      {
        // Estoque zerado: fica indisponível SEM derrubar P e G. É o caso que
        // justifica o estoque morar na variante, e não no produto.
        chave: "m-azul",
        nome: "M / Azul",
        sku: "CAM-BAS-M-AZ",
        padrao: false,
        estoque: 0,
        disponivel: false,
        combinacao: [
          ["tamanho", "m"],
          ["cor", "azul"],
        ],
        precos: [
          {
            kind: "BASE",
            rotulo: "Vitrine",
            valorCents: 5990,
            quantidadeMinima: 1,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 2200,
            quantidadeMinima: 1,
          },
        ],
      },
      {
        chave: "g-preto",
        nome: "G / Preto",
        sku: "CAM-BAS-G-PR",
        padrao: false,
        estoque: 5,
        disponivel: true,
        combinacao: [
          ["tamanho", "g"],
          ["cor", "preto"],
        ],
        precos: [
          {
            kind: "BASE",
            rotulo: "Vitrine",
            valorCents: 6490,
            quantidadeMinima: 1,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 2400,
            quantidadeMinima: 1,
          },
        ],
      },
    ],
  },
  {
    loja: MODA,
    chave: "tenis-urbano",
    nome: "Tênis Urbano",
    slug: "tenis-urbano",
    descricao: "Solado de borracha, cabedal em lona, para o dia a dia.",
    resumo: "Numeração 38 ao 42.",
    categoria: "calcados",
    tipo: "VARIABLE",
    status: "PUBLISHED",
    destaque: false,
    tempoDePreparoMinutos: null,
    imagens: ["lateral", "sola"],
    especificacoes: [{ especificacao: "material", texto: "Lona e borracha" }],
    grupos: [NUMERACAO_DO_TENIS],
    variantes: [
      {
        chave: "38",
        nome: "38",
        sku: "TEN-URB-38",
        padrao: true,
        estoque: 3,
        disponivel: true,
        combinacao: [["numeracao", "38"]],
        precos: [
          {
            kind: "BASE",
            rotulo: "Vitrine",
            valorCents: 19_900,
            quantidadeMinima: 1,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 9_000,
            quantidadeMinima: 1,
          },
        ],
      },
      {
        chave: "40",
        nome: "40",
        sku: "TEN-URB-40",
        padrao: false,
        estoque: 7,
        disponivel: true,
        combinacao: [["numeracao", "40"]],
        precos: [
          {
            kind: "BASE",
            rotulo: "Vitrine",
            valorCents: 19_900,
            quantidadeMinima: 1,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 9_000,
            quantidadeMinima: 1,
          },
        ],
      },
      {
        chave: "42",
        nome: "42",
        sku: "TEN-URB-42",
        padrao: false,
        estoque: 0,
        disponivel: false,
        combinacao: [["numeracao", "42"]],
        precos: [
          {
            kind: "BASE",
            rotulo: "Vitrine",
            valorCents: 19_900,
            quantidadeMinima: 1,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 9_000,
            quantidadeMinima: 1,
          },
        ],
      },
    ],
  },
  {
    loja: MODA,
    chave: "meia-esportiva",
    nome: "Meia Esportiva",
    slug: "meia-esportiva",
    descricao: "Par de meias de cano médio, com reforço no calcanhar.",
    resumo: "Leve 3 e pague menos.",
    categoria: "calcados",
    tipo: "SIMPLE",
    status: "PUBLISHED",
    destaque: false,
    tempoDePreparoMinutos: null,
    imagens: ["frente"],
    especificacoes: [
      { especificacao: "material", texto: "Algodão e elastano" },
    ],
    grupos: [],
    variantes: [
      {
        chave: "padrao",
        nome: "Padrão",
        sku: "MEI-ESP-UN",
        padrao: true,
        estoque: 40,
        disponivel: true,
        combinacao: [],
        precos: [
          {
            kind: "BASE",
            rotulo: "Vitrine",
            valorCents: 2_990,
            quantidadeMinima: 1,
          },
          {
            kind: "WHOLESALE",
            rotulo: "Leve 3",
            valorCents: 2_490,
            quantidadeMinima: 3,
          },
          {
            kind: "COST",
            rotulo: "Custo",
            valorCents: 1_100,
            quantidadeMinima: 1,
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Identificadores derivados — a mesma regra em todo lugar
// ---------------------------------------------------------------------------

export const idDaCategoria = (loja: string, categoria: string): string =>
  idDeExemplo(`categoria:${loja}:${categoria}`);

export const idDaEspecificacao = (
  loja: string,
  categoria: string,
  chave: string,
): string => idDeExemplo(`especificacao:${loja}:${categoria}:${chave}`);

export const idDoProduto = (produto: ProdutoDeExemplo): string =>
  idDeExemplo(`produto:${produto.loja.chave}:${produto.chave}`);

export const idDaImagem = (produto: ProdutoDeExemplo, imagem: string): string =>
  idDeExemplo(`imagem:${produto.loja.chave}:${produto.chave}:${imagem}`);

export const idDoArquivo = (
  produto: ProdutoDeExemplo,
  imagem: string,
): string =>
  idDeExemplo(`arquivo:${produto.loja.chave}:${produto.chave}:${imagem}`);

export const idDoGrupo = (produto: ProdutoDeExemplo, grupo: string): string =>
  idDeExemplo(`grupo:${produto.loja.chave}:${produto.chave}:${grupo}`);

export const idDaOpcao = (
  produto: ProdutoDeExemplo,
  grupo: string,
  opcao: string,
): string =>
  idDeExemplo(`opcao:${produto.loja.chave}:${produto.chave}:${grupo}:${opcao}`);

export const idDaVariante = (
  produto: ProdutoDeExemplo,
  variante: string,
): string =>
  idDeExemplo(`variante:${produto.loja.chave}:${produto.chave}:${variante}`);

export const idDoPreco = (
  produto: ProdutoDeExemplo,
  variante: string,
  kind: string,
  quantidadeMinima: number,
): string =>
  idDeExemplo(
    `preco:${produto.loja.chave}:${produto.chave}:${variante}:${kind}:${quantidadeMinima}`,
  );

// ---------------------------------------------------------------------------
// Consultas sobre o cenário
// ---------------------------------------------------------------------------

/** Os produtos de uma loja, na ordem em que aparecem na vitrine. */
export function produtosDaLoja(
  loja: LojaDeExemplo,
): readonly ProdutoDeExemplo[] {
  return PRODUTOS.filter((produto) => produto.loja.chave === loja.chave);
}

/** O preço que a vitrine mostra: a promoção quando existe, senão o base. */
export function precoVigente(variante: VarianteDeExemplo): PrecoDeExemplo {
  const promocao = variante.precos.find((preco) => preco.kind === "PROMO");
  const base = variante.precos.find((preco) => preco.kind === "BASE");
  const escolhido = promocao ?? base;
  if (escolhido === undefined) {
    throw new Error(
      `A variante ${variante.chave} do cenário não tem preço BASE — todo produto vendável precisa de um.`,
    );
  }
  return escolhido;
}

/** O custo da variante, em centavos. Zero quando o dono não informou. */
export function custoDaVariante(variante: VarianteDeExemplo): number {
  return (
    variante.precos.find((preco) => preco.kind === "COST")?.valorCents ?? 0
  );
}

/** A variante padrão do produto — a que o pedido usa quando não há grade. */
export function varianteDoPedido(produto: ProdutoDeExemplo): VarianteDeExemplo {
  const escolhida = produto.variantes.find((variante) => variante.padrao);
  if (escolhida === undefined) {
    throw new Error(
      `O produto ${produto.chave} do cenário não tem variante padrão, e todo produto precisa de uma.`,
    );
  }
  return escolhida;
}

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

function categoriasDaLoja(loja: LojaDeExemplo): readonly CategoriaDeExemplo[] {
  return CATEGORIAS[loja.chave] ?? [];
}

function linhasDeCategorias(referencia: Date): readonly LinhaDeExemplo[] {
  return LOJAS.flatMap((loja) =>
    categoriasDaLoja(loja).map((categoria, ordem) => ({
      id: idDaCategoria(loja.chave, categoria.chave),
      store_id: loja.id,
      parent_id: null,
      name: categoria.nome,
      slug: categoria.slug,
      description: categoria.descricao,
      image_asset_id: null,
      sort_order: ordem,
      is_visible: true,
      deleted_at: null,
      created_at: instanteDeExemplo(referencia, -45_000 + ordem),
      updated_at: instanteDeExemplo(referencia, -45_000 + ordem),
    })),
  );
}

/**
 * As especificações, presas à CATEGORIA que as define.
 *
 * `created_by_owner` é verdadeiro em todas porque, no cenário, quem criou as
 * categorias e os campos delas foi a dona da loja — o ramo sugeriu o conjunto
 * inicial, e a fonte da verdade passou a ser a categoria (ajuste de 17/08).
 */
function linhasDeEspecificacoes(referencia: Date): readonly LinhaDeExemplo[] {
  return LOJAS.flatMap((loja) =>
    categoriasDaLoja(loja).flatMap((categoria) =>
      categoria.especificacoes.map((especificacao, ordem) => ({
        id: idDaEspecificacao(loja.chave, categoria.chave, especificacao.chave),
        store_id: loja.id,
        category_id: idDaCategoria(loja.chave, categoria.chave),
        vertical_code: loja.ramo,
        key: especificacao.chave,
        label: especificacao.rotulo,
        data_type: especificacao.tipo,
        unit: especificacao.unidade,
        enum_options:
          especificacao.opcoes === null ? null : json(especificacao.opcoes),
        is_required: false,
        is_filterable: especificacao.filtravel,
        is_public: true,
        validation: json({}),
        sort_order: ordem,
        created_by_owner: true,
        deprecated_at: null,
        created_at: instanteDeExemplo(referencia, -44_000 + ordem),
        updated_at: instanteDeExemplo(referencia, -44_000 + ordem),
      })),
    ),
  );
}

function linhasDeArquivos(referencia: Date): readonly LinhaDeExemplo[] {
  return PRODUTOS.flatMap((produto) =>
    produto.imagens.map((imagem, ordem) => ({
      id: idDoArquivo(produto, imagem),
      store_id: produto.loja.id,
      kind: "PRODUCT_IMAGE",
      status: "READY",
      storage_key: `exemplo/${produto.loja.slug}/${produto.slug}-${imagem}.webp`,
      mime_type: "image/webp",
      width: 1200,
      height: 1200,
      byte_size: 128_000,
      sha256: null,
      variants: json({
        thumb: `exemplo/${produto.loja.slug}/${produto.slug}-${imagem}-thumb.webp`,
        md: `exemplo/${produto.loja.slug}/${produto.slug}-${imagem}-md.webp`,
      }),
      blurhash: null,
      alt_text: `${produto.nome} — ${imagem}`,
      uploaded_by: produto.loja.dona.id,
      created_at: instanteDeExemplo(referencia, -40_000 + ordem),
    })),
  );
}

function linhaDoProduto(
  produto: ProdutoDeExemplo,
  ordem: number,
  referencia: Date,
): LinhaDeExemplo {
  const valores = produto.variantes.map(
    (variante) => precoVigente(variante).valorCents,
  );
  const padrao = varianteDoPedido(produto);

  return {
    id: idDoProduto(produto),
    store_id: produto.loja.id,
    name: produto.nome,
    slug: produto.slug,
    description: produto.descricao,
    short_description: produto.resumo,
    product_type: produto.tipo,
    // O ramo é COPIADO da loja no cadastro. Trocar o ramo da loja depois não
    // pode invalidar retroativamente o que já foi cadastrado.
    vertical_code: produto.loja.ramo,
    vertical_schema_version: 1,
    status: produto.status,
    is_available: produto.variantes.some((variante) => variante.disponivel),
    unavailable_until: null,
    unit_label: "un",
    // Estoque por variação é decidido pelo ramo da loja, não pelo produto.
    track_stock: produto.loja.controlaEstoque,
    sort_order: ordem,
    is_featured: produto.destaque,
    // Cache desnormalizado das especificações, para a vitrine numa ida só. NÃO
    // é fonte de verdade: a fonte é `product_attributes`.
    attributes: json(
      Object.fromEntries(
        produto.especificacoes.map((valor) => [
          valor.especificacao,
          valor.texto ?? valor.numero ?? valor.booleano ?? null,
        ]),
      ),
    ),
    price_min_cents: Math.min(...valores),
    price_max_cents: Math.max(...valores),
    display_price_cents: precoVigente(padrao).valorCents,
    compare_at_cents: null,
    has_variants: produto.variantes.length > 1,
    fraction_slots: null,
    fraction_pricing: null,
    prep_time_minutes: produto.tempoDePreparoMinutos,
    seo_title: `${produto.nome} — ${produto.loja.nome}`,
    seo_description: produto.resumo,
    deleted_at: null,
    created_at: instanteDeExemplo(referencia, -35_000 + ordem * 10),
    updated_at: instanteDeExemplo(referencia, -35_000 + ordem * 10),
    created_by: produto.loja.dona.id,
  };
}

function linhasDeProdutos(referencia: Date): readonly LinhaDeExemplo[] {
  return PRODUTOS.map((produto, ordem) =>
    linhaDoProduto(produto, ordem, referencia),
  );
}

function linhasDeProdutoPorCategoria(): readonly LinhaDeExemplo[] {
  return PRODUTOS.map((produto, ordem) => ({
    store_id: produto.loja.id,
    product_id: idDoProduto(produto),
    category_id: idDaCategoria(produto.loja.chave, produto.categoria),
    sort_order: ordem,
    is_primary: true,
  }));
}

function linhasDeValoresDeEspecificacao(): readonly LinhaDeExemplo[] {
  return PRODUTOS.flatMap((produto) =>
    produto.especificacoes.map((valor) => ({
      id: idDeExemplo(
        `atributo:${produto.loja.chave}:${produto.chave}:${valor.especificacao}`,
      ),
      store_id: produto.loja.id,
      product_id: idDoProduto(produto),
      definition_id: idDaEspecificacao(
        produto.loja.chave,
        produto.categoria,
        valor.especificacao,
      ),
      // Exatamente uma das quatro colunas é preenchida, coerente com o tipo
      // declarado na especificação — é a trava que impede o registro tipado de
      // virar saco sem fundo.
      value_text: valor.texto ?? null,
      value_num: valor.numero ?? null,
      value_bool: valor.booleano ?? null,
      value_date: null,
    })),
  );
}

function linhasDeImagens(referencia: Date): readonly LinhaDeExemplo[] {
  return PRODUTOS.flatMap((produto) =>
    produto.imagens.map((imagem, ordem) => ({
      id: idDaImagem(produto, imagem),
      store_id: produto.loja.id,
      product_id: idDoProduto(produto),
      asset_id: idDoArquivo(produto, imagem),
      // Exatamente UMA principal por produto, garantida por índice único
      // parcial na tabela — aqui a carga só respeita a regra.
      is_primary: ordem === 0,
      sort_order: ordem,
      alt_text: `${produto.nome} — ${imagem}`,
      created_at: instanteDeExemplo(referencia, -34_000 + ordem),
    })),
  );
}

function linhasDeGrupos(): readonly LinhaDeExemplo[] {
  return PRODUTOS.flatMap((produto) =>
    produto.grupos.map((grupo, ordem) => ({
      id: idDoGrupo(produto, grupo.chave),
      store_id: produto.loja.id,
      product_id: idDoProduto(produto),
      name: grupo.nome,
      description: null,
      kind: grupo.kind,
      is_variant_axis: grupo.eixoDeVariacao,
      min_select: grupo.minimo,
      max_select: grupo.maximo,
      allow_repeat: false,
      max_per_option: null,
      fraction_slots: null,
      sort_order: ordem,
      is_active: true,
    })),
  );
}

function linhasDeOpcoes(): readonly LinhaDeExemplo[] {
  return PRODUTOS.flatMap((produto) =>
    produto.grupos.flatMap((grupo) =>
      grupo.opcoes.map((opcao, ordem) => ({
        id: idDaOpcao(produto, grupo.chave, opcao.chave),
        store_id: produto.loja.id,
        group_id: idDoGrupo(produto, grupo.chave),
        name: opcao.nome,
        price_delta_cents: opcao.acrescimoCents,
        is_default_selected: opcao.marcadaPorPadrao,
        is_available: opcao.disponivel,
        image_asset_id: null,
        sort_order: ordem,
        external_code: null,
      })),
    ),
  );
}

function linhasDeGrupoPorProduto(): readonly LinhaDeExemplo[] {
  return PRODUTOS.flatMap((produto) =>
    produto.grupos.map((grupo, ordem) => ({
      store_id: produto.loja.id,
      product_id: idDoProduto(produto),
      group_id: idDoGrupo(produto, grupo.chave),
      sort_order: ordem,
    })),
  );
}

function linhasDeVariantes(): readonly LinhaDeExemplo[] {
  return PRODUTOS.flatMap((produto) =>
    produto.variantes.map((variante, ordem) => ({
      id: idDaVariante(produto, variante.chave),
      store_id: produto.loja.id,
      product_id: idDoProduto(produto),
      name: variante.nome,
      sku: variante.sku,
      barcode: null,
      is_default: variante.padrao,
      // Nulo é "não controla estoque". Zero é "controla e acabou" — e as duas
      // coisas precisam ser distinguíveis, senão comida vira produto esgotado.
      stock_quantity: variante.estoque,
      stock_reserved: variante.estoque === null ? null : 0,
      is_available: variante.disponivel,
      weight_grams: null,
      sort_order: ordem,
      deleted_at: null,
    })),
  );
}

function linhasDeCombinacoes(): readonly LinhaDeExemplo[] {
  return PRODUTOS.flatMap((produto) =>
    produto.variantes.flatMap((variante) =>
      variante.combinacao.map(([grupo, opcao]) => ({
        store_id: produto.loja.id,
        variant_id: idDaVariante(produto, variante.chave),
        group_id: idDoGrupo(produto, grupo),
        option_item_id: idDaOpcao(produto, grupo, opcao),
      })),
    ),
  );
}

function linhasDePrecos(referencia: Date): readonly LinhaDeExemplo[] {
  return PRODUTOS.flatMap((produto) =>
    produto.variantes.flatMap((variante) =>
      variante.precos.map((preco, ordem) => ({
        id: idDoPreco(
          produto,
          variante.chave,
          preco.kind,
          preco.quantidadeMinima,
        ),
        store_id: produto.loja.id,
        product_id: idDoProduto(produto),
        variant_id: idDaVariante(produto, variante.chave),
        kind: preco.kind,
        label: preco.rotulo,
        amount_cents: preco.valorCents,
        currency: "BRL",
        min_quantity: preco.quantidadeMinima,
        starts_at: null,
        ends_at: null,
        is_active: true,
        sort_order: ordem,
        created_at: instanteDeExemplo(referencia, -33_000 + ordem),
        updated_at: instanteDeExemplo(referencia, -33_000 + ordem),
      })),
    ),
  );
}

/**
 * O catálogo inteiro, na ordem de inserção que as chaves estrangeiras exigem:
 * arquivo antes de imagem, categoria antes de especificação, grupo antes de
 * opção, opção antes da combinação que a referencia.
 */
export function montarCatalogo(referencia: Date): readonly ConjuntoDeExemplo[] {
  return [
    { tabela: "assets", linhas: linhasDeArquivos(referencia) },
    { tabela: "categories", linhas: linhasDeCategorias(referencia) },
    {
      tabela: "attribute_definitions",
      linhas: linhasDeEspecificacoes(referencia),
    },
    { tabela: "products", linhas: linhasDeProdutos(referencia) },
    { tabela: "product_categories", linhas: linhasDeProdutoPorCategoria() },
    { tabela: "product_attributes", linhas: linhasDeValoresDeEspecificacao() },
    { tabela: "product_images", linhas: linhasDeImagens(referencia) },
    { tabela: "option_groups", linhas: linhasDeGrupos() },
    { tabela: "option_items", linhas: linhasDeOpcoes() },
    { tabela: "product_option_groups", linhas: linhasDeGrupoPorProduto() },
    { tabela: "product_variants", linhas: linhasDeVariantes() },
    { tabela: "variant_option_values", linhas: linhasDeCombinacoes() },
    { tabela: "product_prices", linhas: linhasDePrecos(referencia) },
  ];
}
