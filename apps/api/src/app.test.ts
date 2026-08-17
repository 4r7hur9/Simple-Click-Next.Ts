import { describe, expect, it } from "vitest";
import request from "supertest";
import { criarApp, IDENTIFICACAO_DA_API } from "./app.ts";

/**
 * Quantos servidores de rede este processo tem abertos agora.
 *
 * É a medida direta de "escutar porta": um `listen` aparece como recurso
 * ativo do tipo `TCPSERVERWRAP`, e é isso que a composição não pode criar.
 */
function servidoresAbertos(): number {
  return process
    .getActiveResourcesInfo()
    .filter((recurso) => recurso === "TCPSERVERWRAP").length;
}

describe("esqueleto da API", () => {
  it("@spec:AC-001 responde na raiz dizendo que está viva", async () => {
    const resposta = await request(criarApp()).get("/");

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual(IDENTIFICACAO_DA_API);
    expect(resposta.body.status).toBe("viva");
  });

  it("@spec:AC-001 monta a aplicação sem escutar porta nenhuma", () => {
    const antes = servidoresAbertos();

    const app = criarApp();

    // Se `criarApp` chamasse `listen`, apareceria um servidor a mais aqui —
    // e a aplicação disputaria porta com o ambiente local a cada teste.
    expect(servidoresAbertos()).toBe(antes);
    // Quem decide a porta é a partida (`main.ts`), não a composição.
    expect(typeof app.listen).toBe("function");
  });

  it("@spec:AC-001 não anuncia a tecnologia do servidor", async () => {
    const resposta = await request(criarApp()).get("/");

    expect(resposta.headers["x-powered-by"]).toBeUndefined();
  });

  it("@spec:AC-001 responde rota desconhecida em JSON, sem rota de negócio montada", async () => {
    const resposta = await request(criarApp()).get("/v1/pedidos");

    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ erro: "nao_encontrado" });
  });
});
