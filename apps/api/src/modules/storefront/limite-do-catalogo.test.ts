import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { CacheDoLimite } from "../../core/limite.ts";
import {
  criarLimitadorDoCatalogo,
  regraDoCatalogoDoAmbiente,
} from "./limite-do-catalogo.ts";

describe("limite das consultas públicas do catálogo", () => {
  it("usa valores padrão e aceita configuração positiva", () => {
    expect(regraDoCatalogoDoAmbiente({})).toEqual({
      limite: 60,
      janelaMs: 60_000,
      esperaBaseMs: 60_000,
      esperaMaximaMs: 900_000,
    });
    expect(
      regraDoCatalogoDoAmbiente({
        VITRINE_CATALOGO_LIMITE: "24",
        VITRINE_CATALOGO_JANELA_MS: "30000",
        VITRINE_CATALOGO_ESPERA_MS: "45000",
      }),
    ).toEqual({
      limite: 24,
      janelaMs: 30_000,
      esperaBaseMs: 45_000,
      esperaMaximaMs: 900_000,
    });
  });

  it("responde 429 com Retry-After para IP acima da cota", async () => {
    const executarScript = vi.fn(async () => [1, 2501, 0, 1, 0]);
    const cache: CacheDoLimite = { executarScript };
    const middleware = criarLimitadorDoCatalogo(
      cache,
      { VITRINE_CATALOGO_LIMITE: "3" } as NodeJS.ProcessEnv,
    );
    let finalizar: (resposta: {
      status: number;
      cabecalhos: Record<string, string>;
      corpo: unknown;
    }) => void = () => {};
    const terminou = new Promise<{
      status: number;
      cabecalhos: Record<string, string>;
      corpo: unknown;
    }>((resolver) => {
      finalizar = resolver;
    });
    const cabecalhos: Record<string, string> = {};
    let status = 200;
    const resposta = {
      setHeader(nome: string, valor: string) {
        cabecalhos[nome] = valor;
        return this;
      },
      status(valor: number) {
        status = valor;
        return this;
      },
      json(corpo: unknown) {
        finalizar({ status, cabecalhos, corpo });
        return this;
      },
    };
    const requisicao = {
      headers: { "x-forwarded-for": "203.0.113.8" },
      socket: { remoteAddress: "127.0.0.1" },
    };
    middleware(
      requisicao as unknown as Request,
      resposta as unknown as Response,
      vi.fn(),
    );

    const devolvida = await terminou;
    expect(devolvida.status).toBe(429);
    expect(devolvida.cabecalhos["Retry-After"]).toBe("3");
    expect(devolvida.corpo).toMatchObject({
      erro: "muitas_tentativas",
      escopo: "origem",
      esperaSegundos: 3,
    });
    expect(executarScript).toHaveBeenCalledOnce();
  });
});
