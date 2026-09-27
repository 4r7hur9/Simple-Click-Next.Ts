import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  aplicarMigracoes,
  consultarEstado,
  derivarUrlDePapel,
  DIRETORIO_DE_MIGRACOES,
  ErroDeIsolamento,
  ErroDeMigracaoDivergente,
  ErroDeMigracaoPendente,
  exigirIsolamentoEmTodaTabelaDeLoja,
  exigirMigracoesEmDia,
  lerMigracoes,
  substituirSegredos,
  tabelasSemIsolamento,
} from "./migrate.ts";

/**
 * Prova das migrações e do isolamento por linha, contra PostgreSQL de verdade.
 *
 * Não existe versão em memória disto: política de isolamento, papel de banco,
 * privilégio por coluna e gatilho de evento são comportamento do PostgreSQL, e
 * um substituto simulado provaria apenas que o substituto concorda com o teste.
 * O banco descartável do ambiente local existe exatamente para isto.
 *
 * Cada execução cria o próprio banco a partir de molde vazio e o apaga no fim,
 * então rodar duas vezes dá o mesmo resultado e nenhum dado de desenvolvimento
 * é tocado.
 */

const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../", import.meta.url),
);

// O arquivo de ambiente é opcional: quem exporta as variáveis na sessão não
// precisa dele. Segredo nunca vem do código (P-002) — nem aqui.
const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/** Variável obrigatória, com recusa que diz o que fazer em vez de só falhar. */
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
const SENHAS = {
  migrador: exigirVariavel("SENHA_BANCO_MIGRADOR"),
  aplicacao: exigirVariavel("SENHA_BANCO_APLICACAO"),
  administracao: exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
};

const SEGREDOS_DAS_MIGRACOES = {
  SENHA_BANCO_MIGRADOR: SENHAS.migrador,
  SENHA_BANCO_APLICACAO: SENHAS.aplicacao,
  SENHA_BANCO_ADMINISTRACAO: SENHAS.administracao,
};

const ESPERA_LONGA = 120_000;

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** Banco descartável, criado a partir de molde vazio. */
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
  const nome = `sc_t004_${Math.random().toString(36).slice(2, 10)}`;
  // `template0` é o molde sem nada: é o "banco de dados completamente vazio"
  // que AC-032 pede.
  await comClienteAdministrativo((cliente) =>
    cliente.query(`CREATE DATABASE ${nome} TEMPLATE template0`),
  );

  const url = new URL(URL_ADMINISTRATIVA);
  url.pathname = `/${nome}`;
  return { nome, url: url.toString() };
}

async function apagarBancoDeProva(banco: BancoDeProva): Promise<void> {
  await comClienteAdministrativo((cliente) =>
    cliente.query(`DROP DATABASE IF EXISTS ${banco.nome} WITH (FORCE)`),
  );
}

async function conectar(url: string): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  return cliente;
}

/** Executa e devolve o código de erro do PostgreSQL, ou `null` quando passou. */
async function codigoDeErro(
  cliente: pg.Client,
  sql: string,
  valores: unknown[] = [],
): Promise<string | null> {
  try {
    await cliente.query(sql, valores);
    return null;
  } catch (erro) {
    return (erro as { code?: string }).code ?? "sem-codigo";
  }
}

/** Quantas linhas a conexão enxerga na tabela, no contexto em que está. */
async function quantasLinhas(
  cliente: pg.Client,
  tabela: string,
): Promise<number> {
  const resultado = await cliente.query(
    `SELECT count(*)::int AS total FROM app.${tabela}`,
  );
  return (resultado.rows[0] as { total: number }).total;
}

/**
 * Retrato da estrutura do esquema `app`, em texto ordenado.
 *
 * Serve a duas provas: mostrar que o banco vazio chegou ao estado esperado
 * (AC-032) e mostrar que reaplicar não mexeu em nada (AC-033). Compara
 * definição, e não só nome, porque índice e política mudam de conteúdo sem
 * mudar de nome.
 */
