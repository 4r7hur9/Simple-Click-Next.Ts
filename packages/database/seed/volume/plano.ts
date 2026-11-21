/**
 * O PLANO do volume (#138): +100.000 pedidos distribuídos nas 100 lojas do
 * seed de simulação, tudo decidido por funções PURAS a partir de `semente`,
 * `referencia` e do que a base do #135 já tem (`LojaDoBanco`). Nada aqui toca
 * o banco nem o relógio.
 *
 * Convenções (e por quê):
 *
 * - Janela fixa [ref − 19 d, ref): as lojas do #135 são aprovadas 20 a 29 dias
 *   antes da referência, então nenhum pedido é anterior à loja.
 * - Cada loja recebe de 200 a 4.000 pedidos (soma 100.000). Os pedidos de
 *   `number` 1011.. seguem a ordem cronológica DENTRO do volume.
 * - Os 10 últimos pedidos de cada loja ficam em andamento (fila não vazia), nas
 *   6 h antes da referência; os demais terminam em COMPLETED (88 %) ou
 *   CANCELLED (12 %). Todo evento é ≤ referência.
 * - Itens na convenção do CHECKOUT DA VITRINE da API (D-6): `unit_price` =
 *   preço + acréscimos por unidade; `options_total` = acréscimo por unidade;
 *   `line_total` = unit × quantidade; `price_delta_cents` das opções = 0. O seed
 *   do #135 usa outra convenção (ver docs/estruturacao/09-volume.md).
 * - Os modelos de item saem dos itens dos 10 pedidos-base de cada loja: assim
 *   produto, variante e opções são FKs reais, sem reler tabelas de preço.
 */

import { createHash } from "node:crypto";

import { idDeExemplo, tokenDeExemplo } from "../deterministico.ts";
import { BAIRROS, RUAS } from "../simulacao/bairros.ts";
import { proximosStatusDoPedido } from "../simulacao/transicoes.ts";
import {
  JANELA_EM_DIAS,
  MAXIMO_POR_LOJA,
  MINIMO_POR_LOJA,
  PEDIDOS_DO_VOLUME,
  PEDIDOS_RECENTES_POR_LOJA,
  PRIMEIRO_NUMERO_DO_VOLUME,
} from "./parametros.ts";

export type Entrega = "DELIVERY" | "PICKUP";
export type Pagamento = "PIX" | "CASH" | "CARD_ON_DELIVERY";

const MINUTO = 60_000;
const HORA = 3_600_000;
const DIA = 86_400_000;
/** Fortaleza não tem horário de verão: UTC-3 o ano todo. */
const DESLOCAMENTO_DO_FUSO = -3 * HORA;
export const FUSO_DAS_LOJAS = "America/Fortaleza";
export const VERSAO_DO_VOLUME = "volume-v1";

/** E-mail da identidade sintética que enxerga "meus pedidos" no EXPLAIN. */
export const EMAIL_DA_IDENTIDADE = "volume-comprador@simulacao.test";
export const LOJAS_COM_IDENTIDADE = 5;

// ---------------------------------------------------------------------------
// Entradas: o que a base do #135 tem
// ---------------------------------------------------------------------------

export interface OpcaoDoModelo {
  readonly grupoId: string | null;
  readonly itemId: string | null;
  readonly grupo: string;
  readonly opcao: string;
  readonly tipo: string | null;
  /** Acréscimo por unidade, em centavos. */
  readonly acrescimo: number;
}

export interface ModeloDeItem {
  readonly produtoId: string | null;
  readonly varianteId: string | null;
  readonly produto: string;
  readonly variante: string | null;
  readonly sku: string | null;
  /** Preço cobrado SEM opções (o `unit_price_cents` da convenção do seed). */
  readonly precoBase: number;
  readonly comparadoCom: number | null;
  readonly custo: number | null;
  readonly tipoDePreco: string | null;
  readonly opcoes: readonly OpcaoDoModelo[];
}

