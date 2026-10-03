/**
 * Prova do histórico do cliente logado, contra PostgreSQL de verdade
 * (AC-616, P-003).
 *
 * A conta é uma só na plataforma (ASM-104), e a pessoa compra em lojas que
 * não se conhecem. O que precisa ser verdade ao mesmo tempo:
 *
 * - quem está logado vê os pedidos que fez, em TODAS as lojas, sem o link;
 * - quem comprou como convidado, ou é outra pessoa, não aparece nessa lista;
 * - a loja A continua sem enxergar o pedido que a mesma pessoa fez na loja B —
 *   nem pela fila, nem pela consulta direta, nem chamando o caminho da conta.
 *
 * A compra passa pelo CAMINHO DE VERDADE (carrinho e fechamento pela API, com
 * o cabeçalho de sessão), porque é lá que o pedido é ligado à conta.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDoMeuPedido,
  esquemaDosMeusPedidos,
} from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
  criarMembro,
  criarProduto,
} from "@simpleclick/testing";
import type {
  IdentidadeDeTeste,
  LojaDeTeste,
  MembroDeTeste,
  ProdutoDeTeste,
} from "@simpleclick/testing";

import { fecharPeloSite, prepararParaVender } from "./apoio-de-compra.ts";
import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
} from "./apoio-de-isolamento.ts";
import {
  aplicacaoDaOperacao,
  comoPortador,
  ESPERA_DA_OPERACAO,
  ORIGEM_DO_PAINEL,
  tokenDeAcesso,
} from "./apoio-de-pedidos.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof aplicacaoDaOperacao>;
let lojaA: LojaDeTeste;
let lojaB: LojaDeTeste;
let produtoA: ProdutoDeTeste;
let produtoB: ProdutoDeTeste;
let donoA: MembroDeTeste;
let donoB: MembroDeTeste;
let maria: IdentidadeDeTeste;
let joao: IdentidadeDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 6 });
  app = aplicacaoDaOperacao(acesso);
  lojaA = await criarLoja({ nome: "Pastelaria da Conta" });
  lojaB = await criarLoja({ nome: "Açaí da Conta" });
  await prepararParaVender(migrador, lojaA);
  await prepararParaVender(migrador, lojaB);
  produtoA = await criarProduto({
    loja: lojaA,
    nome: "Pastel de queijo",
    precoCentavos: 900,
  });
  produtoB = await criarProduto({
    loja: lojaB,
    nome: "Açaí 500 ml",
    precoCentavos: 1800,
  });
  donoA = await criarMembro({ loja: lojaA });
  donoB = await criarMembro({ loja: lojaB });
  maria = await criarIdentidade({ nome: "Maria da Conta" });
  joao = await criarIdentidade({ nome: "João Vizinho" });
}, ESPERA_DA_OPERACAO);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DA_OPERACAO);

/** A sessão de cliente de uma identidade, como o navegador a apresenta. */
function comoCliente(identidade: IdentidadeDeTeste): string {
  return comoPortador(tokenDeAcesso(identidade.id, "CUSTOMER"));
}

function comoDono(dono: MembroDeTeste): string {
  return comoPortador(tokenDeAcesso(dono.identidade.id, "OWNER"));
}

function meusPedidos(autorizacao?: string) {
  const pedido = request(app).get("/v1/conta/pedidos");
  return autorizacao === undefined
    ? pedido
    : pedido.set("Authorization", autorizacao);
}

function meuPedido(id: string, autorizacao: string) {
  return request(app)
    .get(`/v1/conta/pedidos/${id}`)
    .set("Authorization", autorizacao);
}

function filaDe(loja: LojaDeTeste, dono: MembroDeTeste) {
  return request(app)
    .get(`/v1/lojas/${loja.apelido}/pedidos`)
    .set("Authorization", comoDono(dono));
}

