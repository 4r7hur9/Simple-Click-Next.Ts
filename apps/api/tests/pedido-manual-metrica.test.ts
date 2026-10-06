/**
 * O pedido manual conta na métrica como o do site (AC-710), contra
 * PostgreSQL de verdade.
 *
 * A PROVA NÃO CONSTRÓI MÉTRICA. O painel de métricas é de outra feature, e o
 * que ele vai somar já está decidido: os pedidos da loja em `orders`, pela
 * régua única do núcleo (`situacaoNaVenda`, "aceitos em diante"). O que esta
 * prova garante é que o pedido manual entra nessa conta PELO MESMO CAMINHO do
 * pedido do site: mesma tabela, mesmos campos de valor, mesma máquina de
 * status, a mesma resposta de "conta como venda" — e nada disso depende do
 * canal, que fica gravado para o painel mostrar de onde a venda veio.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  decidirTransicao,
  resumirVendas,
  situacaoNaVenda,
} from "@simpleclick/core";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarProduto,
} from "@simpleclick/testing";

import {
  aplicacaoDosClientes,
  ESPERA_DOS_CLIENTES,
  lojaComDono,
  Painel,
  type LojaComDono,
} from "./apoio-de-clientes.ts";
import { fecharPeloSite } from "./apoio-de-compra.ts";
import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let alvo: LojaComDono;
let painel: Painel;
let pedidoManual: string;
let pedidoDoSite: string;

/** O pedido como a métrica o lê: a linha de `orders` da loja. */
interface LinhaDaVenda {
  readonly id: string;
  readonly store_id: string;
  readonly status: string;
  readonly channel: string;
  readonly subtotal_cents: string;
  readonly delivery_fee_cents: string;
  readonly total_cents: string;
  readonly placed_at: Date;
  readonly accepted_at: Date | null;
  readonly store_timezone: string;
  readonly whatsapp_clicked_at: Date | null;
  readonly whatsapp_confirmed_at: Date | null;
  readonly itens: string;
}

async function linhaDaVenda(pedidoId: string): Promise<LinhaDaVenda> {
  const { rows } = await migrador.query<LinhaDaVenda>(
    `SELECT o.id, o.store_id, o.status, o.channel, o.subtotal_cents,
            o.delivery_fee_cents, o.total_cents, o.placed_at, o.accepted_at,
            o.store_timezone, o.whatsapp_clicked_at, o.whatsapp_confirmed_at,
            (SELECT count(*) FROM app.order_items i WHERE i.order_id = o.id) AS itens
       FROM app.orders o
      WHERE o.id = $1`,
    [pedidoId],
  );
  const linha = rows[0];
  if (linha === undefined)
    throw new Error(`pedido ${pedidoId} não está em orders`);
  return linha;
}

/** A linha no vocabulário da régua do núcleo, sem olhar o canal. */
function paraAVenda(linha: LinhaDaVenda) {
  return {
    status: linha.status,
    totalCentavos: Number(linha.total_cents),
    aguardandoConfirmacaoWhatsapp:
      linha.whatsapp_clicked_at !== null &&
      linha.whatsapp_confirmed_at === null,
  };
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  const app = aplicacaoDosClientes(acesso);
  alvo = await lojaComDono(migrador, { nome: "Doceria da Tia" });
  painel = new Painel(app, alvo);

  const brigadeiro = await criarProduto({
    loja: alvo.loja,
    nome: "Brigadeiro",
    precoCentavos: 1200,
  });
  const manual = await painel.lancar({
    cliente: {
      tipo: "avulso",
      nome: "Célia Balcão",
      telefone: "11 94000-1111",
    },
    itens: [{ produtoId: brigadeiro.id, quantidade: 1 }],
    entrega: "PICKUP",
    formaDePagamento: "PIX",
  });
  expect(manual.status).toBe(201);
  pedidoManual = manual.body.id as string;
  pedidoDoSite = (await fecharPeloSite(app, alvo.loja, brigadeiro)).id;
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

describe("o pedido manual conta na métrica igual ao do site (AC-710)", () => {
  it(
    "@spec:AC-710 os dois estão em orders, da mesma loja, com os mesmos valores e o canal identificado",
    async () => {
      const manual = await linhaDaVenda(pedidoManual);
      const doSite = await linhaDaVenda(pedidoDoSite);

      expect(manual.channel).toBe("MANUAL");
      expect(doSite.channel).toBe("ONLINE");
      for (const linha of [manual, doSite]) {
        expect(linha).toMatchObject({
          store_id: alvo.loja.id,
          status: "PENDING",
          subtotal_cents: "1200",
          delivery_fee_cents: "0",
          total_cents: "1200",
          store_timezone: "America/Sao_Paulo",
          itens: "1",
        });
      }
      // O dia da venda é o dia em que ela entrou — hoje, para os dois.
      expect(manual.placed_at.toDateString()).toBe(
        doSite.placed_at.toDateString(),
      );
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-710 aceito pelo dono, o manual vira venda pela mesma régua, e a soma do dia inclui os dois",
    async () => {
      // A régua de transição não recebe canal: "conta como venda" é a mesma
      // resposta para qualquer pedido que o dono aceita.
      const decisao = decidirTransicao("PENDING", "ACCEPTED", "PICKUP");
      expect(decisao).toMatchObject({ ok: true, contaComoVenda: true });

      for (const id of [pedidoManual, pedidoDoSite]) {
        const aceite = await painel.mudarStatus(id, "ACCEPTED");
        expect(aceite.status).toBe(200);
        expect(aceite.body.status).toBe("ACCEPTED");
      }

      const manual = await linhaDaVenda(pedidoManual);
      const doSite = await linhaDaVenda(pedidoDoSite);
      expect(manual.accepted_at).not.toBeNull();
      expect(situacaoNaVenda(paraAVenda(manual))).toBe("VENDA");
      expect(situacaoNaVenda(paraAVenda(doSite))).toBe("VENDA");

      const resumo = resumirVendas([paraAVenda(manual), paraAVenda(doSite)]);
      expect(resumo.vendas).toEqual({ quantidade: 2, totalCentavos: 2400 });
      expect(resumo.faturamentoCentavos).toBe(2400);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-710 a fila do dono mostra de onde cada venda veio",
    async () => {
      const fila = await painel.fila();
      expect(fila.status).toBe(200);
      const canais = Object.fromEntries(
        fila.body.pedidos.map((p: { id: string; canal: string }) => [
          p.id,
          p.canal,
        ]),
      );
      expect(canais[pedidoManual]).toBe("MANUAL");
      expect(canais[pedidoDoSite]).toBe("ONLINE");
    },
    ESPERA_DOS_CLIENTES,
  );
});
