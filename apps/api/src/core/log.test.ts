import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { executarComoRequisicao } from "./contexto.ts";
import {
  CABECALHO_DE_REQUISICAO,
  CAMPOS_PERMITIDOS,
  criarRegistrador,
  definirRegistrador,
  descreverErro,
  EVENTO_INVALIDO,
  EVENTOS,
  higienizar,
  middlewareDeRegistro,
  OMITIDO,
  type Registrador,
} from "./log.ts";

/**
 * Prova do registro estruturado (AC-021, AC-022, P-009).
 *
 * **Nada aqui é dado de pessoa real.** Os nomes de campo sensíveis moram em
 * constantes e os valores são inventados — é assim que o arquivo prova a
 * proteção sem virar, ele mesmo, um lugar onde dado pessoal está escrito.
 */

// ---------------------------------------------------------------------------
// Vocabulário do cenário
// ---------------------------------------------------------------------------

/** Nomes de campo que carregam dado pessoal ou segredo (LGPD, P-009). */
const CAMPO_TELEFONE = "telefone";
const CAMPO_ENDERECO = "endereco";
const CAMPO_CHAVE_PIX = "chavePix";
const CAMPO_SENHA = "senha";
const CAMPO_CREDENCIAL = "credencialDeAcesso";

/**
 * O campo que ainda não existia quando a proteção foi escrita.
 *
 * É ele que separa lista de permissão de lista de negação: uma lista do que é
 * proibido nunca ouviu falar deste nome e o deixaria passar inteiro.
 */
const CAMPO_RECEM_CRIADO = "documentoDoResponsavelFinanceiro";

/** Valores inventados. Nenhum pertence a ninguém. */
const VALOR_DE_CONTATO = "+55DDD900000000";
const VALOR_DE_LOCAL = "Rua Inventada, 100 - Bairro Inexistente";
const VALOR_DE_RECEBIMENTO = "ninguem-de-mentira@exemplo.invalido";
const VALOR_SECRETO = "abacaxi-de-mentira-987654";
const VALOR_DE_ACESSO = "portador-de-mentira-123456";
const VALOR_DE_DOCUMENTO = "000.000.000-00";

/** Todos os valores que jamais podem aparecer na saída do registro. */
const VALORES_PROIBIDOS = [
  VALOR_DE_CONTATO,
  VALOR_DE_LOCAL,
  VALOR_DE_RECEBIMENTO,
  VALOR_SECRETO,
  VALOR_DE_ACESSO,
  VALOR_DE_DOCUMENTO,
];

/** O corpo que a requisição carrega, com tudo que a LGPD protege. */
function corpoComDadoPessoal(): Record<string, unknown> {
  return {
    [CAMPO_TELEFONE]: VALOR_DE_CONTATO,
    [CAMPO_ENDERECO]: VALOR_DE_LOCAL,
    [CAMPO_CHAVE_PIX]: VALOR_DE_RECEBIMENTO,
    [CAMPO_SENHA]: VALOR_SECRETO,
    [CAMPO_CREDENCIAL]: VALOR_DE_ACESSO,
    [CAMPO_RECEM_CRIADO]: VALOR_DE_DOCUMENTO,
  };
}

const LOJA = "11111111-1111-4111-8111-111111111111";

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** Uma linha de registro já convertida de volta em objeto. */
type LinhaDeRegistro = Record<string, unknown>;

