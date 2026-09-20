import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const comando = "pnpm";
const ambiente = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_API_URL: "http://localhost:3101",
  URL_DO_SITE: "http://localhost:3100",
};

const build = spawnSync(comando, ["--filter", "@simpleclick/web", "build"], {
  cwd: raiz,
  env: ambiente,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

// O standalone não leva `public` nem `.next/static` consigo. Sem esta cópia o
// HTML chega ao navegador, mas CSS, fontes e chunks respondem 404 — o que
// transforma um teste de acessibilidade em um teste acidental do estilo nativo.
const raizStandalone = resolve(raiz, "apps/web/.next/standalone/apps/web");
mkdirSync(resolve(raizStandalone, ".next"), { recursive: true });
cpSync(
  resolve(raiz, "apps/web/.next/static"),
  resolve(raizStandalone, ".next/static"),
  { recursive: true },
);
cpSync(resolve(raiz, "apps/web/public"), resolve(raizStandalone, "public"), {
  recursive: true,
});

const processo = spawn(
  process.execPath,
  [resolve(raiz, "apps/web/.next/standalone/apps/web/server.js")],
  {
    cwd: raiz,
    env: { ...ambiente, HOSTNAME: "localhost", PORT: "3100" },
    stdio: "inherit",
  },
);

const encerrar = (sinal) => processo.kill(sinal);
process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));

processo.on("error", (erro) => {
  console.error("não foi possível iniciar o site E2E", erro);
  process.exit(1);
});

processo.on("exit", (codigo, sinal) => {
  if (sinal !== null) process.exit(1);
  process.exit(codigo ?? 1);
});
