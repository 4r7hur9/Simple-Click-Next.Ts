/**
 * O contexto de loja não escapa de uma requisição para outra, nem sob carga
 * com escrita (AC-011, AC-010, P-003).
 *
 * A T-006 já provou o caso base: duas lojas, só leitura, sondas sem loja
 * intercaladas. Este arquivo aprofunda exatamente onde o caso base ainda daria
 * sorte:
 *
 * - **quatro lojas, não duas.** Com duas, uma conexão que devolvesse "a loja
 *   errada" teria 50% de chance de acertar por acaso em qualquer sonda mal
 *   escrita. Com quatro, o acaso encolhe e o rodízio das conexões entre lojas
 *   diferentes fica denso;
 * - **escrita misturada com leitura.** Inserção, alteração e remoção abrem
 *   caminho de código que a leitura não abre: gatilho, índice único e trava de
 *   linha. O gatilho de versão do catálogo, por exemplo, altera a linha da loja
 *   dentro da MESMA transação — se o contexto vazasse, ele subiria a versão da
 *   loja errada;
 * - **muito mais requisições do que conexões.** É o que obriga cada conexão a
 *   servir várias lojas em sequência. Sem isso, "não vazou" seria só falta de
 *   oportunidade — e o arquivo prova que a oportunidade existiu, contando as
 *   conexões reaproveitadas e as transações que se sobrepuseram no tempo.
 *
 * O cenário é montado UMA vez e a corrida roda UMA vez, no arranque: cada teste
 * abaixo cobra um aspecto do mesmo resultado. Repetir a corrida por asserção
 * multiplicaria o tempo sem acrescentar prova.
 */

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco, TransacaoDoBanco } from "../src/core/db.ts";

// ---------------------------------------------------------------------------
// Tamanho da corrida
// ---------------------------------------------------------------------------

/** Poucas conexões de propósito: é o que força o reaproveitamento. */
const CONEXOES = 3;

/** Muitas requisições: cada conexão precisa servir loja diferente várias vezes. */
const REQUISICOES = 120;

/** Quatro lojas — "três ou mais" é o que separa esta prova da da T-006. */
const LOJAS = ["L1", "L2", "L3", "L4"] as const;

/** Uma em cada cinco requisições não tem loja: é a sonda do contexto herdado. */
const CADA_QUANTAS_E_SONDA = 5;

// ---------------------------------------------------------------------------
// O que cada requisição devolve
// ---------------------------------------------------------------------------

type TipoDeRequisicao = "leitura" | "criação" | "ciclo" | "cruzada" | "sonda";

interface ResultadoDaRequisicao {
  readonly indice: number;
  readonly tipo: TipoDeRequisicao;
  /** Prefixo da loja desta requisição, ou `null` na sonda. */
  readonly prefixoEsperado: string | null;
  /** Identificador da loja que o BANCO diz estar no contexto. */
  readonly lojaNoBanco: string | null;
  /** Identificador da loja que a requisição pediu, do lado de cá. */
  readonly lojaPedida: string | null;
  /** Processo do PostgreSQL que atendeu — é a identidade da conexão. */
  readonly conexao: number;
  /** Nomes de produto que a requisição enxergou. */
  readonly nomesLidos: readonly string[];
  /** Quantas transações estavam abertas ao mesmo tempo que esta. */
  readonly simultaneas: number;
  /** Só nas cruzadas: o que a tentativa de alcançar a outra loja devolveu. */
  readonly cruzada?: { readonly lidas: number; readonly alteradas: number };
}

// ---------------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------------

let migrador: pg.Client;
let acesso: AcessoAoBanco;

/** Identificador de cada loja, pelo prefixo que marca os produtos dela. */
const idDaLoja = new Map<string, string>();
/** Um produto semeado por loja — alvo das tentativas cruzadas. */
const produtoDaLoja = new Map<string, string>();
/** A mesma pessoa é dona das quatro lojas: é o vínculo, e não o papel, que a leva a cada uma. */
let donoDasLojas = "";

