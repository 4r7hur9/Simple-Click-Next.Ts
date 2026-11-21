/**
 * A guarda de banco e de ambiente do perfil de simulação (D-2).
 *
 * O perfil só escreve numa base dedicada, `simpleclick_simulacao`, criada e
 * recriada por aqui. A base de desenvolvimento tem dados de verdade, e o
 * comando precisa recusar ANTES de conectar a qualquer outra. Camadas:
 *
 * 1. `NODE_ENV=production` recusa.
 * 2. O nome do banco casa com `^simpleclick_simulacao(_[a-z0-9]+)?$` e é
 *    diferente do banco de `DATABASE_URL`, `DATABASE_URL_DIRETA` e
 *    `DATABASE_URL_TEST`.
 * 3. O host é `localhost`, `127.0.0.1` ou `::1`, e a query string não traz
 *    `host`, `hostaddr` nem `service` (que trocariam o destino por baixo).
 * 4. Depois de cada conexão, `SELECT current_database()` precisa devolver o
 *    nome esperado.
 * 5. O banco nasce com `COMMENT ON DATABASE` marcando `simpleclick-simulacao`,
 *    e `--recriar` só faz DROP com o marcador presente e se todas as lojas
 *    tiverem `code` `SIM-`.
 * 6. Os papéis do cluster são compartilhados com a dev (a migração 0001 troca
 *    senha com ALTER ROLE): antes de migrar, `sc_migrator`, `sc_app` e
 *    `sc_admin` precisam autenticar com as senhas do ambiente.
 *
 * Nenhuma mensagem daqui leva credencial.
 */

import pg from "pg";

import {
  aplicarMigracoes,
  type ClienteSql,
  derivarUrlDePapel,
} from "../../src/migrate.ts";
import { exigirAmbienteQueNaoEProducao } from "../index.ts";
import {
  ehHostLocal,
  mascararUrl,
  PADRAO_DO_NOME_DO_BANCO,
  semColchetes,
} from "./parametros.ts";

export class ErroDeGuarda extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeGuarda";
  }
}

export type Ambiente = Readonly<Record<string, string | undefined>>;

/** O marcador gravado no comentário do banco criado pelo perfil. */
export const MARCADOR_DO_BANCO = "simpleclick-simulacao";

/** O prefixo de `stores.code` das lojas do perfil. */
export const PREFIXO_DO_CODIGO = "SIM-";

const PARAMETROS_QUE_TROCAM_O_DESTINO = ["host", "hostaddr", "service"];

/** Escapa um identificador SQL. O nome já passou pelo padrão; isto é a segunda trava. */
export const identificador = (nome: string): string =>
  `"${nome.replaceAll('"', '""')}"`;

// ---------------------------------------------------------------------------
// Análise de endereços (puro)
// ---------------------------------------------------------------------------

export interface EnderecoAnalisado {
  readonly url: URL;
  readonly host: string;
  readonly banco: string;
}

function analisar(
  rotulo: string,
  valor: string,
  protocolos: readonly string[],
): URL {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ErroDeGuarda(`${rotulo}: endereço inválido.`);
  }
  if (!protocolos.includes(url.protocol)) {
    throw new ErroDeGuarda(
      `${rotulo}: esquema "${url.protocol.replace(":", "")}" não aceito aqui.`,
    );
  }
  for (const nome of PARAMETROS_QUE_TROCAM_O_DESTINO) {
    if (url.searchParams.has(nome)) {
      throw new ErroDeGuarda(
        `${rotulo}: o parâmetro "${nome}" na query string troca o destino da conexão e não é aceito.`,
      );
    }
  }
  if (!ehHostLocal(url.hostname)) {
    throw new ErroDeGuarda(
      `${rotulo}: o perfil de simulação só roda em banco local (localhost, 127.0.0.1 ou ::1).`,
    );
  }
  return url;
}

