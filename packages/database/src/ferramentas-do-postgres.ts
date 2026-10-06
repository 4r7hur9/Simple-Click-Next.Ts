/**
 * As ferramentas de linha de comando do PostgreSQL (`pg_dump`, `pg_restore` e
 * `psql`) usadas pela cópia de segurança e pelo ensaio de restauração (T-024).
 *
 * Elas vêm da instalação do PostgreSQL da máquina de quem opera, e não de
 * pacote do projeto. Este arquivo só faz três coisas:
 *
 * 1. **Acha a ferramenta**: `PG_BIN` (pasta), depois o `PATH`, e no Windows a
 *    instalação padrão mais nova em `C:\Program Files\PostgreSQL\<versão>\bin`.
 * 2. **Executa sem pôr a senha na linha de comando**: a senha sai da cadeia de
 *    conexão e vai para `PGPASSWORD` no ambiente do processo filho. Lista de
 *    processos e mensagem de erro nunca a mostram.
 * 3. **Restaura por `psql`**, filtrando o `SET` de parâmetro que o servidor de
 *    destino não conhece. Ferramenta mais nova que o servidor escreve, por
 *    exemplo, `SET transaction_timeout = 0`, que um PostgreSQL 16 recusa — e
 *    sem o filtro a restauração inteira cairia por uma linha de cabeçalho.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import { Transform, type TransformCallback } from "node:stream";
import { StringDecoder } from "node:string_decoder";

export type AmbienteDasFerramentas = Readonly<
  Record<string, string | undefined>
>;

export type Ferramenta = "pg_dump" | "pg_restore" | "psql";

/** A ferramenta não foi achada, ou terminou com erro. */
export class ErroDeFerramenta extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeFerramenta";
  }
}

const EXTENSAO = process.platform === "win32" ? ".exe" : "";

/** Pastas onde procurar, na ordem de preferência. */
function pastasCandidatas(ambiente: AmbienteDasFerramentas): string[] {
  const pastas: string[] = [];
  const pgBin = ambiente.PG_BIN?.trim();
  if (pgBin) pastas.push(pgBin);
  pastas.push(...(ambiente.PATH ?? "").split(delimiter).filter(Boolean));

  const instalacao = "C:\\Program Files\\PostgreSQL";
  if (process.platform === "win32" && existsSync(instalacao)) {
    const versoes = readdirSync(instalacao)
      .filter((nome) => /^\d+$/.test(nome))
      .sort((a, b) => Number(b) - Number(a));
    pastas.push(...versoes.map((versao) => join(instalacao, versao, "bin")));
  }
  return pastas;
}

/** Caminho da ferramenta, ou erro que diz como apontar para ela. */
export function localizarFerramenta(
  ferramenta: Ferramenta,
  ambiente: AmbienteDasFerramentas = process.env,
): string {
  for (const pasta of pastasCandidatas(ambiente)) {
    const caminho = join(pasta, `${ferramenta}${EXTENSAO}`);
    if (existsSync(caminho)) return caminho;
  }
  throw new ErroDeFerramenta(
    `${ferramenta} não foi encontrado. Instale o cliente do PostgreSQL (mesma versão principal do servidor, ou mais nova) ou aponte PG_BIN para a pasta bin dele.`,
  );
}

/** A cadeia sem senha, e a senha à parte para ir em `PGPASSWORD`. */
export function separarSenha(url: string): { url: string; senha: string } {
  const destino = new URL(url);
  const senha = decodeURIComponent(destino.password);
  destino.password = "";
  return { url: destino.toString(), senha };
}

interface Execucao {
  readonly ferramenta: Ferramenta;
  readonly argumentos: readonly string[];
  /** Cadeia de conexão, posta no fim; a senha vai pelo ambiente do filho. */
  readonly url?: string;
  readonly ambiente?: AmbienteDasFerramentas;
}

