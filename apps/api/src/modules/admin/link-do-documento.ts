/**
 * O link temporário de um documento sigiloso da loja (AC-203, AC-205).
 *
 * O documento nunca tem endereço fixo e público. No clique, a API gera um
 * link que diz QUAL documento, de QUAL loja, PARA QUEM e ATÉ QUANDO — e
 * assina tudo isso. A rota que entrega o arquivo confere a assinatura, o
 * prazo e se quem abre é a mesma pessoa da administração que pediu: link
 * repassado, vencido ou adulterado não abre nada.
 *
 * A ASSINATURA NÃO TEM SEGREDO PRÓPRIO NO AMBIENTE: ela deriva do segredo que
 * já assina as sessões (`JWT_SECRET`), com um rótulo que separa os dois usos
 * — o mesmo segredo nunca assina duas coisas diferentes do mesmo jeito, e um
 * token de sessão não vira link de documento nem o contrário (P-002: nada
 * disso mora no código).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** O prazo do link: cinco minutos, como o modelo de dados prevê. */
export const PRAZO_DO_LINK_EM_MS = 5 * 60 * 1000;

/** O que o link carrega, assinado. */
export interface ConteudoDoLink {
  readonly documentoId: string;
  readonly lojaId: string;
  readonly administradorId: string;
  /** Instante do fim do prazo, em milissegundos desde a época. */
  readonly expiraEm: number;
}

export type LinkConferido =
  | { readonly ok: true; readonly conteudo: ConteudoDoLink }
  | { readonly ok: false; readonly motivo: "INVALIDO" | "EXPIRADO" };

/** Rótulo que separa este uso do segredo de todos os outros. */
const ROTULO_DO_USO = "simpleclick/link-de-documento/v1";

/** A chave dos links, derivada do segredo das sessões. */
export function chaveDosLinks(segredoDasSessoes: string): Buffer {
  if (segredoDasSessoes.trim().length < 32) {
    throw new Error(
      "JWT_SECRET ausente ou curto demais para derivar a chave dos links de documento.",
    );
  }
  return createHmac("sha256", segredoDasSessoes).update(ROTULO_DO_USO).digest();
}

function assinatura(chave: Buffer, carga: string): string {
  return createHmac("sha256", chave).update(carga).digest("base64url");
}

/** O link assinado: `<carga>.<assinatura>`, os dois em base64url. */
export function assinarLink(conteudo: ConteudoDoLink, chave: Buffer): string {
  const carga = Buffer.from(
    JSON.stringify({
      d: conteudo.documentoId,
      l: conteudo.lojaId,
      a: conteudo.administradorId,
      e: conteudo.expiraEm,
    }),
  ).toString("base64url");
  return `${carga}.${assinatura(chave, carga)}`;
}

/** Formato do link no caminho: duas partes em base64url. */
export const FORMATO_DO_LINK = /^[A-Za-z0-9_-]{16,600}\.[A-Za-z0-9_-]{43}$/;

/**
 * Confere a assinatura ANTES de ler qualquer coisa da carga, e o prazo
 * depois. Comparação em tempo constante: a igual-igual comum vazaria, pelo
 * tempo de resposta, quantos caracteres iniciais da assinatura estão certos.
 */
export function conferirLink(
  link: string,
  chave: Buffer,
  agora: number,
): LinkConferido {
  if (!FORMATO_DO_LINK.test(link)) return { ok: false, motivo: "INVALIDO" };
  const [carga = "", recebida = ""] = link.split(".");
  const esperada = Buffer.from(assinatura(chave, carga));
  const veio = Buffer.from(recebida);
  if (veio.length !== esperada.length || !timingSafeEqual(veio, esperada)) {
    return { ok: false, motivo: "INVALIDO" };
  }

  let lido: { d?: unknown; l?: unknown; a?: unknown; e?: unknown };
  try {
    lido = JSON.parse(Buffer.from(carga, "base64url").toString("utf8")) as {
      d?: unknown;
      l?: unknown;
      a?: unknown;
      e?: unknown;
    };
  } catch {
    return { ok: false, motivo: "INVALIDO" };
  }
  if (
    typeof lido.d !== "string" ||
    typeof lido.l !== "string" ||
    typeof lido.a !== "string" ||
    typeof lido.e !== "number"
  ) {
    return { ok: false, motivo: "INVALIDO" };
  }
  if (lido.e <= agora) return { ok: false, motivo: "EXPIRADO" };
  return {
    ok: true,
    conteudo: {
      documentoId: lido.d,
      lojaId: lido.l,
      administradorId: lido.a,
      expiraEm: lido.e,
    },
  };
}
