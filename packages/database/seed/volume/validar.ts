/**
 * A VALIDAÇÃO do volume (#138): só SQL, só leitura, sem HTTP nem login.
 *
 * Não chama o `validar` do #135 (ele faz login HTTP e espera 10 pedidos por
 * loja). Abre `sc_admin` pela guarda com `default_transaction_read_only = on`
 * e `BEGIN READ ONLY`, reconfere marcador e contagens e devolve um relatório
 * sem dado pessoal (códigos de pedido e contagens apenas).
 */

import { performance } from "node:perf_hooks";

import type { ClienteSql } from "../../src/migrate.ts";
import {
  impressaoDaBase,
  lerLojasDaBase,
  numero,
  texto,
} from "./base.ts";
import { erroSeguro } from "./carga.ts";
import {
  divergenciasDoPedido,
  escolherAmostra,
  INVARIANTES,
  type LinhaDeHistorico,
  type LinhaDeItem,
  type LinhaDePedido,
} from "./checagens.ts";
import { abrirConexaoGuardada, type FabricaDeConexao, fabricaPadrao } from "./guarda.ts";
import {
  PEDIDOS_DA_BASE_POR_LOJA,
  type ParametrosDoVolume,
  ULTIMO_NUMERO_DA_BASE,
} from "./parametros.ts";
import {
  distribuirPedidos,
  hashDaLoja,
  hashDoPlano,
  montarPlanoDaLoja,
  type PlanoDaLojaDoVolume,
  quantosClientes,
} from "./plano.ts";
import type { Ambiente } from "../simulacao/banco.ts";

export interface BaselineDaCarga {
  readonly impressaoDaBaseAntes: string;
  readonly hashDoPlano: string;
}

export interface ContagemDaLoja {
  readonly indice: number;
  readonly codigo: string;
  readonly base: number;
  readonly volume: number;
  readonly esperado: number;
}

export interface TamanhoDeTabela {
  readonly tabela: string;
  readonly linhasEstimadas: number;
  readonly dadosBytes: number;
  readonly indicesBytes: number;
  readonly totalBytes: number;
}

export interface RelatorioDeValidacao {
  readonly ok: boolean;
  readonly divergencias: readonly string[];
  readonly lojas: readonly ContagemDaLoja[];
  readonly totais: { readonly base: number; readonly volume: number; readonly total: number };
  readonly invariantes: readonly { readonly nome: string; readonly violacoes: number }[];
  readonly amostra: { readonly pedidosDoVolume: number; readonly pedidosDaBase: number; readonly divergencias: number };
  readonly tamanhos: readonly TamanhoDeTabela[];
  readonly impressaoDaBase: string;
  readonly hashDoPlano: string;
  readonly comparouComABaseline: boolean;
  readonly ms: number;
}

const TABELAS_MEDIDAS = [
  "orders", "order_items", "order_item_options", "order_status_history", "order_contacts", "store_customers",
];

const data = (valor: unknown): Date => new Date(texto({ v: valor }, "v"));
const dataOuNula = (valor: unknown): Date | null => (valor === null || valor === undefined ? null : data(valor));

/** Lê um pedido e seus filhos como linhas puras para `divergenciasDoPedido`. */
async function lerPedidos(
  cliente: ClienteSql,
  lojaId: string,
  numeros: readonly number[],
): Promise<
  {
    id: string;
    numero: number;
    pedido: LinhaDePedido;
    itens: LinhaDeItem[];
    historico: LinhaDeHistorico[];
  }[]
> {
  const pedidos = await cliente.query(
    `SELECT id, number, code, status, fulfillment, subtotal_cents, items_total_cents, delivery_fee_cents,
            (discount_cents + coupon_discount_cents + pickup_discount_cents) AS desconto, total_cents,
            placed_at, accepted_at, completed_at, cancelled_at, updated_at
       FROM app.orders WHERE store_id = $1 AND number = ANY($2::bigint[]) ORDER BY number`,
    [lojaId, numeros],
  );
  const ids = pedidos.rows.map((p) => texto(p, "id"));
  const itens = await cliente.query(
    `SELECT order_id, quantity, unit_price_cents, options_total_cents, line_total_cents
       FROM app.order_items WHERE order_id = ANY($1::uuid[])`,
    [ids],
  );
  const historico = await cliente.query(
    `SELECT order_id, from_status, to_status, occurred_at FROM app.order_status_history WHERE order_id = ANY($1::uuid[])`,
    [ids],
  );
  return pedidos.rows.map((p) => ({
    id: texto(p, "id"),
    numero: numero(p, "number"),
    pedido: {
      codigo: texto(p, "code"),
      status: texto(p, "status"),
      entrega: texto(p, "fulfillment"),
      subtotal: numero(p, "subtotal_cents"),
      itensTotal: numero(p, "items_total_cents"),
      frete: numero(p, "delivery_fee_cents"),
      desconto: numero(p, "desconto"),
      total: numero(p, "total_cents"),
      feitoEm: data(p["placed_at"]),
      aceitoEm: dataOuNula(p["accepted_at"]),
      concluidoEm: dataOuNula(p["completed_at"]),
      canceladoEm: dataOuNula(p["cancelled_at"]),
      atualizadoEm: data(p["updated_at"]),
    },
    itens: itens.rows
      .filter((i) => texto(i, "order_id") === texto(p, "id"))
      .map((i) => ({
        quantidade: numero(i, "quantity"),
        precoUnitario: numero(i, "unit_price_cents"),
        totalDasOpcoes: numero(i, "options_total_cents"),
        totalDaLinha: numero(i, "line_total_cents"),
      })),
    historico: historico.rows
      .filter((h) => texto(h, "order_id") === texto(p, "id"))
      .map((h) => ({
        de: h["from_status"] === null ? null : texto(h, "from_status"),
        para: texto(h, "to_status"),
        quando: data(h["occurred_at"]),
      })),
  }));
}

