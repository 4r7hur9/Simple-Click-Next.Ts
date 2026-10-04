/**
 * As métricas do painel como a tela as consome (T-801, T-803, T-804).
 *
 * A CONTA NÃO MORA AQUI. O que é venda, o que é "hoje" no fuso da loja e
 * contra que pedaço do período anterior o dia é comparado são decididos pela
 * API (`apps/api/src/modules/metrics`). Este arquivo só faz o que é da borda
 * do navegador: levar o período do endereço da página até a API, conferir a
 * resposta pelo contrato e escrever número, data e hora para gente ler.
 *
 * DINHEIRO CHEGA EM CENTAVO INTEIRO (P-005) e só vira reais na hora de
 * escrever, pela mesma função que o resto do site usa.
 */
import {
  esquemaDaRecusaDePeriodo,
  esquemaDasMetricas,
  type ComparacaoDeMetricasNoContrato,
  type MetricasNoContrato,
  type PeriodoDeMetricasNoContrato,
  type VariacaoDeMetricaNoContrato,
} from "@simpleclick/contracts";
import { emReais } from "@simpleclick/core";

export type {
  ComparacaoDeMetricasNoContrato,
  MetricasNoContrato,
  ParcelaDeMetricaNoContrato,
  PeriodoDeMetricasNoContrato,
  ResumoDeMetricasNoContrato,
  VariacaoDeMetricaNoContrato,
} from "@simpleclick/contracts";

// ---------------------------------------------------------------------------
// O período no endereço da página (AC-806)
// ---------------------------------------------------------------------------

/** Os atalhos que a API aceita em `periodo` — os mesmos da borda dela. */
export const ATALHOS_DO_PERIODO = [
  "hoje",
  "3d",
  "7d",
  "personalizado",
] as const;

export type AtalhoDoPeriodo = (typeof ATALHOS_DO_PERIODO)[number];

/**
 * O período que a tela pede, com os MESMOS nomes da consulta da API
 * (`periodo`, `de`, `ate`). Ser igual é o que deixa o endereço da página ir
 * para a API sem tradução — e o que faz o link copiado abrir o mesmo recorte.
 */
export interface ConsultaDoPeriodo {
  readonly periodo: AtalhoDoPeriodo;
  readonly de?: string | undefined;
  readonly ate?: string | undefined;
}

/** O que o Next entrega em `searchParams`, ou o que o navegador tem na barra. */
export type ParametrosDoEndereco =
  | URLSearchParams
  | Readonly<Record<string, string | readonly string[] | undefined>>;

/** O período de quem abre o painel sem escolher nada. */
export const PERIODO_DE_HOJE: ConsultaDoPeriodo = { periodo: "hoje" };

function lerParametro(
  parametros: ParametrosDoEndereco,
  nome: string,
): string | undefined {
  if (parametros instanceof URLSearchParams) {
    return parametros.get(nome) ?? undefined;
  }
  const valor = parametros[nome];
  if (typeof valor === "string") return valor;
  return valor?.[0];
}

/**
 * Lê o período do endereço da página.
 *
 * Atalho desconhecido vira "hoje", que é o que o painel abre sem nada. O
 * intervalo a dedo NÃO é conferido aqui: data final antes da inicial, data
 * faltando ou intervalo longo demais seguem para a API, que é quem decide e
 * devolve a explicação (AC-805) — conferir também aqui seria a segunda
 * implementação da mesma régua.
 */
export function periodoDoEndereco(
  parametros: ParametrosDoEndereco,
): ConsultaDoPeriodo {
  const periodo = lerParametro(parametros, "periodo");
  if (periodo === "personalizado") {
    return {
      periodo,
      de: lerParametro(parametros, "de") ?? "",
      ate: lerParametro(parametros, "ate") ?? "",
    };
  }
  if (periodo === "3d" || periodo === "7d") return { periodo };
  return PERIODO_DE_HOJE;
}

/** Escreve o período como ele vai no endereço: `periodo=7d`. */
export function enderecoDoPeriodo(consulta: ConsultaDoPeriodo): string {
  const parametros = new URLSearchParams({ periodo: consulta.periodo });
  if (consulta.periodo === "personalizado") {
    parametros.set("de", consulta.de ?? "");
    parametros.set("ate", consulta.ate ?? "");
  }
  return parametros.toString();
}

/** Dois pedidos de período são o mesmo recorte? */
export function mesmoPeriodo(
  uma: ConsultaDoPeriodo,
  outra: ConsultaDoPeriodo,
): boolean {
  return enderecoDoPeriodo(uma) === enderecoDoPeriodo(outra);
}

// ---------------------------------------------------------------------------
// A leitura
// ---------------------------------------------------------------------------

/** Onde a tela pede as métricas: a rota do próprio site, que leva a sessão. */
export const ENDERECO_DAS_METRICAS = "/api/painel/metricas";

