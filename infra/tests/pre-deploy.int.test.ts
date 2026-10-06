import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aplicarMigracoes,
  DIRETORIO_DE_MIGRACOES,
  lerMigracoes,
} from "@simpleclick/database";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Prova da publicação contra um PostgreSQL de verdade (AC-029).
 *
 * O critério fala de duas coisas que só existem quando há banco: a migração
 * aplicada ANTES de a versão nova receber tráfego, e a ausência de estado misto
 * quando ela falha. Nenhuma das duas se prova com substituto simulado — um
 * dublê provaria apenas que o dublê concorda com o teste, e "meio esquema
 * aplicado" é comportamento de transação do PostgreSQL.
 *
 * Cada caso cria o próprio banco a partir do molde VAZIO e o apaga no fim, de
 * modo que rodar duas vezes dê o mesmo resultado e nenhum banco de gente seja
 * tocado.
 */

const PRE_DEPLOY = fileURLToPath(
  new URL("../railway/pre-deploy.sh", import.meta.url),
);

const RAIZ_DO_REPOSITORIO = fileURLToPath(new URL("../../", import.meta.url));

// O arquivo de ambiente é opcional: quem exporta as variáveis na sessão não
// precisa dele. Segredo nunca vem do código (P-002) — nem aqui.
const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/**
 * Variável obrigatória, com recusa que diz o que fazer.
 *
 * Falhar aqui é proposital: um teste que se desliga sozinho por falta de
 * ambiente é um teste que nunca reprova, e a publicação é justamente o lugar
 * onde ninguém pode descobrir tarde que a prova não estava rodando.
 */
function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new Error(
      [
        `${nome} não está definida, e sem ela não há como provar a publicação contra um banco real.`,
        "Suba o banco descartável e preencha o ambiente:",
        "  bash infra/scripts/up.sh core test",
        "  cp .env.example .env   # e complete as senhas dos papéis de banco",
      ].join("\n"),
    );
  }
  return valor;
}

const URL_ADMINISTRATIVA = exigirVariavel("DATABASE_URL_TEST");
const SENHAS = {
  SENHA_BANCO_MIGRADOR: exigirVariavel("SENHA_BANCO_MIGRADOR"),
  SENHA_BANCO_APLICACAO: exigirVariavel("SENHA_BANCO_APLICACAO"),
  SENHA_BANCO_ADMINISTRACAO: exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
};

/**
 * Espera dos passos que rodam a pré-publicação inteira (bash e dois processos
 * do Node aplicando as migrações). No Windows, com a máquina ocupada, uma
 * execução passa de meio minuto: os casos que publicam de novo dentro do
 * próprio teste também precisam desta espera, e não do minuto do projeto.
 */
const ESPERA_LONGA = 180_000;

/** Códigos de saída combinados com o provedor. */
const LIBERADA = 0;
const REPROVOU = 1;

interface Veredito {
  readonly codigo: number;
  readonly texto: string;
}

interface BancoDaProva {
  readonly nome: string;
  readonly url: string;
}

const criados: string[] = [];

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

/** Banco descartável e completamente vazio — `template0` não traz nada. */
async function criarBancoVazio(rotulo: string): Promise<BancoDaProva> {
  const nome = `sc_t018_${rotulo}_${Math.random().toString(36).slice(2, 8)}`;
  await comClienteAdministrativo((cliente) =>
    cliente.query(`CREATE DATABASE ${nome} TEMPLATE template0`),
  );
  criados.push(nome);

  const url = new URL(URL_ADMINISTRATIVA);
  url.pathname = `/${nome}`;
  return { nome, url: url.toString() };
}

