/**
 * Sobe a API (:3201) e o site (`next dev`, :3200) apontados para a base da
 * simulação, para a validação da aplicação e para o k6 (D-10).
 *
 *   pnpm --filter @simpleclick/database seed:simulacao:aplicacao
 *
 * Cuidados (todos testados em `validar.test.ts`):
 * - a MESMA guarda de banco da carga (`montarAlvo`): só `simpleclick_simulacao`;
 * - o ambiente dos servidores é montado do zero, sem herdar o do terminal: só
 *   o banco da simulação, o Redis no índice /5 (local), segredos aleatórios só
 *   na memória, trabalhos de segundo plano desligados;
 * - recusa se houver `DATABASE_URL_ADMINISTRACAO` no ambiente (apontaria a
 *   administração para outro banco);
 * - recusa se já houver um `next dev` do `apps/web` rodando (dois servidores de
 *   desenvolvimento brigam pela pasta `.next`); não mexe no `next.config`;
 * - antes de dizer "pronto", confere que API e site servem a loja
 *   `cozinha-do-benfica`, que não existe na base de desenvolvimento.
 *
 * Fica em primeiro plano até Ctrl+C. Os registros dos servidores vão para a
 * pasta temporária do sistema (podem ter dados de login), não para `saida/`.
 */

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  type Ambiente,
  analisarUrlDeRedis,
  ErroDeGuarda,
  montarAlvo,
  urlDoBanco,
} from "./banco.ts";
import {
  ErroDeParametros,
  lerParametrosDaAplicacao,
  mascararUrl,
  type ParametrosDaAplicacao,
} from "./parametros.ts";

const executar = promisify(execFile);

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LOJA_DE_CONFERENCIA = "cozinha-do-benfica";
/** Índice do Redis da simulação (a dev usa o 0 e os testes o 1). */
export const INDICE_DO_REDIS = 5;

// ---------------------------------------------------------------------------
// Ambiente dos servidores (puro)
// ---------------------------------------------------------------------------

export interface AmbientesDosServidores {
  readonly api: Readonly<Record<string, string>>;
  readonly site: Readonly<Record<string, string>>;
}

/** O Redis da simulação: o mesmo servidor local, índice /5. */
export function urlDoRedisDaSimulacao(redis: string): string {
  const url = analisarUrlDeRedis("REDIS_URL", redis);
  url.pathname = `/${INDICE_DO_REDIS}`;
  return url.toString();
}

/**
 * Monta, do zero, o ambiente da API e o do site. Lança `ErroDeGuarda` se o
 * ambiente do terminal não passar na guarda.
 */
