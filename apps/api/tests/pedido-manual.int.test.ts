/**
 * Prova do pedido lançado pelo dono, contra PostgreSQL de verdade
 * (AC-707, AC-708, AC-709).
 *
 * O pedido manual é lançado pela rota do painel com o token do dono MEMBRO da
 * loja, e conferido onde ele aparece para o dono: na fila e no detalhe do
 * pedido. O preço do catálogo é trocado ANTES do lançamento, pela credencial
 * de migração, para provar que o total é o do servidor, com o preço de agora —
 * e o corpo enviado não carrega preço nenhum.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDoPedidoManualCriado } from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarProduto,
  criarVariacao,
} from "@simpleclick/testing";

import {
  aplicacaoDosClientes,
  ESPERA_DOS_CLIENTES,
  itemDoLanche,
  lancheComMolho,
  lojaComDono,
  Painel,
  type LancheComMolho,
  type LojaComDono,
} from "./apoio-de-clientes.ts";
import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let alvo: LojaComDono;
let painel: Painel;
let lanche: LancheComMolho;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  alvo = await lojaComDono(migrador, { nome: "Hamburgueria do Zé" });
  painel = new Painel(aplicacaoDosClientes(acesso), alvo);
  lanche = await lancheComMolho(alvo.loja, 2000);
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

async function idsDaFila(): Promise<string[]> {
  const fila = await painel.fila();
  expect(fila.status).toBe(200);
  return fila.body.pedidos.map((p: { id: string }) => p.id);
}

describe("o pedido manual é criado como qualquer outro pedido (AC-707)", () => {
  it(
    "@spec:AC-707 lançado da ficha do cliente, entra na fila com número próprio, canal manual e total do servidor",
    async () => {
      const cadastro = await painel.cadastrar({
        nome: "Paulo Telefone",
        telefone: "(11) 98123-4567",
        endereco: { logradouro: "Rua do Paulo", numero: "7", bairro: "Vila" },
      });
      expect(cadastro.status).toBe(201);

      // O dono mudou o preço hoje de manhã: o pedido sai com o preço de agora.
      await migrador.query(
        `UPDATE app.products
            SET display_price_cents = 2300, price_min_cents = 2300, price_max_cents = 2300
          WHERE id = $1`,
        [lanche.produto.id],
      );

      const resposta = await painel.lancar({
        cliente: { tipo: "cadastrado", clienteId: cadastro.body.id },
        // Dois lanches com mostarda (+ R$ 1,50) e um com ketchup.
        itens: [
          itemDoLanche(lanche, lanche.mostarda, 2),
          itemDoLanche(lanche, lanche.ketchup, 1),
        ],
        entrega: "DELIVERY",
        formaDePagamento: "CASH",
        trocoParaCentavos: 10000,
      });

      expect(resposta.status).toBe(201);
      const criado = esquemaDoPedidoManualCriado.parse(resposta.body);
      const subtotal = 2 * (2300 + 150) + 2300;
      expect(criado).toMatchObject({
        status: "PENDING",
        canal: "MANUAL",
        clienteId: cadastro.body.id,
        subtotalCentavos: subtotal,
        taxaDeEntregaCentavos: 700,
        totalCentavos: subtotal + 700,
      });
      expect(criado.numero).toBeGreaterThan(0);

      // Na fila, igual aos pedidos do site, marcado como manual.
      const fila = await painel.fila();
      const naFila = fila.body.pedidos.find(
        (p: { id: string }) => p.id === criado.id,
      );
      expect(naFila).toMatchObject({
        numero: criado.numero,
        canal: "MANUAL",
        totalCentavos: subtotal + 700,
      });

      // O detalhe traz os itens com as escolhas e o endereço da ficha.
      const detalhe = await painel.pedido(criado.id);
      expect(detalhe.body.pedido).toMatchObject({
        canal: "MANUAL",
        entrega: "DELIVERY",
        contato: {
          nome: "Paulo Telefone",
          telefone: "+5511981234567",
          endereco: { logradouro: "Rua do Paulo", numero: "7" },
        },
      });
      expect(detalhe.body.pedido.itens).toEqual([
        expect.objectContaining({
          nome: "X-Salada",
          quantidade: 2,
          totalCentavos: 2 * 2450,
          opcoes: [{ grupo: "Molho", nome: "Mostarda", quantidade: 1 }],
        }),
        expect.objectContaining({
          nome: "X-Salada",
          quantidade: 1,
          totalCentavos: 2300,
          opcoes: [{ grupo: "Molho", nome: "Ketchup", quantidade: 1 }],
        }),
      ]);
      // O primeiro passo do histórico diz quem lançou: a loja.
      expect(detalhe.body.pedido.historico[0]).toMatchObject({
        de: null,
        para: "PENDING",
        papel: "OWNER",
      });
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-707 o número segue a sequência da loja, a mesma dos pedidos do site",
    async () => {
      const primeiro = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Rita", telefone: "11 97000-0001" },
        itens: [itemDoLanche(lanche)],
        entrega: "PICKUP",
        formaDePagamento: "PIX",
      });
      const segundo = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Sara", telefone: "11 97000-0002" },
        itens: [itemDoLanche(lanche)],
        entrega: "PICKUP",
        formaDePagamento: "PIX",
      });
      expect(segundo.body.numero).toBe(primeiro.body.numero + 1);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-707 preço enviado no corpo não é aceito: quem precifica é o servidor",
    async () => {
      const resposta = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Tiago", telefone: "11 97000-0003" },
        itens: [{ ...itemDoLanche(lanche), precoUnitarioCentavos: 1 }],
        entrega: "PICKUP",
        formaDePagamento: "PIX",
      });
      expect(resposta.status).toBe(400);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-707 a variação escolhida dá o preço e baixa o estoque dela, como no site",
    async () => {
      const camiseta = await criarProduto({
        loja: alvo.loja,
        nome: "Camiseta",
        precoCentavos: 0,
      });
      const grande = await criarVariacao({
        loja: alvo.loja,
        produto: camiseta,
        nome: "G",
        precoCentavos: 5900,
        estoque: 3,
      });

      const resposta = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Úrsula", telefone: "11 97000-0004" },
        itens: [
          { produtoId: camiseta.id, variacaoId: grande.id, quantidade: 2 },
        ],
        entrega: "PICKUP",
        formaDePagamento: "CARD_ON_DELIVERY",
      });

      expect(resposta.status).toBe(201);
      expect(resposta.body.totalCentavos).toBe(2 * 5900);
      const saldo = await migrador.query<{ stock_quantity: number }>(
        `SELECT stock_quantity FROM app.product_variants WHERE id = $1`,
        [grande.id],
      );
      expect(saldo.rows[0]?.stock_quantity).toBe(1);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("o pedido manual respeita as regras do catálogo (AC-708)", () => {
  it(
    "@spec:AC-708 grupo obrigatório sem escolha impede a confirmação, apontando o grupo pendente",
    async () => {
      const antes = await idsDaFila();

      const resposta = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Vera", telefone: "11 97000-0005" },
        itens: [itemDoLanche(lanche, null)],
        entrega: "PICKUP",
        formaDePagamento: "PIX",
      });

      expect(resposta.status).toBe(422);
      expect(resposta.body).toEqual({
        erro: "pedido_incompleto",
        pendencias: [
          {
            produtoId: lanche.produto.id,
            produto: "X-Salada",
            grupoId: lanche.molho.id,
            grupo: "Molho",
            motivo: "FALTA_ESCOLHER",
            // A mesma frase que a página do produto mostra ao cliente.
            explicacao: "Escolha 1 opção em Molho.",
          },
        ],
      });
      // Nada foi criado.
      expect(await idsDaFila()).toEqual(antes);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-708 escolha demais, opção de outro grupo e produto fora do ar também barram",
    async () => {
      const demais = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Wagner", telefone: "11 97000-0006" },
        itens: [
          {
            produtoId: lanche.produto.id,
            quantidade: 1,
            escolhas: [
              { grupoId: lanche.molho.id, opcaoId: lanche.ketchup.id },
              { grupoId: lanche.molho.id, opcaoId: lanche.mostarda.id },
            ],
          },
        ],
        entrega: "PICKUP",
        formaDePagamento: "PIX",
      });
      expect(demais.status).toBe(422);
      expect(demais.body.pendencias[0].motivo).toBe("ESCOLHEU_DEMAIS");

      const rascunho = await criarProduto({
        loja: alvo.loja,
        nome: "Rascunho",
        status: "DRAFT",
      });
      const foraDoAr = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Xavier", telefone: "11 97000-0007" },
        itens: [{ produtoId: rascunho.id, quantidade: 1 }],
        entrega: "PICKUP",
        formaDePagamento: "PIX",
      });
      // O que a vitrine não vende, o balcão também não vende.
      expect(foraDoAr.status).toBe(422);
      expect(foraDoAr.body.pendencias[0].motivo).toBe("FORA_DO_CATALOGO");
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("o pedido manual pode ser lançado sem cadastro (AC-709)", () => {
  it(
    "@spec:AC-709 nome e telefone no próprio pedido bastam, e nenhum cadastro de cliente é criado",
    async () => {
      const listaAntes = (await painel.listar()).body.clientes.length;

      const resposta = await painel.lancar({
        cliente: {
          tipo: "avulso",
          nome: "Yara Sem Cadastro",
          telefone: "(11) 96000-1234",
        },
        itens: [itemDoLanche(lanche)],
        entrega: "PICKUP",
        formaDePagamento: "PIX",
      });

      expect(resposta.status).toBe(201);
      expect(resposta.body).toMatchObject({ canal: "MANUAL", clienteId: null });
      expect((await painel.listar()).body.clientes.length).toBe(listaAntes);

      const detalhe = await painel.pedido(resposta.body.id);
      expect(detalhe.body.pedido.contato).toMatchObject({
        nome: "Yara Sem Cadastro",
        telefone: "+5511960001234",
      });
      // Entra no mesmo conjunto que o painel lê: a fila da loja.
      expect(await idsDaFila()).toContain(resposta.body.id);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-709 entrega avulsa exige endereço, e telefone impossível é recusado",
    async () => {
      const semEndereco = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Zeca", telefone: "11 96000-5678" },
        itens: [itemDoLanche(lanche)],
        entrega: "DELIVERY",
        formaDePagamento: "PIX",
      });
      expect(semEndereco.status).toBe(400);

      const comEndereco = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Zeca", telefone: "11 96000-5678" },
        itens: [itemDoLanche(lanche)],
        entrega: "DELIVERY",
        endereco: { logradouro: "Rua do Zeca", numero: "1" },
        formaDePagamento: "PIX",
      });
      expect(comEndereco.status).toBe(201);

      const telefoneRuim = await painel.lancar({
        cliente: { tipo: "avulso", nome: "Zeca", telefone: "1234-56789" },
        itens: [itemDoLanche(lanche)],
        entrega: "PICKUP",
        formaDePagamento: "PIX",
      });
      expect(telefoneRuim.status).toBe(400);
    },
    ESPERA_DOS_CLIENTES,
  );
});
