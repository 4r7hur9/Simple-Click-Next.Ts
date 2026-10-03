/**
 * Executor das guardas estruturais do banco (AC-008, AC-035).
 *
 * Uma guarda é um arquivo SQL de `guards/` que consulta o catálogo do
 * PostgreSQL e devolve **uma linha por problema encontrado**. Consulta que não
 * devolve nada é aprovação; qualquer linha reprova. O formato é assim de
 * propósito:
 *
 * - **A verdade é o banco, não o repositório.** Ler as migrações e conferir o
 *   texto delas provaria que alguém escreveu a política, não que ela existe.
 *   Migração aplicada fora de ordem, objeto criado à mão numa madrugada de
 *   incidente e coluna acrescentada por outro caminho aparecem aqui e não
 *   apareceriam numa leitura de arquivo.
 * - **Guarda é SQL puro.** Quem escreve migração já escreve SQL; obrigar a
 *   aprender uma segunda linguagem para descrever uma regra estrutural faria a
 *   regra nova não ser escrita.
 * - **Toda guarda devolve `objeto` e `problema`.** É o que permite a mensagem
 *   de recusa dizer QUAL guarda falhou e QUAL objeto do banco está errado, em
 *   vez de um "reprovou" que manda a pessoa caçar sozinha.
 *
 * As guardas rodam com a credencial de migração: ela enxerga o catálogo
 * inteiro. Nenhuma delas lê dado de loja — só estrutura —, então rodá-las não
 * expõe nada de ninguém.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client as ClientePg } from "pg";

import {
  aplicarMigracoes,
  type ClienteSql,
  type LinhaDeConsulta,
} from "./migrate.ts";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Uma guarda lida do disco. */
export interface Guarda {
  /** Identificador curto, tirado do nome do arquivo: `g4`. */
  readonly codigo: string;
  /** Nome do arquivo, que é como a pessoa o encontra no repositório. */
  readonly arquivo: string;
  /** Uma frase dizendo o que a guarda recusa, tirada do cabeçalho do arquivo. */
  readonly titulo: string;
  readonly caminho: string;
  readonly sql: string;
}

/** Um problema que uma guarda apontou. */
export interface AchadoDeGuarda {
  readonly guarda: Guarda;
  /** O objeto do banco que está errado: `app.products / products_staff_select`. */
  readonly objeto: string;
  /** O que há de errado com ele, e por que isso importa. */
  readonly problema: string;
}

/** O que uma execução completa produziu. */
export interface RelatorioDeGuardas {
  readonly guardasExecutadas: readonly Guarda[];
  readonly achados: readonly AchadoDeGuarda[];
  readonly duracaoMs: number;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Onde moram as guardas, resolvido a partir deste arquivo. */
export const DIRETORIO_DE_GUARDAS = fileURLToPath(
  new URL("../guards/", import.meta.url),
);

/** Nome de arquivo aceito: `g` + número + sublinhado + nome em minúsculas. */
const NOME_DE_GUARDA = /^(g\d+)_[a-z0-9_]+\.sql$/;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/**
 * A estrutura do banco saiu do padrão.
 *
 * A mensagem lista guarda por guarda e objeto por objeto, porque uma recusa
 * que só diz "reprovou" empurra para quem recebeu o trabalho de descobrir o
 * que reprovou — e é aí que o portão começa a ser contornado.
 */
export class ErroDeGuardaEstrutural extends Error {
  readonly achados: readonly AchadoDeGuarda[];