/** `postgresql://…/banco`: host local, sem parâmetro que troque o destino. */
export function analisarUrlDePostgres(
  rotulo: string,
  valor: string,
): EnderecoAnalisado {
  const url = analisar(rotulo, valor, ["postgres:", "postgresql:"]);
  return {
    url,
    host: semColchetes(url.hostname),
    banco: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

/** O Redis também precisa ser local e sem TLS (`rediss` aponta para serviço remoto). */
export function analisarUrlDeRedis(rotulo: string, valor: string): URL {
  return analisar(rotulo, valor, ["redis:"]);
}

/** A mesma URL apontando para outro banco do mesmo servidor. */
export function urlDoBanco(url: string, banco: string): string {
  const destino = new URL(url);
  destino.pathname = `/${encodeURIComponent(banco)}`;
  return destino.toString();
}

// ---------------------------------------------------------------------------
// A guarda (puro)
// ---------------------------------------------------------------------------

export interface AlvoDaSimulacao {
  readonly banco: string;
  /** Superusuário no banco de manutenção (`postgres`): cria e apaga bancos. */
  readonly urlDeManutencao: string;
  /** Superusuário no banco da simulação: migra. */
  readonly urlDoMigrador: string;
  /** Base `postgresql://…` sem o nome do banco trocado, para derivar papéis. */
  readonly urlDoBancoDaSimulacao: string;
  readonly senhas: {
    readonly migrador: string;
    readonly aplicacao: string;
    readonly administracao: string;
  };
}

function senhaObrigatoria(env: Ambiente, nome: string): string {
  const valor = env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new ErroDeGuarda(`${nome} precisa estar definida no ambiente (.env da raiz).`);
  }
  return valor;
}

/**
 * Confere ambiente e endereços e devolve o alvo. Lança `ErroDeGuarda` antes de
 * qualquer conexão.
 */
export function montarAlvo(env: Ambiente, banco: string): AlvoDaSimulacao {
  try {
    exigirAmbienteQueNaoEProducao(env);
  } catch {
    throw new ErroDeGuarda(
      "NODE_ENV=production: o perfil de simulação nunca roda em produção.",
    );
  }
  if (!PADRAO_DO_NOME_DO_BANCO.test(banco)) {
    throw new ErroDeGuarda(
      `O banco "${banco}" não casa com ${String(PADRAO_DO_NOME_DO_BANCO)}.`,
    );
  }

  const direta = env.DATABASE_URL_DIRETA?.trim();
  if (direta === undefined || direta === "") {
    throw new ErroDeGuarda("DATABASE_URL_DIRETA precisa estar definida no ambiente (.env da raiz).");
  }
  const analisadaDireta = analisarUrlDePostgres("DATABASE_URL_DIRETA", direta);
  const protegidos = [analisadaDireta.banco];
  for (const nome of ["DATABASE_URL", "DATABASE_URL_TEST"]) {
    const valor = env[nome]?.trim();
    if (valor === undefined || valor === "") continue;
    // A URL da aplicação passa pelo agrupador, que também é local; a de teste
    // pode estar noutro servidor local. A regra é só "local e sem desvio".
    protegidos.push(analisarUrlDePostgres(nome, valor).banco);
  }
  if (protegidos.includes(banco)) {
    throw new ErroDeGuarda(
      `O banco "${banco}" é o mesmo de uma das conexões do ambiente (dev ou teste): recusado.`,
    );
  }

  const urlDoBancoDaSimulacao = urlDoBanco(direta, banco);
  return {
    banco,
    urlDeManutencao: urlDoBanco(direta, "postgres"),
    urlDoMigrador: urlDoBancoDaSimulacao,
    urlDoBancoDaSimulacao,
    senhas: {
      migrador: senhaObrigatoria(env, "SENHA_BANCO_MIGRADOR"),
      aplicacao: senhaObrigatoria(env, "SENHA_BANCO_APLICACAO"),
      administracao: senhaObrigatoria(env, "SENHA_BANCO_ADMINISTRACAO"),
    },
  };
}

// ---------------------------------------------------------------------------
// Conexões
// ---------------------------------------------------------------------------

/** Conecta e confere `current_database()`: se vier outro, fecha e recusa. */
export async function conectarConferindo(
  url: string,
  esperado: string,
): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url });
  try {
    await cliente.connect();
    const r = await cliente.query("SELECT current_database() AS banco");
    const encontrado = String(r.rows[0]?.banco);
    if (encontrado !== esperado) {
      throw new ErroDeGuarda(
        `Conectou no banco "${encontrado}" e o esperado era "${esperado}": recusado.`,
      );
    }
  } catch (erro) {
    await cliente.end().catch(() => {});
    if (erro instanceof ErroDeGuarda) throw erro;
    throw new ErroDeGuarda(
      `Não consegui conectar em ${mascararUrl(url)}: ${mensagemSemSegredo(erro)}`,
    );
  }
  return cliente;
}

