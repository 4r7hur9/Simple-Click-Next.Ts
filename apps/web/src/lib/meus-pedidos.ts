/**
 * Os pedidos da conta do cliente, como a tela os consome (T-604, AC-616).
 *
 * Dois pedidos à API, os dois com a sessão do cliente no cabeçalho — e por
 * isso chamados SÓ do lado do servidor do site, que é quem tem o cookie. O que
 * volta é conferido pelo contrato compartilhado antes de chegar à tela: campo
 * a mais é resposta recusada, não desenhada.
 *
 * Nunca lança: sessão vencida, pedido que não é seu e API fora do ar são
 * estados que a página sabe mostrar, não exceções.
 */
import {
  esquemaDoMeuPedido,
  esquemaDosMeusPedidos,
  type MeuPedidoNoContrato,
  type PedidoDaContaNoContrato,
} from "@simpleclick/contracts";

const API_PADRAO = "https://api.simpleclick.localhost";

/** Espera máxima pela API. A página da conta não fica pendurada em rede. */
const ESPERA_MAXIMA_EM_MS = 5_000;

function enderecoDaApi(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? API_PADRAO).replace(/\/+$/, "");
}

export type LeituraDosMeusPedidos =
  | {
      readonly estado: "ok";
      readonly pedidos: readonly PedidoDaContaNoContrato[];
    }
  | { readonly estado: "nao-autenticado" }
  | { readonly estado: "indisponivel"; readonly motivo: string };

export type LeituraDoMeuPedido =
  | { readonly estado: "encontrado"; readonly detalhe: MeuPedidoNoContrato }
  | { readonly estado: "nao-encontrado" }
  | { readonly estado: "nao-autenticado" }
  | { readonly estado: "indisponivel"; readonly motivo: string };

type RespostaDaConta =
  | { readonly estado: "resposta"; readonly resposta: Response }
  | { readonly estado: "indisponivel"; readonly motivo: string };

async function pedirComoCliente(
  caminho: string,
  tokenDeAcesso: string,
  buscar: typeof fetch,
): Promise<RespostaDaConta> {
  try {
    const resposta = await buscar(`${enderecoDaApi()}${caminho}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${tokenDeAcesso}`,
      },
    });
    return { estado: "resposta", resposta };
  } catch (erro) {
    return {
      estado: "indisponivel",
      motivo: erro instanceof Error ? erro.message : "falha de rede",
    };
  }
}

async function corpoDe(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    return undefined;
  }
}

/** Todos os pedidos do cliente logado, em todas as lojas onde ele comprou. */
export async function buscarMeusPedidos(
  tokenDeAcesso: string,
  buscar: typeof fetch = fetch,
): Promise<LeituraDosMeusPedidos> {
  const pedido = await pedirComoCliente(
    "/v1/conta/pedidos",
    tokenDeAcesso,
    buscar,
  );
  if (pedido.estado === "indisponivel") return pedido;
  const { resposta } = pedido;

  if (resposta.status === 401) return { estado: "nao-autenticado" };
  if (!resposta.ok) {
    return {
      estado: "indisponivel",
      motivo: `a API respondeu ${resposta.status}`,
    };
  }

  const conferido = esquemaDosMeusPedidos.safeParse(await corpoDe(resposta));
  if (!conferido.success) {
    return {
      estado: "indisponivel",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }
  return { estado: "ok", pedidos: conferido.data.pedidos };
}

/** Um pedido do cliente logado, pelo identificador — sem precisar do link. */
export async function buscarMeuPedido(
  pedidoId: string,
  tokenDeAcesso: string,
  buscar: typeof fetch = fetch,
): Promise<LeituraDoMeuPedido> {
  const pedido = await pedirComoCliente(
    `/v1/conta/pedidos/${encodeURIComponent(pedidoId)}`,
    tokenDeAcesso,
    buscar,
  );
  if (pedido.estado === "indisponivel") return pedido;
  const { resposta } = pedido;

  if (resposta.status === 401) return { estado: "nao-autenticado" };
  if (resposta.status === 404) return { estado: "nao-encontrado" };
  if (!resposta.ok) {
    return {
      estado: "indisponivel",
      motivo: `a API respondeu ${resposta.status}`,
    };
  }

  const conferido = esquemaDoMeuPedido.safeParse(await corpoDe(resposta));
  if (!conferido.success) {
    return {
      estado: "indisponivel",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }
  return { estado: "encontrado", detalhe: conferido.data };
}

/** Os pedidos de uma loja, na ordem em que a API os entregou. */
export interface PedidosDeUmaLoja {
  readonly apelido: string;
  readonly nome: string;
  readonly pedidos: readonly PedidoDaContaNoContrato[];
}

/**
 * Agrupa por loja, mantendo a ordem de chegada: a loja do pedido mais recente
 * vem primeiro, e dentro dela os pedidos seguem do mais novo ao mais antigo.
 */
export function agruparPedidosPorLoja(
  pedidos: readonly PedidoDaContaNoContrato[],
): readonly PedidosDeUmaLoja[] {
  const grupos = new Map<string, PedidosDeUmaLoja>();
  for (const pedido of pedidos) {
    const grupo = grupos.get(pedido.loja.apelido);
    if (grupo === undefined) {
      grupos.set(pedido.loja.apelido, {
        apelido: pedido.loja.apelido,
        nome: pedido.loja.nome,
        pedidos: [pedido],
      });
    } else {
      grupos.set(pedido.loja.apelido, {
        ...grupo,
        pedidos: [...grupo.pedidos, pedido],
      });
    }
  }
  return [...grupos.values()];
}
