/**
 * Sobe e derruba a API e o site do ensaio.
 *
 *   node tests/performance/ambiente/subir.ts subir  <smoke|carga|estresse>
 *   node tests/performance/ambiente/subir.ts parar  <smoke|carga|estresse>
 *
 * O site medido é o de PRODUÇÃO (build standalone), e não o `next dev`. A
 * ordem é fixa: API no ar → build do site → cópia de `public` (que já tem as
 * imagens que o seed gerou) e de `.next/static` → site. Os dois servidores
 * ficam em segundo plano; os PIDs vão para `saida/<etapa>/servidores.pid`, que
 * é como o `parar` (e o próximo `subir`) os encontra.
 */
import {
  type ChildProcess,
  execFile,
  spawn,
  spawnSync,
} from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { acharServidoresDeDesenvolvimento } from "../../../packages/database/seed/simulacao/aplicacao.ts";
import {
  ambientesDoEnsaio,
  esperar,
  etapaDoArgumento,
  gravarJson,
  lerJson,
  PORTA_DA_API,
  PORTA_DO_SITE,
  pastaDaSaida,
  RAIZ,
  URL_DA_API,
  URL_DO_SITE,
  type Etapa,
} from "./apoio.ts";

const executar = promisify(execFile);

interface Pids {
  api?: number | undefined;
  site?: number | undefined;
}

const arquivoDePids = (etapa: Etapa): string =>
  resolve(pastaDaSaida(etapa), "servidores.pid");

/** Cópia privada do site de produção da etapa (fora de `.next`, que outros builds apagam). */
const PASTA_DO_SITE = (etapa: Etapa): string =>
  resolve(pastaDaSaida(etapa), "site");

function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function encerrar(pid: number): Promise<void> {
  for (const sinal of ["SIGTERM", "SIGKILL"] as const) {
    if (!vivo(pid)) return;
    try {
      process.kill(-pid, sinal); // o grupo inteiro: o servidor foi iniciado "detached"
    } catch {
      try {
        process.kill(pid, sinal);
      } catch {
        /* já saiu */
      }
    }
    for (let i = 0; i < 20 && vivo(pid); i += 1) await esperar(500);
  }
}

async function parar(etapa: Etapa): Promise<void> {
  const caminho = arquivoDePids(etapa);
  const pids = lerJson<Pids>(caminho);
  if (pids === null) return;
  for (const pid of [pids.site, pids.api]) {
    if (pid !== undefined) await encerrar(pid);
  }
  rmSync(caminho, { force: true });
  rmSync(PASTA_DO_SITE(etapa), { recursive: true, force: true });
  process.stdout.write(`servidores da etapa ${etapa} encerrados.\n`);
}

async function portaLivre(porta: number): Promise<boolean> {
  return new Promise((aceitar) => {
    const servidor = createServer();
    servidor.once("error", () => aceitar(false));
    servidor.once("listening", () => servidor.close(() => aceitar(true)));
    servidor.listen(porta, "127.0.0.1");
  });
}

/** Recusa antes de gastar um build: porta ocupada, `next dev` do site ou e2e ativo. */
async function conferirQueOAmbienteEstaLivre(): Promise<void> {
  for (const porta of [PORTA_DA_API, PORTA_DO_SITE]) {
    if (!(await portaLivre(porta))) {
      throw new Error(
        `A porta ${porta} está ocupada: pare o que a usa antes do ensaio.`,
      );
    }
  }
  const { stdout } = await executar("ps", ["-axo", "pid=,command="]);
  const dev = acharServidoresDeDesenvolvimento(stdout, RAIZ);
  if (dev.length > 0) {
    // No Next 16 o `next dev` escreve em `.next/dev`, e o `next build` apaga
    // `.next` MENOS `dev`, `cache` e `lock`: os dois convivem. Só recusa se o
    // servidor de desenvolvimento usa a pasta `.next` inteira (Next mais antigo).
    if (existsSync(resolve(RAIZ, "apps/web/.next/dev"))) {
      process.stdout.write(
        `Aviso: há um servidor de desenvolvimento do site rodando (${dev[0]?.trim().split(/\s+/)[0]}); ele usa .next/dev, que o build preserva. Segue.\n`,
      );
    } else {
      throw new Error(
        `Há um servidor de desenvolvimento do site rodando (${dev[0]?.trim().split(/\s+/)[0]}): o build do ensaio usa a mesma pasta .next. Pare-o antes.`,
      );
    }
  }
  // O e2e (de qualquer card) também faz `next build` em apps/web/.next. Espera
  // uma janela sem ele (no CI nunca há um) em vez de gastar o seed e falhar.
  const processosDoE2e = (saida: string): string[] =>
    saida
      .split("\n")
      .filter((linha) =>
        /e2e\/iniciar-(site|api)\.mjs|playwright test/.test(linha),
      );
  const limite = Date.now() + 20 * 60_000;
  let avisou = false;
  let ps = stdout;
  while (processosDoE2e(ps).length > 0) {
    if (Date.now() > limite) {
      throw new Error(
        "O e2e continua rodando e usa a mesma pasta .next do site: espere ele terminar.",
      );
    }
    if (!avisou) {
      process.stdout.write(
        "… há um e2e rodando (mesma pasta .next); espero uma janela sem ele (até 20 min).\n",
      );
      avisou = true;
    }
    await esperar(5_000);
    ps = (await executar("ps", ["-axo", "pid=,command="])).stdout;
  }
}

