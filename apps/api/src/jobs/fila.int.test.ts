/**
 * Prova da repetição com espera crescente e do trabalho falho que não some
 * (AC-026), contra o Redis de verdade.
 *
 * O comportamento sob prova é da fila, não do nosso código de cola: quem
 * decide quanto esperar entre tentativas, quem devolve o trabalho para nova
 * tentativa e quem o move para o estado falho é a BullMQ operando sobre o
 * Redis. Um substituto em memória provaria que o substituto obedece ao teste.
 *
 * O trabalho usado aqui falha de propósito e não toca em nada externo: o
 * processador apenas anota o instante da tentativa e lança.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esperarPor,
  limparPrefixo,
  prefixoDeTeste,
  urlDoRedisDeTeste,
} from "../../tests/apoio-de-fila.ts";
import {
  abrirFila,
  abrirTrabalhador,
  esperaAntesDaTentativa,
  type FalhaDeTentativa,
  type FilaAberta,
  type PoliticaDeRepeticao,
  type TrabalhadorAberto,
} from "./fila.ts";

const URL_DO_REDIS = urlDoRedisDeTeste();

/** Dados do trabalho de prova. Nada externo, nada pessoal. */
interface TrabalhoDeProva {
  readonly alvo: string;
}

/**
 * Meia-vida curta o bastante para o teste rodar em segundos, longa o bastante
 * para a diferença entre a primeira e a segunda espera ficar acima do ruído de
 * agendamento do laço de eventos.
 */
const REPETICAO: PoliticaDeRepeticao = {
  tentativas: 3,
  esperaInicialMs: 500,
};

const MOTIVO = "indisponibilidade temporária do destino";

// ---------------------------------------------------------------------------
// Trabalho que falha em todas as tentativas
// ---------------------------------------------------------------------------

describe("trabalho que falha em toda tentativa", () => {
  const prefixo = prefixoDeTeste("repeticao");
  const NOME_DA_FILA = "prova-de-repeticao";

  /** Instante de cada tentativa, na ordem em que aconteceram. */
  const tentativas: number[] = [];
  /** Cada aviso de falha entregue ao registro do servidor. */
  const falhas: FalhaDeTentativa[] = [];

  let fila: FilaAberta<TrabalhoDeProva>;
  let trabalhador: TrabalhadorAberto;
  let trabalhoId = "";

  beforeAll(async () => {
    fila = abrirFila<TrabalhoDeProva>({
      nome: NOME_DA_FILA,
      urlDoRedis: URL_DO_REDIS,
      prefixo,
      repeticao: REPETICAO,
    });
    trabalhador = abrirTrabalhador<TrabalhoDeProva>({
      nome: NOME_DA_FILA,
      urlDoRedis: URL_DO_REDIS,
      prefixo,
      processar: () => {
        tentativas.push(Date.now());
        return Promise.reject(new Error(MOTIVO));
      },
      aoFalhar: (falha) => falhas.push(falha),
    });

    const trabalho = await fila.enfileirar("falhar-sempre", { alvo: "nenhum" });
    trabalhoId = String(trabalho.id ?? "");

    await esperarPor(
      async () => (await fila.fila.getFailedCount()) === 1,
      `o trabalho esgotar as ${REPETICAO.tentativas} tentativas e ficar falho`,
      20_000,
    );
  });

  afterAll(async () => {
    await trabalhador.fechar();
    await fila.fechar();
    await limparPrefixo(URL_DO_REDIS, prefixo);
  });

  it("@spec:AC-026 repete a tentativa com espera crescente entre elas", () => {
    expect(tentativas).toHaveLength(REPETICAO.tentativas);

    const primeiraEspera = (tentativas[1] ?? 0) - (tentativas[0] ?? 0);
    const segundaEspera = (tentativas[2] ?? 0) - (tentativas[1] ?? 0);

    // Cada espera respeita o piso declarado pela política. A margem de 10%
    // absorve o passo do relógio da fila, nunca uma espera menor de verdade.
    const margem = 0.9;
    expect(primeiraEspera).toBeGreaterThanOrEqual(
      esperaAntesDaTentativa(2, REPETICAO) * margem,
    );
    expect(segundaEspera).toBeGreaterThanOrEqual(
      esperaAntesDaTentativa(3, REPETICAO) * margem,
    );

    // E a espera cresce — é isto que separa "repetir" de "repetir com espera
    // crescente": a segunda pausa é sensivelmente maior que a primeira, e não
    // apenas maior por um punhado de milissegundos de ruído.
    expect(segundaEspera).toBeGreaterThan(primeiraEspera);
    expect(segundaEspera).toBeGreaterThan(primeiraEspera * 1.4);
  });

  it("@spec:AC-026 esgotadas as tentativas, o trabalho fica registrado como falho para inspeção", async () => {
    const falhos = await fila.falhos();

    expect(falhos).toHaveLength(1);
    expect(falhos[0]?.id).toBe(trabalhoId);
    expect(falhos[0]?.nome).toBe("falhar-sempre");
    expect(falhos[0]?.tentativasFeitas).toBe(REPETICAO.tentativas);
    expect(falhos[0]?.motivo).toContain(MOTIVO);
    expect(falhos[0]?.falhouEm).toBeInstanceOf(Date);

    // O trabalho continua alcançável pelo identificador, e o estado dele diz o
    // que aconteceu. "Não desaparece" é exatamente isto: dá para ir olhar.
    const trabalho = await fila.fila.getJob(trabalhoId);
    expect(trabalho).toBeDefined();
    expect(await trabalho?.getState()).toBe("failed");
    expect(trabalho?.data).toEqual({ alvo: "nenhum" });

    // E não ficou pendurado em nenhum outro estado — nem esperando, nem em
    // execução, nem adiado para uma tentativa que nunca viria.
    const contagens = await fila.fila.getJobCounts();
    expect(contagens).toMatchObject({
      failed: 1,
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
    });

    // O aviso chega ao registro do servidor a cada tentativa, e só a última
    // diz que as tentativas acabaram.
    expect(falhas).toHaveLength(REPETICAO.tentativas);
    expect(falhas.map((falha) => falha.esgotou)).toEqual([false, false, true]);
    expect(falhas.at(-1)).toMatchObject({
      fila: NOME_DA_FILA,
      trabalhoId,
      tentativasFeitas: REPETICAO.tentativas,
      tentativasPermitidas: REPETICAO.tentativas,
      motivo: MOTIVO,
    });
  });
});

