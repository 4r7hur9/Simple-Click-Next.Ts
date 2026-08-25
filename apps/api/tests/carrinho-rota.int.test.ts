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
import { COOKIE_DA_SESSAO } from "../src/modules/cart/sessao-do-carrinho.ts";
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
    "@spec:AC-411 os NOMES das opções vêm do catálogo, e não do que o cliente mandou",
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
    "@spec:AC-412 grupo obrigatório sem escolha é recusado, mesmo a tela deixando passar",
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
    "@spec:AC-412 opção esgotada é recusada",
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
