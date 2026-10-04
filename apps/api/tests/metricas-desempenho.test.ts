/**
 * Prova de que o painel responde rápido com histórico grande (T-802, AC-813).
 *
 * Uma loja com um ano de movimento — dezenas de milhares de pedidos, com
 * itens — dividindo a tabela com outra loja igualmente movimentada. O corte
 * de sete dias precisa:
 *
 * 1. responder em menos de um segundo pela aplicação montada, sem cache
 *    (`atualizar=1`), já com a conexão aquecida — é a "condição normal de
 *    uso" do critério;
 * 2. NÃO VARRER A TABELA. Cada consulta das métricas é explicada pelo
 *    PostgreSQL com a credencial da aplicação, sob o isolamento por linha e
 *    com a loja no contexto — o mesmo plano que a requisição recebe —, e
 *    nenhuma delas pode ler `orders` ou `order_items` por varredura
 *    sequencial. Com o volume crescendo, a varredura é o que transforma um
 *    painel de um segundo num de dez.
 *
 * O plano é capturado sem duplicar o SQL das consultas: a prova roda as
 * próprias funções de `metrics/consultas.ts` com a transação embrulhada, e o
 * embrulho troca cada `$queryRaw` pelo `EXPLAIN` do mesmo texto, com os
 * mesmos parâmetros.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDasMetricas } from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import {
  appDasMetricas,
  lerMetricas,
  SAO_PAULO,
  tokenDoDonoDasMetricas,
} from "./apoio-de-metricas.ts";
import { exigirContexto } from "../src/core/contexto.ts";
import type { AcessoAoBanco, TransacaoDoBanco } from "../src/core/db.ts";
import {
  gruposDoPeriodo,
  marcaDaguaDosPedidos,
  produtosMaisVendidos,
  vendasPorDia,
  vendasPorHora,
} from "../src/modules/metrics/consultas.ts";
import {
  resolverPeriodo,
  type PeriodoResolvido,
} from "../src/modules/metrics/periodo.ts";

/** Um ano de movimento: cem pedidos por dia. */
const PEDIDOS_DA_LOJA = 36_500;
/** A vizinha divide a tabela, para o filtro por loja ter o que separar. */
const PEDIDOS_DA_VIZINHA = 20_000;
/** O teto do critério, em milissegundos. */
const LIMITE_MS = 1_000;

/** 14h32 de 27/09/2026 em São Paulo. */
const AGORA = new Date("2026-09-27T14:32:00-03:00");

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let loja: LojaDeTeste;
let vizinha: LojaDeTeste;

