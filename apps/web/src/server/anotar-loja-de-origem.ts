import type { NextRequest, NextResponse } from "next/server";

import {
  apelidoDaLojaNoCaminho,
  COOKIE_DA_LOJA_DE_ORIGEM,
  DURACAO_DA_LOJA_DE_ORIGEM_EM_SEGUNDOS,
} from "../lib/loja-de-origem.ts";

/** O Next pede a página antes do clique (prefetch): isso não é visita. */
function ehPrefetch(requisicao: NextRequest): boolean {
  const { headers } = requisicao;
  return (
    headers.has("next-router-prefetch") ||
    headers.get("purpose") === "prefetch" ||
    (headers.get("sec-purpose") ?? "").includes("prefetch")
  );
}

/**
 * Abriu uma página de loja: anota o apelido para a conta oferecer "Voltar à
 * loja" (card #135). O cookie é só do servidor e só guarda um apelido com o
 * formato certo; a conta ainda confere a loja na API antes de mostrar o link.
 */
export function anotarLojaDeOrigem(
  requisicao: NextRequest,
  resposta: NextResponse,
): NextResponse {
  if (requisicao.method !== "GET" || ehPrefetch(requisicao)) return resposta;
  const apelido = apelidoDaLojaNoCaminho(requisicao.nextUrl.pathname);
  if (apelido === undefined) return resposta;
  if (requisicao.cookies.get(COOKIE_DA_LOJA_DE_ORIGEM)?.value === apelido) {
    return resposta;
  }
  resposta.cookies.set({
    name: COOKIE_DA_LOJA_DE_ORIGEM,
    value: apelido,
    path: "/",
    httpOnly: true,
    secure: requisicao.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: DURACAO_DA_LOJA_DE_ORIGEM_EM_SEGUNDOS,
  });
  return resposta;
}
