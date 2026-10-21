/**
 * Lê, no servidor, os dados da loja em análise do dono da sessão
 * (`GET /v1/auth/lojas/:apelido`). `null` quando a API não entrega — a tela
 * então mostra só o que a sessão já sabe (nome e apelido).
 */
import { enderecoDaApi } from "./api-client.ts";

/** Os dados da loja em análise, como a API entrega ao dono. */
export interface LojaEmAnaliseNaTela {
  readonly nome: string;
  readonly tipoDeNegocio: string;
  readonly whatsapp: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
  readonly status: "PENDING_APPROVAL" | "REJECTED";
  readonly recusa: { readonly desde: string; readonly motivo: string } | null;
}

export async function lerLojaEmAnalise(
  token: string,
  apelido: string,
  buscar: typeof fetch = fetch,
): Promise<LojaEmAnaliseNaTela | null> {
  try {
    const resposta = await buscar(
      `${enderecoDaApi()}/v1/auth/lojas/${encodeURIComponent(apelido)}`,
      {
        cache: "no-store",
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
      },
    );
    if (!resposta.ok) return null;
    return (await resposta.json()) as LojaEmAnaliseNaTela;
  } catch {
    return null;
  }
}

export { emailDeSuporte } from "../lib/email-de-suporte.ts";
