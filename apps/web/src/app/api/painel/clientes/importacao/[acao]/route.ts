/**
 * O importador de clientes (card #61), sobre o contrato do #60.
 *
 * Diferente das outras rotas de clientes, o corpo aqui é o ARQUIVO CRU: vai à
 * API como `application/octet-stream`, nunca como JSON (o leitor geral da API
 * consome JSON com limite de 1 MB). A consulta — nome do arquivo, mapeamento
 * `mapa.<campo>`, regra dos repetidos — passa como veio. Quem decide se a
 * pessoa pode é a API (permissão `clientes`).
 */
import { TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES } from "@simpleclick/contracts";

import { enderecoDaApi } from "../../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../../server/loja-do-painel.ts";
import { recusarOrigemDeFora } from "../../../../../../server/protecao-da-conta.ts";

const ACOES = new Set(["previa", "confirmar"]);

type Contexto = { params: Promise<{ acao: string }> };

export async function POST(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  const recusada = recusarOrigemDeFora(requisicao);
  if (recusada !== null) return recusada;

  const { acao } = await contexto.params;
  if (!ACOES.has(acao)) {
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });
  }

  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;

  const corpo = await requisicao.arrayBuffer();
  if (corpo.byteLength > TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES) {
    return Response.json(
      {
        erro: "arquivo_grande_demais",
        mensagem: "O arquivo passa de 5 MB. Divida em arquivos menores.",
      },
      { status: 413, headers: { "cache-control": "no-store" } },
    );
  }

  const consulta = new URL(requisicao.url).search;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/clientes/importacao/${acao}${consulta}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${sessao.token}`,
        origin: new URL(requisicao.url).origin,
        "content-type": "application/octet-stream",
      },
      body: corpo,
    },
  );

  const devolvido = await resposta.text();
  const tipo = resposta.headers.get("content-type");
  return new Response(devolvido === "" ? null : devolvido, {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      ...(tipo === null ? {} : { "content-type": tipo }),
    },
  });
}
