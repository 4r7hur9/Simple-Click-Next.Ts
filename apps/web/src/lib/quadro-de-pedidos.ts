/**
 * O quadro de pedidos por dia (kanban do painel — card #33), como a tela o
 * consome.
 *
 * AS REGRAS DE ETAPA NÃO SÃO REESCRITAS AQUI. As seis colunas e o caminho de
 * cada forma de receber vêm de `@simpleclick/contracts` (`ETAPAS_DO_PEDIDO`),
 * e quem decide de verdade se um passo vale é a API (`409 transicao_invalida`).
 * O que a tela faz é só avisar ANTES, com a frase certa, para o dono não
 * precisar errar para descobrir.
 */
import { lerReais, semAcento } from "./filtros-do-painel.ts";
import {
  ETAPAS_DO_PEDIDO,
  etapasDaForma,
  rotuloDaEtapa,
  type EtapaDoPedido,
} from "@simpleclick/contracts";

export { ETAPAS_DO_PEDIDO, rotuloDaEtapa };
export type { EtapaDoPedido };

export interface PedidoDoQuadro {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  /** `ONLINE` (site) ou `MANUAL` (balcão). */
  readonly canal: string;
  /** `DELIVERY` ou `PICKUP`. */
  readonly entrega: string;
  readonly cliente: string;
  /** Dígitos do telefone, só para a busca do painel (a tela não os mostra). */
  readonly buscaTelefone?: string | null;
  readonly totalCentavos: number;
  readonly criadoEm: string;
  readonly aguardandoConfirmacaoWhatsapp: boolean;
  readonly pagamento: string | null;
  readonly itens: readonly {
    readonly quantidade: number;
    readonly nome: string;
  }[];
  readonly itensAMais: number;
  readonly motivoCancelamento: string | null;
  readonly deOutroDia: boolean;
}

export interface QuadroDoDia {
  readonly dia: string;
  readonly hoje: string;
  readonly fuso: string;
  readonly pedidos: readonly PedidoDoQuadro[];
}

export type LeituraDoQuadro =
  | { readonly estado: "ok"; readonly quadro: QuadroDoDia }
  | { readonly estado: "erro"; readonly motivo: string };

/** Leitor do quadro. Entra por parâmetro para a prova não depender de rede. */
export type BuscarQuadro = (dia: string) => Promise<LeituraDoQuadro>;

export const ENDERECO_DO_QUADRO = "/api/painel/pedidos";

/** `hoje` pede o dia da loja; senão, `aaaa-mm-dd`. */
export const DIA_DE_HOJE = "hoje";

function ehPedidoDoQuadro(valor: unknown): valor is PedidoDoQuadro {
  if (typeof valor !== "object" || valor === null) return false;
  const pedido = valor as Record<string, unknown>;
  return (
    typeof pedido.id === "string" &&
    typeof pedido.numero === "number" &&
    typeof pedido.status === "string" &&
    typeof pedido.entrega === "string" &&
    typeof pedido.criadoEm === "string" &&
    typeof pedido.totalCentavos === "number" &&
    Array.isArray(pedido.itens)
  );
}

/**
 * Lê o quadro de um dia. Nunca lança: queda e resposta estranha viram `erro`,
 * porque a tela continua tentando sozinha.
 */
export async function buscarQuadroDoDia(
  dia: string,
  buscar: typeof fetch = fetch,
): Promise<LeituraDoQuadro> {
  let resposta: Response;
  try {
    resposta = await buscar(
      `${ENDERECO_DO_QUADRO}?${new URLSearchParams({ dia }).toString()}`,
      { cache: "no-store", headers: { accept: "application/json" } },
    );
  } catch (causa) {
    return {
      estado: "erro",
      motivo: causa instanceof Error ? causa.message : "falha de rede",
    };
  }
  if (!resposta.ok) {
    return { estado: "erro", motivo: `o quadro respondeu ${resposta.status}` };
  }
  try {
    const corpo = (await resposta.json()) as Partial<QuadroDoDia>;
    if (
      typeof corpo.dia !== "string" ||
      typeof corpo.hoje !== "string" ||
      !Array.isArray(corpo.pedidos) ||
      !corpo.pedidos.every(ehPedidoDoQuadro)
    ) {
      return { estado: "erro", motivo: "o quadro veio num formato inesperado" };
    }
    return {
      estado: "ok",
      quadro: {
        dia: corpo.dia,
        hoje: corpo.hoje,
        fuso: corpo.fuso ?? "America/Sao_Paulo",
        pedidos: corpo.pedidos,
      },
    };
  } catch {
    return { estado: "erro", motivo: "a resposta do quadro não era JSON" };
  }
}

// ---------------------------------------------------------------------------
// As colunas
// ---------------------------------------------------------------------------

/** O status de cada coluna, na ordem do quadro. */
export const STATUS_DAS_COLUNAS: readonly string[] = ETAPAS_DO_PEDIDO.map(
  (etapa) => etapa.status,
);

