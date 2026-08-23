import { describe, expect, it } from "vitest";

import {
  encerrarSessaoAtual,
  encerrarTodasAsSessoes,
  type RepositorioDeSessoes,
} from "./logout.usecase.ts";

function criarRepositorioDeSessoes() {
  const revogadas = new Set<string>();
  const sessoesPorIdentidade = new Map<string, string[]>([
    [
      "identidade-1",
      ["sessao-deste-dispositivo", "sessao-do-outro-dispositivo"],
    ],
  ]);

  const repositorio: RepositorioDeSessoes = {
    async revogarSessao(idDaSessao) {
      revogadas.add(idDaSessao);
    },
    async revogarSessoesDaIdentidade(idDaIdentidade) {
      for (const idDaSessao of sessoesPorIdentidade.get(idDaIdentidade) ?? []) {
        revogadas.add(idDaSessao);
      }
    },
  };

  return {
    repositorio,
    renovar(idDaSessao: string): boolean {
      return !revogadas.has(idDaSessao);
    },
  };
}

describe("encerramento de sessão", () => {
  it("@spec:AC-112 sair revoga a sessão atual no servidor e o token anterior não renova acesso", async () => {
    const { repositorio, renovar } = criarRepositorioDeSessoes();

    await encerrarSessaoAtual("sessao-deste-dispositivo", repositorio);

    expect(renovar("sessao-deste-dispositivo")).toBe(false);
  });

  it("@spec:AC-113 encerrar todas as sessões revoga a atual e a de outro dispositivo", async () => {
    const { repositorio, renovar } = criarRepositorioDeSessoes();

    await encerrarTodasAsSessoes("identidade-1", repositorio);

    expect(renovar("sessao-deste-dispositivo")).toBe(false);
    expect(renovar("sessao-do-outro-dispositivo")).toBe(false);
  });
});