/** Registrador que guarda o que escreveria, para o teste ler. */
interface Coletor {
  readonly registrador: Registrador;
  /** O texto cru da saída — é nele que se procura por dado vazado. */
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

/** Devolve o controle ao laço de eventos, forçando a troca de tarefa. */
const cederAVez = (ms = 0): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/** Espera a saída acumular `quantas` linhas, ou desiste dizendo o que faltou. */
async function aguardarLinhas(
  coletor: Coletor,
  quantas: number,
  prazoMs = 2_000,
): Promise<LinhaDeRegistro[]> {
  const limite = Date.now() + prazoMs;
  while (coletor.linhas().length < quantas && Date.now() < limite) {
    await cederAVez(5);
  }
  const linhas = coletor.linhas();
  expect(
    linhas.length,
    `esperava ${quantas} linhas de registro e vieram ${linhas.length}`,
  ).toBeGreaterThanOrEqual(quantas);
  return linhas;
}

afterEach(() => {
  definirRegistrador(undefined);
});

// ---------------------------------------------------------------------------
// AC-021 — seguir uma requisição inteira
// ---------------------------------------------------------------------------

describe("identificador da requisição no registro", () => {
  it("@spec:AC-021 todas as linhas de uma requisição compartilham o mesmo identificador", async () => {
    const coletor = coletar();

    await executarComoRequisicao({ lojaId: LOJA }, async () => {
      coletor.registrador.info("pedido.recebido");
      // Duas cessões ao laço de eventos no meio: é o que separa "funciona no
      // exemplo" de "funciona numa requisição de verdade", que espera banco e
      // cache antes de registrar a próxima linha.
      await cederAVez();
      coletor.registrador.info("banco.consultado");
      await cederAVez(5);
      coletor.registrador.info("cache.gravado");
    });

    const linhas = coletor.linhas();
    expect(linhas).toHaveLength(3);

    const identificadores = new Set(linhas.map((linha) => linha.requisicaoId));
    expect(identificadores.size).toBe(1);
    expect(typeof linhas[0]?.requisicaoId).toBe("string");

    // O caminho inteiro é reconstruível: a ordem dos eventos está preservada.
    expect(linhas.map((linha) => linha.evento)).toEqual([
      "pedido.recebido",
      "banco.consultado",
      "cache.gravado",
    ]);
    // E o contexto viaja junto, sem nenhuma chamada ter passado a loja.
    expect(linhas.every((linha) => linha.lojaId === LOJA)).toBe(true);
  });

  it("@spec:AC-021 duas requisições simultâneas não trocam de identificador entre si", async () => {
    const coletor = coletar();

    async function requisicao(nome: string, espera: number): Promise<void> {
      await executarComoRequisicao({}, async () => {
        coletor.registrador.info(`${nome}.iniciou`);
        await cederAVez(espera);
        coletor.registrador.info(`${nome}.terminou`);
      });
    }

    // Esperas trocadas de propósito: a segunda requisição registra a linha do
    // meio ENTRE as duas linhas da primeira.
    await Promise.all([requisicao("primeira", 20), requisicao("segunda", 1)]);

    const linhas = coletor.linhas();
    expect(linhas).toHaveLength(4);

    const idDe = (evento: string): unknown =>
      linhas.find((linha) => linha.evento === evento)?.requisicaoId;

    expect(idDe("primeira.iniciou")).toBe(idDe("primeira.terminou"));
    expect(idDe("segunda.iniciou")).toBe(idDe("segunda.terminou"));
    expect(idDe("primeira.iniciou")).not.toBe(idDe("segunda.iniciou"));
  });

  it("@spec:AC-021 cada linha é um objeto JSON completo, legível por máquina", () => {
    const coletor = coletar();

    executarComoRequisicao({}, () => {
      coletor.registrador.info("pedido.criado", {
        recursoId: "abc",
        status: 201,
      });
    });

    const texto = coletor.bruto().trim();
    // Uma linha, um objeto: quem lê por máquina não precisa de gramática nova.
    expect(texto.split("\n")).toHaveLength(1);

    const linha = JSON.parse(texto) as LinhaDeRegistro;
    expect(linha).toMatchObject({
      evento: "pedido.criado",
      msg: "pedido.criado",
      recursoId: "abc",
      status: 201,
      servico: "simpleclick-api",
    });
    expect(typeof linha.time).toBe("number");
    expect(typeof linha.level).toBe("number");
  });

  it("@spec:AC-021 a resposta HTTP devolve o identificador que suas linhas carregam", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const app = express();
    app.use(middlewareDeRegistro());
    app.get("/tudo-certo", (_req, res) => {
      res.json({ ok: true });
    });

    const resposta = await request(app).get("/tudo-certo");
    const linhas = await aguardarLinhas(coletor, 2);

    const identificador = resposta.headers[CABECALHO_DE_REQUISICAO];
    expect(typeof identificador).toBe("string");

    // Início e fim da MESMA requisição, com o identificador que o cliente
    // recebeu: é isso que permite ir da reclamação de alguém até o registro.
    expect(linhas.map((linha) => linha.evento)).toEqual([
      EVENTOS.requisicaoIniciou,
      EVENTOS.requisicaoTerminou,
    ]);
    expect(linhas.every((l) => l.requisicaoId === identificador)).toBe(true);
    expect(linhas[1]).toMatchObject({
      metodo: "GET",
      rota: "/tudo-certo",
      status: 200,
    });
    expect(typeof linhas[1]?.duracaoMs).toBe("number");
  });

  it("@spec:AC-021 continua o identificador que o site enviou, para a jornada não partir na borda", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const app = express();
    app.use(middlewareDeRegistro());
    app.get("/vitrine", (_req, res) => {
      res.json({ ok: true });
    });

    const doSite = "jornada-do-site-0001";
    const resposta = await request(app)
      .get("/vitrine")
      .set(CABECALHO_DE_REQUISICAO, doSite);
    const linhas = await aguardarLinhas(coletor, 2);

    expect(resposta.headers[CABECALHO_DE_REQUISICAO]).toBe(doSite);
    expect(linhas.every((linha) => linha.requisicaoId === doSite)).toBe(true);
  });

