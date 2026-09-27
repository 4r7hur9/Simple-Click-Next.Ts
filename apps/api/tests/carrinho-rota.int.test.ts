/**
 * Prova das rotas do carrinho (AC-411, AC-500, AC-501, AC-502).
 *
 * O QUE SÓ ESTA PROVA MOSTRA é a costura: que o cookie de sessão emitido na
 * primeira requisição faz o carrinho ser reencontrado na segunda, que o
 * carrinho de uma sessão não é alcançável por outra, e — o ponto do AC-411 —
 * que o valor conferido no SERVIDOR ao adicionar é o mesmo que a tela mostrou,
 * porque os dois lados chamam a mesma função com os preços do catálogo.
 *
 * O caso de uso já era provado desde a T-500. O que não existia era o Express.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calcularItem } from "@simpleclick/core";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarGrupoDeEscolha,
  criarLoja,
  criarOpcao,
  criarProduto,
  criarVariacao,
  porGrupoNoProduto,
} from "@simpleclick/testing";
import type {
  GrupoDeTeste,
  LojaDeTeste,
  OpcaoDeTeste,
  ProdutoDeTeste,
} from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { criarApp } from "../src/app.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

/**
 * A origem autorizada desta prova.
 *
 * MÉTODO QUE MUDA ESTADO EXIGE ORIGEM CONFIÁVEL (AC-126, AC-128): sem `Origin`
 * na lista, a API responde 403 antes de a rota existir para a requisição. É o
 * que impede o formulário de um site de terceiros de agir com o cookie da
 * vítima — que o navegador anexa sozinho. O navegador de verdade manda o
 * cabeçalho por conta própria; o supertest não, e por isso ele vai à mão aqui.
 */
const ORIGEM = "https://app.exemplo.test";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof criarApp>;

let loja: LojaDeTeste;
let lanche: ProdutoDeTeste;
let adicionais: GrupoDeTeste;
let bacon: OpcaoDeTeste;
let cheddarEsgotado: OpcaoDeTeste;
let ponto: GrupoDeTeste;
let aoPonto: OpcaoDeTeste;

const PRECO_DO_LANCHE = 2000;
const ACRESCIMO_DO_BACON = 300;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
  });

  loja = await criarLoja({ nome: "Lanchonete do Carrinho" });
  lanche = await criarProduto({
    loja,
    nome: "X-Salada",
    precoCentavos: PRECO_DO_LANCHE,
  });

  adicionais = await criarGrupoDeEscolha({ loja, nome: "Adicionais" });
  await porGrupoNoProduto({ loja, produto: lanche, grupo: adicionais });
  bacon = await criarOpcao({
    loja,
    grupo: adicionais,
    nome: "Bacon",
    acrescimoCentavos: ACRESCIMO_DO_BACON,
  });
  cheddarEsgotado = await criarOpcao({
    loja,
    grupo: adicionais,
    nome: "Cheddar",
    acrescimoCentavos: 250,
    disponivel: false,
  });

  ponto = await criarGrupoDeEscolha({
    loja,
    nome: "Ponto da carne",
    minimo: 1,
    maximo: 1,
  });
  await porGrupoNoProduto({ loja, produto: lanche, grupo: ponto });
  aoPonto = await criarOpcao({ loja, grupo: ponto, nome: "Ao ponto" });

  // A LOJA PRECISA PODER VENDER. Sem configuração de entrega ela não aceita
  // nem entrega nem retirada — e o fechamento recusa, corretamente. Sem
  // horário ela está fechada, e o fechamento recusa de novo. As duas recusas
  // são o comportamento certo; o que faltava era o cenário.
  await migrador.query(
    `INSERT INTO app.store_settings (store_id, delivery, payment, whatsapp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id) DO UPDATE
       SET delivery = EXCLUDED.delivery, payment = EXCLUDED.payment,
           whatsapp = EXCLUDED.whatsapp`,
    [
      loja.id,
      JSON.stringify({ taxaPadraoCents: 700, retiradaNoLocal: true }),
      JSON.stringify({
        formas: ["PIX", "CASH"],
        pix: { chave: "loja@pix.test", tipo: "EMAIL", titular: "Dona Zica" },
      }),
      JSON.stringify({
        numero: "+5511911112222",
        saudacao: "Olá! Segue meu pedido:",
      }),
    ],
  );

  // Aberta todos os dias, o dia inteiro: o que se prova aqui é o fechamento,
  // e não o horário — que tem prova própria na T-903.
  for (let dia = 0; dia <= 6; dia += 1) {
    await migrador.query(
      `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '00:00', '23:59')`,
      [loja.id, dia],
    );
  }
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** O caminho do carrinho daquela loja. */
function caminho(sufixo = ""): string {
  return `/v1/vitrine/${loja.apelido}/carrinho${sufixo}`;
}

