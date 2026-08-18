import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aplicarMigracoes, derivarUrlDePapel } from "@simpleclick/database";

import {
  criarContexto,
  type DadosDoContexto,
  executarNoContexto,
} from "./contexto.ts";
import {
  type AcessoAoBanco,
  conexaoDaAplicacao,
  conexaoDeMigracao,
  criarAcessoAoBanco,
  ErroDeAlteracaoAmpla,
  ErroDeConexaoDoBanco,
  ErroDeCredencialPrivilegiada,
  ErroDeRecursoNaoEncontrado,
  exigirUmaLinhaAfetada,
  type TransacaoDoBanco,
  transacaoAtual,
} from "./db.ts";

/**
 * Prova do caminho único até o banco, contra PostgreSQL de verdade.
 *
 * Não existe versão em memória disto. Política de isolamento, papel de banco,
 * parâmetro de sessão com duração limitada à transação e reaproveitamento de
 * conexão pelo agrupador são comportamento do PostgreSQL — um substituto
 * simulado provaria só que o substituto concorda com o teste, e é justamente
 * neste arquivo que essa diferença custa caro.
 *
 * Cada execução cria o próprio banco a partir de molde vazio e o apaga no fim.
 */

const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../../", import.meta.url),
);

const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/** Variável obrigatória, com recusa que diz o que fazer. */
function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new Error(
      [
        `${nome} não está definida, e sem ela não há como provar o isolamento contra um banco real.`,
        "Suba o banco descartável e preencha o ambiente:",
        "  bash infra/scripts/up.sh core test",
        "  cp .env.example .env   # e complete as senhas dos papéis de banco",
      ].join("\n"),
    );
  }
  return valor;
}

const URL_ADMINISTRATIVA = exigirVariavel("DATABASE_URL_TEST");
const SENHA_DA_APLICACAO = exigirVariavel("SENHA_BANCO_APLICACAO");
const SENHA_DO_MIGRADOR = exigirVariavel("SENHA_BANCO_MIGRADOR");

const ESPERA_LONGA = 120_000;

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

let nomeDoBanco = "";
let urlDoBanco = "";
let urlDaAplicacao = "";
let urlDoMigrador = "";
let migrador: pg.Client;
let acesso: AcessoAoBanco;
let lojaA = "";
let lojaB = "";
let produtoDeA = "";
let produtoDeB = "";

async function comClienteAdministrativo<T>(
  acao: (cliente: pg.Client) => Promise<T>,
): Promise<T> {
  const cliente = new pg.Client({ connectionString: URL_ADMINISTRATIVA });
  await cliente.connect();
  try {
    return await acao(cliente);
  } finally {
    await cliente.end();
  }
}

/**
 * Roda `acao` como uma requisição: contexto montado, transação aberta pelo
 * caminho único e contexto gravado nela. É a forma exata que a API usará.
 */
function comoRequisicao<T>(
  dados: DadosDoContexto,
  acao: (tx: TransacaoDoBanco) => Promise<T>,
  emQualAcesso: AcessoAoBanco = acesso,
): Promise<T> {
  return executarNoContexto(criarContexto(dados), () =>
    emQualAcesso.emTransacao(acao),
  );
}

/** Quantas linhas a credencial de migração enxerga — ela vê todas as lojas. */
async function linhasVistasPeloMigrador(tabela: string): Promise<number> {
  const resultado = await migrador.query(
    `SELECT count(*)::int AS total FROM app.${tabela}`,
  );
  return (resultado.rows[0] as { total: number }).total;
}

