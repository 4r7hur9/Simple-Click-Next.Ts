/**
 * Prova do estoque por variação de ponta a ponta (AC-331, AC-332, AC-334 a
 * AC-337).
 *
 * TUDO PELO CAMINHO DE VERDADE: a grade é cadastrada pela rota do painel, a
 * venda passa pelo carrinho e pelo fechamento da vitrine, o cancelamento pelo
 * caso de uso da máquina de status, e o que o dono vê é lido pelas rotas do
 * painel — contra o banco real, com o isolamento por linha ligado. O saldo não
 * é conferido no banco por fora: é conferido onde o dono o encontra.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarCategoria,
  criarGrupoDeEscolha,
  criarLoja,
  criarMembro,
  criarOpcao,
  criarProduto,
  porGrupoNoProduto,
  porProdutoNaCategoria,
} from "@simpleclick/testing";
import type {
  GrupoDeTeste,
  LojaDeTeste,
  OpcaoDeTeste,
  ProdutoDeTeste,
} from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import {
  appDoDono,
  lojaQueVende,
  ORIGEM,
  Visitante,
  type DonoDeTeste,
} from "./apoio-do-catalogo.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarRotasDoEstoque } from "../src/modules/catalog/estoque.routes.ts";
import { criarRotasDosProdutos } from "../src/modules/catalog/produtos.routes.ts";
import { criarRotasDasVariacoes } from "../src/modules/catalog/variacoes.routes.ts";
import { devolverEstoqueDoPedido } from "../src/modules/orders/devolver-estoque.ts";
import { mudarStatusDoPedido } from "../src/modules/orders/mudar-status.usecase.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let vitrine: ReturnType<typeof criarApp>;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  vitrine = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
  });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** Uma loja com dono e com as rotas do painel que tocam no estoque. */
interface LojaComPainel {
  readonly loja: LojaDeTeste;
  readonly dono: DonoDeTeste;
  readonly painel: ReturnType<typeof appDoDono>;
}

async function lojaComPainel(
  ramo: "roupas" | "lanchonete",
  nome: string,
): Promise<LojaComPainel> {
  const loja = await criarLoja({ ramo, nome });
  const membro = await criarMembro({ loja });
  const dono: DonoDeTeste = {
    identidadeId: membro.identidade.id,
    papel: "OWNER",
  };
  await lojaQueVende(migrador, loja);
  const rotas = {
    acesso,
    resolverLoja: identificarLoja,
    autenticar: () => dono,
  };
  const painel = appDoDono(
    criarRotasDasVariacoes(rotas),
    criarRotasDoEstoque(rotas),
    criarRotasDosProdutos(rotas),
  );
  return { loja, dono, painel };
}

/** Um produto com o eixo Tamanho (P, M, G) ligado a ele. */
interface Camiseta {
  readonly produto: ProdutoDeTeste;
  readonly tamanho: GrupoDeTeste;
  readonly opcoes: Readonly<Record<"P" | "M" | "G", OpcaoDeTeste>>;
}

async function camiseta(alvo: LojaComPainel, nome: string): Promise<Camiseta> {
  const { loja } = alvo;
  const produto = await criarProduto({ loja, nome });
  const categoria = await criarCategoria({ loja, nome: `Seção ${nome}` });
  await porProdutoNaCategoria({ loja, produto, categoria });
  const tamanho = await criarGrupoDeEscolha({
    loja,
    nome: "Tamanho",
    minimo: 1,
    maximo: 1,
    eixoDeVariacao: true,
  });
  await porGrupoNoProduto({ loja, produto, grupo: tamanho });
  return {
    produto,
    tamanho,
    opcoes: {
      P: await criarOpcao({ loja, grupo: tamanho, nome: "P" }),
      M: await criarOpcao({ loja, grupo: tamanho, nome: "M" }),
      G: await criarOpcao({ loja, grupo: tamanho, nome: "G" }),
    },
  };
}

