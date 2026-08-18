import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import {
  apagarBanco,
  apontamParaOMesmoBanco,
  bancoDoArquivo,
  comBancoDeTeste,
  conectar,
  conectarNoBancoDoArquivo,
  ErroDeAmbienteDeTeste,
  ErroDeBancoProtegido,
  exigirNomeEfemero,
  identidadeDoBanco,
  instanteDoNome,
  nomeDoMolde,
  nomeNovoDeBancoDeTeste,
  PREFIXO_DO_BANCO_DE_TESTE,
  urlDoBanco,
  urlDoServidorDeTeste,
  varrerBancosAbandonados,
} from "./db-test.ts";

/**
 * Prova do banco de teste separado e efêmero (AC-003).
 *
 * O que se prova aqui não é que as funções existem, e sim as quatro promessas
 * que fazem uma suíte ser confiável:
 *
 *   1. cada arquivo de teste roda em cima de um banco próprio, já migrado;
 *   2. o banco some no fim — inclusive quando o teste falha;
 *   3. os dados de desenvolvimento não são tocados;
 *   4. rodar duas vezes seguidas dá o mesmo resultado.
 *
 * As promessas 2 e 4 não são observáveis de dentro do processo que está sendo
 * testado: quem termina a suíte é o processo, e "o que sobrou depois" só existe
 * depois dele. Por isso elas executam uma suíte de verdade em outro processo e
 * olham o servidor em seguida.
 */

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const VITEST = join(RAIZ, "node_modules/vitest/vitest.mjs");
const CONFIG_DE_PROVA = join(
  RAIZ,
  "packages/testing/fixtures/vitest.fixture.config.ts",
);

const executar = promisify(execFile);

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** Existe um banco com este nome no servidor de teste? */
async function existeNoServidorDeTeste(nome: string): Promise<boolean> {
  const cliente = await conectar(urlDoServidorDeTeste());
  try {
    const achado = await cliente.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [nome],
    );
    return achado.rowCount === 1;
  } finally {
    await cliente.end();
  }
}

/** Cadeia de conexão do banco de desenvolvimento, exigida pelo ambiente. */
function urlDeDesenvolvimento(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url === undefined || url === "") {
    throw new Error(
      "DATABASE_URL não está definida — sem ela não há como provar que o banco de desenvolvimento ficou intacto.",
    );
  }
  return url;
}

/**
 * Retrato do servidor de desenvolvimento: quais bancos existem nele e quantas
 * linhas há em cada tabela do banco de desenvolvimento.
 *
 * A lista de bancos entra no retrato porque é ela que denuncia o erro mais
 * provável — criar o banco efêmero no servidor errado. A contagem por tabela
 * denuncia o segundo — escrever no banco de desenvolvimento em vez do de teste.
 */
async function retratoDoDesenvolvimento(): Promise<string[]> {
  const cliente = await conectar(urlDeDesenvolvimento());
  try {
    const itens: string[] = [];

    const bancos = await cliente.query(
      "SELECT datname FROM pg_database ORDER BY 1",
    );
    for (const linha of bancos.rows) {
      itens.push(`banco: ${String((linha as { datname: unknown }).datname)}`);
    }

    const tabelas = await cliente.query(
      `SELECT schemaname || '.' || relname AS nome
         FROM pg_stat_user_tables ORDER BY 1`,
    );
    for (const linha of tabelas.rows) {
      const nome = String((linha as { nome: unknown }).nome);
      const contagem = await cliente.query(
        `SELECT count(*)::int AS total FROM ${nome}`,
      );
      itens.push(
        `tabela: ${nome} linhas=${(contagem.rows[0] as { total: number }).total}`,
      );
    }

    return itens;
  } finally {
    await cliente.end();
  }
}

