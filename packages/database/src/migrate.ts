/**
 * Aplicador de migrações do SimpleClick.
 *
 * É próprio de propósito. O Prisma não gera política de isolamento, função,
 * gatilho, índice parcial nem verificação de coluna — e é exatamente disso que
 * o esquema deste projeto é feito. O esquema declarado em `prisma/schema.prisma`
 * serve para gerar tipos; a fonte da verdade da estrutura são os arquivos SQL
 * de `migrations/`, escritos à mão e aplicados por este arquivo.
 *
 * O que ele garante, e por quê:
 *
 * - **Ordem e registro.** Cada arquivo roda uma vez, na ordem do número, e fica
 *   registrado num livro de controle. Reaplicar não altera nada (AC-033).
 * - **Uma transação por migração.** Falha no meio não deixa meio esquema: ou o
 *   arquivo inteiro entrou, ou nada dele entrou — e o livro de controle só
 *   recebe a linha na mesma transação.
 * - **Trava entre processos.** Duas publicações simultâneas não aplicam a mesma
 *   migração duas vezes.
 * - **Impressão digital.** Migração já aplicada que muda de conteúdo é
 *   divergência apontada pelo nome, não surpresa em produção.
 * - **Segredo só por variável de ambiente.** Os papéis de banco nascem com
 *   senha vinda do ambiente, substituída aqui antes do envio (P-002). Nenhuma
 *   senha aparece em arquivo versionado nem em mensagem de erro.
 * - **Autoverificação estrutural.** Ao fim da aplicação, o próprio aplicador
 *   recusa um esquema em que exista tabela de loja sem isolamento ligado e
 *   forçado (AC-008): esquecimento vira falha na hora, não vazamento depois.
 *
 * A conexão usada aqui é DIRETA, sem agrupador: migração cria função, gatilho e
 * política, e agrupador em modo transação não sustenta esse tipo de trabalho.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Tipos de fronteira
// ---------------------------------------------------------------------------

/** Linha devolvida por uma consulta, com colunas de tipo desconhecido. */
export type LinhaDeConsulta = Record<string, unknown>;

/**
 * O mínimo que o aplicador precisa de um cliente de banco. Manter a fronteira
 * estreita é o que permite provar o aplicador contra um PostgreSQL real sem
 * amarrá-lo a um driver específico.
 */
export interface ClienteSql {
  query(
    texto: string,
    valores?: unknown[],
  ): Promise<{ rows: LinhaDeConsulta[]; rowCount: number | null }>;
}

/** Uma migração lida do disco, com a impressão digital do conteúdo. */
export interface Migracao {
  readonly nome: string;
  readonly caminho: string;
  readonly sql: string;
  readonly sha256: string;
}

/** Uma migração já registrada no livro de controle. */
export interface MigracaoAplicada {
  readonly nome: string;
  readonly sha256: string;
  readonly aplicadaEm: Date;
}

/** Comparação entre o que está no disco e o que está no banco. */
export interface EstadoDasMigracoes {
  readonly aplicadas: readonly MigracaoAplicada[];
  /** No disco e ainda não aplicadas, na ordem em que rodarão. */
  readonly pendentes: readonly string[];
  /** Aplicadas cujo arquivo mudou depois — o banco não bate com o código. */
  readonly alteradas: readonly string[];
  /** Aplicadas cujo arquivo sumiu do repositório. */
  readonly ausentes: readonly string[];
}

/** Resultado de uma execução do aplicador. */
export interface RelatorioDeAplicacao {
  readonly aplicadas: readonly string[];
  readonly jaAplicadas: number;
  readonly duracaoMs: number;
}

