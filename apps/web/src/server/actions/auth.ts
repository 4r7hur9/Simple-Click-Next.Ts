"use server";

import { cookies } from "next/headers";

import { enderecoDaApi } from "../api-client.ts";

/** Nome compartilhado com a camada de cookie da sessão (T-103). */
export const NOME_DO_COOKIE_DE_RENOVACAO = "sc_refresh_token";

type ResultadoDaAcaoDeSessao =
  { readonly ok: true } | { readonly ok: false; readonly mensagem: string };

async function pedirEncerramento(
  caminho:
    "/v1/auth/sessoes/atual/encerrar" | "/v1/auth/sessoes/encerrar-todas",
): Promise<ResultadoDaAcaoDeSessao> {
  const armazenamentoDeCookies = await cookies();
  const token = armazenamentoDeCookies.get(NOME_DO_COOKIE_DE_RENOVACAO);

  // Sem cookie não há sessão local a encerrar. Ainda assim removemos qualquer
  // cookie residual para a pessoa não ficar presa a um estado inconsistente.
  if (token === undefined) {
    armazenamentoDeCookies.delete(NOME_DO_COOKIE_DE_RENOVACAO);
    return { ok: true };
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${enderecoDaApi()}${caminho}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        cookie: `${token.name}=${token.value}`,
      },
    });
  } catch {
    return {
      ok: false,
      mensagem: "Não foi possível encerrar a sessão. Tente novamente.",
    };
  }

  if (!resposta.ok) {
    return {
      ok: false,
      mensagem: "Não foi possível encerrar a sessão. Tente novamente.",
    };
  }

  // Apagar só depois da confirmação impede que um token ainda válido fique
  // ativo no servidor se a chamada tiver falhado antes de ser processada.
  armazenamentoDeCookies.delete(NOME_DO_COOKIE_DE_RENOVACAO);
  return { ok: true };
}

/** Sai apenas deste navegador, revogando antes o token de renovação na API. */
export async function sairDaConta(): Promise<void> {
  await pedirEncerramento("/v1/auth/sessoes/atual/encerrar");
}

/** Sai de todos os navegadores e dispositivos conectados à conta. */
export async function encerrarTodasAsSessoes(): Promise<void> {
  await pedirEncerramento("/v1/auth/sessoes/encerrar-todas");
}
