/**
 * A cidade do endereço padrão do cliente, para o topo (card #105, LGPD).
 *
 * Lida no SERVIDOR com o token do cookie e entregue ao navegador SÓ como
 * `{ cidade, uf }`: sem logradouro, destinatário nem ponto de referência. Sem
 * cookie não há chamada nenhuma; erro, tempo esgotado, sessão vencida ou
 * resposta estranha valem `null` ("Definir localização") e NUNCA redirecionam.
 * Nunca em cache entre pessoas: é `no-store` e o `cache()` do React vale só
 * dentro deste pedido (padrão de `conta-do-fechamento.ts`).
 */
import { headers } from "next/headers";
import { cache } from "react";
import { esquemaDosEnderecosSalvos } from "@simpleclick/contracts";

import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

const ESPERA_MAXIMA_EM_MS = 2500;

export interface CidadeDoTopo {
  readonly cidade: string;
  readonly uf: string;
}

/** Só o endereço PADRÃO conta; sem padrão, sem cidade ou sem UF: `null`. */
export function cidadeDoEnderecoPadrao(corpo: unknown): CidadeDoTopo | null {
  const lido = esquemaDosEnderecosSalvos.safeParse(corpo);
  if (!lido.success) return null;
  const padrao = lido.data.enderecos.find((endereco) => endereco.padrao);
  const cidade = padrao?.cidade?.trim() ?? "";
  const uf = padrao?.estado?.trim().toUpperCase() ?? "";
  if (cidade === "" || !/^[A-Z]{2}$/.test(uf)) return null;
  return { cidade, uf };
}

export async function lerCidadeDoTopo(
  cabecalhoCookie: string | null,
  buscar: typeof fetch = fetch,
): Promise<CidadeDoTopo | null> {
  const token = lerTokenDeAcessoDoCookie(cabecalhoCookie);
  if (token === undefined) return null;
  try {
    const resposta = await buscar(`${enderecoDaApi()}/v1/conta/enderecos`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (!resposta.ok) return null;
    return cidadeDoEnderecoPadrao(await resposta.json());
  } catch {
    return null;
  }
}

/** Uma leitura por pedido, mesmo que o topo apareça em mais de um lugar. */
export const cidadeDoPedidoAtual = cache(
  async (): Promise<CidadeDoTopo | null> =>
    lerCidadeDoTopo((await headers()).get("cookie")),
);
