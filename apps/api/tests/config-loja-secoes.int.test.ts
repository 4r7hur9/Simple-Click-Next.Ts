/**
 * Prova das configurações por seção (T-900: AC-921, AC-922, AC-923).
 *
 * Contra PostgreSQL de verdade, pela aplicação montada: a atomicidade e a
 * trilha só existem de fato no banco — um teste com o banco de mentira
 * provaria que o código CHAMA a transação, e não que ela desfaz.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
} from "@simpleclick/testing";
import type { IdentidadeDeTeste, LojaDeTeste } from "@simpleclick/testing";

import {
  camposRecusados,
  gravarSecao,
  lerSecao,
  montarAppDaConfiguracao,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof montarAppDaConfiguracao>;
let loja: LojaDeTeste;
let dono: IdentidadeDeTeste;
let token: string;

/** A entrega que a loja tem antes de cada prova de recusa. */
const ENTREGA_VALENDO = {
  aceitaEntrega: true,
  aceitaRetirada: true,
  taxaCentavos: 800,
  nomeDaTaxa: "Motoboy",
  gratisAcimaDeCentavos: 6_000,
  minimoParaEntregaCentavos: 2_500,
  minimoParaRetiradaCentavos: null,
  prazoMinutos: 40,
};

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = montarAppDaConfiguracao(acesso);
  loja = await criarLoja({ nome: "Pastelaria das Seções" });
  dono = await criarIdentidade({ nome: "Dona Zica" });
  token = tokenDoDono(dono.id);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

async function trilhaDaLoja(lojaId: string) {
  const { rows } = await migrador.query<{
    actor_id: string | null;
    actor_role: string;
    action: string;
    entity: string;
    entity_id: string;
    before_data: { campos: Record<string, unknown> };
    after_data: {
      campos: Record<string, unknown>;
      sensivel: boolean;
      camposSensiveis: string[];
    };
    created_at: Date;
  }>(
    `SELECT actor_id, actor_role, action, entity, entity_id, before_data,
            after_data, created_at
       FROM app.audit_log
      WHERE store_id = $1
      ORDER BY id`,
    [lojaId],
  );
  return rows;
}

