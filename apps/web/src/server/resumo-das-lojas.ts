/**
 * O que os cartões da escolha de loja mostram além do nome (card #32): a logo
 * e quantos pedidos a loja teve hoje. Vem de duas rotas que já existem — a
 * vitrine pública (logo) e as métricas do painel (`periodo=hoje`) — e cada
 * falha vira "sem dado" naquele campo, nunca erro da tela: escolher a loja
 * não pode depender de a logo ter carregado.
 */
import type { LojaDaSessao } from "@simpleclick/contracts";

import type { ResumoDaLoja } from "../lib/resumo-da-loja.ts";
import { enderecoDaApi, ESPERA_MAXIMA_EM_MS } from "./api-client.ts";


async function lerJson(url: string, token?: string): Promise<unknown> {
  try {
    const resposta = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: {
        accept: "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
    });
    return resposta.ok ? await resposta.json() : null;
  } catch {
    return null;
  }
}

function campo(valor: unknown, ...caminho: string[]): unknown {
  let atual = valor;
  for (const chave of caminho) {
    if (typeof atual !== "object" || atual === null) return undefined;
    atual = (atual as Record<string, unknown>)[chave];
  }
  return atual;
}

/** O resumo de uma loja. Só lojas ativas têm vitrine e painel completo. */
export async function resumoDaLoja(
  loja: LojaDaSessao,
  token: string,
): Promise<ResumoDaLoja> {
  if (loja.situacao !== "ACTIVE") return { logo: null, pedidosHoje: null };
  const apelido = encodeURIComponent(loja.apelido);
  const base = enderecoDaApi();
  const [vitrine, metricas] = await Promise.all([
    lerJson(`${base}/v1/vitrine/${apelido}`),
    lerJson(`${base}/v1/lojas/${apelido}/metricas?periodo=hoje`, token),
  ]);
  const logo = campo(vitrine, "loja", "logo") ?? campo(vitrine, "logo");
  const pedidos = campo(metricas, "resumo", "pedidos");
  return {
    logo: typeof logo === "string" && logo !== "" ? logo : null,
    pedidosHoje: typeof pedidos === "number" ? pedidos : null,
  };
}

/** Os resumos de todas as lojas, pelo apelido. */
export async function resumosDasLojas(
  lojas: readonly LojaDaSessao[],
  token: string,
): Promise<ReadonlyMap<string, ResumoDaLoja>> {
  const pares = await Promise.all(
    lojas.map(
      async (loja) =>
        [loja.apelido, await resumoDaLoja(loja, token)] as const,
    ),
  );
  return new Map(pares);
}
