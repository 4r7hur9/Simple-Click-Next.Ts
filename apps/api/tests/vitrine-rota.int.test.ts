/**
 * Prova da rota da vitrine (AC-400, AC-401, AC-402, AC-904).
 *
 * As peças já estavam provadas em separado. O que só esta prova mostra é a
 * COSTURA: que a requisição HTTP atravessa as duas transações na ordem certa,
 * que o 404 sai igual para loja inexistente e suspensa, e que nada do dono
 * escapa pelo corpo da resposta — que é onde o vazamento aconteceria de fato.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let ativa: LojaDeTeste;
let suspensa: LojaDeTeste;
let app: ReturnType<typeof criarApp>;

const CHAVE_PIX = "loja-da-rota@pix.exemplo.test";
const DOCUMENTO = "98765432000188";
const WHATSAPP_DO_DONO = "5511911112222";

/** Segunda, 17 de agosto de 2026, meio-dia em São Paulo. */
const AGORA = new Date(Date.UTC(2026, 7, 17, 15, 0));

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = criarApp({ vitrine: { acesso, agora: () => AGORA } });

  ativa = await criarLoja({ nome: "Bar da Rota" });
  suspensa = await criarLoja({ nome: "Bar Fechado", status: "INACTIVE" });

  await migrador.query(
    `UPDATE app.stores
        SET doc_number = $2, whatsapp_e164 = $3, email = 'dono@exemplo.test',
            street = 'Rua do Porto', number = '77', neighborhood = 'Centro',
            city = 'Santos', uf = 'SP', zip = '11010000'
      WHERE id = $1`,
    [ativa.id, DOCUMENTO, WHATSAPP_DO_DONO],
  );

  await migrador.query(
    `INSERT INTO app.store_settings (store_id, landing, theme, payment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id) DO UPDATE
       SET landing = EXCLUDED.landing, theme = EXCLUDED.theme,
           payment = EXCLUDED.payment`,
    [
      ativa.id,
      JSON.stringify({ boasVindas: "Peixe fresco todo dia" }),
      JSON.stringify({ primaria: "#0f6e5c" }),
      JSON.stringify({ chavePix: CHAVE_PIX }),
    ],
  );

  await migrador.query(
    `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
     VALUES ($1, 1, '11:00', '15:00')`,
    [ativa.id],
  );
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

describe("a rota entrega a vitrine (AC-400, AC-401)", () => {
  it(
    "@spec:AC-400 a loja chega pelo apelido, com o que a vitrine mostra",
    async () => {
      const resposta = await request(app).get(`/v1/vitrine/${ativa.apelido}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.loja.nome).toBe("Bar da Rota");
      expect(resposta.body.loja.boasVindas).toBe("Peixe fresco todo dia");
      expect(resposta.body.loja.enderecoParaRetirada.logradouro).toBe(
        "Rua do Porto",
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-401 a resposta diz se a loja está aberta agora, no fuso dela",
    async () => {
      // Segunda ao meio-dia, com a grade cadastrada: aberta.
      const resposta = await request(app).get(`/v1/vitrine/${ativa.apelido}`);

      expect(resposta.body.abertura.aberta).toBe(true);
      expect(resposta.body.abertura.motivo).toBe("ABERTA");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-400 a resposta cabe exatamente no que o contrato promete",
    async () => {
      // Campo a mais na resposta é o vazamento clássico: a projeção filtra, mas
      // um dia alguém acrescenta um `select` e o esquema estrito é quem recusa.
      const { esquemaDaVitrine } = await import("@simpleclick/contracts");
      const resposta = await request(app).get(`/v1/vitrine/${ativa.apelido}`);

      const conferido = esquemaDaVitrine.safeParse(resposta.body);
      expect(
        conferido.success,
        conferido.success ? "" : JSON.stringify(conferido.error.issues),
      ).toBe(true);
    },
    ESPERA_LONGA,
  );
});

describe("inexistente e suspensa respondem igual (AC-402)", () => {
  it(
    "@spec:AC-402 loja que nunca existiu responde 404 sem detalhe técnico",
    async () => {
      const resposta = await request(app).get("/v1/vitrine/loja-inexistente");

      expect(resposta.status).toBe(404);
      expect(JSON.stringify(resposta.body)).not.toContain("INACTIVE");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-402 loja suspensa responde EXATAMENTE o mesmo corpo",
    async () => {
      // A diferença entre as duas respostas é o vazamento: ela contaria que
      // aquele endereço já existiu e foi suspenso.
      const daInexistente = await request(app).get(
        "/v1/vitrine/outra-que-nao-ha",
      );
      const daSuspensa = await request(app).get(
        `/v1/vitrine/${suspensa.apelido}`,
      );

      expect(daSuspensa.status).toBe(daInexistente.status);

      // A referência é o identificador DAQUELA requisição, para casar a
      // resposta com as linhas de registro — ela deve mesmo ser diferente a
      // cada chamada, e comparar as duas com ela dentro exigiria o oposto do
      // que o sistema precisa fazer. O que não pode diferir é o resto.
      const semReferencia = (corpo: { erro?: Record<string, unknown> }) => ({
        ...corpo,
        erro: { ...corpo.erro, referencia: undefined },
      });

      expect(semReferencia(daSuspensa.body)).toEqual(
        semReferencia(daInexistente.body),
      );
      // E a referência EXISTE nas duas: sem ela, quem abre um chamado não tem
      // como dizer qual requisição falhou.
      expect(daSuspensa.body.erro.referencia).toBeTruthy();
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-402 nada da loja suspensa aparece na resposta",
    async () => {
      const resposta = await request(app).get(
        `/v1/vitrine/${suspensa.apelido}`,
      );

      const comoTexto = JSON.stringify(resposta.body);
      expect(comoTexto).not.toContain(suspensa.nome);
      expect(comoTexto).not.toContain(suspensa.id);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-402 apelido em formato impossível é recusado na borda, sem tocar o banco",
    async () => {
      // Sem esta conferência, o valor viaja até a consulta carregando qualquer
      // coisa que caiba num endereço.
      const resposta = await request(app).get(
        "/v1/vitrine/Loja%20Com%20Espaco",
      );

      expect(resposta.status).toBe(400);
    },
    ESPERA_LONGA,
  );
});

describe("o que é do dono não sai pela rota (AC-904)", () => {
  it(
    "@spec:AC-904 @principle:P-009 chave PIX, documento e telefone não aparecem no corpo",
    async () => {
      // É o vazamento que um concorrente teve, agora conferido no lugar onde ele
      // aconteceria: a resposta HTTP de verdade.
      const resposta = await request(app).get(`/v1/vitrine/${ativa.apelido}`);
      const comoTexto = JSON.stringify(resposta.body);

      expect(comoTexto).not.toContain(CHAVE_PIX);
      expect(comoTexto).not.toContain(DOCUMENTO);
      expect(comoTexto).not.toContain(WHATSAPP_DO_DONO);
      expect(comoTexto).not.toContain("dono@exemplo.test");
      expect(comoTexto).not.toContain("11010000");
    },
    ESPERA_LONGA,
  );
});