export interface LojaDoBanco {
  readonly id: string;
  /** `SIM-<impressão>-NNN`. */
  readonly codigo: string;
  readonly indice: number;
  readonly aprovadaEm: Date;
  readonly modelos: readonly ModeloDeItem[];
  /** Taxa de entrega observada nos pedidos-base (0 = sem entrega paga). */
  readonly frete: number;
  readonly entregas: readonly Entrega[];
  readonly pagamentos: readonly Pagamento[];
  readonly pix: {
    readonly chave: string;
    readonly titular: string;
    readonly tipo: string;
  } | null;
  /** Quem mexeu no histórico dos pedidos-base (a dona), se algum. */
  readonly quemMudaStatus: string | null;
}

// ---------------------------------------------------------------------------
// Saídas
// ---------------------------------------------------------------------------

export interface ClienteDoVolume {
  readonly id: string;
  readonly nome: string;
  readonly telefone: string;
  readonly email: string | null;
  readonly endereco: {
    readonly logradouro: string;
    readonly numero: string;
    readonly complemento: string | null;
    readonly bairro: string;
  };
  readonly identidade: string | null;
  readonly pedidos: number;
  readonly gasto: number;
  readonly ultimoPedido: Date | null;
}

export interface OpcaoDoPedido extends OpcaoDoModelo {
  readonly id: string;
}

export interface ItemDoVolume {
  readonly id: string;
  readonly modelo: ModeloDeItem;
  readonly quantidade: number;
  /** Produto + acréscimos, por unidade. */
  readonly precoUnitario: number;
  readonly acrescimoPorUnidade: number;
  readonly total: number;
  readonly opcoes: readonly OpcaoDoPedido[];
}

export interface EventoDoVolume {
  readonly id: string;
  readonly de: string | null;
  readonly para: string;
  readonly quando: Date;
}

export interface PedidoDoVolume {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly token: string;
  readonly chaveDeIdempotencia: string;
  readonly clienteId: string;
  readonly status: string;
  readonly entrega: Entrega;
  readonly pagamento: Pagamento;
  readonly troco: number | null;
  readonly subtotal: number;
  readonly frete: number;
  readonly total: number;
  readonly custoTotal: number;
  readonly feitoEm: Date;
  readonly aceitoEm: Date | null;
  readonly concluidoEm: Date | null;
  readonly canceladoEm: Date | null;
  readonly atualizadoEm: Date;
  readonly motivoDoCancelamento: string | null;
  readonly itens: readonly ItemDoVolume[];
  readonly historico: readonly EventoDoVolume[];
}

export interface PlanoDaLojaDoVolume {
  readonly loja: LojaDoBanco;
  readonly quantidade: number;
  readonly clientes: readonly ClienteDoVolume[];
  readonly pedidos: readonly PedidoDoVolume[];
}

// ---------------------------------------------------------------------------
// Aleatoriedade determinística
// ---------------------------------------------------------------------------

export interface Sorteador {
  /** Número em [0, 1). */
  (): number;
}

