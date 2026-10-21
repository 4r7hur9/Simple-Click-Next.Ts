import { describe, expect, it } from "vitest";

import {
  alterarFuncionalidade,
  lerFuncionalidadesDaLoja,
  type ExcecaoGravada,
  type LojaDasFuncionalidades,
  type RepositorioDasFuncionalidades,
} from "./funcionalidades.usecase.ts";

const LOJA = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-0000000000aa";

function repositorioFalso(loja: LojaDasFuncionalidades | null) {
  const excecoes = new Map<string, ExcecaoGravada>();
  const trilha: Parameters<RepositorioDasFuncionalidades["registrar"]>[0][] =
    [];
  const repositorio: RepositorioDasFuncionalidades = {
    lerLoja: async () => loja,
    lerExcecoes: async () => [...excecoes.values()],
    gravarExcecao: async (excecao) => {
      excecoes.set(excecao.chave, {
        chave: excecao.chave,
        ligada: excecao.ligada,
        limite: null,
        motivo: excecao.motivo,
        definidaEm: new Date("2026-10-06T12:00:00Z"),
        definidaPor: { id: excecao.atorId, nome: "Administradora" },
      });
    },
    apagarExcecao: async (_lojaId, chave) => {
      excecoes.delete(chave);
    },
    registrar: async (registro) => {
      trilha.push(registro);
    },
  };
  return { repositorio, excecoes, trilha };
}

const NO_AR: LojaDasFuncionalidades = {
  id: LOJA,
  nome: "Pastelaria",
  excluida: false,
};

describe("funcionalidades por loja na administração", () => {
  it("@spec:AC-213 a loja sem exceção tem todas ligadas, sem limite e sem exceção gravada", async () => {
    const { repositorio } = repositorioFalso(NO_AR);

    const lidas = await lerFuncionalidadesDaLoja(LOJA, repositorio);

    expect(lidas?.loja).toEqual({ id: LOJA, nome: "Pastelaria" });
    expect(lidas?.funcionalidades.length).toBeGreaterThan(0);
    for (const item of lidas?.funcionalidades ?? []) {
      expect(item).toMatchObject({ ligada: true, limite: null, excecao: null });
    }
  });

  it("@spec:AC-212 desligar grava a exceção com o motivo e registra na trilha", async () => {
    const { repositorio, excecoes, trilha } = repositorioFalso(NO_AR);

    const resultado = await alterarFuncionalidade(
      {
        lojaId: LOJA,
        chave: "auto_print",
        ligada: false,
        motivo: "Impressora devolvida",
        atorId: ADMIN,
      },
      repositorio,
    );

    expect(resultado.ok).toBe(true);
    expect(excecoes.get("auto_print")?.ligada).toBe(false);
    const impressao = resultado.ok
      ? resultado.funcionalidades.funcionalidades.find(
          (item) => item.chave === "auto_print",
        )
      : undefined;
    expect(impressao).toMatchObject({
      ligada: false,
      excecao: { motivo: "Impressora devolvida" },
    });
    expect(trilha).toEqual([
      {
        lojaId: LOJA,
        atorId: ADMIN,
        acao: "FUNCIONALIDADE_DESLIGADA",
        antes: { funcionalidade: "Impressão térmica", ligada: true },
        depois: {
          funcionalidade: "Impressão térmica",
          ligada: false,
          motivo: "Impressora devolvida",
        },
      },
    ]);
  });

  it("@spec:AC-212 religar apaga a exceção (volta ao padrão) e registra; repetir o estado não grava nada", async () => {
    const { repositorio, excecoes, trilha } = repositorioFalso(NO_AR);
    const pedido = {
      lojaId: LOJA,
      chave: "auto_print",
      motivo: "Ajuste",
      atorId: ADMIN,
    };

    await alterarFuncionalidade({ ...pedido, ligada: false }, repositorio);
    await alterarFuncionalidade({ ...pedido, ligada: true }, repositorio);
    await alterarFuncionalidade({ ...pedido, ligada: true }, repositorio);

    expect(excecoes.size).toBe(0);
    expect(trilha.map((registro) => registro.acao)).toEqual([
      "FUNCIONALIDADE_DESLIGADA",
      "FUNCIONALIDADE_RELIGADA",
    ]);
  });

  it("@spec:AC-212 recusa chave desconhecida, chave sem efeito, loja inexistente e loja excluída", async () => {
    const pedido = {
      lojaId: LOJA,
      ligada: false,
      motivo: "Teste",
      atorId: ADMIN,
    };

    expect(
      await alterarFuncionalidade(
        { ...pedido, chave: "inventada" },
        repositorioFalso(NO_AR).repositorio,
      ),
    ).toEqual({ ok: false, motivo: "CHAVE_DESCONHECIDA" });
    expect(
      await alterarFuncionalidade(
        { ...pedido, chave: "multi_store" },
        repositorioFalso(NO_AR).repositorio,
      ),
    ).toEqual({ ok: false, motivo: "SEM_EFEITO" });
    expect(
      await alterarFuncionalidade(
        { ...pedido, chave: "auto_print" },
        repositorioFalso(null).repositorio,
      ),
    ).toEqual({ ok: false, motivo: "NAO_ENCONTRADA" });

    const excluida = repositorioFalso({ ...NO_AR, excluida: true });
    expect(
      await alterarFuncionalidade(
        { ...pedido, chave: "auto_print" },
        excluida.repositorio,
      ),
    ).toEqual({ ok: false, motivo: "EXCLUIDA" });
    expect(excluida.trilha).toEqual([]);
  });
});