/** O erro do driver sem o que possa trazer da conexão. */
function mensagemSemSegredo(erro: unknown): string {
  const codigo =
    typeof erro === "object" && erro !== null && "code" in erro
      ? String((erro as { code: unknown }).code)
      : "";
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return `${codigo} ${mensagem}`.replace(/postgres(ql)?:\/\/\S+/gi, "<url>").trim();
}

export interface OpcoesDePreparo {
  readonly recriar: boolean;
  readonly aceitarTrust: boolean;
  readonly relatar?: (linha: string) => void;
}

/**
 * Autentica os três papéis do cluster com as senhas do ambiente e confere se a
 * senha errada é recusada. Cluster em `trust` aceitaria tudo: a prova prévia
 * não valeria nada, e só segue com `--aceitar-trust`.
 */
export async function autenticarPapeis(
  alvo: AlvoDaSimulacao,
  { aceitarTrust, relatar = () => {} }: Pick<OpcoesDePreparo, "aceitarTrust" | "relatar">,
): Promise<void> {
  const papeis: readonly (readonly [string, string])[] = [
    ["sc_migrator", alvo.senhas.migrador],
    ["sc_app", alvo.senhas.aplicacao],
    ["sc_admin", alvo.senhas.administracao],
  ];
  for (const [papel, senha] of papeis) {
    try {
      const cliente = await conectarConferindo(
        derivarUrlDePapel(alvo.urlDoBancoDaSimulacao, papel, senha),
        alvo.banco,
      );
      await cliente.end();
    } catch {
      throw new ErroDeGuarda(
        `O papel ${papel} não autenticou com a senha do ambiente. Recusado: a migração 0001 faz ALTER ROLE e trocaria a senha usada pela dev.`,
      );
    }
  }
  // Senha errada, gerada na hora: se entrar, a autenticação do cluster é frouxa.
  const falsa = `errada-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const aceitou = await conectarConferindo(
    derivarUrlDePapel(alvo.urlDoBancoDaSimulacao, "sc_app", falsa),
    alvo.banco,
  ).then(
    async (cliente) => {
      await cliente.end();
      return true;
    },
    () => false,
  );
  if (aceitou) {
    if (!aceitarTrust) {
      throw new ErroDeGuarda(
        "O cluster aceitou uma senha errada (pg_hba com trust): a autenticação prévia dos papéis não prova nada. Use --aceitar-trust para seguir mesmo assim.",
      );
    }
    relatar("⚠ o cluster aceita qualquer senha (trust); seguindo por --aceitar-trust.");
  } else {
    relatar("✔ papéis sc_migrator, sc_app e sc_admin autenticados; senha errada recusada.");
  }
}

interface ExistenciaDoBanco {
  readonly existe: boolean;
  readonly marcado: boolean;
}

async function existencia(
  manutencao: pg.Client,
  banco: string,
): Promise<ExistenciaDoBanco> {
  const r = await manutencao.query(
    `SELECT shobj_description(oid, 'pg_database') AS comentario
       FROM pg_database WHERE datname = $1`,
    [banco],
  );
  if (r.rows.length === 0) return { existe: false, marcado: false };
  return {
    existe: true,
    marcado: r.rows[0]!.comentario === MARCADOR_DO_BANCO,
  };
}

async function criarMarcado(manutencao: pg.Client, banco: string): Promise<void> {
  await manutencao.query(`CREATE DATABASE ${identificador(banco)}`);
  await manutencao.query(
    `COMMENT ON DATABASE ${identificador(banco)} IS '${MARCADOR_DO_BANCO}'`,
  );
}

/** Lojas do banco e quantas NÃO são do perfil; pela conexão de superusuário (não sofre RLS). */
export async function contarLojas(
  cliente: ClienteSql,
): Promise<{ total: number; foraDoPerfil: number }> {
  const tabela = await cliente.query("SELECT to_regclass('app.stores') AS t");
  if (tabela.rows[0]?.t === null) return { total: 0, foraDoPerfil: 0 };
  const r = await cliente.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE code IS NULL OR code NOT LIKE $1)::int AS fora
       FROM app.stores`,
    [`${PREFIXO_DO_CODIGO}%`],
  );
  return { total: Number(r.rows[0]!.total), foraDoPerfil: Number(r.rows[0]!.fora) };
}

