/**
 * Tokens de acesso e de renovação (AC-109, AC-110, AC-111).
 *
 * O token de acesso é um JWT HS256 curto. O de renovação é opaco, aleatório e
 * só tem seu resumo SHA-256 persistido pelo repositório de sessões. Guardar o
 * token de renovação em claro transformaria uma leitura indevida do banco em
 * acesso imediato às contas.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/** Quinze minutos, conforme ASM-101. */
export const DURACAO_DO_TOKEN_DE_ACESSO_EM_SEGUNDOS = 15 * 60;

/** Trinta dias, conforme ASM-101. */
export const DURACAO_DO_TOKEN_DE_RENOVACAO_EM_SEGUNDOS = 30 * 24 * 60 * 60;

/** Papéis que uma sessão autenticada pode carregar. */
export type PapelDaSessao = "CUSTOMER" | "OWNER" | "ADMIN";

/** Dados que identificam o acesso, sem colocar dado pessoal no token. */
export interface DadosDoTokenDeAcesso {
  readonly identidadeId: string;
  readonly papel: PapelDaSessao;
  readonly sessaoId: string;
  readonly familiaId: string;
}

/** Alegações verificadas de um token de acesso. */
export interface AlegacoesDoTokenDeAcesso extends DadosDoTokenDeAcesso {
  readonly emitidoEm: Date;
  readonly expiraEm: Date;
}

/** Token malformado, adulterado ou vencido. Não deve virar detalhe público. */
export class ErroDeTokenInvalido extends Error {
  constructor() {
    super("O token de acesso não é válido.");
    this.name = "ErroDeTokenInvalido";
  }
}

interface CabecalhoJwt {
  readonly alg: "HS256";
  readonly typ: "JWT";
}

interface CorpoJwt {
  readonly sub: string;
  readonly role: PapelDaSessao;
  readonly sid: string;
  readonly fid: string;
  readonly iat: number;
  readonly exp: number;
}

function paraBase64Url(valor: Uint8Array | string): string {
  return Buffer.from(valor).toString("base64url");
}

function jsonEmBase64Url(valor: unknown): string {
  return paraBase64Url(JSON.stringify(valor));
}

function doBase64UrlParaJson(valor: string): unknown {
  try {
    return JSON.parse(Buffer.from(valor, "base64url").toString("utf8"));
  } catch {
    throw new ErroDeTokenInvalido();
  }
}

function assinar(conteudo: string, segredo: string): string {
  return createHmac("sha256", segredo).update(conteudo).digest("base64url");
}

function assinaturaConfere(
  conteudo: string,
  assinaturaRecebida: string,
  segredo: string,
): boolean {
  const esperada = Buffer.from(assinar(conteudo, segredo));
  const recebida = Buffer.from(assinaturaRecebida);

  if (esperada.length !== recebida.length) return false;
  return timingSafeEqual(esperada, recebida);
}

function ehPapelDaSessao(valor: unknown): valor is PapelDaSessao {
  return valor === "CUSTOMER" || valor === "OWNER" || valor === "ADMIN";
}

function lerCorpoJwt(valor: unknown): CorpoJwt {
  if (typeof valor !== "object" || valor === null) {
    throw new ErroDeTokenInvalido();
  }

  const corpo = valor as Partial<CorpoJwt>;
  if (
    typeof corpo.sub !== "string" ||
    corpo.sub === "" ||
    !ehPapelDaSessao(corpo.role) ||
    typeof corpo.sid !== "string" ||
    corpo.sid === "" ||
    typeof corpo.fid !== "string" ||
    corpo.fid === "" ||
    !Number.isInteger(corpo.iat) ||
    !Number.isInteger(corpo.exp) ||
    corpo.exp <= corpo.iat
  ) {
    throw new ErroDeTokenInvalido();
  }
  return corpo as CorpoJwt;
}

/** Assina um token de acesso curto para a sessão declarada. */
export function assinarTokenDeAcesso(
  dados: DadosDoTokenDeAcesso,
  segredo: string,
  agora: Date = new Date(),
): string {
  if (segredo.trim() === "") throw new ErroDeTokenInvalido();

  const emitidoEm = Math.floor(agora.getTime() / 1_000);
  const cabecalho: CabecalhoJwt = { alg: "HS256", typ: "JWT" };
  const corpo: CorpoJwt = {
    sub: dados.identidadeId,
    role: dados.papel,
    sid: dados.sessaoId,
    fid: dados.familiaId,
    iat: emitidoEm,
    exp: emitidoEm + DURACAO_DO_TOKEN_DE_ACESSO_EM_SEGUNDOS,
  };
  const conteudo = `${jsonEmBase64Url(cabecalho)}.${jsonEmBase64Url(corpo)}`;

  return `${conteudo}.${assinar(conteudo, segredo)}`;
}

/** Verifica assinatura, forma e prazo do token de acesso recebido. */
export function verificarTokenDeAcesso(
  token: string,
  segredo: string,
  agora: Date = new Date(),
): AlegacoesDoTokenDeAcesso {
  const partes = token.split(".");
  if (partes.length !== 3) throw new ErroDeTokenInvalido();

  const [cabecalhoCodificado, corpoCodificado, assinatura] = partes;
  if (
    cabecalhoCodificado === undefined ||
    corpoCodificado === undefined ||
    assinatura === undefined
  ) {
    throw new ErroDeTokenInvalido();
  }

  const cabecalho = doBase64UrlParaJson(cabecalhoCodificado);
  if (
    typeof cabecalho !== "object" ||
    cabecalho === null ||
    (cabecalho as Partial<CabecalhoJwt>).alg !== "HS256" ||
    (cabecalho as Partial<CabecalhoJwt>).typ !== "JWT" ||
    !assinaturaConfere(
      `${cabecalhoCodificado}.${corpoCodificado}`,
      assinatura,
      segredo,
    )
  ) {
    throw new ErroDeTokenInvalido();
  }

  const corpo = lerCorpoJwt(doBase64UrlParaJson(corpoCodificado));
  const agoraEmSegundos = Math.floor(agora.getTime() / 1_000);
  if (agoraEmSegundos >= corpo.exp) throw new ErroDeTokenInvalido();

  return {
    identidadeId: corpo.sub,
    papel: corpo.role,
    sessaoId: corpo.sid,
    familiaId: corpo.fid,
    emitidoEm: new Date(corpo.iat * 1_000),
    expiraEm: new Date(corpo.exp * 1_000),
  };
}

/** Gera o segredo opaco de renovação com 256 bits imprevisíveis. */
export function gerarTokenDeRenovacao(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Resume o token opaco antes de persistir. A mesma entrada sempre produz o
 * mesmo resumo, permitindo achar a sessão sem registrar a credencial em si.
 */
export function resumirTokenDeRenovacao(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Lê só um token Bearer bem-formado de uma chamada autenticada. */
export function tokenDoCabecalhoDeAutorizacao(
  cabecalho: string | null | undefined,
): string | undefined {
  if (cabecalho === null || cabecalho === undefined) return undefined;
  const resultado = /^Bearer ([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2})$/i.exec(
    cabecalho.trim(),
  );
  return resultado?.[1];
}
