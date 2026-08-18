/**
 * Carga de dados de exemplo (AC-004, AC-036, AC-037, AC-039).
 *
 * Serve para que qualquer pessoa consiga navegar o sistema inteiro sem
 * cadastrar nada à mão, e para que teste de tela e captura de imagem tenham um
 * cenário estável de onde partir.
 *
 * Três decisões governam este arquivo.
 *
 * **1. Quem planta é a credencial de ADMINISTRAÇÃO, não a de migração.**
 * Criar loja, definir o ramo e cadastrar o endereço são atos de administração
 * da plataforma — as decisões de 17/08 dizem isso, e o esquema já as
 * implementa: `sc_app` teve `INSERT` em `stores` revogado, e quem tem política
 * para o resto é `sc_admin`. Usar `sc_migrator` seria mais fácil e é
 * justamente por isso que não se usa: ele tem `BYPASSRLS`, e com ele TODA
 * política de isolamento vira decoração — a carga passaria mesmo que os dados
 * fossem inalcançáveis pelo caminho real da aplicação, e ninguém descobriria.
 * Com `sc_admin`, cada inserção continua atravessando uma política escrita.
 *
 * **2. O caminho único de acesso da API não é importado aqui, e não podia ser.**
 * A tabela de fronteiras proíbe `packages/database` de importar `apps/*`, e a
 * proibição é verificada pelo ESLint (AC-005). O que se faz no lugar é melhor
 * do que uma exceção na regra: terminada a plantação, a carga abre uma conexão
 * com a credencial da APLICAÇÃO (`sc_app`), define os mesmos quatro parâmetros
 * de sessão que `apps/api/src/core/db.ts` define, e confere que a vitrine
 * enxerga o catálogo plantado — e só o da loja corrente. Cenário que o banco
 * aceitou mas a aplicação não enxerga não é cenário navegável, e sem esta
 * conferência isso passaria em silêncio.
 *
 * **3. Só roda em banco vazio, e nunca em produção.** As duas recusas estão em
 * `exigirAmbienteQueNaoEProducao` e `exigirBancoSemDadoProprio`, e a segunda
 * existe porque a primeira depende de um rótulo: `NODE_ENV` pode estar errado.
 * Um banco que já tem loja que não é do exemplo é um banco de gente, tenha o
 * rótulo que tiver.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type ClienteSql,
  derivarUrlDePapel,
  type LinhaDeConsulta,
} from "../src/migrate.ts";
import { montarCatalogo, PRODUTOS } from "./catalogo.ts";
import {
  type ConjuntoDeExemplo,
  DATA_DE_REFERENCIA_PADRAO,
  type LinhaDeExemplo,
  montarInsercao,
} from "./deterministico.ts";
import { LOJAS, montarAuditoria, montarLojas } from "./lojas.ts";
import { montarPedidos } from "./pedidos.ts";

// ---------------------------------------------------------------------------
// O cenário
// ---------------------------------------------------------------------------

/**
 * O cenário inteiro, na ordem de inserção.
 *
 * A ordem não é cosmética: ela respeita as chaves estrangeiras (identidade
 * antes de loja, loja antes de catálogo, catálogo antes de pedido) e é o que
 * torna previsível a chave sequencial da trilha de auditoria.
 */
export function montarCenario(
  referencia: Date = DATA_DE_REFERENCIA_PADRAO,
): readonly ConjuntoDeExemplo[] {
  return [
    ...montarLojas(referencia),
    ...montarCatalogo(referencia),
    ...montarPedidos(referencia),
    ...montarAuditoria(referencia),
  ];
}

