import { describe, expect, it } from "vitest";

import {
  alterarApelido,
  type RepositorioDoApelido,
} from "./alterar-apelido.usecase.ts";

/** Repositório em memória: a loja atual e os apelidos das outras lojas. */
function repositorio(atual: string | null, deOutras: readonly string[] = []) {
  const gravados: { antigo: string; novo: string }[] = [];
  const registrados: Parameters<RepositorioDoApelido["registrar"]>[0][] = [];
  const repo: RepositorioDoApelido = {
    lerApelidoAtual: async () => atual,
    apelidosDeOutraLoja: async (_lojaId, candidatos) =>
      new Set(
        candidatos
          .map((candidato) => candidato.toLowerCase())
          .filter((candidato) => deOutras.includes(candidato)),
      ),
    gravarApelido: async (_lojaId, troca) => {
      gravados.push(troca);
    },
    registrar: async (ato) => {
      registrados.push(ato);
    },
  };
  return { repo, gravados, registrados };
}

const semSugestao = async () => null;

describe("troca do apelido da loja (AC-208)", () => {
  it("@spec:AC-208 troca o apelido guardando o antigo e registra de qual para qual", async () => {
    const { repo, gravados, registrados } = repositorio("pastel-da-joi");

    const resultado = await alterarApelido(
      "loja-1",
      "pastelaria-joi",
      "admin-1",
      { repositorio: repo, sugerir: semSugestao },
    );

    expect(resultado).toEqual({
      ok: true,
      mudou: true,
      antigo: "pastel-da-joi",
      novo: "pastelaria-joi",
    });
    expect(gravados).toEqual([
      { antigo: "pastel-da-joi", novo: "pastelaria-joi" },
    ]);
    expect(registrados).toEqual([
      {
        lojaId: "loja-1",
        atorId: "admin-1",
        acao: "APELIDO_ALTERADO",
        antes: { campos: { apelido: "pastel-da-joi" } },
        depois: { campos: { apelido: "pastelaria-joi" } },
      },
    ]);
  });

  it("@spec:AC-208 apelido de outra loja — atual ou antigo — é recusado com uma variação livre sugerida, sem gravar nada", async () => {
    const { repo, gravados, registrados } = repositorio("pastel-da-joi", [
      "pastelaria-joi",
    ]);

    const resultado = await alterarApelido(
      "loja-1",
      "pastelaria-joi",
      "admin-1",
      { repositorio: repo, sugerir: async (base) => `${base}-2` },
    );

    expect(resultado).toEqual({
      ok: false,
      motivo: "APELIDO_EM_USO",
      sugestao: "pastelaria-joi-2",
    });
    expect(gravados).toEqual([]);
    expect(registrados).toEqual([]);
  });

  it("@spec:AC-208 pedir o apelido que a loja já tem não grava nem registra, e loja inexistente não grava", async () => {
    const mesma = repositorio("pastel-da-joi");
    expect(
      await alterarApelido("loja-1", "pastel-da-joi", "admin-1", {
        repositorio: mesma.repo,
        sugerir: semSugestao,
      }),
    ).toMatchObject({ ok: true, mudou: false });
    expect(mesma.gravados).toEqual([]);
    expect(mesma.registrados).toEqual([]);

    const nenhuma = repositorio(null);
    expect(
      await alterarApelido("loja-x", "novo-endereco", "admin-1", {
        repositorio: nenhuma.repo,
        sugerir: semSugestao,
      }),
    ).toEqual({ ok: false, motivo: "NAO_ENCONTRADA" });
    expect(nenhuma.gravados).toEqual([]);
  });
});
