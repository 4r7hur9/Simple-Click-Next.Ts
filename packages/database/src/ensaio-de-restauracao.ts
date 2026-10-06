/**
 * Ensaio de restauração da cópia de segurança (T-024, AC-052).
 *
 * Cópia que nunca voltou não é cópia, é esperança. O ensaio pega uma cópia
 * feita por `copia-de-seguranca.ts`, restaura num banco NOVO e descartável do
 * servidor de `DATABASE_URL_ENSAIO` e confere contra o manifesto tirado no
 * instante da cópia:
 *
 *   - o arquivo é o mesmo que foi gravado (resumo SHA-256) — senão nem começa;
 *   - o livro de migrações é o mesmo, nome a nome;
 *   - nenhuma tabela de loja voltou sem isolamento ligado e forçado;
 *   - cada tabela tem o mesmo número de linhas.
 *
 * O banco descartável é apagado no fim, passe ou falhe. Ele só é criado e
 * apagado com o prefixo `sc_ensaio_`: não existe caminho aqui que apague um
 * banco que este arquivo não criou.
 *
 * O servidor de destino precisa ter os papéis `sc_migrator`, `sc_app` e
 * `sc_admin` (papel é do servidor, não entra na cópia) e a credencial precisa
 * poder criar banco, extensão e gatilho de evento — a de dono do provedor.
 */

import { existsSync, readFileSync } from "node:fs";

import pg from "pg";

import {
  contarLinhas,
  livroDeMigracoes,
  type ManifestoDaCopia,
  resumoDoArquivo,
} from "./copia-de-seguranca.ts";
import { restaurarArquivo } from "./ferramentas-do-postgres.ts";
import { tabelasSemIsolamento } from "./migrate.ts";

/** Prefixo dos bancos que o ensaio cria — e o único que ele apaga. */
export const PREFIXO_DO_ENSAIO = "sc_ensaio_";

const NOME_DO_ENSAIO = /^sc_ensaio_[a-z0-9_]{1,40}$/;

/** O ensaio reprovou. A mensagem diz o que divergiu. */
export class ErroDoEnsaio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDoEnsaio";
  }
}

export interface RelatorioDoEnsaio {
  readonly banco: string;
  readonly tabelasConferidas: number;
  readonly parametrosRetirados: readonly string[];
}

/** A mesma cadeia apontando para outro banco do mesmo servidor. */
function noBanco(url: string, nome: string): string {
  const destino = new URL(url);
  destino.pathname = `/${nome}`;
  return destino.toString();
}

async function comCliente<T>(
  url: string,
  acao: (cliente: pg.Client) => Promise<T>,
): Promise<T> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return await acao(cliente);
  } finally {
    await cliente.end();
  }
}

/** Lê o manifesto ao lado da cópia e confere que o arquivo é o mesmo. */
async function lerManifesto(arquivo: string): Promise<ManifestoDaCopia> {
  const caminho = `${arquivo}.json`;
  if (!existsSync(caminho)) {
    throw new ErroDoEnsaio(
      `A cópia ${arquivo} não tem manifesto (${caminho}). Sem ele não há contra o que conferir.`,
    );
  }
  const manifesto = JSON.parse(
    readFileSync(caminho, "utf8"),
  ) as ManifestoDaCopia;
  if (manifesto.versao !== 1) {
    throw new ErroDoEnsaio(`Manifesto de versão desconhecida em ${caminho}.`);
  }
  if ((await resumoDoArquivo(arquivo)) !== manifesto.sha256) {
    throw new ErroDoEnsaio(
      `A cópia ${arquivo} está corrompida: o resumo do arquivo não bate com o do manifesto.`,
    );
  }
  return manifesto;
}

