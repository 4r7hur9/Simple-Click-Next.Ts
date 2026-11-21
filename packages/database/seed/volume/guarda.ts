/**
 * A GUARDA ÚNICA do volume (#138): toda conexão passa por aqui.
 *
 * Soma-se às camadas de `montarAlvo` (D-2 do #135), que seguem valendo:
 * `NODE_ENV` diferente de produção, host só local, banco diferente de
 * `DATABASE_URL`/`DATABASE_URL_DIRETA`/`DATABASE_URL_TEST` e
 * `current_database()` conferido a cada conexão. Aqui entram:
 *
 * - nome EXATO `simpleclick_simulacao` (o padrão do #135 aceita sufixos);
 * - nenhuma query string na URL, nem porta do agrupador (:6432);
 * - nenhuma variável `PG*` que desvie destino ou opções da sessão;
 * - marcador `simpleclick-simulacao` no comentário do banco;
 * - só `sc_admin` (grava) e `sc_app` (EXPLAIN): sem superusuário, sem
 *   `BYPASSRLS` e sem pertencer a outro papel;
 * - `search_path` fixo.
 *
 * Nada aqui lê `process.env`: o ambiente entra por parâmetro, e a fábrica de
 * conexões também, para os testes provarem que ela não é chamada nas recusas.
 */

import { derivarUrlDePapel, type ClienteSql } from "../../src/migrate.ts";
import {
  type Ambiente,
  conectarConferindo,
  ErroDeGuarda,
  MARCADOR_DO_BANCO,
  montarAlvo,
} from "../simulacao/banco.ts";
import { BANCO_DO_VOLUME } from "./parametros.ts";

export type PapelDoVolume = "sc_admin" | "sc_app";

export interface ConexaoDoVolume extends ClienteSql {
  end(): Promise<void>;
}

/** Abre uma conexão para a URL dada (a padrão confere `current_database()`). */
export type FabricaDeConexao = (url: string) => Promise<ConexaoDoVolume>;

export const fabricaPadrao: FabricaDeConexao = async (url) =>
  (await conectarConferindo(url, BANCO_DO_VOLUME)) as unknown as ConexaoDoVolume;

/** Variáveis do libpq que trocam destino ou opções da sessão. */
export const VARIAVEIS_PG_PROIBIDAS = [
  "PGOPTIONS",
  "PGHOST",
  "PGHOSTADDR",
  "PGDATABASE",
  "PGSERVICE",
  "PGSERVICEFILE",
] as const;

/** A parte pura: tudo que dá para recusar sem abrir conexão. */
export function urlDoPapel(env: Ambiente, papel: PapelDoVolume): string {
  for (const nome of VARIAVEIS_PG_PROIBIDAS) {
    const valor = env[nome];
    if (valor !== undefined && valor.trim() !== "") {
      throw new ErroDeGuarda(
        `${nome} está definida no ambiente: ela desviaria a conexão do volume. Remova-a desta execução.`,
      );
    }
  }
  // Camadas do #135: produção, host local, banco ≠ dev/teste.
  const alvo = montarAlvo(env, BANCO_DO_VOLUME);
  if (alvo.banco !== BANCO_DO_VOLUME) {
    throw new ErroDeGuarda("O volume só escreve em simpleclick_simulacao.");
  }
  const base = new URL(alvo.urlDoBancoDaSimulacao);
  if (base.search !== "") {
    throw new ErroDeGuarda(
      "A URL do banco não pode trazer query string (options, sslmode etc.): recusado.",
    );
  }
  if (base.port === "6432") {
    throw new ErroDeGuarda("A porta 6432 é a do agrupador: o volume usa a conexão direta.");
  }
  const senha = papel === "sc_admin" ? alvo.senhas.administracao : alvo.senhas.aplicacao;
  return derivarUrlDePapel(alvo.urlDoBancoDaSimulacao, papel, senha);
}

interface Identidade {
  readonly banco: string;
  readonly papel: string;
  readonly marcador: string | null;
  readonly superusuario: boolean;
  readonly contornaRls: boolean;
  readonly membros: number;
}

const SQL_IDENTIDADE = `
  SELECT current_database() AS banco,
         current_user AS papel,
         (SELECT shobj_description(d.oid, 'pg_database')
            FROM pg_database d WHERE d.datname = current_database()) AS marcador,
         r.rolsuper AS superusuario,
         r.rolbypassrls AS contorna_rls,
         (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS membros
    FROM pg_roles r
   WHERE r.rolname = current_user`;

/** Confere banco, marcador e atributos do papel que a conexão realmente tem. */
export async function lerIdentidade(cliente: ClienteSql): Promise<Identidade> {
  const r = await cliente.query(SQL_IDENTIDADE);
  const linha = r.rows[0];
  if (linha === undefined) {
    throw new ErroDeGuarda("Não consegui ler a identidade da sessão.");
  }
  return {
    banco: String(linha["banco"]),
    papel: String(linha["papel"]),
    marcador: linha["marcador"] === null ? null : String(linha["marcador"]),
    superusuario: linha["superusuario"] === true,
    contornaRls: linha["contorna_rls"] === true,
    membros: Number(linha["membros"]),
  };
}

/** Recusa o que a identidade não pode ser; devolve a mensagem ou null. */
export function motivoDeRecusa(identidade: Identidade, papel: PapelDoVolume): string | null {
  if (identidade.banco !== BANCO_DO_VOLUME) {
    return `Conectou no banco "${identidade.banco}": o volume só usa ${BANCO_DO_VOLUME}.`;
  }
  if (identidade.marcador !== MARCADOR_DO_BANCO) {
    return `O banco ${BANCO_DO_VOLUME} não tem o marcador "${MARCADOR_DO_BANCO}": não foi criado pelo seed de simulação.`;
  }
  if (identidade.papel !== papel) {
    return `A sessão é do papel "${identidade.papel}", e o esperado era "${papel}".`;
  }
  if (identidade.superusuario) return `O papel ${papel} é superusuário: recusado.`;
  if (identidade.contornaRls) return `O papel ${papel} contorna a RLS (BYPASSRLS): recusado.`;
  if (identidade.membros > 0) {
    return `O papel ${papel} pertence a outro papel (pg_auth_members): recusado.`;
  }
  return null;
}

/**
 * Abre a conexão do papel, confere tudo e fixa o `search_path`. Em qualquer
 * recusa fecha a conexão antes de lançar `ErroDeGuarda`.
 */
export async function abrirConexaoGuardada(
  env: Ambiente,
  papel: PapelDoVolume,
  fabrica: FabricaDeConexao = fabricaPadrao,
): Promise<ConexaoDoVolume> {
  const url = urlDoPapel(env, papel);
  const conexao = await fabrica(url);
  try {
    const motivo = motivoDeRecusa(await lerIdentidade(conexao), papel);
    if (motivo !== null) throw new ErroDeGuarda(motivo);
    await conexao.query("SET search_path = app, pg_catalog");
  } catch (erro) {
    await conexao.end().catch(() => {});
    if (erro instanceof ErroDeGuarda) throw erro;
    throw new ErroDeGuarda("Não consegui conferir a sessão do banco (etapa: identidade).");
  }
  return conexao;
}
