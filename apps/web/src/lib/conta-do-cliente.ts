/**
 * A conta do cliente, como as telas a consomem (card #35): os dados cadastrais,
 * as conexões abertas, as lojas favoritas e recentes — e as MÉTRICAS, que saem
 * da própria lista de pedidos (nada a mais na API).
 *
 * As leituras rodam só no servidor do site, com o token do cookie (P-008), e
 * nunca lançam: rede fora e sessão vencida viram estados.
 */
import {
  type SituacaoDosAceites,
  type LojaDoFeed,
  type ProdutoFavorito,
  type MetricasDaContaNoContrato,
  type PedidoDaContaNoContrato,
} from "@simpleclick/contracts";
const API_PADRAO = "https://api.simpleclick.localhost";

function enderecoDaApi(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? API_PADRAO).replace(/\/+$/, "");
}

const ESPERA_MAXIMA_EM_MS = 5_000;

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

export interface DadosDaConta {
  readonly id: string;
  readonly nome: string | null;
  readonly email: string;
  readonly telefone: string | null;
  readonly cpf: string | null;
  readonly aceitaOfertas: boolean;
  readonly criadaEm: string;
  readonly temSenha: boolean;
  readonly aplicativoAutenticador: boolean;
}

export interface SessaoAberta {
  readonly id: string;
  readonly tipo: "navegador" | "aplicativo";
  readonly iniciadaEm: string;
  readonly ultimoAcessoEm: string;
  readonly atual: boolean;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

export type Leitura<T> =
  | { readonly estado: "ok"; readonly dados: T }
  | { readonly estado: "nao-autenticado" }
  | { readonly estado: "indisponivel" };

async function ler<T>(
  caminho: string,
  token: string,
  conferir: (corpo: unknown) => T | null,
  buscar: typeof fetch,
): Promise<Leitura<T>> {
  try {
    const resposta = await buscar(`${enderecoDaApi()}${caminho}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (resposta.status === 401) return { estado: "nao-autenticado" };
    if (!resposta.ok) return { estado: "indisponivel" };
    const lido = conferir(await resposta.json());
    return lido === null
      ? { estado: "indisponivel" }
      : { estado: "ok", dados: lido };
  } catch {
    return { estado: "indisponivel" };
  }
}

/**
 * As conferências do corpo das três leituras da conta. São puras e públicas:
 * o servidor (`buscar*`) e o modal "Minha conta" (card #151), que lê pelo
 * navegador, usam as MESMAS, e o que não passar vira "indisponível".
 */
export function lerDadosDaConta(corpo: unknown): DadosDaConta | null {
  return ehObjeto(corpo) && typeof corpo["email"] === "string"
    ? (corpo as unknown as DadosDaConta)
    : null;
}

export function lerSessoesAbertas(corpo: unknown): readonly SessaoAberta[] | null {
  return ehObjeto(corpo) && Array.isArray(corpo["sessoes"])
    ? (corpo["sessoes"] as SessaoAberta[])
    : null;
}

export function lerAceitesDaConta(corpo: unknown): SituacaoDosAceites | null {
  return ehObjeto(corpo) &&
    Array.isArray(corpo["pendentes"]) &&
    Array.isArray(corpo["historico"])
    ? (corpo as unknown as SituacaoDosAceites)
    : null;
}

export function buscarDadosDaConta(token: string, buscar: typeof fetch = fetch) {
  return ler<DadosDaConta>("/v1/conta/dados", token, lerDadosDaConta, buscar);
}

export function buscarSessoesAbertas(token: string, buscar: typeof fetch = fetch) {
  return ler<readonly SessaoAberta[]>("/v1/conta/sessoes", token, lerSessoesAbertas, buscar);
}

/** O que a conta já aceitou e o que falta (`GET /v1/conta/aceites`, card #79). */
export function buscarAceites(token: string, buscar: typeof fetch = fetch) {
  return ler<SituacaoDosAceites>("/v1/conta/aceites", token, lerAceitesDaConta, buscar);
}

/** As lojas e os produtos favoritos (`GET /v1/feed/favoritos`). */
export function buscarFavoritos(token: string, buscar: typeof fetch = fetch) {
  return ler<{ readonly lojas: readonly LojaDoFeed[]; readonly produtos: readonly ProdutoFavorito[] }>(
    "/v1/feed/favoritos",
    token,
    (c) =>
      ehObjeto(c) && Array.isArray(c["lojas"]) && Array.isArray(c["produtos"])
        ? { lojas: c["lojas"] as LojaDoFeed[], produtos: c["produtos"] as ProdutoFavorito[] }
        : null,
    buscar,
  );
}

/** As lojas abertas nos últimos 30 dias (`GET /v1/feed/recentes`). */
export function buscarRecentes(token: string, buscar: typeof fetch = fetch) {
  return ler<readonly LojaDoFeed[]>(
    "/v1/feed/recentes?dias=30",
    token,
    (c) => (ehObjeto(c) && Array.isArray(c["lojas"]) ? (c["lojas"] as LojaDoFeed[]) : null),
    buscar,
  );
}

/** As métricas do cliente em todas as lojas, no período (`de`/`ate` em ISO). */
export function buscarMetricasDaConta(
  token: string,
  periodo: { readonly de: string; readonly ate: string },
  buscar: typeof fetch = fetch,
) {
  return ler<MetricasDaContaNoContrato>(
    `/v1/conta/metricas?de=${periodo.de}&ate=${periodo.ate}`,
    token,
    (c) =>
      ehObjeto(c) && ehObjeto(c["resumo"]) && Array.isArray(c["topLojas"])
        ? (c as unknown as MetricasDaContaNoContrato)
        : null,
    buscar,
  );
}

// ---------------------------------------------------------------------------
// O período da Visão geral, no endereço da página
// ---------------------------------------------------------------------------

export const ATALHOS_DA_VISAO = ["30d", "90d", "ano"] as const;
export type AtalhoDaVisao = (typeof ATALHOS_DA_VISAO)[number];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export interface PeriodoDaVisao {
  readonly de: string;
  readonly ate: string;
  /** O atalho em vigor; `personalizado` quando o intervalo é livre. */
  readonly atalho: AtalhoDaVisao | "personalizado";
}

/** Lê `?periodo=30d|90d|ano|personalizado&de=&ate=`; sem nada vale 30 dias. */
export function lerPeriodoDaVisao(
  consulta: { readonly periodo?: string | undefined; readonly de?: string | undefined; readonly ate?: string | undefined },
  hoje: string,
): PeriodoDaVisao {
  if (consulta.periodo === "personalizado" && consulta.de && consulta.ate && ISO.test(consulta.de) && ISO.test(consulta.ate)) {
    const [de, ate] = consulta.de <= consulta.ate ? [consulta.de, consulta.ate] : [consulta.ate, consulta.de];
    return { de, ate: ate > hoje ? hoje : ate, atalho: "personalizado" };
  }
  if (consulta.periodo === "90d") return { de: somarDias(hoje, -89), ate: hoje, atalho: "90d" };
  if (consulta.periodo === "ano") return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje, atalho: "ano" };
  return { de: somarDias(hoje, -29), ate: hoje, atalho: "30d" };
}

// ---------------------------------------------------------------------------
// Métricas (puras: recebem os pedidos e a data de agora)
// ---------------------------------------------------------------------------

/** Pedido ainda em andamento: nem concluído, nem cancelado. */
export function estaEmAndamento(status: string): boolean {
  return status !== "COMPLETED" && status !== "CANCELLED";
}

export interface LojaMaisUsada {
  readonly apelido: string;
  readonly nome: string;
  readonly pedidos: number;
  readonly gastoCentavos: number;
}

export interface MetricasDoCliente {
  readonly totalDePedidos: number;
  readonly gastoTotalCentavos: number;
  readonly gastoDoMesCentavos: number;
  readonly gastoDoMesAnteriorCentavos: number;
  readonly pedidosDoMes: number;
  readonly pedidosDoMesAnterior: number;
  /** Variação do gasto do mês sobre o anterior, em %; nulo sem base. */
  readonly variacaoDoGastoPercentual: number | null;
  readonly lojasMaisUsadas: readonly LojaMaisUsada[];
  readonly emAndamento: readonly PedidoDaContaNoContrato[];
  readonly ultimos: readonly PedidoDaContaNoContrato[];
}

function chaveDoMes(data: Date): number {
  return data.getFullYear() * 12 + data.getMonth();
}

/** Pedido cancelado não entra no que a pessoa gastou. */
function contaNoGasto(pedido: PedidoDaContaNoContrato): boolean {
  return pedido.status !== "CANCELLED";
}

export function calcularMetricas(
  pedidos: readonly PedidoDaContaNoContrato[],
  agora: Date,
): MetricasDoCliente {
  const mes = chaveDoMes(agora);
  let gastoTotal = 0;
  let gastoMes = 0;
  let gastoAnterior = 0;
  let pedidosMes = 0;
  let pedidosAnterior = 0;
  const porLoja = new Map<string, LojaMaisUsada>();

  for (const pedido of pedidos) {
    if (!contaNoGasto(pedido)) continue;
    const delta = mes - chaveDoMes(new Date(pedido.criadoEm));
    gastoTotal += pedido.totalCentavos;
    if (delta === 0) {
      gastoMes += pedido.totalCentavos;
      pedidosMes += 1;
    } else if (delta === 1) {
      gastoAnterior += pedido.totalCentavos;
      pedidosAnterior += 1;
    }
    const atual = porLoja.get(pedido.loja.apelido);
    porLoja.set(pedido.loja.apelido, {
      apelido: pedido.loja.apelido,
      nome: pedido.loja.nome,
      pedidos: (atual?.pedidos ?? 0) + 1,
      gastoCentavos: (atual?.gastoCentavos ?? 0) + pedido.totalCentavos,
    });
  }

  const maisRecentesPrimeiro = [...pedidos].sort(
    (a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm),
  );

  return {
    totalDePedidos: pedidos.length,
    gastoTotalCentavos: gastoTotal,
    gastoDoMesCentavos: gastoMes,
    gastoDoMesAnteriorCentavos: gastoAnterior,
    pedidosDoMes: pedidosMes,
    pedidosDoMesAnterior: pedidosAnterior,
    variacaoDoGastoPercentual:
      gastoAnterior > 0
        ? Math.round(((gastoMes - gastoAnterior) / gastoAnterior) * 100)
        : null,
    lojasMaisUsadas: [...porLoja.values()]
      .sort((a, b) => b.pedidos - a.pedidos || b.gastoCentavos - a.gastoCentavos)
      .slice(0, 3),
    emAndamento: maisRecentesPrimeiro.filter((p) => estaEmAndamento(p.status)),
    ultimos: maisRecentesPrimeiro.slice(0, 4),
  };
}

// ---------------------------------------------------------------------------
// Filtros da lista de pedidos
// ---------------------------------------------------------------------------

export const SITUACOES = ["todos", "andamento", "concluidos", "cancelados"] as const;
export type Situacao = (typeof SITUACOES)[number];
export const PERIODOS = ["todos", "7", "30", "90"] as const;
export type Periodo = (typeof PERIODOS)[number];

export interface FiltroDePedidos {
  readonly situacao: Situacao;
  readonly periodo: Periodo;
  readonly loja: string;
}

function umDe<T extends string>(valor: string | undefined, validos: readonly T[], padrao: T): T {
  return validos.find((v) => v === valor) ?? padrao;
}

export function lerFiltro(consulta: {
  readonly situacao?: string | undefined;
  readonly periodo?: string | undefined;
  readonly loja?: string | undefined;
}): FiltroDePedidos {
  return {
    situacao: umDe(consulta.situacao, SITUACOES, "todos"),
    periodo: umDe(consulta.periodo, PERIODOS, "todos"),
    loja: consulta.loja ?? "",
  };
}

export function filtrarPedidos(
  pedidos: readonly PedidoDaContaNoContrato[],
  filtro: FiltroDePedidos,
  agora: Date,
): PedidoDaContaNoContrato[] {
  const corte =
    filtro.periodo === "todos"
      ? 0
      : agora.getTime() - Number(filtro.periodo) * 24 * 60 * 60 * 1000;
  return pedidos.filter((p) => {
    if (filtro.situacao === "andamento" && !estaEmAndamento(p.status)) return false;
    if (filtro.situacao === "concluidos" && p.status !== "COMPLETED") return false;
    if (filtro.situacao === "cancelados" && p.status !== "CANCELLED") return false;
    if (filtro.loja !== "" && p.loja.apelido !== filtro.loja) return false;
    return Date.parse(p.criadoEm) >= corte;
  });
}

/** As lojas onde a pessoa já pediu, para o seletor do filtro. */
export function lojasDosPedidos(
  pedidos: readonly PedidoDaContaNoContrato[],
): { apelido: string; nome: string }[] {
  const mapa = new Map<string, string>();
  for (const p of pedidos) mapa.set(p.loja.apelido, p.loja.nome);
  return [...mapa].map(([apelido, nome]) => ({ apelido, nome }));
}