/** Cria duas lojas e um produto — escrita de verdade, não um `SELECT 1`. */
async function escreverCenario(cliente: pg.Client): Promise<void> {
  const loja = await cliente.query(
    `INSERT INTO app.stores (code, name, slug, status, vertical_code)
     VALUES ('8001', 'Lanchonete da prova', 'lanchonete-da-prova', 'ACTIVE', 'FOOD_SNACK')
     RETURNING id`,
  );
  await cliente.query(
    `INSERT INTO app.stores (code, name, slug, status, vertical_code)
     VALUES ('8002', 'Modas da prova', 'modas-da-prova', 'ACTIVE', 'APPAREL')`,
  );
  await cliente.query(
    `INSERT INTO app.products (store_id, name, slug, vertical_code, status, display_price_cents)
     VALUES ($1, 'X-Prova', 'x-prova', 'FOOD_SNACK', 'PUBLISHED', 1990)`,
    [String((loja.rows[0] as { id: string }).id)],
  );
}

interface ResultadoDeSuite {
  readonly codigo: number;
  /** Título do teste → situação. É o "resultado" que se compara entre duas execuções. */
  readonly situacoes: Record<string, string>;
  /** Nomes dos bancos que a suíte usou, relatados pelos próprios arquivos. */
  readonly bancos: readonly string[];
}

/**
 * Executa, em outro processo, uma suíte de verdade sobre um arquivo de prova.
 *
 * O ambiente do filho perde as marcas do Vitest de fora para que ele se comporte
 * como uma execução comum, e ganha o caminho onde os arquivos de prova relatam
 * qual banco receberam.
 */