// ---------------------------------------------------------------------------
// Trabalho que falha por indisponibilidade temporária e depois passa
// ---------------------------------------------------------------------------

describe("trabalho que falha por indisponibilidade temporária", () => {
  const prefixo = prefixoDeTeste("temporaria");
  const NOME_DA_FILA = "prova-de-indisponibilidade";
  const REPETICAO_CURTA: PoliticaDeRepeticao = {
    tentativas: 3,
    esperaInicialMs: 200,
  };

  let fila: FilaAberta<TrabalhoDeProva>;
  let trabalhador: TrabalhadorAberto;
  let vezes = 0;

  beforeAll(async () => {
    fila = abrirFila<TrabalhoDeProva>({
      nome: NOME_DA_FILA,
      urlDoRedis: URL_DO_REDIS,
      prefixo,
      repeticao: REPETICAO_CURTA,
    });
    trabalhador = abrirTrabalhador<TrabalhoDeProva>({
      nome: NOME_DA_FILA,
      urlDoRedis: URL_DO_REDIS,
      prefixo,
      // O destino está fora do ar só na primeira tentativa — é o cenário que
      // o critério descreve: indisponibilidade temporária.
      processar: () => {
        vezes += 1;
        return vezes === 1
          ? Promise.reject(new Error(MOTIVO))
          : Promise.resolve();
      },
    });

    await fila.enfileirar("falhar-uma-vez", { alvo: "destino-intermitente" });
    await esperarPor(
      async () => (await fila.fila.getCompletedCount()) === 1,
      "o trabalho concluir na segunda tentativa",
      20_000,
    );
  });

  afterAll(async () => {
    await trabalhador.fechar();
    await fila.fechar();
    await limparPrefixo(URL_DO_REDIS, prefixo);
  });

  it("@spec:AC-026 ao tentar novamente o trabalho conclui, e nada fica registrado como falho", async () => {
    expect(vezes).toBe(2);
    expect(await fila.falhos()).toHaveLength(0);
    expect(await fila.fila.getJobCounts()).toMatchObject({
      completed: 1,
      failed: 0,
      waiting: 0,
      active: 0,
      delayed: 0,
    });
  });
});
