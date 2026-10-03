/**
 * Prova da criação do pedido contra PostgreSQL de verdade
 * (AC-514, AC-516, AC-517, AC-518).
 *
 * Estes critérios NÃO se provam sem banco. A numeração por loja depende de um
 * incremento atômico dentro de uma função do PostgreSQL; a idempotência depende
 * de um índice único parcial; e "o pedido não foi criado" só é afirmável
 * contando linhas no banco, não olhando o que a função devolveu. Um teste com
 * banco simulado provaria que o código chama o que eu mandei chamar — e é
 * exatamente isso que não está em dúvida.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import type {
  PedidoParaCriar,
  ResultadoDaCriacao,
  SituacaoDaLoja,
} from "../src/modules/orders/criar-pedido.usecase.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let loja: LojaDeTeste;
let outraLoja: LojaDeTeste;

const ABERTA: SituacaoDaLoja = { aberta: true };
const FECHADA: SituacaoDaLoja = {
  aberta: false,
  proximaAbertura: "abre amanhã às 18h",
};

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  loja = await criarLoja({ nome: "Sabor & Cia" });
  outraLoja = await criarLoja({ nome: "Moda Boa Vista" });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** Um pedido mínimo e válido, com um item. */
function pedidoDe(
  alvo: LojaDeTeste,
  sobrescrita: Partial<PedidoParaCriar> = {},
): PedidoParaCriar {
  return {
    lojaId: alvo.id,
    contato: { nome: "Maria Conceição", telefoneE164: "5511988887777" },
    itens: [
      {
        nomeDoProduto: "Marmita executiva",
        quantidade: 2,
        precoUnitarioEmCentavos: 2000,
        totalDaLinhaEmCentavos: 4000,
      },
    ],
    entrega: "DELIVERY",
    subtotalEmCentavos: 4000,
    taxaDeEntregaEmCentavos: 800,
    totalEmCentavos: 4800,
    ...sobrescrita,
  };
}

/**
 * Roda a criação como a requisição de um cliente daquela loja.
 *
 * O endereço público do pedido é DECLARADO no contexto antes de a transação
 * abrir. É ele que autoriza a escrita (migração 0009): sem token declarado, o
 * isolamento por linha recusa a inserção — e é assim que "qualquer um pode
 * criar pedido nesta loja" deixa de ser verdade.
 */
function criar(
  alvo: LojaDeTeste,
  entrada: PedidoParaCriar,
  situacao: SituacaoDaLoja = ABERTA,
): Promise<ResultadoDaCriacao> {
  return comoRequisicao(
    acesso,
    {
      lojaId: alvo.id,
      papel: "CUSTOMER",
      tokenDoPedido: tokenPublico(),
      chaveDoFechamento: entrada.chaveDeIdempotencia ?? undefined,
    },
    () => criarPedido(entrada, situacao),
  );
}

