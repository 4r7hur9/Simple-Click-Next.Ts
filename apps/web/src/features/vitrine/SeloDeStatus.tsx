/**
 * O selo ABERTO/FECHADO que fica sobre a capa da loja (card #64).
 *
 * É UMA PÍLULA COM FUNDO PRÓPRIO, clara ou escura: o ponto e o texto são
 * escolhidos para ela e passam no AA (texto ≥ 4,5:1, ponto ≥ 3:1) sobre qualquer
 * capa. Qual das duas aparece é do dono (Aparência → Selo de status); no
 * automático, a que mais contrasta com a cor da imagem por trás. A regra e as
 * cores moram no design system (`packages/ui/src/selo-de-status.ts`) e chegam
 * aqui como variáveis de CSS — a folha só as usa, para não haver duas paletas.
 *
 * Verde é aberto, vermelho é fechado; o texto continua dizendo qual é.
 */
import "@simpleclick/ui/styles/selo-de-status.css";

import type { CSSProperties } from "react";
import {
  CORES_DO_SELO,
  variacaoDoSelo,
  type PreferenciaDoSelo,
  type VariacaoDoSelo,
} from "@simpleclick/ui";

export interface EntradaDoSelo {
  /** O que o dono escolheu; sem escolha, automático. */
  readonly preferencia?: PreferenciaDoSelo | null | undefined;
  /** A cor medida da imagem por trás do selo, quando se sabe. */
  readonly corDoFundo?: string | null | undefined;
  readonly aberta: boolean;
}

export interface AtributosDoSelo {
  readonly variacao: VariacaoDoSelo;
  /** Junte às classes do elemento que já mostra a situação. */
  readonly className: string;
  readonly style: CSSProperties;
  readonly "data-selo": "claro" | "escuro";
}

/** Os atributos que fazem do elemento da situação a pílula do selo. */
export function atributosDoSelo({
  preferencia,
  corDoFundo,
  aberta,
}: EntradaDoSelo): AtributosDoSelo {
  const variacao = variacaoDoSelo(preferencia, corDoFundo);
  const cores = CORES_DO_SELO[variacao];
  return {
    variacao,
    className: `sc-selo-status sc-selo-status--${aberta ? "aberta" : "fechada"}`,
    style: {
      "--selo-fundo": cores.fundo,
      "--selo-texto": cores.texto,
      "--selo-ponto": aberta ? cores.pontoAberto : cores.pontoFechado,
    } as CSSProperties,
    "data-selo": variacao === "CLARO" ? "claro" : "escuro",
  };
}