/**
 * Cria a base (ou a recria com `--recriar`), autentica os papéis e aplica as
 * migrações. Devolve se o banco foi criado agora.
 */
export async function prepararBanco(
  alvo: AlvoDaSimulacao,
  opcoes: OpcoesDePreparo,
): Promise<{ criado: boolean }> {
  const relatar = opcoes.relatar ?? (() => {});
  const manutencao = await conectarConferindo(alvo.urlDeManutencao, "postgres");
  let criado = false;
  try {
    const estado = await existencia(manutencao, alvo.banco);
    if (!estado.existe) {
      await criarMarcado(manutencao, alvo.banco);
      criado = true;
      relatar(`✔ base ${alvo.banco} criada.`);
    } else if (!estado.marcado) {
      throw new ErroDeGuarda(
        `A base ${alvo.banco} existe mas não tem o marcador "${MARCADOR_DO_BANCO}": não foi criada por este comando. Recusado.`,
      );
    } else if (opcoes.recriar) {
      const dentro = await conectarConferindo(alvo.urlDoMigrador, alvo.banco);
      let lojas: { total: number; foraDoPerfil: number };
      try {
        lojas = await contarLojas(dentro);
      } finally {
        await dentro.end();
      }
      if (lojas.foraDoPerfil > 0) {
        throw new ErroDeGuarda(
          `A base ${alvo.banco} tem ${lojas.foraDoPerfil} loja(s) que não são do perfil (code sem "${PREFIXO_DO_CODIGO}"): --recriar recusado.`,
        );
      }
      await manutencao.query(
        `DROP DATABASE ${identificador(alvo.banco)} WITH (FORCE)`,
      );
      await criarMarcado(manutencao, alvo.banco);
      criado = true;
      relatar(`✔ base ${alvo.banco} recriada (${lojas.total} loja(s) do perfil descartadas).`);
    }
  } finally {
    await manutencao.end();
  }

  await autenticarPapeis(alvo, opcoes);

  const migrador = await conectarConferindo(alvo.urlDoMigrador, alvo.banco);
  try {
    const relatorio = await aplicarMigracoes({
      cliente: migrador,
      // Só as senhas dos papéis são lidas pelas migrações.
      segredos: {
        SENHA_BANCO_MIGRADOR: alvo.senhas.migrador,
        SENHA_BANCO_APLICACAO: alvo.senhas.aplicacao,
        SENHA_BANCO_ADMINISTRACAO: alvo.senhas.administracao,
      },
    });
    relatar(
      `✔ migrações: ${relatorio.aplicadas.length} aplicada(s), ${relatorio.jaAplicadas} já estavam.`,
    );
  } finally {
    await migrador.end();
  }
  return { criado };
}

/** Conexão da carga: `sc_admin` na base da simulação. */
export function conectarAdministracao(alvo: AlvoDaSimulacao): Promise<pg.Client> {
  return conectarConferindo(
    derivarUrlDePapel(alvo.urlDoBancoDaSimulacao, "sc_admin", alvo.senhas.administracao),
    alvo.banco,
  );
}

/** Conexão de superusuário na base da simulação (leitura de conferência, sem RLS). */
export function conectarSuperusuario(alvo: AlvoDaSimulacao): Promise<pg.Client> {
  return conectarConferindo(alvo.urlDoMigrador, alvo.banco);
}
