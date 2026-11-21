/**
 * A partida sobe o segundo plano de verdade, contra o Redis de teste (AC-046),
 * e o desligamento fecha as filas antes do banco e do cache (AC-047).
 *
 * Mora no projeto `cache-int` (Redis sem banco): a partida não abre banco, e
 * cobrar um PostgreSQL de pé faria este teste falhar por um motivo que não é
 * dele. As chaves da fila ficam num prefixo só desta execução.
 */

import { afterEach, describe, expect, it } from "vitest";
import { request } from "node:http";
import { createServer } from "node:net";

import {
  criarEnviadorDeProva,
  esperarPor,
  limparPrefixo,
  prefixoDeTeste,
  urlDoRedisDeTeste,
} from "../tests/apoio-de-fila.ts";
import {
  criarRegistrador,
  definirRegistrador,
  type Registrador,
} from "./core/log.ts";
import { TRABALHOS_DE_EMAIL } from "./jobs/index.ts";
import { iniciarApi, type ApiEmPe } from "./main.ts";

/**
 * Cadeias de exemplo, em constante para que o arquivo de teste nunca pareça —
 * nem seja — lugar onde credencial mora (P-002). Nenhuma é alcançada: a
 * partida não abre banco, que só conecta na primeira requisição que precisa.
 */
const CONEXAO_DA_APLICACAO =
  "postgresql://aplicacao:trocar@127.0.0.1:1/sc_partida";
const CONEXAO_DIRETA = "postgresql://migracao:trocar@127.0.0.1:1/sc_partida";
const CONEXAO_DE_TESTE =
  "postgresql://aplicacao:trocar@127.0.0.1:1/sc_partida_teste";
/**
 * Segredo de prova com 48 caracteres distintos, montado em código: produção
 * recusa repetição como "x" × 48 (A-1 da revisão #149). Não é chave real.
 */
const CHAVE_DE_ASSINATURA = Array.from(
  { length: 48 },
  (_, i) =>
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[(i * 7) % 62],
).join("");
/** 32 bytes de exemplo: produção não parte sem a chave da cifra (AC-130). */
const CHAVE_DE_CIFRA = Buffer.alloc(32, 7).toString("base64");

async function portaLivre(): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const servidor = createServer();
    servidor.on("error", rejeitar);
    servidor.listen(0, "127.0.0.1", () => {
      const endereco = servidor.address();
      if (endereco === null || typeof endereco === "string") {
        servidor.close();
        rejeitar(new Error("não foi possível descobrir uma porta livre"));
        return;
      }
      const { port } = endereco;
      servidor.close(() => resolver(port));
    });
  });
}

/** Registro em memória, lido de volta pela prova. */
function capturarRegistro(): {
  registrador: Registrador;
  linha(evento: string): Record<string, unknown> | undefined;
} {
  const linhas: Record<string, unknown>[] = [];
  const registrador = criarRegistrador({
    nivel: "debug",
    ambiente: "test",
    destino: {
      write: (texto: string) => {
        for (const linha of texto.split("\n")) {
          if (linha.trim() !== "") {
            linhas.push(JSON.parse(linha) as Record<string, unknown>);
          }
        }
      },
    },
  });
  return {
    registrador,
    linha: (evento) => linhas.find((linha) => linha.msg === evento),
  };
}

function pedirRaiz(porta: number): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const requisicao = request(
      { host: "127.0.0.1", port: porta, path: "/", agent: false },
      (resposta) => {
        resposta.resume();
        resposta.on("end", () => resolver(resposta.statusCode ?? 0));
      },
    );
    requisicao.on("error", rejeitar);
    requisicao.end();
  });
}

const urlDoRedis = urlDoRedisDeTeste();
let prefixo: string | undefined;
let emPe: ApiEmPe | undefined;

afterEach(async () => {
  await emPe?.desligar("fim do teste");
  emPe = undefined;
  definirRegistrador(undefined);
  if (prefixo !== undefined) await limparPrefixo(urlDoRedis, prefixo);
  prefixo = undefined;
});