/** Os pedidos de uma coluna (status), do mais antigo para o mais novo. */
export function pedidosDaColuna(
  pedidos: readonly PedidoDoQuadro[],
  status: string,
): readonly PedidoDoQuadro[] {
  return pedidos.filter((pedido) => pedido.status === status);
}

export function pedidosCancelados(
  pedidos: readonly PedidoDoQuadro[],
): readonly PedidoDoQuadro[] {
  return pedidos.filter((pedido) => pedido.status === "CANCELLED");
}

/** A etapa que vem logo depois, para a forma de receber do pedido; ou `null`. */
export function proximaEtapa(pedido: {
  readonly status: string;
  readonly entrega: string;
}): EtapaDoPedido | null {
  const caminho = etapasDaForma(pedido.entrega);
  const indice = caminho.findIndex((etapa) => etapa.status === pedido.status);
  if (indice === -1) return null;
  return caminho[indice + 1] ?? null;
}

export type Movimento =
  | { readonly ok: true; readonly status: string; readonly acao: string }
  | { readonly ok: false; readonly recusa: string };

/** O verbo do botão que leva o pedido à próxima etapa. */
const ACAO_DE_AVANCAR: Readonly<Record<string, string>> = {
  ACCEPTED: "Confirmar",
  PREPARING: "Iniciar preparo",
  READY_FOR_PICKUP: "Pronto para retirada",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluir",
};

/** O texto do botão rápido de um pedido, ou `null` quando não há próximo passo. */
export function acaoDeAvancar(pedido: {
  readonly status: string;
  readonly entrega: string;
}): string | null {
  const proxima = proximaEtapa(pedido);
  return proxima === null
    ? null
    : (ACAO_DE_AVANCAR[proxima.status] ?? proxima.rotulo);
}

/**
 * Avalia soltar o pedido numa coluna. Só vale o passo seguinte do caminho do
 * pedido; todo o resto volta com a explicação em português de balcão.
 */
export function avaliarMovimento(
  pedido: { readonly status: string; readonly entrega: string },
  destino: string,
): Movimento {
  const rotuloDoDestino = rotuloDaEtapa(destino);
  const entrega = pedido.entrega === "PICKUP" ? "retirada" : "entrega";

  if (pedido.status === "CANCELLED") {
    return { ok: false, recusa: "Pedido cancelado não volta para o quadro." };
  }
  if (pedido.status === "COMPLETED") {
    return { ok: false, recusa: "Pedido concluído não muda de etapa." };
  }
  if (destino === pedido.status) {
    return { ok: false, recusa: "O pedido já está nesta etapa." };
  }

  const caminho = etapasDaForma(pedido.entrega);
  if (!caminho.some((etapa) => etapa.status === destino)) {
    return {
      ok: false,
      recusa:
        destino === "OUT_FOR_DELIVERY"
          ? "Pedido de retirada não passa por “Saiu para entrega”. Use “Retirada”."
          : "Pedido de entrega não passa por “Retirada”. Use “Saiu para entrega”.",
    };
  }

  const proxima = proximaEtapa(pedido);
  if (proxima?.status === destino) {
    return {
      ok: true,
      status: destino,
      acao: ACAO_DE_AVANCAR[destino] ?? rotuloDoDestino,
    };
  }

  const indiceAtual = caminho.findIndex((e) => e.status === pedido.status);
  const indiceDestino = caminho.findIndex((e) => e.status === destino);
  if (indiceDestino < indiceAtual) {
    return {
      ok: false,
      recusa:
        "O pedido não volta de etapa. Se foi engano, cancele e lance de novo.",
    };
  }
  return {
    ok: false,
    recusa: `Avance uma etapa por vez. O próximo passo deste pedido de ${entrega} é “${proxima?.rotulo ?? rotuloDoDestino}”.`,
  };
}

// ---------------------------------------------------------------------------
// Mudar o status
// ---------------------------------------------------------------------------

export type ResultadoDaMudanca =
  { readonly ok: true } | { readonly ok: false; readonly explicacao: string };