beforeAll(async () => {
  nomeDoBanco = `sc_t006_${Math.random().toString(36).slice(2, 10)}`;
  await comClienteAdministrativo((cliente) =>
    cliente.query(`CREATE DATABASE ${nomeDoBanco} TEMPLATE template0`),
  );

  const url = new URL(URL_ADMINISTRATIVA);
  url.pathname = `/${nomeDoBanco}`;
  urlDoBanco = url.toString();

  migrador = new pg.Client({ connectionString: urlDoBanco });
  await migrador.connect();
  await aplicarMigracoes({ cliente: migrador, segredos: process.env });

  // As três credenciais falam com o mesmo banco e diferem em quem autentica —
  // é essa diferença que sustenta o isolamento.
  urlDaAplicacao = derivarUrlDePapel(urlDoBanco, "sc_app", SENHA_DA_APLICACAO);
  urlDoMigrador = derivarUrlDePapel(
    urlDoBanco,
    "sc_migrator",
    SENHA_DO_MIGRADOR,
  );

  const criarLoja = async (
    codigo: string,
    nome: string,
    apelido: string,
    ramo: string,
  ): Promise<string> => {
    const resultado = await migrador.query(
      `INSERT INTO app.stores (code, name, slug, status, vertical_code)
       VALUES ($1, $2, $3, 'ACTIVE', $4) RETURNING id`,
      [codigo, nome, apelido, ramo],
    );
    return String((resultado.rows[0] as { id: string }).id);
  };

  const criarProduto = async (produto: {
    loja: string;
    nome: string;
    apelido: string;
    ramo: string;
    // Dinheiro é inteiro em centavos, sempre (P-005).
    centavos: number;
  }): Promise<string> => {
    const resultado = await migrador.query(
      `INSERT INTO app.products (store_id, name, slug, vertical_code, status, display_price_cents)
       VALUES ($1, $2, $3, $4, 'PUBLISHED', $5) RETURNING id`,
      [
        produto.loja,
        produto.nome,
        produto.apelido,
        produto.ramo,
        produto.centavos,
      ],
    );
    return String((resultado.rows[0] as { id: string }).id);
  };

  lojaA = await criarLoja(
    "0001",
    "Lanchonete da Ana",
    "lanchonete-da-ana",
    "FOOD_SNACK",
  );
  lojaB = await criarLoja("0002", "Bruno Modas", "bruno-modas", "APPAREL");

  produtoDeA = await criarProduto({
    loja: lojaA,
    nome: "X-Salada",
    apelido: "x-salada",
    ramo: "FOOD_SNACK",
    centavos: 2350,
  });
  produtoDeB = await criarProduto({
    loja: lojaB,
    nome: "Camiseta lisa",
    apelido: "camiseta-lisa",
    ramo: "APPAREL",
    centavos: 5990,
  });

  await migrador.query(
    `INSERT INTO app.store_settings (store_id) VALUES ($1), ($2)`,
    [lojaA, lojaB],
  );

  acesso = criarAcessoAoBanco({
    urlDaAplicacao,
    maxDeConexoes: 4,
    esperaPorConexaoMs: 30_000,
    duracaoMaximaMs: 30_000,
  });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
  if (nomeDoBanco !== "") {
    await comClienteAdministrativo((cliente) =>
      cliente.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`),
    );
  }
});

// ---------------------------------------------------------------------------
// Regra 3 — duas cadeias de conexão distintas
// ---------------------------------------------------------------------------

describe("as duas cadeias de conexão", () => {
  // Sem usuário e sem senha nestas cadeias, de propósito: nem valor real nem
  // valor de mentira com cara de credencial entra em arquivo versionado, e
  // isso vale também para teste (P-002).
  const PELO_AGRUPADOR = "postgresql://agrupador:6432/simpleclick";
  const DIRETA_NO_BANCO = "postgresql://banco:5432/simpleclick";

  /** Monta a fonte de ambiente sem escrever cadeia ao lado do nome da variável. */
  function ambienteCom(aplicacao: string, migracao: string) {
    return { DATABASE_URL: aplicacao, DATABASE_URL_DIRETA: migracao };
  }

  it("separa a conexão da aplicação da conexão de migração", () => {
    const ambiente = ambienteCom(PELO_AGRUPADOR, DIRETA_NO_BANCO);
    expect(conexaoDaAplicacao(ambiente)).toBe(PELO_AGRUPADOR);
    expect(conexaoDeMigracao(ambiente)).toBe(DIRETA_NO_BANCO);
  });

  it("recusa quando a aplicação e a migração usam a mesma cadeia", () => {
    // Cadeia única faz a aplicação herdar o poder de quem migra — e quem migra
    // contorna o isolamento por linha.
    expect(() =>
      conexaoDaAplicacao(ambienteCom(DIRETA_NO_BANCO, DIRETA_NO_BANCO)),
    ).toThrow(ErroDeConexaoDoBanco);
  });

  it("recusa pelo nome a variável que falta", () => {
    expect(() => conexaoDaAplicacao({})).toThrow(/DATABASE_URL/);
    expect(() => conexaoDeMigracao({})).toThrow(/DATABASE_URL_DIRETA/);
  });

  it(
    "não deixa instrução preparada no servidor, que o agrupador não sustenta",
    async () => {
      // Instrução preparada morre com a conexão que o agrupador devolve ao
      // bolo, e a consulta seguinte quebra de forma intermitente — só sob
      // carga, que é onde ninguém procura o defeito.
      for (let volta = 0; volta < 5; volta += 1) {
        const preparadas = await comoRequisicao(
          { lojaId: lojaA, papel: "OWNER" },
          async (tx) => {
            await tx.product.findMany({ select: { name: true } });
            const linhas = await tx.$queryRaw<{ total: bigint }[]>`
              SELECT count(*) AS total FROM pg_prepared_statements`;
            return Number(linhas[0]?.total ?? 0);
          },
        );
        expect(preparadas).toBe(0);
      }
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// Regra 2 — o cliente cru nunca sai do caminho único
// ---------------------------------------------------------------------------

describe("o cliente cru", () => {
  it("não é alcançável por nada que o módulo exporte", async () => {
    // P-004 verifica os módulos de domínio por regex. Aqui a cobrança é do
    // outro lado: nem quem importa `core/db.ts` recebe o cliente.
    const modulo = await import("./db.ts");

    for (const [nome, valor] of Object.entries(modulo)) {
      const alcancavel =
        valor !== null &&
        (typeof valor === "object" || typeof valor === "function") &&
        ("$connect" in (valor as object) ||
          "$transaction" in (valor as object) ||
          "$disconnect" in (valor as object));
      expect(alcancavel, `${nome} entrega o cliente cru`).toBe(false);
    }
  });

  it("entrega ao domínio a transação em curso, e não o cliente", async () => {
    await comoRequisicao({ lojaId: lojaA, papel: "OWNER" }, async (tx) => {
      // O repositório, doze camadas abaixo, alcança a mesma transação sem
      // tê-la recebido como parâmetro.
      expect(transacaoAtual()).toBe(tx);
      // Sem as chaves do ciclo de vida da conexão: quem conecta, desconecta e
      // abre transação é o caminho único, nunca o domínio.
      expect("$connect" in (tx as object)).toBe(false);
      expect("$disconnect" in (tx as object)).toBe(false);
    });
  });

  it(
    "abre UMA transação por requisição: a chamada aninhada continua na mesma",
    async () => {
      // Duas transações na mesma requisição tomariam duas conexões do
      // agrupador com uma segurando a outra, e partiriam o trabalho em dois
      // registros — o primeiro sobreviveria à falha do segundo.
      const { deFora, deDentro, identificadorDaTransacao } =
        await comoRequisicao({ lojaId: lojaA, papel: "OWNER" }, async (tx) => {
          const identificador = await acesso.emTransacao(async (interna) => {
            expect(interna).toBe(tx);
            return interna.$queryRaw<
              { id: number }[]
            >`SELECT txid_current() AS id`;
          });
          return {
            deFora: tx,
            deDentro: transacaoAtual(),
            identificadorDaTransacao: identificador[0]?.id,
          };
        });

      expect(deDentro).toBe(deFora);
      expect(identificadorDaTransacao).toBeDefined();
    },
    ESPERA_LONGA,
  );

  it(
    "desfaz a requisição inteira quando ela falha no meio",
    async () => {
      const antes = await linhasVistasPeloMigrador("products");

      await expect(
        comoRequisicao({ lojaId: lojaA, papel: "OWNER" }, async (tx) => {
          await tx.product.create({
            data: {
              storeId: lojaA,
              name: "Meio caminho",
              slug: "meio-caminho",
              verticalCode: "FOOD_SNACK",
              status: "PUBLISHED",
            },
            select: { id: true },
          });
          throw new Error("a requisição falhou depois de gravar");
        }),
      ).rejects.toThrow(/falhou depois de gravar/);

      expect(await linhasVistasPeloMigrador("products")).toBe(antes);
    },
    ESPERA_LONGA,
  );

  it("recusa quem pede a transação fora de uma", () => {
    executarNoContexto(criarContexto({ lojaId: lojaA }), () => {
      expect(() => transacaoAtual()).toThrow(/transação do banco/);
    });
  });
});

// ---------------------------------------------------------------------------
// Regra 4 — a credencial da aplicação não contorna o isolamento
// ---------------------------------------------------------------------------

describe("credencial que atende requisição", () => {
  it(
    "recusa abrir caminho com credencial que contorna o isolamento",
    async () => {
      // `sc_migrator` tem BYPASSRLS, e BYPASSRLS vence o FORCE ROW LEVEL
      // SECURITY: servir requisição com ela transformaria toda política de
      // isolamento em decoração, sem erro nenhum aparecer.
      const privilegiado = criarAcessoAoBanco({
        urlDaAplicacao: urlDoMigrador,
        maxDeConexoes: 1,
      });

      try {
        await expect(
          comoRequisicao(
            { lojaId: lojaA, papel: "OWNER" },
            async (tx) => tx.product.count(),
            privilegiado,
          ),
        ).rejects.toThrow(ErroDeCredencialPrivilegiada);
      } finally {
        await privilegiado.encerrar();
      }
    },
    ESPERA_LONGA,
  );

  it(
    "autentica como sc_app, que não é superusuário nem contorna o isolamento",
    async () => {
      const quem = await comoRequisicao(
        { lojaId: lojaA, papel: "OWNER" },
        async (tx) =>
          tx.$queryRaw<{ papel: string; super: boolean; contorna: boolean }[]>`
            SELECT rolname AS papel, rolsuper AS "super", rolbypassrls AS contorna
              FROM pg_roles WHERE rolname = current_user`,
      );

      expect(quem[0]).toEqual({
        papel: "sc_app",
        super: false,
        contorna: false,
      });
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-009 — ausência de contexto é negação, não permissão
// ---------------------------------------------------------------------------

describe("consulta pelo caminho único sem contexto de loja", () => {
  it(
    "@spec:AC-009 devolve zero linhas em vez de tudo quando a requisição não tem loja",
    async () => {
      // O dado existe: quem tem a credencial de migração enxerga as duas lojas.
      expect(await linhasVistasPeloMigrador("products")).toBe(2);
      expect(await linhasVistasPeloMigrador("stores")).toBe(2);

      const vistos = await comoRequisicao({}, async (tx) => ({
        produtos: await tx.product.count(),
        lojas: await tx.store.count(),
        configuracoes: await tx.storeSettings.count(),
        vinculos: await tx.storeMember.count(),
        clientes: await tx.storeCustomer.count(),
        dominios: await tx.storeDomain.count(),
      }));

      expect(vistos).toEqual({
        produtos: 0,
        lojas: 0,
        configuracoes: 0,
        vinculos: 0,
        clientes: 0,
        dominios: 0,
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-009 zero não é banco vazio: com a loja no contexto a mesma consulta responde",
    async () => {
      const nomes = await comoRequisicao(
        { lojaId: lojaA, papel: "OWNER" },
        async (tx) =>
          (await tx.product.findMany({ select: { name: true } })).map(
            (produto) => produto.name,
          ),
      );

      expect(nomes).toEqual(["X-Salada"]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-009 loja vazia no contexto é tratada como ausente, sem quebrar a consulta",
    async () => {
      // Depois de um COMMIT o parâmetro continua DEFINIDO com cadeia vazia.
      // Sem tolerar isso, converter para identificador levantaria erro
      // justamente nas conexões reaproveitadas do agrupador.
      const vistos = await comoRequisicao({ lojaId: "" }, async (tx) => ({
        produtos: await tx.product.count(),
        loja: (
          await tx.$queryRaw<{ loja: string | null }[]>`
            SELECT app.current_store_id()::text AS loja`
        )[0]?.loja,
      }));

      expect(vistos).toEqual({ produtos: 0, loja: null });
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-010 — a loja A não alcança a loja B por nenhuma das quatro operações
// ---------------------------------------------------------------------------

describe("loja A tentando alcançar dado da loja B", () => {
  it(
    "@spec:AC-010 @principle:P-003 leitura: não enxerga a linha da outra loja nem por endereço direto",
    async () => {
      const visto = await comoRequisicao(
        { lojaId: lojaA, papel: "OWNER" },
        async (tx) => ({
          todos: (await tx.product.findMany({ select: { name: true } })).map(
            (produto) => produto.name,
          ),
          porIdentificador: await tx.product.findUnique({
            where: { id: produtoDeB },
            select: { name: true },
          }),
          // O contraste na mesma consulta: o identificador da própria loja
          // responde, então "não encontrado" é isolamento, não busca quebrada.
          oDaPropriaLoja: await tx.product.findUnique({
            where: { id: produtoDeA },
            select: { name: true },
          }),
          filtrandoPelaOutraLoja: await tx.product.count({
            where: { storeId: lojaB },
          }),
          aLojaEmSi: await tx.store.findUnique({
            where: { id: lojaB },
            select: { name: true },
          }),
        }),
      );

      expect(visto.todos).toEqual(["X-Salada"]);
      expect(visto.porIdentificador).toBeNull();
      expect(visto.oDaPropriaLoja).toEqual({ name: "X-Salada" });
      expect(visto.filtrandoPelaOutraLoja).toBe(0);
      expect(visto.aLojaEmSi).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-010 @principle:P-003 inserção: gravar linha da outra loja é recusado, não aceito em silêncio",
    async () => {
      await expect(
        comoRequisicao({ lojaId: lojaA, papel: "OWNER" }, async (tx) =>
          tx.product.create({
            data: {
              storeId: lojaB,
              name: "Produto plantado",
              slug: "produto-plantado",
              verticalCode: "APPAREL",
              status: "PUBLISHED",
            },
            select: { id: true },
          }),
        ),
      ).rejects.toThrow();

      // E nada foi plantado: a transação inteira foi desfeita.
      expect(await linhasVistasPeloMigrador("products")).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-010 @principle:P-003 alteração: atravessar loja devolve zero linhas, e zero vira não encontrado",
    async () => {
      // O defeito invisível que a norma do repositório existe para matar: sem
      // conferir linhas afetadas, o dono da outra loja receberia sucesso.
      await expect(
        comoRequisicao({ lojaId: lojaA, papel: "OWNER" }, async (tx) =>
          exigirUmaLinhaAfetada(
            { recurso: "produto", id: produtoDeB },
            async () => {
              const alteradas = await tx.product.updateMany({
                where: { id: produtoDeB },
                data: { name: "Sequestrado" },
              });
              return alteradas.count;
            },
          ),
        ),
      ).rejects.toThrow(ErroDeRecursoNaoEncontrado);

      const daOutraLoja = await migrador.query(
        "SELECT name FROM app.products WHERE id = $1",
        [produtoDeB],
      );
      expect(daOutraLoja.rows[0]).toEqual({ name: "Camiseta lisa" });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-010 @principle:P-003 remoção: apagar linha da outra loja não apaga nada e responde não encontrado",
    async () => {
      await expect(
        comoRequisicao({ lojaId: lojaA, papel: "OWNER" }, async (tx) =>
          exigirUmaLinhaAfetada(
            { recurso: "produto", id: produtoDeB },
            async () => {
              const removidas = await tx.product.deleteMany({
                where: { id: produtoDeB },
              });
              return removidas.count;
            },
          ),
        ),
      ).rejects.toThrow(ErroDeRecursoNaoEncontrado);

      expect(await linhasVistasPeloMigrador("products")).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-010 @principle:P-003 as quatro operações funcionam dentro da própria loja",
    async () => {
      // Sem este contraste, "não alcança a outra loja" poderia ser só uma
      // credencial que não alcança nada.
      const resultado = await comoRequisicao(
        { lojaId: lojaA, papel: "OWNER" },
        async (tx) => {
          const criado = await tx.product.create({
            data: {
              storeId: lojaA,
              name: "Batata frita",
              slug: "batata-frita",
              verticalCode: "FOOD_SNACK",
              status: "PUBLISHED",
            },
            select: { id: true },
          });

          const lido = await tx.product.findUnique({
            where: { id: criado.id },
            select: { name: true },
          });

          await exigirUmaLinhaAfetada(
            { recurso: "produto", id: criado.id },
            async () =>
              (
                await tx.product.updateMany({
                  where: { id: criado.id },
                  data: { name: "Batata frita grande" },
                })
              ).count,
          );

          const depoisDaAlteracao = await tx.product.findUnique({
            where: { id: criado.id },
            select: { name: true },
          });

          await exigirUmaLinhaAfetada(
            { recurso: "produto", id: criado.id },
            async () =>
              (await tx.product.deleteMany({ where: { id: criado.id } })).count,
          );

          return {
            lido: lido?.name,
            depoisDaAlteracao: depoisDaAlteracao?.name,
            sobrou: await tx.product.count({ where: { id: criado.id } }),
          };
        },
      );

      expect(resultado).toEqual({
        lido: "Batata frita",
        depoisDaAlteracao: "Batata frita grande",
        sobrou: 0,
      });
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-011 — o contexto não escapa de uma requisição para outra
// ---------------------------------------------------------------------------

describe("contexto entre requisições concorrentes sobre conexões reaproveitadas", () => {
  it(
    "@spec:AC-011 @principle:P-003 muitas requisições alternadas entre duas lojas não se misturam",
    async () => {
      // O cenário é montado para vazar: mais requisições do que conexões, para
      // que cada conexão sirva várias lojas em sequência; requisições sem loja
      // intercaladas, que é onde o contexto herdado apareceria; e tudo em
      // paralelo, para que as transações se sobreponham no tempo.
      const CONEXOES = 3;
      const REQUISICOES = 60;

      const agrupadorPequeno = criarAcessoAoBanco({
        urlDaAplicacao,
        maxDeConexoes: CONEXOES,
        esperaPorConexaoMs: 60_000,
        duracaoMaximaMs: 60_000,
      });

      try {
        const requisicoes = Array.from({ length: REQUISICOES }, (_, indice) => {
          // Uma a cada três não tem loja: é a sonda. Se o contexto vazar da
          // requisição anterior, é ela que enxerga o que não devia.
          const ehSonda = indice % 3 === 2;
          const loja = indice % 2 === 0 ? lojaA : lojaB;
          const esperado = indice % 2 === 0 ? "X-Salada" : "Camiseta lisa";

          return comoRequisicao(
            ehSonda ? {} : { lojaId: loja, papel: "OWNER" },
            async (tx) => {
              // Cede a vez no meio da transação: sem isso as transações
              // correriam uma depois da outra e o teste não provaria nada
              // sobre concorrência.
              await new Promise((resolver) => setTimeout(resolver, indice % 5));

              const contextoNoBanco = await tx.$queryRaw<
                { loja: string | null }[]
              >`SELECT app.current_store_id()::text AS loja`;

              const nomes = (
                await tx.product.findMany({ select: { name: true } })
              ).map((produto) => produto.name);

              return {
                indice,
                ehSonda,
                lojaEsperada: ehSonda ? null : loja,
                lojaNoBanco: contextoNoBanco[0]?.loja ?? null,
                nomes,
                nomeEsperado: ehSonda ? [] : [esperado],
              };
            },
            agrupadorPequeno,
          );
        });

        const resultados = await Promise.all(requisicoes);

        expect(resultados).toHaveLength(REQUISICOES);
        for (const resultado of resultados) {
          expect(
            resultado.lojaNoBanco,
            `requisição ${resultado.indice} viu a loja errada no banco`,
          ).toBe(resultado.lojaEsperada);
          expect(
            resultado.nomes,
            `requisição ${resultado.indice} (sonda: ${resultado.ehSonda}) enxergou dado de outra loja`,
          ).toEqual(resultado.nomeEsperado);
        }

        // As sondas precisam ter sido muitas e ter rodado depois de conexões já
        // usadas por lojas — senão "não vazou" seria só falta de oportunidade.
        expect(resultados.filter((r) => r.ehSonda).length).toBeGreaterThan(
          CONEXOES,
        );
      } finally {
        await agrupadorPequeno.encerrar();
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-011 a mesma conexão, reaproveitada logo em seguida, não traz a loja anterior",
    async () => {
      // Uma conexão só: a requisição seguinte é obrigada a reaproveitar
      // exatamente a que acabou de servir a loja A.
      const conexaoUnica = criarAcessoAoBanco({
        urlDaAplicacao,
        maxDeConexoes: 1,
      });

      try {
        const daLojaA = await comoRequisicao(
          { lojaId: lojaA, papel: "OWNER" },
          async (tx) =>
            (await tx.product.findMany({ select: { name: true } })).map(
              (produto) => produto.name,
            ),
          conexaoUnica,
        );
        expect(daLojaA).toEqual(["X-Salada"]);

        const semLoja = await comoRequisicao(
          {},
          async (tx) => ({
            loja: (
              await tx.$queryRaw<{ loja: string | null }[]>`
                SELECT app.current_store_id()::text AS loja`
            )[0]?.loja,
            produtos: await tx.product.count(),
          }),
          conexaoUnica,
        );

        expect(semLoja).toEqual({ loja: null, produtos: 0 });
      } finally {
        await conexaoUnica.encerrar();
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-011 o teste enxerga o vazamento: com contexto de sessão a conexão entrega a loja anterior",
    async () => {
      // Sentinela. Aqui o arranjo é QUEBRADO de propósito, com `pg` cru e fora
      // do caminho único, para mostrar que a asserção acima é a que pega o
      // defeito — e não uma asserção que passaria de qualquer jeito.
      //
      // A forma ingênua tem duas metades, e as duas são erradas:
      //   1. `set_config(..., false)` — contexto de SESSÃO, sobrevive ao COMMIT;
      //   2. gravar o contexto só quando ele existe — requisição sem loja não
      //      apaga o que ficou da anterior.
      const agrupador = new pg.Pool({
        connectionString: urlDaAplicacao,
        max: 1,
      });

      try {
        // Requisição 1, da loja A, no arranjo ingênuo.
        await agrupador.query("BEGIN");
        await agrupador.query("SELECT set_config('app.store_id', $1, false)", [
          lojaA,
        ]);
        await agrupador.query("SELECT set_config('app.role', 'OWNER', false)");
        const daLojaA = await agrupador.query(
          "SELECT name FROM app.products ORDER BY name",
        );
        await agrupador.query("COMMIT");
        expect(daLojaA.rows).toEqual([{ name: "X-Salada" }]);

        // Requisição 2, sem loja, na mesma conexão. Não grava contexto nenhum,
        // porque não tem loja para gravar.
        await agrupador.query("BEGIN");
        const semLoja = await agrupador.query(
          "SELECT name FROM app.products ORDER BY name",
        );
        await agrupador.query("ROLLBACK");

        // O vazamento é real e é observável: a requisição sem loja recebeu o
        // dado da loja A. É exatamente isto que o arranjo do caminho único
        // impede, e é isto que o teste acima reprovaria se o arranjo caísse.
        expect(semLoja.rows).toEqual([{ name: "X-Salada" }]);
      } finally {
        await agrupador.end();
      }
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// Regra 6 — norma do repositório: zero linhas é "não encontrado"
// ---------------------------------------------------------------------------

describe("conferência de linhas afetadas", () => {
  const ALVO = { recurso: "produto", id: "abc" };

  it("deixa passar a alteração que pegou exatamente uma linha", async () => {
    await expect(
      exigirUmaLinhaAfetada(ALVO, async () => 1),
    ).resolves.toBeUndefined();
  });

  it("transforma zero linhas em não encontrado, nomeando o recurso", async () => {
    await expect(exigirUmaLinhaAfetada(ALVO, async () => 0)).rejects.toThrow(
      ErroDeRecursoNaoEncontrado,
    );
    await expect(exigirUmaLinhaAfetada(ALVO, async () => 0)).rejects.toThrow(
      /produto abc/,
    );
  });

  it("recusa a alteração que pegou mais de uma linha", async () => {
    // Identificador que pega duas linhas é predicado errado, e seguir em
    // frente com ele altera dado que ninguém pediu para alterar.
    await expect(exigirUmaLinhaAfetada(ALVO, async () => 2)).rejects.toThrow(
      ErroDeAlteracaoAmpla,
    );
  });
});