function aceitar(loja: LojaDeTeste, dono: MembroDeTeste, pedidoId: string) {
  return request(app)
    .patch(`/v1/lojas/${loja.apelido}/pedidos/${pedidoId}/status`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Authorization", comoDono(dono))
    .send({ status: "ACCEPTED" });
}

describe("o cliente logado vê o histórico sem depender do link (AC-616)", () => {
  it(
    "@spec:AC-616 a conta lista os pedidos feitos em todas as lojas, com o status de agora, e só os dela",
    async () => {
      const emA = await fecharPeloSite(app, lojaA, produtoA, {
        autorizacao: comoCliente(maria),
      });
      const emB = await fecharPeloSite(app, lojaB, produtoB, {
        autorizacao: comoCliente(maria),
      });
      const outroEmA = await fecharPeloSite(app, lojaA, produtoA, {
        autorizacao: comoCliente(maria),
      });
      const convidado = await fecharPeloSite(app, lojaA, produtoA);
      const doJoao = await fecharPeloSite(app, lojaB, produtoB, {
        autorizacao: comoCliente(joao),
      });
      expect((await aceitar(lojaA, donoA, emA.id)).status).toBe(200);

      const resposta = await meusPedidos(comoCliente(maria));

      expect(resposta.status).toBe(200);
      expect(resposta.headers["cache-control"]).toContain("no-store");
      // O contrato é fechado: campo a mais, ou a menos, reprova aqui.
      const { pedidos } = esquemaDosMeusPedidos.parse(resposta.body);
      const ids = pedidos.map((pedido) => pedido.id);
      expect(ids).toEqual(
        expect.arrayContaining([emA.id, emB.id, outroEmA.id]),
      );
      expect(ids).not.toContain(convidado.id);
      expect(ids).not.toContain(doJoao.id);

      const lidoEmA = pedidos.find((pedido) => pedido.id === emA.id);
      const lidoEmB = pedidos.find((pedido) => pedido.id === emB.id);
      expect(lidoEmA).toMatchObject({
        numero: emA.numero,
        codigo: emA.codigo,
        status: "ACCEPTED",
        entrega: "PICKUP",
        totalCentavos: 900,
        quantidadeDeItens: 1,
        loja: { nome: "Pastelaria da Conta", apelido: lojaA.apelido },
      });
      expect(lidoEmB).toMatchObject({
        status: "PENDING",
        totalCentavos: 1800,
        loja: { nome: "Açaí da Conta", apelido: lojaB.apelido },
      });

      // Do mais novo para o mais antigo, sem depender da loja.
      const instantes = pedidos.map((pedido) => Date.parse(pedido.criadoEm));
      expect([...instantes].sort((a, b) => b - a)).toEqual(instantes);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-616 o detalhe abre pela conta, sem o link original, e é o mesmo pedido que o link mostra",
    async () => {
      const pedido = await fecharPeloSite(app, lojaB, produtoB, {
        autorizacao: comoCliente(maria),
      });

      const pelaConta = await meuPedido(pedido.id, comoCliente(maria));
      const peloLink = await request(app).get(
        `/v1/vitrine/${lojaB.apelido}/pedido/${pedido.tokenPublico}`,
      );

      expect(pelaConta.status).toBe(200);
      expect(pelaConta.headers["cache-control"]).toContain("no-store");
      const detalhe = esquemaDoMeuPedido.parse(pelaConta.body);
      expect(detalhe.id).toBe(pedido.id);
      expect(detalhe.loja).toEqual({
        nome: "Açaí da Conta",
        apelido: lojaB.apelido,
      });
      expect(detalhe.tokenPublico).toBe(pedido.tokenPublico);
      expect(detalhe.pedido.codigo).toBe(pedido.codigo);
      expect(detalhe.pedido.itens.map((item) => item.nome)).toEqual([
        "Açaí 500 ml",
      ]);
      expect(detalhe.pedido).toEqual(peloLink.body.pedido);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-616 pedido de outra pessoa, pedido de convidado e identificador estranho respondem não encontrado, todos iguais",
    async () => {
      const doJoao = await fecharPeloSite(app, lojaA, produtoA, {
        autorizacao: comoCliente(joao),
      });
      const convidado = await fecharPeloSite(app, lojaA, produtoA);

      for (const tentativa of [
        doJoao.id,
        convidado.id,
        "00000000-0000-4000-8000-000000000000",
        "nao-e-identificador",
      ]) {
        const resposta = await meuPedido(tentativa, comoCliente(maria));
        expect(resposta.status, `"${tentativa}" abriu um pedido`).toBe(404);
        expect(resposta.body).toEqual({ erro: "nao_encontrado" });
      }
      // E o dono do pedido continua abrindo o dele.
      expect((await meuPedido(doJoao.id, comoCliente(joao))).status).toBe(200);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-616 sem sessão de cliente não há histórico: anônimo e dono de loja são recusados",
    async () => {
      const anonimo = await meusPedidos();
      const dono = await meusPedidos(comoDono(donoA));
      const donoNoDetalhe = await meuPedido(
        "00000000-0000-4000-8000-000000000000",
        comoDono(donoA),
      );

      expect(anonimo.status).toBe(401);
      expect(dono.status).toBe(401);
      expect(donoNoDetalhe.status).toBe(401);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-616 o pedido de cliente logado fica ligado à ficha dele na loja: uma ficha por loja, nenhuma para o convidado",
    async () => {
      const emA = await fecharPeloSite(app, lojaA, produtoA, {
        autorizacao: comoCliente(maria),
        contato: { nome: "Maria da Conta", telefone: "11977776666" },
      });
      const convidado = await fecharPeloSite(app, lojaA, produtoA);

      const fichas = await migrador.query<{ id: string; store_id: string }>(
        `SELECT id, store_id FROM app.store_customers
          WHERE identity_id = $1 ORDER BY store_id`,
        [maria.id],
      );
      expect(fichas.rows.map((ficha) => ficha.store_id).sort()).toEqual(
        [lojaA.id, lojaB.id].sort(),
      );

      const fichaEmA = fichas.rows.find((ficha) => ficha.store_id === lojaA.id);
      const ligacoes = await migrador.query<{
        id: string;
        store_customer_id: string | null;
      }>(`SELECT id, store_customer_id FROM app.orders WHERE id = ANY($1)`, [
        [emA.id, convidado.id],
      ]);
      const ligacaoDe = (id: string) =>
        ligacoes.rows.find((linha) => linha.id === id)?.store_customer_id;
      expect(ligacaoDe(emA.id)).toBe(fichaEmA?.id);
      expect(ligacaoDe(convidado.id)).toBeNull();
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("nenhuma loja enxerga o histórico da outra (P-003)", () => {
  it(
    "@spec:AC-616 @principle:P-003 o pedido que a pessoa fez na loja B não existe para a loja A — nem pela fila, nem pela consulta, nem pelo caminho da conta",
    async () => {
      const emB = await fecharPeloSite(app, lojaB, produtoB, {
        autorizacao: comoCliente(maria),
      });
      const emA = await fecharPeloSite(app, lojaA, produtoA, {
        autorizacao: comoCliente(maria),
      });

      // Pela fila do dono: cada loja só vê o que é seu.
      const filaA = await filaDe(lojaA, donoA);
      const filaB = await filaDe(lojaB, donoB);
      expect(filaA.status).toBe(200);
      const idsDaFilaA = filaA.body.pedidos.map((p: { id: string }) => p.id);
      const idsDaFilaB = filaB.body.pedidos.map((p: { id: string }) => p.id);
      expect(idsDaFilaA).toContain(emA.id);
      expect(idsDaFilaA).not.toContain(emB.id);
      expect(idsDaFilaB).toContain(emB.id);
      expect(idsDaFilaB).not.toContain(emA.id);

      // Pela consulta direta, pelo mesmo caminho que a API usa: o dono da
      // loja A, com o identificador do pedido da loja B na mão, lê nada.
      const direto = await comoRequisicao(
        acesso,
        { lojaId: lojaA.id, usuarioId: donoA.identidade.id, papel: "OWNER" },
        (tx) =>
          tx.order.findMany({ where: { id: emB.id }, select: { id: true } }),
      );
      expect(direto).toEqual([]);

      // Pelo caminho da conta: a função só serve ao papel CUSTOMER. O dono da
      // loja A recebe lista vazia; a própria identidade da cliente, se
      // chegasse como dona, nem abre a transação — ela não é membro de loja
      // nenhuma, e a equipe só entra na loja de que é membro (dívida 92).
      const contaComoDono = await comoRequisicao(
        acesso,
        { lojaId: lojaA.id, usuarioId: donoA.identidade.id, papel: "OWNER" },
        (tx) =>
          tx.$queryRaw<
            { order_id: string }[]
          >`SELECT * FROM app.meus_pedidos()`,
      );
      expect(contaComoDono).toEqual([]);
      await expect(
        comoRequisicao(
          acesso,
          { lojaId: lojaA.id, usuarioId: maria.id, papel: "OWNER" },
          (tx) =>
            tx.$queryRaw<
              { order_id: string }[]
            >`SELECT * FROM app.meus_pedidos()`,
        ),
      ).rejects.toMatchObject({ codigo: "nao_encontrado" });

      // E a ficha da cliente na loja B não aparece entre os clientes da loja A.
      const clientesDaLojaA = await comoRequisicao(
        acesso,
        { lojaId: lojaA.id, usuarioId: donoA.identidade.id, papel: "OWNER" },
        (tx) =>
          tx.storeCustomer.findMany({
            where: { identityId: maria.id },
            select: { storeId: true },
          }),
      );
      expect(clientesDaLojaA.map((c) => c.storeId)).toEqual([lojaA.id]);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-616 @principle:P-003 outro cliente logado não vê nada da pessoa, mesmo tendo comprado nas mesmas lojas",
    async () => {
      const daMaria = await fecharPeloSite(app, lojaA, produtoA, {
        autorizacao: comoCliente(maria),
      });
      await fecharPeloSite(app, lojaA, produtoA, {
        autorizacao: comoCliente(joao),
      });

      const doJoao = await meusPedidos(comoCliente(joao));
      const ids = doJoao.body.pedidos.map((p: { id: string }) => p.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).not.toContain(daMaria.id);
      expect((await meuPedido(daMaria.id, comoCliente(joao))).status).toBe(404);
    },
    ESPERA_DA_OPERACAO,
  );
});
