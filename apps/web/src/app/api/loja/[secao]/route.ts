import { SECOES_DO_DONO } from "@simpleclick/contracts";

import { enderecoDaApi } from "../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../server/loja-do-painel.ts";
import { renovarVitrineDaLoja } from "../../../../server/renovar-vitrine.ts";
import { recusarAcaoDeFora } from "../../../../server/protecao-da-conta.ts";

/**
 * O que o site encaminha: as seções do dono (AC-921) e os avisos do painel.
 * Lista fechada — o que não está aqui responde 404 sem ir à API.
 */
const SECOES = new Set<string>([...SECOES_DO_DONO, "pendencias"]);

async function encaminhar(
  requisicao: Request,
  secao: string,
): Promise<Response> {
  if (!SECOES.has(secao))
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });

  // Card #134: escrita de outro site, ou corpo que não é JSON, para aqui.
  const recusada = await recusarAcaoDeFora(requisicao);
  if (recusada !== null) return recusada;

  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/configuracao/${secao}`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        ...(requisicao.method === "PUT"
          ? { "content-type": "application/json" }
          : {}),
      },
      ...(requisicao.method === "PUT" ? { body: await requisicao.text() } : {}),
    },
  );

  const corpo = await resposta.text();
  if (resposta.status === 204) {
    renovarVitrineDaLoja(sessao.apelido);
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  }

  return new Response(corpo, {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      "content-type":
        resposta.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(
  requisicao: Request,
  contexto: { params: Promise<{ secao: string }> },
) {
  const { secao } = await contexto.params;
  return encaminhar(requisicao, secao);
}

export async function PUT(
  requisicao: Request,
  contexto: { params: Promise<{ secao: string }> },
) {
  const { secao } = await contexto.params;
  return encaminhar(requisicao, secao);
}