afterAll(async () => {
  for (const nome of criados) {
    await comClienteAdministrativo((cliente) =>
      cliente.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`),
    );
  }
}, ESPERA_LONGA);

async function conectar(url: string): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  return cliente;
}

/**
 * Roda a pré-publicação apontada para um banco, com um ambiente de produção
 * montado à mão — sem nenhuma variável de teste, que é o que ela exige.
 */
function publicar(urlDireta: string): Veredito {
  const execucao = spawnSync("bash", [PRE_DEPLOY], {
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      DATABASE_URL:
        "postgresql://sc_app:seg@agrupador.interno:6432/simpleclick",
      DATABASE_URL_DIRETA: urlDireta,
      REDIS_URL: "redis://cache.interno:6379/0",
      ...SENHAS,
    },
    encoding: "utf8",
    timeout: ESPERA_LONGA,
  });

  return {
    codigo: execucao.status ?? -1,
    texto: `${execucao.stdout ?? ""}${execucao.stderr ?? ""}`,
  };
}

/** Nomes registrados no livro de controle, na ordem de aplicação. */
async function migracoesRegistradas(cliente: pg.Client): Promise<string[]> {
  const resultado = await cliente.query(
    "SELECT nome FROM migracao.aplicadas ORDER BY nome",
  );
  return resultado.rows.map((linha) =>
    String((linha as { nome: string }).nome),
  );
}

/** Quantas linhas uma consulta de contagem devolveu. */
async function contar(
  cliente: pg.Client,
  sql: string,
  valores: unknown[] = [],
): Promise<number> {
  const resultado = await cliente.query(sql, valores);
  return Number((resultado.rows[0] as { total: string | number }).total);
}

// ---------------------------------------------------------------------------
// Caminho feliz: aplicar e só então liberar
// ---------------------------------------------------------------------------

describe("publicação com o banco no ar", () => {
  let banco: BancoDaProva;
  let cliente: pg.Client;
  let veredito: Veredito;

  beforeAll(async () => {
    banco = await criarBancoVazio("ok");
    veredito = publicar(banco.url);
    cliente = await conectar(banco.url);
  }, ESPERA_LONGA);

  afterAll(async () => {
    await cliente?.end();
  });

  it("@spec:AC-029 aplica todas as migrações e só então libera a troca de versão", () => {
    expect(veredito.codigo).toBe(LIBERADA);
    expect(veredito.texto).toContain("publicação liberada");

    // A ordem no relato é a ordem dos fatos: separar ambientes, conferir a
    // compatibilidade, aplicar, conferir o banco — e só no fim liberar.
    const posicao = (trecho: string): number => veredito.texto.indexOf(trecho);
    expect(posicao("separação de ambientes")).toBeGreaterThan(-1);
    expect(posicao("aplicar migrações")).toBeGreaterThan(
      posicao("separação de ambientes"),
    );
    expect(posicao("banco em dia com o código")).toBeGreaterThan(
      posicao("aplicar migrações"),
    );
    expect(posicao("publicação liberada")).toBeGreaterThan(
      posicao("banco em dia com o código"),
    );
  });

  it("@spec:AC-029 o banco já está no estado que a versão nova espera quando a troca é liberada", async () => {
    // Não basta o script dizer que aplicou: o esquema tem de estar lá. É esta
    // asserção que separa "a migração rodou antes" de "a migração vai rodar".
    expect(await migracoesRegistradas(cliente)).toEqual(
      lerMigracoes().map((migracao) => migracao.nome),
    );

    const tabelasDeLoja = await contar(
      cliente,
      `SELECT count(*)::int AS total
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relkind = 'r'
          AND c.relrowsecurity AND c.relforcerowsecurity`,
    );
    expect(tabelasDeLoja).toBeGreaterThan(0);
  });

  it(
    "@spec:AC-029 publicar de novo sem migração nova não altera nada e libera igual",
    async () => {
      const antes = await migracoesRegistradas(cliente);

      const segunda = publicar(banco.url);

      expect(segunda.codigo).toBe(LIBERADA);
      expect(segunda.texto).toContain("nenhuma migração pendente");
      expect(await migracoesRegistradas(cliente)).toEqual(antes);
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// Migração que falha: publicação interrompida, sem estado misto
// ---------------------------------------------------------------------------

/**
 * Índice da última migração que CRIA TABELA.
 *
 * A colisão simulada por esta prova é "alguém criou à mão uma tabela com o nome
 * que a migração nova usa" — a forma mais comum de uma migração falhar no meio.
 * Só serve migração que crie tabela, e a última do diretório nem sempre cria:
 * migração de índice, de política ou de correção de dado não cria nenhuma.
 */
function ultimoIndiceComTabela(arquivos: readonly string[]): number {
  for (let i = arquivos.length - 1; i >= 0; i -= 1) {
    const sql = readFileSync(
      join(DIRETORIO_DE_MIGRACOES, arquivos[i] as string),
      "utf8",
    );
    if (/CREATE TABLE (?:IF NOT EXISTS )?app\.\w+/i.test(sql)) return i;
  }
  throw new Error(
    "nenhuma migração do projeto cria tabela — esta prova não tem colisão a simular",
  );
}

describe("publicação com migração que falha no meio", () => {
  let banco: BancoDaProva;
  let cliente: pg.Client;
  let veredito: Veredito;
  let temporario: string;
  /** A migração que esta publicação traria, e que vai falhar. */
  let migracaoQueFalha = "";
  /** Quantas migrações já estavam aplicadas antes dela. */
  let aplicadasAntes = 0;

  beforeAll(async () => {
    banco = await criarBancoVazio("falha");

    // Cenário: o banco já está no estado de uma versão anterior, com as cinco
    // primeiras migrações aplicadas. A sexta é a que esta publicação traria.
    temporario = mkdtempSync(join(tmpdir(), "sc-t018-migracoes-"));
    const arquivos = readdirSync(DIRETORIO_DE_MIGRACOES).sort((a, b) =>
      a.localeCompare(b, "en"),
    );

    // A migração que fica de fora é a ÚLTIMA QUE CRIA TABELA, e não a última do
    // diretório. A diferença apareceu quando entrou uma migração que só cria
    // índice: o teste procurou tabela onde não havia, o preparo estourou, e os
    // três casos passaram a ser PULADOS — sem reprovar nada. Prova que some em
    // silêncio é pior que prova que falha, porque o portão continua verde.
    const indiceDaQueFalha = ultimoIndiceComTabela(arquivos);
    aplicadasAntes = indiceDaQueFalha;
    for (const arquivo of arquivos.slice(0, indiceDaQueFalha)) {
      copyFileSync(
        join(DIRETORIO_DE_MIGRACOES, arquivo),
        join(temporario, arquivo),
      );
    }

    cliente = await conectar(banco.url);
    await aplicarMigracoes({
      cliente,
      diretorio: temporario,
      segredos: SENHAS,
    });

    // E agora o tropeço: alguém criou à mão, em produção, uma tabela com o
    // nome que a migração nova usa — a forma mais comum de uma migração falhar
    // no meio, porque a criação é ignorada e o que vem depois dela não é.
    //
    // O nome é DESCOBERTO na própria migração que ficou de fora, e não escrito
    // aqui: quando este teste nomeava a tabela à mão, ele passou a reprovar na
    // primeira migração nova que entrou no projeto — a última deixou de ser a
    // que ele imaginava. Teste que quebra a cada migração acrescentada é teste
    // que alguém desativa.
    const ultima = arquivos[indiceDaQueFalha] as string;
    migracaoQueFalha = ultima;
    const sqlDaUltima = readFileSync(
      join(DIRETORIO_DE_MIGRACOES, ultima),
      "utf8",
    );
    const primeiraTabela = /CREATE TABLE (?:IF NOT EXISTS )?app\.(\w+)/i.exec(
      sqlDaUltima,
    );
    if (primeiraTabela === null) {
      throw new Error(
        `A migração ${ultima} não cria tabela nenhuma, então não há colisão a simular. ` +
          "Este teste precisa de uma migração que crie tabela para provar a interrupção.",
      );
    }
    await cliente.query(
      `CREATE TABLE app.${primeiraTabela[1] as string} (id bigint)`,
    );

    veredito = publicar(banco.url);
  }, ESPERA_LONGA);

  afterAll(async () => {
    await cliente?.end();
    if (temporario !== undefined) {
      rmSync(temporario, { recursive: true, force: true });
    }
  });

  it("@spec:AC-029 interrompe a publicação e deixa a versão anterior atendendo", () => {
    expect(veredito.codigo).toBe(REPROVOU);
    expect(veredito.texto).toContain("publicação interrompida");
    expect(veredito.texto).toContain("aplicar migrações");
    expect(veredito.texto).toContain(
      "a versão anterior continua atendendo — nada foi trocado",
    );
    expect(veredito.texto).not.toContain("publicação liberada");

    // A recusa nomeia o arquivo: sem isso, quem lê o registro sabe que falhou e
    // não sabe onde.
    expect(veredito.texto).toContain(migracaoQueFalha);
  });

  it("@spec:AC-029 não deixa o banco em estado misto: da migração que falhou, nada entrou", async () => {
    // O livro de controle continua com as cinco de antes, e só elas.
    // A contagem vem do MESMO índice que montou o cenário: escrever aqui
    // "todas menos a última" voltaria a quebrar na próxima migração que não
    // criar tabela, que é como esta prova sumiu da primeira vez.
    const registradas = await migracoesRegistradas(cliente);
    expect(registradas).toHaveLength(aplicadasAntes);
    expect(registradas).not.toContain(migracaoQueFalha);

    // E nenhum objeto da migração que falhou sobrou pelo caminho: índice,
    // política e gatilho vinham DEPOIS do comando que quebrou, e todos foram
    // desfeitos junto — é a transação por arquivo que garante isso.
    //
    // Os nomes são LIDOS da migração que falhou, e não escritos aqui. Antes eram
    // fixos, e o teste passou a mentir na primeira migração nova: ele conferia a
    // ausência de objetos de um arquivo que agora é aplicado com sucesso, então
    // media zero por motivo errado e passava sem provar nada.
    const sqlQueFalhou = readFileSync(
      join(DIRETORIO_DE_MIGRACOES, migracaoQueFalha),
      "utf8",
    );

    const indices = [
      ...sqlQueFalhou.matchAll(
        /CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?(\w+)/gi,
      ),
    ].map((achado) => achado[1] as string);
    const politicas = [...sqlQueFalhou.matchAll(/CREATE POLICY (\w+)/gi)].map(
      (achado) => achado[1] as string,
    );

    // Sem isto, uma migração que não criasse índice nem política deixaria as
    // duas listas vazias e o teste passaria sem ter olhado para nada.
    expect(indices.length + politicas.length).toBeGreaterThan(0);

    for (const indice of indices) {
      expect(
        await contar(
          cliente,
          `SELECT count(*)::int AS total FROM pg_indexes
            WHERE schemaname = 'app' AND indexname = '${indice}'`,
        ),
      ).toBe(0);
    }
    for (const politica of politicas) {
      expect(
        await contar(
          cliente,
          `SELECT count(*)::int AS total FROM pg_policy WHERE polname = '${politica}'`,
        ),
      ).toBe(0);
    }
  });

  it(
    "@spec:AC-029 a publicação seguinte encontra o banco intacto e volta a reprovar do mesmo jeito",
    async () => {
      const antes = await migracoesRegistradas(cliente);

      const segunda = publicar(banco.url);

      // Reprovar de novo, igual, é o que torna a falha investigável: nada mudou
      // por dentro entre uma tentativa e outra.
      expect(segunda.codigo).toBe(REPROVOU);
      expect(await migracoesRegistradas(cliente)).toEqual(antes);
    },
    ESPERA_LONGA,
  );
});
