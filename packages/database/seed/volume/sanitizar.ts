/**
 * Sanitização das SAÍDAS do volume (D-10): nada que identifique pessoa, pedido
 * por token ou credencial pode ir parar em `saida/` nem no doc 09.
 *
 * Duas camadas:
 * 1. redação por IGUALDADE EXATA dos valores que a execução ligou como
 *    parâmetro (tokens públicos, telefones, e-mails, ids de identidade e de
 *    cliente), porque o EXPLAIN de um plano personalizado imprime o literal;
 * 2. redação por padrão (token de 40 hex, e-mail, +55, JWT), a mesma família de
 *    `varrerSaidas` do #135, que roda DEPOIS como prova (se achar algo, o
 *    arquivo não é gravado).
 *
 * Erros do driver nunca são impressos: só etapa e código (ver `erroSeguro`).
 */

import { varrerSaidas } from "../simulacao/validar.ts";

const escapar = (valor: string): string => valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface Sanitizador {
  /** Redige um texto. */
  readonly texto: (entrada: string) => string;
  /** Redige todas as strings de um valor JSON, recursivamente (chaves inclusive). */
  readonly json: (entrada: unknown) => unknown;
  /** O que ainda sobrou no texto final (vazio = limpo). */
  readonly varrer: (final: string) => string[];
}

export function criarSanitizador(valoresLigados: readonly string[]): Sanitizador {
  const exatos = [...new Set(valoresLigados.filter((v) => v.length >= 4))].sort(
    (a, b) => b.length - a.length,
  );
  const padraoExato =
    exatos.length === 0 ? null : new RegExp(exatos.map(escapar).join("|"), "g");

  const texto = (entrada: string): string => {
    // Padrões primeiro: um valor ligado pode ser pedaço de um e-mail ("maria") e
    // trocá-lo antes deixaria o resto do endereço para trás.
    const sem = entrada
      .replace(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/gi, "<token>")
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
      .replace(/\+55\d{10,11}/g, "<telefone>")
      .replace(/eyJ[\w-]+(\.[\w-]+)*/g, "<jwt>");
    return padraoExato === null ? sem : sem.replace(padraoExato, "<valor>");
  };

  const json = (entrada: unknown): unknown => {
    if (typeof entrada === "string") return texto(entrada);
    if (Array.isArray(entrada)) return entrada.map(json);
    if (entrada !== null && typeof entrada === "object") {
      return Object.fromEntries(
        Object.entries(entrada as Record<string, unknown>).map(([k, v]) => [texto(k), json(v)]),
      );
    }
    return entrada;
  };

  const varrer = (final: string): string[] => {
    const achados = varrerSaidas(final);
    for (const valor of exatos) {
      if (final.includes(valor)) achados.push("valor ligado na execução");
    }
    return [...new Set(achados)];
  };

  return { texto, json, varrer };
}

/** Só etapa e código: nunca `message`, `detail` ou `where` do driver. */
export function descreverErroSeguro(erro: unknown): string {
  if (erro instanceof Error && (erro.name === "ErroDoVolume" || erro.name === "FalhaInduzida")) {
    return erro.message;
  }
  if (erro instanceof Error && erro.name === "ErroDeParametros") return erro.message;
  if (erro instanceof Error && erro.name === "ErroDeGuarda") {
    // Mensagens da guarda não carregam host/porta: só o motivo.
    return erro.message.replace(/postgres(ql)?:\/\/\S+/gi, "<url>");
  }
  return "Falha inesperada (detalhe omitido por segurança).";
}
