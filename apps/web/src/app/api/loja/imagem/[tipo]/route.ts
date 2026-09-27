/**
 * Envio da logo e da capa da loja para a API (AC-916, AC-918).
 *
 * Encaminha os BYTES como chegaram, com o tipo declarado pelo navegador. Quem
 * decide se é imagem é a API, pela assinatura do arquivo — o tipo declarado e
 * a extensão não provam nada. O limite daqui é só uma trava contra corpo
 * gigante; o limite que o dono lê na recusa é o da API.
 */
import { revalidatePath } from "next/cache";

import { enderecoDaApi } from "../../../../../server/api-client.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../../server/session-cookie.ts";

const TIPOS = new Set(["logo", "capa"]);
const APELIDO_DA_LOJA_DE_DESENVOLVIMENTO =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

/** Trava do encaminhamento: acima disto nem vale a ida à API. */
const MAXIMO_ENCAMINHADO_EM_BYTES = 8 * 1024 * 1024;

export async function PUT(
  requisicao: Request,
  contexto: { params: Promise<{ tipo: string }> },
) {
  const { tipo } = await contexto.params;
  if (!TIPOS.has(tipo)) {
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });
  }

  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  const bytes = await requisicao.arrayBuffer();
  if (bytes.byteLength > MAXIMO_ENCAMINHADO_EM_BYTES) {
    return Response.json({ erro: "imagem_grande_demais" }, { status: 413 });
  }

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA_DE_DESENVOLVIMENTO)}/configuracao/aparencia/imagem/${tipo}`,
    {
      method: "PUT",
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        "content-type":
          requisicao.headers.get("content-type") ?? "application/octet-stream",
      },
      body: bytes,
    },
  );

  if (resposta.ok) {
    try {
      revalidatePath(`/l/${APELIDO_DA_LOJA_DE_DESENVOLVIMENTO}`);
      revalidatePath(`/l/${APELIDO_DA_LOJA_DE_DESENVOLVIMENTO}/sobre`);
    } catch {
      // A gravação já foi confirmada; a vitrine pega o valor novo quando a
      // janela de cache expirar.
    }
  }

  return new Response(await resposta.text(), {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      "content-type":
        resposta.headers.get("content-type") ?? "application/json",
    },
  });
}