/** Tabela de loja que ficou sem o isolamento por linha ligado e forçado. */
export interface TabelaSemIsolamento {
  readonly tabela: string;
  readonly ativado: boolean;
  readonly forcado: boolean;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Diretório padrão das migrações, resolvido a partir deste arquivo. */
export const DIRETORIO_DE_MIGRACOES = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

/** Onde vive o livro de controle. Fora de `app` de propósito: o esquema `app` é
 *  território das políticas de isolamento, e o registro de migrações não é dado
 *  de loja nenhuma. */
export const ESQUEMA_DE_CONTROLE = "migracao";
export const TABELA_DE_CONTROLE = "aplicadas";

/** Nome de arquivo aceito: quatro dígitos, sublinhado, nome em minúsculas. */
const NOME_DE_MIGRACAO = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Marcador de segredo dentro do SQL: `@@NOME_DA_VARIAVEL@@`. */
const MARCADOR_DE_SEGREDO = /@@([A-Z][A-Z0-9_]*)@@/g;

/**
 * O que se aceita como valor de segredo. A lista é fechada porque o valor entra
 * no SQL: aceitar aspa simples aqui seria abrir injeção pela variável de
 * ambiente. Doze caracteres é o piso de uma senha de banco gerada.
 */
const VALOR_DE_SEGREDO_ACEITO = /^[A-Za-z0-9_\-.~+=]{12,200}$/;

/** Chave da trava entre processos. Qualquer inteiro serve; este é fixo. */
const CHAVE_DA_TRAVA = 8_310_042;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** O banco está atrás do código: existe migração no disco que não foi aplicada. */
export class ErroDeMigracaoPendente extends Error {
  readonly pendentes: readonly string[];

  constructor(pendentes: readonly string[]) {
    super(
      [
        `O banco está atrás do código: ${pendentes.length} migração(ões) pendente(s).`,
        ...pendentes.map((nome) => `  ✘ ${nome}`),
        "",
        "Aplique antes de subir: node packages/database/src/migrate.ts aplicar",
      ].join("\n"),
    );
    this.name = "ErroDeMigracaoPendente";
    this.pendentes = pendentes;
  }
}

/** O banco e o repositório contam histórias diferentes sobre o que já rodou. */
export class ErroDeMigracaoDivergente extends Error {
  readonly alteradas: readonly string[];
  readonly ausentes: readonly string[];

  constructor(alteradas: readonly string[], ausentes: readonly string[]) {
    super(
      [
        "O histórico de migrações do banco não bate com o do repositório.",
        ...alteradas.map(
          (nome) => `  ✘ ${nome} — já aplicada, mas o arquivo mudou depois`,
        ),
        ...ausentes.map(
          (nome) => `  ✘ ${nome} — aplicada no banco e ausente no repositório`,
        ),
        "",
        "Migração aplicada é imutável: corrija criando uma migração nova.",
      ].join("\n"),
    );
    this.name = "ErroDeMigracaoDivergente";
    this.alteradas = alteradas;
    this.ausentes = ausentes;
  }
}

/** Alguma tabela de loja ficou sem o isolamento por linha (AC-008). */
export class ErroDeIsolamento extends Error {
  readonly tabelas: readonly TabelaSemIsolamento[];

  constructor(tabelas: readonly TabelaSemIsolamento[]) {
    super(
      [
        `Isolamento por linha ausente em ${tabelas.length} tabela(s) de loja.`,
        ...tabelas.map(
          (t) =>
            `  ✘ app.${t.tabela} — ativado: ${t.ativado ? "sim" : "não"}, forçado: ${t.forcado ? "sim" : "não"}`,
        ),
        "",
        "Tabela com identificador de loja sem isolamento ligado E forçado devolve",
        "dado de outra loja para qualquer erro de filtro na aplicação.",
      ].join("\n"),
    );
    this.name = "ErroDeIsolamento";
    this.tabelas = tabelas;
  }
}

/** Falta um segredo que alguma migração exige, ou ele tem forma inaceitável. */
export class ErroDeSegredoDeMigracao extends Error {
  readonly variavel: string;