/** O dono cadastra os tamanhos pela grade do painel; devolve os ids. */
async function grade(
  alvo: LojaComPainel,
  peca: Camiseta,
  estoques: Readonly<
    Record<"P" | "M" | "G", { estoque: number | null; minimo?: number }>
  >,
): Promise<Record<"P" | "M" | "G", string>> {
  const ids = {} as Record<"P" | "M" | "G", string>;
  for (const tamanho of ["P", "M", "G"] as const) {
    const resposta = await request(alvo.painel)
      .post(
        `/v1/lojas/${alvo.loja.apelido}/catalogo/produtos/${peca.produto.id}/variacoes`,
      )
      .send({
        nome: tamanho,
        sku: null,
        codigoDeBarras: null,
        precoCentavos: 5000,
        estoque: estoques[tamanho].estoque,
        estoqueMinimo: estoques[tamanho].minimo ?? null,
        pesoGramas: null,
        padrao: tamanho === "P",
        disponivel: true,
        combinacoes: [
          { grupoId: peca.tamanho.id, opcaoId: peca.opcoes[tamanho].id },
        ],
      });
    expect(resposta.status).toBe(201);
    ids[tamanho] = resposta.body.id as string;
  }
  return ids;
}

interface MovimentoLido {
  readonly quantidadeAntes: number;
  readonly delta: number;
  readonly quantidadeDepois: number;
  readonly motivo: string;
  readonly origem: string;
  readonly pedidoId: string | null;
  readonly autorId: string | null;
  readonly criadoEm: string;
}

interface VariacaoNoEstoque {
  readonly id: string;
  readonly nome: string;
  readonly quantidade: number | null;
  readonly estoqueBaixo: boolean;
  readonly movimentos: readonly MovimentoLido[];
}

/** O estoque do produto, como o dono o lê na tela de estoque. */
async function estoqueDe(
  alvo: LojaComPainel,
  peca: Camiseta,
): Promise<Record<string, VariacaoNoEstoque>> {
  const resposta = await request(alvo.painel).get(
    `/v1/lojas/${alvo.loja.apelido}/catalogo/produtos/${peca.produto.id}/estoque`,
  );
  expect(resposta.status).toBe(200);
  const porNome: Record<string, VariacaoNoEstoque> = {};
  for (const variacao of resposta.body.variacoes as VariacaoNoEstoque[]) {
    porNome[variacao.nome] = variacao;
  }
  return porNome;
}

/** Um cliente compra pelo carrinho e pelo fechamento da vitrine. */
async function comprar(
  alvo: LojaComPainel,
  peca: Camiseta,
  variacaoId: string,
  quantidade: number,
): Promise<string> {
  const cliente = new Visitante(vitrine, alvo.loja.apelido);
  const item = await cliente.acrescentar({
    produtoId: peca.produto.id,
    variacaoId,
    quantidade,
    escolhas: [],
  });
  expect(item.status).toBe(201);
  const pedido = await cliente.fechar();
  expect(pedido.status).toBe(201);
  return pedido.body.id as string;
}

/** O dono cancela o pedido, pelo mesmo caso de uso do painel de pedidos. */
function cancelar(alvo: LojaComPainel, pedidoId: string) {
  return comoRequisicao(
    acesso,
    {
      lojaId: alvo.loja.id,
      usuarioId: alvo.dono.identidadeId,
      papel: "OWNER",
    },
    () => mudarStatusDoPedido(pedidoId, "CANCELLED", "Cliente desistiu"),
  );
}

