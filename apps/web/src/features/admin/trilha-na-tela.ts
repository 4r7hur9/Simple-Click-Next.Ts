/**
 * Como um ato da trilha de auditoria aparece na tela (AC-207, AC-118).
 *
 * Regras de apresentação, sem React: o nome do ato, o nome do campo e o valor
 * de antes e de depois. A trilha chega da API com o dado pessoal JÁ
 * mascarado (P-009) — a tela mostra o que recebeu e não tenta reconstruir
 * nada.
 */

import {
  ROTULOS_DOS_ATOS,
  ROTULOS_DOS_CAMPOS_DA_LOJA,
} from "@simpleclick/contracts";

/** O nome do ato na língua de quem administra; o código, se for novo. */
export function rotuloDoAto(acao: string): string {
  return ROTULOS_DOS_ATOS[acao] ?? acao;
}

/** O nome do campo; o próprio caminho, se a tela não o conhece. */
export function rotuloDoCampo(campo: string): string {
  return ROTULOS_DOS_CAMPOS_DA_LOJA[campo] ?? campo;
}

/** O valor como texto. Ausente vira travessão, e não "null". */
export function valorNaTela(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
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
