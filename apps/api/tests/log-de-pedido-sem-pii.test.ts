/**
 * Nenhum log de uma compra expõe telefone, nome, endereço ou token
 * (Estruturação 6, "Segurança e ambientes"; LGPD, AC-021/AC-022).
 *
 * Compra INTEIRA pela API (carrinho → conferência → fechamento → replay com a
 * mesma chave → acompanhamento por token → fechamento recusado) com um
 * registrador de verdade (`criarRegistrador`, pino JSON) ligado a um destino
 * em memória. Os dados da compra são sentinelas fictícias e únicas; o teste
 * afirma que NENHUMA linha de log contém qualquer uma delas, e que todas as
 * linhas da mesma requisição carregam o mesmo `requisicaoId` (o que permite
 * montar a linha do tempo documentada em docs/estruturacao/06-operacao.md).
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { autorizacaoDoComprador } from "./apoio-de-pedidos.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarRegistrador, definirRegistrador } from "../src/core/log.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";

const ORIGEM = "https://app.exemplo.test";

// Sentinelas fictícias: únicas, fáceis de procurar, sem valor real.
const NOME = "Zenaide Sentinela Fictícia";
const TELEFONE_DIGITOS = "11955550199";
const TELEFONE_E164 = "+5511955550199";
const CHAVE = "chave-sentinela-0123456789abcdef";
const REQUISICAO_DO_CLIENTE = "req-cliente-sentinela-01";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof criarApp>;
let loja: LojaDeTeste;
let produto: ProdutoDeTeste;
const linhasBrutas: string[] = [];

const destino = {
  write(trecho: string): void {
    for (const linha of trecho.split("\n")) {
      if (linha.trim() !== "") linhasBrutas.push(linha);
    }
  },
};

function linhas(): Record<string, unknown>[] {
  return linhasBrutas.map((l) => JSON.parse(l) as Record<string, unknown>);
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
  });
  loja = await criarLoja({ nome: "Loja do Teste de Log" });
  produto = await criarProduto({
    loja,
    nome: "Marmita de log",
    precoCentavos: 2000,
  });
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
  definirRegistrador(criarRegistrador({ nivel: "debug", destino }));
}, ESPERA_LONGA);

afterAll(async () => {
  definirRegistrador(undefined);
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

describe("log de uma compra (Estruturação 6)", () => {
  it(
    "nenhuma linha de log da compra contém nome, telefone, chave de idempotência, token do pedido ou cookie; e cada requisição é rastreável pelo requisicaoId",
    async () => {
      // 1. carrinho
      const item = await request(app)
        .post(`/v1/vitrine/${loja.apelido}/carrinho/itens`)
        .set("Origin", ORIGEM)
        .set("x-request-id", REQUISICAO_DO_CLIENTE)
        .send({ produtoId: produto.id, quantidade: 1, escolhas: [] });
      expect(item.status).toBe(201);
      const cabecalho = item.headers["set-cookie"];
      const cookies = Array.isArray(cabecalho) ? cabecalho : [cabecalho ?? ""];
      const sessao = cookies
        .find((c) => c.startsWith(`${COOKIE_DA_SESSAO}=`))
        ?.split(";")[0]
        ?.split("=")[1];
      expect(sessao).toBeTruthy();
      const cookie = `${COOKIE_DA_SESSAO}=${sessao}`;
      expect(item.headers["x-request-id"]).toBe(REQUISICAO_DO_CLIENTE);

      const fechar = async (chave: string) =>
        request(app)
          .post(`/v1/vitrine/${loja.apelido}/pedidos`)
          .set("Origin", ORIGEM)
          .set("Cookie", cookie)
          .set("Authorization", await autorizacaoDoComprador())
          .send({
            contato: { nome: NOME, telefone: TELEFONE_DIGITOS },
            entrega: "PICKUP",
            chaveDeIdempotencia: chave,
          });

      // 2. fechamento, 3. replay com a mesma chave (resposta "perdida")
      const primeiro = await fechar(CHAVE);
      expect(primeiro.status).toBe(201);
      const replay = await fechar(CHAVE);
      expect(replay.status).toBe(200);
      expect(replay.body.id).toBe(primeiro.body.id);
      const tokenDoPedido = primeiro.body.tokenPublico as string;
      expect(tokenDoPedido.length).toBeGreaterThan(10);

      // 4. acompanhamento por token (a URL carrega a credencial)
      const acompanhar = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/pedido/${tokenDoPedido}`)
        .set("Origin", ORIGEM);
      expect(acompanhar.status).toBe(200);

      // 5. uma recusa (carrinho já convertido não fecha com outra chave)
      const recusado = await fechar("outra-chave-sentinela-987654321");
      expect(recusado.status).toBeGreaterThanOrEqual(400);

      // ── afirmações ──────────────────────────────────────────────────────
      const saida = linhasBrutas.join("\n");
      expect(linhasBrutas.length).toBeGreaterThan(8);
      for (const proibido of [
        NOME,
        "Sentinela",
        TELEFONE_DIGITOS,
        TELEFONE_E164,
        CHAVE,
        "outra-chave-sentinela",
        tokenDoPedido,
        sessao as string,
        "Bearer",
        "sc_access",
      ]) {
        expect(saida, `o log contém "${proibido}"`).not.toContain(proibido);
      }

      // toda linha de requisição tem requisicaoId; o id do cliente foi aceito
      const doPedido = linhas().filter(
        (l) => typeof l.evento === "string" && l.evento.startsWith("requisicao."),
      );
      expect(doPedido.length).toBeGreaterThanOrEqual(10);
      for (const l of doPedido) expect(typeof l.requisicaoId).toBe("string");
      expect(
        doPedido.some((l) => l.requisicaoId === REQUISICAO_DO_CLIENTE),
      ).toBe(true);

      // a rota gravada é o MOLDE, nunca o token que veio no caminho
      const rotas = doPedido
        .map((l) => l.rota)
        .filter((r): r is string => typeof r === "string");
      expect(rotas.some((r) => r.includes(":token"))).toBe(true);

      // cada fechamento tem início e fim sob o mesmo id (linha do tempo)
      const fins = doPedido.filter(
        (l) =>
          l.evento === "requisicao.terminou" &&
          typeof l.rota === "string" &&
          l.rota.endsWith("/pedidos"),
      );
      expect(fins.map((l) => l.status)).toEqual(
        expect.arrayContaining([201, 200]),
      );
      for (const fim of fins) {
        const mesmoId = doPedido.filter(
          (l) => l.requisicaoId === fim.requisicaoId,
        );
        expect(mesmoId.map((l) => l.evento)).toContain("requisicao.iniciou");
        expect(typeof fim.duracaoMs).toBe("number");
      }
    },
    ESPERA_LONGA,
  );
});
