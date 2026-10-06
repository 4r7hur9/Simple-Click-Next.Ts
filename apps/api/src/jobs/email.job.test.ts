/**
 * A porta de saída de e-mail e o enfileiramento, conferidos sem Redis e sem
 * serviço externo.
 *
 * A prova de que a resposta não espera o envio está em `email.job.int.test.ts`,
 * onde existe fila de verdade. Aqui ficam as duas metades que não dependem de
 * infraestrutura: a mensagem montada e a promessa de que o enfileiramento nunca
 * derruba quem está respondendo à requisição.
 */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type Job } from "bullmq";
import { afterEach, describe, expect, it } from "vitest";

import { criarRegistrador, definirRegistrador } from "../core/log.ts";

import {
  ASSUNTO_DE_VERIFICACAO,
  criarProcessadorDeEmail,
  enfileirarEmailDeVerificacao,
  ErroDeEnvioNaoConfigurado,
  ErroDeTrabalhoDesconhecido,
  enviadorNaoConfigurado,
  montarEmailDeVerificacao,
  saidaDeEmailDoAmbiente,
  TRABALHOS_DE_EMAIL,
  type DadosDeEmail,
  type EnviadorDeEmail,
  type MensagemDeEmail,
} from "./email.job.ts";

const CADASTRO = {
  destinatario: "pessoa@exemplo.test",
  nome: "Ana",
  urlDeVerificacao: "https://app.localhost/verificar/abc123",
};

/** Trabalho da fila reduzido ao que o processador realmente lê. */
function trabalhoDeProva(nome: string, dados: DadosDeEmail): Job<DadosDeEmail> {
  return { name: nome, data: dados } as unknown as Job<DadosDeEmail>;
}

/** Duplo que apenas guarda o que recebeu. */
function enviadorQueGuarda(): {
  enviador: EnviadorDeEmail;
  recebidas: MensagemDeEmail[];
} {
  const recebidas: MensagemDeEmail[] = [];
  return {
    recebidas,
    enviador: {
      enviar: (mensagem) => {
        recebidas.push(mensagem);
        return Promise.resolve();
      },
    },
  };
}

describe("mensagem de verificação", () => {
  it("monta sempre o mesmo texto para os mesmos dados", () => {
    const mensagem = montarEmailDeVerificacao(CADASTRO);

    expect(mensagem).toEqual({
      destinatario: CADASTRO.destinatario,
      assunto: ASSUNTO_DE_VERIFICACAO,
      corpo: [
        "Olá, Ana.",
        "",
        "Confirme seu endereço de e-mail para terminar o cadastro:",
        CADASTRO.urlDeVerificacao,
        "",
        "Se não foi você quem se cadastrou, ignore esta mensagem.",
      ].join("\n"),
    });
  });
});

describe("processador da fila de e-mail", () => {
  it("entrega a mensagem montada à porta de saída", async () => {
    const { enviador, recebidas } = enviadorQueGuarda();
    const processar = criarProcessadorDeEmail(enviador);

    await processar(
      trabalhoDeProva(TRABALHOS_DE_EMAIL.verificacaoDeEmail, CADASTRO),
      "",
    );

    expect(recebidas).toEqual([montarEmailDeVerificacao(CADASTRO)]);
  });

  it("@spec:AC-026 deixa o erro do envio subir, para a fila poder repetir", async () => {
    const enviador: EnviadorDeEmail = {
      enviar: () => Promise.reject(new Error("destino fora do ar")),
    };
    const processar = criarProcessadorDeEmail(enviador);

    // Se este erro fosse capturado aqui, a fila registraria sucesso e o e-mail
    // sumiria sem nunca ter sido enviado — falha invisível, a pior de todas.
    await expect(
      processar(
        trabalhoDeProva(TRABALHOS_DE_EMAIL.verificacaoDeEmail, CADASTRO),
        "",
      ),
    ).rejects.toThrow("destino fora do ar");
  });

  it("recusa trabalho com nome que não conhece", async () => {
    const { enviador, recebidas } = enviadorQueGuarda();
    const processar = criarProcessadorDeEmail(enviador);

    await expect(
      processar(trabalhoDeProva("boleto-de-cobranca", CADASTRO), ""),
    ).rejects.toBeInstanceOf(ErroDeTrabalhoDesconhecido);
    expect(recebidas).toHaveLength(0);
  });
});

