import express, { type Express } from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import {
  CATALOGO_DE_ERROS,
  ehCodigoDeErro,
  erroDeDominio,
  ErroDeDominio,
  manipuladorDeErros,
  REFERENCIA_SEM_CONTEXTO,
  respostaDeErro,
} from "./erros.ts";
import {
  CABECALHO_DE_REQUISICAO,
  criarRegistrador,
  definirRegistrador,
  middlewareDeRegistro,
  OMITIDO,
  type Registrador,
} from "./log.ts";

/**
 * Prova de que o erro não vaza detalhe interno para quem chamou (AC-024).
 *
 * A montagem é a mesma de `app.ts`: registro na frente, rota que falha no meio,
 * manipulador de erros no fim. Provar com outra montagem provaria outra coisa.
 *
 * Como em `log.test.ts`, nome de campo sensível mora em constante e valor é
 * inventado — o arquivo de teste também não pode ser lugar de dado pessoal.
 */

// ---------------------------------------------------------------------------
// Vocabulário do cenário
// ---------------------------------------------------------------------------

const CAMPO_TELEFONE = "telefone";
const VALOR_DE_CONTATO = "+55DDD900000000";

/** Nome de tabela real do esquema: é exatamente o que não pode sair na resposta. */
const TABELA_INTERNA = "app.store_customers";

/** Falha do jeito que uma biblioteca de banco entrega: tabela e valor na mensagem. */
function falhaDeBiblioteca(): Error {
  return new Error(
    `insert into "${TABELA_INTERNA}" failed: invalid input syntax for type uuid: "${VALOR_DE_CONTATO}"`,
  );
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

type LinhaDeRegistro = Record<string, unknown>;

interface Coletor {
  readonly registrador: Registrador;
  bruto(): string;
  linhas(): LinhaDeRegistro[];
}

function coletar(): Coletor {
  const escritas: string[] = [];
  const registrador = criarRegistrador({
    nivel: "debug",
    ambiente: "test",
    destino: {
      write(mensagem: string) {
        escritas.push(mensagem);
      },
    },
  });

  return {
    registrador,
    bruto: () => escritas.join(""),
    linhas: () =>
      escritas
        .join("")
        .split("\n")
        .filter((linha) => linha.trim() !== "")
        .map((linha) => JSON.parse(linha) as LinhaDeRegistro),
  };
}

/** A composição da API, reduzida ao que interessa a este arquivo. */
function appQueFalha(lancar: () => never): Express {
  const app = express();
  app.use(middlewareDeRegistro());
  app.get("/v1/store/products", (_req, _res) => {
    lancar();
  });
  app.use(manipuladorDeErros());
  return app;
}

afterEach(() => {
  definirRegistrador(undefined);
});

// ---------------------------------------------------------------------------
// AC-024
// ---------------------------------------------------------------------------

describe("resposta de erro", () => {
  it("@spec:AC-024 falha inesperada responde mensagem genérica com código de referência", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const resposta = await request(
      appQueFalha(() => {
        throw falhaDeBiblioteca();
      }),
    ).get("/v1/store/products");

    expect(resposta.status).toBe(500);
    // A resposta tem estas três chaves e nenhuma outra: nada de "detalhe",
    // "stack" ou "originalError" entrando de carona numa versão futura.
    expect(Object.keys(resposta.body)).toEqual(["erro"]);
    expect(Object.keys(resposta.body.erro).sort()).toEqual([
      "codigo",
      "mensagem",
      "referencia",
    ]);
    expect(resposta.body.erro.codigo).toBe("erro_interno");
    expect(resposta.body.erro.mensagem).toBe(
      CATALOGO_DE_ERROS.erro_interno.mensagem,
    );
    expect(resposta.body.erro.referencia).toBe(
      resposta.headers[CABECALHO_DE_REQUISICAO],
    );
  });

  it("@spec:AC-024 a resposta não traz pilha de execução nem nome de tabela", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const resposta = await request(
      appQueFalha(() => {
        throw falhaDeBiblioteca();
      }),
    ).get("/v1/store/products");

    const corpo = JSON.stringify(resposta.body);
    expect(corpo).not.toContain(TABELA_INTERNA);
    expect(corpo).not.toContain(VALOR_DE_CONTATO);
    // Pilha de execução entrega caminho de arquivo e estrutura interna.
    expect(corpo).not.toMatch(/\bat\s+\S+\s+\(/);
    expect(corpo).not.toContain("erros.ts");
    expect(corpo).not.toContain("node_modules");
    expect(corpo).not.toContain("invalid input syntax");
  });

  it("@spec:AC-024 o detalhamento técnico fica no registro do servidor, e só lá", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const resposta = await request(
      appQueFalha(() => {
        throw falhaDeBiblioteca();
      }),
    ).get("/v1/store/products");

    const linhaDaFalha = coletor
      .linhas()
      .find((linha) => linha.evento === "requisicao.falhou");
    expect(
      linhaDaFalha,
      "a falha não foi registrada no servidor",
    ).toBeDefined();

    const registrado = linhaDaFalha as LinhaDeRegistro;
    // A mesma referência liga a resposta que a pessoa recebeu ao registro que
    // quem investiga vai ler (AC-021 + AC-024).
    expect(registrado.referencia).toBe(resposta.body.erro.referencia);
    expect(registrado.requisicaoId).toBe(resposta.body.erro.referencia);
    expect(registrado.status).toBe(500);

    const erroRegistrado = (registrado.erro ?? {}) as LinhaDeRegistro;
    expect(erroRegistrado.nome).toBe("Error");
    expect(Array.isArray(erroRegistrado.pilha)).toBe(true);
    expect((erroRegistrado.pilha as string[])[0]).toMatch(/^at /);

    // Nem no registro: a mensagem da biblioteca trazia o dado pessoal colado.
    expect(coletor.bruto()).not.toContain(VALOR_DE_CONTATO);
    expect(erroRegistrado.mensagem).toBeUndefined();
  });

  it("@spec:AC-024 erro de domínio responde o status e o texto do catálogo, sem detalhe", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const resposta = await request(
      appQueFalha(() => {
        throw erroDeDominio("nao_encontrado", {
          recurso: "produto",
          recursoId: "produto-42",
        });
      }),
    ).get("/v1/store/products");

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro.codigo).toBe("nao_encontrado");
    expect(resposta.body.erro.mensagem).toBe(
      CATALOGO_DE_ERROS.nao_encontrado.mensagem,
    );
    // O detalhe existe — só que ele é do servidor, não da resposta.
    expect(JSON.stringify(resposta.body)).not.toContain("produto-42");

    const linhaDaFalha = coletor
      .linhas()
      .find((linha) => linha.evento === "requisicao.falhou");
    expect((linhaDaFalha?.detalhe ?? {}) as LinhaDeRegistro).toMatchObject({
      recurso: "produto",
      recursoId: "produto-42",
    });
  });

  it("@spec:AC-024 dado pessoal posto no detalhe do erro não chega nem à resposta nem ao registro", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const resposta = await request(
      appQueFalha(() => {
        throw erroDeDominio("entrada_invalida", {
          recurso: "cliente",
          [CAMPO_TELEFONE]: VALOR_DE_CONTATO,
        });
      }),
    ).get("/v1/store/products");

    expect(resposta.status).toBe(400);
    expect(JSON.stringify(resposta.body)).not.toContain(VALOR_DE_CONTATO);
    expect(coletor.bruto()).not.toContain(VALOR_DE_CONTATO);

    const linhaDaFalha = coletor
      .linhas()
      .find((linha) => linha.evento === "requisicao.falhou");
    const detalhe = (linhaDaFalha?.detalhe ?? {}) as LinhaDeRegistro;
    expect(detalhe[CAMPO_TELEFONE]).toBe(OMITIDO);
    expect(detalhe.recurso).toBe("cliente");
  });

  it("@spec:AC-024 o que é lançado sem ser erro também vira resposta genérica", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const resposta = await request(
      appQueFalha(() => {
        // Em JavaScript se lança qualquer coisa, inclusive o corpo recebido.
        throw { [CAMPO_TELEFONE]: VALOR_DE_CONTATO } as never;
      }),
    ).get("/v1/store/products");

    expect(resposta.status).toBe(500);
    expect(resposta.body.erro.codigo).toBe("erro_interno");
    expect(JSON.stringify(resposta.body)).not.toContain(VALOR_DE_CONTATO);
    expect(coletor.bruto()).not.toContain(VALOR_DE_CONTATO);
  });

  it("@spec:AC-024 falha fora de contexto ainda responde com referência, sem quebrar", () => {
    const { status, corpo } = respostaDeErro(
      falhaDeBiblioteca(),
      REFERENCIA_SEM_CONTEXTO,
    );

    expect(status).toBe(500);
    expect(corpo.erro.referencia).toBe(REFERENCIA_SEM_CONTEXTO);
    expect(JSON.stringify(corpo)).not.toContain(TABELA_INTERNA);
  });
});