async function rodarSuiteDeProva(arquivo: string): Promise<ResultadoDeSuite> {
  const pasta = mkdtempSync(join(tmpdir(), "sc-prova-"));
  const relato = join(pasta, "bancos.txt");
  const relatorio = join(pasta, "relatorio.json");

  const ambiente: NodeJS.ProcessEnv = { ...process.env };
  for (const chave of Object.keys(ambiente)) {
    if (chave.startsWith("VITEST")) delete ambiente[chave];
  }
  ambiente.SC_RELATO_DO_BANCO = relato;

  let codigo = 0;
  try {
    await executar(
      process.execPath,
      [
        VITEST,
        "run",
        "--config",
        CONFIG_DE_PROVA,
        "--reporter=json",
        `--outputFile=${relatorio}`,
        arquivo,
      ],
      { cwd: RAIZ, env: ambiente, timeout: 180_000 },
    );
  } catch (causa) {
    codigo = (causa as { code?: number }).code ?? 1;
  }

  try {
    const bruto = JSON.parse(readFileSync(relatorio, "utf8")) as {
      testResults?: {
        assertionResults?: { fullName: string; status: string }[];
      }[];
    };
    const situacoes: Record<string, string> = {};
    for (const arquivoDeTeste of bruto.testResults ?? []) {
      for (const teste of arquivoDeTeste.assertionResults ?? []) {
        situacoes[teste.fullName] = teste.status;
      }
    }
    const bancos = readFileSync(relato, "utf8")
      .split("\n")
      .map((linha) => linha.trim())
      .filter((linha) => linha !== "");
    return { codigo, situacoes, bancos };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 1. Um banco por arquivo de teste
// ---------------------------------------------------------------------------

describe("banco próprio de cada arquivo de teste", () => {
  it("@spec:AC-003 este arquivo recebeu um banco descartável só dele, já migrado e vazio", async () => {
    const banco = bancoDoArquivo();

    expect(banco.nome.startsWith(PREFIXO_DO_BANCO_DE_TESTE)).toBe(true);
    expect(await existeNoServidorDeTeste(banco.nome)).toBe(true);
    expect(apontamParaOMesmoBanco(banco.url, urlDeDesenvolvimento())).toBe(
      false,
    );

    const cliente = await conectarNoBancoDoArquivo();
    try {
      const onde = await cliente.query("SELECT current_database() AS banco");
      expect(String((onde.rows[0] as { banco: unknown }).banco)).toBe(
        banco.nome,
      );

      // Veio do molde: o esquema está de pé sem nenhuma migração ter rodado agora.
      const migradas = await cliente.query(
        "SELECT count(*)::int AS total FROM migracao.aplicadas",
      );
      expect(
        (migradas.rows[0] as { total: number }).total,
      ).toBeGreaterThanOrEqual(6);

      // E está vazio de dado de negócio, execução após execução.
      const lojas = await cliente.query(
        "SELECT count(*)::int AS total FROM app.stores",
      );
      expect((lojas.rows[0] as { total: number }).total).toBe(0);
    } finally {
      await cliente.end();
    }
  });

  it("@spec:AC-003 dois bancos pedidos ao mesmo tempo não compartilham uma linha sequer", async () => {
    await comBancoDeTeste(async (primeiro) => {
      await comBancoDeTeste(async (segundo) => {
        expect(segundo.nome).not.toBe(primeiro.nome);

        const clienteA = await conectar(primeiro.url);
        const clienteB = await conectar(segundo.url);
        try {
          // O mesmo código nos dois: `app.stores` tem única global em `code`,
          // então isto só é possível porque são bancos diferentes de verdade.
          for (const [cliente, apelido] of [
            [clienteA, "a"],
            [clienteB, "b"],
          ] as const) {
            await cliente.query(
              `INSERT INTO app.stores (code, name, slug, status, vertical_code)
               VALUES ('7100', $1, $2, 'ACTIVE', 'FOOD_SNACK')`,
              [`Loja ${apelido}`, `loja-${apelido}`],
            );
          }

          const vistoPorA = await clienteA.query(
            "SELECT slug FROM app.stores ORDER BY slug",
          );
          const vistoPorB = await clienteB.query(
            "SELECT slug FROM app.stores ORDER BY slug",
          );
          expect(
            vistoPorA.rows.map((l) => String((l as { slug: unknown }).slug)),
          ).toEqual(["loja-a"]);
          expect(
            vistoPorB.rows.map((l) => String((l as { slug: unknown }).slug)),
          ).toEqual(["loja-b"]);
        } finally {
          await clienteA.end();
          await clienteB.end();
        }
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Descarte ao final, inclusive com teste vermelho
// ---------------------------------------------------------------------------

describe("descarte do banco ao fim da suíte", () => {
  it("@spec:AC-003 o banco some quando a suíte falha, e não só quando ela passa", async () => {
    const resultado = await rodarSuiteDeProva("falha-proposital");

    // A suíte precisa mesmo ter falhado: se ela passasse, esta prova não
    // estaria provando o caso difícil.
    expect(resultado.codigo).not.toBe(0);
    expect(Object.values(resultado.situacoes)).toContain("failed");

    expect(resultado.bancos).toHaveLength(1);
    const usado = resultado.bancos[0] as string;
    expect(usado.startsWith(PREFIXO_DO_BANCO_DE_TESTE)).toBe(true);
    expect(await existeNoServidorDeTeste(usado)).toBe(false);
  });

  it("@spec:AC-003 descartar duas vezes o mesmo banco não é erro", async () => {
    const banco = await comBancoDeTeste(async (aberto) => aberto);
    await banco.descartar();
    expect(await existeNoServidorDeTeste(banco.nome)).toBe(false);
  });

  it("@spec:AC-003 banco de teste esquecido por processo morto é varrido depois", async () => {
    const duasHorasAtras = Date.now() - 2 * 60 * 60 * 1000;
    const abandonado = nomeNovoDeBancoDeTeste("abandonado", duasHorasAtras);
    const recente = bancoDoArquivo().nome;

    const cliente = await conectar(urlDoServidorDeTeste());
    try {
      await cliente.query(`CREATE DATABASE ${abandonado} TEMPLATE template0`);
    } finally {
      await cliente.end();
    }

    const apagados = await varrerBancosAbandonados();

    expect(apagados).toContain(abandonado);
    expect(await existeNoServidorDeTeste(abandonado)).toBe(false);
    // E a varredura não atropela quem está em uso agora.
    expect(apagados).not.toContain(recente);
    expect(await existeNoServidorDeTeste(recente)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Os dados de desenvolvimento permanecem intactos
// ---------------------------------------------------------------------------

describe("separação do banco de desenvolvimento", () => {
  it("@spec:AC-003 escrever no banco de teste não muda nada no de desenvolvimento", async () => {
    const antes = await retratoDoDesenvolvimento();

    const cliente = await conectarNoBancoDoArquivo();
    try {
      await escreverCenario(cliente);
      const lojas = await cliente.query(
        "SELECT count(*)::int AS total FROM app.stores",
      );
      // A escrita aconteceu de verdade — senão "nada mudou lá" seria trivial.
      expect((lojas.rows[0] as { total: number }).total).toBe(2);
    } finally {
      await cliente.end();
    }

    const depois = await retratoDoDesenvolvimento();
    expect(depois).toEqual(antes);

    // E nenhum banco efêmero nasceu no servidor de desenvolvimento.
    expect(
      depois.filter((item) => item.includes(PREFIXO_DO_BANCO_DE_TESTE)),
    ).toEqual([]);
  });

  it("@spec:AC-003 cadeia de teste que aponte para o banco de desenvolvimento é recusada", () => {
    const desenvolvimento = urlDeDesenvolvimento();

    expect(() =>
      urlDoServidorDeTeste({
        DATABASE_URL: desenvolvimento,
        DATABASE_URL_TEST: desenvolvimento,
      }),
    ).toThrow(ErroDeBancoProtegido);

    // Trocar a credencial não transforma o banco de desenvolvimento em outro.
    const comOutroUsuario = new URL(desenvolvimento);
    comOutroUsuario.username = "outro";
    comOutroUsuario.password = "outra";
    expect(() =>
      urlDoServidorDeTeste({
        DATABASE_URL_DIRETA: desenvolvimento,
        DATABASE_URL_TEST: comOutroUsuario.toString(),
      }),
    ).toThrow(ErroDeBancoProtegido);

    // O ambiente real do projeto passa por essa mesma guarda.
    expect(() => urlDoServidorDeTeste()).not.toThrow();
  });

  it("@spec:AC-003 apagar um banco que não é efêmero é recusado antes de tocar no servidor", async () => {
    await expect(apagarBanco("simpleclick_dev")).rejects.toBeInstanceOf(
      ErroDeBancoProtegido,
    );
    await expect(apagarBanco("postgres")).rejects.toBeInstanceOf(
      ErroDeBancoProtegido,
    );

    // O banco de desenvolvimento continua lá, intocado.
    const cliente = await conectar(urlDeDesenvolvimento());
    try {
      const onde = await cliente.query("SELECT current_database() AS banco");
      expect(String((onde.rows[0] as { banco: unknown }).banco)).toBe(
        "simpleclick_dev",
      );
    } finally {
      await cliente.end();
    }

    expect(() => exigirNomeEfemero("template1")).toThrow(ErroDeBancoProtegido);
    expect(() => exigirNomeEfemero(nomeNovoDeBancoDeTeste("ok"))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. Duas execuções seguidas dão o mesmo resultado
// ---------------------------------------------------------------------------

describe("repetição da suíte", () => {
  it("@spec:AC-003 rodar a mesma suíte duas vezes seguidas dá exatamente o mesmo resultado", async () => {
    const primeira = await rodarSuiteDeProva("banco-proprio");
    const segunda = await rodarSuiteDeProva("banco-proprio");

    expect(primeira.codigo).toBe(0);
    expect(segunda.codigo).toBe(0);
    expect(segunda.situacoes).toEqual(primeira.situacoes);
    expect(Object.keys(primeira.situacoes).length).toBeGreaterThan(0);

    // Mesmo resultado, bancos diferentes: a repetibilidade vem de o banco ser
    // novo, e não de a segunda execução ter dado sorte com o que sobrou.
    expect(primeira.bancos).toHaveLength(1);
    expect(segunda.bancos).toHaveLength(1);
    expect(segunda.bancos[0]).not.toBe(primeira.bancos[0]);

    for (const nome of [...primeira.bancos, ...segunda.bancos]) {
      expect(await existeNoServidorDeTeste(nome)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Molde e nomes — o que torna tudo isso barato e rastreável
// ---------------------------------------------------------------------------

describe("molde e nomeação", () => {
  it("@spec:AC-003 o molde muda de nome quando qualquer migração muda de conteúdo", () => {
    const conjunto = [
      { nome: "0001_a.sql", caminho: "/a", sql: "x", sha256: "aaa" },
      { nome: "0002_b.sql", caminho: "/b", sql: "y", sha256: "bbb" },
    ];
    const igual = [...conjunto];
    const alterado = [
      conjunto[0] as (typeof conjunto)[0],
      { ...(conjunto[1] as (typeof conjunto)[0]), sha256: "ccc" },
    ];

    expect(nomeDoMolde(conjunto)).toBe(nomeDoMolde(igual));
    expect(nomeDoMolde(alterado)).not.toBe(nomeDoMolde(conjunto));
    expect(() => exigirNomeEfemero(nomeDoMolde(conjunto))).not.toThrow();
  });

  it("@spec:AC-003 o nome do banco carrega o instante de criação, que é o que permite varrer sobra", () => {
    const instante = 1_760_000_000_000;
    const nome = nomeNovoDeBancoDeTeste("meu-arquivo", instante);

    expect(instanteDoNome(nome)).toBe(instante);
    expect(nome).toContain("meuarquivo");
    expect(instanteDoNome("simpleclick_dev")).toBeNull();
  });

  it("@spec:AC-003 identidade de banco ignora credencial e enxerga máquina, porta e nome", () => {
    expect(identidadeDoBanco("postgresql://a:b@localhost:5533/x")).toBe(
      "localhost:5533/x",
    );
    expect(identidadeDoBanco("postgresql://c:d@LOCALHOST:5533/x")).toBe(
      "localhost:5533/x",
    );
    expect(identidadeDoBanco("postgresql://a:b@localhost/x")).toBe(
      "localhost:5432/x",
    );
    expect(
      urlDoBanco("postgresql://a:b@localhost:5533/origem", "sc_teste_1"),
    ).toContain("/sc_teste_1");
  });
});

// ---------------------------------------------------------------------------
// 6. Quem não está num projeto de integração recebe recusa clara
// ---------------------------------------------------------------------------

describe("uso fora de um projeto de integração", () => {
  let recusaSemBanco: unknown;

  beforeAll(async () => {
    // Simula um arquivo que não passou pela preparação: importa o módulo num
    // processo limpo e pede o banco do arquivo.
    const programa = [
      `const m = await import(${JSON.stringify(fileURLToPath(new URL("./db-test.ts", import.meta.url)))});`,
      "try { m.bancoDoArquivo(); console.log('SEM_ERRO'); }",
      "catch (e) { console.log(e.name + '|' + e.message.split('\\n')[0]); }",
    ].join("\n");
    const saida = await executar(
      process.execPath,
      ["--input-type=module", "-e", programa],
      {
        cwd: RAIZ,
        timeout: 60_000,
      },
    );
    recusaSemBanco = saida.stdout.trim();
  }, 120_000);

  it("@spec:AC-003 pedir o banco do arquivo sem a preparação recusa dizendo o que fazer", () => {
    expect(recusaSemBanco).toContain(new ErroDeAmbienteDeTeste("x").name);
    expect(recusaSemBanco).toContain("não recebeu banco próprio");
  });
});
