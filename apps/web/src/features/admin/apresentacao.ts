/**
 * Regras de apresentação da administração (card #29), sem React: dinheiro,
 * datas, o tom de cada situação e a barra de uso de um limite.
 */

import {
  ROTULO_DOS_DOCUMENTOS_LEGAIS,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";

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

function listaEmFrase(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

function textoDoCampo(corpo: unknown, campo: string): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const valor = (corpo as Record<string, unknown>)[campo];
  return typeof valor === "string" ? valor : null;
}

function rotulosDosPendentes(pendentes: unknown): string[] {
  const rotulos: string[] = [];
  if (!Array.isArray(pendentes)) return rotulos;
  for (const p of pendentes) {
    const documento = textoDoCampo(p, "documento");
    if (
      documento === null ||
      !Object.hasOwn(ROTULO_DOS_DOCUMENTOS_LEGAIS, documento)
    ) {
      continue;
    }
    const rotulo =
      ROTULO_DOS_DOCUMENTOS_LEGAIS[
        documento as keyof typeof ROTULO_DOS_DOCUMENTOS_LEGAIS
      ];
    if (!rotulos.includes(rotulo)) rotulos.push(rotulo);
  }
  return rotulos;
}

/**
 * O que mostrar num 401/403 da administração, pelo motivo que a API deu:
 * `aceite_pendente` diz o que falta aceitar; `acesso_negado` soma a próxima
 * ação à frase de sessão; o resto fica só com a frase de sessão da tela.
 * Nunca devolve o texto cru do corpo.
 */
export function mensagemDaRecusaDeAcesso(
  status: number,
  corpo: unknown,
  mensagemDeSessao: string,
): string {
  if (status !== 403) return mensagemDeSessao;
  const motivo = textoDoCampo(corpo, "erro") ?? textoDoCampo(corpo, "codigo");
  if (motivo === "aceite_pendente") {
    const pendentes = (corpo as { pendentes?: unknown }).pendentes;
    const rotulos = rotulosDosPendentes(pendentes);
    return rotulos.length > 0
      ? `Falta aceitar a versão nova de: ${listaEmFrase(rotulos)}. Aceite na janela “Atualizamos nossos termos”, que abriu por cima, e confirme de novo.`
      : "Falta aceitar a versão nova dos termos. Aceite e confirme de novo.";
  }
  if (motivo === "acesso_negado") {
    return `${mensagemDeSessao} Se continuar, peça a liberação a quem administra o SimpleClick.`;
  }
  return mensagemDeSessao;
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
      const recusa: unknown = await resposta.json().catch(() => null);
      return {
        fase: "erro",
        mensagem: mensagemDaRecusaDeAcesso(
          resposta.status,
          recusa,
          MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO,
        ),
      };
    }
    if (!resposta.ok) return { fase: "erro", mensagem: mensagemDeFalha };
    return { fase: "pronta", dados: validar(await resposta.json()) };
  } catch {
    return { fase: "erro", mensagem: mensagemDeFalha };
  }
}