describe("a venda baixa o estoque da variação vendida (AC-331)", () => {
  it(
    "@spec:AC-331 três M vendidos levam o M de 10 a 7, com o movimento do pedido, e P e G não mudam",
    async () => {
      const alvo = await lojaComPainel("roupas", "Malharia do Centro");
      const peca = await camiseta(alvo, "Camiseta Básica");
      const ids = await grade(alvo, peca, {
        P: { estoque: 4 },
        M: { estoque: 10 },
        G: { estoque: 6 },
      });

      const pedidoId = await comprar(alvo, peca, ids.M, 3);

      const estoque = await estoqueDe(alvo, peca);
      expect(estoque.M?.quantidade).toBe(7);
      expect(estoque.M?.movimentos).toHaveLength(1);
      const baixa = estoque.M?.movimentos[0];
      expect(baixa).toMatchObject({
        quantidadeAntes: 10,
        delta: -3,
        quantidadeDepois: 7,
        origem: "PEDIDO",
        pedidoId,
      });
      expect(baixa?.motivo.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(baixa?.criadoEm ?? ""))).toBe(false);

      expect(estoque.P?.quantidade).toBe(4);
      expect(estoque.G?.quantidade).toBe(6);
      expect(estoque.P?.movimentos).toEqual([]);
      expect(estoque.G?.movimentos).toEqual([]);
    },
    ESPERA_LONGA,
  );
});

describe("estoque zerado impede a venda da variação (AC-332)", () => {
  it(
    "@spec:AC-332 o P zerado não entra no carrinho, e o total do carrinho fica como estava",
    async () => {
      const alvo = await lojaComPainel("roupas", "Malharia da Praça");
      const peca = await camiseta(alvo, "Camiseta Listrada");
      const ids = await grade(alvo, peca, {
        P: { estoque: 0 },
        M: { estoque: 5 },
        G: { estoque: 5 },
      });
      const cliente = new Visitante(vitrine, alvo.loja.apelido);

      const g = await cliente.acrescentar({
        produtoId: peca.produto.id,
        variacaoId: ids.G,
        quantidade: 1,
        escolhas: [],
      });
      expect(g.status).toBe(201);
      const antes = await cliente.conferir();
      expect(antes.body.subtotalCentavos).toBe(5000);

      const p = await cliente.acrescentar({
        produtoId: peca.produto.id,
        variacaoId: ids.P,
        quantidade: 1,
        escolhas: [],
      });
      expect(p.status).toBe(409);

      const depois = await cliente.conferir();
      expect(depois.body.subtotalCentavos).toBe(5000);
      expect(depois.body.itens).toHaveLength(1);
    },
    ESPERA_LONGA,
  );
});