describe("o dono configura a operação, e não o cadastro (AC-921)", () => {
  it(
    "@spec:AC-921 as seis seções do dono respondem: pagamento, entrega, horário, contato, apresentação e impressão",
    async () => {
      for (const secao of [
        "pagamento",
        "entrega",
        "horario",
        "contato",
        "aparencia",
        "impressao",
      ]) {
        const resposta = await lerSecao(app, loja.apelido, secao, token);
        expect(resposta.status, `seção ${secao}`).toBe(200);
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-921 tipo de negócio, apelido, documento, contrato e funcionalidades não têm rota de configuração",
    async () => {
      for (const secao of [
        "tipo-de-negocio",
        "ramo",
        "apelido",
        "documento",
        "contrato",
        "funcionalidades",
      ]) {
        const lida = await lerSecao(app, loja.apelido, secao, token);
        const gravada = await gravarSecao(app, {
          apelido: loja.apelido,
          secao,
          corpo: { valor: "qualquer" },
          token,
        });
        expect(lida.status, `leitura de ${secao}`).toBe(404);
        expect(gravada.status, `gravação de ${secao}`).toBe(404);
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-921 campo da plataforma dentro de uma seção do dono é recusado, e nada muda na loja",
    async () => {
      const resposta = await gravarSecao(app, {
        apelido: loja.apelido,
        secao: "aparencia",
        corpo: {
          boasVindas: "Bem-vindo!",
          sobre: null,
          logo: null,
          capa: null,
          corPrimaria: null,
          slug: "outro-apelido",
          verticalCode: "FOOD_BAKERY",
          docNumber: "12345678000199",
        },
        token,
      });

      expect(resposta.status).toBe(400);
      const { rows } = await migrador.query<{
        slug: string;
        vertical_code: string;
        doc_number: string | null;
      }>(
        `SELECT slug, vertical_code, doc_number FROM app.stores WHERE id = $1`,
        [loja.id],
      );
      expect(rows[0]?.slug).toBe(loja.apelido);
      expect(rows[0]?.vertical_code).toBe(loja.ramoCodigo);
      expect(rows[0]?.doc_number).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-921 sem sessão de dono nenhuma seção abre",
    async () => {
      const resposta = await lerSecao(app, loja.apelido, "pagamento", "x.y.z");
      expect(resposta.status).toBe(401);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-921 o horário é do dono: a grade, o fechar agora e as datas especiais voltam como foram salvos",
    async () => {
      const horario = {
        semana: [
          { dia: 0, faixas: [] },
          { dia: 1, faixas: [] },
          {
            dia: 2,
            faixas: [
              { abre: "11:00", fecha: "14:00" },
              { abre: "18:00", fecha: "23:00" },
            ],
          },
          { dia: 3, faixas: [{ abre: "18:00", fecha: "22:30" }] },
          { dia: 4, faixas: [] },
          { dia: 5, faixas: [] },
          { dia: 6, faixas: [] },
        ],
        fechadoAgora: true,
        excecoes: [
          {
            data: "2026-12-25",
            fechada: true,
            abre: null,
            fecha: null,
            motivo: "Natal",
          },
        ],
      };

      const gravada = await gravarSecao(app, {
        apelido: loja.apelido,
        secao: "horario",
        corpo: horario,
        token,
      });
      expect(gravada.status).toBe(204);

      const lida = await lerSecao(app, loja.apelido, "horario", token);
      expect(lida.body).toEqual({
        semana: [
          {
            dia: 2,
            faixas: [
              { abre: "11:00", fecha: "14:00" },
              { abre: "18:00", fecha: "23:00" },
            ],
          },
          { dia: 3, faixas: [{ abre: "18:00", fecha: "22:30" }] },
        ],
        fechadoAgora: true,
        excecoes: horario.excecoes,
      });

      // Desligar o "fechar agora" devolve a loja à grade, que continua lá.
      const reaberta = await gravarSecao(app, {
        apelido: loja.apelido,
        secao: "horario",
        corpo: { ...horario, fechadoAgora: false },
        token,
      });
      expect(reaberta.status).toBe(204);
      const { rows } = await migrador.query<{ open_state: string }>(
        `SELECT open_state FROM app.stores WHERE id = $1`,
        [loja.id],
      );
      expect(rows[0]?.open_state).toBe("SCHEDULE");
    },
    ESPERA_LONGA,
  );
});

describe("toda alteração fica registrada (AC-922)", () => {
  it(
    "@spec:AC-922 a trilha diz quem alterou, quando, o que mudou e o valor anterior",
    async () => {
      const lojaDaTrilha = await criarLoja({ nome: "Loja da Trilha" });
      const antes = Date.now();

      const primeira = await gravarSecao(app, {
        apelido: lojaDaTrilha.apelido,
        secao: "entrega",
        corpo: ENTREGA_VALENDO,
        token,
      });
      expect(primeira.status).toBe(204);
      const segunda = await gravarSecao(app, {
        apelido: lojaDaTrilha.apelido,
        secao: "entrega",
        corpo: { ...ENTREGA_VALENDO, taxaCentavos: 1_000, nomeDaTaxa: "Frete" },
        token,
      });
      expect(segunda.status).toBe(204);

      const trilha = await trilhaDaLoja(lojaDaTrilha.id);
      expect(trilha).toHaveLength(2);
      const ultima = trilha[1];
      expect(ultima?.actor_id).toBe(dono.id);
      expect(ultima?.actor_role).toBe("OWNER");
      expect(ultima?.action).toBe("CONFIG_ALTERADA");
      expect(ultima?.entity).toBe("store_settings");
      expect(ultima?.entity_id).toBe("entrega");
      expect(ultima?.created_at.getTime()).toBeGreaterThanOrEqual(
        antes - 5_000,
      );
      // O QUE mudou, e o valor de ANTES — só os campos que mudaram.
      expect(ultima?.before_data.campos).toEqual({
        nomeDaTaxa: "Motoboy",
        taxaCentavos: 800,
      });
      expect(ultima?.after_data.campos).toEqual({
        nomeDaTaxa: "Frete",
        taxaCentavos: 1_000,
      });
      expect(ultima?.after_data.sensivel).toBe(false);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-922 @principle:P-009 trocar a chave PIX fica destacado, e a trilha guarda só o final da chave",
    async () => {
      const lojaDoPix = await criarLoja({ nome: "Loja do PIX" });
      const chaveAntiga = "loja-antiga@pix.exemplo.test";
      const chaveNova = "loja-nova@pix.exemplo.test";

      for (const chave of [chaveAntiga, chaveNova]) {
        const resposta = await gravarSecao(app, {
          apelido: lojaDoPix.apelido,
          secao: "pagamento",
          corpo: {
            formas: ["PIX", "CASH"],
            pix: { tipo: "EMAIL", chave, titular: "Dona Zica" },
          },
          token,
        });
        expect(resposta.status).toBe(204);
      }

      const trilha = await trilhaDaLoja(lojaDoPix.id);
      const troca = trilha.at(-1);
      expect(troca?.action).toBe("CONFIG_SENSIVEL_ALTERADA");
      expect(troca?.after_data.sensivel).toBe(true);
      expect(troca?.after_data.camposSensiveis).toContain("pix.chave");
      expect(troca?.before_data.campos["pix.chave"]).toBe("…test");
      // A chave, inteira, não está em lugar nenhum da trilha.
      const texto = JSON.stringify(trilha);
      expect(texto).not.toContain(chaveAntiga);
      expect(texto).not.toContain(chaveNova);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-922 salvar sem mudar nada não enche a trilha",
    async () => {
      const lojaQuieta = await criarLoja({ nome: "Loja Quieta" });
      for (let vez = 0; vez < 2; vez += 1) {
        const resposta = await gravarSecao(app, {
          apelido: lojaQuieta.apelido,
          secao: "entrega",
          corpo: ENTREGA_VALENDO,
          token,
        });
        expect(resposta.status).toBe(204);
      }
      expect(await trilhaDaLoja(lojaQuieta.id)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );
});

describe("configuração inválida não quebra a loja (AC-923)", () => {
  it(
    "@spec:AC-923 a recusa aponta CADA campo com problema, e a configuração anterior continua valendo",
    async () => {
      const lojaFirme = await criarLoja({ nome: "Loja Firme" });
      expect(
        (
          await gravarSecao(app, {
            apelido: lojaFirme.apelido,
            secao: "entrega",
            corpo: ENTREGA_VALENDO,
            token,
          })
        ).status,
      ).toBe(204);
      const trilhaAntes = await trilhaDaLoja(lojaFirme.id);

      const resposta = await gravarSecao(app, {
        apelido: lojaFirme.apelido,
        secao: "entrega",
        corpo: {
          ...ENTREGA_VALENDO,
          aceitaRetirada: false,
          taxaCentavos: -5,
          prazoMinutos: 12.5,
          nomeDaTaxa: "x".repeat(200),
        },
        token,
      });

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toBe("entrada_invalida");
      expect(camposRecusados(resposta.body)).toEqual([
        "nomeDaTaxa",
        "prazoMinutos",
        "taxaCentavos",
      ]);

      // NADA foi salvo — nem o campo que estava certo (retirada desligada).
      const lida = await lerSecao(app, lojaFirme.apelido, "entrega", token);
      expect(lida.body).toEqual(ENTREGA_VALENDO);
      expect(await trilhaDaLoja(lojaFirme.id)).toHaveLength(trilhaAntes.length);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-923 falha no meio da gravação desfaz tudo: a coluna da loja, a configuração e a trilha",
    async () => {
      const lojaAtomica = await criarLoja({ nome: "Loja Atômica" });
      expect(
        (
          await gravarSecao(app, {
            apelido: lojaAtomica.apelido,
            secao: "entrega",
            corpo: ENTREGA_VALENDO,
            token,
          })
        ).status,
      ).toBe(204);

      // O registro na trilha é o ÚLTIMO passo, depois das duas gravações da
      // entrega (a coluna da loja e o documento de configuração). Ele falhar
      // prova que as duas anteriores voltam atrás junto.
      const appQueFalha = montarAppDaConfiguracao(acesso, {
        configuracoes: {
          registrarNaTrilha: async () => {
            throw new Error("trilha indisponível");
          },
        },
      });

      const resposta = await gravarSecao(appQueFalha, {
        apelido: lojaAtomica.apelido,
        secao: "entrega",
        corpo: {
          ...ENTREGA_VALENDO,
          aceitaEntrega: false,
          taxaCentavos: 1_500,
        },
        token,
      });
      expect(resposta.status).toBe(500);

      const { rows } = await migrador.query<{
        fulfillment_modes: string[];
        delivery: Record<string, unknown>;
      }>(
        `SELECT l.fulfillment_modes, s.delivery
           FROM app.stores l JOIN app.store_settings s ON s.store_id = l.id
          WHERE l.id = $1`,
        [lojaAtomica.id],
      );
      expect(rows[0]?.fulfillment_modes).toEqual(["DELIVERY", "PICKUP"]);
      expect(rows[0]?.delivery["taxaPadraoCents"]).toBe(800);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-923 horário com faixa invertida e data repetida é recusado inteiro, apontando cada lugar",
    async () => {
      const resposta = await gravarSecao(app, {
        apelido: loja.apelido,
        secao: "horario",
        corpo: {
          semana: [
            { dia: 2, faixas: [{ abre: "22:00", fecha: "18:00" }] },
            { dia: 3, faixas: [{ abre: "25:00", fecha: "23:00" }] },
          ],
          fechadoAgora: false,
          excecoes: [
            {
              data: "2026-12-25",
              fechada: true,
              abre: null,
              fecha: null,
              motivo: null,
            },
            {
              data: "2026-12-25",
              fechada: false,
              abre: null,
              fecha: null,
              motivo: null,
            },
          ],
        },
        token,
      });

      expect(resposta.status).toBe(400);
      expect(camposRecusados(resposta.body)).toEqual(
        expect.arrayContaining([
          "semana.0.faixas.0.fecha",
          "semana.1.faixas.0.abre",
          "excecoes.1.abre",
        ]),
      );
    },
    ESPERA_LONGA,
  );
});