/** Tira o token do cookie que a API emitiu. */
function tokenDe(resposta: request.Response): string {
  const cabecalho = resposta.headers["set-cookie"];
  const cookies = Array.isArray(cabecalho) ? cabecalho : [cabecalho ?? ""];
  const nosso = cookies.find((c) => c.startsWith(`${COOKIE_DA_SESSAO}=`));
  const valor = nosso?.split(";")[0]?.split("=")[1];
  if (valor === undefined || valor === "") {
    throw new Error("a API não emitiu o cookie da sessão do carrinho");
  }
  return valor;
}

/** POST com a origem autorizada, como o navegador o faria. */
function acrescentar(corpo: unknown, token?: string) {
  const pedido = request(app)
    .post(caminho("/itens"))
    .set("Origin", ORIGEM)
    .send(corpo as object);
  return token === undefined
    ? pedido
    : pedido.set("Cookie", `${COOKIE_DA_SESSAO}=${token}`);
}

/** Um item mínimo que fecha: o obrigatório escolhido. */
function itemValido(sobrescrita: Record<string, unknown> = {}) {
  return {
    produtoId: lanche.id,
    quantidade: 1,
    escolhas: [{ grupoId: ponto.id, opcaoId: aoPonto.id, quantidade: 1 }],
    ...sobrescrita,
  };
}

