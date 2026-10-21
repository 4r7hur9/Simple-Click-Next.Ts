/**
 * Os clientes da loja e o pedido manual, como as telas do painel os consomem
 * (T-700 a T-706).
 *
 * A tela fala com as rotas do PRÓPRIO SITE (`/api/painel/...`), que levam a
 * sessão do dono à API — o token nunca chega ao script da página (P-008). O
 * que volta é conferido pelo contrato compartilhado antes de chegar à tela:
 * resposta fora do contrato é estado de erro, e não desenho pela metade.
 *
 * NUNCA LANÇA. Queda de rede, sessão vencida e resposta estranha viram estados
 * que a tela sabe mostrar. É o que deixa cada componente cuidar só de desenho.
 */
import {
  rotuloDaEtapa,
  esquemaDaFichaComHistorico,
  esquemaDaFichaDoCliente,
  esquemaDaListaDeClientes,
  esquemaDaRecusaDoPedidoManual,
  esquemaDaRepeticaoDoPedido,
  esquemaDoClienteExistente,
  esquemaDoPedidoManualCriado,
  type ClienteDaLojaNoContrato,
  type ClienteExistenteNoContrato,
  type ClienteParaCadastrarNoContrato,
  type FichaComHistoricoNoContrato,
  type FichaDoClienteNoContrato,
  type PedidoManualCriadoNoContrato,
  type PedidoManualParaCriarNoContrato,
  type RecusaDoPedidoManualNoContrato,
  type RepeticaoDoPedidoNoContrato,
} from "@simpleclick/contracts";

export type {
  ClienteDaLojaNoContrato as ClienteDaLista,
  ClienteExistenteNoContrato as ClienteExistente,
  FichaComHistoricoNoContrato as FichaComHistorico,
  FichaDoClienteNoContrato as FichaDoCliente,
  PedidoManualCriadoNoContrato as PedidoManualCriado,
  PedidoManualParaCriarNoContrato as PedidoManualParaCriar,
  RepeticaoDoPedidoNoContrato as RepeticaoDoPedido,
};

/** Onde a tela pede os clientes: a rota do próprio site. */
export const ENDERECO_DOS_CLIENTES = "/api/painel/clientes";
/** Onde a tela lança o pedido manual. */
export const ENDERECO_DO_PEDIDO_MANUAL = "/api/painel/pedidos/manual";

/** A rede. Entra por parâmetro para a prova responder sem servidor. */
export type Buscar = typeof fetch;

