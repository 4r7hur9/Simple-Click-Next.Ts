/**
 * Apoio dos testes do volume: ambiente falso, lojas de mentira e uma conexão
 * falsa que ENTENDE as consultas da carga/validação/EXPLAIN e grava o que foi
 * pedido. Nenhum teste abre conexão real (D-11): a fábrica injetada é a única
 * porta, e os testes de recusa provam que ela não é chamada.
 */

import { COLUNAS_USADAS } from "./carga.ts";
import type { ConexaoDoVolume, FabricaDeConexao } from "./guarda.ts";
import { BANCO_DO_VOLUME, ULTIMO_NUMERO_DA_BASE } from "./parametros.ts";
import { distribuirPedidos, type LojaDoBanco, type ModeloDeItem } from "./plano.ts";
import { MARCADOR_DO_BANCO } from "../simulacao/banco.ts";

export const SEMENTE = "sc-2026";
export const REFERENCIA = new Date("2026-11-01T18:00:00-03:00");

export const ENV_VALIDO: Readonly<Record<string, string>> = {
  NODE_ENV: "development",
  DATABASE_URL_DIRETA: "postgresql://simpleclick:segredo-do-dono@localhost:5432/simpleclick_dev",
  DATABASE_URL: "postgresql://sc_app:x@localhost:6432/simpleclick_dev?pgbouncer=true",
  DATABASE_URL_TEST: "postgresql://simpleclick:x@localhost:5433/simpleclick_test",
  SENHA_BANCO_MIGRADOR: "senha-migrador",
  SENHA_BANCO_APLICACAO: "senha-aplicacao",
  SENHA_BANCO_ADMINISTRACAO: "senha-administracao",
};

export const MODELOS: readonly ModeloDeItem[] = [0, 1, 2, 3].map((i) => ({
  produtoId: `00000000-0000-4000-8000-00000000000${i}`,
  varianteId: null,
  produto: `Produto ${i}`,
  variante: null,
  sku: null,
  precoBase: 1000 + i * 250,
  comparadoCom: null,
  custo: 400,
  tipoDePreco: "BASE",
  opcoes:
    i % 2 === 1
      ? [{ grupoId: "00000000-0000-4000-8000-0000000000a1", itemId: "00000000-0000-4000-8000-0000000000b1", grupo: "Adicionais", opcao: "Bacon", tipo: "ADDON", acrescimo: 300 }]
      : [],
}));

export const idDaLoja = (i: number): string => `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`;
export const codigoDaLoja = (i: number): string => `SIM-abcdef01-${String(i).padStart(3, "0")}`;

export function lojaDeTeste(i: number, extra: Partial<LojaDoBanco> = {}): LojaDoBanco {
  return {
    id: idDaLoja(i),
    codigo: codigoDaLoja(i),
    indice: i,
    aprovadaEm: new Date("2026-10-08T12:00:00-03:00"),
    modelos: MODELOS,
    frete: 600,
    entregas: ["DELIVERY", "PICKUP"],
    pagamentos: ["PIX", "CASH"],
    pix: { chave: "chave-pix-de-teste", titular: "Titular de Teste", tipo: "RANDOM" },
    quemMudaStatus: "00000000-0000-4000-8000-0000000000d1",
    ...extra,
  };
}

export interface Cenario {
  /** `vazia`: só a base (1010). `completa`: o plano inteiro. `parcial`: loja 3 com 5 pedidos a mais. */
  estado: "vazia" | "completa" | "parcial";
  lockOk: boolean;
  sessoesAlheias: number;
  /** Falha no n-ésimo INSERT (1-based) com este código SQLSTATE. */
  falharNoInsert: number | null;
  /** A impressão da base muda na 2ª leitura. */
  mudarImpressao: boolean;
  /** Atributos da identidade da sessão. */
  identidade: { marcador: string | null; superusuario: boolean; contornaRls: boolean; membros: number };
  /** Lojas (índice) sem pedido de volume na contagem do `validar`. */
  lojasSemPedido: readonly number[];
}

