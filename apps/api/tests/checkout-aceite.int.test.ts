/**
 * Critérios de aceite do checkout, contra PostgreSQL de verdade
 * (Estruturação 3; AC-503, AC-504, AC-516, AC-524, AC-502).
 *
 * O que já existia está registrado em docs/estruturacao/03-testes-checkout.md.
 * Este arquivo cobre só as lacunas, pela API inteira (supertest → rota →
 * conferência → caso de uso → banco) e afirma NO BANCO, e não pelo que a
 * resposta diz:
 *
 *  - preço que subiu entre a tela e o fechamento: 409 `preco_divergente`, sem
 *    pedido e sem gastar número; com o subtotal novo e a mesma chave, UM pedido;
 *  - produto esgotado depois de entrar no carrinho: sai da soma e do pedido;
 *  - duas confirmações simultâneas do mesmo carrinho: no máximo uma compra;
 *  - duas lojas, duas sessões: uma não converte o carrinho nem lê o pedido
 *    da outra.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  autorizacaoDoComprador,
  comoPortador,
  tokenDeAcesso,
} from "./apoio-de-pedidos.ts";
import { criarApp } from "../src/app.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

const ORIGEM = "https://app.exemplo.test";
const PRECO_ANTIGO = 2000;
const PRECO_NOVO = 2500;
const PRECO_REFRIGERANTE = 600;

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof criarApp>;
let lojaA: LojaDeTeste;
let lojaB: LojaDeTeste;
let marmitaA: ProdutoDeTeste;
let marmitaB: ProdutoDeTeste;

/** Loja que pode vender: retirada aceita, aberta o dia todo (como nas outras provas). */
async function habilitarVenda(loja: LojaDeTeste): Promise<void> {
  await migrador.query(
    `INSERT INTO app.store_settings (store_id, delivery, payment, whatsapp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id) DO UPDATE
       SET delivery = EXCLUDED.delivery, payment = EXCLUDED.payment,
           whatsapp = EXCLUDED.whatsapp`,
    [
      loja.id,
      JSON.stringify({ taxaPadraoCents: 700, retiradaNoLocal: true }),
      JSON.stringify({ formas: ["PIX", "CASH"] }),
      JSON.stringify({ numero: "+5511911112222" }),
    ],
  );
  for (let dia = 0; dia <= 6; dia += 1) {
    await migrador.query(
      `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '00:00', '23:59')`,
      [loja.id, dia],
    );
  }
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 8 });
  app = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
  });

  lojaA = await criarLoja({ nome: "Marmitaria Aceite A" });
  lojaB = await criarLoja({ nome: "Marmitaria Aceite B" });
  marmitaA = await criarProduto({
    loja: lojaA,
    nome: "Marmita executiva",
    precoCentavos: PRECO_ANTIGO,
  });
  marmitaB = await criarProduto({
    loja: lojaB,
    nome: "Marmita da B",
    precoCentavos: PRECO_ANTIGO,
  });
  await habilitarVenda(lojaA);
  await habilitarVenda(lojaB);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

// ── apoio ──────────────────────────────────────────────────────────────────

function sessaoDe(resposta: request.Response): string {
  const cabecalho = resposta.headers["set-cookie"];
  const cookies = Array.isArray(cabecalho) ? cabecalho : [cabecalho ?? ""];
  const nosso = cookies.find((c) => c.startsWith(`${COOKIE_DA_SESSAO}=`));
  const valor = nosso?.split(";")[0]?.split("=")[1];
  if (valor === undefined || valor === "") {
    throw new Error("a API não emitiu o cookie da sessão do carrinho");
  }
  return valor;
}