export function montarAmbientesDosServidores(
  env: Ambiente,
  parametros: Pick<ParametrosDaAplicacao, "banco" | "portaDaApi" | "portaDoSite">,
): AmbientesDosServidores {
  const alvo = montarAlvo(env, parametros.banco);
  if ((env.DATABASE_URL_ADMINISTRACAO ?? "").trim() !== "") {
    throw new ErroDeGuarda(
      "DATABASE_URL_ADMINISTRACAO está definida no ambiente: ela apontaria a administração da API para outro banco. Remova-a do .env desta execução.",
    );
  }
  const urlDaAplicacao = env.DATABASE_URL?.trim();
  if (urlDaAplicacao === undefined || urlDaAplicacao === "") {
    throw new ErroDeGuarda("DATABASE_URL precisa estar definida no ambiente (.env da raiz).");
  }
  const redis = env.REDIS_URL?.trim();
  if (redis === undefined || redis === "") {
    throw new ErroDeGuarda("REDIS_URL precisa estar definida no ambiente (.env da raiz).");
  }
  const urlDoSite = `http://localhost:${parametros.portaDoSite}`;
  const urlDaApi = `http://localhost:${parametros.portaDaApi}`;
  const segredoDeRevalidacao = randomBytes(36).toString("base64url");
  const segredoDaPonte = randomBytes(36).toString("base64url");

  const comum = {
    NODE_ENV: "development",
    DATABASE_URL: urlDoBanco(urlDaAplicacao, parametros.banco),
    DATABASE_URL_DIRETA: alvo.urlDoMigrador,
    REDIS_URL: urlDoRedisDaSimulacao(redis),
    // A API exige um DATABASE_URL_TEST diferente do da aplicação. Aponta para
    // um banco da simulação que não existe: nunca para a base de teste real.
    DATABASE_URL_TEST: urlDoBanco(urlDaAplicacao, `${parametros.banco}_teste`),
    REDIS_URL_TEST: urlDoRedisDaSimulacao(redis),
    SENHA_BANCO_MIGRADOR: alvo.senhas.migrador,
    SENHA_BANCO_APLICACAO: alvo.senhas.aplicacao,
    SENHA_BANCO_ADMINISTRACAO: alvo.senhas.administracao,
    URL_DO_SITE: urlDoSite,
    NEXT_PUBLIC_API_URL: urlDaApi,
    SEGREDO_DE_REVALIDACAO: segredoDeRevalidacao,
    SEGREDO_DA_PONTE: segredoDaPonte,
  } as const;
  const basico: Record<string, string> = {};
  for (const nome of ["PATH", "HOME", "TMPDIR", "LANG", "SHELL", "USER"]) {
    const valor = env[nome];
    if (valor !== undefined) basico[nome] = valor;
  }
  // Limite do catálogo público (60/min por endereço): só muda se quem roda
  // pedir no terminal (ex.: o k6 vindo de um endereço só).
  const limites: Record<string, string> = {};
  for (const nome of ["VITRINE_CATALOGO_LIMITE", "VITRINE_CATALOGO_JANELA_MS", "VITRINE_CATALOGO_ESPERA_MS"]) {
    const valor = env[nome]?.trim();
    if (valor !== undefined && valor !== "") limites[nome] = valor;
  }
  return {
    api: {
      ...basico,
      ...comum,
      PORT: String(parametros.portaDaApi),
      LOG_LEVEL: "warn",
      // Aleatório e só na memória: nenhum token de outra execução vale aqui.
      JWT_SECRET: randomBytes(48).toString("base64"),
      ORIGENS_PERMITIDAS: `${urlDoSite},http://127.0.0.1:${parametros.portaDoSite}`,
      SEGUNDO_PLANO: "desligado",
      ...limites,
    },
    site: {
      ...basico,
      ...comum,
      PORT: String(parametros.portaDoSite),
      // O next.config carrega o .env da raiz para o que NÃO estiver aqui: as
      // variáveis de banco e de Redis acima já impedem que a da dev entre.
    },
  };
}

// ---------------------------------------------------------------------------
// Servidor de desenvolvimento já rodando
// ---------------------------------------------------------------------------

/** Linhas de `ps` que parecem um `next dev` do site. Puro, para o teste. */
export function acharServidoresDeDesenvolvimento(
  saidaDoPs: string,
  raiz: string,
): string[] {
  return saidaDoPs
    .split("\n")
    .map((linha) => linha.trim())
    .filter(
      (linha) =>
        linha !== "" &&
        /(^|[\s/])next(-server)?(\s|$)|next\/dist\/bin\/next|next-server/.test(linha) &&
        /\bdev\b|next-server/.test(linha) &&
        linha.includes(raiz),
    );
}

async function exigirSemServidorDeDesenvolvimento(): Promise<void> {
  const ps = await executar("ps", ["-axo", "pid=,command="]);
  const achados = acharServidoresDeDesenvolvimento(ps.stdout, resolve(RAIZ, "apps/web"));
  if (achados.length > 0) {
    throw new ErroDeGuarda(
      `Já há um servidor de desenvolvimento do site rodando (${achados[0]!.split(/\s+/)[0]}): pare-o antes. Dois next dev na mesma pasta .next se atrapalham.`,
    );
  }
  const trava = resolve(RAIZ, "apps/web/.next/dev/lock");
  if (existsSync(trava)) {
    let vivo = false;
    try {
      const pid = Number(
        (JSON.parse(readFileSync(trava, "utf8")) as { pid?: number }).pid,
      );
      if (Number.isInteger(pid) && pid > 0) {
        process.kill(pid, 0);
        vivo = true;
      }
    } catch {
      vivo = false;
    }
    if (vivo) {
      throw new ErroDeGuarda("O site tem uma trava de desenvolvimento ativa (.next/dev/lock): pare o next dev antes.");
    }
  }
}

// ---------------------------------------------------------------------------
// Servidores
// ---------------------------------------------------------------------------