  constructor(achados: readonly AchadoDeGuarda[]) {
    const porGuarda = new Map<string, AchadoDeGuarda[]>();
    for (const achado of achados) {
      const lista = porGuarda.get(achado.guarda.arquivo) ?? [];
      lista.push(achado);
      porGuarda.set(achado.guarda.arquivo, lista);
    }

    const linhas: string[] = [
      `Estrutura do banco fora do padrão: ${achados.length} problema(s) em ${porGuarda.size} guarda(s).`,
      "",
    ];
    for (const [arquivo, lista] of porGuarda) {
      const guarda = lista[0]?.guarda;
      linhas.push(`✘ ${arquivo} — ${guarda?.titulo ?? ""}`);
      for (const achado of lista) {
        linhas.push(`    ${achado.objeto}`);
        linhas.push(`      ${achado.problema}`);
      }
      linhas.push("");
    }
    linhas.push(
      "Cada guarda é um arquivo SQL em packages/database/guards: rode-a sozinha para ver as linhas.",
    );

    super(linhas.join("\n"));
    this.name = "ErroDeGuardaEstrutural";
    this.achados = achados;
  }
}

/** O banco alvo não tem a estrutura aplicada, e as guardas passariam à toa. */
export class ErroDeBancoSemEstrutura extends Error {
  constructor(alvo: string) {
    super(
      [
        `O banco ${alvo} não tem nenhuma tabela no esquema \`app\`.`,
        "",
        "Rodar as guardas assim é pior do que não rodar: todas passam por vacuidade,",
        "e o portão fica verde sem ter olhado para nada.",
        "",
        "Aplique as migrações antes: node packages/database/src/migrate.ts aplicar",
      ].join("\n"),
    );
    this.name = "ErroDeBancoSemEstrutura";
  }
}

// ---------------------------------------------------------------------------
// Leitura do disco
// ---------------------------------------------------------------------------

/**
 * Extrai do cabeçalho a frase que diz o que a guarda recusa.
 *
 * O cabeçalho já existe para quem lê o arquivo; aproveitá-lo evita uma segunda
 * fonte de verdade — um título repetido em código envelheceria em silêncio
 * quando a guarda mudasse de propósito.
 */
export function tituloDaGuarda(sql: string): string {
  const partes: string[] = [];

  for (const linha of sql.split("\n")) {
    const texto = linha.trimStart();
    if (!texto.startsWith("--")) break;

    const conteudo = texto.replace(/^--\s?/, "").trim();
    if (conteudo.startsWith("===")) continue;
    // Linha de comentário vazia fecha o parágrafo do título.
    if (conteudo === "") {
      if (partes.length > 0) break;
      continue;
    }
    partes.push(conteudo);
  }

  return partes.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Lê as guardas do diretório, em ordem de número.
 *
 * Recusa nome fora do padrão: uma guarda com nome estranho é uma guarda que
 * alguém vai deixar de encontrar quando ela reprovar.
 */
export function lerGuardas(diretorio: string = DIRETORIO_DE_GUARDAS): Guarda[] {
  const arquivos = readdirSync(diretorio)
    .filter((nome) => nome.endsWith(".sql"))
    // Numérica: sem isso a décima guarda cairia entre a primeira e a segunda,
    // e a lista que a prova confere deixaria de ser a ordem em que se lê.
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  return arquivos.map((arquivo) => {
    const casou = NOME_DE_GUARDA.exec(arquivo);
    if (!casou) {
      throw new Error(
        `Guarda com nome fora do padrão: ${arquivo}. Esperado: g0_nome_em_minusculas.sql`,
      );
    }
    const caminho = join(diretorio, arquivo);
    const sql = readFileSync(caminho, "utf8");
    return {
      codigo: casou[1] as string,
      arquivo,
      titulo: tituloDaGuarda(sql),
      caminho,
      sql,
    };
  });
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

/** Traduz uma linha devolvida pela guarda para o achado que será relatado. */
function comoAchado(guarda: Guarda, linha: LinhaDeConsulta): AchadoDeGuarda {
  const objeto = linha.objeto;
  const problema = linha.problema;

  if (typeof objeto !== "string" || typeof problema !== "string") {
    throw new Error(
      `A guarda ${guarda.arquivo} devolveu linha sem as colunas \`objeto\` e \`problema\`. ` +
        "Sem elas a recusa não diz qual objeto do banco está errado, que é a única coisa útil de uma guarda.",
    );
  }

  return { guarda, objeto, problema };
}

/** Roda uma guarda e devolve os problemas que ela apontou. */
export async function executarGuarda(
  cliente: ClienteSql,
  guarda: Guarda,
): Promise<AchadoDeGuarda[]> {
  const resultado = await cliente.query(guarda.sql);
  return resultado.rows.map((linha) => comoAchado(guarda, linha));
}

/** Roda todas as guardas, sempre até o fim: quem corrige quer a lista inteira. */
export async function executarGuardas(
  cliente: ClienteSql,
  guardas: readonly Guarda[] = lerGuardas(),
): Promise<RelatorioDeGuardas> {
  const comeco = Date.now();
  const achados: AchadoDeGuarda[] = [];

  for (const guarda of guardas) {
    achados.push(...(await executarGuarda(cliente, guarda)));
  }

  return {
    guardasExecutadas: guardas,
    achados,
    duracaoMs: Date.now() - comeco,
  };
}

/** Quantas tabelas existem no esquema protegido. Zero significa banco vazio. */
export async function quantasTabelasNoEsquemaApp(
  cliente: ClienteSql,
): Promise<number> {
  const resultado = await cliente.query(`
    SELECT count(*)::int AS total
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app' AND c.relkind = 'r'`);
  return Number(
    (resultado.rows[0] as { total: number } | undefined)?.total ?? 0,
  );
}

/**
 * Recusa o banco cuja estrutura saiu do padrão.
 *
 * Recusa antes disso o banco sem estrutura nenhuma: guarda que não olhou nada
 * passa, e um portão que passa por vacuidade é pior do que portão nenhum,
 * porque dá a sensação de estar coberto.
 */
export async function exigirEstruturaIntegra(
  cliente: ClienteSql,
  opcoes: { readonly alvo?: string; readonly guardas?: readonly Guarda[] } = {},
): Promise<RelatorioDeGuardas> {
  if ((await quantasTabelasNoEsquemaApp(cliente)) === 0) {
    throw new ErroDeBancoSemEstrutura(opcoes.alvo ?? "alvo");
  }

  const relatorio = await executarGuardas(
    cliente,
    opcoes.guardas ?? lerGuardas(),
  );
  if (relatorio.achados.length > 0) {
    throw new ErroDeGuardaEstrutural(relatorio.achados);
  }
  return relatorio;
}

// ---------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------

/**
 * Sem argumento, as guardas rodam contra um banco de prova efêmero: criado de
 * molde vazio, migrado, verificado e apagado.
 *
 * É a única forma de a verificação falar sobre o REPOSITÓRIO. Rodar contra o
 * banco de desenvolvimento de quem chamou diria apenas o que a máquina daquela
 * pessoa tem hoje — inclusive um banco vazio, que passaria em tudo.
 *
 * Com `--url`, roda contra um banco que já existe. É o modo de antes de
 * publicar: a estrutura que vai receber a versão nova é a que precisa estar
 * dentro do padrão.
 */
async function principal(argumentos: readonly string[]): Promise<number> {
  const indiceDaUrl = argumentos.indexOf("--url");
  const urlPedida =
    indiceDaUrl >= 0 ? argumentos[indiceDaUrl + 1] : process.env.GUARDAS_URL;

  const { default: pg } = await import("pg");
  const guardas = lerGuardas();

  process.stdout.write(
    `Guardas estruturais do banco: ${guardas.length} a executar\n`,
  );

  if (urlPedida !== undefined && urlPedida.trim() !== "") {
    return await contraBancoExistente(pg, urlPedida.trim(), guardas);
  }
  return await contraBancoEfemero(pg, guardas);
}

/**
 * Formato de `pg` que a linha de comando usa.
 *
 * Derivado do próprio driver em vez de reescrito à mão: a versão escrita à mão
 * descrevia um `Client` mais estreito que o real e não compilava contra ele —
 * e o desencontro passou despercebido porque a verificação de tipos ainda não
 * estava no portão. Com `Pick`, o dia em que o driver mudar a assinatura, a
 * verificação acusa aqui.
 */
type ModuloPg = { readonly Client: typeof ClientePg };

function relatar(relatorio: RelatorioDeGuardas): void {
  for (const guarda of relatorio.guardasExecutadas) {
    const quantos = relatorio.achados.filter(
      (achado) => achado.guarda.arquivo === guarda.arquivo,
    ).length;
    const marca = quantos === 0 ? "✔" : "✘";
    process.stdout.write(`  ${marca} ${guarda.arquivo}\n`);
  }
}

async function contraBancoExistente(
  pg: ModuloPg,
  url: string,
  guardas: readonly Guarda[],
): Promise<number> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const relatorio = await exigirEstruturaIntegra(cliente, {
      alvo: "indicado em --url",
      guardas,
    });
    relatar(relatorio);
    process.stdout.write(
      `✔ estrutura dentro do padrão (${relatorio.duracaoMs} ms)\n`,
    );
    return 0;
  } catch (erro) {
    return relatarRecusa(erro);
  } finally {
    await cliente.end();
  }
}

/**
 * Cria o banco de prova a partir de molde vazio, migra, roda as guardas e o
 * apaga — inclusive quando alguma guarda reprova, senão cada reprovação
 * deixaria um banco órfão no servidor.
 */
async function contraBancoEfemero(
  pg: ModuloPg,
  guardas: readonly Guarda[],
): Promise<number> {
  const urlAdministrativa = process.env.DATABASE_URL_TEST;
  if (urlAdministrativa === undefined || urlAdministrativa.trim() === "") {
    process.stderr.write(
      [
        "DATABASE_URL_TEST não está definida, e é dela que sai o banco de prova das guardas.",
        "Suba o ambiente com: bash infra/scripts/up.sh core test",
        "Ou aponte um banco já migrado: bash infra/scripts/db-guards.sh --url <cadeia>",
        "",
      ].join("\n"),
    );
    return 2;
  }

  const nome = `sc_guardas_${Math.random().toString(36).slice(2, 10)}`;
  const administrativo = new pg.Client({ connectionString: urlAdministrativa });
  await administrativo.connect();

  const urlDoBanco = new URL(urlAdministrativa);
  urlDoBanco.pathname = `/${nome}`;

  try {
    await administrativo.query(`CREATE DATABASE ${nome} TEMPLATE template0`);
    const cliente = new pg.Client({ connectionString: urlDoBanco.toString() });
    await cliente.connect();
    try {
      await aplicarMigracoes({ cliente });
      const relatorio = await exigirEstruturaIntegra(cliente, {
        alvo: "de prova",
        guardas,
      });
      relatar(relatorio);
      process.stdout.write(
        `✔ estrutura dentro do padrão (${relatorio.duracaoMs} ms, banco de prova descartado)\n`,
      );
      return 0;
    } catch (erro) {
      return relatarRecusa(erro);
    } finally {
      await cliente.end();
    }
  } finally {
    await administrativo.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
    await administrativo.end();
  }
}

/**
 * Banco sem estrutura sai com 2, e não com 1: é ambiente incompleto, não
 * estrutura errada. Quem chama a verificação num laço precisa distinguir "o
 * esquema saiu do padrão" de "não havia esquema para olhar".
 */
function relatarRecusa(erro: unknown): number {
  process.stderr.write(
    `${erro instanceof Error ? erro.message : String(erro)}\n`,
  );
  return erro instanceof ErroDeBancoSemEstrutura ? 2 : 1;
}

// Importar este módulo num teste não pode disparar execução nenhuma.
const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal(process.argv.slice(2));
}