/** Onde a tela pede a planilha do período (T-808). */
export const ENDERECO_DA_EXPORTACAO = "/api/painel/metricas/exportar";

/** O resultado de uma leitura, pronto para a tela decidir o estado. */
export type LeituraDasMetricas =
  | { readonly estado: "ok"; readonly metricas: MetricasNoContrato }
  /** A API recusou o período e explicou por quê (AC-805). */
  | { readonly estado: "recusada"; readonly explicacao: string }
  | {
      readonly estado: "erro";
      readonly motivo: string;
      /** A sessão acabou: o caminho é entrar de novo, e não tentar de novo. */
      readonly semSessao: boolean;
    };

export interface OpcoesDaLeitura {
  /** Pede o recálculo agora, ignorando o que está guardado (AC-814). */
  readonly atualizar?: boolean | undefined;
}

/** Leitor das métricas. Entra por parâmetro para a prova não depender de rede. */
export type BuscarMetricas = (
  consulta: ConsultaDoPeriodo,
  opcoes?: OpcoesDaLeitura,
) => Promise<LeituraDasMetricas>;

function erroDeLeitura(motivo: string, semSessao = false): LeituraDasMetricas {
  return { estado: "erro", motivo, semSessao };
}

/**
 * Lê as métricas de um período.
 *
 * Nunca lança: queda de rede, sessão vencida e resposta fora do contrato
 * viram `erro`, e a recusa do período vira `recusada` com a explicação da
 * API. Número que não passou pelo contrato não chega à tela — é o que impede
 * o painel de mostrar dado errado como se fosse certo.
 */
