import { spawn } from "node:child_process";
import { resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const ambiente = {
  ...process.env,
  PORT: "3101",
  API_PORT: "3101",
  ORIGENS_PERMITIDAS: "http://localhost:3100",
  URL_DO_SITE: "http://localhost:3100",
};

const processo = spawn(
  process.execPath,
  ["--env-file=.env", "apps/api/src/main.ts"],
  { cwd: raiz, env: ambiente, stdio: "inherit" },
);

const encerrar = (sinal) => processo.kill(sinal);
process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));

processo.on("error", (erro) => {
  console.error("não foi possível iniciar a API E2E", erro);
  process.exit(1);
});

async function esperar(ms) {
  await new Promise((resolveEspera) => setTimeout(resolveEspera, ms));
}

async function aquecer() {
  const rotas = [
    "http://localhost:3101/",
    "http://localhost:3101/v1/vitrine/pastelaria-da-vila",
    "http://localhost:3101/v1/vitrine/pastelaria-da-vila/catalogo",
  ];

  // No Windows, o primeiro carregamento do TypeScript e a abertura das
  // conexões com PostgreSQL/Redis podem ultrapassar 15 s. Mantemos a sondagem
  // curta, mas damos à API o mesmo minuto previsto no Playwright antes de
  // concluir que o ambiente realmente não subiu.
  for (let tentativa = 0; tentativa < 240; tentativa += 1) {
    try {
      const respostas = await Promise.all(rotas.map((rota) => fetch(rota)));
      if (respostas.every((resposta) => resposta.ok)) return;
    } catch {
      // A API ainda está subindo; a próxima tentativa cobre esse intervalo.
    }
    await esperar(250);
  }

  console.error(
    "a API E2E não ficou pronta em 60 s após aquecer as rotas públicas",
  );
  encerrar("SIGTERM");
  process.exit(1);
}

void aquecer();

processo.on("exit", (codigo, sinal) => {
  if (sinal !== null) process.exit(1);
  process.exit(codigo ?? 1);
});