/** Quantos pedidos a loja tem, contados pelo migrador — não pelo caso de uso. */
async function quantosPedidos(alvo: LojaDeTeste): Promise<number> {
  const resultado = await migrador.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM app.orders WHERE store_id = $1`,
    [alvo.id],
  );
  return Number(resultado.rows[0]?.n ?? "0");
}

describe("pedido recebe número e entra na fila (AC-514)", () => {
  it(
    "@spec:AC-514 o pedido nasce com status de aguardando e o primeiro passo do histórico",
    async () => {
      const resultado = await criar(loja, pedidoDe(loja));

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.pedido.status).toBe("PENDING");
      expect(resultado.pedido.jaExistia).toBe(false);

      // Sem o primeiro passo do histórico, a fila do dono mostraria o pedido
      // sem saber desde quando ele está esperando.
      const historico = await migrador.query<{ to_status: string }>(
        `SELECT to_status FROM app.order_status_history WHERE order_id = $1`,
        [resultado.pedido.id],
      );
      expect(historico.rows.map((l) => l.to_status)).toEqual(["PENDING"]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-514 a numeração é por loja: cada uma começa no 1 e segue sem pular",
    async () => {
      // Uma sequência global daria à loja recém-aberta um número que revela
      // quanto a plataforma inteira já vendeu, e com buracos entre um pedido e
      // o seguinte da mesma loja.
      const nova = await criarLoja({ nome: "Pastelaria da Vila" });
      const outra = await criarLoja({ nome: "Auto Peças Central" });

      const primeiro = await criar(nova, pedidoDe(nova));
      const segundo = await criar(nova, pedidoDe(nova));
      const daOutra = await criar(outra, pedidoDe(outra));

      expect(primeiro.ok && primeiro.pedido.numero).toBe(1);
      expect(primeiro.ok && primeiro.pedido.codigo).toBe("A-0001");
      expect(segundo.ok && segundo.pedido.numero).toBe(2);
      expect(segundo.ok && segundo.pedido.codigo).toBe("A-0002");
      // A loja nova começa no 1 mesmo tendo nascido depois de outras venderem.
      expect(daOutra.ok && daOutra.pedido.numero).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-514 os itens e as escolhas são gravados como texto do momento da compra",
    async () => {
      const comOpcao = pedidoDe(loja, {
        itens: [
          {
            nomeDoProduto: "Açaí na tigela",
            nomeDaVariacao: "500 ml",
            quantidade: 1,
            precoUnitarioEmCentavos: 2350,
            totalDaLinhaEmCentavos: 2350,
            opcoes: [
              {
                nomeDoGrupo: "Cobertura",
                nomeDaOpcao: "Leite condensado",
                acrescimoEmCentavos: 200,
              },
            ],
          },
        ],
        subtotalEmCentavos: 2350,
        taxaDeEntregaEmCentavos: 0,
        totalEmCentavos: 2350,
      });

      const resultado = await criar(loja, comOpcao);
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      const itens = await migrador.query<{
        product_name: string;
        variant_name: string | null;
      }>(
        `SELECT product_name, variant_name FROM app.order_items WHERE order_id = $1`,
        [resultado.pedido.id],
      );
      expect(itens.rows[0]?.product_name).toBe("Açaí na tigela");
      expect(itens.rows[0]?.variant_name).toBe("500 ml");

      const opcoes = await migrador.query<{ option_name_snapshot: string }>(
        `SELECT o.option_name_snapshot FROM app.order_item_options o
           JOIN app.order_items i ON i.id = o.order_item_id
          WHERE i.order_id = $1`,
        [resultado.pedido.id],
      );
      expect(opcoes.rows[0]?.option_name_snapshot).toBe("Leite condensado");
    },
    ESPERA_LONGA,
  );
});

describe("enviar duas vezes não cria dois pedidos (AC-516)", () => {
  it(
    "@spec:AC-516 a segunda tentativa com a mesma chave devolve o mesmo pedido",
    async () => {
      // É o toque duplo no botão, e a nova tentativa automática de quem está no
      // sinal fraco. Sem isto, a cozinha recebe dois pedidos iguais e prepara
      // os dois.
      const alvo = await criarLoja({ nome: "Lanches do Zé" });
      const entrada = pedidoDe(alvo, { chaveDeIdempotencia: "toque-duplo-1" });

      const primeiro = await criar(alvo, entrada);
      const segundo = await criar(alvo, entrada);

      expect(primeiro.ok && primeiro.pedido.jaExistia).toBe(false);
      expect(segundo.ok && segundo.pedido.jaExistia).toBe(true);
      expect(segundo.ok && segundo.pedido.id).toBe(
        primeiro.ok ? primeiro.pedido.id : null,
      );
      expect(await quantosPedidos(alvo)).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-516 a segunda tentativa não gasta um número da sequência da loja",
    async () => {
      // Pedir o número antes de conferir a chave faria a loja ver buracos na
      // numeração sem ter cancelado nada.
      const alvo = await criarLoja({ nome: "Padaria Aurora" });

      await criar(alvo, pedidoDe(alvo, { chaveDeIdempotencia: "k1" }));
      await criar(alvo, pedidoDe(alvo, { chaveDeIdempotencia: "k1" }));
      const seguinte = await criar(
        alvo,
        pedidoDe(alvo, { chaveDeIdempotencia: "k2" }),
      );

      expect(seguinte.ok && seguinte.pedido.numero).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-516 pedidos sem chave nenhuma continuam sendo pedidos distintos",
    async () => {
      // A unicidade no banco é parcial: sem esta prova, um índice cheio faria o
      // segundo pedido sem chave ser recusado como se fosse duplicata.
      const alvo = await criarLoja({ nome: "Mercadinho São João" });

      await criar(alvo, pedidoDe(alvo));
      await criar(alvo, pedidoDe(alvo));

      expect(await quantosPedidos(alvo)).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-516 a mesma chave em outra loja cria pedido, porque a chave é por loja",
    async () => {
      const a = await criarLoja({ nome: "Bar do Centro" });
      const b = await criarLoja({ nome: "Bar da Praia" });

      await criar(a, pedidoDe(a, { chaveDeIdempotencia: "mesma-chave" }));
      const naOutra = await criar(
        b,
        pedidoDe(b, { chaveDeIdempotencia: "mesma-chave" }),
      );

      expect(naOutra.ok && naOutra.pedido.jaExistia).toBe(false);
      expect(await quantosPedidos(b)).toBe(1);
    },
    ESPERA_LONGA,
  );
});

describe("loja fechada não aceita pedido novo (AC-517)", () => {
  it(
    "@spec:AC-517 nenhum pedido é gravado, e a recusa diz quando a loja abre",
    async () => {
      const alvo = await criarLoja({ nome: "Cantina Noturna" });

      const resultado = await criar(alvo, pedidoDe(alvo), FECHADA);

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.recusa.causa).toBe("LOJA_FECHADA");
      expect(resultado.recusa.explicacao).toContain("abre amanhã às 18h");
      // O carrinho não é tocado: quem tentou volta mais tarde e acha tudo como
      // deixou. Limpar aqui seria perder a venda.
      expect(resultado.recusa.carrinhoPreservado).toBe(true);
      // E a afirmação forte: nada foi gravado, contado no banco.
      expect(await quantosPedidos(alvo)).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-517 a recusa não gasta número da sequência da loja",
    async () => {
      const alvo = await criarLoja({ nome: "Espetinho do Val" });

      await criar(alvo, pedidoDe(alvo), FECHADA);
      const depoisDeAbrir = await criar(alvo, pedidoDe(alvo), ABERTA);

      expect(depoisDeAbrir.ok && depoisDeAbrir.pedido.numero).toBe(1);
    },
    ESPERA_LONGA,
  );
});

describe("pedido de convidado é registrado sem conta (AC-518)", () => {
  it(
    "@spec:AC-518 o pedido é criado sem cliente cadastrado e devolve o link de acompanhamento",
    async () => {
      // Exigir conta mataria a conversão do pequeno negócio, onde a maioria
      // compra sem se cadastrar.
      const alvo = await criarLoja({ nome: "Doces da Ana" });

      const resultado = await criar(
        alvo,
        pedidoDe(alvo, { clienteDaLojaId: null }),
      );

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.pedido.tokenPublico.length).toBeGreaterThanOrEqual(22);

      const linha = await migrador.query<{ store_customer_id: string | null }>(
        `SELECT store_customer_id FROM app.orders WHERE id = $1`,
        [resultado.pedido.id],
      );
      expect(linha.rows[0]?.store_customer_id).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-518 o dado pessoal do convidado fica em linha separada do pedido",
    async () => {
      // É o que torna o apagamento a pedido do titular uma alteração de uma
      // linha só, sem tocar no pedido nem nas métricas do dono.
      const alvo = await criarLoja({ nome: "Sucos da Praça" });
      const resultado = await criar(alvo, pedidoDe(alvo));
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      const contato = await migrador.query<{
        name: string;
        phone_e164: string;
      }>(
        `SELECT name, phone_e164 FROM app.order_contacts WHERE order_id = $1`,
        [resultado.pedido.id],
      );
      expect(contato.rows[0]?.name).toBe("Maria Conceição");
      expect(contato.rows[0]?.phone_e164).toBe("5511988887777");

      // E o pedido em si não guarda nome nem telefone em coluna nenhuma.
      const colunas = await migrador.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'app' AND table_name = 'orders'`,
      );
      const nomes = colunas.rows.map((l) => l.column_name);
      expect(nomes).not.toContain("customer_name");
      expect(nomes).not.toContain("phone");
      expect(nomes).not.toContain("phone_e164");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-518 dois pedidos nunca compartilham o mesmo link de acompanhamento",
    async () => {
      const alvo = await criarLoja({ nome: "Pizzaria Bella" });
      const um = await criar(alvo, pedidoDe(alvo));
      const dois = await criar(alvo, pedidoDe(alvo));

      expect(um.ok && dois.ok && um.pedido.tokenPublico).not.toBe(
        dois.ok ? dois.pedido.tokenPublico : "",
      );
    },
    ESPERA_LONGA,
  );
});