/** As tabelas que o cenário planta, na ordem em que são plantadas. */
export function tabelasDoCenario(): readonly string[] {
  return montarCenario().map((conjunto) => conjunto.tabela);
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** O ambiente indica produção, e dado fictício não alcança loja real. */
export class ErroDeAmbienteDeProducao extends Error {
  readonly motivo: string;

  constructor(motivo: string) {
    super(
      [
        `A carga de dados de exemplo se recusa a rodar: ${motivo}.`,
        "",
        "Estes dados são fictícios — lojas, clientes e pedidos inventados. Em",
        "produção eles apareceriam na vitrine de uma loja real, misturados ao",
        "catálogo de verdade, e não há como desfazer isso sem perder o que era",
        "legítimo.",
        "",
        "Para carregar o exemplo, aponte para o banco de desenvolvimento ou de",
        "teste e rode de novo.",
      ].join("\n"),
    );
    this.name = "ErroDeAmbienteDeProducao";
    this.motivo = motivo;
  }
}

/** O banco já tem dado que não é do exemplo — ou já tem o exemplo. */
export class ErroDeBancoNaoVazio extends Error {
  readonly achados: readonly string[];

  constructor(achados: readonly string[], jaTemOExemplo: boolean) {
    super(
      [
        jaTemOExemplo
          ? "Este banco já tem os dados de exemplo carregados."
          : "A carga de dados de exemplo se recusa a rodar: o banco já tem dados.",
        ...achados.map((achado) => `  • ${achado}`),
        "",
        jaTemOExemplo
          ? "Recarregar não é possível no mesmo banco: a trilha de auditoria é"
          : "Este banco pode ser de gente. A carga só planta em banco vazio, e a",
        jaTemOExemplo
          ? "imutável por desenho — nem a credencial de migração a apaga. Recrie o"
          : "trilha de auditoria é imutável por desenho, então nem apagar o que",
        jaTemOExemplo
          ? "banco e aplique as migrações antes de carregar de novo."
          : "existe devolveria o banco ao estado inicial. Recrie o banco vazio.",
      ].join("\n"),
    );
    this.name = "ErroDeBancoNaoVazio";
    this.achados = achados;
  }
}

/** O esquema não tem as colunas que o cenário descreve para uma tabela. */
export class ErroDeColunaDesconhecida extends Error {
  readonly tabela: string;
  readonly colunas: readonly string[];

  constructor(tabela: string, colunas: readonly string[]) {
    super(
      [
        `O cenário de exemplo descreve colunas que app.${tabela} não tem: ${colunas.join(", ")}.`,
        "",
        "Isso acontece quando a migração que criou a tabela divergiu do desenho",
        "em .spec/design/modelo-de-dados.md. Acerte o cenário em",
        "packages/database/seed/ para a forma que a tabela realmente tem — ou a",
        "migração, se quem divergiu foi ela.",
      ].join("\n"),
    );
    this.name = "ErroDeColunaDesconhecida";
    this.tabela = tabela;
    this.colunas = colunas;
  }
}

/** Uma linha do cenário não entrou. A carga inteira foi desfeita. */
export class ErroAoPlantar extends Error {
  readonly tabela: string;

  constructor(tabela: string, linha: number, causa: unknown) {
    const detalhe =
      causa instanceof Error ? causa.message : "erro sem descrição";
    super(
      `A linha ${linha + 1} de app.${tabela} não entrou e a carga inteira foi desfeita: ${detalhe}`,
    );
    this.name = "ErroAoPlantar";
    this.tabela = tabela;
  }
}

/** O que foi plantado não é o que a aplicação enxerga. */
export class ErroDeVitrineDeExemplo extends Error {
  readonly divergencias: readonly string[];

  constructor(divergencias: readonly string[]) {
    super(
      [
        "Os dados de exemplo entraram, mas a vitrine não os enxerga como deveria:",
        ...divergencias.map((linha) => `  ✘ ${linha}`),
        "",
        "O cenário existe para ser navegado. Dado que o banco aceitou e a",
        "aplicação não vê é pior que dado nenhum: parece pronto e não é.",
      ].join("\n"),
    );
    this.name = "ErroDeVitrineDeExemplo";
    this.divergencias = divergencias;
  }
}

// ---------------------------------------------------------------------------
// Recusa em produção (AC-039)
// ---------------------------------------------------------------------------

/** De onde a carga lê a configuração — normalmente `process.env`. */
export type FonteDeAmbiente = Readonly<Record<string, string | undefined>>;

/**
 * Recusa rodar quando o ambiente diz produção.
 *
 * A checagem é pelo rótulo declarado, que é o que o operador controla. Ela não
 * é a única defesa: `exigirBancoSemDadoProprio` cobre o caso em que o rótulo
 * está errado — que é o caso perigoso de verdade, porque ninguém digita
 * `NODE_ENV=production` por engano, mas todo mundo já esqueceu de defini-lo.
 */
export function exigirAmbienteQueNaoEProducao(ambiente: FonteDeAmbiente): void {
  const rotulo = ambiente.NODE_ENV?.trim().toLowerCase();
  if (rotulo === "production") {
    throw new ErroDeAmbienteDeProducao(
      "NODE_ENV=production indica ambiente de produção",
    );
  }
}

// ---------------------------------------------------------------------------
// Recusa em banco que já tem dados
// ---------------------------------------------------------------------------

/** O que a carga encontrou no banco antes de plantar. */
export interface EstadoDoBanco {
  readonly lojas: readonly string[];
  readonly lojasDeExemplo: number;
  readonly lojasDeFora: number;
  readonly identidades: number;
  readonly registrosDeAuditoria: number;
}

async function contar(cliente: ClienteSql, tabela: string): Promise<number> {
  const resultado = await cliente.query(
    `SELECT count(*)::int AS total FROM app.${tabela}`,
  );
  return Number(resultado.rows[0]?.total ?? 0);
}

/** Lê o estado do banco: o que já existe e de onde veio. */
export async function lerEstadoDoBanco(
  cliente: ClienteSql,
): Promise<EstadoDoBanco> {
  const idsDoExemplo = new Set(LOJAS.map((loja) => loja.id));
  const encontradas = await cliente.query("SELECT id FROM app.stores");
  const lojas = encontradas.rows.map((linha) => String(linha.id));

  return {
    lojas,
    lojasDeExemplo: lojas.filter((id) => idsDoExemplo.has(id)).length,
    lojasDeFora: lojas.filter((id) => !idsDoExemplo.has(id)).length,
    identidades: await contar(cliente, "identities"),
    registrosDeAuditoria: await contar(cliente, "audit_log"),
  };
}

/**
 * Recusa plantar em banco que já tem dados, seja de gente ou do próprio
 * exemplo.
 *
 * Não existe "recarregar": `audit_log` não aceita alteração nem remoção, nem
 * pela credencial de migração — um gatilho levanta exceção. Fingir que
 * recarrega seria plantar por cima e produzir um banco que não é igual a
 * nenhuma outra carga, o que quebraria justamente a promessa de determinismo.
 */
export async function exigirBancoSemDadoProprio(
  cliente: ClienteSql,
): Promise<void> {
  const estado = await lerEstadoDoBanco(cliente);
  const achados: string[] = [];

  if (estado.lojasDeFora > 0) {
    achados.push(`${estado.lojasDeFora} loja(s) que não são do exemplo`);
  }
  if (estado.lojasDeExemplo > 0) {
    achados.push(`${estado.lojasDeExemplo} loja(s) do próprio exemplo`);
  }
  if (estado.lojas.length === 0 && estado.identidades > 0) {
    achados.push(`${estado.identidades} identidade(s)`);
  }
  if (estado.registrosDeAuditoria > 0) {
    achados.push(`${estado.registrosDeAuditoria} registro(s) de auditoria`);
  }

  if (achados.length > 0) {
    throw new ErroDeBancoNaoVazio(
      achados,
      estado.lojasDeFora === 0 && estado.lojasDeExemplo > 0,
    );
  }
}

// ---------------------------------------------------------------------------
// Estrutura disponível
// ---------------------------------------------------------------------------

/** Colunas que a tabela tem, ou `null` quando a tabela ainda não existe. */
async function colunasDaTabela(
  cliente: ClienteSql,
  tabela: string,
): Promise<Set<string> | null> {
  const resultado = await cliente.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = $1`,
    [tabela],
  );
  if (resultado.rows.length === 0) return null;
  return new Set(resultado.rows.map((linha) => String(linha.column_name)));
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

/** Uma tabela plantada, com quantas linhas entraram. */
export interface TabelaPlantada {
  readonly tabela: string;
  readonly linhas: number;
}

/** Uma tabela do cenário que ainda não existe no esquema. */
export interface TabelaAdiada {
  readonly tabela: string;
  readonly linhas: number;
  readonly motivo: string;
}

/** O que uma execução da carga fez. */
export interface RelatorioDaCarga {
  readonly referencia: Date;
  readonly plantadas: readonly TabelaPlantada[];
  readonly adiadas: readonly TabelaAdiada[];
  readonly duracaoMs: number;
}

// ---------------------------------------------------------------------------
// A carga
// ---------------------------------------------------------------------------

/** Ajustes de uma execução da carga. */
export interface OpcoesDaCarga {
  /** Conexão com a credencial de ADMINISTRAÇÃO (`sc_admin`). */
  readonly cliente: ClienteSql;
  /** A data de onde saem todas as datas do cenário. Nunca "agora". */
  readonly referencia?: Date;
  /** De onde sai o rótulo de ambiente. Padrão: o ambiente do processo. */
  readonly ambiente?: FonteDeAmbiente;
  /** Para onde vai o relato do que aconteceu. Silencioso por padrão. */
  readonly relatar?: (linha: string) => void;
}

/**
 * Planta o cenário de exemplo.
 *
 * Tudo acontece numa transação só: ou o cenário inteiro entrou, ou nada dele
 * entrou. Um cenário pela metade seria pior que nenhum — pareceria carregado e
 * mentiria sobre o que existe.
 *
 * Tabela do cenário que ainda não existe no esquema é ADIADA, não silenciada:
 * ela aparece nomeada no relatório, com quantas linhas ficaram esperando. É
 * assim que a carga acompanha o esquema crescendo sem precisar ser reescrita —
 * no dia em que a migração da tabela entrar, as linhas passam a ser plantadas
 * sozinhas, e a conferência de colunas avisa se a forma divergiu do desenho.
 */
export async function carregarDadosDeExemplo(
  opcoes: OpcoesDaCarga,
): Promise<RelatorioDaCarga> {
  const {
    cliente,
    referencia = DATA_DE_REFERENCIA_PADRAO,
    ambiente = process.env,
    relatar = () => {},
  } = opcoes;

  const comeco = Date.now();

  exigirAmbienteQueNaoEProducao(ambiente);
  await exigirBancoSemDadoProprio(cliente);

  const cenario = montarCenario(referencia);
  const plantadas: TabelaPlantada[] = [];
  const adiadas: TabelaAdiada[] = [];

  await cliente.query("BEGIN");
  try {
    for (const conjunto of cenario) {
      const colunas = await colunasDaTabela(cliente, conjunto.tabela);

      if (colunas === null) {
        adiadas.push({
          tabela: conjunto.tabela,
          linhas: conjunto.linhas.length,
          motivo: "a tabela ainda não existe no esquema",
        });
        relatar(
          `adiada app.${conjunto.tabela} (${conjunto.linhas.length} linha(s)): tabela ainda não existe`,
        );
        continue;
      }

      await plantarConjunto(cliente, conjunto, colunas);
      plantadas.push({
        tabela: conjunto.tabela,
        linhas: conjunto.linhas.length,
      });
      relatar(
        `plantada app.${conjunto.tabela} (${conjunto.linhas.length} linha(s))`,
      );
    }
    await cliente.query("COMMIT");
  } catch (causa) {
    await cliente.query("ROLLBACK");
    throw causa;
  }

  return { referencia, plantadas, adiadas, duracaoMs: Date.now() - comeco };
}

/** Planta as linhas de uma tabela, conferindo antes que as colunas existem. */
async function plantarConjunto(
  cliente: ClienteSql,
  conjunto: ConjuntoDeExemplo,
  colunas: ReadonlySet<string>,
): Promise<void> {
  const primeira = conjunto.linhas[0];
  if (primeira !== undefined) {
    exigirColunasConhecidas(conjunto.tabela, primeira, colunas);
  }

  for (const [indice, linha] of conjunto.linhas.entries()) {
    const insercao = montarInsercao(conjunto.tabela, linha);
    try {
      await cliente.query(insercao.texto, [...insercao.valores]);
    } catch (causa) {
      throw new ErroAoPlantar(conjunto.tabela, indice, causa);
    }
  }
}

/**
 * Recusa uma linha que cite coluna inexistente.
 *
 * Sem isto o erro chegaria como "column does not exist" do PostgreSQL, sem
 * dizer que a origem é o cenário nem o que fazer. Com isto, ele diz as duas
 * coisas — e é justamente o aviso que a primeira pessoa a criar a migração de
 * `orders` vai receber, caso a tabela nasça diferente do desenho.
 */
function exigirColunasConhecidas(
  tabela: string,
  linha: LinhaDeExemplo,
  colunas: ReadonlySet<string>,
): void {
  const desconhecidas = Object.keys(linha).filter(
    (coluna) => !colunas.has(coluna),
  );
  if (desconhecidas.length > 0) {
    throw new ErroDeColunaDesconhecida(tabela, desconhecidas);
  }
}

// ---------------------------------------------------------------------------
// Conferência pelo caminho da aplicação (AC-004)
// ---------------------------------------------------------------------------

/** O que a vitrine de uma loja enxerga depois da carga. */
export interface VitrineConferida {
  readonly loja: string;
  readonly produtosVisiveis: number;
}

/** Define o contexto da requisição na transação, como o caminho único faz. */
async function definirContexto(
  cliente: ClienteSql,
  lojaId: string,
  papel: string,
): Promise<void> {
  await cliente.query(
    `SELECT set_config('app.store_id',    $1, true),
            set_config('app.user_id',     '', true),
            set_config('app.role',        $2, true),
            set_config('app.order_token', '', true)`,
    [lojaId, papel],
  );
}

/** O que a vitrine devolve para uma loja, dentro de uma transação com contexto. */
interface LeituraDaVitrine {
  readonly produtos: readonly LinhaDeConsulta[];
  readonly lojas: number;
}

/**
 * Lê a vitrine de uma loja com o contexto aplicado, e o encerra em seguida.
 *
 * A transação existe pelo mesmo motivo que existe no caminho da API: o contexto
 * gravado com validade limitada a ela morre no encerramento, em vez de ficar
 * grudado na conexão e vazar para a leitura da loja seguinte — que aqui
 * transformaria a conferência de isolamento num teste que sempre passa.
 */
async function lerVitrine(
  cliente: ClienteSql,
  lojaId: string,
): Promise<LeituraDaVitrine> {
  await cliente.query("BEGIN");
  try {
    await definirContexto(cliente, lojaId, "PUBLIC");
    const produtos = await cliente.query(
      "SELECT id, store_id, status FROM app.products",
    );
    const lojas = await cliente.query("SELECT id FROM app.stores");
    return { produtos: produtos.rows, lojas: lojas.rows.length };
  } finally {
    await cliente.query("COMMIT");
  }
}

/**
 * Confere que a vitrine enxerga o cenário — e só o da loja corrente.
 *
 * Recebe uma conexão autenticada como `sc_app`, a credencial que atende
 * requisição, e reproduz o que `apps/api/src/core/db.ts` faz: uma transação,
 * os quatro parâmetros de contexto gravados com validade limitada a ela, e a
 * consulta por cima. É a diferença entre "o banco aceitou as linhas" e "o
 * cenário é navegável".
 *
 * A conferência de vazamento vem junto de propósito: com o contexto da loja A,
 * nenhum produto da loja B pode aparecer. Se aparecer, o cenário plantado está
 * mentindo sobre o isolamento e é melhor descobrir aqui.
 */
export async function conferirVitrine(
  clienteDaAplicacao: ClienteSql,
): Promise<readonly VitrineConferida[]> {
  const divergencias: string[] = [];
  const conferidas: VitrineConferida[] = [];

  for (const loja of LOJAS) {
    const publicados = PRODUTOS.filter(
      (produto) =>
        produto.loja.chave === loja.chave && produto.status === "PUBLISHED",
    );

    const { produtos: visiveis, lojas: lojasVisiveis } = await lerVitrine(
      clienteDaAplicacao,
      loja.id,
    );

    if (lojasVisiveis !== 1) {
      divergencias.push(
        `com o contexto de ${loja.slug}, a vitrine enxerga ${lojasVisiveis} loja(s) — deveria enxergar exatamente 1`,
      );
    }
    if (visiveis.length !== publicados.length) {
      divergencias.push(
        `${loja.slug}: a vitrine enxerga ${visiveis.length} produto(s), e o cenário publicou ${publicados.length}`,
      );
    }
    const deOutraLoja = visiveis.filter(
      (linha) => String(linha.store_id) !== loja.id,
    );
    if (deOutraLoja.length > 0) {
      divergencias.push(
        `${loja.slug}: ${deOutraLoja.length} produto(s) de OUTRA loja apareceram na vitrine`,
      );
    }

    conferidas.push({ loja: loja.slug, produtosVisiveis: visiveis.length });
  }

  if (divergencias.length > 0) throw new ErroDeVitrineDeExemplo(divergencias);
  return conferidas;
}

// ---------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------

/** Variável obrigatória, com recusa que diz o que fazer. */
function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new Error(
      [
        `${nome} não está definida, e sem ela a carga de exemplo não tem como falar com o banco.`,
        "Complete o arquivo de ambiente: cp .env.example .env",
      ].join("\n"),
    );
  }
  return valor;
}

async function principal(): Promise<number> {
  const { default: pg } = await import("pg");

  const urlDireta = exigirVariavel("DATABASE_URL_DIRETA");
  const urlDaAdministracao = derivarUrlDePapel(
    urlDireta,
    "sc_admin",
    exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
  );
  const urlDaAplicacao = derivarUrlDePapel(
    urlDireta,
    "sc_app",
    exigirVariavel("SENHA_BANCO_APLICACAO"),
  );

  const administracao = new pg.Client({ connectionString: urlDaAdministracao });
  await administracao.connect();

  try {
    const relatorio = await carregarDadosDeExemplo({
      cliente: administracao,
      relatar: (linha) => process.stdout.write(`  ${linha}\n`),
    });

    const aplicacao = new pg.Client({ connectionString: urlDaAplicacao });
    await aplicacao.connect();
    try {
      const vitrines = await conferirVitrine(aplicacao);
      for (const vitrine of vitrines) {
        process.stdout.write(
          `  vitrine de ${vitrine.loja}: ${vitrine.produtosVisiveis} produto(s) visíveis\n`,
        );
      }
    } finally {
      await aplicacao.end();
    }

    const linhas = relatorio.plantadas.reduce(
      (soma, tabela) => soma + tabela.linhas,
      0,
    );
    process.stdout.write(
      `✔ ${linhas} linha(s) em ${relatorio.plantadas.length} tabela(s), em ${relatorio.duracaoMs} ms\n`,
    );
    if (relatorio.adiadas.length > 0) {
      process.stdout.write(
        `  ${relatorio.adiadas.length} tabela(s) adiada(s) — ainda não existem no esquema: ${relatorio.adiadas
          .map((tabela) => tabela.tabela)
          .join(", ")}\n`,
      );
    }
    return 0;
  } catch (erro) {
    process.stderr.write(
      `${erro instanceof Error ? erro.message : String(erro)}\n`,
    );
    return 1;
  } finally {
    await administracao.end();
  }
}

// Importar este módulo num teste não pode disparar carga nenhuma.
const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal();
}
