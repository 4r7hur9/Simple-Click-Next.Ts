import {
  esquemaDoAcompanhamento,
  type AcompanhamentoNoContrato,
} from "@simpleclick/contracts";

const API_PADRAO = "https://api.simpleclick.localhost";

function enderecoDaApi(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? API_PADRAO).replace(/\/+$/, "");
}

export type ResultadoDoAcompanhamento =
  | {
      readonly estado: "encontrado";
      readonly acompanhamento: AcompanhamentoNoContrato;
    }
  | { readonly estado: "nao-encontrado" }
  | { readonly estado: "indisponivel"; readonly motivo: string };

/** Busca um único pedido pelo token longo do link público. */
export async function buscarAcompanhamento(
  apelidoDaLoja: string,
  tokenDoPedido: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDoAcompanhamento> {
  let resposta: Response;
  try {
    resposta = await buscar(
      `${enderecoDaApi()}/v1/vitrine/${encodeURIComponent(apelidoDaLoja)}/pedido/${encodeURIComponent(tokenDoPedido)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
        headers: { accept: "application/json" },
      },
    );
  } catch {
    return {
      estado: "indisponivel",
      motivo: "falha de rede",
    };
  }

  if (resposta.status === 404) return { estado: "nao-encontrado" };
  if (!resposta.ok) {
    return {
      estado: "indisponivel",
      motivo: `a API respondeu ${resposta.status}`,
    };
  }

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    return { estado: "indisponivel", motivo: "a resposta não era JSON" };
  }

  const conferido = esquemaDoAcompanhamento.safeParse(corpo);
  if (!conferido.success) {
    return {
      estado: "indisponivel",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }

  return { estado: "encontrado", acompanhamento: conferido.data };
}
