"use server";

/**
 * Sair deste dispositivo e encerrar todas as sessões (AC-112, AC-113,
 * T-113), como ações do servidor: os formulários da tela de segurança
 * funcionam sem JavaScript e o cookie de renovação nunca chega ao navegador
 * como texto.
 *
 * Sair revoga no servidor e SEMPRE apaga os cookies deste navegador (card
 * #111, AC-11119): se a API falhar, a pessoa sai mesmo assim (era pior ficar
 * logada num aparelho compartilhado) e é levada a `/entrar?saida=parcial`,
 * que diz que a conexão pode continuar aberta no servidor. "Encerrar todas as
 * sessões" mantém o contrário: a promessa dela é sobre os outros aparelhos, e
 * se falhar nada foi encerrado, então os cookies ficam para tentar de novo.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { destinoDepoisDeSair } from "../../lib/quem-esta-logado.ts";
import { enderecoDaApi } from "../api-client.ts";
import {
  dominioDoCookieDeSessao,
  NOME_DO_COOKIE_DE_ACESSO,
  NOME_DO_COOKIE_DE_RENOVACAO,
} from "../session-cookie.ts";

/** Saiu deste navegador, mas a API não confirmou a revogação (AC-11119). */
const DESTINO_DA_SAIDA_PARCIAL = "/entrar?saida=parcial";

type Caminho =
  "/v1/auth/sessoes/atual/encerrar" | "/v1/auth/sessoes/encerrar-todas";

/** Quanto esperar a API: o Sair não pode travar com ela fora do ar. */
const ESPERA_DA_REVOGACAO_EM_MS = 4_000;

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
      signal: AbortSignal.timeout(ESPERA_DA_REVOGACAO_EM_MS),
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

/**
 * Apaga os dois cookies da sessão deste navegador. Os dois nascem com o
 * domínio compartilhado (`dominioDoCookieDeSessao`), e o navegador só apaga
 * cookie de domínio quando a ordem de apagar leva o mesmo domínio.
 */
async function apagarCookiesDaSessao(): Promise<void> {
  const armazenamento = await cookies();
  const dominio = dominioDoCookieDeSessao();
  for (const nome of [NOME_DO_COOKIE_DE_RENOVACAO, NOME_DO_COOKIE_DE_ACESSO]) {
    armazenamento.delete({
      name: nome,
      path: "/",
      ...(dominio === undefined ? {} : { domain: dominio }),
    });
  }
}

/** Sai apenas deste navegador, revogando antes o token na API. */
export async function sairDaConta(): Promise<void> {
  const revogada = await pedirEncerramento("/v1/auth/sessoes/atual/encerrar");
  await apagarCookiesDaSessao();
  redirect(revogada ? "/entrar" : DESTINO_DA_SAIDA_PARCIAL);
}

/** Sai de todos os navegadores e dispositivos conectados à conta. */
export async function encerrarTodasAsSessoes(): Promise<void> {
  if (!(await pedirEncerramento("/v1/auth/sessoes/encerrar-todas"))) {
    redirect("/conta/seguranca?estado=erro");
  }
  await apagarCookiesDaSessao();
  redirect("/entrar");
}

/**
 * Sair pela barra do topo (card #22): mesma revogação de `sairDaConta`, mas
 * volta para a página da loja em que a pessoa estava, ou para o início
 * quando a página pedia sessão. O caminho é conferido de novo aqui: o
 * cliente não escolhe destino fora do site.
 */
export async function sairPelaBarra(caminho: string): Promise<void> {
  const revogada = await pedirEncerramento("/v1/auth/sessoes/atual/encerrar");
  await apagarCookiesDaSessao();
  redirect(revogada ? destinoDepoisDeSair(caminho) : DESTINO_DA_SAIDA_PARCIAL);
}