describe("pedido cancelado devolve o estoque (AC-334)", () => {
  it(
    "@spec:AC-334 cancelar o pedido de três M devolve as três, e o histórico mostra a baixa e a devolução",
    async () => {
      const alvo = await lojaComPainel("roupas", "Malharia da Estação");
      const peca = await camiseta(alvo, "Camiseta Gola V");
      const ids = await grade(alvo, peca, {
        P: { estoque: 2 },
        M: { estoque: 10 },
        G: { estoque: 2 },
      });
      const pedidoId = await comprar(alvo, peca, ids.M, 3);

      await cancelar(alvo, pedidoId);

      const estoque = await estoqueDe(alvo, peca);
      expect(estoque.M?.quantidade).toBe(10);
      // Mais recente primeiro: a devolução em cima, a baixa embaixo.
      expect(
        estoque.M?.movimentos.map((m) => ({
          origem: m.origem,
          delta: m.delta,
          depois: m.quantidadeDepois,
          pedidoId: m.pedidoId,
        })),
      ).toEqual([
        { origem: "CANCELAMENTO", delta: 3, depois: 10, pedidoId },
        { origem: "PEDIDO", delta: -3, depois: 7, pedidoId },
      ]);
      // A devolução fica com o autor: é o dono quem cancelou.
      expect(estoque.M?.movimentos[0]?.autorId).toBe(alvo.dono.identidadeId);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-334 devolver de novo não cria unidades: o que já voltou não volta duas vezes",
    async () => {
      const alvo = await lojaComPainel("roupas", "Malharia do Porto");
      const peca = await camiseta(alvo, "Camiseta Regata");
      const ids = await grade(alvo, peca, {
        P: { estoque: 2 },
        M: { estoque: 8 },
        G: { estoque: 2 },
      });
      const pedidoId = await comprar(alvo, peca, ids.M, 2);
      await cancelar(alvo, pedidoId);

      const repetida = await comoRequisicao(
        acesso,
        {
          lojaId: alvo.loja.id,
          usuarioId: alvo.dono.identidadeId,
          papel: "OWNER",
        },
        () => devolverEstoqueDoPedido(pedidoId),
      );

      expect(repetida).toEqual([]);
      const estoque = await estoqueDe(alvo, peca);
      expect(estoque.M?.quantidade).toBe(8);
      expect(estoque.M?.movimentos).toHaveLength(2);
    },
    ESPERA_LONGA,
  );
});

describe("ajuste manual com motivo registrado (AC-335)", () => {
  it(
    "@spec:AC-335 a contagem física vira o saldo, e o ajuste guarda quem, quando, por quê e o saldo anterior",
    async () => {
      const alvo = await lojaComPainel("roupas", "Malharia da Serra");
      const peca = await camiseta(alvo, "Camiseta Polo");
      const ids = await grade(alvo, peca, {
        P: { estoque: 3 },
        M: { estoque: 9 },
        G: { estoque: 3 },
      });

      const ajuste = await request(alvo.painel)
        .post(
          `/v1/lojas/${alvo.loja.apelido}/catalogo/produtos/${peca.produto.id}/variacoes/${ids.M}/estoque`,
        )
        .send({ quantidadeAlvo: 12, motivo: "Contagem física de sábado" });
      expect(ajuste.status).toBe(201);

      const estoque = await estoqueDe(alvo, peca);
      expect(estoque.M?.quantidade).toBe(12);
      expect(estoque.M?.movimentos[0]).toMatchObject({
        quantidadeAntes: 9,
        delta: 3,
        quantidadeDepois: 12,
        motivo: "Contagem física de sábado",
        origem: "MANUAL",
        pedidoId: null,
        autorId: alvo.dono.identidadeId,
      });
      expect(
        Number.isNaN(Date.parse(estoque.M?.movimentos[0]?.criadoEm ?? "")),
      ).toBe(false);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-335 ajuste sem motivo é recusado e o saldo não muda",
    async () => {
      const alvo = await lojaComPainel("roupas", "Malharia do Vale");
      const peca = await camiseta(alvo, "Camiseta Raglan");
      const ids = await grade(alvo, peca, {
        P: { estoque: 3 },
        M: { estoque: 9 },
        G: { estoque: 3 },
      });

      const semMotivo = await request(alvo.painel)
        .post(
          `/v1/lojas/${alvo.loja.apelido}/catalogo/produtos/${peca.produto.id}/variacoes/${ids.M}/estoque`,
        )
        .send({ quantidadeAlvo: 12, motivo: "   " });
      expect(semMotivo.status).toBe(400);

      const estoque = await estoqueDe(alvo, peca);
      expect(estoque.M?.quantidade).toBe(9);
      expect(estoque.M?.movimentos).toEqual([]);
    },
    ESPERA_LONGA,
  );
});

describe("estoque baixo é sinalizado ao dono (AC-336)", () => {
  it(
    "@spec:AC-336 com aviso em cinco, chegar a cinco acende o sinal na lista de produtos e na tela de estoque",
    async () => {
      const alvo = await lojaComPainel("roupas", "Malharia do Largo");
      const peca = await camiseta(alvo, "Camiseta Longa");
      const ids = await grade(alvo, peca, {
        P: { estoque: 20, minimo: 5 },
        M: { estoque: 8, minimo: 5 },
        G: { estoque: 20 },
      });

      const listaDoDono = async () => {
        const resposta = await request(alvo.painel).get(
          `/v1/lojas/${alvo.loja.apelido}/catalogo/produtos`,
        );
        expect(resposta.status).toBe(200);
        return (
          resposta.body.produtos as {
            id: string;
            estoqueBaixo: boolean;
            variacoesAcabando: {
              nome: string;
              quantidade: number;
              minimoAlerta: number;
            }[];
          }[]
        ).find((produto) => produto.id === peca.produto.id);
      };

      expect((await listaDoDono())?.estoqueBaixo).toBe(false);

      const ajuste = await request(alvo.painel)
        .post(
          `/v1/lojas/${alvo.loja.apelido}/catalogo/produtos/${peca.produto.id}/variacoes/${ids.M}/estoque`,
        )
        .send({ quantidadeAlvo: 5, motivo: "Venda no balcão" });
      expect(ajuste.status).toBe(201);

      const naLista = await listaDoDono();
      expect(naLista?.estoqueBaixo).toBe(true);
      // Só o M: o P tem aviso mas está longe dele, e o G não tem aviso.
      expect(naLista?.variacoesAcabando).toEqual([
        { id: ids.M, nome: "M", quantidade: 5, minimoAlerta: 5 },
      ]);

      const estoque = await estoqueDe(alvo, peca);
      expect(estoque.M?.estoqueBaixo).toBe(true);
      expect(estoque.P?.estoqueBaixo).toBe(false);
      expect(estoque.G?.estoqueBaixo).toBe(false);
    },
    ESPERA_LONGA,
  );
});

describe("loja de comida não é obrigada a controlar estoque (AC-337)", () => {
  it(
    "@spec:AC-337 a grade da lanchonete vem sem controle de estoque, e a da loja de roupas com",
    async () => {
      const lanchonete = await lojaComPainel("lanchonete", "Lanches da Vila");
      const lanche = await camiseta(lanchonete, "Pastel");
      const roupas = await lojaComPainel("roupas", "Malharia da Vila");
      const camisa = await camiseta(roupas, "Camiseta Lisa");

      const daLanchonete = await request(lanchonete.painel).get(
        `/v1/lojas/${lanchonete.loja.apelido}/catalogo/produtos/${lanche.produto.id}/variacoes`,
      );
      const daMalharia = await request(roupas.painel).get(
        `/v1/lojas/${roupas.loja.apelido}/catalogo/produtos/${camisa.produto.id}/variacoes`,
      );

      expect(daLanchonete.status).toBe(200);
      expect(daLanchonete.body.controlaEstoque).toBe(false);
      expect(daMalharia.body.controlaEstoque).toBe(true);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-337 sem quantidade, a lanchonete vende pelo disponível e para pelo esgotado",
    async () => {
      const alvo = await lojaComPainel("lanchonete", "Pastelaria do Largo");
      const pastel = await camiseta(alvo, "Pastel de Queijo");
      const ids = await grade(alvo, pastel, {
        P: { estoque: null },
        M: { estoque: null },
        G: { estoque: null },
      });

      // Estoque nulo é "não controla": vende sem contar unidades.
      const vendido = await comprar(alvo, pastel, ids.M, 50);
      expect(vendido).toBeTruthy();

      // Acabou a massa: o dono marca esgotado, e a venda para.
      const esgotar = await request(alvo.painel)
        .patch(
          `/v1/lojas/${alvo.loja.apelido}/catalogo/produtos/${pastel.produto.id}/variacoes/${ids.M}`,
        )
        .send({ disponivel: false });
      expect(esgotar.status).toBe(200);

      const cliente = new Visitante(vitrine, alvo.loja.apelido);
      const recusado = await cliente.acrescentar({
        produtoId: pastel.produto.id,
        variacaoId: ids.M,
        quantidade: 1,
        escolhas: [],
      });
      expect(recusado.status).toBe(409);

      // E nenhuma contagem nasceu no caminho.
      const estoque = await estoqueDe(alvo, pastel);
      expect(estoque.M?.quantidade).toBeNull();
      expect(estoque.M?.movimentos).toEqual([]);
    },
    ESPERA_LONGA,
  );
});