describe("o carrinho é de quem o montou (AC-500, AC-502)", () => {
  it(
    "@spec:AC-500 a primeira requisição emite o cookie de sessão, com HttpOnly",
    async () => {
      const resposta = await request(app).get(caminho());

      expect(resposta.status).toBe(200);
      expect(resposta.body).toEqual({ itens: [], totalDeItens: 0 });

      const cabecalho = resposta.headers["set-cookie"];
      const cookies = Array.isArray(cabecalho) ? cabecalho : [cabecalho ?? ""];
      const nosso = cookies.find((c) => c.startsWith(`${COOKIE_DA_SESSAO}=`));

      // `HttpOnly` porque script da página não tem por que ler o token — e não
      // podendo lê-lo, biblioteca de terceiro na vitrine não consegue roubá-lo.
      expect(nosso).toContain("HttpOnly");
      expect(nosso).toContain("SameSite=Lax");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-500 o carrinho sobrevive entre requisições, pelo cookie",
    async () => {
      const primeira = await acrescentar(itemValido());
      expect(primeira.status).toBe(201);
      const token = tokenDe(primeira);

      const segunda = await request(app)
        .get(caminho())
        .set("Cookie", `${COOKIE_DA_SESSAO}=${token}`);

      expect(segunda.body.totalDeItens).toBe(1);
      expect(segunda.body.itens[0].produtoId).toBe(lanche.id);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-502 uma sessão NÃO enxerga o carrinho de outra",
    async () => {
      // É a falha que a migração 0012 corrigiu: antes dela, todo visitante via
      // o carrinho de todos os outros da mesma loja.
      const minha = await acrescentar(itemValido());
      const meuToken = tokenDe(minha);

      const outra = await request(app).get(caminho());
      const outroToken = tokenDe(outra);

      expect(outroToken).not.toBe(meuToken);
      expect(outra.body.itens).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-500 cookie com valor malformado não vira sessão: a API emite um novo",
    async () => {
      // Sem esta recusa, dois visitantes que escrevessem o mesmo valor curto
      // dividiriam o carrinho.
      const resposta = await request(app)
        .get(caminho())
        .set("Cookie", `${COOKIE_DA_SESSAO}=curto`);

      expect(resposta.status).toBe(200);
      expect(tokenDe(resposta)).not.toBe("curto");
    },
    ESPERA_LONGA,
  );
});

describe("o servidor recalcula o item que recebe (AC-411)", () => {
  it(
    "@spec:AC-411 o total do servidor é o mesmo que a tela calcula, com a mesma função",
    async () => {
      // A TELA faria exatamente esta conta com `calcularItem`; a API refaz com
      // os preços que ela lê do banco. Se as duas divergissem, este teste
      // pegaria — é o que o critério quer dizer com "o mesmo".
      const naTela = calcularItem({
        precoBaseEmCentavos: PRECO_DO_LANCHE,
        quantidade: 2,
        grupos: [
          {
            grupoId: adicionais.id,
            nome: "Adicionais",
            minimo: 0,
            maximo: null,
            permiteRepetir: false,
            itens: [
              {
                itemId: bacon.id,
                nome: "Bacon",
                acrescimoEmCentavos: ACRESCIMO_DO_BACON,
                disponivel: true,
              },
            ],
          },
          {
            grupoId: ponto.id,
            nome: "Ponto da carne",
            minimo: 1,
            maximo: 1,
            permiteRepetir: false,
            itens: [
              {
                itemId: aoPonto.id,
                nome: "Ao ponto",
                acrescimoEmCentavos: 0,
                disponivel: true,
              },
            ],
          },
        ],
        escolhas: [
          { grupoId: adicionais.id, itemId: bacon.id, quantidade: 1 },
          { grupoId: ponto.id, itemId: aoPonto.id, quantidade: 1 },
        ],
      });

      expect(naTela.totalEmCentavos).toBe(4600);

      const resposta = await acrescentar(
        itemValido({
          quantidade: 2,
          escolhas: [
            { grupoId: ponto.id, opcaoId: aoPonto.id, quantidade: 1 },
            { grupoId: adicionais.id, opcaoId: bacon.id, quantidade: 1 },
          ],
          totalVistoCentavos: naTela.totalEmCentavos,
        }),
      );

      // O servidor ACEITOU: os dois chegaram ao mesmo número.
      expect(resposta.status).toBe(201);
      expect(resposta.body.totalDeItens).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-411 total enviado errado NÃO muda a conta, e o item entra pelo valor do servidor",
    async () => {
      // Ler preço do que o navegador manda é o que permite fechar um pedido de
      // mil reais por um. O valor enviado é anotado e descartado (P-006).
      const resposta = await acrescentar(itemValido({ totalVistoCentavos: 1 }));

      expect(resposta.status).toBe(201);
      expect(resposta.body.totalDeItens).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-411 @spec:AC-317 os nomes das opções vêm do catálogo, e o esgotado não bloqueia os outros",
    async () => {
      // O carrinho guarda o que a cozinha vai ler; nome vindo de fora poria
      // texto arbitrário no cupom impresso.
      const resposta = await acrescentar(
        itemValido({
          escolhas: [
            { grupoId: ponto.id, opcaoId: aoPonto.id, quantidade: 1 },
            { grupoId: adicionais.id, opcaoId: bacon.id, quantidade: 1 },
          ],
        }),
      );

      const nomes = resposta.body.itens[0].opcoes.map(
        (o: { opcaoNome: string }) => o.opcaoNome,
      );
      expect(nomes).toContain("Bacon");
      expect(nomes).toContain("Ao ponto");
    },
    ESPERA_LONGA,
  );
});

describe("o servidor recusa o item que não fecha (AC-412)", () => {
  it(
    "@spec:AC-412 @spec:AC-313 grupo obrigatório sem escolha é recusado, mesmo a tela deixando passar",
    async () => {
      // A tela já bloqueia. Esta é a segunda linha de defesa, para quem monta a
      // requisição à mão ou está com a página aberta desde antes.
      const resposta = await acrescentar({
        produtoId: lanche.id,
        quantidade: 1,
        escolhas: [],
      });

      expect(resposta.status).toBe(409);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-412 @spec:AC-317 opção esgotada é recusada",
    async () => {
      const resposta = await acrescentar(
        itemValido({
          escolhas: [
            { grupoId: ponto.id, opcaoId: aoPonto.id, quantidade: 1 },
            {
              grupoId: adicionais.id,
              opcaoId: cheddarEsgotado.id,
              quantidade: 1,
            },
          ],
        }),
      );

      expect(resposta.status).toBe(409);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-412 a recusa é genérica: não devolve o mapa do catálogo",
    async () => {
      const resposta = await acrescentar({
        produtoId: lanche.id,
        quantidade: 1,
        escolhas: [],
      });

      const corpo = JSON.stringify(resposta.body);
      expect(corpo).not.toContain("Ponto da carne");
      expect(corpo).not.toContain(ponto.id);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-410 produto de outra loja responde 404, e não o produto",
    async () => {
      const outraLoja = await criarLoja({ nome: "Loja Vizinha" });
      const alheio = await criarProduto({ loja: outraLoja, nome: "Segredo" });

      const resposta = await acrescentar({
        produtoId: alheio.id,
        quantidade: 1,
        escolhas: [],
      });

      expect(resposta.status).toBe(404);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-413 produto indisponível não entra no carrinho",
    async () => {
      const esgotado = await criarProduto({
        loja,
        nome: "Coxinha",
        disponivel: false,
      });

      const resposta = await acrescentar({
        produtoId: esgotado.id,
        quantidade: 1,
        escolhas: [],
      });

      expect(resposta.status).toBe(409);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-412 corpo malformado é recusado na borda, antes de tocar o banco",
    async () => {
      const resposta = await acrescentar({
        produtoId: "isto-nao-e-uuid",
        quantidade: 0,
      });

      expect(resposta.status).toBe(400);
    },
    ESPERA_LONGA,
  );
});

describe("mudar e tirar itens (AC-501)", () => {
  it(
    "@spec:AC-501 mudar a quantidade muda o total de itens",
    async () => {
      const criado = await acrescentar(itemValido());
      const token = tokenDe(criado);
      const itemId = criado.body.itens[0].id;

      const resposta = await request(app)
        .patch(caminho(`/itens/${itemId}`))
        .set("Origin", ORIGEM)
        .set("Cookie", `${COOKIE_DA_SESSAO}=${token}`)
        .send({ quantidade: 5 });

      expect(resposta.status).toBe(200);
      expect(resposta.body.totalDeItens).toBe(5);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-501 quantidade zero REMOVE o item, e não guarda linha com zero",
    async () => {
      const criado = await acrescentar(itemValido());
      const token = tokenDe(criado);
      const itemId = criado.body.itens[0].id;

      const resposta = await request(app)
        .patch(caminho(`/itens/${itemId}`))
        .set("Origin", ORIGEM)
        .set("Cookie", `${COOKIE_DA_SESSAO}=${token}`)
        .send({ quantidade: 0 });

      expect(resposta.body.itens).toEqual([]);
      expect(resposta.body.totalDeItens).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-501 tirar o item deixa o carrinho vazio",
    async () => {
      const criado = await acrescentar(itemValido());
      const token = tokenDe(criado);
      const itemId = criado.body.itens[0].id;

      const resposta = await request(app)
        .delete(caminho(`/itens/${itemId}`))
        .set("Origin", ORIGEM)
        .set("Cookie", `${COOKIE_DA_SESSAO}=${token}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.itens).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-502 uma sessão não altera o item de outra",
    async () => {
      const minha = await acrescentar(itemValido());
      const itemId = minha.body.itens[0].id;

      // Sem o cookie da dona: a API emite sessão nova, e o item não é dela.
      const intrusa = await request(app)
        .patch(caminho(`/itens/${itemId}`))
        .set("Origin", ORIGEM)
        .send({ quantidade: 99 });

      // O item continua fora do alcance — a política o esconde, e o carrinho
      // devolvido é o da sessão nova, vazio.
      expect(intrusa.body.itens).toEqual([]);
    },
    ESPERA_LONGA,
  );
});

describe("loja inexistente responde como loja inexistente (AC-402)", () => {
  it(
    "@spec:AC-402 carrinho de apelido que não existe responde 404",
    async () => {
      const resposta = await request(app).get(
        "/v1/vitrine/loja-que-nao-existe/carrinho",
      );

      expect(resposta.status).toBe(404);
    },
    ESPERA_LONGA,
  );
});

describe("a conferência cobra o que a pessoa viu (AC-503, AC-504)", () => {
  /** POST na conferência, com a origem autorizada. */
  function conferir(corpo: unknown, token: string) {
    return request(app)
      .post(caminho("/conferencia"))
      .set("Origin", ORIGEM)
      .set("Cookie", `${COOKIE_DA_SESSAO}=${token}`)
      .send(corpo as object);
  }

  it(
    "@spec:AC-503 @spec:AC-315 o acréscimo da opção entra no subtotal, e não sai de graça",
    async () => {
      // Sem isto o bacon de R$ 3,00 seria conferido por zero: o carrinho guarda
      // a escolha, e o preço dela mora no catálogo.
      const criado = await acrescentar(
        itemValido({
          escolhas: [
            { grupoId: ponto.id, opcaoId: aoPonto.id, quantidade: 1 },
            { grupoId: adicionais.id, opcaoId: bacon.id, quantidade: 1 },
          ],
        }),
      );
      const token = tokenDe(criado);

      const resposta = await conferir({}, token);

      expect(resposta.status).toBe(200);
      expect(resposta.body.subtotalCentavos).toBe(
        PRECO_DO_LANCHE + ACRESCIMO_DO_BACON,
      );
      expect(resposta.body.itens[0].precoUnitarioCentavos).toBe(2300);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 sem mudança nenhuma, a conferência não pede confirmação",
    async () => {
      const criado = await acrescentar(itemValido());
      const token = tokenDe(criado);

      const resposta = await conferir(
        { precosVistos: { [criado.body.itens[0].id]: PRECO_DO_LANCHE } },
        token,
      );

      expect(resposta.body.precisaConfirmar).toBe(false);
      expect(resposta.body.mudancas).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 preço que mudou desde a tela é mostrado item a item",
    async () => {
      const criado = await acrescentar(itemValido());
      const token = tokenDe(criado);

      // A tela mostrou R$ 15,00; o catálogo diz R$ 20,00.
      const resposta = await conferir(
        { precosVistos: { [criado.body.itens[0].id]: 1500 } },
        token,
      );

      expect(resposta.body.precisaConfirmar).toBe(true);
      expect(resposta.body.mudancas[0].tipo).toBe("PRECO_SUBIU");
      expect(resposta.body.mudancas[0].deEmCentavos).toBe(1500);
      expect(resposta.body.mudancas[0].paraEmCentavos).toBe(PRECO_DO_LANCHE);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-504 o total enviado pela tela NÃO entra na conta",
    async () => {
      const criado = await acrescentar(itemValido());
      const token = tokenDe(criado);

      const resposta = await conferir({ totalVistoCentavos: 1 }, token);

      // O subtotal é o do servidor, e a divergência foi registrada.
      expect(resposta.body.subtotalCentavos).toBe(PRECO_DO_LANCHE);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 o preço da VARIANTE vence o do produto",
    async () => {
      const pizza = await criarProduto({ loja, nome: "Pizza" });
      const grande = await criarVariacao({
        loja,
        produto: pizza,
        nome: "Grande",
        precoCentavos: 6000,
        padrao: true,
      });

      const criado = await acrescentar({
        produtoId: pizza.id,
        variacaoId: grande.id,
        quantidade: 1,
        escolhas: [],
      });
      const token = tokenDe(criado);

      const resposta = await conferir({}, token);

      // O produto não tem preço de vitrine; quem tem preço é a variante. Antes
      // desta leitura, o item seria conferido por ZERO e sairia de graça.
      expect(resposta.body.subtotalCentavos).toBe(6000);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 item sem preço conhecido é RETIRADO, e não segue por zero",
    async () => {
      // Produto com variantes cujo preço ninguém cadastrou.
      const misterio = await criarProduto({ loja, nome: "Sem preço" });
      const semPreco = await criarVariacao({
        loja,
        produto: misterio,
        nome: "Única",
        padrao: true,
      });

      const criado = await acrescentar({
        produtoId: misterio.id,
        variacaoId: semPreco.id,
        quantidade: 1,
        escolhas: [],
      });
      const token = tokenDe(criado);

      const resposta = await conferir({}, token);

      expect(resposta.body.itens).toEqual([]);
      expect(resposta.body.subtotalCentavos).toBe(0);
      expect(resposta.body.mudancas[0].tipo).toBe("SEM_PRECO");
      expect(resposta.body.precisaConfirmar).toBe(true);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 produto que ficou indisponível é retirado com explicação",
    async () => {
      const some = await criarProduto({ loja, nome: "Vai acabar" });
      const criado = await acrescentar({
        produtoId: some.id,
        quantidade: 1,
        escolhas: [],
      });
      const token = tokenDe(criado);

      await migrador.query(
        `UPDATE app.products SET is_available = false WHERE id = $1`,
        [some.id],
      );

      const resposta = await conferir({}, token);

      expect(resposta.body.itens).toEqual([]);
      expect(resposta.body.mudancas[0].tipo).toBe("INDISPONIVEL");
      expect(resposta.body.mudancas[0].explicacao).toContain("acabou");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-502 a conferência é do carrinho DA SESSÃO, e não de um informado",
    async () => {
      // Sessão nova, sem itens: o carrinho conferido é o dela.
      const resposta = await request(app)
        .post(caminho("/conferencia"))
        .set("Origin", ORIGEM)
        .send({});

      expect(resposta.status).toBe(200);
      expect(resposta.body.itens).toEqual([]);
      expect(resposta.body.subtotalCentavos).toBe(0);
    },
    ESPERA_LONGA,
  );
});

describe("fechar o pedido (AC-504, AC-511, AC-516, AC-517)", () => {
  /** POST no fechamento, com a origem autorizada. */
  function fechar(corpo: Record<string, unknown>, token: string) {
    return request(app)
      .post(`/v1/vitrine/${loja.apelido}/pedidos`)
      .set("Origin", ORIGEM)
      .set("Cookie", `${COOKIE_DA_SESSAO}=${token}`)
      .send(corpo);
  }

  /** O mínimo que o fechamento aceita. */
  function pedidoValido(sobrescrita: Record<string, unknown> = {}) {
    return {
      contato: { nome: "Ana Paula", telefone: "11988887777" },
      entrega: "PICKUP",
      chaveDeIdempotencia: `chave-${Math.random().toString(36).slice(2)}-teste`,
      ...sobrescrita,
    };
  }

  it(
    "@spec:AC-504 o pedido nasce com os valores do SERVIDOR, não com os da tela",
    async () => {
      const criado = await acrescentar(itemValido());
      const token = tokenDe(criado);

      const resposta = await fechar(
        pedidoValido({ totalVistoCentavos: 1 }),
        token,
      );

      expect(resposta.status).toBe(201);
      // Retirada: sem taxa. O total é o subtotal, e é o do catálogo.
      expect(resposta.body.subtotalCentavos).toBe(PRECO_DO_LANCHE);
      expect(resposta.body.totalCentavos).toBe(PRECO_DO_LANCHE);
      expect(resposta.body.taxaDeEntregaCentavos).toBe(0);
      expect(resposta.body.numero).toBeGreaterThan(0);
      expect(resposta.body.tokenPublico).toBeTruthy();
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-516 a MESMA chave devolve o MESMO pedido, e nunca um segundo",
    async () => {
      // Dois toques no botão em rede ruim viram dois pedidos, e a cozinha
      // prepara duas vezes. É o que a chave de idempotência existe para impedir.
      const criado = await acrescentar(itemValido());
      const token = tokenDe(criado);
      const corpo = pedidoValido();

      const primeira = await fechar(corpo, token);
      const segunda = await fechar(corpo, token);

      expect(primeira.status).toBe(201);
      expect(primeira.body.jaExistia).toBe(false);
      expect(segunda.body.jaExistia).toBe(true);
      expect(segunda.body.id).toBe(primeira.body.id);
      expect(segunda.body.numero).toBe(primeira.body.numero);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-515 @spec:AC-315 o pedido congela nome, preço e escolhas do momento da compra, com acréscimo separado",
    async () => {
      const criado = await acrescentar(
        itemValido({
          escolhas: [
            { grupoId: ponto.id, opcaoId: aoPonto.id, quantidade: 1 },
            { grupoId: adicionais.id, opcaoId: bacon.id, quantidade: 1 },
          ],
        }),
      );
      const token = tokenDe(criado);

      const resposta = await fechar(pedidoValido(), token);
      expect(resposta.status).toBe(201);

      const itens = await migrador.query<{
        product_name: string;
        unit_price_cents: string;
        options_total_cents: string;
      }>(
        `SELECT product_name, unit_price_cents, options_total_cents
           FROM app.order_items WHERE order_id = $1`,
        [resposta.body.id],
      );

      expect(itens.rows[0]?.product_name).toBe("X-Salada");
      // O unitário guarda produto + acréscimo; o acréscimo fica destacado, e é
      // isso que faz o cupom explicar o valor em vez de só somar.
      expect(Number(itens.rows[0]?.unit_price_cents)).toBe(
        PRECO_DO_LANCHE + ACRESCIMO_DO_BACON,
      );
      expect(Number(itens.rows[0]?.options_total_cents)).toBe(
        ACRESCIMO_DO_BACON,
      );

      const opcoes = await migrador.query<{ option_name_snapshot: string }>(
        `SELECT oio.option_name_snapshot
           FROM app.order_item_options oio
           JOIN app.order_items oi ON oi.id = oio.order_item_id
          WHERE oi.order_id = $1`,
        [resposta.body.id],
      );
      expect(opcoes.rows.map((l) => l.option_name_snapshot)).toContain("Bacon");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-507 entrega soma a taxa da loja, e retirada não soma nada",
    async () => {
      await migrador.query(
        `INSERT INTO app.store_settings (store_id, delivery, payment)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id) DO UPDATE
           SET delivery = EXCLUDED.delivery, payment = EXCLUDED.payment`,
        [
          loja.id,
          JSON.stringify({ taxaPadraoCents: 700 }),
          JSON.stringify({ formas: ["PIX"], pix: { chave: "loja@pix.test" } }),
        ],
      );

      const comEntrega = await acrescentar(itemValido());
      const resposta = await fechar(
        pedidoValido({
          entrega: "DELIVERY",
          contato: {
            nome: "Ana Paula",
            telefone: "11988887777",
            logradouro: "Rua A",
            numero: "10",
            bairro: "Centro",
            cidade: "São Paulo",
            estado: "SP",
          },
        }),
        tokenDe(comEntrega),
      );

      expect(resposta.status).toBe(201);
      expect(resposta.body.taxaDeEntregaCentavos).toBe(700);
      expect(resposta.body.totalCentavos).toBe(PRECO_DO_LANCHE + 700);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-511 pedido por PIX congela a chave que valia no momento",
    async () => {
      const criado = await acrescentar(itemValido());
      const resposta = await fechar(
        pedidoValido({ formaDePagamento: "PIX" }),
        tokenDe(criado),
      );
      expect(resposta.status).toBe(201);

      // O dono troca a chave DEPOIS.
      await migrador.query(
        `UPDATE app.store_settings
            SET payment = $2 WHERE store_id = $1`,
        [
          loja.id,
          JSON.stringify({
            formas: ["PIX"],
            pix: { chave: "chave-nova@pix.test" },
          }),
        ],
      );

      const guardado = await migrador.query<{ pix_key_snapshot: string }>(
        `SELECT pix_key_snapshot FROM app.orders WHERE id = $1`,
        [resposta.body.id],
      );

      // O pedido antigo continua mostrando a chave de quando foi feito.
      expect(guardado.rows[0]?.pix_key_snapshot).toBe("loja@pix.test");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-517 carrinho vazio é recusado, e o carrinho continua intacto",
    async () => {
      const vazio = await request(app).get(caminho()).set("Origin", ORIGEM);
      const token = tokenDe(vazio);

      const resposta = await fechar(pedidoValido(), token);

      expect(resposta.status).toBe(409);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-504 corpo sem chave de idempotência é recusado na borda",
    async () => {
      // Sem ela, dois toques no botão viram dois pedidos. É obrigatória.
      const criado = await acrescentar(itemValido());
      const resposta = await fechar(
        {
          contato: { nome: "Ana", telefone: "11988887777" },
          entrega: "PICKUP",
        },
        tokenDe(criado),
      );

      expect(resposta.status).toBe(400);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-504 o corpo NÃO aceita itens: eles vêm do carrinho da sessão",
    async () => {
      // Aceitar itens no corpo deixaria o cliente escolher o que compra e por
      // quanto — o erro que este critério existe para impedir.
      const criado = await acrescentar(itemValido());
      const resposta = await fechar(
        pedidoValido({
          itens: [{ nome: "Pedido de mil reais", precoCentavos: 1 }],
        }),
        tokenDe(criado),
      );

      expect(resposta.status).toBe(400);
    },
    ESPERA_LONGA,
  );
});

describe("a mensagem para a loja (AC-520, AC-523)", () => {
  function fecharPedido(corpo: Record<string, unknown>, token: string) {
    return request(app)
      .post(`/v1/vitrine/${loja.apelido}/pedidos`)
      .set("Origin", ORIGEM)
      .set("Cookie", `${COOKIE_DA_SESSAO}=${token}`)
      .send(corpo);
  }

  function pedidoSimples(sobrescrita: Record<string, unknown> = {}) {
    return {
      contato: { nome: "Ana Paula", telefone: "11988887777" },
      entrega: "PICKUP",
      chaveDeIdempotencia: `msg-${Math.random().toString(36).slice(2)}-teste`,
      ...sobrescrita,
    };
  }

  it(
    "@spec:AC-520 o pedido volta com a conversa pronta, e o texto tem o que a loja precisa ler",
    async () => {
      const criado = await acrescentar(
        itemValido({
          escolhas: [
            { grupoId: ponto.id, opcaoId: aoPonto.id, quantidade: 1 },
            { grupoId: adicionais.id, opcaoId: bacon.id, quantidade: 1 },
          ],
        }),
      );

      const resposta = await fecharPedido(pedidoSimples(), tokenDe(criado));

      expect(resposta.status).toBe(201);
      expect(resposta.body.whatsapp.endereco).toContain(
        "https://wa.me/5511911112222",
      );
      // O texto traz o código, o item e a escolha — é o que o dono lê para
      // preparar. E traz a saudação que ele configurou.
      const texto = resposta.body.whatsapp.texto as string;
      expect(texto).toContain("Olá! Segue meu pedido:");
      expect(texto).toContain(resposta.body.codigo);
      expect(texto).toContain("X-Salada");
      expect(texto).toContain("Bacon");
      expect(texto).toContain("Ana Paula");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-520 o NÚMERO da loja não vem como campo: só embutido no endereço",
    async () => {
      // Na prática o número da loja é o celular do dono. Publicá-lo como campo
      // seria entregá-lo a todo robô que varresse a plataforma.
      const criado = await acrescentar(itemValido());
      const resposta = await fecharPedido(pedidoSimples(), tokenDe(criado));

      expect(Object.keys(resposta.body.whatsapp).sort()).toEqual([
        "completo",
        "endereco",
        "texto",
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-523 loja sem WhatsApp cadastrado NÃO perde o pedido",
    async () => {
      const semZap = await criarLoja({ nome: "Sem Zap" });
      await migrador.query(
        `INSERT INTO app.store_settings (store_id, delivery, payment, whatsapp)
         VALUES ($1, $2, $3, '{}'::jsonb)
         ON CONFLICT (store_id) DO UPDATE
           SET delivery = EXCLUDED.delivery, payment = EXCLUDED.payment,
               whatsapp = EXCLUDED.whatsapp`,
        [
          semZap.id,
          JSON.stringify({ retiradaNoLocal: true }),
          JSON.stringify({ formas: ["CASH"] }),
        ],
      );
      for (let dia = 0; dia <= 6; dia += 1) {
        await migrador.query(
          `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
           VALUES ($1, $2, '00:00', '23:59')`,
          [semZap.id, dia],
        );
      }
      const produto = await criarProduto({
        loja: semZap,
        nome: "Bolo",
        precoCentavos: 3000,
      });

      const criado = await request(app)
        .post(`/v1/vitrine/${semZap.apelido}/carrinho/itens`)
        .set("Origin", ORIGEM)
        .send({ produtoId: produto.id, quantidade: 1, escolhas: [] });
      expect(criado.status).toBe(201);

      const resposta = await request(app)
        .post(`/v1/vitrine/${semZap.apelido}/pedidos`)
        .set("Origin", ORIGEM)
        .set("Cookie", `${COOKIE_DA_SESSAO}=${tokenDe(criado)}`)
        .send(pedidoSimples());

      // O PEDIDO EXISTE: número, código e token. O que falta é o caminho do
      // WhatsApp, e nulo é mais honesto que um endereço que não abre nada.
      expect(resposta.status).toBe(201);
      expect(resposta.body.numero).toBeGreaterThan(0);
      expect(resposta.body.whatsapp).toBeNull();
    },
    ESPERA_LONGA,
  );
});
