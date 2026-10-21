/** Os tipos de negócio para o formulário de nova loja (lista pública da API). */
import { enderecoDaApi } from "../../../../../server/api-client.ts";

export async function GET(): Promise<Response> {
  try {
    const resposta = await fetch(`${enderecoDaApi()}/v1/tipos-de-negocio`, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    } as RequestInit);
    return new Response(await resposta.text(), {
      status: resposta.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return Response.json({ erro: "indisponivel" }, { status: 503 });
  }
}
