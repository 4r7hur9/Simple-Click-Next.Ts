/** Isolamento das leituras e escritas da área do cliente entre duas contas. */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type {
  IdentidadeDeTeste,
  LojaDeTeste,
  ProdutoDeTeste,
} from "@simpleclick/testing";

import { fecharPeloSite, prepararParaVender } from "./apoio-de-compra.ts";
import {
  cliente,
  montarApiCompleta,
  sessao,
  type ApiCompleta,
} from "./apoio-da-fundacao.ts";
import { ESPERA_DA_ADMINISTRACAO } from "./apoio-da-administracao.ts";

let migrador: pg.Client;
let api: ApiCompleta;
let http: ReturnType<typeof cliente>;
let loja: LojaDeTeste;
let produto: ProdutoDeTeste;
let contaA: IdentidadeDeTeste;
let contaB: IdentidadeDeTeste;
let idDoEnderecoDeB = "";
let idDoPedidoDeB = "";

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  loja = await criarLoja({ nome: "Empório das Duas Contas" });
  await prepararParaVender(migrador, loja);
  produto = await criarProduto({
    loja,
    nome: "Café da prova",
    precoCentavos: 1200,
  });
  contaA = await criarIdentidade({ nome: "Ana da Conta A" });
  contaB = await criarIdentidade({ nome: "Bia da Conta B" });

  const favorito = await http.post(
    `/v1/conta/favoritos/produtos/${produto.id}`,
    {},
    sessao(contaB.id),
  );
  if (favorito.status !== 200) {
    throw new Error(`favorito de B não criado: ${favorito.status}`);
  }

  const endereco = await http.post(
    "/v1/conta/enderecos",
    {
      rotulo: "Casa da Bia",
      logradouro: "Rua da Conta B",
      numero: "20",
      bairro: "Centro",
      cidade: "Fortaleza",
      estado: "CE",
      cep: "60000000",
    },
    sessao(contaB.id),
  );
  if (endereco.status !== 201) {
    throw new Error(`endereço de B não criado: ${endereco.status}`);
  }
  idDoEnderecoDeB = String(endereco.body.id);

  const pedido = await fecharPeloSite(api.app, loja, produto, {
    autorizacao: sessao(contaB.id).authorization,
    origem: sessao(contaB.id).origin,
  });
  idDoPedidoDeB = pedido.id;
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("dados próprios e recursos de outra conta", () => {
  it("[CA-1] @spec:AC-11113 lê e altera só os dados da conta autenticada", async () => {
    const dadosDeA = await http.get("/v1/conta/dados", sessao(contaA.id));
    const dadosDeB = await http.get("/v1/conta/dados", sessao(contaB.id));
    expect(dadosDeA.body.nome).toBe("Ana da Conta A");
    expect(dadosDeB.body.nome).toBe("Bia da Conta B");

    const alterados = await http.patch(
      "/v1/conta/dados",
      { nome: "Ana Atualizada" },
      sessao(contaA.id),
    );
    expect(alterados.status).toBe(200);
    expect(alterados.body.nome).toBe("Ana Atualizada");
    expect((await http.get("/v1/conta/dados", sessao(contaB.id))).body.nome).toBe(
      "Bia da Conta B",
    );
  });

  it("[CA-2] @spec:AC-11118 favoritos, endereços e pedidos de B não aparecem nem mudam pela conta A", async () => {
    const autorizacaoA = sessao(contaA.id);
    const autorizacaoB = sessao(contaB.id);

    expect(
      (await http.get("/v1/feed/favoritos", autorizacaoA)).body,
    ).toEqual({ lojas: [], produtos: [] });
    expect(
      (await http.get("/v1/conta/enderecos", autorizacaoA)).body,
    ).toEqual({ enderecos: [] });
    expect((await http.get("/v1/conta/pedidos", autorizacaoA)).body).toEqual({
      pedidos: [],
    });

    // A pode enviar os identificadores que conhece, mas cada alteração corre
    // com a identidade da sessão A. Nenhuma linha de B é encontrada.
    expect(
      (
        await http.delete(
          `/v1/conta/favoritos/produtos/${produto.id}`,
          autorizacaoA,
        )
      ).body,
    ).toEqual({ produtoId: produto.id, favorito: false });
    expect(
      (
        await http.put(
          `/v1/conta/enderecos/${idDoEnderecoDeB}`,
          { rotulo: "Invadido", logradouro: "Rua Alterada" },
          autorizacaoA,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await http.delete(
          `/v1/conta/enderecos/${idDoEnderecoDeB}`,
          autorizacaoA,
        )
      ).status,
    ).toBe(404);
    expect((await http.get(`/v1/conta/pedidos/${idDoPedidoDeB}`, autorizacaoA)).status).toBe(
      404,
    );
    // A área da conta não expõe operação de escrita em pedidos.
    expect(
      (
        await http.delete(
          `/v1/conta/pedidos/${idDoPedidoDeB}`,
          autorizacaoA,
        )
      ).status,
    ).toBe(404);

    expect(
      (await http.get("/v1/feed/favoritos", autorizacaoB)).body.produtos.map(
        (item: { id: string }) => item.id,
      ),
    ).toContain(produto.id);
    expect(
      (await http.get("/v1/conta/enderecos", autorizacaoB)).body.enderecos,
    ).toEqual([expect.objectContaining({ id: idDoEnderecoDeB, rotulo: "Casa da Bia" })]);
    expect(
      (await http.get("/v1/conta/pedidos", autorizacaoB)).body.pedidos.map(
        (item: { id: string }) => item.id,
      ),
    ).toContain(idDoPedidoDeB);
    expect((await http.get(`/v1/conta/pedidos/${idDoPedidoDeB}`, autorizacaoB)).status).toBe(
      200,
    );
  });
});