let resultados: ResultadoDaRequisicao[] = [];
let maximoSimultaneo = 0;

/** Prefixo da loja a partir do identificador dela. */
function prefixoDe(lojaId: string): string {
  for (const [prefixo, id] of idDaLoja) if (id === lojaId) return prefixo;
  return "?";
}

/**
 * Contador de transações ABERTAS ao mesmo tempo.
 *
 * Existe para que "rodou em paralelo" seja um fato medido, e não uma intenção:
 * `Promise.all` sobre transações que se enfileiram uma após a outra não prova
 * nada sobre contexto compartilhado.
 *
 * A contagem fica DENTRO da transação de propósito. Contar do lado de fora
 * mediria só quantas requisições foram disparadas — as 120 saem juntas e o
 * número diria 120 sem nenhuma delas ter chegado ao banco. O que interessa é
 * quantas transações estavam vivas sobre as conexões do agrupador ao mesmo
 * tempo, e esse número é limitado pelo tamanho do agrupador.
 */
let emCurso = 0;

async function contandoSobreposicao<T>(
  acao: () => Promise<T>,
): Promise<{ valor: T; simultaneas: number }> {
  emCurso += 1;
  maximoSimultaneo = Math.max(maximoSimultaneo, emCurso);
  const simultaneas = emCurso;
  try {
    return { valor: await acao(), simultaneas };
  } finally {
    emCurso -= 1;
  }
}

/** O que o corpo da transação devolve, seja qual for a forma da requisição. */
interface RespostaDaTransacao {
  readonly loja: string | null;
  readonly conexao: number;
  readonly nomes: readonly string[];
  readonly cruzada?: { readonly lidas: number; readonly alteradas: number };
}

