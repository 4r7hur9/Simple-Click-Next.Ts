/**
 * A loja de origem do cliente, conferida na API (card #135, AC-11123).
 *
 * O cookie só diz QUAL apelido procurar. Quem diz se a loja existe, e com que
 * apelido e nome ela aparece, é a resposta da API (`buscarVitrine`): um cookie
 * forjado ou de uma loja que saiu do ar não vira link.
 */
import { cookies } from "next/headers";

import type { LojaNaBarra } from "../lib/quem-esta-logado.ts";
import {
  apelidoDeOrigemValido,
  COOKIE_DA_LOJA_DE_ORIGEM,
} from "../lib/loja-de-origem.ts";
import { buscarVitrine } from "./vitrine.ts";

export async function lojaDeOrigemDoPedidoAtual(
  buscar: typeof buscarVitrine = buscarVitrine,
): Promise<LojaNaBarra | undefined> {
  const armazenamento = await cookies();
  const apelido = apelidoDeOrigemValido(
    armazenamento.get(COOKIE_DA_LOJA_DE_ORIGEM)?.value,
  );
  if (apelido === undefined) return undefined;
  try {
    const resultado = await buscar(apelido);
    if (resultado.estado !== "encontrada") return undefined;
    const { loja } = resultado.vitrine;
    return { apelido: loja.apelido, nome: loja.nome };
  } catch {
    // API fora do ar: a conta abre normalmente, só sem a volta.
    return undefined;
  }
}