async function pedir(
  buscar: Buscar,
  endereco: string,
  metodo: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  corpo?: unknown,
): Promise<Response | null> {
  try {
    return await buscar(endereco, {
      method: metodo,
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
  } catch {
    return null;
  }
}

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// A lista
// ---------------------------------------------------------------------------

export type LeituraDaLista =
  | {
      readonly estado: "ok";
      readonly clientes: readonly ClienteDaLojaNoContrato[];
      /** Só com lista paginada (`pagina`): quantos casam e quantos a loja tem. */
      readonly total?: number | undefined;
      readonly todos?: number | undefined;
      readonly pagina?: number | undefined;
      readonly porPagina?: number | undefined;
      readonly totalDePaginas?: number | undefined;
    }
  | { readonly estado: "erro"; readonly motivo: string };

/**
 * Lê a lista de clientes (AC-700, AC-701). Com texto, é só a busca; com um
 * objeto, vão a busca, os filtros, a ordem e a página (o que estiver vazio
 * fica de fora).
 */
export async function buscarClientes(
  consulta: string | Readonly<Record<string, string>> = "",
  buscar: Buscar = fetch,
): Promise<LeituraDaLista> {
  const parametros = new URLSearchParams();
  if (typeof consulta === "string") {
    if (consulta.trim() !== "") parametros.set("busca", consulta.trim());
  } else {
    for (const [chave, valor] of Object.entries(consulta)) {
      if (valor.trim() !== "") parametros.set(chave, valor.trim());
    }
  }
  const texto = parametros.toString();
  const resposta = await pedir(
    buscar,
    texto === "" ? ENDERECO_DOS_CLIENTES : `${ENDERECO_DOS_CLIENTES}?${texto}`,
  );
  if (resposta === null) return { estado: "erro", motivo: "falha de rede" };
  if (!resposta.ok) {
    return { estado: "erro", motivo: `a lista respondeu ${resposta.status}` };
  }
  const lido = esquemaDaListaDeClientes.safeParse(await lerJson(resposta));
  return lido.success
    ? { estado: "ok", ...lido.data }
    : { estado: "erro", motivo: "a lista veio num formato inesperado" };
}

// ---------------------------------------------------------------------------
// O cadastro e a correção
// ---------------------------------------------------------------------------

export type ResultadoDaFicha =
  | { readonly estado: "salvo"; readonly ficha: FichaDoClienteNoContrato }
  | {
      readonly estado: "existente";
      readonly existente: ClienteExistenteNoContrato;
    }
  | {
      readonly estado: "recusado";
      /** Campo → frase, para a tela pôr cada recusa no lugar dela. */
      readonly campos: Readonly<Record<string, string>>;
    }
  | { readonly estado: "erro"; readonly motivo: string };

/** A recusa da borda (400) no formato campo → frase. */
function camposDaRecusa(corpo: unknown): Record<string, string> {
  const campos: Record<string, string> = {};
  if (typeof corpo !== "object" || corpo === null) return campos;
  const lista = (corpo as { campos?: unknown }).campos;
  if (!Array.isArray(lista)) return campos;
  for (const campo of lista) {
    if (typeof campo !== "object" || campo === null) continue;
    const { caminho, mensagem } = campo as {
      caminho?: unknown;
      mensagem?: unknown;
    };
    if (typeof caminho === "string" && typeof mensagem === "string") {
      campos[caminho.split(".")[0] ?? caminho] ??= mensagem;
    }
  }
  return campos;
}

async function resultadoDaFicha(
  resposta: Response | null,
): Promise<ResultadoDaFicha> {
  if (resposta === null) return { estado: "erro", motivo: "falha de rede" };
  const corpo = await lerJson(resposta);
  if (resposta.status === 409) {
    const existente = esquemaDoClienteExistente.safeParse(corpo);
    if (existente.success) {
      return { estado: "existente", existente: existente.data };
    }
  }
  if (resposta.status === 400) {
    return { estado: "recusado", campos: camposDaRecusa(corpo) };
  }
  if (!resposta.ok) {
    return { estado: "erro", motivo: `a API respondeu ${resposta.status}` };
  }
  const ficha = esquemaDaFichaDoCliente.safeParse(corpo);
  return ficha.success
    ? { estado: "salvo", ficha: ficha.data }
    : { estado: "erro", motivo: "a ficha veio num formato inesperado" };
}

/** Cadastra o cliente (AC-703, AC-704, AC-706). */
export async function cadastrarCliente(
  dados: ClienteParaCadastrarNoContrato,
  buscar: Buscar = fetch,
): Promise<ResultadoDaFicha> {
  return resultadoDaFicha(
    await pedir(buscar, ENDERECO_DOS_CLIENTES, "POST", dados),
  );
}

/** Corrige a ficha (AC-705). */
export async function corrigirCliente(
  clienteId: string,
  dados: Partial<ClienteParaCadastrarNoContrato>,
  buscar: Buscar = fetch,
): Promise<ResultadoDaFicha> {
  return resultadoDaFicha(
    await pedir(
      buscar,
      `${ENDERECO_DOS_CLIENTES}/${encodeURIComponent(clienteId)}`,
      "PATCH",
      dados,
    ),
  );
}

/** Remove a ficha das listagens. Verdadeiro quando removeu (AC-705). */
export async function removerCliente(
  clienteId: string,
  buscar: Buscar = fetch,
): Promise<boolean> {
  const resposta = await pedir(
    buscar,
    `${ENDERECO_DOS_CLIENTES}/${encodeURIComponent(clienteId)}`,
    "DELETE",
  );
  return resposta !== null && resposta.status === 204;
}

// ---------------------------------------------------------------------------
// A ficha com o histórico
// ---------------------------------------------------------------------------

export type LeituraDaFicha =
  | { readonly estado: "ok"; readonly ficha: FichaComHistoricoNoContrato }
  | { readonly estado: "nao-encontrado" }
  | { readonly estado: "erro"; readonly motivo: string };

/** Lê a ficha e o histórico de um cliente (AC-711, AC-713). */
export async function buscarFicha(
  clienteId: string,
  buscar: Buscar = fetch,
): Promise<LeituraDaFicha> {
  const resposta = await pedir(
    buscar,
    `${ENDERECO_DOS_CLIENTES}/${encodeURIComponent(clienteId)}`,
  );
  if (resposta === null) return { estado: "erro", motivo: "falha de rede" };
  if (resposta.status === 404) return { estado: "nao-encontrado" };
  if (!resposta.ok) {
    return { estado: "erro", motivo: `a ficha respondeu ${resposta.status}` };
  }
  const lido = esquemaDaFichaComHistorico.safeParse(await lerJson(resposta));
  return lido.success
    ? { estado: "ok", ficha: lido.data }
    : { estado: "erro", motivo: "a ficha veio num formato inesperado" };
}

// ---------------------------------------------------------------------------
// O pedido manual e a repetição
// ---------------------------------------------------------------------------

export type ResultadoDoLancamento =
  | { readonly estado: "criado"; readonly pedido: PedidoManualCriadoNoContrato }
  | {
      readonly estado: "incompleto";
      readonly pendencias: RecusaDoPedidoManualNoContrato["pendencias"];
    }
  | { readonly estado: "recusado"; readonly motivo: string }
  | { readonly estado: "erro"; readonly motivo: string };

/** Lança o pedido manual (AC-707, AC-708, AC-709). */
export async function lancarPedidoManual(
  pedido: PedidoManualParaCriarNoContrato,
  buscar: Buscar = fetch,
): Promise<ResultadoDoLancamento> {
  const resposta = await pedir(
    buscar,
    ENDERECO_DO_PEDIDO_MANUAL,
    "POST",
    pedido,
  );
  if (resposta === null) return { estado: "erro", motivo: "falha de rede" };
  const corpo = await lerJson(resposta);
  if (resposta.status === 422) {
    const recusa = esquemaDaRecusaDoPedidoManual.safeParse(corpo);
    if (recusa.success) {
      return { estado: "incompleto", pendencias: recusa.data.pendencias };
    }
  }
  if (resposta.status === 400 || resposta.status === 409) {
    return {
      estado: "recusado",
      motivo:
        resposta.status === 400
          ? "Confira o telefone e o endereço do pedido."
          : "A loja não aceita este pedido assim: confira a forma de entrega e o valor mínimo.",
    };
  }
  if (!resposta.ok) {
    return { estado: "erro", motivo: `a API respondeu ${resposta.status}` };
  }
  const criado = esquemaDoPedidoManualCriado.safeParse(corpo);
  return criado.success
    ? { estado: "criado", pedido: criado.data }
    : { estado: "erro", motivo: "o pedido veio num formato inesperado" };
}

export type LeituraDaRepeticao =
  | { readonly estado: "ok"; readonly repeticao: RepeticaoDoPedidoNoContrato }
  | { readonly estado: "erro"; readonly motivo: string };

/** Monta a repetição de um pedido antigo com os preços de hoje (AC-712). */
export async function pedirRepeticao(
  pedidoId: string,
  buscar: Buscar = fetch,
): Promise<LeituraDaRepeticao> {
  const resposta = await pedir(
    buscar,
    `/api/painel/pedidos/${encodeURIComponent(pedidoId)}/repetir`,
    "POST",
  );
  if (resposta === null) return { estado: "erro", motivo: "falha de rede" };
  if (!resposta.ok) {
    return { estado: "erro", motivo: `a API respondeu ${resposta.status}` };
  }
  const lido = esquemaDaRepeticaoDoPedido.safeParse(await lerJson(resposta));
  return lido.success
    ? { estado: "ok", repeticao: lido.data }
    : { estado: "erro", motivo: "a repetição veio num formato inesperado" };
}

// ---------------------------------------------------------------------------
// Escrita na tela
// ---------------------------------------------------------------------------

const FORMATO_DE_DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "27/09/2026" — a data no relógio de quem olha a tela. */
export function escreverData(iso: string): string {
  return FORMATO_DE_DATA.format(new Date(iso));
}

/**
 * O telefone guardado, escrito como o dono o reconhece: "(11) 98888-7777".
 * O que não for número brasileiro sai como veio.
 */
export function escreverTelefone(e164: string | null): string {
  if (e164 === null) return "—";
  const digitos = e164.replace(/[^0-9]/g, "");
  const nacional =
    digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)
      ? digitos.slice(2)
      : digitos;
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return e164;
}

/** O status do pedido em linguagem de balcão. */
export function rotuloDoStatusDoPedido(status: string): string {
  // Os mesmos nomes das colunas do quadro de pedidos.
  return rotuloDaEtapa(status);
}