/** O que o plano diz de um pedido, para comparar com a linha do banco (sem refazer o montador de linhas). */
function conferirComOPlano(
  plano: PlanoDaLojaDoVolume,
  lidos: Awaited<ReturnType<typeof lerPedidos>>,
): string[] {
  const erros: string[] = [];
  for (const lido of lidos) {
    const esperado = plano.pedidos.find((p) => p.numero === lido.numero);
    if (esperado === undefined) {
      erros.push(`${lido.pedido.codigo}: fora do plano`);
      continue;
    }
    if (
      esperado.id !== lido.id ||
      esperado.status !== lido.pedido.status ||
      esperado.total !== lido.pedido.total ||
      esperado.subtotal !== lido.pedido.subtotal ||
      esperado.feitoEm.getTime() !== lido.pedido.feitoEm.getTime() ||
      esperado.itens.length !== lido.itens.length ||
      esperado.historico.length !== lido.historico.length
    ) {
      erros.push(`${lido.pedido.codigo}: diverge do plano (loja ${plano.loja.codigo})`);
    }
  }
  return erros;
}

export interface OpcoesDaValidacao {
  readonly fabrica?: FabricaDeConexao;
  readonly baseline?: BaselineDaCarga | null;
  readonly relatar?: (linha: string) => void;
}

