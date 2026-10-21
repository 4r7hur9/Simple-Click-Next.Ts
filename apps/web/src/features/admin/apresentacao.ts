/**
 * Regras de apresentação da administração (card #29), sem React: dinheiro,
 * datas, o tom de cada situação e a barra de uso de um limite.
 */

import type { SituacaoDaLoja } from "@simpleclick/contracts";

export type TomDaSituacao = "sucesso" | "atencao" | "erro" | "neutro";

export const TOM_DA_SITUACAO: Readonly<Record<SituacaoDaLoja, TomDaSituacao>> =
  {
    ACTIVE: "sucesso",
    PENDING_APPROVAL: "atencao",
    REJECTED: "erro",
    INACTIVE: "neutro",
    DELETED: "neutro",
  };

/** Os nomes das situações na língua de quem administra. */
export const NOME_DA_SITUACAO: Readonly<Record<SituacaoDaLoja, string>> = {
  PENDING_APPROVAL: "Pendente de aprovação",
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  REJECTED: "Recusada",
  DELETED: "Excluída",
};

const REAL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Centavos inteiros como "R$ 1.234,56". */
export function reais(centavos: number): string {
  return REAL.format(centavos / 100);
}

const INTEIRO = new Intl.NumberFormat("pt-BR");

export function inteiro(valor: number): string {
  return INTEIRO.format(valor);
}

/** Dia/mês/ano, em Brasília. */
export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Dia/mês/ano e hora, em Brasília. */
export function dataEHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function plural(
  quantidade: number,
  singular: string,
  pluralDaPalavra: string,
): string {
  return `${inteiro(quantidade)} ${quantidade === 1 ? singular : pluralDaPalavra}`;
}

/** A mensagem que a API mandou para a pessoa ler, quando ela mandou uma. */
export function mensagemDaApi(corpo: unknown, padrao: string): string {
  if (typeof corpo !== "object" || corpo === null) return padrao;
  const { mensagem, campos } = corpo as {
    mensagem?: unknown;
    campos?: { mensagem?: unknown }[];
  };
  if (typeof mensagem === "string") return mensagem;
  const doCampo = campos?.[0]?.mensagem;
  return typeof doCampo === "string" ? doCampo : padrao;
}

export interface UsoNaBarra {
  /** De 0 a 100. Passou do limite, a barra fica cheia. */
  readonly percentual: number;
  readonly tom: "normal" | "atencao" | "perigo";
}

/** Quanto da barra pintar, e em que cor: perto do limite avisa; no limite, alerta. */
export function usoNaBarra(uso: number, limite: number): UsoNaBarra {
  if (limite <= 0) {
    return {
      percentual: uso > 0 ? 100 : 0,
      tom: uso > 0 ? "perigo" : "normal",
    };
  }
  const percentual = Math.min(100, Math.round((uso / limite) * 100));
  if (uso >= limite) return { percentual, tom: "perigo" };
  if (percentual >= 80) return { percentual, tom: "atencao" };
  return { percentual, tom: "normal" };
}

/** Pede à API uma leitura de JSON; 404, sessão e falha viram um resultado só. */
export type LeituraDaApi<T> =
  | { readonly fase: "pronta"; readonly dados: T }
  | { readonly fase: "nao-encontrada" }
  | { readonly fase: "erro"; readonly mensagem: string };

export const MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO =
  "Sua sessão não tem acesso à administração. Entre de novo.";

export const MENSAGEM_DE_FALHA_DA_ADMINISTRACAO =
  "Não foi possível carregar agora. Tente de novo em instantes.";

/**
 * Lê um endereço de `/api/admin/...` e valida o corpo pelo esquema do
 * contrato. A tela só desenha o resultado.
 */
export async function lerDaApi<T>(
  url: string,
  validar: (corpo: unknown) => T,
  mensagemDeFalha = MENSAGEM_DE_FALHA_DA_ADMINISTRACAO,
): Promise<LeituraDaApi<T>> {
  try {
    const resposta = await fetch(url, { cache: "no-store" });
    if (resposta.status === 404) return { fase: "nao-encontrada" };
    if (resposta.status === 401 || resposta.status === 403) {
      return { fase: "erro", mensagem: MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO };
    }
    if (!resposta.ok) return { fase: "erro", mensagem: mensagemDeFalha };
    return { fase: "pronta", dados: validar(await resposta.json()) };
  } catch {
    return { fase: "erro", mensagem: mensagemDeFalha };
  }
}
