import { revalidatePath } from "next/cache";

import { enderecoDaApi } from "../../../../server/api-client.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../server/session-cookie.ts";

const SECOES = new Set([
  "aparencia",
  "contato",
  "pagamento",
  "entrega",
  "pendencias",
]);
const APELIDO_DA_LOJA_DE_DESENVOLVIMENTO =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

async function encaminhar(
  requisicao: Request,
  secao: string,
): Promise<Response> {
  if (!SECOES.has(secao))
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });

  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined)
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA_DE_DESENVOLVIMENTO)}/configuracao/${secao}`,
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
    try {
      revalidatePath(`/l/${APELIDO_DA_LOJA_DE_DESENVOLVIMENTO}`);
      revalidatePath(`/l/${APELIDO_DA_LOJA_DE_DESENVOLVIMENTO}/sobre`);
      revalidatePath(`/l/${APELIDO_DA_LOJA_DE_DESENVOLVIMENTO}/catalogo`);
      revalidatePath(`/l/${APELIDO_DA_LOJA_DE_DESENVOLVIMENTO}/checkout`);
    } catch {
      // A gravação já foi confirmada pela API. Em desenvolvimento, o cache
      // pode não ter um contexto de revalidação; a próxima leitura ainda
      // receberá o valor novo quando a janela expirar.
    }
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
