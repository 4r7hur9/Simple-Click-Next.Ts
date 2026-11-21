/**
 * Guarda da administração no SERVIDOR (card #163, T-1).
 *
 * Nenhuma tela de `/admin` sai do servidor sem a API confirmar, AO VIVO, que
 * a conta do cookie tem grant ativo de administração da plataforma
 * (`adminDaPlataforma` do `GET /v1/eu`, lido da tabela de administradores a
 * cada pergunta). O claim do JWT NÃO é usado: revogar o grant vale na hora.
 *
 * - sem cookie de acesso, ou 401 do `/v1/eu`: manda para `/entrar`, levando
 *   de volta o caminho pedido (conferido por `destinoSeguro`);
 * - qualquer outra coisa (não admin, 403, 500, tempo esgotado, JSON
 *   estranho, campo ausente): 404 neutro. Na dúvida, fecha (fail closed).
 *
 * A pergunta à API é feita uma vez por requisição (`cache` do React), mesmo
 * que o layout e a página chamem a guarda. Layout e página chamam os dois
 * porque a navegação parcial do App Router pode não reexecutar o layout.
 *
 * O `fetch` mora aqui, fora de `app/(admin)`: as páginas da administração
 * seguem sem buscar dado nenhum (varredura `admin-varredura`).
 */
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { comDestino, destinoSeguro } from "../lib/destino-seguro.ts";
import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

/** A guarda não segura a página para sempre: passou disso, 404. */
const ESPERA_MAXIMA_EM_MS = 2500;

/** O que a API disse sobre a conta do cookie. */
export type AcessoDaAdministracao = "admin" | "sem-sessao" | "negado";

/**
 * Pergunta à API se a conta dos cookies recebidos administra a plataforma.
 * Função pura de rede (sem `headers()`), para ser testada sem o Next.
 */
export async function acessoDaAdministracao(
  cabecalhoCookie: string | null,
  buscar: typeof fetch = fetch,
): Promise<AcessoDaAdministracao> {
  const token = lerTokenDeAcessoDoCookie(cabecalhoCookie);
  if (token === undefined) return "sem-sessao";
  try {
    const resposta = await buscar(`${enderecoDaApi()}/v1/eu`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (resposta.status === 401) return "sem-sessao";
    if (!resposta.ok) return "negado";
    const corpo: unknown = await resposta.json();
    if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) {
      return "negado";
    }
    return (corpo as Record<string, unknown>)["adminDaPlataforma"] === true
      ? "admin"
      : "negado";
  } catch {
    return "negado";
  }
}

/** Uma pergunta por requisição, por mais telas que chamem a guarda. */
const acessoDoPedidoAtual = cache(async (): Promise<AcessoDaAdministracao> =>
  acessoDaAdministracao((await headers()).get("cookie")),
);

/**
 * Barra quem não administra a plataforma antes de qualquer coisa da tela
 * ser montada. Volta normalmente só com grant ativo; nos outros casos lança
 * o `redirect` ou o `notFound` do Next.
 */
export async function exigirAdministracaoDaPlataforma(
  caminho: string,
): Promise<void> {
  const acesso = await acessoDoPedidoAtual();
  if (acesso === "admin") return;
  if (acesso === "sem-sessao") {
    redirect(comDestino("/entrar", destinoSeguro(caminho)));
  }
  notFound();
}