describe("adaptador de partida", () => {
  it("falha alto enquanto o provedor de e-mail não estiver escolhido", async () => {
    // Fingir que enviou produziria um sistema que parece funcionar e perde
    // todo e-mail. Falhando, o trabalho fica na fila em estado inspecionável e
    // a mensagem diz o que falta configurar.
    await expect(
      enviadorNaoConfigurado().enviar(montarEmailDeVerificacao(CADASTRO)),
    ).rejects.toBeInstanceOf(ErroDeEnvioNaoConfigurado);
  });
});

describe("enfileiramento do e-mail de verificação", () => {
  it("devolve o identificador do trabalho enfileirado", async () => {
    const enfileirados: { trabalho: string; dados: DadosDeEmail }[] = [];
    const fila = {
      enfileirar: (trabalho: string, dados: DadosDeEmail) => {
        enfileirados.push({ trabalho, dados });
        return Promise.resolve({ id: "42" } as Job<DadosDeEmail>);
      },
    };

    const resultado = await enfileirarEmailDeVerificacao(fila, CADASTRO);

    expect(resultado).toEqual({ enfileirado: true, trabalhoId: "42" });
    expect(enfileirados).toEqual([
      { trabalho: TRABALHOS_DE_EMAIL.verificacaoDeEmail, dados: CADASTRO },
    ]);
  });

  it("@spec:AC-025 fila fora do ar não derruba o cadastro: devolve o motivo em vez de lançar", async () => {
    const fila = {
      enfileirar: () => Promise.reject(new Error("Redis indisponível")),
    };

    // Quem está respondendo ao cadastro segue respondendo. O motivo volta
    // tipado para ser registrado — engolir em silêncio seria o caminho errado.
    const resultado = await enfileirarEmailDeVerificacao(fila, CADASTRO);

    expect(resultado).toEqual({
      enfileirado: false,
      motivo: "Redis indisponível",
    });
  });
});

describe("saída de e-mail conforme o ambiente (T-112)", () => {
  afterEach(() => definirRegistrador(undefined));

  it("@spec:AC-133 em produção sem provedor se declara indisponível e não finge que enviou", async () => {
    const saida = saidaDeEmailDoAmbiente({ NODE_ENV: "production" });

    expect(saida.disponivel).toBe(false);
    await expect(
      saida.enviar(montarEmailDeVerificacao(CADASTRO)),
    ).rejects.toBeInstanceOf(ErroDeEnvioNaoConfigurado);
  });

  it("@spec:AC-133 fora de produção só anota o assunto, sem endereço, código nem link", async () => {
    const linhas: string[] = [];
    definirRegistrador(
      criarRegistrador({
        nivel: "debug",
        ambiente: "test",
        destino: { write: (texto: string) => void linhas.push(texto) },
      }),
    );
    const saida = saidaDeEmailDoAmbiente({ NODE_ENV: "development" });

    expect(saida.disponivel).toBe(true);
    await saida.enviar(montarEmailDeVerificacao(CADASTRO));

    const registro = linhas.join(" ");
    expect(registro).toContain("email.registrado");
    expect(registro).toContain(ASSUNTO_DE_VERIFICACAO);
    expect(registro).not.toContain(CADASTRO.destinatario);
    expect(registro).not.toContain(CADASTRO.urlDeVerificacao);
  });

  it("@spec:AC-133 a caixa de prova do ponta a ponta grava a mensagem fora de produção e é ignorada em produção", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "sc-caixa-"));
    try {
      const fora = saidaDeEmailDoAmbiente({
        NODE_ENV: "development",
        CAIXA_DE_EMAIL_DE_PROVA: pasta,
      });
      await fora.enviar(montarEmailDeVerificacao(CADASTRO));
      const arquivos = await readdir(pasta);
      expect(arquivos).toHaveLength(1);
      const gravada = JSON.parse(
        await readFile(join(pasta, arquivos[0] ?? ""), "utf8"),
      ) as Record<string, unknown>;
      expect(gravada).toMatchObject({
        destinatario: CADASTRO.destinatario,
        assunto: ASSUNTO_DE_VERIFICACAO,
      });
      expect(String(gravada["corpo"])).toContain(CADASTRO.urlDeVerificacao);

      // Em produção a variável não abre caminho nenhum: continua indisponível
      // e nada novo chega à pasta.
      const producao = saidaDeEmailDoAmbiente({
        NODE_ENV: "production",
        CAIXA_DE_EMAIL_DE_PROVA: pasta,
      });
      expect(producao.disponivel).toBe(false);
      await expect(
        producao.enviar(montarEmailDeVerificacao(CADASTRO)),
      ).rejects.toBeInstanceOf(ErroDeEnvioNaoConfigurado);
      expect(await readdir(pasta)).toHaveLength(1);
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});