describe("a autorização de escrita não é decorativa (AC-514)", () => {
  it(
    "@spec:AC-514 sem o endereço público declarado, o banco recusa a criação",
    async () => {
      // É a prova de que a política da migração 0009 NEGA alguma coisa. Política
      // que nunca recusou nada não está provada: uma condição escrita errada
      // deixaria passar tudo, e o teste de caminho feliz continuaria verde.
      const alvo = await criarLoja({ nome: "Quitanda do Bairro" });

      const recusa = await comoRequisicao(
        acesso,
        { lojaId: alvo.id, papel: "CUSTOMER" },
        () => criarPedido(pedidoDe(alvo), ABERTA),
      ).then(
        () => null,
        (erro: unknown) => erro,
      );

      expect(recusa).toBeInstanceOf(Error);
      expect(await quantosPedidos(alvo)).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-514 o cliente não consegue criar pedido já aceito para furar a fila",
    async () => {
      // A política só aceita o status inicial. Sem essa condição, quem montasse
      // a requisição à mão entraria na cozinha como pedido já confirmado, sem
      // o dono ter aceitado nada.
      const alvo = await criarLoja({ nome: "Marmitaria Central" });
      const token = tokenPublico();

      const recusa = await comoRequisicao(
        acesso,
        { lojaId: alvo.id, papel: "CUSTOMER", tokenDoPedido: token },
        (tx) =>
          tx.order.create({
            data: {
              storeId: alvo.id,
              number: 1n,
              code: "A-0001",
              publicToken: token,
              status: "ACCEPTED",
              channel: "ONLINE",
              fulfillment: "DELIVERY",
              totalCents: 1000n,
            },
          }),
      ).then(
        () => null,
        (erro: unknown) => erro,
      );

      expect(recusa).toBeInstanceOf(Error);
      expect(await quantosPedidos(alvo)).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-514 o cliente não consegue lançar pedido de balcão, que sujaria as métricas",
    async () => {
      const alvo = await criarLoja({ nome: "Sorveteria Gelato" });
      const token = tokenPublico();

      const recusa = await comoRequisicao(
        acesso,
        { lojaId: alvo.id, papel: "CUSTOMER", tokenDoPedido: token },
        (tx) =>
          tx.order.create({
            data: {
              storeId: alvo.id,
              number: 1n,
              code: "A-0001",
              publicToken: token,
              status: "PENDING",
              channel: "MANUAL",
              fulfillment: "PICKUP",
              totalCents: 1000n,
            },
          }),
      ).then(
        () => null,
        (erro: unknown) => erro,
      );

      expect(recusa).toBeInstanceOf(Error);
      expect(await quantosPedidos(alvo)).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-516 a chave de outra pessoa não devolve o pedido dela",
    async () => {
      // A chave de fechamento é credencial de leitura. Se ela não fosse
      // conferida contra a loja do contexto, apresentar uma chave qualquer
      // devolveria o pedido de outra pessoa — com nome, telefone e endereço.
      const dono = await criarLoja({ nome: "Hortifruti da Esquina" });
      const intruso = await criarLoja({ nome: "Empório do Vale" });

      await criar(
        dono,
        pedidoDe(dono, { chaveDeIdempotencia: "chave-do-dono" }),
      );

      const visto = await comoRequisicao(
        acesso,
        {
          lojaId: intruso.id,
          papel: "CUSTOMER",
          chaveDoFechamento: "chave-do-dono",
        },
        (tx) =>
          tx.order.findFirst({ where: { idempotencyKey: "chave-do-dono" } }),
      );

      expect(visto).toBeNull();
    },
    ESPERA_LONGA,
  );
});

describe("o pedido pertence à loja do contexto", () => {
  it(
    "@spec:AC-514 o pedido criado não aparece para outra loja",
    async () => {
      const resultado = await criar(loja, pedidoDe(loja));
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      // A leitura roda no contexto da OUTRA loja: o isolamento por linha é que
      // responde aqui, e não um filtro escrito no caso de uso.
      const visto = await comoRequisicao(
        acesso,
        { lojaId: outraLoja.id, usuarioId: outraLoja.dono.id, papel: "OWNER" },
        (tx) => tx.order.findFirst({ where: { id: resultado.pedido.id } }),
      );

      expect(visto).toBeNull();
    },
    ESPERA_LONGA,
  );
});
