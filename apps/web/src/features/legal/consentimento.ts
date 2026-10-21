/**
 * Consentimento de cookies (LGPD, art. 7º I e art. 8º).
 *
 * MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR — as categorias e os prazos
 * daqui precisam bater com o texto da página /cookies.
 *
 * A escolha da pessoa fica num cookie próprio (`sc_consentimento`), com a
 * versão da política em que ela foi dada. Mudou a versão (`VERSAO_DA_POLITICA`),
 * a escolha antiga deixa de valer e o aviso volta. O resto do código NUNCA lê o
 * cookie direto: pergunta `temConsentimento(categoria)` antes de carregar
 * qualquer coisa que não seja essencial (análise, pixel, mapa de terceiro...).
 */

/** Categorias. `essenciais` não depende de escolha: sem elas o site não funciona. */
export type CategoriaDeCookie = "essenciais" | "desempenho" | "funcionais";

export const CATEGORIAS_OPCIONAIS = ["desempenho", "funcionais"] as const;

/** Muda quando o texto da política muda de forma que exija nova escolha. */
export const VERSAO_DA_POLITICA = "2026-10-19";

export const NOME_DO_COOKIE_DE_CONSENTIMENTO = "sc_consentimento";

/** Validade da escolha: 12 meses. */
export const VALIDADE_EM_DIAS = 365;

/** Evento do navegador: o rodapé pede para reabrir a janela. */
export const EVENTO_ABRIR_PREFERENCIAS = "sc:abrir-preferencias-de-cookies";

/** Evento do navegador: a escolha mudou (traz `ConsentimentoGravado` em `detail`). */
export const EVENTO_CONSENTIMENTO_MUDOU = "sc:consentimento-mudou";

export interface ConsentimentoGravado {
  readonly versao: string;
  readonly desempenho: boolean;
  readonly funcionais: boolean;
  /** Quando a pessoa escolheu (milissegundos desde 1970). */
  readonly em: number;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Lê o valor do cookie. Devolve `null` se não existe, está estragado, é de
 * outra versão da política ou passou da validade — nos quatro casos a pessoa
 * precisa escolher de novo.
 */
export function lerConsentimento(
  valor: string | undefined | null,
  agora: number = Date.now(),
): ConsentimentoGravado | null {
  if (valor === undefined || valor === null || valor === "") return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(decodeURIComponent(valor));
  } catch {
    return null;
  }
  if (typeof bruto !== "object" || bruto === null) return null;
  const { v, d, f, t } = bruto as Record<string, unknown>;
  if (v !== VERSAO_DA_POLITICA) return null;
  if (typeof d !== "boolean" || typeof f !== "boolean") return null;
  if (typeof t !== "number" || !Number.isFinite(t)) return null;
  if (agora - t > VALIDADE_EM_DIAS * MS_POR_DIA) return null;
  return { versao: v, desempenho: d, funcionais: f, em: t };
}

export function serializarConsentimento(
  escolha: Pick<ConsentimentoGravado, "desempenho" | "funcionais">,
  agora: number = Date.now(),
): string {
  return encodeURIComponent(
    JSON.stringify({
      v: VERSAO_DA_POLITICA,
      d: escolha.desempenho,
      f: escolha.funcionais,
      t: agora,
    }),
  );
}

function valorDoCookieNoNavegador(): string | null {
  if (typeof document === "undefined") return null;
  const par = document.cookie
    .split("; ")
    .find((parte) => parte.startsWith(`${NOME_DO_COOKIE_DE_CONSENTIMENTO}=`));
  return par === undefined
    ? null
    : par.slice(NOME_DO_COOKIE_DE_CONSENTIMENTO.length + 1);
}

/** A escolha vigente neste navegador, ou `null` se ainda não escolheu. */
export function consentimentoAtual(): ConsentimentoGravado | null {
  return lerConsentimento(valorDoCookieNoNavegador());
}

/**
 * Pode carregar o que depende desta categoria? `essenciais` sempre; as outras
 * só depois de a pessoa aceitar. No servidor (sem navegador) a resposta é
 * "não" — quem precisa de análise a carrega no cliente, depois do aceite.
 */
export function temConsentimento(categoria: CategoriaDeCookie): boolean {
  if (categoria === "essenciais") return true;
  const atual = consentimentoAtual();
  return atual === null ? false : atual[categoria];
}

/** Grava a escolha e avisa quem estiver ouvindo. Só roda no navegador. */
export function gravarConsentimento(
  escolha: Pick<ConsentimentoGravado, "desempenho" | "funcionais">,
): ConsentimentoGravado {
  const agora = Date.now();
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${NOME_DO_COOKIE_DE_CONSENTIMENTO}=${serializarConsentimento(escolha, agora)}` +
    `; Path=/; Max-Age=${VALIDADE_EM_DIAS * 24 * 60 * 60}; SameSite=Lax${seguro}`;
  const gravado: ConsentimentoGravado = {
    versao: VERSAO_DA_POLITICA,
    desempenho: escolha.desempenho,
    funcionais: escolha.funcionais,
    em: agora,
  };
  window.dispatchEvent(
    new CustomEvent(EVENTO_CONSENTIMENTO_MUDOU, { detail: gravado }),
  );
  return gravado;
}

/** Pede para o aviso reabrir (usado pelo link do rodapé). */
export function abrirPreferenciasDeCookies(): void {
  window.dispatchEvent(new Event(EVENTO_ABRIR_PREFERENCIAS));
}