/** Grava o histórico da loja direto no banco, num comando só. */
async function semearHistorico(alvo: LojaDeTeste, quantos: number) {
  // Um pedido a cada 864 s é cem por dia, voltando no tempo a partir de agora.
  await migrador.query(
    `INSERT INTO app.orders
       (store_id, number, code, public_token, status, channel, total_cents,
        subtotal_cents, items_total_cents, placed_at, updated_at)
     SELECT $1::uuid, g, 'H' || g, md5($1::text || ':' || g::text),
            (ARRAY['COMPLETED','PREPARING','CANCELLED','ACCEPTED','PENDING'])[1 + g % 5],
            CASE WHEN g % 4 = 0 THEN 'MANUAL' ELSE 'ONLINE' END,
            1000 + (g % 50) * 100, 1000 + (g % 50) * 100, 1000 + (g % 50) * 100,
            $2::timestamptz - g * interval '864 seconds',
            $2::timestamptz - g * interval '864 seconds'
       FROM generate_series(1, $3::int) AS g`,
    [alvo.id, AGORA, quantos],
  );
  await migrador.query(
    `INSERT INTO app.order_items
       (store_id, order_id, product_name, quantity, unit_price_cents,
        line_total_cents, sort_order)
     SELECT o.store_id, o.id, 'Produto ' || (o.number % 40), 1 + (o.number % 3)::int,
            o.total_cents, o.total_cents * (1 + o.number % 3), 0
       FROM app.orders o
      WHERE o.store_id = $1::uuid`,
    [alvo.id],
  );
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  loja = await criarLoja({ nome: "Restaurante de Um Ano" });
  vizinha = await criarLoja({ nome: "Vizinha Movimentada" });
  await semearHistorico(loja, PEDIDOS_DA_LOJA);
  await semearHistorico(vizinha, PEDIDOS_DA_VIZINHA);
  // Estatística atualizada é o que o banco de produção tem; sem ela o
  // planejador decide às cegas e a prova mediria outra coisa.
  await migrador.query("ANALYZE app.orders");
  await migrador.query("ANALYZE app.order_items");
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

function seteDias(): PeriodoResolvido {
  const resultado = resolverPeriodo({ atalho: "7d" }, AGORA, SAO_PAULO);
  if (!resultado.ok) throw new Error(resultado.explicacao);
  return resultado.periodo;
}

/** Um nó do plano em JSON, do jeito que o PostgreSQL o devolve. */
interface NoDoPlano {
  readonly "Node Type": string;
  readonly "Relation Name"?: string;
  readonly "Index Name"?: string;
  readonly Plans?: readonly NoDoPlano[];
}

function nosDo(plano: NoDoPlano): NoDoPlano[] {
  return [plano, ...(plano.Plans ?? []).flatMap(nosDo)];
}

/**
 * Roda `consultar` com a loja no contexto, trocando cada `$queryRaw` pelo
 * `EXPLAIN` do mesmo texto e dos mesmos parâmetros. Devolve um plano por
 * consulta, na ordem em que foram feitas.
 */
async function planosDe(
  consultar: () => Promise<unknown>,
): Promise<{ texto: string; plano: NoDoPlano }[]> {
  const planos: { texto: string; plano: NoDoPlano }[] = [];
  await comoRequisicao(
    acesso,
    { lojaId: loja.id, usuarioId: loja.dono.id, papel: "OWNER" },
    async (tx) => {
      const explicar = async (
        partes: TemplateStringsArray,
        ...valores: unknown[]
      ) => {
        const texto = partes.reduce(
          (sql, parte, indice) => `${sql}$${indice}${parte}`,
        );
        const linhas = await tx.$queryRawUnsafe<
          { "QUERY PLAN": { Plan: NoDoPlano }[] }[]
        >(`EXPLAIN (FORMAT JSON) ${texto}`, ...valores);
        const plano = linhas[0]?.["QUERY PLAN"][0]?.Plan;
        if (plano === undefined) throw new Error("o banco não devolveu plano");
        planos.push({ texto, plano });
        return [];
      };
      const embrulho = new Proxy(tx, {
        get(alvo, propriedade, receptor) {
          if (propriedade === "$queryRaw") return explicar;
          return Reflect.get(alvo, propriedade, receptor);
        },
      }) as TransacaoDoBanco;
      exigirContexto().transacao = embrulho;
      await consultar();
    },
  );
  return planos;
}

describe("o painel com histórico grande (AC-813)", () => {
  it(
    "@spec:AC-813 com dezenas de milhares de pedidos, o corte de sete dias responde em menos de um segundo",
    async () => {
      const app = appDasMetricas(acesso, { agora: () => AGORA });
      const token = tokenDoDonoDasMetricas(loja.dono.id);
      // Aquecimento: a primeira transação confere a credencial e abre a
      // conexão; o critério fala da condição normal de uso, não da partida.
      const aquecimento = await lerMetricas(app, loja.apelido, token, {
        periodo: "hoje",
      });
      expect(aquecimento.status).toBe(200);

      const tempos: number[] = [];
      let ultima: unknown;
      for (let vez = 0; vez < 3; vez += 1) {
        const inicio = performance.now();
        const resposta = await lerMetricas(app, loja.apelido, token, {
          periodo: "7d",
          atualizar: "1",
        });
        tempos.push(performance.now() - inicio);
        expect(resposta.status).toBe(200);
        expect(resposta.body.deCache).toBe(false);
        ultima = resposta.body;
      }

      const metricas = esquemaDasMetricas.parse(ultima);
      // Cem pedidos por dia, um em cada cinco cancelado e um pendente: o
      // resultado é de verdade, e não uma resposta vazia e rápida.
      expect(metricas.porDia).toHaveLength(7);
      expect(metricas.resumo.pedidos).toBeGreaterThan(300);
      expect(metricas.resumo.cancelados.quantidade).toBeGreaterThan(100);
      expect(metricas.maisVendidos.length).toBeGreaterThan(0);

      const mediana = [...tempos].sort((a, b) => a - b)[1] ?? Infinity;
      expect(
        mediana,
        `tempos do corte de 7 dias: ${tempos.map((t) => t.toFixed(0)).join(", ")} ms`,
      ).toBeLessThan(LIMITE_MS);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-813 nenhuma consulta do painel varre a tabela de pedidos ou de itens, sob o isolamento e com a loja no contexto",
    async () => {
      const periodo = seteDias();
      const planos = await planosDe(async () => {
        await marcaDaguaDosPedidos(loja.id);
        await gruposDoPeriodo(loja.id, periodo);
        await vendasPorDia(loja.id, periodo);
        await vendasPorHora(loja.id, periodo);
        await produtosMaisVendidos(loja.id, periodo, "quantidade");
        await produtosMaisVendidos(loja.id, periodo, "valor");
      });

      expect(planos).toHaveLength(6);
      for (const { texto, plano } of planos) {
        const nos = nosDo(plano);
        const varreduras = nos.filter(
          (no) =>
            no["Node Type"] === "Seq Scan" &&
            (no["Relation Name"] === "orders" ||
              no["Relation Name"] === "order_items"),
        );
        expect(
          varreduras,
          `varredura sequencial em:\n${texto}\n${JSON.stringify(plano, null, 2)}`,
        ).toEqual([]);
        // E a tabela de pedidos é alcançada por índice.
        const indicesDePedido = nos.filter(
          (no) =>
            no["Relation Name"] === "orders" ||
            (no["Index Name"] ?? "").startsWith("orders_"),
        );
        expect(indicesDePedido.length, texto).toBeGreaterThan(0);
      }
    },
    ESPERA_LONGA,
  );
});