/** Carrinho novo numa loja, com os itens pedidos; devolve a sessão dele. */
async function carrinhoCom(
  loja: LojaDeTeste,
  itens: readonly { produto: ProdutoDeTeste; quantidade: number }[],
): Promise<string> {
  let sessao: string | undefined;
  for (const { produto, quantidade } of itens) {
    const pedido = request(app)
      .post(`/v1/vitrine/${loja.apelido}/carrinho/itens`)
      .set("Origin", ORIGEM);
    const resposta = await (
      sessao === undefined
        ? pedido
        : pedido.set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`)
    ).send({ produtoId: produto.id, quantidade, escolhas: [] });
    expect(resposta.status).toBe(201);
    sessao ??= sessaoDe(resposta);
  }
  if (sessao === undefined) throw new Error("carrinho sem itens");
  return sessao;
}

function conferir(loja: LojaDeTeste, sessao: string, corpo: object = {}) {
  return request(app)
    .post(`/v1/vitrine/${loja.apelido}/carrinho/conferencia`)
    .set("Origin", ORIGEM)
    .set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`)
    .send(corpo);
}

async function fechar(
  loja: LojaDeTeste,
  sessao: string,
  chave: string,
  opcoes: {
    readonly extra?: Record<string, unknown>;
    readonly autorizacao?: string;
  } = {},
) {
  return request(app)
    .post(`/v1/vitrine/${loja.apelido}/pedidos`)
    .set("Origin", ORIGEM)
    .set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`)
    .set(
      "Authorization",
      opcoes.autorizacao ?? (await autorizacaoDoComprador()),
    )
    .send({
      contato: { nome: "Ana Paula", telefone: "11988887777" },
      entrega: "PICKUP",
      chaveDeIdempotencia: chave,
      ...opcoes.extra,
    });
}

function novaChave(rotulo: string): string {
  return `chave-${Math.random().toString(36).slice(2)}-${rotulo}`;
}

/** Quantos pedidos a loja tem, contados pelo migrador. */
async function pedidosDa(loja: LojaDeTeste): Promise<number> {
  const linhas = await migrador.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM app.orders WHERE store_id = $1`,
    [loja.id],
  );
  return Number(linhas.rows[0]?.n ?? 0);
}

/** O último número de pedido gasto pela loja (0 se nunca gastou). */
async function ultimoNumeroDa(loja: LojaDeTeste): Promise<number> {
  const linhas = await migrador.query<{ v: string }>(
    `SELECT last_value::text AS v FROM app.store_sequences
      WHERE store_id = $1 AND kind = 'order'`,
    [loja.id],
  );
  return Number(linhas.rows[0]?.v ?? 0);
}

async function carrinhoConvertido(
  loja: LojaDeTeste,
  sessao: string,
): Promise<boolean[]> {
  const linhas = await migrador.query<{ convertido: boolean }>(
    `SELECT converted_at IS NOT NULL AS convertido
       FROM app.carts WHERE store_id = $1 AND session_token = $2`,
    [loja.id, sessao],
  );
  return linhas.rows.map((l) => l.convertido);
}

// ── preço alterado ─────────────────────────────────────────────────────────

