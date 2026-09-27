/**
 * Cliente de outra loja nunca aparece (AC-702, P-003), contra PostgreSQL de
 * verdade e pelas rotas da aplicação.
 *
 * DOIS EIXOS, os mesmos das políticas de `store_customers` (migração 0005):
 *
 * - o DONO vê os clientes DA LOJA dele — e nenhum da vizinha, nem pela lista,
 *   nem pela busca, nem pelo identificador direto, nem por tabela: pedido
 *   manual para o cliente alheio e repetição do pedido alheio também caem;
 * - o CLIENTE logado vê a PRÓPRIA linha — e só ela, mesmo quando compra nas
 *   duas lojas, e mesmo navegando com a loja no contexto.
 *
 * O dono é sempre MEMBRO da loja, com token de verdade. A loja B é montada
 * pelos mesmos caminhos da loja A, pelo dono DELA — o dado da vítima existe e
 * é alcançável pelo dono certo, senão "não achei" seria só ausência.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDaListaDeClientes } from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarProduto,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import {
  aplicacaoDosClientes,
  ESPERA_DOS_CLIENTES,
  itemDoLanche,
  lancheComMolho,
  lojaComDono,
  Painel,
  type LojaComDono,
} from "./apoio-de-clientes.ts";
import { fecharPeloSite } from "./apoio-de-compra.ts";
import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
} from "./apoio-de-isolamento.ts";
import { comoPortador, tokenDeAcesso } from "./apoio-de-pedidos.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof aplicacaoDosClientes>;
let lojaA: LojaComDono;
let lojaB: LojaComDono;
let painelA: Painel;
let painelB: Painel;
let clienteDeB: string;
let pedidoDeB: string;
let compradora: IdentidadeDeTeste;
let outroComprador: IdentidadeDeTeste;

const TELEFONE_DE_B = "(31) 95555-4444";

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = aplicacaoDosClientes(acesso);

  lojaA = await lojaComDono(migrador, { nome: "Pastelaria A" });
  lojaB = await lojaComDono(migrador, { nome: "Pizzaria B" });
  painelA = new Painel(app, lojaA);
  painelB = new Painel(app, lojaB);

  // Na loja A, um cliente qualquer: a lista do dono A não é vazia, e "não
  // aparece" não pode ser confundido com "a lista não funciona".
  expect(
    (
      await painelA.cadastrar({
        nome: "Alice da Loja A",
        telefone: "11 94444-3333",
      })
    ).status,
  ).toBe(201);

  // Na loja B, a vítima: cadastrada e com pedido, pelo dono de B.
  const cadastro = await painelB.cadastrar({
    nome: "Beatriz Vizinha",
    telefone: TELEFONE_DE_B,
    email: "beatriz@exemplo.test",
  });
  expect(cadastro.status).toBe(201);
  clienteDeB = cadastro.body.id as string;
  const lancheDeB = await lancheComMolho(lojaB.loja);
  const lancado = await painelB.lancar({
    cliente: { tipo: "cadastrado", clienteId: clienteDeB },
    itens: [itemDoLanche(lancheDeB)],
    entrega: "PICKUP",
    formaDePagamento: "PIX",
  });
  expect(lancado.status).toBe(201);
  pedidoDeB = lancado.body.id as string;

  // Os compradores com conta: a compradora compra nas DUAS lojas; o outro, só
  // na A. Cada compra logada cria a linha dela na loja (AC-616).
  compradora = await criarIdentidade({ nome: "Carla Compradora" });
  outroComprador = await criarIdentidade({ nome: "Davi Comprador" });
  const doA = await criarProduto({ loja: lojaA.loja, nome: "Pastel" });
  const doB = await criarProduto({ loja: lojaB.loja, nome: "Pizza" });
  const comoCompradora = comoPortador(tokenDeAcesso(compradora.id, "CUSTOMER"));
  await fecharPeloSite(app, lojaA.loja, doA, {
    autorizacao: comoCompradora,
    contato: { nome: "Carla Compradora", telefone: "11 93333-2222" },
  });
  await fecharPeloSite(app, lojaB.loja, doB, {
    autorizacao: comoCompradora,
    contato: { nome: "Carla Compradora", telefone: "11 93333-2222" },
  });
  await fecharPeloSite(app, lojaA.loja, doA, {
    autorizacao: comoPortador(tokenDeAcesso(outroComprador.id, "CUSTOMER")),
    contato: { nome: "Davi Comprador", telefone: "11 92222-1111" },
  });
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

async function nomesNaLista(painel: Painel, busca?: string): Promise<string[]> {
  const resposta = await painel.listar(busca);
  expect(resposta.status).toBe(200);
  return esquemaDaListaDeClientes
    .parse(resposta.body)
    .clientes.map((c) => c.nome)
    .sort();
}

describe("o dono da loja A não alcança cliente da loja B (AC-702)", () => {
  it(
    "@spec:AC-702 @principle:P-003 a lista e a busca da loja A não trazem o cliente que só comprou na B",
    async () => {
      // O dado da vítima existe e o dono CERTO o vê.
      expect(await nomesNaLista(painelB)).toContain("Beatriz Vizinha");

      const daLojaA = await nomesNaLista(painelA);
      expect(daLojaA).toContain("Alice da Loja A");
      expect(daLojaA).not.toContain("Beatriz Vizinha");

      // Nem pelo nome, nem pelo telefone, nem pelo e-mail.
      expect(await nomesNaLista(painelA, "Beatriz")).toEqual([]);
      expect(await nomesNaLista(painelA, "95555-4444")).toEqual([]);
      expect(await nomesNaLista(painelA, "beatriz@")).toEqual([]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-702 @principle:P-003 o identificador direto do cliente da B responde 404 na loja A, para ler, corrigir e remover",
    async () => {
      expect((await painelA.ficha(clienteDeB)).status).toBe(404);
      expect(
        (await painelA.editar(clienteDeB, { nome: "Nome trocado pela A" }))
          .status,
      ).toBe(404);
      expect((await painelA.remover(clienteDeB)).status).toBe(404);

      // E nada mudou do lado de lá: o dono de B vê a ficha intacta.
      const ficha = await painelB.ficha(clienteDeB);
      expect(ficha.status).toBe(200);
      expect(ficha.body.cliente.nome).toBe("Beatriz Vizinha");
      expect(ficha.body.pedidos).toHaveLength(1);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-702 @principle:P-003 o dono A não lança pedido para o cliente da B nem repete o pedido dela",
    async () => {
      const lancheDeA = await lancheComMolho(lojaA.loja);
      const antes = (await painelA.fila()).body.pedidos.length as number;

      const lancado = await painelA.lancar({
        cliente: { tipo: "cadastrado", clienteId: clienteDeB },
        itens: [itemDoLanche(lancheDeA)],
        entrega: "PICKUP",
        formaDePagamento: "PIX",
      });
      expect(lancado.status).toBe(404);
      expect((await painelA.fila()).body.pedidos).toHaveLength(antes);

      expect((await painelA.repetir(pedidoDeB)).status).toBe(404);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-702 @principle:P-003 cadastrar na A o telefone de quem é cliente da B não acusa repetido: cada loja só alcança quem comprou nela",
    async () => {
      const resposta = await painelA.cadastrar({
        nome: "Beatriz na Loja A",
        telefone: TELEFONE_DE_B,
        email: "beatriz@exemplo.test",
      });
      // Se a loja A enxergasse a B, o aviso de repetido apontaria a ficha da
      // vizinha — e entregaria nome e identificador dela.
      expect(resposta.status).toBe(201);
      expect(resposta.body.id).not.toBe(clienteDeB);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-702 sessão de cliente não abre a área de clientes do painel",
    async () => {
      const resposta = await request(app)
        .get(`/v1/lojas/${lojaA.loja.apelido}/clientes`)
        .set(
          "Authorization",
          comoPortador(tokenDeAcesso(compradora.id, "CUSTOMER")),
        );
      expect(resposta.status).toBe(401);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("o cliente logado vê só a própria linha (AC-702)", () => {
  /** As linhas de cliente que a requisição do comprador enxerga na loja. */
  async function linhasVistasPor(
    quem: IdentidadeDeTeste,
    alvo: LojaComDono,
  ): Promise<{ identity_id: string | null; store_id: string }[]> {
    return comoRequisicao(
      acesso,
      { lojaId: alvo.loja.id, usuarioId: quem.id, papel: "CUSTOMER" },
      (tx) =>
        tx.$queryRaw<{ identity_id: string | null; store_id: string }[]>`
          SELECT identity_id, store_id FROM app.store_customers`,
    );
  }

  it(
    "@spec:AC-702 @principle:P-003 navegando na loja A, a compradora enxerga as próprias linhas e nenhuma de outra pessoa",
    async () => {
      const vistas = await linhasVistasPor(compradora, lojaA);
      // As duas linhas dela (A e B) e só elas: nem o Davi, que comprou na
      // mesma loja, nem os clientes cadastrados pelo dono.
      expect(vistas).toHaveLength(2);
      expect(vistas.every((l) => l.identity_id === compradora.id)).toBe(true);
      expect(new Set(vistas.map((l) => l.store_id))).toEqual(
        new Set([lojaA.loja.id, lojaB.loja.id]),
      );

      const doOutro = await linhasVistasPor(outroComprador, lojaA);
      expect(doOutro).toHaveLength(1);
      expect(doOutro[0]?.identity_id).toBe(outroComprador.id);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-702 @principle:P-003 o dono A vê o comprador que comprou na A, e não a linha dele na B",
    async () => {
      const resposta = await painelA.listar("Carla");
      const { clientes } = esquemaDaListaDeClientes.parse(resposta.body);
      // Uma linha só: a da loja A. A da B existe, e não é desta loja.
      expect(clientes).toHaveLength(1);
      expect(clientes[0]?.temConta).toBe(true);
    },
    ESPERA_DOS_CLIENTES,
  );
});