async function retratoDaEstrutura(cliente: pg.Client): Promise<string[]> {
  const consultas: Record<string, string> = {
    tabela: `SELECT c.relname || ' rls=' || c.relrowsecurity::text
                    || '/' || c.relforcerowsecurity::text AS item
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'app' AND c.relkind = 'r'`,
    coluna: `SELECT table_name || '.' || column_name || ':' || data_type AS item
               FROM information_schema.columns WHERE table_schema = 'app'`,
    indice: `SELECT indexdef AS item FROM pg_indexes WHERE schemaname = 'app'`,
    politica: `SELECT c.relname || '/' || p.polname || '/' || p.polcmd::text
                      || '/permissiva=' || p.polpermissive::text
                      || '/usando=' || coalesce(pg_get_expr(p.polqual, p.polrelid), '-')
                      || '/checando=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-') AS item
                 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app'`,
    funcao: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                    || ' definidor=' || p.prosecdef::text AS item
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'app'`,
    gatilho: `SELECT c.relname || '/' || t.tgname AS item
                FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'app' AND NOT t.tgisinternal`,
    "gatilho-de-evento": `SELECT evtname AS item FROM pg_event_trigger`,
    privilegio: `SELECT grantee || ' ' || privilege_type || ' em ' || table_name AS item
                   FROM information_schema.role_table_grants
                  WHERE table_schema = 'app' AND grantee IN ('sc_app', 'sc_admin')`,
  };

  const itens: string[] = [];
  for (const [genero, sql] of Object.entries(consultas)) {
    const resultado = await cliente.query(sql);
    for (const linha of resultado.rows) {
      itens.push(`${genero}: ${String((linha as { item: unknown }).item)}`);
    }
  }
  return itens.sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Copia as migrações para um diretório temporário e acrescenta uma que ainda
 * não foi aplicada — o cenário de "o código espera uma coluna que a migração
 * pendente cria".
 */
function diretorioComMigracaoNova(
  nomeDaNova: string,
  sqlDaNova: string,
): { diretorio: string; descartar: () => void } {
  const diretorio = mkdtempSync(join(tmpdir(), "sc-migracoes-"));
  for (const arquivo of readdirSync(DIRETORIO_DE_MIGRACOES)) {
    copyFileSync(
      join(DIRETORIO_DE_MIGRACOES, arquivo),
      join(diretorio, arquivo),
    );
  }
  writeFileSync(join(diretorio, nomeDaNova), sqlDaNova, "utf8");
  return {
    diretorio,
    descartar: () => rmSync(diretorio, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Cenário compartilhado
// ---------------------------------------------------------------------------

let banco: BancoDeProva;
let migrador: pg.Client;
let lojaA = "";
let lojaB = "";

beforeAll(async () => {
  banco = await criarBancoDeProva();
  migrador = await conectar(banco.url);

  await aplicarMigracoes({
    cliente: migrador,
    segredos: SEGREDOS_DAS_MIGRACOES,
  });

  // Duas lojas de ramos diferentes, cada uma com um produto. É o mínimo para
  // que "não devolveu nada" signifique isolamento, e não banco vazio.
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

  lojaA = await criarLoja(
    "0001",
    "Lanchonete da Ana",
    "lanchonete-da-ana",
    "FOOD_SNACK",
  );
  lojaB = await criarLoja("0002", "Bruno Modas", "bruno-modas", "APPAREL");

  await migrador.query(
    `INSERT INTO app.products (store_id, name, slug, vertical_code, status, display_price_cents)
     VALUES ($1, 'X-Salada', 'x-salada', 'FOOD_SNACK', 'PUBLISHED', 2350)`,
    [lojaA],
  );
  await migrador.query(
    `INSERT INTO app.products (store_id, name, slug, vertical_code, status, display_price_cents)
     VALUES ($1, 'Camiseta lisa', 'camiseta-lisa', 'APPAREL', 'PUBLISHED', 5990)`,
    [lojaB],
  );
  await migrador.query(
    `INSERT INTO app.store_settings (store_id) VALUES ($1), ($2)`,
    [lojaA, lojaB],
  );
}, ESPERA_LONGA);

afterAll(async () => {
  await migrador?.end();
  if (banco) await apagarBancoDeProva(banco);
});

// ---------------------------------------------------------------------------
// Segredo das migrações (P-002)
// ---------------------------------------------------------------------------

describe("substituição de segredo na migração", () => {
  const SQL = "CREATE ROLE sc_app PASSWORD @@SENHA_BANCO_APLICACAO@@;";

  it("troca o marcador por literal SQL com o valor do ambiente", () => {
    expect(
      substituirSegredos(SQL, { SENHA_BANCO_APLICACAO: "abcdef123456" }),
    ).toBe("CREATE ROLE sc_app PASSWORD 'abcdef123456';");
  });

  it("recusa pelo nome a variável que falta, em vez de gerar SQL quebrado", () => {
    expect(() => substituirSegredos(SQL, {})).toThrow(/SENHA_BANCO_APLICACAO/);
  });

  it("recusa valor com aspa, que viraria injeção pela variável de ambiente", () => {
    // O valor entra no texto do comando; aceitar aspa aqui deixaria quem
    // controla o ambiente escrever SQL arbitrário com poder de migração.
    expect(() =>
      substituirSegredos(SQL, {
        SENHA_BANCO_APLICACAO: "x'; ALTER ROLE sc_app SUPERUSER; --",
      }),
    ).toThrow(/caractere não aceito/);
  });
});

// ---------------------------------------------------------------------------
// AC-032 · AC-033 · AC-034 — o aplicador
// ---------------------------------------------------------------------------

describe("aplicador de migrações", () => {
  it(
    "@spec:AC-032 leva um banco vazio ao estado esperado só com as migrações, sem passo manual",
    async () => {
      const vazio = await criarBancoDeProva();
      const cliente = await conectar(vazio.url);

      try {
        const antes = await retratoDaEstrutura(cliente);
        expect(antes).toEqual([]);

        const relatorio = await aplicarMigracoes({
          cliente,
          segredos: SEGREDOS_DAS_MIGRACOES,
        });

        expect(relatorio.aplicadas).toEqual(
          lerMigracoes().map((migracao) => migracao.nome),
        );

        const depois = await retratoDaEstrutura(cliente);
        const tem = (trecho: string): boolean =>
          depois.some((item) => item.includes(trecho));

        // Tabela, com isolamento ligado e forçado.
        for (const tabela of [
          "identities",
          "platform_admins",
          "vertical_presets",
          "stores",
          "store_settings",
          "store_domains",
          "store_members",
          "products",
          "store_customers",
          "audit_log",
        ]) {
          expect(
            depois,
            `tabela ${tabela} com isolamento ligado e forçado`,
          ).toContain(`tabela: ${tabela} rls=true/true`);
        }

        // Índice — inclusive os parciais, que o Prisma não gera.
        expect(tem("CREATE UNIQUE INDEX products_store_slug_uk")).toBe(true);
        expect(tem("products_store_vitrine_ix")).toBe(true);
        expect(tem("WHERE (deleted_at IS NULL)")).toBe(true);

        // Função de contexto, e função com direitos de quem definiu.
        expect(tem("funcao: current_store_id() definidor=false")).toBe(true);
        expect(
          tem("funcao: resolve_store(p_host text, p_slug text) definidor=true"),
        ).toBe(true);
        expect(tem("funcao: my_store_customer_ids() definidor=true")).toBe(
          true,
        );

        // Política de isolamento, uma por comando, mais a restritiva.
        expect(
          tem("politica: products/products_staff_select/r/permissiva=true"),
        ).toBe(true);
        expect(
          tem("politica: products/products_staff_insert/a/permissiva=true"),
        ).toBe(true);
        expect(
          tem("politica: products/products_staff_update/w/permissiva=true"),
        ).toBe(true);
        expect(
          tem("politica: products/products_staff_delete/d/permissiva=true"),
        ).toBe(true);
        expect(
          tem("politica: products/products_require_ctx/*/permissiva=false"),
        ).toBe(true);

        // Gatilho, inclusive o de evento que fecha a porta do esquecimento.
        expect(tem("gatilho: audit_log/audit_log_append_only")).toBe(true);
        expect(tem("gatilho: products/products_bump_catalog")).toBe(true);
        expect(tem("gatilho-de-evento: trg_force_rls")).toBe(true);

        // Catálogo de ramos: dado de plataforma, não dado de exemplo.
        const ramos = await cliente.query(
          "SELECT count(*)::int AS total FROM app.vertical_presets",
        );
        expect((ramos.rows[0] as { total: number }).total).toBe(8);
      } finally {
        await cliente.end();
        await apagarBancoDeProva(vazio);
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-033 aplicada de novo não altera nada e termina com sucesso avisando que não havia pendência",
    async () => {
      const antes = await retratoDaEstrutura(migrador);
      const registroAntes = await migrador.query(
        "SELECT nome, sha256, aplicada_em FROM migracao.aplicadas ORDER BY nome",
      );

      const relatos: string[] = [];
      const relatorio = await aplicarMigracoes({
        cliente: migrador,
        segredos: SEGREDOS_DAS_MIGRACOES,
        relatar: (linha) => relatos.push(linha),
      });

      expect(relatorio.aplicadas).toEqual([]);
      expect(relatos).toContain("nenhuma migração pendente");

      const depois = await retratoDaEstrutura(migrador);
      expect(depois).toEqual(antes);

      const registroDepois = await migrador.query(
        "SELECT nome, sha256, aplicada_em FROM migracao.aplicadas ORDER BY nome",
      );
      expect(registroDepois.rows).toEqual(registroAntes.rows);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-034 acusa a migração pendente pelo nome antes de o código topar com a coluna que falta",
    async () => {
      const nova = "0999_coluna_que_o_codigo_espera.sql";
      const temporario = diretorioComMigracaoNova(
        nova,
        [
          "SET LOCAL ROLE sc_migrator;",
          "ALTER TABLE app.products ADD COLUMN prazo_de_troca_dias integer;",
        ].join("\n"),
      );

      try {
        // O código já espera a coluna; o banco ainda não a tem.
        const coluna = await migrador.query(
          `SELECT count(*)::int AS total FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'products'
              AND column_name = 'prazo_de_troca_dias'`,
        );
        expect((coluna.rows[0] as { total: number }).total).toBe(0);

        const estado = await consultarEstado(
          migrador,
          lerMigracoes(temporario.diretorio),
        );
        expect(estado.pendentes).toEqual([nova]);
        expect(estado.alteradas).toEqual([]);

        const recusa = await exigirMigracoesEmDia(
          migrador,
          temporario.diretorio,
        ).then(
          () => null,
          (erro: unknown) => erro,
        );

        expect(recusa).toBeInstanceOf(ErroDeMigracaoPendente);
        expect((recusa as ErroDeMigracaoPendente).pendentes).toEqual([nova]);
        expect((recusa as Error).message).toContain(nova);

        // E o banco continua intocado: detectar não é aplicar.
        const depois = await migrador.query(
          `SELECT count(*)::int AS total FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'products'
              AND column_name = 'prazo_de_troca_dias'`,
        );
        expect((depois.rows[0] as { total: number }).total).toBe(0);
      } finally {
        temporario.descartar();
      }
    },
    ESPERA_LONGA,
  );

  it("aceita como em dia o banco que tem exatamente as migrações do repositório", async () => {
    await expect(exigirMigracoesEmDia(migrador)).resolves.toBeUndefined();
  });

  it(
    "desfaz a migração inteira quando ela falha no meio, sem registrar nada",
    async () => {
      const quebrada = "9002_quebra_no_meio.sql";
      const temporario = diretorioComMigracaoNova(
        quebrada,
        [
          "SET LOCAL ROLE sc_migrator;",
          "CREATE TABLE app.meia_migracao (id integer PRIMARY KEY);",
          "SELECT 1 / 0;",
        ].join("\n"),
      );

      try {
        await expect(
          aplicarMigracoes({
            cliente: migrador,
            diretorio: temporario.diretorio,
            segredos: SEGREDOS_DAS_MIGRACOES,
          }),
        ).rejects.toThrow(quebrada);

        // Nem a tabela que ela chegou a criar, nem a linha no livro: meio
        // esquema aplicado é o estado do qual não se sai sem intervenção
        // manual, e é justamente o que a transação por migração evita.
        const sobrou = await migrador.query(
          "SELECT to_regclass('app.meia_migracao') IS NULL AS ausente",
        );
        expect(sobrou.rows[0]).toEqual({ ausente: true });

        const registro = await migrador.query(
          "SELECT count(*)::int AS total FROM migracao.aplicadas WHERE nome = $1",
          [quebrada],
        );
        expect((registro.rows[0] as { total: number }).total).toBe(0);
      } finally {
        temporario.descartar();
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-045 acusa pelo nome a migração já aplicada cujo arquivo mudou depois",
    async () => {
      const temporario = diretorioComMigracaoNova(
        "0004_catalogo.sql",
        "-- conteúdo trocado depois de a migração já ter sido aplicada\n",
      );

      try {
        const estado = await consultarEstado(
          migrador,
          lerMigracoes(temporario.diretorio),
        );
        expect(estado.alteradas).toEqual(["0004_catalogo.sql"]);

        const recusa = await exigirMigracoesEmDia(
          migrador,
          temporario.diretorio,
        ).then(
          () => null,
          (erro: unknown) => erro,
        );
        expect(recusa).toBeInstanceOf(ErroDeMigracaoDivergente);
        expect((recusa as Error).message).toContain("0004_catalogo.sql");
      } finally {
        temporario.descartar();
      }
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-008 — verificação estrutural do isolamento
// ---------------------------------------------------------------------------

describe("verificação estrutural do isolamento", () => {
  it(
    "@spec:AC-008 reprova a tabela de loja que ficar sem o isolamento ligado e forçado",
    async () => {
      // O esquema que as migrações produzem passa.
      expect(await tabelasSemIsolamento(migrador)).toEqual([]);
      await expect(
        exigirIsolamentoEmTodaTabelaDeLoja(migrador),
      ).resolves.toBeUndefined();

      await migrador.query(`
        CREATE TABLE app.pedido_de_orcamento (
          id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          store_id uuid NOT NULL REFERENCES app.stores (id),
          nota     text
        )`);

      try {
        // Rede de segurança: o gatilho de evento já ligou o isolamento sozinho,
        // então o esquecimento de uma migração nova falha fechado.
        const aposCriar = await migrador.query(
          `SELECT relrowsecurity AS ativado, relforcerowsecurity AS forcado
             FROM pg_class WHERE oid = 'app.pedido_de_orcamento'::regclass`,
        );
        expect(aposCriar.rows[0]).toEqual({ ativado: true, forcado: true });
        expect(await tabelasSemIsolamento(migrador)).toEqual([]);

        // Isolamento ligado mas não forçado ainda deixa o dono da tabela passar
        // por cima — e por isso continua sendo reprovação.
        await migrador.query(
          "ALTER TABLE app.pedido_de_orcamento NO FORCE ROW LEVEL SECURITY",
        );
        expect(await tabelasSemIsolamento(migrador)).toEqual([
          { tabela: "pedido_de_orcamento", ativado: true, forcado: false },
        ]);

        await migrador.query(
          "ALTER TABLE app.pedido_de_orcamento DISABLE ROW LEVEL SECURITY",
        );
        expect(await tabelasSemIsolamento(migrador)).toEqual([
          { tabela: "pedido_de_orcamento", ativado: false, forcado: false },
        ]);

        const recusa = await exigirIsolamentoEmTodaTabelaDeLoja(migrador).then(
          () => null,
          (erro: unknown) => erro,
        );
        expect(recusa).toBeInstanceOf(ErroDeIsolamento);
        expect((recusa as Error).message).toContain("pedido_de_orcamento");
      } finally {
        await migrador.query("DROP TABLE IF EXISTS app.pedido_de_orcamento");
      }
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-009 — ausência de contexto é negação
// ---------------------------------------------------------------------------

describe("consulta da aplicação sem contexto de loja", () => {
  let aplicacao: pg.Client;

  beforeAll(async () => {
    aplicacao = await conectar(
      derivarUrlDePapel(banco.url, "sc_app", SENHAS.aplicacao),
    );
  }, ESPERA_LONGA);

  afterAll(async () => {
    await aplicacao?.end();
  });

  it(
    "@spec:AC-009 devolve zero linhas em vez de tudo quando o contexto de loja não foi definido",
    async () => {
      // O dado existe: quem tem a credencial de migração enxerga as duas lojas.
      expect(await quantasLinhas(migrador, "products")).toBe(2);
      expect(await quantasLinhas(migrador, "stores")).toBe(2);

      for (const tabela of [
        "products",
        "stores",
        "store_settings",
        "store_members",
        "store_customers",
        "store_domains",
        "audit_log",
      ]) {
        expect(
          await quantasLinhas(aplicacao, tabela),
          `${tabela} sem contexto de loja`,
        ).toBe(0);
      }
    },
    ESPERA_LONGA,
  );

  it("@spec:AC-009 trata contexto vazio como ausente, sem quebrar a consulta", async () => {
    // Depois de um COMMIT o parâmetro da sessão continua definido com cadeia
    // vazia. Sem tolerar isso, a conversão levantaria erro de sintaxe de
    // identificador justamente nas conexões reaproveitadas do agrupador.
    await aplicacao.query("BEGIN");
    try {
      await aplicacao.query("SELECT set_config('app.store_id', '', true)");
      await expect(quantasLinhas(aplicacao, "products")).resolves.toBe(0);
      await expect(quantasLinhas(aplicacao, "stores")).resolves.toBe(0);
    } finally {
      await aplicacao.query("ROLLBACK");
    }
  });

  it("@spec:AC-009 com contexto definido devolve só o da loja corrente", async () => {
    // A equipe só entra na loja de que é membro (migração 0041): o contexto
    // de dona leva a loja, a identidade e o papel — e a identidade tem vínculo
    // aceito com a loja A.
    const dona = await migrador.query(
      `INSERT INTO app.identities (email_norm, display_name)
       VALUES ('dona.da.lanchonete@exemplo.test', 'Ana') RETURNING id`,
    );
    const donaId = String((dona.rows[0] as { id: string }).id);
    await migrador.query(
      `INSERT INTO app.store_members (store_id, identity_id, role, invite_accepted_at)
       VALUES ($1, $2, 'OWNER', now())`,
      [lojaA, donaId],
    );

    await aplicacao.query("BEGIN");
    try {
      await aplicacao.query("SELECT set_config('app.store_id', $1, true)", [
        lojaA,
      ]);
      await aplicacao.query("SELECT set_config('app.user_id', $1, true)", [
        donaId,
      ]);
      await aplicacao.query("SELECT set_config('app.role', 'OWNER', true)");

      const produtos = await aplicacao.query(
        "SELECT name FROM app.products ORDER BY name",
      );
      expect(produtos.rows).toEqual([{ name: "X-Salada" }]);

      const daOutraLoja = await aplicacao.query(
        "SELECT name FROM app.products WHERE store_id = $1",
        [lojaB],
      );
      expect(daOutraLoja.rows).toEqual([]);
    } finally {
      await aplicacao.query("ROLLBACK");
      await migrador.query(
        `DELETE FROM app.store_members WHERE identity_id = $1`,
        [donaId],
      );
      await migrador.query(`DELETE FROM app.identities WHERE id = $1`, [
        donaId,
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-012 — três credenciais, uma só dona do esquema
// ---------------------------------------------------------------------------

describe("credencial de migração separada da credencial da aplicação", () => {
  let aplicacao: pg.Client;

  beforeAll(async () => {
    aplicacao = await conectar(
      derivarUrlDePapel(banco.url, "sc_app", SENHAS.aplicacao),
    );
  }, ESPERA_LONGA);

  afterAll(async () => {
    await aplicacao?.end();
  });

  it(
    "@spec:AC-012 a credencial da aplicação não tem como contornar o isolamento",
    async () => {
      const quemSou = await aplicacao.query("SELECT current_user AS papel");
      expect(quemSou.rows[0]).toEqual({ papel: "sc_app" });

      const atributos = await migrador.query(
        `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
          WHERE rolname IN ('sc_app', 'sc_admin', 'sc_migrator') ORDER BY rolname`,
      );
      expect(atributos.rows).toEqual([
        { rolname: "sc_admin", rolsuper: false, rolbypassrls: false },
        { rolname: "sc_app", rolsuper: false, rolbypassrls: false },
        // Contornar o isolamento é privilégio de uma credencial só, e ela nunca
        // atende requisição.
        { rolname: "sc_migrator", rolsuper: false, rolbypassrls: true },
      ]);

      // Dono de tabela passa por cima do isolamento quando ele não está
      // forçado: nenhum papel de execução pode ser dono de nada.
      const donos = await migrador.query(
        `SELECT DISTINCT pg_get_userbyid(c.relowner) AS dono
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'app' AND c.relkind = 'r'`,
      );
      expect(donos.rows).toEqual([{ dono: "sc_migrator" }]);

      await aplicacao.query("BEGIN");
      try {
        await aplicacao.query("SELECT set_config('app.store_id', $1, true)", [
          lojaA,
        ]);
        // Desligar o isolamento na sessão é permitido a quem pode contorná-lo;
        // para quem não pode, a consulta é recusada em vez de devolver tudo.
        await aplicacao.query("SET LOCAL row_security = off");
        expect(
          await codigoDeErro(aplicacao, "SELECT 1 FROM app.products"),
        ).toBe("42501");
      } finally {
        await aplicacao.query("ROLLBACK");
      }

      // Nem por cima da estrutura: não é dona do esquema nem das tabelas.
      expect(
        await codigoDeErro(aplicacao, "CREATE TABLE app.atalho (id integer)"),
      ).toBe("42501");
      expect(
        await codigoDeErro(
          aplicacao,
          "ALTER TABLE app.products DISABLE ROW LEVEL SECURITY",
        ),
      ).toBe("42501");
      expect(
        await codigoDeErro(
          aplicacao,
          "ALTER TABLE app.products NO FORCE ROW LEVEL SECURITY",
        ),
      ).toBe("42501");

      // E nem pela coluna que decide o tipo de negócio, que é da administração.
      expect(
        await codigoDeErro(
          aplicacao,
          "UPDATE app.stores SET vertical_code = 'APPAREL' WHERE id = $1",
          [lojaA],
        ),
      ).toBe("42501");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-012 a migração roda com a credencial própria, e a da aplicação é recusada",
    async () => {
      const nova = "9001_prova_da_credencial.sql";
      const temporario = diretorioComMigracaoNova(
        nova,
        [
          "SET LOCAL ROLE sc_migrator;",
          "CREATE TABLE app.prova_da_credencial (id integer PRIMARY KEY);",
        ].join("\n"),
      );

      const comCredencialDeMigracao = await conectar(
        derivarUrlDePapel(banco.url, "sc_migrator", SENHAS.migrador),
      );

      try {
        // A credencial da aplicação nem chega a abrir o livro de controle.
        await expect(
          aplicarMigracoes({
            cliente: aplicacao,
            diretorio: temporario.diretorio,
            segredos: SEGREDOS_DAS_MIGRACOES,
          }),
        ).rejects.toThrow(/permission denied/i);

        const naoCriou = await migrador.query(
          "SELECT to_regclass('app.prova_da_credencial') IS NULL AS ausente",
        );
        expect(naoCriou.rows[0]).toEqual({ ausente: true });

        // A credencial de migração, sim: é a dona do esquema.
        const relatorio = await aplicarMigracoes({
          cliente: comCredencialDeMigracao,
          diretorio: temporario.diretorio,
          segredos: SEGREDOS_DAS_MIGRACOES,
        });
        expect(relatorio.aplicadas).toEqual([nova]);

        const criou = await migrador.query(
          "SELECT to_regclass('app.prova_da_credencial') IS NOT NULL AS existe",
        );
        expect(criou.rows[0]).toEqual({ existe: true });
      } finally {
        await comCredencialDeMigracao.end();
        temporario.descartar();
        await migrador.query("DROP TABLE IF EXISTS app.prova_da_credencial");
        await migrador.query("DELETE FROM migracao.aplicadas WHERE nome = $1", [
          nova,
        ]);
      }
    },
    ESPERA_LONGA,
  );
});