describe("catálogo de erros", () => {
  it("@spec:AC-024 todo código do catálogo tem status e texto escritos à mão", () => {
    for (const [codigo, entrada] of Object.entries(CATALOGO_DE_ERROS)) {
      expect(ehCodigoDeErro(codigo)).toBe(true);
      expect(entrada.status).toBeGreaterThanOrEqual(400);
      expect(entrada.mensagem.length).toBeGreaterThan(10);
      // Texto genérico não nomeia nada de dentro: nem tabela, nem coluna,
      // nem arquivo.
      expect(entrada.mensagem).not.toMatch(/app\.|\.ts|SELECT|INSERT/);
    }
    expect(ehCodigoDeErro("codigo_que_nao_existe")).toBe(false);
  });

  it("@spec:AC-024 o erro de domínio nasce com a mensagem do catálogo, e não com texto do momento", () => {
    const erro = new ErroDeDominio("sem_permissao", { recurso: "pedido" });

    expect(erro).toBeInstanceOf(Error);
    expect(erro.status).toBe(403);
    expect(erro.message).toBe(CATALOGO_DE_ERROS.sem_permissao.mensagem);
    // A marca é o que autoriza o registro a gravar esta mensagem: ela é nossa.
    expect(erro.mensagemEscritaPorNos).toBe(true);
  });
});