describe("preço alterado entre a tela e o fechamento (AC-503, AC-504)", () => {
  it(
    "@spec:AC-503 @spec:AC-504 duas marmitas de R$ 20 viram R$ 25: a conferência avisa, exige confirmação e a conta é de 5.000 centavos",
    async () => {
      const sessao = await carrinhoCom(lojaA, [
        { produto: marmitaA, quantidade: 2 },
      ]);
      const carrinho = await request(app)
        .get(`/v1/vitrine/${lojaA.apelido}/carrinho`)
        .set("Origin", ORIGEM)
        .set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`);
      const itemId = carrinho.body.itens[0].id as string;

      // O dono reajusta DEPOIS de a pessoa ter visto R$ 20,00 na tela.
      await migrador.query(
        `UPDATE app.products
            SET display_price_cents = $2, price_min_cents = $2, price_max_cents = $2
          WHERE id = $1`,
        [marmitaA.id, PRECO_NOVO],
      );
      try {
        const resposta = await conferir(lojaA, sessao, {
          precosVistos: { [itemId]: PRECO_ANTIGO },
        });

        expect(resposta.status).toBe(200);
        expect(resposta.body.precisaConfirmar).toBe(true);
        expect(resposta.body.mudancas).toHaveLength(1);
        expect(resposta.body.mudancas[0].tipo).toBe("PRECO_SUBIU");
        expect(resposta.body.mudancas[0].deEmCentavos).toBe(PRECO_ANTIGO);
        expect(resposta.body.mudancas[0].paraEmCentavos).toBe(PRECO_NOVO);
        expect(resposta.body.mudancas[0].explicacao).toContain("R$ 20,00");
        expect(resposta.body.mudancas[0].explicacao).toContain("R$ 25,00");
        expect(resposta.body.subtotalCentavos).toBe(5000);
      } finally {
        await migrador.query(
          `UPDATE app.products
              SET display_price_cents = $2, price_min_cents = $2, price_max_cents = $2
            WHERE id = $1`,
          [marmitaA.id, PRECO_ANTIGO],
        );
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 @spec:AC-516 fechar com o subtotal VELHO é 409 preco_divergente, não grava pedido nem gasta número; com o subtotal novo e a mesma chave nasce UM pedido de 5.000",
    async () => {
      const loja = await criarLoja({ nome: "Marmitaria do Reajuste" });
      await habilitarVenda(loja);
      const marmita = await criarProduto({
        loja,
        nome: "Marmita executiva",
        precoCentavos: PRECO_ANTIGO,
      });
      const sessao = await carrinhoCom(loja, [
        { produto: marmita, quantidade: 2 },
      ]);
      const chave = novaChave("reajuste");

      await migrador.query(
        `UPDATE app.products
            SET display_price_cents = $2, price_min_cents = $2, price_max_cents = $2
          WHERE id = $1`,
        [marmita.id, PRECO_NOVO],
      );

      const pedidosAntes = await pedidosDa(loja);
      const numeroAntes = await ultimoNumeroDa(loja);

      // A tela ainda mostrava 2 × R$ 20,00 = R$ 40,00.
      const recusado = await fechar(loja, sessao, chave, {
        extra: { subtotalVistoCentavos: 4000 },
      });
      // O motivo (`preco_divergente`) vai para o log, e não para o corpo: a
      // tela vê só `conflito` e confere o carrinho de novo. Que a causa é o
      // preço fica provado logo abaixo — o MESMO pedido, com o subtotal novo,
      // passa.
      expect(recusado.status).toBe(409);
      expect(recusado.body.erro.codigo).toBe("conflito");

      // Afirmado no banco: nada nasceu, nenhum número foi gasto e o carrinho
      // continua aberto para a pessoa conferir de novo.
      expect(await pedidosDa(loja)).toBe(pedidosAntes);
      expect(await ultimoNumeroDa(loja)).toBe(numeroAntes);
      expect(await carrinhoConvertido(loja, sessao)).toEqual([false]);

      // Ela confirma o valor novo (2 × R$ 25,00) e reenvia com a MESMA chave.
      const aceito = await fechar(loja, sessao, chave, {
        extra: { subtotalVistoCentavos: 5000 },
      });
      expect(aceito.status).toBe(201);
      expect(aceito.body.subtotalCentavos).toBe(5000);
      expect(aceito.body.totalCentavos).toBe(5000);
      expect(await pedidosDa(loja)).toBe(pedidosAntes + 1);
      expect(await ultimoNumeroDa(loja)).toBe(numeroAntes + 1);

      // E um terceiro envio da mesma chave (resposta perdida) não cria outro.
      const repetido = await fechar(loja, sessao, chave, {
        extra: { subtotalVistoCentavos: 5000 },
      });
      expect(repetido.status).toBe(200);
      expect(repetido.body.jaExistia).toBe(true);
      expect(repetido.body.id).toBe(aceito.body.id);
      expect(await pedidosDa(loja)).toBe(pedidosAntes + 1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-504 subtotal visto que bate com o do servidor não é recusado",
    async () => {
      const sessao = await carrinhoCom(lojaA, [
        { produto: marmitaA, quantidade: 2 },
      ]);

      const resposta = await fechar(lojaA, sessao, novaChave("bate"), {
        extra: { subtotalVistoCentavos: 4000 },
      });

      expect(resposta.status).toBe(201);
      expect(resposta.body.subtotalCentavos).toBe(4000);
    },
    ESPERA_LONGA,
  );
});

// ── produto indisponível ───────────────────────────────────────────────────

describe("produto que esgotou depois de entrar no carrinho (AC-503)", () => {
  it(
    "@spec:AC-503 o esgotado sai da soma, a conferência diz o motivo e o pedido nasce só com o que sobrou",
    async () => {
      const loja = await criarLoja({ nome: "Marmitaria do Esgotado" });
      await habilitarVenda(loja);
      const marmita = await criarProduto({
        loja,
        nome: "Marmita executiva",
        precoCentavos: PRECO_ANTIGO,
      });
      const refri = await criarProduto({
        loja,
        nome: "Refrigerante lata",
        precoCentavos: PRECO_REFRIGERANTE,
      });
      const sessao = await carrinhoCom(loja, [
        { produto: marmita, quantidade: 2 },
        { produto: refri, quantidade: 1 },
      ]);

      // Esgota DEPOIS de a pessoa ter posto no carrinho.
      await migrador.query(
        `UPDATE app.products SET is_available = false WHERE id = $1`,
        [refri.id],
      );

      const conferencia = await conferir(loja, sessao);
      expect(conferencia.status).toBe(200);
      expect(conferencia.body.precisaConfirmar).toBe(true);
      expect(conferencia.body.mudancas[0].tipo).toBe("INDISPONIVEL");
      expect(conferencia.body.mudancas[0].explicacao).toContain(
        "Refrigerante lata",
      );
      expect(conferencia.body.itens).toHaveLength(1);
      expect(conferencia.body.subtotalCentavos).toBe(4000);

      const pedido = await fechar(loja, sessao, novaChave("esgotado"));
      expect(pedido.status).toBe(201);
      expect(pedido.body.subtotalCentavos).toBe(4000);
      expect(pedido.body.totalCentavos).toBe(4000);

      // No banco: o pedido tem uma linha só, a da marmita.
      const linhas = await migrador.query<{ nome: string; total: number }>(
        `SELECT product_name AS nome, line_total_cents AS total
           FROM app.order_items WHERE order_id = $1`,
        [pedido.body.id],
      );
      expect(linhas.rows).toHaveLength(1);
      expect(linhas.rows[0]?.nome).toBe("Marmita executiva");
      expect(Number(linhas.rows[0]?.total)).toBe(4000);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 quando tudo no carrinho esgotou, o fechamento é recusado e nenhum pedido nasce",
    async () => {
      const loja = await criarLoja({ nome: "Marmitaria Tudo Esgotado" });
      await habilitarVenda(loja);
      const unico = await criarProduto({ loja, nome: "Último prato" });
      const sessao = await carrinhoCom(loja, [
        { produto: unico, quantidade: 1 },
      ]);
      await migrador.query(
        `UPDATE app.products SET is_available = false WHERE id = $1`,
        [unico.id],
      );
      const antes = await pedidosDa(loja);
      const numeroAntes = await ultimoNumeroDa(loja);

      const resposta = await fechar(loja, sessao, novaChave("tudo-esgotado"));

      expect(resposta.status).toBe(409);
      expect(await pedidosDa(loja)).toBe(antes);
      expect(await ultimoNumeroDa(loja)).toBe(numeroAntes);
    },
    ESPERA_LONGA,
  );
});

// ── concorrência ───────────────────────────────────────────────────────────

describe("duas confirmações ao mesmo tempo no mesmo carrinho (AC-516, AC-524)", () => {
  it(
    "@spec:AC-524 duas confirmações com chaves DIFERENTES: no máximo uma compra efetiva, e o banco tem um pedido e um carrinho convertido",
    async () => {
      const loja = await criarLoja({ nome: "Marmitaria da Corrida" });
      await habilitarVenda(loja);
      const marmita = await criarProduto({ loja, nome: "Marmita da corrida" });
      const sessao = await carrinhoCom(loja, [
        { produto: marmita, quantidade: 1 },
      ]);
      const antes = await pedidosDa(loja);

      const [a, b] = await Promise.all([
        fechar(loja, sessao, novaChave("corrida-a")),
        fechar(loja, sessao, novaChave("corrida-b")),
      ]);

      // Nenhuma das duas pode ser erro de servidor; a vencedora é 201.
      const status = [a.status, b.status].sort((x, y) => x - y);
      expect(status.some((s) => s >= 500)).toBe(false);
      expect(status.filter((s) => s === 201)).toHaveLength(1);

      // A prova é no banco: UM pedido, e o carrinho está convertido.
      expect(await pedidosDa(loja)).toBe(antes + 1);
      expect(await carrinhoConvertido(loja, sessao)).toEqual([true]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-516 duas confirmações com a MESMA chave ao mesmo tempo: o banco guarda UM pedido, e toda resposta de sucesso aponta para ele",
    async () => {
      const loja = await criarLoja({ nome: "Marmitaria do Toque Duplo" });
      await habilitarVenda(loja);
      const marmita = await criarProduto({ loja, nome: "Marmita do toque" });
      const sessao = await carrinhoCom(loja, [
        { produto: marmita, quantidade: 1 },
      ]);
      const chave = novaChave("toque-duplo");
      const antes = await pedidosDa(loja);

      const [a, b] = await Promise.all([
        fechar(loja, sessao, chave),
        fechar(loja, sessao, chave),
      ]);

      // O que o índice único garante, e que vale com ou sem o defeito abaixo.
      expect(await pedidosDa(loja)).toBe(antes + 1);
      const ids = [a, b]
        .filter((r) => r.status === 200 || r.status === 201)
        .map((r) => r.body.id as string);
      expect(ids.length).toBeGreaterThanOrEqual(1);
      expect(new Set(ids).size).toBe(1);
    },
    ESPERA_LONGA,
  );

  // A perdedora da corrida bate em `orders_idempotency_uk`; o caso de uso
  // desfaz até o savepoint (devolvendo o número) e devolve o pedido da chave.
  it(
    "@spec:AC-516 a segunda confirmação simultânea com a mesma chave recebe o mesmo pedido (200, jaExistia), e não 500",
    async () => {
      const loja = await criarLoja({ nome: "Marmitaria do Toque Duplo 2" });
      await habilitarVenda(loja);
      const marmita = await criarProduto({ loja, nome: "Marmita do toque" });
      const sessao = await carrinhoCom(loja, [
        { produto: marmita, quantidade: 1 },
      ]);
      const chave = novaChave("toque-duplo-5xx");
      const antes = await pedidosDa(loja);
      const numeroAntes = await ultimoNumeroDa(loja);

      const [a, b] = await Promise.all([
        fechar(loja, sessao, chave),
        fechar(loja, sessao, chave),
      ]);

      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 201]);
      expect(a.body.id).toBe(b.body.id);
      const repetida = a.status === 200 ? a : b;
      expect(repetida.body.jaExistia).toBe(true);
      // Um pedido só e um número só: o da perdedora foi devolvido.
      expect(await pedidosDa(loja)).toBe(antes + 1);
      expect(await ultimoNumeroDa(loja)).toBe(numeroAntes + 1);
    },
    ESPERA_LONGA,
  );
});

// ── isolamento entre lojas e sessões ───────────────────────────────────────

describe("duas lojas, duas sessões: uma não toca na outra (AC-502, AC-524)", () => {
  it(
    "@spec:AC-502 a sessão da loja A não fecha carrinho na loja B, e o carrinho de A fica intacto",
    async () => {
      const sessaoA = await carrinhoCom(lojaA, [
        { produto: marmitaA, quantidade: 1 },
      ]);
      const antesB = await pedidosDa(lojaB);

      // O cookie de A apontado para a loja B: B não tem carrinho dessa sessão.
      const cruzado = await fechar(lojaB, sessaoA, novaChave("cruzado"));

      expect(cruzado.status).toBe(409);
      expect(await pedidosDa(lojaB)).toBe(antesB);
      expect(await carrinhoConvertido(lojaA, sessaoA)).toEqual([false]);
      // Olhar o carrinho em B cria, no máximo, um carrinho VAZIO e não
      // convertido: nunca o carrinho de A.
      expect(await carrinhoConvertido(lojaB, sessaoA)).not.toContain(true);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-502 @spec:AC-524 fechar o carrinho de A não converte o de B, e cada loja conta só os seus pedidos",
    async () => {
      const sessaoA = await carrinhoCom(lojaA, [
        { produto: marmitaA, quantidade: 1 },
      ]);
      const sessaoB = await carrinhoCom(lojaB, [
        { produto: marmitaB, quantidade: 1 },
      ]);
      const antesA = await pedidosDa(lojaA);
      const antesB = await pedidosDa(lojaB);

      const pedidoA = await fechar(lojaA, sessaoA, novaChave("so-a"));
      expect(pedidoA.status).toBe(201);

      expect(await carrinhoConvertido(lojaA, sessaoA)).toEqual([true]);
      expect(await carrinhoConvertido(lojaB, sessaoB)).toEqual([false]);
      expect(await pedidosDa(lojaA)).toBe(antesA + 1);
      expect(await pedidosDa(lojaB)).toBe(antesB);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-502 o pedido de A não é lido pela loja B, nem por outra pessoa com o endereço errado",
    async () => {
      const sessaoA = await carrinhoCom(lojaA, [
        { produto: marmitaA, quantidade: 1 },
      ]);
      const pedidoA = await fechar(lojaA, sessaoA, novaChave("leitura"));
      expect(pedidoA.status).toBe(201);
      const token = pedidoA.body.tokenPublico as string;

      // Na própria loja, o link abre.
      const proprio = await request(app).get(
        `/v1/vitrine/${lojaA.apelido}/pedido/${token}`,
      );
      expect(proprio.status).toBe(200);

      // Na loja B, o mesmo link não acha nada.
      const naOutraLoja = await request(app).get(
        `/v1/vitrine/${lojaB.apelido}/pedido/${token}`,
      );
      expect(naOutraLoja.status).toBe(404);
      expect(JSON.stringify(naOutraLoja.body)).not.toContain(
        pedidoA.body.codigo as string,
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-516 a chave de A usada na loja B, por outra pessoa, não devolve o pedido de A",
    async () => {
      const sessaoA = await carrinhoCom(lojaA, [
        { produto: marmitaA, quantidade: 1 },
      ]);
      const chave = novaChave("chave-alheia");
      const pedidoA = await fechar(lojaA, sessaoA, chave);
      expect(pedidoA.status).toBe(201);

      const outraPessoa = await criarIdentidade({ nome: "Bruno Alves" });
      const autorizacaoDeBruno = comoPortador(
        tokenDeAcesso(outraPessoa.id, "CUSTOMER"),
      );
      const sessaoB = await carrinhoCom(lojaB, [
        { produto: marmitaB, quantidade: 1 },
      ]);
      const antesB = await pedidosDa(lojaB);

      const emB = await fechar(lojaB, sessaoB, chave, {
        autorizacao: autorizacaoDeBruno,
      });

      expect(emB.status).toBe(201);
      expect(emB.body.id).not.toBe(pedidoA.body.id);
      expect(emB.body.jaExistia).toBe(false);
      expect(await pedidosDa(lojaB)).toBe(antesB + 1);
    },
    ESPERA_LONGA,
  );
});