  it("@spec:AC-021 recusa identificador malformado em vez de gravá-lo, e gera um próprio", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const app = express();
    app.use(middlewareDeRegistro());
    app.get("/vitrine", (_req, res) => {
      res.json({ ok: true });
    });

    // Identificador com aspas e espaço tenta emendar campos na linha de JSON.
    const forjado = `abc", "papel": "OWNER`;
    const resposta = await request(app)
      .get("/vitrine")
      .set(CABECALHO_DE_REQUISICAO, forjado);
    const linhas = await aguardarLinhas(coletor, 2);

    expect(resposta.headers[CABECALHO_DE_REQUISICAO]).not.toContain("papel");
    expect(linhas.every((linha) => linha.requisicaoId !== forjado)).toBe(true);
    // Sem forma reconhecida, o identificador é gerado aqui — a requisição
    // continua rastreável, só não pelo que o cliente mandou.
    expect(linhas.every((linha) => linha.papel === "PUBLIC")).toBe(true);
    expect(linhas[0]?.requisicaoId).toBe(linhas[1]?.requisicaoId);
  });
});

// ---------------------------------------------------------------------------
// AC-022 — dado pessoal e segredo nunca entram
// ---------------------------------------------------------------------------

describe("proteção por lista do que pode ser registrado", () => {
  it("@spec:AC-022 nenhum valor de dado pessoal ou segredo chega à saída", () => {
    const coletor = coletar();

    executarComoRequisicao({}, () => {
      coletor.registrador.info("cadastro.recebido", corpoComDadoPessoal());
    });

    const saida = coletor.bruto();
    for (const proibido of VALORES_PROIBIDOS) {
      expect(
        saida,
        `o valor de ${proibido} vazou para o registro`,
      ).not.toContain(proibido);
    }

    // O campo não some: some o VALOR. Quem investiga precisa saber que havia
    // algo ali — só não pode enxergá-lo.
    const linha = coletor.linhas()[0] ?? {};
    expect(linha[CAMPO_TELEFONE]).toBe(OMITIDO);
    expect(linha[CAMPO_CHAVE_PIX]).toBe(OMITIDO);
    expect(linha[CAMPO_SENHA]).toBe(OMITIDO);
    expect(linha[CAMPO_CREDENCIAL]).toBe(OMITIDO);
  });

  it("@spec:AC-022 o campo criado depois da proteção também não passa", () => {
    const coletor = coletar();

    executarComoRequisicao({}, () => {
      coletor.registrador.info("cadastro.recebido", {
        [CAMPO_RECEM_CRIADO]: VALOR_DE_DOCUMENTO,
        recursoId: "produto-1",
      });
    });

    const linha = coletor.linhas()[0] ?? {};
    // Este é o teste que separa as duas abordagens: uma lista do que é proibido
    // nunca ouviu falar deste nome de campo e o gravaria inteiro.
    expect(linha[CAMPO_RECEM_CRIADO]).toBe(OMITIDO);
    expect(coletor.bruto()).not.toContain(VALOR_DE_DOCUMENTO);
    // E o campo declarado continua passando, senão o registro não serviria.
    expect(linha.recursoId).toBe("produto-1");
  });

  it("@spec:AC-022 dado pessoal escondido dentro de objeto e de lista também não passa", () => {
    const coletor = coletar();

    executarComoRequisicao({}, () => {
      coletor.registrador.info("pedido.criado", {
        detalhe: {
          recursoId: "pedido-1",
          contato: corpoComDadoPessoal(),
          itens: [{ recursoId: "item-1", [CAMPO_ENDERECO]: VALOR_DE_LOCAL }],
        },
      });
    });

    const saida = coletor.bruto();
    for (const proibido of VALORES_PROIBIDOS) {
      expect(saida).not.toContain(proibido);
    }
    expect(saida).toContain("pedido-1");
    expect(saida).toContain("item-1");
  });

  it("@spec:AC-022 erro com detalhamento completo não leva a mensagem da biblioteca", () => {
    const coletor = coletar();

    // Erro no formato em que uma biblioteca de banco realmente entrega: com o
    // valor que causou a falha colado na mensagem.
    const falha = new Error(
      `invalid input syntax for type uuid: "${VALOR_DE_CONTATO}" em app.store_customers`,
    );

    executarComoRequisicao({}, () => {
      coletor.registrador.erro("banco.falhou", { erro: falha, status: 500 });
    });

    const saida = coletor.bruto();
    expect(saida).not.toContain(VALOR_DE_CONTATO);

    const erroRegistrado = (coletor.linhas()[0]?.erro ?? {}) as LinhaDeRegistro;
    // O detalhamento que sobra é o que serve para depurar sem expor ninguém:
    // classe do erro e quadros da pilha.
    expect(erroRegistrado.nome).toBe("Error");
    expect(erroRegistrado.mensagem).toBeUndefined();
    expect(Array.isArray(erroRegistrado.pilha)).toBe(true);
    expect((erroRegistrado.pilha as string[])[0]).toMatch(/^at /);
  });

  it("@spec:AC-022 erro escrito por nós tem a mensagem registrada, porque quem a escreveu fomos nós", () => {
    const coletor = coletar();

    const nosso = Object.assign(new Error("Loja suspensa não recebe pedido."), {
      mensagemEscritaPorNos: true as const,
    });

    executarComoRequisicao({}, () => {
      coletor.registrador.aviso("pedido.recusado", { erro: nosso });
    });

    const erroRegistrado = (coletor.linhas()[0]?.erro ?? {}) as LinhaDeRegistro;
    expect(erroRegistrado.mensagem).toBe("Loja suspensa não recebe pedido.");
  });

  it("@spec:AC-022 texto solto no lugar do nome do evento não vira linha de registro", () => {
    const coletor = coletar();

    executarComoRequisicao({}, () => {
      coletor.registrador.info(`contato ${VALOR_DE_CONTATO}`);
      coletor.registrador.info(VALOR_DE_LOCAL);
    });

    const saida = coletor.bruto();
    expect(saida).not.toContain(VALOR_DE_CONTATO);
    expect(saida).not.toContain(VALOR_DE_LOCAL);
    // A linha continua saindo — registrador que lança derruba a requisição que
    // ele só deveria descrever —, mas sai sem nome, e isso salta aos olhos.
    expect(coletor.linhas().every((l) => l.evento === EVENTO_INVALIDO)).toBe(
      true,
    );
  });

  it("@spec:AC-022 o que é lançado sem ser erro entra como omitido, não como texto", () => {
    const coletor = coletar();

    executarComoRequisicao({}, () => {
      coletor.registrador.erro("falha.estranha", {
        erro: descreverErro(VALOR_SECRETO),
      });
    });

    expect(coletor.bruto()).not.toContain(VALOR_SECRETO);
    const erroRegistrado = (coletor.linhas()[0]?.erro ?? {}) as LinhaDeRegistro;
    expect(erroRegistrado).toEqual({ nome: "naoErro", mensagem: OMITIDO });
  });

  it("@spec:AC-022 a rota registrada é o molde, nunca o endereço com o token do pedido", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);

    const app = express();
    app.use(middlewareDeRegistro());
    app.get("/v1/orders/track/:token", (_req, res) => {
      res.json({ ok: true });
    });

    await request(app).get(`/v1/orders/track/${VALOR_DE_ACESSO}`);
    const linhas = await aguardarLinhas(coletor, 2);

    // O token do link de acompanhamento é credencial: gravá-lo no registro é
    // entregar o pedido de alguém a quem tiver acesso ao registro.
    expect(coletor.bruto()).not.toContain(VALOR_DE_ACESSO);
    expect(linhas[1]?.rota).toBe("/v1/orders/track/:token");
  });

  it("@spec:AC-022 a lista de permissão não contém nenhum campo de dado pessoal", () => {
    for (const campo of [
      CAMPO_TELEFONE,
      CAMPO_ENDERECO,
      CAMPO_CHAVE_PIX,
      CAMPO_SENHA,
      CAMPO_CREDENCIAL,
      CAMPO_RECEM_CRIADO,
    ]) {
      expect(CAMPOS_PERMITIDOS.has(campo)).toBe(false);
    }
  });

  it("@spec:AC-022 a higienização não se perde em estrutura circular nem em lista enorme", () => {
    const circular: Record<string, unknown> = { recursoId: "a" };
    circular.detalhe = circular;

    const limpo = higienizar(circular);
    expect(limpo.recursoId).toBe("a");
    // Fundo alcançado vira omissão, e não recursão infinita derrubando a API.
    expect(JSON.stringify(limpo)).toContain(OMITIDO);

    const enorme = higienizar({
      campos: Array.from({ length: 500 }, (_, i) => `campo-${i}`),
    });
    expect((enorme.campos as string[]).length).toBeLessThanOrEqual(50);
  });
});
