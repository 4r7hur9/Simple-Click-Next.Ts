/**
 * Prova da chave PIX e das formas de pagamento (T-901: AC-900 a AC-904).
 *
 * O caminho inteiro, contra PostgreSQL de verdade: o dono salva pelo painel e
 * o cliente vê no fechamento; o pedido de ontem guarda a chave de ontem. A
 * chave de cada prova é um CPF gerado pela conta do dígito — não é de ninguém.
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
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  camposRecusados,
  gravarSecao,
  lerSecao,
  montarAppDaConfiguracao,
  ORIGEM_DO_PAINEL,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof montarAppDaConfiguracao>;
let token: string;

/** CPF de exemplo com dígitos verificadores corretos. */
const CPF_DO_DONO = "529.982.247-25";
/** Outro CPF de exemplo, para a troca de chave. */
const OUTRO_CPF = "111.444.777-35";

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = montarAppDaConfiguracao(acesso);
  const dono = await criarIdentidade({ nome: "Dona Zica" });
  token = tokenDoDono(dono.id);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** O que o cliente vê no fechamento da loja. */
async function fechamento(loja: LojaDeTeste) {
  const resposta = await request(app).get(
    `/v1/vitrine/${loja.apelido}/fechamento`,
  );
  expect(resposta.status).toBe(200);
  return resposta.body as {
    formasDePagamento: string[];
    pix: { chave: string; tipo: string | null; titular: string | null } | null;
  };
}

function salvarPagamento(loja: LojaDeTeste, corpo: unknown) {
  return gravarSecao(app, {
    apelido: loja.apelido,
    secao: "pagamento",
    corpo,
    token,
  });
}

describe("a chave cadastrada aparece no checkout (AC-900)", () => {
  it(
    "@spec:AC-900 loja sem chave cadastra CPF e recebedor, e o fechamento passa a oferecer PIX com a chave e o nome",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria do PIX" });
      expect((await fechamento(loja)).formasDePagamento).not.toContain("PIX");

      const salvo = await salvarPagamento(loja, {
        formas: ["PIX", "CASH"],
        pix: { tipo: "CPF", chave: CPF_DO_DONO, titular: "Zica da Silva" },
      });
      expect(salvo.status).toBe(204);

      const visto = await fechamento(loja);
      expect(visto.formasDePagamento).toEqual(["PIX", "CASH"]);
      expect(visto.pix).toEqual({
        chave: "52998224725",
        tipo: "CPF",
        titular: "Zica da Silva",
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-900 o painel lê de volta a chave como ficou guardada",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria da Leitura" });
      await salvarPagamento(loja, {
        formas: ["PIX"],
        pix: {
          tipo: "EMAIL",
          chave: "Loja@Exemplo.test",
          titular: "Zica da Silva",
        },
      });

      const lido = await lerSecao(app, loja.apelido, "pagamento", token);
      expect(lido.body).toEqual({
        formas: ["PIX"],
        pix: {
          tipo: "EMAIL",
          chave: "loja@exemplo.test",
          titular: "Zica da Silva",
        },
      });
    },
    ESPERA_LONGA,
  );
});

describe("chave em formato inválido é recusada (AC-901)", () => {
  it(
    "@spec:AC-901 CPF inválido é recusado explicando o formato, e a chave anterior continua valendo",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Firme" });
      await salvarPagamento(loja, {
        formas: ["PIX"],
        pix: { tipo: "CPF", chave: CPF_DO_DONO, titular: "Zica da Silva" },
      });

      const recusado = await salvarPagamento(loja, {
        formas: ["PIX"],
        pix: { tipo: "CPF", chave: "529.982.247-26", titular: "Zica" },
      });

      expect(recusado.status).toBe(400);
      expect(camposRecusados(recusado.body)).toEqual(["pix.chave"]);
      expect(recusado.body.campos[0].mensagem).toContain("11 dígitos");
      expect((await fechamento(loja)).pix?.chave).toBe("52998224725");
      expect((await fechamento(loja)).pix?.titular).toBe("Zica da Silva");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-901 PIX ligado sem chave é recusado apontando o campo da chave",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Sem Chave" });
      const recusado = await salvarPagamento(loja, {
        formas: ["PIX"],
        pix: null,
      });

      expect(recusado.status).toBe(400);
      expect(camposRecusados(recusado.body)).toEqual(["pix.chave"]);
    },
    ESPERA_LONGA,
  );
});