describe("a partida sobe o segundo plano", () => {
  it("@spec:AC-046 em produção, sem pedir nada, a fila de e-mail e o trabalhador sobem com a API e consomem o que é enfileirado", async () => {
    prefixo = prefixoDeTeste("partida");
    const porta = await portaLivre();
    const captura = capturarRegistro();
    const enviador = criarEnviadorDeProva();

    // Produção SEM `SEGUNDO_PLANO`: o padrão é ligado, e é isso que está sob
    // prova — produção não pode depender de alguém lembrar de uma variável.
    const api = await iniciarApi({
      fonte: {
        NODE_ENV: "production",
        CHAVE_CIFRA_TOTP: CHAVE_DE_CIFRA,
        PORT: String(porta),
        DATABASE_URL: CONEXAO_DA_APLICACAO,
        DATABASE_URL_DIRETA: CONEXAO_DIRETA,
        REDIS_URL: urlDoRedis,
        JWT_SECRET: CHAVE_DE_ASSINATURA,
        ORIGENS_PERMITIDAS: "http://localhost:3100",
      },
      aplicacao: (_requisicao, resposta) => resposta.end("ok"),
      enviadorDeEmail: enviador,
      prefixoDasFilas: prefixo,
      recursos: [],
      registrador: captura.registrador,
    });
    emPe = api;

    expect(api.segundoPlano).toBeDefined();
    expect(captura.linha("segundo_plano.iniciou")?.itens).toEqual(["email"]);
    expect(await pedirRaiz(porta)).toBe(200);

    await api.segundoPlano?.email.enfileirar(
      TRABALHOS_DE_EMAIL.verificacaoDeEmail,
      {
        destinatario: "pessoa@exemplo.test",
        nome: "Pessoa de Teste",
        urlDeVerificacao: "https://simpleclick.localhost/verificar/abc",
      },
    );

    await esperarPor(
      () => enviador.chamadas.length === 1,
      "o trabalhador subido pela partida entregar o e-mail enfileirado",
    );
    expect(enviador.chamadas[0]?.mensagem.destinatario).toBe(
      "pessoa@exemplo.test",
    );
  }, 60_000);

  it("@spec:AC-047 o desligamento fecha as filas de verdade, e antes de fechar banco e cache", async () => {
    prefixo = prefixoDeTeste("desligamento");
    const porta = await portaLivre();
    const captura = capturarRegistro();

    // Banco de mentira que olha o trabalhador no instante em que é fechado:
    // se o trabalhador ainda estivesse rodando, a ordem estaria errada.
    let trabalhadorRodavaQuandoOBancoFechou: boolean | undefined;
    const api: ApiEmPe = await iniciarApi({
      fonte: {
        NODE_ENV: "test",
        PORT: String(porta),
        DATABASE_URL: CONEXAO_DA_APLICACAO,
        DATABASE_URL_DIRETA: CONEXAO_DIRETA,
        DATABASE_URL_TEST: CONEXAO_DE_TESTE,
        REDIS_URL: urlDoRedis,
        JWT_SECRET: CHAVE_DE_ASSINATURA,
        ORIGENS_PERMITIDAS: "http://localhost:3100",
        SEGUNDO_PLANO: "ligado",
      },
      aplicacao: (_requisicao, resposta) => resposta.end("ok"),
      enviadorDeEmail: criarEnviadorDeProva(),
      prefixoDasFilas: prefixo,
      recursos: [
        {
          nome: "banco",
          encerrar: () => {
            trabalhadorRodavaQuandoOBancoFechou =
              api.segundoPlano?.trabalhadores[0]?.trabalhador.isRunning();
            return Promise.resolve();
          },
        },
      ],
      registrador: captura.registrador,
    });
    emPe = api;
    const segundoPlano = api.segundoPlano;
    expect(segundoPlano).toBeDefined();
    await segundoPlano?.email.fila.waitUntilReady();

    const resultado = await api.desligar("SIGTERM");

    expect(resultado.limpo).toBe(true);
    expect(trabalhadorRodavaQuandoOBancoFechou).toBe(false);
    // Fila fechada é fila sem conexão: enfileirar depois do desligamento falha.
    await expect(
      segundoPlano?.email.enfileirar(TRABALHOS_DE_EMAIL.verificacaoDeEmail, {
        destinatario: "pessoa@exemplo.test",
        nome: "Pessoa de Teste",
        urlDeVerificacao: "https://simpleclick.localhost/verificar/abc",
      }),
    ).rejects.toThrow();
    expect(captura.linha("api.desligou")?.estado).toBe("limpo");
  }, 60_000);
});