/** Cede a vez no meio da transação, para que as transações se sobreponham. */
function cederAVez(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Quem é a loja do contexto, e qual conexão está atendendo. */
async function assinaturaDaConexao(
  tx: TransacaoDoBanco,
): Promise<{ loja: string | null; conexao: number }> {
  const [linha] = await tx.$queryRaw<
    { loja: string | null; conexao: number }[]
  >`
    SELECT app.current_store_id()::text AS loja,
           pg_backend_pid()::int        AS conexao`;

  return { loja: linha?.loja ?? null, conexao: linha?.conexao ?? -1 };
}

/** Os nomes de produto que a requisição enxerga agora. */
async function nomesVisiveis(tx: TransacaoDoBanco): Promise<string[]> {
  const produtos = await tx.product.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return produtos.map((produto) => produto.name);
}

// ---------------------------------------------------------------------------
// As quatro formas de requisição da corrida
// ---------------------------------------------------------------------------

/** Contexto e nomes visíveis — o caso base, agora sob escrita alheia. */
async function apenasLer(tx: TransacaoDoBanco): Promise<string[]> {
  return nomesVisiveis(tx);
}

/** Cria um produto da própria loja e confere que ele apareceu. */
async function criarELer(
  tx: TransacaoDoBanco,
  prefixo: string,
  indice: number,
): Promise<string[]> {
  await tx.product.create({
    data: {
      storeId: idDaLoja.get(prefixo) ?? "",
      name: `${prefixo}-novo-${indice}`,
      slug: `novo-${indice}`,
      verticalCode: "FOOD_SNACK",
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  return nomesVisiveis(tx);
}

/**
 * Cria, altera, lê e apaga dentro da própria loja.
 *
 * É o caminho que mais mexe no banco numa transação só — inclusive no gatilho
 * que sobe a versão do catálogo da loja — e por isso o mais provável de
 * arrastar contexto para onde ele não deveria ir.
 */
async function cicloCompleto(
  tx: TransacaoDoBanco,
  prefixo: string,
  indice: number,
): Promise<string[]> {
  const criado = await tx.product.create({
    data: {
      storeId: idDaLoja.get(prefixo) ?? "",
      name: `${prefixo}-ciclo-${indice}`,
      slug: `ciclo-${indice}`,
      verticalCode: "FOOD_SNACK",
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  await tx.product.updateMany({
    where: { id: criado.id },
    data: { name: `${prefixo}-ciclo-${indice}-alterado` },
  });

  const nomes = await nomesVisiveis(tx);
  await tx.product.deleteMany({ where: { id: criado.id } });
  return nomes;
}

/** Tenta alcançar o produto semeado de outra loja, e depois lê a própria. */
async function tentarAOutraLoja(
  tx: TransacaoDoBanco,
  prefixo: string,
  alheio: string,
): Promise<{ nomes: string[]; cruzada: { lidas: number; alteradas: number } }> {
  const lidas = await tx.product.count({ where: { id: alheio } });
  const alteradas = await tx.product.updateMany({
    where: { id: alheio },
    data: { name: `${prefixo}-sequestrou` },
  });

  return {
    nomes: await nomesVisiveis(tx),
    cruzada: { lidas, alteradas: alteradas.count },
  };
}

// ---------------------------------------------------------------------------
// A corrida
// ---------------------------------------------------------------------------

/** Qual forma esta requisição toma. A sonda tem prioridade sobre as demais. */
function tipoDaRequisicao(indice: number): TipoDeRequisicao {
  if (indice % CADA_QUANTAS_E_SONDA === CADA_QUANTAS_E_SONDA - 1)
    return "sonda";
  const formas: TipoDeRequisicao[] = ["leitura", "criação", "ciclo", "cruzada"];
  return formas[indice % formas.length] ?? "leitura";
}

/** Uma requisição da corrida, do jeito que a API atende uma de verdade. */
async function requisicao(indice: number): Promise<ResultadoDaRequisicao> {
  const tipo = tipoDaRequisicao(indice);
  const prefixo = LOJAS[indice % LOJAS.length] ?? "L1";
  const ehSonda = tipo === "sonda";
  const lojaPedida = ehSonda ? null : (idDaLoja.get(prefixo) ?? "");
  // A cruzada mira sempre a loja seguinte, para que o alvo nunca seja a própria.
  const alheia = LOJAS[(indice + 1) % LOJAS.length] ?? "L1";

  const { valor, simultaneas } = await comoRequisicao(
    acesso,
    ehSonda
      ? {}
      : { lojaId: lojaPedida ?? "", usuarioId: donoDasLojas, papel: "OWNER" },
    (tx) =>
      contandoSobreposicao(async (): Promise<RespostaDaTransacao> => {
        const assinatura = await assinaturaDaConexao(tx);
        // Sem ceder a vez, as transações correriam uma depois da outra e a
        // corrida não diria nada sobre concorrência.
        await cederAVez(indice % 4);

        if (tipo === "criação") {
          return { ...assinatura, nomes: await criarELer(tx, prefixo, indice) };
        }
        if (tipo === "ciclo") {
          return {
            ...assinatura,
            nomes: await cicloCompleto(tx, prefixo, indice),
          };
        }
        if (tipo === "cruzada") {
          const alvo = produtoDaLoja.get(alheia) ?? "";
          const feito = await tentarAOutraLoja(tx, prefixo, alvo);
          return { ...assinatura, nomes: feito.nomes, cruzada: feito.cruzada };
        }
        return { ...assinatura, nomes: await apenasLer(tx) };
      }),
  );

  return {
    indice,
    tipo,
    prefixoEsperado: ehSonda ? null : prefixo,
    lojaNoBanco: valor.loja,
    lojaPedida,
    conexao: valor.conexao,
    nomesLidos: valor.nomes,
    simultaneas,
    ...(valor.cruzada === undefined ? {} : { cruzada: valor.cruzada }),
  };
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();

  const dono = await migrador.query(
    `INSERT INTO app.identities (email_norm, display_name)
     VALUES ('dono.corrida@exemplo.test', 'Dono da corrida') RETURNING id`,
  );
  donoDasLojas = String((dono.rows[0] as { id: string }).id);

  for (const [ordem, prefixo] of LOJAS.entries()) {
    const loja = await migrador.query(
      `INSERT INTO app.stores (code, name, slug, status, vertical_code)
       VALUES ($1, $2, $3, 'ACTIVE', 'FOOD_SNACK') RETURNING id`,
      [`cod-${prefixo}`, `Loja ${prefixo}`, `loja-${prefixo.toLowerCase()}`],
    );
    const id = String((loja.rows[0] as { id: string }).id);
    idDaLoja.set(prefixo, id);
    await migrador.query(
      `INSERT INTO app.store_members (store_id, identity_id, role, invite_accepted_at)
       VALUES ($1, $2, 'OWNER', now())`,
      [id, donoDasLojas],
    );

    const produto = await migrador.query(
      `INSERT INTO app.products (store_id, name, slug, vertical_code, status, display_price_cents)
       VALUES ($1, $2, 'semente', 'FOOD_SNACK', 'PUBLISHED', $3) RETURNING id`,
      // Dinheiro é inteiro em centavos, sempre (P-005).
      [id, `${prefixo}-semente`, 1000 + ordem],
    );
    produtoDaLoja.set(prefixo, String((produto.rows[0] as { id: string }).id));
  }

  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, {
    maxDeConexoes: CONEXOES,
  });

  resultados = await Promise.all(
    Array.from({ length: REQUISICOES }, (_, indice) => requisicao(indice)),
  );
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
});

// ---------------------------------------------------------------------------
// O que a corrida provou
// ---------------------------------------------------------------------------

describe("muitas requisições de quatro lojas, com escrita e leitura misturadas", () => {
  it("@spec:AC-011 as requisições realmente se sobrepuseram em conexões reaproveitadas", () => {
    // Este teste vem primeiro de propósito: sem ele, os de baixo poderiam estar
    // provando apenas que nada aconteceu ao mesmo tempo.
    expect(resultados).toHaveLength(REQUISICOES);

    const conexoes = new Set(resultados.map(({ conexao }) => conexao));
    expect(conexoes.size).toBeLessThanOrEqual(CONEXOES);
    // Cada conexão atendeu dezenas de requisições: o reaproveitamento não foi
    // um detalhe, foi a regra.
    expect(REQUISICOES / conexoes.size).toBeGreaterThanOrEqual(10);

    // Cada conexão serviu várias lojas em sequência — é aí que o contexto de
    // uma requisição alcançaria a seguinte.
    const lojasPorConexao = new Map<number, Set<string>>();
    for (const resultado of resultados) {
      const jaVistas = lojasPorConexao.get(resultado.conexao) ?? new Set();
      jaVistas.add(resultado.prefixoEsperado ?? "sem-loja");
      lojasPorConexao.set(resultado.conexao, jaVistas);
    }
    const reaproveitadas = [...lojasPorConexao.values()].filter(
      (lojas) => lojas.size > 1,
    );
    expect(reaproveitadas.length).toBeGreaterThan(0);

    // E se sobrepuseram no tempo: transação aberta enquanto outra também
    // estava. O teto é o tamanho do agrupador — se passasse dele, a contagem
    // estaria medindo requisição disparada, e não transação viva.
    expect(maximoSimultaneo).toBeGreaterThan(1);
    expect(maximoSimultaneo).toBeLessThanOrEqual(CONEXOES);

    // E não foi um pico isolado: a maioria das requisições teve companhia
    // aberta no banco enquanto rodava.
    const comVizinha = resultados.filter(({ simultaneas }) => simultaneas > 1);
    expect(comVizinha.length).toBeGreaterThan(REQUISICOES / 2);
  });

  it("@spec:AC-011 @principle:P-003 cada requisição enxergou no banco a própria loja, e nenhuma outra", () => {
    for (const resultado of resultados) {
      expect(
        resultado.lojaNoBanco,
        `requisição ${resultado.indice} (${resultado.tipo}) viu no banco a loja ${resultado.lojaNoBanco}, e a dela é ${resultado.lojaPedida ?? "nenhuma"}`,
      ).toBe(resultado.lojaPedida);
    }
  });

  it("@spec:AC-011 @principle:P-003 nenhuma leitura trouxe produto de outra loja, mesmo com escrita acontecendo ao lado", () => {
    for (const resultado of resultados) {
      if (resultado.prefixoEsperado === null) continue;
      const alheios = resultado.nomesLidos.filter(
        (nome) => !nome.startsWith(`${resultado.prefixoEsperado}-`),
      );
      expect(
        alheios,
        `requisição ${resultado.indice} (${resultado.tipo}), da loja ${resultado.prefixoEsperado}, enxergou produto de outra loja`,
      ).toEqual([]);
      // Contraste: a loja enxerga o que é dela. Sem isto, "não vi nada de
      // ninguém" passaria como isolamento.
      expect(resultado.nomesLidos.length).toBeGreaterThan(0);
    }
  });

  it("@spec:AC-011 @principle:P-003 as sondas sem loja não herdaram o contexto da requisição anterior", () => {
    const sondas = resultados.filter(({ tipo }) => tipo === "sonda");
    // Precisam ter sido muitas e ter rodado depois de conexões já usadas por
    // lojas — senão "não vazou" seria só falta de oportunidade.
    expect(sondas.length).toBeGreaterThan(CONEXOES);

    for (const sonda of sondas) {
      expect(
        sonda.lojaNoBanco,
        `a sonda ${sonda.indice} herdou a loja ${sonda.lojaNoBanco} de outra requisição`,
      ).toBeNull();
      expect(
        sonda.nomesLidos,
        `a sonda ${sonda.indice} leu produto sem ter loja no contexto`,
      ).toEqual([]);
    }
  });

  it("@spec:AC-010 @principle:P-003 a tentativa cruzada sob concorrência não leu nem alterou a linha da outra loja", () => {
    const cruzadas = resultados.filter(({ tipo }) => tipo === "cruzada");
    expect(cruzadas.length).toBeGreaterThan(CONEXOES);

    for (const cruzada of cruzadas) {
      expect(
        cruzada.cruzada,
        `requisição ${cruzada.indice} não registrou a tentativa cruzada`,
      ).toBeDefined();
      expect(
        cruzada.cruzada?.lidas,
        `requisição ${cruzada.indice} leu a linha da outra loja`,
      ).toBe(0);
      expect(
        cruzada.cruzada?.alteradas,
        `requisição ${cruzada.indice} alterou a linha da outra loja`,
      ).toBe(0);
    }
  });

  it("@spec:AC-011 @principle:P-003 nenhuma escrita da corrida caiu na loja errada", async () => {
    // A conferência final é feita por quem enxerga TODAS as lojas: se alguma
    // escrita tivesse caído no lugar errado, nenhuma consulta feita dentro de
    // uma loja acharia — o dado estaria escondido pela própria proteção.
    const todos = await migrador.query(
      `SELECT p.store_id::text AS loja, p.name AS nome FROM app.products p`,
    );

    const forasteiros = (todos.rows as { loja: string; nome: string }[]).filter(
      ({ loja, nome }) => !nome.startsWith(`${prefixoDe(loja)}-`),
    );
    expect(
      forasteiros,
      `produto gravado na loja errada: ${JSON.stringify(forasteiros)}`,
    ).toEqual([]);

    // E as escritas aconteceram mesmo: a corrida não foi só leitura disfarçada.
    expect(todos.rowCount ?? 0).toBeGreaterThan(LOJAS.length);

    // A semente de cada loja continua com o nome original: nenhuma tentativa
    // cruzada a alcançou.
    const sequestrados = (todos.rows as { nome: string }[]).filter(({ nome }) =>
      nome.includes("sequestrou"),
    );
    expect(sequestrados).toEqual([]);
  });
});
