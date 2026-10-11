/**
 * Leitura do cupom que chega de fora (JSON da API, linha da fila, disco do
 * agente): confere o contrato e devolve `null` para o resto, inclusive versão
 * desconhecida, porque imprimir errado é pior que não imprimir.
 */

import { ehLarguraDoPapel, type Alinhamento } from "./cupom-largura.ts";
import {
  VERSAO_DO_CUPOM,
  type BlocoDoCupom,
  type CupomImpresso,
  type TamanhoDoTexto,
} from "./cupom-contrato.ts";

/** Objeto simples: nem nulo, nem lista. */
function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Campo opcional: ausente, ou presente e aceito pela conferência dada. */
function opcional<T>(valor: unknown, aceita: (v: unknown) => v is T): boolean {
  return valor === undefined || aceita(valor);
}

// Conferências de cada campo de um bloco, uma por tipo de valor.
const ehTexto = (v: unknown): v is string => typeof v === "string";
const ehBooleano = (v: unknown): v is boolean => typeof v === "boolean";
const ehTamanho = (v: unknown): v is TamanhoDoTexto =>
  v === "normal" || v === "duplo";
const ehAlinhamento = (v: unknown): v is Alinhamento =>
  v === "esquerda" || v === "centro" || v === "direita";
const ehInteiroNaoNegativo = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** O bloco é de um tipo do contrato e todos os campos dele conferem. */
function ehBloco(valor: unknown): valor is BlocoDoCupom {
  if (!ehObjeto(valor)) return false;
  switch (valor.tipo) {
    case "texto":
      return (
        ehTexto(valor.texto) &&
        opcional(valor.alinhamento, ehAlinhamento) &&
        opcional(valor.negrito, ehBooleano) &&
        opcional(valor.tamanho, ehTamanho) &&
        opcional(valor.recuo, ehInteiroNaoNegativo)
      );
    case "par":
      return (
        ehTexto(valor.esquerda) &&
        ehTexto(valor.direita) &&
        opcional(valor.negrito, ehBooleano) &&
        opcional(valor.tamanho, ehTamanho) &&
        opcional(valor.recuo, ehInteiroNaoNegativo)
      );
    case "separador":
      return valor.caractere === "-" || valor.caractere === "=";
    case "espaco":
      return ehInteiroNaoNegativo(valor.linhas) && valor.linhas >= 1;
    case "corte":
      return true;
    default:
      return false;
  }
}

/**
 * Lê um cupom que chegou de fora (JSON da API, linha da fila, disco do
 * agente). Devolve `null` para qualquer coisa fora do contrato — inclusive
 * versão desconhecida: imprimir errado é pior que não imprimir.
 */
export function lerCupomImpresso(valor: unknown): CupomImpresso | null {
  if (!ehObjeto(valor) || valor.versao !== VERSAO_DO_CUPOM) return null;
  const papel = valor.papel;
  if (
    !ehObjeto(papel) ||
    !ehLarguraDoPapel(papel.larguraMm) ||
    !ehInteiroNaoNegativo(papel.colunas) ||
    papel.colunas < 8
  ) {
    return null;
  }
  if (!ehInteiroNaoNegativo(valor.via) || valor.via < 1) return null;
  if (!Array.isArray(valor.blocos) || !valor.blocos.every(ehBloco)) return null;
  return {
    versao: VERSAO_DO_CUPOM,
    papel: { larguraMm: papel.larguraMm, colunas: papel.colunas },
    via: valor.via,
    blocos: valor.blocos,
  };
}
