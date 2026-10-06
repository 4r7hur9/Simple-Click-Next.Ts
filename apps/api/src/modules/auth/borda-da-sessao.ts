/**
 * Como a sessão atravessa a borda HTTP (AC-109, AC-111, T-112).
 *
 * - O **navegador** recebe o token de renovação só no cookie `sc_refresh`:
 *   HttpOnly (script nenhum lê), Secure (só HTTPS), SameSite=Strict (não vai
 *   em requisição de outro site) e caminho `/v1/auth` (só as rotas de sessão o
 *   recebem). O corpo leva o token de acesso curto, que a ponte do site guarda
 *   em cookie próprio e nunca entrega a script.
 * - O **cliente nativo** (`x-simpleclick-client: nativo`) recebe o par no
 *   corpo e manda o token de renovação de volta no corpo.
 *
 * Aqui também moram a leitura do Bearer e as respostas de erro curtas da
 * identidade, no formato do contrato (`{ erro, mensagem }`).
 */
import type { NextFunction, Request, Response } from "express";

import { MENSAGEM_DE_ENVIO_INDISPONIVEL } from "@simpleclick/contracts";

import { ErroDeEnvioIndisponivel } from "./emails-de-acesso.ts";
import type { ClienteDaSessao, SessaoEntregue } from "./sessao.usecase.ts";
import {
  tokenDoCabecalhoDeAutorizacao,
  verificarTokenDeAcesso,
  type PapelDaSessao,
} from "./token.ts";

export const NOME_DO_COOKIE_DE_RENOVACAO = "sc_refresh";
export const CAMINHO_DO_COOKIE_DE_RENOVACAO = "/v1/auth";

/** Quem pede a sessão. Sem o cabeçalho, é navegador: o caminho mais fechado. */
export function clienteDaRequisicao(requisicao: Request): ClienteDaSessao {
  return requisicao.get("x-simpleclick-client")?.trim().toLowerCase() ===
    "nativo"
    ? "nativo"
    : "navegador";
}

/** O cookie do token de renovação, com prazo igual ao da sessão. */
export function cookieDeRenovacao(token: string, expiraEm: Date): string {
  const segundos = Math.max(
    0,
    Math.floor((expiraEm.getTime() - Date.now()) / 1_000),
  );
  return [
    `${NOME_DO_COOKIE_DE_RENOVACAO}=${encodeURIComponent(token)}`,
    `Max-Age=${segundos}`,
    `Path=${CAMINHO_DO_COOKIE_DE_RENOVACAO}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

/** O cookie que apaga o token de renovação do navegador. */
export function cookieQueApaga(): string {
  return [
    `${NOME_DO_COOKIE_DE_RENOVACAO}=`,
    "Max-Age=0",
    `Path=${CAMINHO_DO_COOKIE_DE_RENOVACAO}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

/** O token de renovação: do corpo (nativo) ou do cookie (navegador). */
export function tokenDeRenovacaoDaRequisicao(
  requisicao: Request,
  corpo: { readonly tokenDeRenovacao?: string | undefined } | undefined,
): string | undefined {
  if (corpo?.tokenDeRenovacao !== undefined) return corpo.tokenDeRenovacao;
  const cabecalho = requisicao.headers.cookie;
  if (cabecalho === undefined) return undefined;
  for (const par of cabecalho.split(";")) {
    const [nome, ...valores] = par.trim().split("=");
    if (nome !== NOME_DO_COOKIE_DE_RENOVACAO || valores.length === 0) continue;
    try {
      const token = decodeURIComponent(valores.join("="));
      return token === "" ? undefined : token;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Responde a sessão aberta. O token de renovação só vai no corpo para o
 * cliente nativo; para o navegador ele vai no cookie.
 */
export function entregarSessao(
  resposta: Response,
  sessao: SessaoEntregue,
  papel: PapelDaSessao,
  extra: { readonly orientarPara?: string } = {},
): void {
  resposta.set("cache-control", "no-store");
  const corpo = {
    status: "SESSAO_CRIADA" as const,
    papel,
    tokenDeAcesso: sessao.tokenDeAcesso,
    acessoExpiraEm: sessao.acessoExpiraEm.toISOString(),
    renovacaoExpiraEm: sessao.renovacaoExpiraEm.toISOString(),
    ...extra,
  };
  if (sessao.destino === "nativo") {
    resposta.json({ ...corpo, tokenDeRenovacao: sessao.tokenDeRenovacao });
    return;
  }
  resposta.append(
    "set-cookie",
    cookieDeRenovacao(sessao.tokenDeRenovacao, sessao.renovacaoExpiraEm),
  );
  resposta.json(corpo);
}

/** Quem está logado, pelo Bearer. `null` sem token, vencido ou adulterado. */
export function quemEstaLogado(
  requisicao: Request,
  segredo: string,
): {
  readonly identidadeId: string;
  readonly papel: PapelDaSessao;
  readonly sessaoId: string;
} | null {
  const token = tokenDoCabecalhoDeAutorizacao(requisicao.headers.authorization);
  if (token === undefined) return null;
  try {
    const alegacoes = verificarTokenDeAcesso(token, segredo);
    return {
      identidadeId: alegacoes.identidadeId,
      papel: alegacoes.papel,
      sessaoId: alegacoes.sessaoId,
    };
  } catch {
    return null;
  }
}

/** Erro curto, no formato do contrato. */
export function responderErro(
  resposta: Response,
  status: number,
  erro: string,
  mensagem?: string,
): void {
  resposta.set("cache-control", "no-store");
  resposta
    .status(status)
    .json(mensagem === undefined ? { erro } : { erro, mensagem });
}

/** AC-133: sem provedor, a resposta diz com clareza que o envio não sai. */
export function responderEnvioIndisponivel(resposta: Response): void {
  responderErro(
    resposta,
    503,
    "envio_indisponivel",
    MENSAGEM_DE_ENVIO_INDISPONIVEL,
  );
}

/** 401 de sessão ausente ou inválida, apagando o cookie que não serve mais. */
export function responderSemSessao(resposta: Response): void {
  resposta.append("set-cookie", cookieQueApaga());
  responderErro(
    resposta,
    401,
    "nao_autenticado",
    "Entre de novo para continuar.",
  );
}

/** Uma rota assíncrona: e-mail indisponível vira 503; o resto, o manipulador. */
export function rota(
  acao: (requisicao: Request, resposta: Response) => Promise<void>,
) {
  return (requisicao: Request, resposta: Response, proximo: NextFunction) => {
    acao(requisicao, resposta).catch((erro: unknown) => {
      if (erro instanceof ErroDeEnvioIndisponivel) {
        responderEnvioIndisponivel(resposta);
        return;
      }
      proximo(erro);
    });
  };
}