async function portaLivre(porta: number): Promise<boolean> {
  const { createServer } = await import("node:net");
  return new Promise((aceitar) => {
    const servidor = createServer();
    servidor.once("error", () => aceitar(false));
    servidor.once("listening", () => servidor.close(() => aceitar(true)));
    servidor.listen(porta, "127.0.0.1");
  });
}

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function esperarResposta(
  url: string,
  limiteMs: number,
  servidor: ChildProcess,
): Promise<Response> {
  const fim = Date.now() + limiteMs;
  let ultimo = "sem resposta";
  while (Date.now() < fim) {
    if (servidor.exitCode !== null) {
      throw new Error(`O servidor encerrou (código ${servidor.exitCode}) antes de responder.`);
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (r.status === 200) return r;
      ultimo = `HTTP ${r.status}`;
    } catch (erro) {
      ultimo = erro instanceof Error ? erro.message : String(erro);
    }
    await esperar(1500);
  }
  throw new Error(`${url} não ficou pronto em ${limiteMs / 1000}s (${ultimo}).`);
}

function subir(
  rotulo: string,
  comando: string,
  argumentos: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>>,
): ChildProcess {
  const registro = resolve(tmpdir(), `simulacao-${rotulo}.log`);
  const arquivo = createWriteStream(registro, { flags: "w" });
  const filho = spawn(comando, [...argumentos], { cwd, env: { ...env }, stdio: ["ignore", "pipe", "pipe"] });
  filho.stdout?.pipe(arquivo);
  filho.stderr?.pipe(arquivo);
  process.stdout.write(`  ${rotulo}: registro em ${registro}\n`);
  return filho;
}

async function principal(argv: readonly string[]): Promise<number> {
  const escrever = (linha: string): void => {
    process.stdout.write(`${linha}\n`);
  };
  let parametros: ParametrosDaAplicacao;
  try {
    parametros = lerParametrosDaAplicacao(argv);
  } catch (erro) {
    if (erro instanceof ErroDeParametros) {
      process.stderr.write(`${erro.message}\n`);
      return 2;
    }
    throw erro;
  }

  const filhos: ChildProcess[] = [];
  const encerrar = (): void => {
    for (const filho of filhos) {
      if (filho.exitCode === null) filho.kill("SIGTERM");
    }
  };
  process.on("SIGINT", () => {
    encerrar();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    encerrar();
    process.exit(0);
  });

  try {
    const ambientes = montarAmbientesDosServidores(process.env, parametros);
    escrever(`Base da simulação: ${mascararUrl(ambientes.api["DATABASE_URL_DIRETA"]!)}`);
    escrever(`API (aplicação): ${mascararUrl(ambientes.api["DATABASE_URL"]!)}; Redis: ${mascararUrl(ambientes.api["REDIS_URL"]!)}`);
    await exigirSemServidorDeDesenvolvimento();
    for (const porta of [parametros.portaDaApi, parametros.portaDoSite]) {
      if (!(await portaLivre(porta))) {
        throw new ErroDeGuarda(`A porta ${porta} já está em uso.`);
      }
    }

    const api = subir("api", process.execPath, ["src/main.ts"], resolve(RAIZ, "apps/api"), ambientes.api);
    filhos.push(api);
    const urlDaApi = `http://localhost:${parametros.portaDaApi}`;
    const respostaDaApi = await esperarResposta(`${urlDaApi}/v1/vitrine/${LOJA_DE_CONFERENCIA}`, 120_000, api);
    const corpo = (await respostaDaApi.json()) as { loja?: { apelido?: string } };
    if (corpo.loja?.apelido !== LOJA_DE_CONFERENCIA) {
      throw new ErroDeGuarda("A API respondeu, mas não é a da simulação (a loja de conferência não veio).");
    }
    escrever(`✔ API no ar em ${urlDaApi}, servindo ${LOJA_DE_CONFERENCIA}.`);

    const site = subir(
      "site",
      process.execPath,
      [resolve(RAIZ, "apps/web/node_modules/next/dist/bin/next"), "dev", "-p", String(parametros.portaDoSite), "-H", "localhost"],
      resolve(RAIZ, "apps/web"),
      ambientes.site,
    );
    filhos.push(site);
    const urlDoSite = `http://localhost:${parametros.portaDoSite}`;
    await esperarResposta(`${urlDoSite}/loja/${LOJA_DE_CONFERENCIA}`, 300_000, site);
    escrever(`✔ site no ar em ${urlDoSite}, servindo /loja/${LOJA_DE_CONFERENCIA} da base da simulação.`);
    escrever(`Pronto. Valide com: pnpm --filter @simpleclick/database seed:simulacao:validar -- --site ${urlDoSite} --api ${urlDaApi}`);
    escrever("Ctrl+C encerra os dois servidores.");

    await new Promise<void>((aceitar) => {
      for (const filho of filhos) filho.once("exit", () => aceitar());
    });
    encerrar();
    return 1;
  } catch (erro) {
    encerrar();
    process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`);
    return 1;
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal(process.argv.slice(2));
}