/** mulberry32 semeado por SHA-256: o mesmo texto dá a mesma sequência em qualquer máquina. */
export function semear(texto: string): Sorteador {
  const resumo = createHash("sha256").update(texto).digest();
  let estado = resumo.readUInt32BE(0);
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const inteiro = (sorteio: Sorteador, limite: number): number =>
  Math.floor(sorteio() * limite);

/** Sorteio com pesos: devolve o índice escolhido. */
function ponderado(sorteio: Sorteador, pesos: readonly number[]): number {
  const total = pesos.reduce((a, b) => a + b, 0);
  let ponto = sorteio() * total;
  for (let i = 0; i < pesos.length; i++) {
    ponto -= pesos[i]!;
    if (ponto < 0) return i;
  }
  return pesos.length - 1;
}

// ---------------------------------------------------------------------------
// Distribuição por loja
// ---------------------------------------------------------------------------

/**
 * Reparte `total` entre `lojas` com pesos determinísticos, respeitando
 * [minimo, maximo] e somando exatamente `total` (resto pela maior fração,
 * desempate pelo menor índice).
 */
export function distribuirPedidos(
  semente: string,
  lojas: number,
  total: number = PEDIDOS_DO_VOLUME,
  minimo: number = MINIMO_POR_LOJA,
  maximo: number = MAXIMO_POR_LOJA,
): number[] {
  if (lojas * minimo > total || lojas * maximo < total) {
    throw new Error("Distribuição impossível dentro dos limites por loja.");
  }
  const sorteio = semear(`${semente}|${VERSAO_DO_VOLUME}|pesos`);
  const pesos = Array.from({ length: lojas }, () => {
    const u = sorteio();
    return 0.1 + u * u;
  });

  const quantidades: number[] = new Array<number>(lojas).fill(minimo);
  let fixas = new Set<number>();
  let sobra = total - minimo * lojas;
  // Alocação com limite superior: quem passa do máximo trava e o resto é refeito.
  for (let volta = 0; volta < lojas; volta++) {
    const livres = pesos.map((_p, i) => i).filter((i) => !fixas.has(i));
    const somaDosPesos = livres.reduce((s, i) => s + pesos[i]!, 0);
    let travou = false;
    for (const i of livres) {
      const parte = (sobra * pesos[i]!) / somaDosPesos;
      if (minimo + parte > maximo) {
        quantidades[i] = maximo;
        fixas = new Set([...fixas, i]);
        sobra -= maximo - minimo;
        travou = true;
        break;
      }
    }
    if (!travou) {
      const brutas = livres.map((i) => (sobra * pesos[i]!) / somaDosPesos);
      const inteiras = brutas.map(Math.floor);
      let falta = sobra - inteiras.reduce((a, b) => a + b, 0);
      const ordem = brutas
        .map((b, k) => ({ k, fracao: b - Math.floor(b) }))
        .sort((a, b) => b.fracao - a.fracao || a.k - b.k);
      for (const { k } of ordem) {
        if (falta <= 0) break;
        if (minimo + inteiras[k]! + 1 <= maximo) {
          inteiras[k]! += 1;
          falta--;
        }
      }
      livres.forEach((i, k) => {
        quantidades[i] = minimo + inteiras[k]!;
      });
      break;
    }
  }
  if (quantidades.reduce((a, b) => a + b, 0) !== total) {
    throw new Error("A distribuição por loja não fechou o total.");
  }
  return quantidades;
}

// ---------------------------------------------------------------------------
// Caminho de status
// ---------------------------------------------------------------------------

export function caminhoDoPedido(
  status: string,
  entrega: Entrega,
  viaAceite: boolean,
): string[] {
  const final = entrega === "PICKUP" ? "READY_FOR_PICKUP" : "OUT_FOR_DELIVERY";
  switch (status) {
    case "PENDING":
      return ["PENDING"];
    case "ACCEPTED":
      return ["PENDING", "ACCEPTED"];
    case "PREPARING":
      return ["PENDING", "ACCEPTED", "PREPARING"];
    case "READY_FOR_PICKUP":
    case "OUT_FOR_DELIVERY":
      return ["PENDING", "ACCEPTED", "PREPARING", final];
    case "COMPLETED":
      return ["PENDING", "ACCEPTED", "PREPARING", final, "COMPLETED"];
    case "CANCELLED":
      return viaAceite ? ["PENDING", "ACCEPTED", "CANCELLED"] : ["PENDING", "CANCELLED"];
    default:
      throw new Error(`Status desconhecido: ${status}`);
  }
}

/** Cada passo do caminho precisa ser uma transição permitida pelo núcleo. */
export function caminhoEhValido(caminho: readonly string[], entrega: Entrega): boolean {
  if (caminho[0] !== "PENDING") return false;
  for (let i = 1; i < caminho.length; i++) {
    if (!proximosStatusDoPedido(caminho[i - 1]!, entrega).includes(caminho[i]!)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Nomes e endereços sintéticos
// ---------------------------------------------------------------------------

const NOMES = [
  "Ana", "Bruno", "Carla", "Daniel", "Eduarda", "Felipe", "Gabriela", "Henrique",
  "Isabela", "João", "Karina", "Lucas", "Mariana", "Nicolas", "Olívia", "Paulo",
  "Rafaela", "Samuel", "Tatiane", "Vitor", "Yasmin", "Rodrigo", "Beatriz", "Caio",
];
const SOBRENOMES = [
  "Almeida", "Barros", "Cavalcante", "Dantas", "Esteves", "Façanha", "Gomes",
  "Holanda", "Lima", "Machado", "Nogueira", "Oliveira", "Pinheiro", "Queiroz",
  "Rocha", "Sampaio", "Tavares", "Uchoa", "Vasconcelos", "Xavier",
];

const pad = (n: number, largura: number): string => String(n).padStart(largura, "0");

function clienteSintetico(
  semente: string,
  loja: LojaDoBanco,
  posicao: number,
): Omit<ClienteDoVolume, "pedidos" | "gasto" | "ultimoPedido" | "identidade"> {
  const sorteio = semear(`${semente}|${VERSAO_DO_VOLUME}|${loja.codigo}|cliente|${posicao}`);
  const nome = `${NOMES[inteiro(sorteio, NOMES.length)]!} ${SOBRENOMES[inteiro(sorteio, SOBRENOMES.length)]!}`;
  const bairro = BAIRROS[inteiro(sorteio, BAIRROS.length)]![0];
  return {
    id: idDeExemplo(`${VERSAO_DO_VOLUME}:${semente}:${loja.codigo}:cliente:${posicao}`),
    nome,
    // 13 dígitos (+55 DDD 85, celular): único por loja e por posição, ficcional.
    telefone: `+5585977${pad(loja.indice, 3)}${pad(posicao, 3)}`,
    email:
      inteiro(sorteio, 10) < 3
        ? `cliente${posicao}.${pad(loja.indice, 3)}@volume.simulacao.test`
        : null,
    endereco: {
      logradouro: RUAS[inteiro(sorteio, RUAS.length)]!,
      numero: String(10 + inteiro(sorteio, 2000)),
      complemento: inteiro(sorteio, 5) === 0 ? `Apto ${101 + inteiro(sorteio, 400)}` : null,
      bairro,
    },
  };
}

// ---------------------------------------------------------------------------
// Instantes
// ---------------------------------------------------------------------------

const noSegundo = (t: number): number => Math.floor(t / 1000) * 1000;

/** Um instante em [inicio, fim), de preferência no horário comercial local (10h–22h). */
function instanteComercial(sorteio: Sorteador, inicio: number, fim: number): number {
  const bruto = noSegundo(inicio + sorteio() * (fim - inicio));
  const minutosLocais = Math.floor((((bruto + DESLOCAMENTO_DO_FUSO) % DIA) + DIA) % DIA / MINUTO);
  if (minutosLocais >= 600 && minutosLocais < 1320) return bruto;
  if (sorteio() < 0.1) return bruto; // 10 % fora do horário: madrugada e fim de noite existem
  const novo = noSegundo(bruto - minutosLocais * MINUTO + (600 + inteiro(sorteio, 720)) * MINUTO);
  return novo >= inicio && novo < fim ? novo : bruto;
}

// ---------------------------------------------------------------------------
// Uma loja
// ---------------------------------------------------------------------------

export function quantosClientes(quantidade: number): number {
  return Math.max(30, Math.ceil(quantidade / 6));
}

const PESO_DOS_ITENS = [50, 35, 15];
const PESO_DAS_QUANTIDADES = [60, 30, 10];
const STATUS_RECENTES = ["PENDING", "ACCEPTED", "PREPARING", "FINAL"] as const;
const PESO_DOS_RECENTES = [30, 25, 25, 20];

export function idDaIdentidadeDoVolume(semente: string): string {
  return idDeExemplo(`${VERSAO_DO_VOLUME}:${semente}:identidade`);
}

/** Monta os `quantidade` pedidos (e os clientes) de uma loja. */
export function montarPlanoDaLoja(
  semente: string,
  referencia: Date,
  loja: LojaDoBanco,
  quantidade: number,
): PlanoDaLojaDoVolume {
  if (loja.modelos.length === 0) {
    throw new Error(`A loja ${loja.codigo} não tem item-modelo nos pedidos-base.`);
  }
  const sorteio = semear(`${semente}|${referencia.toISOString()}|${VERSAO_DO_VOLUME}|${loja.codigo}`);
  const ref = referencia.getTime();
  const inicioDaJanela = ref - JANELA_EM_DIAS * DIA;
  const recentes = Math.min(PEDIDOS_RECENTES_POR_LOJA, quantidade);

  // 1. Instantes: os antigos em [janela, ref − 6 h); os recentes em [ref − 6 h, ref − 30 min).
  const slots: { t: number; recente: boolean }[] = [];
  for (let i = 0; i < quantidade - recentes; i++) {
    slots.push({ t: instanteComercial(sorteio, inicioDaJanela, ref - 6 * HORA), recente: false });
  }
  for (let i = 0; i < recentes; i++) {
    slots.push({ t: noSegundo(ref - 6 * HORA + sorteio() * (5.5 * HORA)), recente: true });
  }
  slots.sort((a, b) => a.t - b.t);

  // 2. Clientes e pedidos.
  const nClientes = quantosClientes(quantidade);
  const base = Array.from({ length: nClientes }, (_v, k) => clienteSintetico(semente, loja, k));
  const contagem = new Array<number>(nClientes).fill(0);
  const gasto = new Array<number>(nClientes).fill(0);
  const ultimo = new Array<number>(nClientes).fill(0);

  const pedidos: PedidoDoVolume[] = slots.map((slot, ordem) => {
    const numero = PRIMEIRO_NUMERO_DO_VOLUME + ordem;
    const prefixo = `${VERSAO_DO_VOLUME}:${semente}:${loja.codigo}`;
    const entrega: Entrega =
      loja.entregas.length === 1
        ? loja.entregas[0]!
        : sorteio() < 0.7
          ? "DELIVERY"
          : "PICKUP";
    const pagamento = loja.pagamentos[inteiro(sorteio, loja.pagamentos.length)]!;

    // Status e caminho.
    let caminho: string[];
    if (slot.recente) {
      const escolha = STATUS_RECENTES[ponderado(sorteio, PESO_DOS_RECENTES)]!;
      const status =
        escolha === "FINAL"
          ? entrega === "PICKUP"
            ? "READY_FOR_PICKUP"
            : "OUT_FOR_DELIVERY"
          : escolha;
      caminho = caminhoDoPedido(status, entrega, true);
    } else if (sorteio() < 0.88) {
      caminho = caminhoDoPedido("COMPLETED", entrega, true);
    } else {
      caminho = caminhoDoPedido("CANCELLED", entrega, sorteio() < 0.6);
    }
    const status = caminho[caminho.length - 1]!;

    // Quando cada evento aconteceu.
    const quando: number[] = [slot.t];
    for (let n = 1; n < caminho.length; n++) {
      const folga = slot.recente ? 2 + inteiro(sorteio, 5) : 2 + inteiro(sorteio, 19);
      quando.push(noSegundo(quando[n - 1]! + folga * MINUTO + inteiro(sorteio, 60) * 1000));
    }
    const momentoDe = (estado: string): Date | null => {
      const posicao = caminho.indexOf(estado);
      return posicao < 0 ? null : new Date(quando[posicao]!);
    };

    // Itens, na convenção do checkout da vitrine.
    const quantosItens = 1 + ponderado(sorteio, PESO_DOS_ITENS);
    const usados = new Set<number>();
    const itens: ItemDoVolume[] = [];
    for (let k = 0; itens.length < quantosItens && k < 12; k++) {
      const m = inteiro(sorteio, loja.modelos.length);
      if (usados.has(m) && usados.size < loja.modelos.length) continue;
      usados.add(m);
      const modelo = loja.modelos[m]!;
      const quantidadeDoItem = 1 + ponderado(sorteio, PESO_DAS_QUANTIDADES);
      const acrescimo = modelo.opcoes.reduce((s, o) => s + o.acrescimo, 0);
      const precoUnitario = modelo.precoBase + acrescimo;
      const posicao = itens.length;
      itens.push({
        id: idDeExemplo(`${prefixo}:item:${numero}:${posicao}`),
        modelo,
        quantidade: quantidadeDoItem,
        precoUnitario,
        acrescimoPorUnidade: acrescimo,
        total: precoUnitario * quantidadeDoItem,
        opcoes: modelo.opcoes.map((o, ordemDaOpcao) => ({
          ...o,
          id: idDeExemplo(`${prefixo}:opcao:${numero}:${posicao}:${ordemDaOpcao}`),
        })),
      });
    }

    const subtotal = itens.reduce((s, i) => s + i.total, 0);
    const frete = entrega === "DELIVERY" ? loja.frete : 0;
    const total = subtotal + frete;
    const cliente = Math.min(nClientes - 1, Math.floor(nClientes * sorteio() * sorteio()));
    if (status !== "CANCELLED") contagem[cliente]! += 1;
    if (status === "COMPLETED") gasto[cliente]! += total;
    ultimo[cliente] = Math.max(ultimo[cliente]!, slot.t);

    return {
      id: idDeExemplo(`${prefixo}:pedido:${numero}`),
      numero,
      codigo: `A-${pad(numero, 4)}`,
      token: tokenDeExemplo(`${prefixo}:pedido:${numero}`),
      chaveDeIdempotencia: `vol-${pad(loja.indice, 3)}-${numero}`,
      clienteId: base[cliente]!.id,
      status,
      entrega,
      pagamento,
      troco: pagamento === "CASH" ? Math.ceil(total / 5000) * 5000 : null,
      subtotal,
      frete,
      total,
      custoTotal: itens.reduce((s, i) => s + (i.modelo.custo ?? 0) * i.quantidade, 0),
      feitoEm: new Date(slot.t),
      aceitoEm: momentoDe("ACCEPTED"),
      concluidoEm: momentoDe("COMPLETED"),
      canceladoEm: momentoDe("CANCELLED"),
      atualizadoEm: new Date(quando[quando.length - 1]!),
      motivoDoCancelamento: status === "CANCELLED" ? "Cancelado pelo cliente" : null,
      itens,
      historico: caminho.map((estado, n) => ({
        id: idDeExemplo(`${prefixo}:historico:${numero}:${estado}`),
        de: n === 0 ? null : caminho[n - 1]!,
        para: estado,
        quando: new Date(quando[n]!),
      })),
    };
  });

  // 3. Quem é o cliente mais frequente (a identidade sintética se liga a ele).
  let maisFrequente = 0;
  for (let k = 1; k < nClientes; k++) {
    if (contagem[k]! > contagem[maisFrequente]!) maisFrequente = k;
  }
  const identidade =
    loja.indice < LOJAS_COM_IDENTIDADE ? idDaIdentidadeDoVolume(semente) : null;
  const clientes: ClienteDoVolume[] = base.map((c, k) => ({
    ...c,
    identidade: k === maisFrequente ? identidade : null,
    pedidos: contagem[k]!,
    gasto: gasto[k]!,
    ultimoPedido: ultimo[k]! > 0 ? new Date(ultimo[k]!) : null,
  }));

  return { loja, quantidade, clientes, pedidos };
}

// ---------------------------------------------------------------------------
// Impressão do plano
// ---------------------------------------------------------------------------

/** O conteúdo canônico de uma loja (sem `attributes_snapshot`, que o banco reescreve). */
export function conteudoCanonicoDaLoja(plano: PlanoDaLojaDoVolume): string {
  return JSON.stringify({
    loja: plano.loja.codigo,
    quantidade: plano.quantidade,
    clientes: plano.clientes.map((c) => [
      c.id, c.nome, c.telefone, c.email, c.endereco, c.identidade, c.pedidos, c.gasto,
      c.ultimoPedido?.toISOString() ?? null,
    ]),
    pedidos: plano.pedidos.map((p) => [
      p.id, p.numero, p.codigo, p.token, p.clienteId, p.status, p.entrega, p.pagamento,
      p.troco, p.subtotal, p.frete, p.total, p.custoTotal, p.feitoEm.toISOString(),
      p.aceitoEm?.toISOString() ?? null, p.concluidoEm?.toISOString() ?? null,
      p.canceladoEm?.toISOString() ?? null, p.atualizadoEm.toISOString(),
      p.itens.map((i) => [
        i.id, i.modelo.produtoId, i.modelo.varianteId, i.quantidade, i.precoUnitario,
        i.acrescimoPorUnidade, i.total, i.opcoes.map((o) => [o.id, o.itemId, o.acrescimo]),
      ]),
      p.historico.map((h) => [h.id, h.de, h.para, h.quando.toISOString()]),
    ]),
  });
}

export const hashDaLoja = (plano: PlanoDaLojaDoVolume): string =>
  createHash("sha256").update(conteudoCanonicoDaLoja(plano)).digest("hex");

/** Hash do plano inteiro a partir dos hashes por loja (em ordem de índice). */
export function hashDoPlano(hashes: readonly string[]): string {
  return createHash("sha256").update(hashes.join("\n")).digest("hex");
}

/** Ids de todos os pedidos de uma loja (o "namespace" do volume). */
export const idsDosPedidos = (plano: PlanoDaLojaDoVolume): string[] =>
  plano.pedidos.map((p) => p.id);
