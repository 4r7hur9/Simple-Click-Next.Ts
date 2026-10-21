/**
 * Quem está fechando o pedido: a conta do cookie e os endereços salvos dela.
 *
 * Lido no SERVIDOR, com o token do cookie (P-008): o navegador recebe só o
 * nome, o e-mail, o telefone e os endereços, nunca o token. Sem cookie não há
 * chamada nenhuma; token vencido, API fora do ar ou resposta estranha valem
 * "ninguém logado" — e a janela pede para entrar, que é o caminho seguro.
 *
 * A leitura de `/v1/eu` é TOLERANTE: só os três campos da identidade
 * interessam, e um campo novo na resposta não pode impedir alguém de comprar.
 */
import {
  esquemaDosEnderecosSalvos,
  type EnderecoSalvoNoContrato,
} from "@simpleclick/contracts";

import { enderecoDaApi } from "./api-client.ts";

const ESPERA_MAXIMA_EM_MS = 4000;

export interface ContaQueFecha {
  readonly nome: string;
  readonly email: string;
  readonly telefone: string | null;
}

export interface LeituraDaContaQueFecha {
  readonly conta: ContaQueFecha | null;
  readonly enderecos: readonly EnderecoSalvoNoContrato[];
}

const NINGUEM: LeituraDaContaQueFecha = { conta: null, enderecos: [] };

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

async function pedir(
  caminho: string,
  token: string,
  buscar: typeof fetch,
): Promise<unknown> {
  try {
    const resposta = await buscar(`${enderecoDaApi()}${caminho}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (!resposta.ok) return null;
    return await resposta.json();
  } catch {
    return null;
  }
}

/** A conta do token e os endereços dela, em paralelo. */
export async function lerContaQueFecha(
  token: string | undefined,
  buscar: typeof fetch = fetch,
): Promise<LeituraDaContaQueFecha> {
  if (token === undefined || token === "") return NINGUEM;

  const [eu, lista] = await Promise.all([
    pedir("/v1/eu", token, buscar),
    pedir("/v1/conta/enderecos", token, buscar),
  ]);

  const identidade =
    typeof eu === "object" && eu !== null
      ? (eu as { identidade?: Record<string, unknown> }).identidade
      : undefined;
  const email = texto(identidade?.["email"]);
  if (identidade === undefined || email === null) return NINGUEM;

  const enderecos = esquemaDosEnderecosSalvos.safeParse(lista);
  return {
    conta: {
      // Conta sem nome é rara (o cadastro pede); aí vale o começo do e-mail,
      // que é o mesmo que a API põe no pedido.
      nome: texto(identidade["nome"]) ?? email.split("@")[0] ?? email,
      email,
      telefone: texto(identidade["telefone"]),
    },
    enderecos: enderecos.success ? enderecos.data.enderecos : [],
  };
}
