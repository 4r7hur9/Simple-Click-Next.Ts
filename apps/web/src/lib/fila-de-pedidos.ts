/**
 * A fila de pedidos como a tela do painel a consome (T-600).
 *
 * A REGRA NÃO MORA AQUI. Onde cada pedido aparece, o que é novidade entre duas
 * leituras e quando o som toca é decidido em `packages/core` — a mesma regra
 * que a API usa para montar a fila. Este arquivo só a entrega à tela (que não
 * pode importar `core` direto, pela tabela de fronteiras) e junta o que é da
 * borda do navegador: buscar a fila e escrever horário e dinheiro.
 */
import {
  agruparPedidosDaFila,
  atualizarFila,
  descreverEspera,
  deveTocarAlerta,
  minutosDeEspera,
  type GruposDaFila,
  type PedidoDaFila,
} from "@simpleclick/core";

export {
  agruparPedidosDaFila,
  atualizarFila,
  descreverEspera,
  deveTocarAlerta,
  minutosDeEspera,
};
export type { GruposDaFila, PedidoDaFila };

/** Onde a tela pede a fila: a rota do próprio site, que leva a sessão à API. */
export const ENDERECO_DA_FILA = "/api/painel/pedidos";

/** Resultado de uma leitura da fila, pronto para a tela decidir o estado. */
export type LeituraDaFila =
  | { readonly estado: "ok"; readonly pedidos: readonly PedidoDaFila[] }
  | { readonly estado: "erro"; readonly motivo: string };

/** Leitor da fila. Entra por parâmetro para a prova não depender de rede. */
export type BuscarFila = () => Promise<LeituraDaFila>;

function ehPedidoDaFila(valor: unknown): valor is PedidoDaFila {
  if (typeof valor !== "object" || valor === null) return false;
  const pedido = valor as Record<string, unknown>;
  return (
    typeof pedido.id === "string" &&
    typeof pedido.numero === "number" &&
    typeof pedido.status === "string" &&
    typeof pedido.criadoEm === "string" &&
    typeof pedido.totalCentavos === "number"
  );
}

/**
 * Lê a fila inteira.
 *
 * Nunca lança: queda de rede e resposta estranha viram `erro`, porque a tela
 * precisa CONTINUAR tentando — é assim que ela se recupera sozinha (AC-602).
 */
export async function buscarFilaDoPainel(
  buscar: typeof fetch = fetch,
  endereco: string = ENDERECO_DA_FILA,
): Promise<LeituraDaFila> {
  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (causa) {
    return {
      estado: "erro",
      motivo: causa instanceof Error ? causa.message : "falha de rede",
    };
  }

  if (!resposta.ok) {
    return { estado: "erro", motivo: `a fila respondeu ${resposta.status}` };
  }

  try {
    const corpo = (await resposta.json()) as { pedidos?: unknown };
    if (!Array.isArray(corpo.pedidos) || !corpo.pedidos.every(ehPedidoDaFila))
      return { estado: "erro", motivo: "a fila veio num formato inesperado" };
    return { estado: "ok", pedidos: corpo.pedidos };
  } catch {
    return { estado: "erro", motivo: "a resposta da fila não era JSON" };
  }
}

const FORMATO_DE_DINHEIRO = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const FORMATO_DE_HORARIO = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Centavos inteiros em reais — só na borda da tela (P-005). */
export function escreverDinheiroDaFila(centavos: number): string {
  return FORMATO_DE_DINHEIRO.format(centavos / 100);
}

/** O horário em que o pedido entrou, no relógio do computador da loja. */
export function escreverHorarioDaFila(criadoEm: string): string {
  return FORMATO_DE_HORARIO.format(new Date(criadoEm));
}

/** De onde o pedido veio: o site ou o balcão. */
export function rotuloDoCanal(canal: string): string {
  if (canal === "MANUAL") return "Balcão";
  if (canal === "ONLINE") return "Site";
  return canal;
}

/** Como o pedido chega ao cliente. */
export function rotuloDaEntrega(entrega: string): string {
  return entrega === "PICKUP" ? "Retirada" : "Entrega";
}