async function esperarResposta(
  url: string,
  limiteMs: number,
  filho: ChildProcess,
  contem?: string,
): Promise<void> {
  const fim = Date.now() + limiteMs;
  let ultimo = "sem resposta";
  while (Date.now() < fim) {
    if (filho.exitCode !== null) {
      throw new Error(
        `O servidor encerrou (código ${filho.exitCode}) antes de responder em ${url}.`,
      );
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const corpo = contem === undefined ? "" : await r.text();
      if (r.status === 200 && (contem === undefined || corpo.includes(contem)))
        return;
      ultimo = `status ${r.status}${contem !== undefined && r.status === 200 ? ` sem "${contem}"` : ""}`;
    } catch (erro) {
      ultimo = erro instanceof Error ? erro.message : String(erro);
    }
    await esperar(1000);
  }
  throw new Error(
    `${url} não ficou pronto em ${limiteMs / 1000} s (${ultimo}).`,
  );
}

function iniciar(
  nome: string,
  argumentos: readonly string[],
  env: Record<string, string>,
  etapa: Etapa,
): ChildProcess {
  const log = openSync(resolve(pastaDaSaida(etapa), `${nome}.log`), "w");
  const filho = spawn(process.execPath, [...argumentos], {
    cwd: RAIZ,
    env,
    detached: true,
    stdio: ["ignore", log, log],
  });
  filho.unref();
  return filho;
}

function registrar(etapa: Etapa, parcial: Pids): void {
  const atual = lerJson<Pids>(arquivoDePids(etapa)) ?? {};
  gravarJson(arquivoDePids(etapa), { ...atual, ...parcial });
}

async function subir(etapa: Etapa): Promise<void> {
  await parar(etapa);
  await conferirQueOAmbienteEstaLivre();
  const { api, site } = ambientesDoEnsaio();
  const saida = pastaDaSaida(etapa);

  // 1. API.
  const filhoDaApi = iniciar("api", ["apps/api/src/main.ts"], api, etapa);
  registrar(etapa, { api: filhoDaApi.pid });
  await esperarResposta(`${URL_DA_API}/v1/health/ready`, 120_000, filhoDaApi);
  process.stdout.write(
    `✔ API no ar em ${URL_DA_API} (/v1/health/ready 200).\n`,
  );

  // 2. Build de produção do site, com a API do ensaio já respondendo.
  process.stdout.write("… build do site (pode levar alguns minutos).\n");
  const logDoBuild = openSync(resolve(saida, "build-site.log"), "w");
  const build = spawnSync("pnpm", ["--filter", "@simpleclick/web", "build"], {
    cwd: RAIZ,
    env: site,
    stdio: ["ignore", logDoBuild, logDoBuild],
  });
  if (build.status !== 0) {
    const fim = readFileSync(resolve(saida, "build-site.log"), "utf8")
      .split("\n")
      .slice(-25)
      .join("\n");
    throw new Error(
      `O build do site falhou (código ${build.status}). Fim do log:\n${fim}`,
    );
  }

  // 3. O standalone não leva `public` nem `.next/static`: sem a cópia, as
  // imagens do seed e o CSS respondem 404 (padrão de e2e/iniciar-site.mjs).
  // O standalone é MOVIDO para a pasta da etapa antes de tudo: o `next build`
  // de outro processo (o e2e de outro card, por exemplo) apaga `.next` e
  // derrubaria o site do ensaio no meio da medição. Os links simbólicos do
  // standalone são relativos a ele, então a pasta anda inteira.
  rmSync(PASTA_DO_SITE(etapa), { recursive: true, force: true });
  renameSync(resolve(RAIZ, "apps/web/.next/standalone"), PASTA_DO_SITE(etapa));
  const standalone = resolve(PASTA_DO_SITE(etapa), "apps/web");
  mkdirSync(resolve(standalone, ".next"), { recursive: true });
  cpSync(
    resolve(RAIZ, "apps/web/.next/static"),
    resolve(standalone, ".next/static"),
    { recursive: true },
  );
  cpSync(resolve(RAIZ, "apps/web/public"), resolve(standalone, "public"), {
    recursive: true,
  });
  if (!existsSync(resolve(standalone, "public/demo/simulacao"))) {
    throw new Error(
      "As imagens do seed (public/demo/simulacao) não estão no site: rode o seed antes do build.",
    );
  }

  // 4. O site.
  const filhoDoSite = iniciar(
    "site",
    [resolve(standalone, "server.js")],
    // 127.0.0.1 e não "localhost": no macOS o Node liga "localhost" só em IPv6
    // (::1) e o k6 resolve "localhost" só para IPv4, então o site ficaria
    // invisível para a medição (connection refused) mesmo respondendo ao Node.
    { ...site, HOSTNAME: "127.0.0.1", PORT: String(PORTA_DO_SITE) },
    etapa,
  );
  registrar(etapa, { site: filhoDoSite.pid });
  // A página da loja só traz o nome se o site estiver lendo a API DESTE ensaio.
  await esperarResposta(
    `${URL_DO_SITE}/loja/cozinha-do-benfica`,
    120_000,
    filhoDoSite,
    "Cozinha do Benfica",
  );
  process.stdout.write(
    `✔ site no ar em ${URL_DO_SITE}, lendo a API do ensaio.\n`,
  );
}

const [comando, argumentoDaEtapa] = process.argv.slice(2);
try {
  const etapa = etapaDoArgumento(argumentoDaEtapa);
  if (comando === "subir") await subir(etapa);
  else if (comando === "parar") await parar(etapa);
  else throw new Error("Uso: subir.ts <subir|parar> <smoke|carga|estresse>");
} catch (erro) {
  process.stderr.write(
    `${erro instanceof Error ? erro.message : String(erro)}\n`,
  );
  if (comando === "subir") {
    try {
      await parar(etapaDoArgumento(argumentoDaEtapa));
    } catch {
      /* nada a encerrar */
    }
  }
  process.exitCode = 1;
}
