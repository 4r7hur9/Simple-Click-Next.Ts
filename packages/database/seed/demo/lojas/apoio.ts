/**
 * Peças comuns às lojas novas da demonstração (card #50): grades, estoque,
 * endereço, entrega e pagamento no formato que `demo/index.ts` grava.
 *
 * Todo valor monetário é inteiro em centavos (P-005).
 */

import type { GrupoDemo, LojaDemo, OpcaoDeEixoDemo } from "../dados.ts";

export const P_M_G_GG = (sem?: string): readonly OpcaoDeEixoDemo[] =>
  [
    { chave: "p", nome: "P" },
    { chave: "m", nome: "M" },
    { chave: "g", nome: "G" },
    { chave: "gg", nome: "GG" },
  ].filter((opcao) => opcao.chave !== sem);

export const NUMERACAO = (...numeros: number[]): readonly OpcaoDeEixoDemo[] =>
  numeros.map((n) => ({ chave: String(n), nome: String(n) }));

/** Estoque variado e previsível, com uma combinação esgotada. */
export const estoqueVariado =
  (esgotada: string) =>
  (combinacao: readonly string[]): number => {
    if (combinacao.join("/") === esgotada) return 0;
    const semente = [...combinacao.join("")].reduce(
      (soma, letra) => soma + letra.charCodeAt(0),
      0,
    );
    return 3 + (semente % 14);
  };

/** "Frango grelhado" → "frango-grelhado". */
export function chaveDe(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Grupo de ingredientes que vêm marcados (o cliente desmarca). */
export function ingredientes(...nomes: string[]): GrupoDemo {
  return {
    chave: "ingredientes",
    nome: "Ingredientes",
    descricao: "Desmarque o que você não quer.",
    kind: "INGREDIENT",
    minimo: 0,
    maximo: null,
    opcoes: nomes.map((nome) => ({
      chave: chaveDe(nome),
      nome,
      marcada: true,
    })),
  };
}

/** Grupo de adicionais pagos: [nome, acréscimo em centavos]. */
export function adicionais(
  nome: string,
  maximo: number,
  ...opcoes: (readonly [string, number])[]
): GrupoDemo {
  return {
    chave: chaveDe(nome),
    nome,
    kind: "ADDON",
    minimo: 0,
    maximo,
    opcoes: opcoes.map(([n, acrescimo]) => ({
      chave: chaveDe(n),
      nome: n,
      acrescimo,
    })),
  };
}

/** Escolha obrigatória de uma opção (ex.: "Proteína", "Borda"). */
export function escolhaObrigatoria(
  nome: string,
  ...opcoes: (readonly [string, number])[]
): GrupoDemo {
  return {
    chave: chaveDe(nome),
    nome,
    kind: "ADDON",
    minimo: 1,
    maximo: 1,
    opcoes: opcoes.map(([n, acrescimo], i) => ({
      chave: chaveDe(n),
      nome: n,
      acrescimo,
      marcada: i === 0,
    })),
  };
}

/** Endereço em Fortaleza/CE (ou região metropolitana, com `cidade`). */
export function enderecoEm({
  rua,
  numero,
  bairro,
  cep,
  cidade = "Fortaleza",
}: {
  readonly rua: string;
  readonly numero: string;
  readonly bairro: string;
  readonly cep: string;
  readonly cidade?: string;
}): LojaDemo["endereco"] {
  return { rua, numero, bairro, cidade, uf: "CE", cep };
}

/** Entrega no formato de `store_settings.delivery`. */
export function entrega(opcoes: {
  readonly taxa: number;
  readonly prazoMinutos: number;
  readonly gratisAcimaDe?: number | null;
  readonly minimo?: number | null;
  readonly retirada?: boolean;
}): Readonly<Record<string, unknown>> {
  return {
    nomeDaTaxa: "Taxa de entrega",
    prazoMinutos: opcoes.prazoMinutos,
    retiradaNoLocal: opcoes.retirada ?? true,
    taxaPadraoCents: opcoes.taxa,
    gratisAcimaDeCents: opcoes.gratisAcimaDe ?? null,
    minimoEntregaCents: opcoes.minimo ?? null,
    minimoRetiradaCents: null,
  };
}

/** Pagamento: PIX sempre; dinheiro e cartão na entrega conforme a loja. */
export function pagamento(
  chavePix: string,
  titular: string,
  formas: readonly ("PIX" | "CASH" | "CARD_ON_DELIVERY")[] = [
    "PIX",
    "CASH",
    "CARD_ON_DELIVERY",
  ],
): Readonly<Record<string, unknown>> {
  return {
    pix: {
      tipo: chavePix.includes("@") ? "EMAIL" : "PHONE",
      chave: chavePix,
      titular,
    },
    formas,
  };
}

export const CHECKOUT_PADRAO = {
  pedirEmail: true,
  pedirDocumento: false,
  pedidoMinimoCents: 0,
} as const;

/** Aviso obrigatório em todo produto da tabacaria. */
export const AVISO_18 =
  "Venda proibida para menores de 18 anos. Documento com foto na entrega ou na retirada.";
