/**
 * Prova de que o envio de e-mail sai do caminho da resposta (AC-025).
 *
 * Roda contra o Redis de verdade, com um duplo no lugar do serviço de e-mail.
 * Não existe versão em memória disto que prove o que interessa: o critério fala
 * de DUAS linhas de execução — a que responde ao navegador e a que espera o
 * serviço de e-mail — e é a fila que as separa. Substituir a fila por um objeto
 * simulado provaria apenas que o simulado concorda com o teste.
 *
 * O que é simulado, e só isso, é o serviço externo: nenhum teste deste projeto
 * manda e-mail de verdade.
 */

import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  criarEnviadorDeProva,
  esperarPor,
  limparPrefixo,
  prefixoDeTeste,
  urlDoRedisDeTeste,
  type EnviadorDeProva,
} from "../../tests/apoio-de-fila.ts";
import {
  enfileirarEmailDeVerificacao,
  montarSegundoPlano,
  type PoliticaDeRepeticao,
  type SegundoPlano,
} from "./index.ts";

const URL_DO_REDIS = urlDoRedisDeTeste();

/** Quanto o serviço de e-mail simulado demora, depois de solto. */
const DURACAO_DO_ENVIO_MS = 1_500;

/**
 * Até quando a prova espera a resposta com o envio preso, antes de soltá-lo à
 * força. Não é a régua da prova: a régua é a ordem — a resposta que chega com
 * o envio preso não esperou por ele, rode a máquina rápida ou lenta. O prazo
 * só existe para que um cadastro que ESPERA o e-mail reprove dizendo isso, em
 * vez de ficar pendurado até o limite do Vitest.
 */
const PRAZO_DA_RESPOSTA_MS = 30_000;

const CADASTRO = {
  destinatario: "pessoa@exemplo.test",
  nome: "Ana",
  urlDeVerificacao: "https://app.localhost/verificar/abc123",
};

/**
 * Rota de cadastro reduzida ao que este critério mede.
 *
 * O cadastro de verdade (`POST /v1/auth/register`) nasce na fatia de
 * identidade, na F1; aqui ele é representado pelo único trecho que AC-025
 * governa — responder sem esperar o e-mail. A chamada a
 * `enfileirarEmailDeVerificacao` é a MESMA que o caso de uso real fará, e é
 * essa costura, e não a rota, que o teste prende.
 */
function criarRotaDeCadastro(plano: SegundoPlano): Express {
  const app = express();
  app.use(express.json());
  // O Express 5 entende manipulador assíncrono e encaminha rejeição sozinho.
  app.post("/cadastro", async (_req, res) => {
    const resultado = await enfileirarEmailDeVerificacao(plano.email, CADASTRO);
    res.status(201).json({
      cadastrado: true,
      emailEnfileirado: resultado.enfileirado,
    });
  });
  return app;
}

let prefixo = "";
let plano: SegundoPlano;
let enviador: EnviadorDeProva;

/** Monta fila, trabalhador e rota com a política que o teste quer exercitar. */
function montarCenario(
  opcoes: {
    duracaoMs?: number;
    falhar?: boolean;
    repeticao?: PoliticaDeRepeticao;
  } = {},
): Express {
  enviador = criarEnviadorDeProva({
    duracaoMs: opcoes.duracaoMs ?? 0,
    falhar: opcoes.falhar ?? false,
  });
  plano = montarSegundoPlano({
    urlDoRedis: URL_DO_REDIS,
    enviadorDeEmail: enviador,
    prefixo,
    repeticao: opcoes.repeticao,
  });
  return criarRotaDeCadastro(plano);
}

beforeEach(() => {
  prefixo = prefixoDeTeste("email");
});

afterEach(async () => {
  await plano.fechar();
  await limparPrefixo(URL_DO_REDIS, prefixo);
});

describe("envio de e-mail do cadastro", () => {
  it("@spec:AC-025 a resposta do cadastro chega sem esperar o envio do e-mail", async () => {
    const app = montarCenario({ duracaoMs: DURACAO_DO_ENVIO_MS });

    // O envio fica PRESO enquanto a resposta não chega. Cronometrar a resposta
    // contra um teto oscila com a carga da máquina — mede o processador, não o
    // critério. Com o envio preso, a ordem decide sozinha: se o cadastro
    // esperasse o e-mail, a resposta só viria depois de o envio ser solto.
    const soltarEnvio = enviador.segurarEnvios();
    let soltoPeloPrazo = false;
    const prazo = setTimeout(() => {
      soltoPeloPrazo = true;
      soltarEnvio();
    }, PRAZO_DA_RESPOSTA_MS);

    let depois: number;
    try {
      const resposta = await request(app).post("/cadastro").send({});
      depois = Date.now();

      // A medição do critério: a resposta chegou com o envio ainda preso.
      expect(
        soltoPeloPrazo,
        "a resposta só chegou depois de o envio ser solto: o cadastro esperou o e-mail",
      ).toBe(false);
      expect(resposta.status).toBe(201);
      expect(resposta.body).toMatchObject({
        cadastrado: true,
        emailEnfileirado: true,
      });

      // E, no instante em que ela chegou, nenhum envio tinha terminado.
      const concluidosNaResposta = enviador.chamadas.filter(
        (chamada) => chamada.terminouEm !== undefined,
      );
      expect(concluidosNaResposta).toHaveLength(0);
    } finally {
      clearTimeout(prazo);
      soltarEnvio();
    }

    // O envio acontece mesmo — em segundo plano, depois da resposta.
    await esperarPor(
      () =>
        enviador.chamadas.length === 1 &&
        enviador.chamadas[0]?.terminouEm !== undefined,
      "o e-mail de verificação ser enviado em segundo plano",
    );

    const chamada = enviador.chamadas[0];
    expect(chamada?.mensagem.destinatario).toBe(CADASTRO.destinatario);
    expect(chamada?.mensagem.corpo).toContain(CADASTRO.urlDeVerificacao);
    expect(chamada?.terminouEm ?? 0).toBeGreaterThan(depois);
  });

  it("@spec:AC-025 falha no envio do e-mail não faz o cadastro falhar", async () => {
    const repeticao: PoliticaDeRepeticao = {
      tentativas: 2,
      esperaInicialMs: 100,
    };
    const app = montarCenario({ falhar: true, repeticao });

    const resposta = await request(app).post("/cadastro").send({});

    // O cadastro respondeu criado, e continua criado depois de o envio falhar
    // todas as vezes: a falha não tem por onde voltar para esta resposta.
    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({ cadastrado: true });

    await esperarPor(
      () => enviador.chamadas.length === repeticao.tentativas,
      `o envio ser tentado ${repeticao.tentativas} vezes e falhar em todas`,
    );
    expect(enviador.chamadas.every((chamada) => chamada.falhou)).toBe(true);

    // E o trabalho ficou guardado para inspeção, em vez de sumir.
    await esperarPor(
      async () => (await plano.email.falhos()).length === 1,
      "o trabalho de e-mail esgotado aparecer entre os falhos",
    );
    const falhos = await plano.email.falhos();
    expect(falhos[0]?.tentativasFeitas).toBe(repeticao.tentativas);
    expect(falhos[0]?.motivo).toContain("serviço de e-mail indisponível");
  });
});