/** Monta o processo filho com a senha fora da linha de comando. */
function iniciar(execucao: Execucao) {
  const ambiente = execucao.ambiente ?? process.env;
  const conexao =
    execucao.url === undefined ? undefined : separarSenha(execucao.url);
  const filho = spawn(
    localizarFerramenta(execucao.ferramenta, ambiente),
    conexao === undefined
      ? [...execucao.argumentos]
      : [...execucao.argumentos, conexao.url],
    {
      env: {
        ...process.env,
        PGPASSWORD: conexao?.senha ?? "",
        PGCONNECT_TIMEOUT: "15",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let erros = "";
  filho.stderr.on("data", (parte: Buffer) => {
    erros += parte.toString("utf8");
  });
  const fim = new Promise<void>((resolver, rejeitar) => {
    filho.on("error", (causa) =>
      rejeitar(
        new ErroDeFerramenta(`${execucao.ferramenta}: ${causa.message}`),
      ),
    );
    filho.on("close", (codigo) => {
      if (codigo === 0) resolver();
      else
        rejeitar(
          new ErroDeFerramenta(
            `${execucao.ferramenta} terminou com código ${codigo}: ${erros.trim().split("\n").slice(-3).join(" | ")}`,
          ),
        );
    });
  });
  return { filho, fim };
}

/** Roda a ferramenta até o fim; lança com as últimas linhas de erro. */
export async function executarFerramenta(execucao: Execucao): Promise<void> {
  const { filho, fim } = iniciar(execucao);
  filho.stdin.end();
  filho.stdout.resume();
  await fim;
}

/**
 * Tira do texto da restauração as linhas `SET <parâmetro> = ...;` cujo
 * parâmetro o servidor de destino não conhece. Só fora de bloco `COPY`: dentro
 * dele as linhas são dados, e nenhum dado é tocado.
 */
export class FiltroDeParametrosDesconhecidos extends Transform {
  private resto = "";
  private emCopy = false;
  readonly retirados: string[] = [];
  private readonly conhecidos: ReadonlySet<string>;
  private readonly decodificador = new StringDecoder("utf8");

  constructor(conhecidos: ReadonlySet<string>) {
    super();
    this.conhecidos = conhecidos;
  }

  private linha(texto: string): string | null {
    // No Windows o `pg_restore` escreve fim de linha CRLF: compara sem o `\r`.
    const limpo = texto.endsWith("\r") ? texto.slice(0, -1) : texto;
    if (this.emCopy) {
      if (limpo === "\\.") this.emCopy = false;
      return texto;
    }
    if (/^COPY .* FROM stdin;$/.test(limpo)) this.emCopy = true;
    const set = /^SET ([a-z_][a-z0-9_.]*) = .*;$/.exec(limpo);
    if (set && !this.conhecidos.has(set[1] as string)) {
      this.retirados.push(set[1] as string);
      return null;
    }
    return texto;
  }

  override _transform(
    parte: Buffer,
    _codificacao: BufferEncoding,
    pronto: TransformCallback,
  ): void {
    // O decodificador guarda o pedaço de caractere acentuado que ficou
    // partido entre dois blocos, em vez de estragá-lo.
    const linhas = (this.resto + this.decodificador.write(parte)).split("\n");
    this.resto = linhas.pop() ?? "";
    const saida = linhas
      .map((texto) => this.linha(texto))
      .filter((texto): texto is string => texto !== null);
    // Nada de `push("")`: só empurra quando há o que entregar.
    if (saida.length > 0) this.push(`${saida.join("\n")}\n`);
    pronto();
  }

  override _flush(pronto: TransformCallback): void {
    const final = this.resto + this.decodificador.end();
    const ultima = final === "" ? null : this.linha(final);
    if (ultima !== null && ultima !== "") this.push(ultima);
    pronto();
  }
}

/**
 * Restaura um arquivo de `pg_dump -Fc` num banco, numa transação só: ou a
 * cópia inteira entrou, ou nada entrou (`psql --single-transaction` com
 * `ON_ERROR_STOP`).
 */
export async function restaurarArquivo(entrada: {
  readonly arquivo: string;
  readonly urlDoDestino: string;
  readonly parametrosConhecidos: ReadonlySet<string>;
  readonly ambiente?: AmbienteDasFerramentas;
}): Promise<{ readonly parametrosRetirados: readonly string[] }> {
  const leitor = iniciar({
    ferramenta: "pg_restore",
    argumentos: ["--file=-", entrada.arquivo],
    ...(entrada.ambiente === undefined ? {} : { ambiente: entrada.ambiente }),
  });
  // `pg_restore --file=-` não fala com banco: só lê o arquivo e escreve o SQL.
  const escritor = iniciar({
    ferramenta: "psql",
    argumentos: [
      "--no-psqlrc",
      "--quiet",
      "--set=ON_ERROR_STOP=1",
      "--single-transaction",
      "--dbname",
    ],
    url: entrada.urlDoDestino,
    ...(entrada.ambiente === undefined ? {} : { ambiente: entrada.ambiente }),
  });
  escritor.filho.stdout.resume();
  leitor.filho.stdin.end();

  const filtro = new FiltroDeParametrosDesconhecidos(
    entrada.parametrosConhecidos,
  );
  leitor.filho.stdout.pipe(filtro).pipe(escritor.filho.stdin);
  // Se o `psql` parar no meio, o `pg_restore` recebe cano quebrado: o erro
  // que importa é o do `psql`, e ele chega por `escritor.fim`.
  escritor.filho.stdin.on("error", () => {});
  // E se o `psql` parou, ninguém mais lê o que o `pg_restore` escreve: ele
  // ficaria preso esperando o cano esvaziar. Termina junto.
  escritor.fim
    .catch(() => {})
    .finally(() => {
      if (leitor.filho.exitCode === null) leitor.filho.kill();
    });

  const [leitura, escrita] = await Promise.allSettled([
    leitor.fim,
    escritor.fim,
  ]);
  if (escrita.status === "rejected") throw escrita.reason;
  if (leitura.status === "rejected") throw leitura.reason;
  return { parametrosRetirados: filtro.retirados };
}