export async function validar(
  env: Ambiente,
  params: ParametrosDoVolume,
  opcoes: OpcoesDaValidacao = {},
): Promise<RelatorioDeValidacao> {
  const inicio = performance.now();
  const relatar = opcoes.relatar ?? (() => {});
  const conexao = await abrirConexaoGuardada(env, "sc_admin", opcoes.fabrica ?? fabricaPadrao);
  const divergencias: string[] = [];
  try {
    await conexao.query("SET default_transaction_read_only = on");
    await conexao.query("BEGIN READ ONLY");
    await conexao.query("SET LOCAL statement_timeout = '600s'");

    const lojas = await lerLojasDaBase(conexao);
    const quantidades = distribuirPedidos(params.semente, lojas.length);

    // 1. Contagem por loja, a partir das 100 lojas (LEFT JOIN: loja sem pedido aparece com zero).
    const contagem = await conexao.query(
      `SELECT s.code,
              count(o.id) FILTER (WHERE o.number <= ${ULTIMO_NUMERO_DA_BASE})::int AS base,
              count(o.id) FILTER (WHERE o.number > ${ULTIMO_NUMERO_DA_BASE})::int AS volume
         FROM app.stores s LEFT JOIN app.orders o ON o.store_id = s.id
        WHERE s.code LIKE 'SIM-%' GROUP BY s.code ORDER BY s.code`,
    );
    const porCodigo = new Map(contagem.rows.map((l) => [texto(l, "code"), l]));
    const contagens: ContagemDaLoja[] = lojas.map((loja, i) => {
      const l = porCodigo.get(loja.codigo);
      return {
        indice: i,
        codigo: loja.codigo,
        base: l === undefined ? 0 : numero(l, "base"),
        volume: l === undefined ? 0 : numero(l, "volume"),
        esperado: quantidades[i]!,
      };
    });
    for (const c of contagens) {
      if (c.base !== PEDIDOS_DA_BASE_POR_LOJA) divergencias.push(`${c.codigo}: ${c.base} pedidos-base (esperado ${PEDIDOS_DA_BASE_POR_LOJA})`);
      if (c.volume !== c.esperado) divergencias.push(`${c.codigo}: ${c.volume} pedidos de volume (esperado ${c.esperado})`);
    }
    const totais = {
      base: contagens.reduce((s, c) => s + c.base, 0),
      volume: contagens.reduce((s, c) => s + c.volume, 0),
      total: 0,
    };
    totais.total = totais.base + totais.volume;

    // 2. Invariantes em SQL (todos os pedidos do volume).
    const invariantes: { nome: string; violacoes: number }[] = [];
    for (const inv of INVARIANTES) {
      const r = await conexao.query(inv.sql, inv.usaReferencia === true ? [params.referencia.toISOString()] : []);
      const violacoes = numero(r.rows[0]!, "n");
      invariantes.push({ nome: inv.nome, violacoes });
      if (violacoes !== 0) divergencias.push(`invariante "${inv.nome}": ${violacoes} violação(ões)`);
    }
    relatar("validação: invariantes SQL conferidas.");

    // 3. Amostra independente: 10 pedidos por loja, recalculados em TS e comparados com o plano.
    let amostraVolume = 0;
    let amostraBase = 0;
    let divergenciasDaAmostra = 0;
    const hashes: string[] = [];
    const clientesDoVolume: string[] = [];
    let clientesEsperados = 0;
    for (const [i, loja] of lojas.entries()) {
      const plano = montarPlanoDaLoja(params.semente, params.referencia, loja, quantidades[i]!);
      hashes.push(hashDaLoja(plano));
      clientesDoVolume.push(...plano.clientes.map((c) => c.id));
      clientesEsperados += quantosClientes(plano.quantidade);
      if (contagens[i]!.volume !== plano.quantidade) continue; // já reportado; sem o que amostrar
      const numeros = escolherAmostra(params.semente, loja.codigo, plano.quantidade);
      const lidos = await lerPedidos(conexao, loja.id, numeros);
      amostraVolume += lidos.length;
      if (lidos.length !== numeros.length) divergencias.push(`${loja.codigo}: amostra incompleta`);
      for (const lido of lidos) {
        const erros = divergenciasDoPedido(lido.pedido, lido.itens, lido.historico, {
          convencao: "checkout",
          referencia: params.referencia,
          aprovadaEm: loja.aprovadaEm,
        });
        divergenciasDaAmostra += erros.length;
        divergencias.push(...erros);
      }
      const contraOPlano = conferirComOPlano(plano, lidos);
      divergenciasDaAmostra += contraOPlano.length;
      divergencias.push(...contraOPlano);

      // Base do #135 (convenção do seed): dinheiro e cadeia de status.
      const base = await lerPedidos(conexao, loja.id, Array.from({ length: PEDIDOS_DA_BASE_POR_LOJA }, (_v, k) => ULTIMO_NUMERO_DA_BASE - PEDIDOS_DA_BASE_POR_LOJA + 1 + k));
      amostraBase += base.length;
      for (const b of base) {
        const erros = divergenciasDoPedido(b.pedido, b.itens, b.historico, {
          convencao: "seed",
          referencia: params.referencia,
          aprovadaEm: null,
        });
        divergenciasDaAmostra += erros.length;
        divergencias.push(...erros);
      }
    }
    relatar("validação: amostra por loja conferida.");

    // 4. Clientes do volume e impressão da base.
    const clientes = await conexao.query(`SELECT count(*)::int AS n FROM app.store_customers WHERE id = ANY($1::uuid[])`, [clientesDoVolume]);
    if (numero(clientes.rows[0]!, "n") !== clientesEsperados && totais.volume > 0) {
      divergencias.push(`clientes do volume: ${numero(clientes.rows[0]!, "n")} (esperado ${clientesEsperados})`);
    }
    const impressao = await impressaoDaBase(conexao, clientesDoVolume);
    const hash = hashDoPlano(hashes);
    const baseline = opcoes.baseline ?? null;
    if (baseline !== null) {
      if (baseline.impressaoDaBaseAntes !== impressao) divergencias.push("a impressão da base do #135 mudou desde a carga");
      if (baseline.hashDoPlano !== hash) divergencias.push("o hash do plano mudou desde a carga (semente, referência ou base diferentes)");
    }

    // 5. Tamanhos.
    const tamanhos = await conexao.query(
      `SELECT c.relname, c.reltuples::bigint AS linhas, pg_relation_size(c.oid) AS dados,
              pg_indexes_size(c.oid) AS indices, pg_total_relation_size(c.oid) AS total
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relname = ANY($1::text[]) ORDER BY c.relname`,
      [TABELAS_MEDIDAS],
    );

    await conexao.query("ROLLBACK");
    return {
      ok: divergencias.length === 0,
      divergencias,
      lojas: contagens,
      totais,
      invariantes,
      amostra: { pedidosDoVolume: amostraVolume, pedidosDaBase: amostraBase, divergencias: divergenciasDaAmostra },
      tamanhos: tamanhos.rows.map((t) => ({
        tabela: texto(t, "relname"),
        linhasEstimadas: numero(t, "linhas"),
        dadosBytes: numero(t, "dados"),
        indicesBytes: numero(t, "indices"),
        totalBytes: numero(t, "total"),
      })),
      impressaoDaBase: impressao,
      hashDoPlano: hash,
      comparouComABaseline: baseline !== null,
      ms: performance.now() - inicio,
    };
  } catch (erro) {
    await conexao.query("ROLLBACK").catch(() => {});
    throw erroSeguro("validação", erro);
  } finally {
    await conexao.end().catch(() => {});
  }
}

