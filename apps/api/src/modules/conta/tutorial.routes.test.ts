import express from "express";
import { describe, expect, it } from "vitest";

import {
  criarRotasDoTutorial,
  esquemaDaMarcacao,
  vistosConhecidos,
} from "./tutorial.routes.ts";

describe("tutorial de primeiro acesso", () => {
  it("devolve só os papéis conhecidos, sem repetir, na ordem fixa", () => {
    expect(vistosConhecidos(["equipe", "x", "cliente", "equipe"])).toEqual([
      "cliente",
      "equipe",
    ]);
    expect(vistosConhecidos(null)).toEqual([]);
  });

  it("aceita concluir ou pular um papel conhecido e recusa o resto", () => {
    expect(esquemaDaMarcacao.safeParse({ papel: "dono", como: "pulou" }).success).toBe(true);
    expect(esquemaDaMarcacao.safeParse({ papel: "admin", como: "pulou" }).success).toBe(false);
    expect(esquemaDaMarcacao.safeParse({ papel: "dono", como: "talvez" }).success).toBe(false);
    expect(
      esquemaDaMarcacao.safeParse({ papel: "dono", como: "pulou", extra: 1 }).success,
    ).toBe(false);
  });

  it("sem sessão responde 401 sem tocar no banco", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/v1/conta",
      criarRotasDoTutorial({
        autenticar: () => null,
        acesso: {
          emTransacao: () => Promise.reject(new Error("não devia chamar o banco")),
          encerrar: () => Promise.resolve(),
        },
      }),
    );
    const servidor = app.listen(0);
    try {
      const endereco = servidor.address();
      const porta = typeof endereco === "object" && endereco !== null ? endereco.port : 0;
      const resposta = await fetch(`http://127.0.0.1:${porta}/v1/conta/tutorial`);
      expect(resposta.status).toBe(401);
      expect(resposta.headers.get("cache-control")).toBe("no-store");
    } finally {
      servidor.close();
    }
  });
});
