/**
 * O pedido manual sai na impressora do mesmo jeito que o do site (AC-710),
 * contra PostgreSQL de verdade.
 *
 * "Do mesmo jeito" é a prova: numa loja com impressão configurada (papel de
 * 58 mm e conteúdo escolhido pelo dono), o pedido lançado no balcão e o pedido
 * fechado na vitrine passam pela MESMA rota do cupom, recebem cupom no mesmo
 * formato do contrato, com o mesmo papel, a via contada do mesmo jeito — e o
 * canal escrito no papel: "Balcão" para um, "Site" para o outro.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { diagramarCupom, lerCupomImpresso } from "@simpleclick/core";
import type { CupomImpresso } from "@simpleclick/core";
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
let app: ReturnType<typeof aplicacaoDosClientes>;
let alvo: LojaComDono;
let painel: Painel;
let pedidoManual: string;
let pedidoDoSite: string;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = aplicacaoDosClientes(acesso);
  alvo = await lojaComDono(migrador, { nome: "Padaria Pão Quente" });
  painel = new Painel(app, alvo);

  // A loja configurou a impressão: papel de 58 mm, com endereço e observações.
  await migrador.query(
    `UPDATE app.store_settings SET printing = $2::jsonb WHERE store_id = $1`,
    [
      alvo.loja.id,
      JSON.stringify({
        larguraMm: 58,
        conteudo: {
          pedido: true,
          itens: true,
          total: true,
          enderecoCliente: true,
          totalEmDestaque: false,
          observacoes: true,
        },
      }),
    ],
  );

  const pao = await criarProduto({
    loja: alvo.loja,
    nome: "Pão de queijo",
    precoCentavos: 850,
  });

  const manual = await painel.lancar({
    cliente: { tipo: "avulso", nome: "Beto Balcão", telefone: "11 95000-1111" },
    itens: [{ produtoId: pao.id, quantidade: 3 }],
    entrega: "PICKUP",
    formaDePagamento: "CASH",
    observacao: "Bem assado",
  });
  expect(manual.status).toBe(201);
  pedidoManual = manual.body.id as string;

  pedidoDoSite = (await fecharPeloSite(app, alvo.loja, pao)).id;
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

function textoDo(cupom: CupomImpresso): string {
  return diagramarCupom(cupom)
    .map((linha) => (linha.tipo === "texto" ? linha.texto : "--corte--"))
    .join("\n");
}

async function cupomDe(pedidoId: string): Promise<CupomImpresso> {
  const resposta = await painel.cupom(pedidoId);
  expect(resposta.status).toBe(200);
  const cupom = lerCupomImpresso(resposta.body.cupom);
  expect(cupom).not.toBeNull();
  return cupom as CupomImpresso;
}

describe("o pedido manual também sai na impressora (AC-710)", () => {
  it(
    "@spec:AC-710 o cupom do pedido manual sai pela mesma rota, no mesmo papel configurado, com o canal Balcão",
    async () => {
      const manual = await cupomDe(pedidoManual);
      const doSite = await cupomDe(pedidoDoSite);

      // O mesmo papel da configuração da loja para os dois.
      expect(manual.papel).toEqual({ larguraMm: 58, colunas: 32 });
      expect(doSite.papel).toEqual(manual.papel);
      expect(manual.versao).toBe(doSite.versao);

      const texto = textoDo(manual);
      expect(texto).toContain("Balcão");
      expect(texto).toContain("Pão de queijo");
      expect(texto).toContain("Bem assado");
      expect(textoDo(doSite)).toContain("Site");
      expect(textoDo(doSite)).not.toContain("Balcão");
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-710 a via do pedido manual é contada como a de qualquer pedido",
    async () => {
      const primeira = await cupomDe(pedidoManual);
      const segunda = await cupomDe(pedidoManual);
      expect(segunda.via).toBe(primeira.via + 1);

      const vias = await migrador.query<{ print_count: number }>(
        `SELECT print_count FROM app.orders WHERE id = $1`,
        [pedidoManual],
      );
      expect(vias.rows[0]?.print_count).toBe(segunda.via);
    },
    ESPERA_DOS_CLIENTES,
  );
});