export const cenarioPadrao = (): Cenario => ({
  estado: "vazia",
  lockOk: true,
  sessoesAlheias: 0,
  falharNoInsert: null,
  mudarImpressao: false,
  identidade: { marcador: MARCADOR_DO_BANCO, superusuario: false, contornaRls: false, membros: 0 },
  lojasSemPedido: [],
});

export interface Registro {
  readonly urls: string[];
  readonly consultas: { readonly sql: string; readonly valores: unknown[] | undefined; readonly url: string }[];
  readonly inserts: { readonly tabela: string; readonly valores: unknown[][] }[];
  pedidosDeInsert: number;
}

const resposta = (rows: Record<string, unknown>[] = [], rowCount: number | null = null) => ({ rows, rowCount: rowCount ?? rows.length });

/** A fábrica falsa e o que ela viu. */
export function fabricaFalsa(cenario: Cenario = cenarioPadrao()): { fabrica: FabricaDeConexao; registro: Registro } {
  const registro: Registro = { urls: [], consultas: [], inserts: [], pedidosDeInsert: 0 };
  const quantidades = distribuirPedidos(SEMENTE, 100);
  let leiturasDeImpressao = 0;
  let pidSeguinte = 4000;
  let nInsert = 0;

  const indiceDoId = (id: unknown): number => Number(String(id).slice(-12));

  const fabrica: FabricaDeConexao = async (url) => {
    registro.urls.push(url);
    const papel = new URL(url).username;
    const pid = pidSeguinte++;
    const conexao: ConexaoDoVolume = {
      async end() {},
      async query(sql: string, valores?: unknown[]) {
        registro.consultas.push({ sql, valores, url });
        const s = sql.replace(/\s+/g, " ").trim();
        if (s.includes("FROM pg_roles r")) {
          return resposta([{
            banco: BANCO_DO_VOLUME, papel, marcador: cenario.identidade.marcador,
            superusuario: cenario.identidade.superusuario, contorna_rls: cenario.identidade.contornaRls,
            membros: cenario.identidade.membros,
          }]);
        }
        if (s.startsWith("SET ") || s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK" || s.startsWith("BEGIN ")) return resposta();
        if (s.includes("pg_try_advisory_lock")) return resposta([{ ok: cenario.lockOk }]);
        if (s.includes("pg_advisory_unlock")) return resposta([{ pg_advisory_unlock: true }]);
        if (s.includes("pg_backend_pid")) return resposta([{ pid }]);
        if (s.includes("FROM pg_stat_activity")) return resposta([{ n: cenario.sessoesAlheias }]);
        if (s.includes("FROM information_schema.columns")) {
          return resposta(Object.entries(COLUNAS_USADAS).flatMap(([t, cs]) => cs.map((c) => ({ table_name: t, column_name: c }))));
        }
        if (s.startsWith("SELECT id, code, approved_at FROM app.stores WHERE code LIKE")) {
          return resposta(Array.from({ length: 100 }, (_v, i) => ({ id: idDaLoja(i), code: codigoDaLoja(i), approved_at: "2026-10-08T15:00:00.000Z" })));
        }
        if (s.includes("FROM app.orders WHERE store_id = ANY") && s.includes("fulfillment")) {
          return resposta(Array.from({ length: 100 }, (_v, i) => [
            { store_id: idDaLoja(i), fulfillment: "DELIVERY", payment_method: "PIX", delivery_fee_cents: 600, pix_key_snapshot: "chave-pix-de-teste", pix_holder_snapshot: "Titular de Teste", pix_key_type_snapshot: "RANDOM" },
            { store_id: idDaLoja(i), fulfillment: "PICKUP", payment_method: "CASH", delivery_fee_cents: 0, pix_key_snapshot: null, pix_holder_snapshot: null, pix_key_type_snapshot: null },
          ]).flat());
        }
        if (s.includes("FROM app.order_items i JOIN app.orders o ON o.id = i.order_id WHERE o.store_id = ANY")) {
          return resposta(Array.from({ length: 100 }, (_v, i) => MODELOS.map((m, k) => ({
            store_id: idDaLoja(i), number: 1001 + k, id: `00000000-0000-4000-a000-${String(i * 10 + k).padStart(12, "0")}`,
            product_id: m.produtoId, variant_id: null, product_name: m.produto, variant_name: null, sku_snapshot: null,
            unit_price_cents: m.precoBase, compare_at_cents: null, unit_cost_cents: 400, price_kind_snapshot: "BASE",
          }))).flat());
        }
        if (s.includes("FROM app.order_item_options oio")) {
          return resposta(Array.from({ length: 100 }, (_v, i) => MODELOS.flatMap((m, k) => m.opcoes.map((o) => ({
            order_item_id: `00000000-0000-4000-a000-${String(i * 10 + k).padStart(12, "0")}`, option_group_id: o.grupoId, option_item_id: o.itemId,
            group_name_snapshot: o.grupo, option_name_snapshot: o.opcao, kind_snapshot: o.tipo, price_delta_cents: o.acrescimo,
          })))).flat());
        }
        if (s.includes("DISTINCT ON (h.store_id)")) {
          return resposta(Array.from({ length: 100 }, (_v, i) => ({ store_id: idDaLoja(i), changed_by_identity_id: "00000000-0000-4000-8000-0000000000d1" })));
        }
        if (s.includes("FROM app.identities WHERE id")) return resposta();
        if (s.includes("FROM app.store_customers WHERE identity_id")) return resposta([{ n: 0 }]);
        if (s.includes("count(*) FILTER (WHERE number <=")) {
          const i = indiceDoId(valores?.[0]);
          const n = quantidades[i]!;
          const completa = cenario.estado === "completa";
          const parcial = cenario.estado === "parcial" && i === 3;
          const acima = completa ? n : parcial ? 5 : 0;
          return resposta([{
            base: 10, acima, do_plano: completa ? n : 0,
            maximo: ULTIMO_NUMERO_DA_BASE + (completa ? n : parcial ? 5 : 0),
            sequencia: ULTIMO_NUMERO_DA_BASE + (completa ? n : parcial ? 5 : 0),
          }]);
        }
        if (s.includes("string_agg")) {
          leiturasDeImpressao++;
          return resposta([{ t: cenario.mudarImpressao && leiturasDeImpressao > 5 ? "diferente" : "igual" }]);
        }
        if (s.includes("FROM app.store_sequences WHERE store_id = $1 AND kind = 'order' FOR UPDATE")) {
          return resposta([{ last_value: ULTIMO_NUMERO_DA_BASE }]);
        }
        if (s.startsWith("INSERT INTO app.identities")) return resposta([], 1);
        if (s.startsWith("INSERT INTO app.")) {
          nInsert++;
          if (cenario.falharNoInsert === nInsert) {
            throw Object.assign(new Error('duplicate key value violates unique constraint "orders_public_token_uk" DETAIL: Key (public_token)=(segredo-do-token)'), { code: "23505" });
          }
          const tabela = /INSERT INTO app\.(\w+)/.exec(s)![1]!;
          registro.inserts.push({ tabela, valores: (valores ?? []) as unknown[][] });
          if (tabela === "orders") registro.pedidosDeInsert += ((valores ?? [])[0] as unknown[]).length;
          return resposta([], ((valores ?? [])[0] as unknown[] | undefined)?.length ?? 0);
        }
        if (s.startsWith("UPDATE app.store_sequences")) return resposta([], 1);
        if (s.includes("AS n")) return resposta([{ n: 0 }]);
        if (s.includes("FROM app.stores s LEFT JOIN app.orders o")) {
          return resposta(Array.from({ length: 100 }, (_v, i) => ({
            code: codigoDaLoja(i), base: 10, volume: cenario.lojasSemPedido.includes(i) ? 0 : quantidades[i]!,
          })));
        }
        return resposta();
      },
    };
    return conexao;
  };
  return { fabrica, registro };
}

export const contem = (registro: Registro, trecho: string): number =>
  registro.consultas.filter((c) => c.sql.replace(/\s+/g, " ").includes(trecho)).length;