/** Pede à API o passo do pedido. Nunca lança. */
export async function mudarStatusDoPedido(
  pedidoId: string,
  status: string,
  motivo: string | null = null,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaMudanca> {
  try {
    const resposta = await buscar(
      `${ENDERECO_DO_QUADRO}/${encodeURIComponent(pedidoId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, motivo }),
      },
    );
    if (resposta.ok) return { ok: true };
    const dados = (await resposta.json().catch(() => ({}))) as {
      readonly explicacao?: string;
    };
    return {
      ok: false,
      explicacao: dados.explicacao ?? "Não foi possível atualizar o pedido.",
    };
  } catch {
    return {
      ok: false,
      explicacao: "Sem conexão agora. O pedido não foi alterado.",
    };
  }
}

// ---------------------------------------------------------------------------
// O dia
// ---------------------------------------------------------------------------

const FORMA_DO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `aaaa-mm-dd` é um dia que existe no calendário? */
export function ehDiaValido(texto: string): boolean {
  const achado = FORMA_DO_DIA.exec(texto);
  if (achado === null) return false;
  const [ano, mes, dia] = [
    Number(achado[1]),
    Number(achado[2]),
    Number(achado[3]),
  ];
  const utc = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    utc.getUTCFullYear() === ano &&
    utc.getUTCMonth() === mes - 1 &&
    utc.getUTCDate() === dia
  );
}

export function somarDiasDoQuadro(dia: string, n: number): string {
  const achado = FORMA_DO_DIA.exec(dia);
  if (achado === null) return dia;
  const utc = new Date(
    Date.UTC(Number(achado[1]), Number(achado[2]) - 1, Number(achado[3]) + n),
  );
  return utc.toISOString().slice(0, 10);
}

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
const DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** "sexta-feira, 16 out 2026" — o dia civil, sem depender do fuso do computador. */
export function descreverDia(dia: string): string {
  const achado = FORMA_DO_DIA.exec(dia);
  if (achado === null) return dia;
  const utc = new Date(
    Date.UTC(Number(achado[1]), Number(achado[2]) - 1, Number(achado[3])),
  );
  return `${DIAS[utc.getUTCDay()] ?? ""}, ${Number(achado[3])} ${MESES[Number(achado[2]) - 1] ?? ""} ${achado[1]}`;
}

/** "16/10" — a data curta do pedido que veio de outro dia. */
export function dataCurta(iso: string): string {
  const data = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(data);
}

// ---------------------------------------------------------------------------
// Rótulos do cartão
// ---------------------------------------------------------------------------

const PAGAMENTOS: Readonly<Record<string, string>> = {
  PIX: "Pix",
  CASH: "Dinheiro",
  CARD_ON_DELIVERY: "Cartão na entrega",
  OTHER: "A combinar",
};

export function rotuloDoPagamento(forma: string | null): string {
  if (forma === null) return "Pagamento a combinar";
  return PAGAMENTOS[forma] ?? forma;
}

/** Os itens do cartão em uma frase curta: "2× Pastel · 1× Suco e mais 2". */
export function resumoDosItens(pedido: PedidoDoQuadro): string {
  if (pedido.itens.length === 0) return "Sem itens";
  const partes = pedido.itens.map((item) => `${item.quantidade}× ${item.nome}`);
  const resto = pedido.itensAMais > 0 ? ` e mais ${pedido.itensAMais}` : "";
  return `${partes.join(" · ")}${resto}`;
}

// ---------------------------------------------------------------------------
// Filtros do quadro (card #77)
// ---------------------------------------------------------------------------

/**
 * O que o dono escolhe na barra de filtros. Tudo é texto (vem do endereço);
 * vazio = sem filtro. Os valores em reais ("12,50") são lidos por
 * `lerReais`.
 */
export interface FiltrosDoQuadro {
  readonly busca: string;
  /** `DELIVERY` ou `PICKUP`. */
  readonly tipo: string;
  /** Forma de pagamento (`PIX`, `CASH`…) ou `a-combinar`. */
  readonly pagamento: string;
  /** Uma etapa (`PENDING`…) ou `CANCELLED`. */
  readonly etapa: string;
  readonly valorMin: string;
  readonly valorMax: string;
}

export const SEM_FILTROS_DO_QUADRO: FiltrosDoQuadro = {
  busca: "",
  tipo: "",
  pagamento: "",
  etapa: "",
  valorMin: "",
  valorMax: "",
};

/** Quantos filtros (fora a busca) estão ligados. */
export function filtrosLigados(filtros: FiltrosDoQuadro): number {
  return [
    filtros.tipo,
    filtros.pagamento,
    filtros.etapa,
    filtros.valorMin,
    filtros.valorMax,
  ].filter((valor) => valor !== "").length;
}

/**
 * Os pedidos que passam nos filtros. A busca acha o número do pedido ("42" ou
 * "#42"), o código, o nome do cliente (sem acento) ou o telefone (por
 * dígitos, em qualquer parte).
 */
export function filtrarPedidos(
  pedidos: readonly PedidoDoQuadro[],
  filtros: FiltrosDoQuadro,
): readonly PedidoDoQuadro[] {
  const termo = semAcento(filtros.busca.trim().replace(/^#/, ""));
  const digitos = filtros.busca.replace(/\D/g, "");
  const minimo = lerReais(filtros.valorMin);
  const maximo = lerReais(filtros.valorMax);
  return pedidos.filter((pedido) => {
    if (termo !== "") {
      const achou =
        String(pedido.numero) === termo ||
        semAcento(pedido.codigo).includes(termo) ||
        semAcento(pedido.cliente).includes(termo) ||
        (digitos.length >= 3 &&
          (pedido.buscaTelefone ?? "").includes(digitos));
      if (!achou) return false;
    }
    if (filtros.tipo !== "" && pedido.entrega !== filtros.tipo) return false;
    if (filtros.pagamento !== "") {
      const forma = pedido.pagamento ?? "a-combinar";
      if (forma !== filtros.pagamento) return false;
    }
    if (filtros.etapa !== "" && pedido.status !== filtros.etapa) return false;
    if (minimo !== null && pedido.totalCentavos < minimo) return false;
    if (maximo !== null && pedido.totalCentavos > maximo) return false;
    return true;
  });
}