describe("loja sem chave não oferece PIX (AC-902)", () => {
  it(
    "@spec:AC-902 sem chave o PIX some do fechamento, e as outras formas continuam",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria do Dinheiro" });
      // Documento antigo, gravado antes da conferência existir: PIX ligado e
      // chave nenhuma. É o caso que a vitrine não pode oferecer.
      await migrador.query(
        `UPDATE app.store_settings SET payment = $2 WHERE store_id = $1`,
        [
          loja.id,
          JSON.stringify({ formas: ["PIX", "CASH", "CARD_ON_DELIVERY"] }),
        ],
      );

      const visto = await fechamento(loja);
      expect(visto.formasDePagamento).toEqual(["CASH", "CARD_ON_DELIVERY"]);
      expect(visto.pix).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-902 sem forma nenhuma, o painel do dono avisa que falta configurar pagamento",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Sem Forma" });
      const resposta = await request(app)
        .get(`/v1/lojas/${loja.apelido}/configuracao/pendencias`)
        .set("Authorization", `Bearer ${token}`);

      expect(resposta.status).toBe(200);
      const codigos = (
        resposta.body.pendencias as { codigo: string; href: string }[]
      ).map((pendencia) => pendencia.codigo);
      expect(codigos).toContain("PAGAMENTO");
    },
    ESPERA_LONGA,
  );
});

describe("trocar a chave não altera pedido já feito (AC-903)", () => {
  it(
    "@spec:AC-903 @principle:P-010 o pedido antigo mostra a chave de antes, e o novo a chave nova",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria dos Pedidos" });
      const pastel = await criarProduto({
        loja,
        nome: "Pastel de carne",
        precoCentavos: 900,
      });
      for (let dia = 0; dia <= 6; dia += 1) {
        await migrador.query(
          `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
           VALUES ($1, $2, '00:00', '23:59')`,
          [loja.id, dia],
        );
      }

      async function pedirComPix(): Promise<string> {
        const item = await request(app)
          .post(`/v1/vitrine/${loja.apelido}/carrinho/itens`)
          .set("Origin", ORIGEM_DO_PAINEL)
          .send({ produtoId: pastel.id, quantidade: 1, escolhas: [] });
        expect(item.status).toBe(201);
        const cookie = (
          [item.headers["set-cookie"]].flat() as (string | undefined)[]
        ).find((valor) => valor?.startsWith(`${COOKIE_DA_SESSAO}=`));

        const pedido = await request(app)
          .post(`/v1/vitrine/${loja.apelido}/pedidos`)
          .set("Origin", ORIGEM_DO_PAINEL)
          .set("Cookie", cookie?.split(";")[0] ?? "")
          .send({
            contato: { nome: "Ana Paula", telefone: "11988887777" },
            entrega: "PICKUP",
            formaDePagamento: "PIX",
            chaveDeIdempotencia: `pix-${Math.random().toString(36).slice(2)}`,
          });
        expect(pedido.status).toBe(201);
        return pedido.body.id as string;
      }

      await salvarPagamento(loja, {
        formas: ["PIX"],
        pix: { tipo: "CPF", chave: CPF_DO_DONO, titular: "Zica da Silva" },
      });
      const antigo = await pedirComPix();

      const troca = await salvarPagamento(loja, {
        formas: ["PIX"],
        pix: { tipo: "CPF", chave: OUTRO_CPF, titular: "Zeca da Silva" },
      });
      expect(troca.status).toBe(204);
      const novo = await pedirComPix();

      const { rows } = await migrador.query<{
        id: string;
        pix_key_snapshot: string | null;
        pix_holder_snapshot: string | null;
      }>(
        `SELECT id, pix_key_snapshot, pix_holder_snapshot
           FROM app.orders WHERE id = ANY($1::uuid[])`,
        [[antigo, novo]],
      );
      const porId = new Map(rows.map((linha) => [linha.id, linha]));
      expect(porId.get(antigo)?.pix_key_snapshot).toBe("52998224725");
      expect(porId.get(antigo)?.pix_holder_snapshot).toBe("Zica da Silva");
      expect(porId.get(novo)?.pix_key_snapshot).toBe("11144477735");
      expect(porId.get(novo)?.pix_holder_snapshot).toBe("Zeca da Silva");
    },
    ESPERA_LONGA,
  );
});

describe("a chave não aparece em lugar indevido (AC-904)", () => {
  it(
    "@spec:AC-904 @principle:P-009 a chave salva pelo painel não sai nos dados públicos da vitrine",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Discreta" });
      await salvarPagamento(loja, {
        formas: ["PIX"],
        pix: { tipo: "CPF", chave: CPF_DO_DONO, titular: "Zica da Silva" },
      });

      const vitrine = await request(app).get(`/v1/vitrine/${loja.apelido}`);
      expect(vitrine.status).toBe(200);
      const texto = JSON.stringify(vitrine.body);
      expect(texto).not.toContain("52998224725");
      expect(texto).not.toContain(CPF_DO_DONO);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-904 a configuração de pagamento não abre sem a sessão do dono",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Fechada" });
      const resposta = await request(app).get(
        `/v1/lojas/${loja.apelido}/configuracao/pagamento`,
      );
      expect(resposta.status).toBe(401);
      expect(JSON.stringify(resposta.body)).not.toContain("pix");
    },
    ESPERA_LONGA,
  );
});
