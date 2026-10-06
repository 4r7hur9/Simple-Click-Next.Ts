"use server";

/**
 * Sair deste dispositivo e encerrar todas as sessões (AC-112, AC-113,
 * T-113), como ações do servidor: os formulários da tela de segurança
 * funcionam sem JavaScript e o cookie de renovação nunca chega ao navegador
 * como texto.
 *
 * Sair revoga no servidor ANTES de apagar o cookie: se a API falhar, o
 * cookie fica e a pessoa tenta de novo, em vez de deixar o token válido
 * escondido em outro lugar.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { enderecoDaApi } from "../api-client.ts";
import {
  NOME_DO_COOKIE_DE_ACESSO,
  NOME_DO_COOKIE_DE_RENOVACAO,
} from "../session-cookie.ts";

type Caminho =
  "/v1/auth/sessoes/atual/encerrar" | "/v1/auth/sessoes/encerrar-todas";

/** Pede o encerramento à API; devolve se ela confirmou. */
async function pedirEncerramento(caminho: Caminho): Promise<boolean> {
  const armazenamento = await cookies();
  const renovacao = armazenamento.get(NOME_DO_COOKIE_DE_RENOVACAO)?.value;
  const acesso = armazenamento.get(NOME_DO_COOKIE_DE_ACESSO)?.value;

  // Sem cookie nenhum não há sessão local a encerrar.
  if (renovacao === undefined && acesso === undefined) return true;

  const cabecalhos: Record<string, string> = {
    accept: "application/json",
    "x-simpleclick-client": "navegador",
    // A API confere a origem antes de toda escrita.
    origin: process.env["URL_DO_SITE"] ?? "http://localhost:3000",
  };
  if (renovacao !== undefined) {
    cabecalhos["cookie"] = `sc_refresh=${encodeURIComponent(renovacao)}`;
  }
  if (acesso !== undefined) cabecalhos["authorization"] = `Bearer ${acesso}`;

  try {
    const resposta = await fetch(`${enderecoDaApi()}${caminho}`, {
      method: "POST",
      cache: "no-store",
      headers: cabecalhos,
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

/** Apaga os dois cookies da sessão deste navegador. */
async function apagarCookiesDaSessao(): Promise<void> {
  const armazenamento = await cookies();
  armazenamento.delete(NOME_DO_COOKIE_DE_RENOVACAO);
  armazenamento.delete(NOME_DO_COOKIE_DE_ACESSO);
}

/** Sai apenas deste navegador, revogando antes o token na API. */
export async function sairDaConta(): Promise<void> {
  if (!(await pedirEncerramento("/v1/auth/sessoes/atual/encerrar"))) {
    redirect("/minha-conta/seguranca?estado=erro");
  }
  await apagarCookiesDaSessao();
  redirect("/entrar");
}

/** Sai de todos os navegadores e dispositivos conectados à conta. */
export async function encerrarTodasAsSessoes(): Promise<void> {
  if (!(await pedirEncerramento("/v1/auth/sessoes/encerrar-todas"))) {
    redirect("/minha-conta/seguranca?estado=erro");
  }
  await apagarCookiesDaSessao();
  redirect("/entrar");
}