  constructor(variavel: string, motivo: string) {
    super(
      [
        `A migração exige a variável de ambiente ${variavel}, e ela ${motivo}.`,
        "",
        "Segredo vem do ambiente, nunca do código (P-002). Veja .env.example.",
      ].join("\n"),
    );
    this.name = "ErroDeSegredoDeMigracao";
    this.variavel = variavel;
  }
}

/**
 * Uma migração falhou ao ser aplicada.
 *
 * A mensagem carrega o nome do arquivo e o texto do banco, e NUNCA o SQL
 * enviado: depois da substituição, o SQL contém as senhas dos papéis.
 */
export class ErroAoAplicarMigracao extends Error {
  readonly migracao: string;

  constructor(migracao: string, causa: unknown) {
    const detalhe =
      causa instanceof Error ? causa.message : "erro sem descrição";
    super(`A migração ${migracao} falhou e foi desfeita inteira: ${detalhe}`);
    this.name = "ErroAoAplicarMigracao";
    this.migracao = migracao;
  }
}

// ---------------------------------------------------------------------------
// Leitura do disco
// ---------------------------------------------------------------------------

/** Impressão digital do conteúdo, com fim de linha normalizado — a mesma
 *  migração não pode divergir por causa do sistema de arquivos de quem clonou. */
function impressaoDigital(conteudo: string): string {
  return createHash("sha256")
    .update(conteudo.replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
}

/**
 * Lê as migrações do diretório, em ordem de número.
 *
 * Recusa nome fora do padrão e número repetido: dois arquivos com o mesmo
 * número tornam a ordem dependente do sistema de arquivos, que é o tipo de
 * diferença que só aparece na máquina de outra pessoa.
 */
export function lerMigracoes(
  diretorio: string = DIRETORIO_DE_MIGRACOES,
): Migracao[] {
  const arquivos = readdirSync(diretorio)
    .filter((nome) => nome.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  const numerosVistos = new Map<string, string>();
  const migracoes: Migracao[] = [];

  for (const nome of arquivos) {
    const casou = NOME_DE_MIGRACAO.exec(nome);
    if (!casou) {
      throw new Error(
        `Migração com nome fora do padrão: ${nome}. Esperado: 0000_nome_em_minusculas.sql`,
      );
    }

    const numero = casou[1] as string;
    const anterior = numerosVistos.get(numero);
    if (anterior !== undefined) {
      throw new Error(
        `Duas migrações com o número ${numero}: ${anterior} e ${nome}. A ordem ficaria indefinida.`,
      );
    }
    numerosVistos.set(numero, nome);

    const caminho = join(diretorio, nome);
    const sql = readFileSync(caminho, "utf8");
    migracoes.push({ nome, caminho, sql, sha256: impressaoDigital(sql) });
  }

  return migracoes;
}

/**
 * Troca os marcadores `@@VARIAVEL@@` pelo valor do ambiente, já como literal
 * SQL. Valor com caractere fora da lista aceita é recusado pelo nome, em vez de
 * virar injeção pela variável de ambiente.
 */
export function substituirSegredos(
  sql: string,
  fonte: Readonly<Record<string, string | undefined>>,
): string {
  return sql.replace(MARCADOR_DE_SEGREDO, (_todo, variavel: string) => {
    const valor = fonte[variavel]?.trim();

    if (valor === undefined || valor === "") {
      throw new ErroDeSegredoDeMigracao(variavel, "não está definida");
    }
    if (!VALOR_DE_SEGREDO_ACEITO.test(valor)) {
      throw new ErroDeSegredoDeMigracao(
        variavel,
        "tem caractere não aceito ou menos de 12 caracteres (aceitos: letras, números e _-.~+=)",
      );
    }
    return `'${valor}'`;
  });
}

// ---------------------------------------------------------------------------
// Livro de controle
// ---------------------------------------------------------------------------

const LIVRO = `${ESQUEMA_DE_CONTROLE}.${TABELA_DE_CONTROLE}`;

/**
 * Garante o livro de controle, criando-o só quando não existe.
 *
 * A checagem antes do `CREATE` não é preciosismo: depois da primeira aplicação
 * o dono do livro é o papel de migração, que não tem — e não deve ter —
 * permissão de criar esquema no banco.
 */
async function garantirLivroDeControle(cliente: ClienteSql): Promise<void> {
  const existe = await cliente.query(
    `SELECT to_regclass('${LIVRO}') IS NOT NULL AS existe`,
  );
  if (existe.rows[0]?.existe === true) return;

  await cliente.query(`CREATE SCHEMA IF NOT EXISTS ${ESQUEMA_DE_CONTROLE}`);
  await cliente.query(`
    CREATE TABLE IF NOT EXISTS ${LIVRO} (
      nome        text PRIMARY KEY,
      sha256      text        NOT NULL,
      aplicada_em timestamptz NOT NULL DEFAULT now(),
      duracao_ms  integer     NOT NULL
    )`);
}

/**
 * Passa o livro de controle para o papel de migração assim que ele existir.
 *
 * A primeira aplicação de um banco vazio é feita por outra credencial — a que
 * tem direito de criar papéis —, porque `sc_migrator` ainda não existe. Sem
 * este alinhamento o livro ficaria para sempre pertencendo a essa credencial de
 * arranque, e a credencial de migração não conseguiria registrar nada: o
 * caminho normal de publicação dependeria do caminho excepcional.
 *
 * Tolera falta de privilégio de propósito: quem conectou pode não ser o dono, e
 * nesse caso o dono correto já é outro papel.
 */
async function alinharDonoDoLivro(cliente: ClienteSql): Promise<void> {
  await cliente.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sc_migrator') THEN
        RETURN;
      END IF;
      IF (SELECT nspowner FROM pg_namespace WHERE nspname = '${ESQUEMA_DE_CONTROLE}')
         = 'sc_migrator'::regrole THEN
        RETURN;
      END IF;
      EXECUTE 'ALTER SCHEMA ${ESQUEMA_DE_CONTROLE} OWNER TO sc_migrator';
      EXECUTE 'ALTER TABLE ${LIVRO} OWNER TO sc_migrator';
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END $$`);
}

/** Compara o que está no disco com o que está registrado no banco. */
export async function consultarEstado(
  cliente: ClienteSql,
  migracoes: readonly Migracao[],
): Promise<EstadoDasMigracoes> {
  await garantirLivroDeControle(cliente);

  const registro = await cliente.query(
    `SELECT nome, sha256, aplicada_em FROM ${LIVRO} ORDER BY nome`,
  );

  const aplicadas: MigracaoAplicada[] = registro.rows.map((linha) => ({
    nome: String(linha.nome),
    sha256: String(linha.sha256),
    aplicadaEm: linha.aplicada_em as Date,
  }));

  const porNome = new Map(aplicadas.map((item) => [item.nome, item]));
  const noDisco = new Set(migracoes.map((item) => item.nome));

  const pendentes: string[] = [];
  const alteradas: string[] = [];

  for (const migracao of migracoes) {
    const registrada = porNome.get(migracao.nome);
    if (registrada === undefined) {
      pendentes.push(migracao.nome);
    } else if (registrada.sha256 !== migracao.sha256) {
      alteradas.push(migracao.nome);
    }
  }

  const ausentes = aplicadas
    .map((item) => item.nome)
    .filter((nome) => !noDisco.has(nome));

  return { aplicadas, pendentes, alteradas, ausentes };
}

// ---------------------------------------------------------------------------
// Verificação estrutural do isolamento (AC-008)
// ---------------------------------------------------------------------------

/**
 * Devolve as tabelas de loja que estão sem o isolamento por linha ligado E
 * forçado. Lista vazia é aprovação.
 *
 * "Tabela de loja" é a que tem coluna `store_id` — e também `stores`, cuja
 * coluna de inquilino é a própria chave primária. As duas condições existem
 * porque a segunda escapa de qualquer verificação que procure só pelo nome da
 * coluna, e `stores` é a raiz de tudo.
 *
 * `FORCE` sem `ENABLE` não protege, e `ENABLE` sem `FORCE` deixa o dono da
 * tabela passar por cima — por isso as duas são exigidas juntas.
 */
export async function tabelasSemIsolamento(
  cliente: ClienteSql,
): Promise<TabelaSemIsolamento[]> {
  const resultado = await cliente.query(`
    SELECT c.relname                AS tabela,
           c.relrowsecurity         AS ativado,
           c.relforcerowsecurity    AS forcado
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app'
       AND c.relkind = 'r'
       AND ( c.relname = 'stores'
          OR EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = c.oid
                        AND a.attname = 'store_id'
                        AND a.attnum > 0
                        AND NOT a.attisdropped) )
       AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
     ORDER BY c.relname`);

  return resultado.rows.map((linha) => ({
    tabela: String(linha.tabela),
    ativado: linha.ativado === true,
    forcado: linha.forcado === true,
  }));
}

/** Recusa o esquema quando alguma tabela de loja ficou sem isolamento. */
export async function exigirIsolamentoEmTodaTabelaDeLoja(
  cliente: ClienteSql,
): Promise<void> {
  const desprotegidas = await tabelasSemIsolamento(cliente);
  if (desprotegidas.length > 0) throw new ErroDeIsolamento(desprotegidas);
}

// ---------------------------------------------------------------------------
// Detecção de pendência (AC-034)
// ---------------------------------------------------------------------------

/**
 * Recusa seguir quando o banco está atrás do código, nomeando cada migração que
 * falta. É o que evita a falha aparecer no meio de uma requisição, como coluna
 * inexistente, depois de o serviço já ter se declarado saudável.
 */
export async function exigirMigracoesEmDia(
  cliente: ClienteSql,
  diretorio: string = DIRETORIO_DE_MIGRACOES,
): Promise<void> {
  const estado = await consultarEstado(cliente, lerMigracoes(diretorio));

  if (estado.alteradas.length > 0 || estado.ausentes.length > 0) {
    throw new ErroDeMigracaoDivergente(estado.alteradas, estado.ausentes);
  }
  if (estado.pendentes.length > 0) {
    throw new ErroDeMigracaoPendente(estado.pendentes);
  }
}

// ---------------------------------------------------------------------------
// Aplicação
// ---------------------------------------------------------------------------

/** Opções de uma execução do aplicador. */
export interface OpcoesDeAplicacao {
  readonly cliente: ClienteSql;
  readonly diretorio?: string;
  /** De onde saem os valores dos marcadores `@@VARIAVEL@@`. */
  readonly segredos?: Readonly<Record<string, string | undefined>>;
  /** Para onde vai o relato do que aconteceu. Silencioso por padrão. */
  readonly relatar?: (linha: string) => void;
}

/**
 * Aplica, em ordem, todas as migrações ainda não registradas.
 *
 * Cada migração roda dentro da própria transação, junto com a linha do livro de
 * controle: não existe estado em que o esquema mudou e o registro não, nem o
 * contrário. Rodar de novo sem migração nova não altera nada e termina com
 * sucesso (AC-033).
 */
export async function aplicarMigracoes(
  opcoes: OpcoesDeAplicacao,
): Promise<RelatorioDeAplicacao> {
  const {
    cliente,
    diretorio = DIRETORIO_DE_MIGRACOES,
    segredos = process.env,
    relatar = () => {},
  } = opcoes;

  const comeco = Date.now();
  const migracoes = lerMigracoes(diretorio);

  // Duas publicações simultâneas esperam uma pela outra em vez de aplicarem a
  // mesma migração duas vezes.
  await cliente.query("SELECT pg_advisory_lock($1)", [CHAVE_DA_TRAVA]);

  try {
    const estado = await consultarEstado(cliente, migracoes);

    if (estado.alteradas.length > 0 || estado.ausentes.length > 0) {
      throw new ErroDeMigracaoDivergente(estado.alteradas, estado.ausentes);
    }

    const pendentes = migracoes.filter((migracao) =>
      estado.pendentes.includes(migracao.nome),
    );

    if (pendentes.length === 0) {
      relatar("nenhuma migração pendente");
    }

    const aplicadas: string[] = [];
    for (const migracao of pendentes) {
      const sql = substituirSegredos(migracao.sql, segredos);
      const inicio = Date.now();

      await cliente.query("BEGIN");
      try {
        await cliente.query(sql);
        // A migração troca o papel da sessão para que os objetos nasçam
        // pertencendo a quem migra. O registro no livro é escrituração do
        // aplicador, não da migração, e roda com o papel de quem conectou.
        await cliente.query("RESET ROLE");
        await cliente.query(
          `INSERT INTO ${LIVRO} (nome, sha256, duracao_ms) VALUES ($1, $2, $3)`,
          [migracao.nome, migracao.sha256, Date.now() - inicio],
        );
        await cliente.query("COMMIT");
      } catch (causa) {
        await cliente.query("ROLLBACK");
        throw new ErroAoAplicarMigracao(migracao.nome, causa);
      }

      aplicadas.push(migracao.nome);
      relatar(`aplicada ${migracao.nome} (${Date.now() - inicio} ms)`);
    }

    await alinharDonoDoLivro(cliente);

    // O aplicador é o último ponto em que um esquecimento ainda é barato.
    await exigirIsolamentoEmTodaTabelaDeLoja(cliente);

    return {
      aplicadas,
      jaAplicadas: estado.aplicadas.length,
      duracaoMs: Date.now() - comeco,
    };
  } finally {
    await cliente.query("SELECT pg_advisory_unlock($1)", [CHAVE_DA_TRAVA]);
  }
}

// ---------------------------------------------------------------------------
// Derivação de credencial
// ---------------------------------------------------------------------------

/**
 * Devolve a mesma cadeia de conexão apontando para outro papel de banco.
 *
 * Existe porque as três credenciais falam com o mesmo banco e diferem só em
 * quem se autentica — e é justamente essa diferença que sustenta o isolamento:
 * a conexão de execução não tem como virar a de migração trocando um parâmetro
 * de sessão.
 */
export function derivarUrlDePapel(
  url: string,
  usuario: string,
  senha: string,
): string {
  const destino = new URL(url);
  destino.username = usuario;
  destino.password = senha;
  return destino.toString();
}

// ---------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------

/**
 * `aplicar` sobe o banco ao estado do repositório; `verificar` só confere e
 * recusa quando falta migração, nomeando-a. O segundo é o que roda antes de a
 * API subir e no portão de qualidade (AC-034).
 */
async function principal(argumentos: readonly string[]): Promise<number> {
  const comando = argumentos[0] ?? "verificar";
  const url = process.env.DATABASE_URL_DIRETA;

  if (url === undefined || url.trim() === "") {
    process.stderr.write(
      "DATABASE_URL_DIRETA não está definida — é a conexão direta, com a credencial de migração.\n",
    );
    return 2;
  }

  const { default: pg } = await import("pg");
  // Cliente único, e não agrupador: migração não sobrevive a agrupador em modo
  // transação, que descarta o estado da sessão entre comandos.
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();

  try {
    if (comando === "aplicar") {
      const relatorio = await aplicarMigracoes({
        cliente,
        relatar: (linha) => process.stdout.write(`  ${linha}\n`),
      });
      process.stdout.write(
        `✔ ${relatorio.aplicadas.length} migração(ões) aplicada(s) em ${relatorio.duracaoMs} ms\n`,
      );
      return 0;
    }

    if (comando === "verificar") {
      await exigirMigracoesEmDia(cliente);
      await exigirIsolamentoEmTodaTabelaDeLoja(cliente);
      process.stdout.write("✔ banco em dia com as migrações do repositório\n");
      return 0;
    }

    process.stderr.write(`comando desconhecido: ${comando}\n`);
    process.stderr.write("uso: migrate.ts [aplicar|verificar]\n");
    return 2;
  } catch (erro) {
    process.stderr.write(
      `${erro instanceof Error ? erro.message : String(erro)}\n`,
    );
    return 1;
  } finally {
    await cliente.end();
  }
}

// Só roda como programa quando é o arquivo chamado — importar este módulo num
// teste não pode disparar migração nenhuma.
const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal(process.argv.slice(2));
}
