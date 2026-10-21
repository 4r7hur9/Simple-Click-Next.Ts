/**
 * Repasse da checagem de endereço do cadastro de dono:
 * `GET /api/loja/aprovacao/apelido?valor=...` → `GET /v1/auth/lojas/apelido`.
 *
 * Pública (a pessoa ainda nem tem conta) e só leitura; o limite por origem
 * fica na API, que recebe o endereço do visitante com a prova da ponte.
 */
import {
  cabecalhosParaApi,
} from "../../../../../server/chamada-de-identidade.ts";
import { enderecoDaApi } from "../../../../../server/api-client.ts";

export async function GET(requisicao: Request): Promise<Response> {
  const valor = new URL(requisicao.url).searchParams.get("valor") ?? "";
  try {
    const resposta = await fetch(
      `${enderecoDaApi()}/v1/auth/lojas/apelido?valor=${encodeURIComponent(valor)}`,
      {
        cache: "no-store",
        headers: cabecalhosParaApi(requisicao),
      },
    );
    return new Response(await resposta.text(), {
      status: resposta.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { erro: "indisponivel" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
