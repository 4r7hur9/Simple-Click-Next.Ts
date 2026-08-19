import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aplicarMigracoes } from "../src/migrate.ts";

/**
 * O esquema declarado cobre o banco que as migrações produzem?
 *
 * ESTE TESTE NASCEU DE UM ERRO REAL. As migrações 0007 e 0008 criaram vinte
 * tabelas, e nenhuma delas ganhou modelo no esquema declarado. Nada reclamou:
 * o Prisma não sabe o que existe no banco, as guardas estruturais olham
 * isolamento e índice, e o compilador só reclama do que alguém tentou usar.
 *
 * A consequência não é cosmética. Tabela sem modelo tipado obriga quem for
 * escrever o código a usar SQL cru — e SQL cru contorna o cliente único, que é
 * o arranjo que sustenta o isolamento por linha. A lacuna no esquema vira, umas
 * semanas depois, um `SELECT` sem contexto de loja que ninguém revisou.
 *
 * A lista de PENDENTES existe para a dívida ficar VISÍVEL e nomeada. Tabela que
 * ainda não tem modelo porque a fatia dela não começou é decisão; tabela que
 * ficou de fora por esquecimento é defeito. Sem a lista, as duas são iguais.
 */

const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../", import.meta.url),
);

const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

function exigirVariavel(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined || valor === "") {
    throw new Error(`variável de ambiente ausente: ${nome}`);
  }
  return valor;
}

const URL_ADMINISTRATIVA = exigirVariavel("DATABASE_URL_TEST");
const SEGREDOS_DAS_MIGRACOES = {
  SENHA_BANCO_MIGRADOR: exigirVariavel("SENHA_BANCO_MIGRADOR"),
  SENHA_BANCO_APLICACAO: exigirVariavel("SENHA_BANCO_APLICACAO"),
  SENHA_BANCO_ADMINISTRACAO: exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
};

const ESPERA_LONGA = 120_000;

/**
 * Tabelas que ainda não têm modelo tipado, por decisão e não por esquecimento.
 *
 * São as onze da migração 0007, o catálogo completo. Elas entram junto com as
 * tarefas do catálogo (T-300 em diante), quando houver código para usá-las.
 * Declarar modelo antes disso só criaria tipo que ninguém importa.
 *
 * ESTA LISTA SÓ PODE ENCOLHER. Quem precisar acrescentar um nome aqui está
 * decidindo adiar, e a decisão fica escrita com o nome de quem adiou no
 * histórico — que é exatamente o oposto de uma tabela sumir sem ninguém notar.
 */
const SEM_MODELO_POR_DECISAO: ReadonlySet<string> = new Set([
  "categories",
  "product_categories",
  "product_images",
  "product_variants",
  "product_prices",
  "option_groups",
  "option_items",
  "product_option_groups",
  "variant_option_values",
  "attribute_definitions",
  "product_attributes",
]);

/** Tabelas de controle do próprio aplicador, que não são domínio. */
const NAO_SAO_DOMINIO: ReadonlySet<string> = new Set(["assets"]);

interface BancoDeProva {
  readonly nome: string;
  readonly url: string;
}

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

async function criarBancoDeProva(): Promise<BancoDeProva> {
  const nome = `sc_esquema_${Math.random().toString(36).slice(2, 10)}`;
  await comClienteAdministrativo((cliente) =>
    cliente.query(`CREATE DATABASE ${nome} TEMPLATE template0`),
  );
  const url = new URL(URL_ADMINISTRATIVA);
  url.pathname = `/${nome}`;
  return { nome, url: url.toString() };
}

let banco: BancoDeProva;
let migrador: pg.Client;

beforeAll(async () => {
  banco = await criarBancoDeProva();
  migrador = new pg.Client({ connectionString: banco.url });
  await migrador.connect();
  await aplicarMigracoes({
    cliente: migrador,
    segredos: SEGREDOS_DAS_MIGRACOES,
  });
}, ESPERA_LONGA);

afterAll(async () => {
  await migrador?.end();
  if (banco) {
    await comClienteAdministrativo((cliente) =>
      cliente.query(`DROP DATABASE IF EXISTS ${banco.nome} WITH (FORCE)`),
    );
  }
}, ESPERA_LONGA);

/** Toda tabela que as migrações criam no esquema de aplicação. */
async function tabelasDoBanco(): Promise<string[]> {
  const resultado = await migrador.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'app' ORDER BY tablename`,
  );
  return resultado.rows.map((linha) => linha.tablename);
}

/** Toda tabela que o esquema declarado mapeia, lida do próprio arquivo. */
function tabelasDoEsquema(): Set<string> {
  const arquivo = join(
    RAIZ_DO_REPOSITORIO,
    "packages/database/prisma/schema.prisma",
  );
  const conteudo = readFileSync(arquivo, "utf8");
  return new Set(
    [...conteudo.matchAll(/@@map\("([^"]+)"\)/g)].map((achado) => achado[1]!),
  );
}

describe("o esquema declarado cobre o banco (AC-044)", () => {
  it(
    "@spec:AC-044 nenhuma tabela existe no banco sem modelo tipado, fora as adiadas por decisão",
    async () => {
      const noBanco = await tabelasDoBanco();
      const noEsquema = tabelasDoEsquema();

      // Sem esta asserção, um erro na consulta faria a lista vir vazia e o teste
      // passaria por não ter olhado nada — que é como um teste de cobertura mente.
      expect(noBanco.length).toBeGreaterThan(20);
      expect(noEsquema.size).toBeGreaterThan(10);

      const descobertas = noBanco.filter(
        (tabela) =>
          !noEsquema.has(tabela) &&
          !SEM_MODELO_POR_DECISAO.has(tabela) &&
          !NAO_SAO_DOMINIO.has(tabela),
      );

      expect(
        descobertas,
        `tabela sem modelo tipado e sem decisão registrada: ${descobertas.join(", ")}. ` +
          `Declare o modelo em prisma/schema.prisma, ou acrescente o nome à lista ` +
          `SEM_MODELO_POR_DECISAO deste arquivo dizendo por que está sendo adiado.`,
      ).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-044 a lista de adiadas não guarda nome de tabela que não existe mais",
    async () => {
      // Lista de exceção que envelhece deixa de proteger e passa a esconder: um
      // nome antigo aqui faria a próxima tabela com o mesmo nome nascer isenta.
      const noBanco = new Set(await tabelasDoBanco());
      const fantasmas = [...SEM_MODELO_POR_DECISAO, ...NAO_SAO_DOMINIO].filter(
        (tabela) => !noBanco.has(tabela),
      );

      expect(
        fantasmas,
        `nome na lista sem tabela no banco: ${fantasmas.join(", ")}`,
      ).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-044 o esquema não declara modelo para tabela que o banco não tem",
    async () => {
      // O sentido contrário do mesmo erro: modelo tipado sem tabela compila,
      // gera cliente, e só falha em execução — no primeiro pedido de verdade.
      const noBanco = new Set(await tabelasDoBanco());
      const inventadas = [...tabelasDoEsquema()].filter(
        (tabela) => !noBanco.has(tabela),
      );

      expect(
        inventadas,
        `modelo declarado sem tabela no banco: ${inventadas.join(", ")}`,
      ).toEqual([]);
    },
    ESPERA_LONGA,
  );
});
