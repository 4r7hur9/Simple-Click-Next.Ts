/**
 * Como um ato da trilha de auditoria aparece na tela (AC-207, AC-118).
 *
 * Regras de apresentação, sem React: o nome do ato, o nome do campo e o valor
 * de antes e de depois. A trilha chega da API com o dado pessoal JÁ
 * mascarado (P-009) — a tela mostra o que recebeu e não tenta reconstruir
 * nada.
 */

import {
  ROTULOS_DAS_SITUACOES,
  ROTULOS_DOS_ATOS,
  ROTULOS_DOS_CAMPOS_DA_LOJA,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";

/** O nome do ato na língua de quem administra; o código, se for novo. */
export function rotuloDoAto(acao: string): string {
  return ROTULOS_DOS_ATOS[acao] ?? acao;
}

/** O nome do campo; o próprio caminho, se a tela não o conhece. */
export function rotuloDoCampo(campo: string): string {
  return ROTULOS_DOS_CAMPOS_DA_LOJA[campo] ?? campo;
}

/** Instante gravado pela API (ISO 8601 com hora), como a trilha o guarda. */
const FORMATO_DE_INSTANTE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * O valor como texto. Ausente vira travessão, e não "null". Instante vira
 * dia e hora de Brasília — é assim que o período de uma suspensão (AC-210)
 * se lê — e a situação da loja, o nome que a administração usa.
 */
export function valorNaTela(valor: unknown, campo?: string): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (
    campo === "status" &&
    typeof valor === "string" &&
    valor in ROTULOS_DAS_SITUACOES
  ) {
    return ROTULOS_DAS_SITUACOES[valor as SituacaoDaLoja];
  }
  if (typeof valor === "string" && FORMATO_DE_INSTANTE.test(valor)) {
    return momentoNaTela(valor);
  }
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") {
    return typeof valor === "boolean" ? (valor ? "sim" : "não") : String(valor);
  }
  return JSON.stringify(valor);
}

/** O instante do ato, no fuso de Brasília: dia/mês/ano e hora:minuto. */
export function momentoNaTela(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