/** Diferenças entre o banco restaurado e o manifesto; vazio é aprovação. */
async function divergencias(
  cliente: pg.Client,
  manifesto: ManifestoDaCopia,
): Promise<string[]> {
  const problemas: string[] = [];

  const livro = await livroDeMigracoes(cliente);
  const esperado = manifesto.migracoes.map((m) => `${m.nome}:${m.sha256}`);
  const obtido = livro.map((m) => `${m.nome}:${m.sha256}`);
  if (esperado.join("\n") !== obtido.join("\n")) {
    problemas.push(
      `livro de migrações: ${obtido.length} no banco restaurado, ${esperado.length} no manifesto`,
    );
  }

  for (const tabela of await tabelasSemIsolamento(cliente)) {
    problemas.push(`app.${tabela.tabela} voltou sem isolamento forçado`);
  }

  const linhas = await contarLinhas(cliente);
  const nomes = new Set([
    ...Object.keys(linhas),
    ...Object.keys(manifesto.linhas),
  ]);
  for (const nome of [...nomes].sort()) {
    if (linhas[nome] !== manifesto.linhas[nome]) {
      problemas.push(
        `${nome}: ${linhas[nome] ?? "ausente"} linha(s), manifesto diz ${manifesto.linhas[nome] ?? "ausente"}`,
      );
    }
  }
  return problemas;
}

/**
 * Restaura a cópia num banco descartável, confere e apaga o banco.
 * Lança `ErroDoEnsaio` (ou o erro da ferramenta) quando algo não volta igual.
 */
export async function ensaiarRestauracao(entrada: {
  readonly arquivo: string;
  /** Cadeia do servidor de destino, com credencial que cria banco. */
  readonly urlDoServidor: string;
  readonly relatar?: (linha: string) => void;
  readonly ambiente?: Readonly<Record<string, string | undefined>>;
}): Promise<RelatorioDoEnsaio> {
  const relatar = entrada.relatar ?? (() => {});
  const manifesto = await lerManifesto(entrada.arquivo);
  relatar(`manifesto confere com o arquivo (${manifesto.arquivo})`);

  const banco = `${PREFIXO_DO_ENSAIO}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  if (!NOME_DO_ENSAIO.test(banco)) throw new ErroDoEnsaio("nome inválido");

  const { parametros, papeisFaltando } = await comCliente(
    entrada.urlDoServidor,
    async (cliente) => {
      const papeis = await cliente.query(
        `SELECT p FROM unnest(ARRAY['sc_migrator','sc_app','sc_admin']) AS p
          WHERE NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = p)`,
      );
      const conhecidos = await cliente.query("SELECT name FROM pg_settings");
      return {
        papeisFaltando: papeis.rows.map((linha) => String(linha.p)),
        parametros: new Set(conhecidos.rows.map((linha) => String(linha.name))),
      };
    },
  );
  if (papeisFaltando.length > 0) {
    throw new ErroDoEnsaio(
      `O servidor de destino não tem os papéis ${papeisFaltando.join(", ")}. Crie-os antes (README, seção de cópia de segurança).`,
    );
  }

  await comCliente(entrada.urlDoServidor, (cliente) =>
    cliente.query(`CREATE DATABASE ${banco} TEMPLATE template0`),
  );
  relatar(`banco descartável ${banco} criado`);
  try {
    const { parametrosRetirados } = await restaurarArquivo({
      arquivo: entrada.arquivo,
      urlDoDestino: noBanco(entrada.urlDoServidor, banco),
      parametrosConhecidos: parametros,
      ...(entrada.ambiente === undefined ? {} : { ambiente: entrada.ambiente }),
    });
    relatar("cópia restaurada numa transação só");

    const problemas = await comCliente(
      noBanco(entrada.urlDoServidor, banco),
      (cliente) => divergencias(cliente, manifesto),
    );
    if (problemas.length > 0) {
      throw new ErroDoEnsaio(
        ["A restauração não voltou igual à cópia:", ...problemas].join("\n  "),
      );
    }
    return {
      banco,
      tabelasConferidas: Object.keys(manifesto.linhas).length,
      parametrosRetirados,
    };
  } finally {
    await comCliente(entrada.urlDoServidor, (cliente) =>
      cliente.query(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`),
    );
    relatar(`banco descartável ${banco} apagado`);
  }
}
