import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createServer } from "node:net";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

/** Processo da API subido pelo teste: sem entrada, com saída e erro em mãos. */
type ProcessoDaApi = ChildProcessByStdio<null, Readable, Readable>;

const CAMINHO_DO_MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

/** Pede ao sistema uma porta livre, para o teste não disputar com o ambiente. */
async function portaLivre(): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const servidor = createServer();
    servidor.on("error", rejeitar);
    servidor.listen(0, "127.0.0.1", () => {
      const endereco = servidor.address();
      if (endereco === null || typeof endereco === "string") {
        servidor.close();
        rejeitar(new Error("não foi possível descobrir uma porta livre"));
        return;
      }
      const { port } = endereco;
      servidor.close(() => resolver(port));
    });
  });
}

/**
 * Sobe a API como o ambiente sobe: `node src/main.ts`, sem transpilador.
 * É o mesmo caminho que o desenvolvimento e o contêiner usam.
 */
function subirApi(ambiente: Record<string, string>): ProcessoDaApi {
  return spawn(process.execPath, [CAMINHO_DO_MAIN], {
    env: { ...process.env, ...ambiente },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Espera a saída do processo conter o trecho, ou desiste no prazo. */
function esperarSaida(
  processo: ProcessoDaApi,
  canal: "stdout" | "stderr",
  trecho: string,
  prazoMs = 15000,
): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    let acumulado = "";
    const relogio = setTimeout(() => {
      rejeitar(
        new Error(`prazo esgotado esperando "${trecho}". Saída: ${acumulado}`),
      );
    }, prazoMs);

    processo[canal].on("data", (pedaco: Buffer) => {
      acumulado += pedaco.toString();
      if (acumulado.includes(trecho)) {
        clearTimeout(relogio);
        resolver(acumulado);
      }
    });
  });
}

let emExecucao: ProcessoDaApi | undefined;

afterEach(() => {
  emExecucao?.kill("SIGKILL");
  emExecucao = undefined;
});

describe("partida da API", () => {
  it("@spec:AC-001 sobe no endereço local e responde que está viva", async () => {
    const porta = await portaLivre();
    const api = subirApi({ API_PORT: String(porta) });
    emExecucao = api;

    await esperarSaida(api, "stdout", `ouvindo na porta ${porta}`);
    const resposta = await fetch(`http://127.0.0.1:${porta}/`);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ status: "viva" });
  }, 30000);

  it("@spec:AC-001 recusa subir quando a porta configurada não é porta válida", async () => {
    const api = subirApi({ API_PORT: "porta-errada" });
    emExecucao = api;

    const erro = await esperarSaida(api, "stderr", "API_PORT inválida");
    const codigo = await new Promise<number | null>((resolver) => {
      api.on("exit", resolver);
    });

    // Falhar na partida nomeando a variável é melhor do que subir num número
    // inesperado e ninguém achar a API.
    expect(erro).toContain("API_PORT inválida");
    expect(codigo).not.toBe(0);
  }, 30000);
});