export async function buscarMetricasDoPainel(
  consulta: ConsultaDoPeriodo,
  opcoes: OpcoesDaLeitura = {},
  buscar: typeof fetch = fetch,
): Promise<LeituraDasMetricas> {
  const parametros = new URLSearchParams(enderecoDoPeriodo(consulta));
  if (opcoes.atualizar === true) parametros.set("atualizar", "1");

  let resposta: Response;
  try {
    resposta = await buscar(`${ENDERECO_DAS_METRICAS}?${parametros}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (causa) {
    return erroDeLeitura(
      causa instanceof Error ? causa.message : "falha de rede",
    );
  }

  // Corpo que não é JSON (uma página de erro do proxy, por exemplo) vira
  // nulo, e nulo não passa pelo contrato: cai no erro, e não em número.
  const corpo: unknown = await resposta.json().catch(() => null);

  if (resposta.status === 400) {
    const recusa = esquemaDaRecusaDePeriodo.safeParse(corpo);
    if (recusa.success) {
      return { estado: "recusada", explicacao: recusa.data.explicacao };
    }
  }
  if (resposta.status === 401) {
    return erroDeLeitura("a sessão terminou", true);
  }
  if (!resposta.ok) {
    return erroDeLeitura(`as métricas responderam ${resposta.status}`);
  }

  const conferidas = esquemaDasMetricas.safeParse(corpo);
  if (!conferidas.success) {
    return erroDeLeitura("as métricas vieram num formato inesperado");
  }
  return { estado: "ok", metricas: conferidas.data };
}

// ---------------------------------------------------------------------------
// Escrever para gente ler
// ---------------------------------------------------------------------------

/** Centavos inteiros em reais — só na borda da tela (P-005). */
export function escreverDinheiro(centavos: number): string {
  return emReais(centavos);
}

/** "1 pedido", "3 pedidos". */
export function escreverPedidos(quantidade: number): string {
  return quantidade === 1 ? "1 pedido" : `${quantidade} pedidos`;
}

const FORMA_DA_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Data civil da loja por extenso curto: `2026-09-27` vira `27/09/2026`.
 *
 * A data é lida como TEXTO, e não com `new Date`: `new Date("2026-09-27")` é
 * meia-noite em UTC, que no Brasil ainda é o dia 26 — e o painel escreveria
 * a data errada justamente no período que o dono escolheu.
 */
export function escreverDataCivil(data: string): string {
  const partes = FORMA_DA_DATA.exec(data);
  if (partes === null) return data;
  const [, ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

const formatadoresDeHora = new Map<string, Intl.DateTimeFormat>();

function formatadorDeHora(fuso: string): Intl.DateTimeFormat {
  let formatador = formatadoresDeHora.get(fuso);
  if (formatador === undefined) {
    formatador = new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatadoresDeHora.set(fuso, formatador);
  }
  return formatador;
}

/**
 * Um instante no relógio da loja, do jeito que se fala: `14h32`.
 *
 * O fuso é o da LOJA, que vem junto com o período — e não o do aparelho de
 * quem olha. O dono que confere o painel de Manaus em viagem a São Paulo
 * continua vendo a hora da loja dele.
 */
export function escreverHora(instante: string, fuso: string): string {
  const data = new Date(instante);
  if (Number.isNaN(data.getTime())) return instante;
  let formatador: Intl.DateTimeFormat;
  try {
    formatador = formatadorDeHora(fuso);
  } catch {
    formatador = formatadorDeHora("America/Sao_Paulo");
  }
  const partes = formatador.formatToParts(data);
  const hora = partes.find((parte) => parte.type === "hour")?.value ?? "00";
  const minuto = partes.find((parte) => parte.type === "minute")?.value ?? "00";
  return `${hora}h${minuto}`;
}

const NOME_DO_ATALHO: Readonly<Record<AtalhoDoPeriodo, string>> = {
  hoje: "Hoje",
  "3d": "Últimos 3 dias",
  "7d": "Últimos 7 dias",
  personalizado: "Intervalo escolhido",
};

/** O nome curto de cada atalho, como o seletor o mostra. */
export function nomeDoAtalho(atalho: AtalhoDoPeriodo): string {
  return NOME_DO_ATALHO[atalho];
}

/** O período em vigor, por extenso: nome do atalho e as duas pontas (AC-803). */
export interface PeriodoPorExtenso {
  readonly nome: string;
  readonly de: string;
  readonly ate: string;
  /** Uma frase só, para leitor de tela e para o título da página. */
  readonly frase: string;
}

export function descreverPeriodo(
  periodo: PeriodoDeMetricasNoContrato,
): PeriodoPorExtenso {
  const nome = NOME_DO_ATALHO[periodo.atalho];
  const de = escreverDataCivil(periodo.de);
  const ate = escreverDataCivil(periodo.ate);
  const frase =
    periodo.de === periodo.ate ? `${nome}: ${de}` : `${nome}: ${de} a ${ate}`;
  return { nome, de, ate, frase };
}

/**
 * Contra o que o período foi comparado, em palavras (AC-802).
 *
 * Período em curso é comparado com o MESMO PEDAÇO do anterior (decisão de
 * 03/10/2026), e a frase diz isso: "ontem até 14h32". Sem a hora, o dono
 * leria a comparação como se fosse contra o dia inteiro de ontem.
 */
export function descreverPeriodoAnterior(
  comparacao: ComparacaoDeMetricasNoContrato,
  periodo: PeriodoDeMetricasNoContrato,
): string {
  const anterior = comparacao.periodoAnterior;
  const hora = escreverHora(anterior.fim, periodo.fuso);

  if (periodo.atalho === "hoje") {
    return anterior.parcial ? `ontem até ${hora}` : "ontem";
  }

  const pontas =
    anterior.de === anterior.ate
      ? escreverDataCivil(anterior.de)
      : `${escreverDataCivil(anterior.de)} a ${escreverDataCivil(anterior.ate)}`;
  return anterior.parcial ? `${pontas}, com o último dia até ${hora}` : pontas;
}

/** A variação de uma medida, pronta para a tela. */
export interface VariacaoPorExtenso {
  readonly direcao: VariacaoDeMetricaNoContrato["direcao"];
  /** "Subiu R$ 100,00 (25%)". */
  readonly texto: string;
}

/**
 * Escreve a variação com a direção e o tamanho (AC-802).
 *
 * A direção vai em PALAVRA, e não só em cor ou seta: quem não distingue
 * verde de vermelho, e o leitor de tela, recebem a mesma informação.
 */
export function descreverVariacao(
  variacao: VariacaoDeMetricaNoContrato,
  unidade: "dinheiro" | "pedidos",
): VariacaoPorExtenso {
  const escrever = unidade === "dinheiro" ? escreverDinheiro : escreverPedidos;
  const tamanho = escrever(Math.abs(variacao.diferenca));
  const porCento =
    variacao.variacaoPorCento === null
      ? ""
      : variacao.variacaoPorCento === 0
        ? " (menos de 1%)"
        : ` (${Math.abs(variacao.variacaoPorCento)}%)`;

  switch (variacao.direcao) {
    case "subiu":
      return { direcao: "subiu", texto: `Subiu ${tamanho}${porCento}` };
    case "caiu":
      return { direcao: "caiu", texto: `Caiu ${tamanho}${porCento}` };
    case "igual":
      return { direcao: "igual", texto: "Igual" };
    case "sem-base":
      // Sem venda antes não há porcentagem honesta: "subiu infinito" não
      // orienta ninguém, e a API manda a porcentagem nula por isso.
      return {
        direcao: "sem-base",
        texto: "Sem venda no período anterior para comparar",
      };
  }
}

/** O período não teve pedido nenhum — nem venda, nem aberto, nem cancelado. */
export function periodoSemPedido(metricas: MetricasNoContrato): boolean {
  const { resumo } = metricas;
  return (
    resumo.pedidos === 0 &&
    resumo.emAberto.quantidade === 0 &&
    resumo.cancelados.quantidade === 0 &&
    resumo.naoConfirmados.quantidade === 0
  );
}
