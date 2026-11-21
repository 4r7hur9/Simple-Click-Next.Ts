import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const ambiente = {
  ...process.env,
  // O .env do repositório é o de DESENVOLVIMENTO (NODE_ENV=development), e nele
  // o login do dono pula o segundo fator por e-mail. O ponta a ponta prova o
  // segundo fator de verdade, então a API sobe como "test".
  NODE_ENV: "test",
  PORT: "3101",
  API_PORT: "3101",
  ORIGENS_PERMITIDAS: "http://localhost:3100",
  URL_DO_SITE: "http://localhost:3100",
  // O contrato e os documentos da loja (T-205, T-209) precisam de onde
  // guardar. Uma pasta temporária por execução: o ponta a ponta não deixa
  // arquivo para a próxima, e o armazenamento de produção (D2b) não entra aqui.
  ARMAZENAMENTO_PRIVADO_DIR:
    process.env.ARMAZENAMENTO_PRIVADO_DIR ??
    mkdtempSync(join(tmpdir(), "sc-e2e-privado-")),
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
