/**
 * A regra de suspender, reativar, excluir e restaurar, sem banco (AC-209,
 * AC-210, AC-211). A costura com o banco, a vitrine e o painel do dono está
 * provada em `apps/api/tests/admin-situacao.test.ts`.
 */
import {
  confirmacaoConfere,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import {
  excluirLoja,
  reativarLoja,
  RETENCAO_DA_LOJA_EXCLUIDA_EM_MS,
  removerLojasVencidas,
  restaurarLoja,
  suspenderLoja,
  type RegistroDeSituacao,
  type RepositorioDaRemocao,
  type RepositorioDaSituacao,
  type SituacaoGravada,
  type SuspensaoRegistrada,
} from "./status-loja.usecase.ts";

const LOJA = "4b1d0c3e-0000-4000-8000-000000000001";
const ADMIN = "4b1d0c3e-0000-4000-8000-0000000000aa";
const AGORA = new Date("2026-10-03T12:00:00.000Z");

/** Um banco de mentira para uma loja só, que anota o que foi gravado. */
function repositorio(
  inicial: SituacaoGravada | null,
  extras: {
    readonly suspensao?: SuspensaoRegistrada;
    readonly antesDaExclusao?: SituacaoDaLoja;
  } = {},
) {
  let loja = inicial;
  const registros: RegistroDeSituacao[] = [];
  const gravacoes: string[] = [];
  const repo: RepositorioDaSituacao = {
    lerSituacao: async () => loja,
    suspensaoEmCurso: async () => extras.suspensao ?? null,
    situacaoAntesDaExclusao: async () => extras.antesDaExclusao ?? null,
    gravarStatus: async (_id, status) => {
      gravacoes.push(`status:${status}`);
      if (loja !== null) loja = { ...loja, status };
    },
    gravarExclusao: async (_id, excluidaEm, removerApos) => {
      gravacoes.push("exclusao");
      if (loja !== null) {
        loja = { ...loja, status: "DELETED", excluidaEm, removerApos };
      }
    },
    gravarRestauracao: async (_id, status) => {
      gravacoes.push(`restauracao:${status}`);
      if (loja !== null) {
        loja = { ...loja, status, excluidaEm: null, removerApos: null };
      }
    },
    registrar: async (registro) => {
      registros.push(registro);
    },
  };
  return { repo, registros, gravacoes, atual: () => loja };
}

const ATIVA: SituacaoGravada = {
  status: "ACTIVE",
  nome: "Pastel da Joi",
  excluidaEm: null,
  removerApos: null,
};

describe("suspender tira do ar sem apagar, com o motivo (AC-209)", () => {
  it("@spec:AC-209 a loja ativa fica suspensa e a trilha guarda de onde veio e o motivo", async () => {
    const banco = repositorio(ATIVA);

    const resultado = await suspenderLoja(
      LOJA,
      "Mensalidade em atraso",
      ADMIN,
      banco.repo,
    );

    expect(resultado).toEqual({ ok: true, mudou: true });
    expect(banco.gravacoes).toEqual(["status:SUSPENDED"]);
    expect(banco.registros).toEqual([
      {
        lojaId: LOJA,
        atorId: ADMIN,
        acao: "LOJA_SUSPENSA",
        antes: { status: "ACTIVE" },
        depois: { status: "SUSPENDED", motivo: "Mensalidade em atraso" },
      },
    ]);
  });

  it("@spec:AC-209 suspender de novo não grava nem registra; loja excluída e inexistente são recusadas", async () => {
    const suspensa = repositorio({ ...ATIVA, status: "SUSPENDED" });
    expect(await suspenderLoja(LOJA, "outro", ADMIN, suspensa.repo)).toEqual({
      ok: true,
      mudou: false,
    });
    expect(suspensa.gravacoes).toEqual([]);
    expect(suspensa.registros).toEqual([]);

    const excluida = repositorio({ ...ATIVA, status: "DELETED" });
    expect(await suspenderLoja(LOJA, "motivo", ADMIN, excluida.repo)).toEqual({
      ok: false,
      motivo: "EXCLUIDA",
    });
    expect(excluida.gravacoes).toEqual([]);

    const nenhuma = repositorio(null);
    expect(await suspenderLoja(LOJA, "motivo", ADMIN, nenhuma.repo)).toEqual({
      ok: false,
      motivo: "NAO_ENCONTRADA",
    });
  });
});

describe("reativar devolve a loja ao ar e guarda o período (AC-210)", () => {
  it("@spec:AC-210 a suspensa volta a ativa, e a trilha registra desde quando, até quando e por quê", async () => {
    const desde = new Date("2026-10-01T09:30:00.000Z");
    const banco = repositorio(
      { ...ATIVA, status: "SUSPENDED" },
      { suspensao: { desde, motivo: "Mensalidade em atraso" } },
    );

    const resultado = await reativarLoja(LOJA, ADMIN, banco.repo, AGORA);

    expect(resultado).toEqual({ ok: true, mudou: true });
    expect(banco.gravacoes).toEqual(["status:ACTIVE"]);
    expect(banco.registros).toEqual([
      {
        lojaId: LOJA,
        atorId: ADMIN,
        acao: "LOJA_REATIVADA",
        antes: { status: "SUSPENDED" },
        depois: {
          status: "ACTIVE",
          suspensaDesde: "2026-10-01T09:30:00.000Z",
          suspensaAte: "2026-10-03T12:00:00.000Z",
          motivo: "Mensalidade em atraso",
        },
      },
    ]);
  });

  it("@spec:AC-210 reativar a que já está no ar não grava nada, e a excluída volta só pela restauração", async () => {
    const ativa = repositorio(ATIVA);
    expect(await reativarLoja(LOJA, ADMIN, ativa.repo, AGORA)).toEqual({
      ok: true,
      mudou: false,
    });
    expect(ativa.gravacoes).toEqual([]);
    expect(ativa.registros).toEqual([]);

    const excluida = repositorio({ ...ATIVA, status: "DELETED" });
    expect(await reativarLoja(LOJA, ADMIN, excluida.repo, AGORA)).toEqual({
      ok: false,
      motivo: "EXCLUIDA",
    });
    expect(excluida.gravacoes).toEqual([]);
  });
});

describe("excluir exige o nome e fixa a retenção (AC-211)", () => {
  it("@spec:AC-211 sem o nome certo nada é gravado — a confirmação distingue letra, acento e maiúscula", async () => {
    for (const errada of ["pastel da joi", "Pastel da Jói", "Pastel", ""]) {
      const banco = repositorio(ATIVA);
      expect(
        await excluirLoja(
          { lojaId: LOJA, confirmacao: errada, administradorId: ADMIN },
          banco.repo,
          AGORA,
        ),
      ).toEqual({ ok: false, motivo: "CONFIRMACAO_DIFERENTE" });
      expect(banco.gravacoes).toEqual([]);
      expect(banco.registros).toEqual([]);
    }
    // Espaço nas pontas e espaço repetido não são o nome errado.
    expect(confirmacaoConfere("  Pastel   da Joi ", "Pastel da Joi")).toBe(
      true,
    );
  });

  it("@spec:AC-211 confirmada, a loja é excluída com a remoção definitiva marcada para 30 dias depois, e o ato vai para a trilha", async () => {
    const banco = repositorio({ ...ATIVA, status: "SUSPENDED" });

    const resultado = await excluirLoja(
      { lojaId: LOJA, confirmacao: "Pastel da Joi", administradorId: ADMIN },
      banco.repo,
      AGORA,
    );

    expect(resultado).toEqual({ ok: true, mudou: true });
    const depois = banco.atual();
    expect(depois?.status).toBe("DELETED");
    expect(depois?.excluidaEm).toEqual(AGORA);
    expect(depois?.removerApos?.toISOString()).toBe("2026-11-02T12:00:00.000Z");
    expect(RETENCAO_DA_LOJA_EXCLUIDA_EM_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(banco.registros).toEqual([
      {
        lojaId: LOJA,
        atorId: ADMIN,
        acao: "LOJA_EXCLUIDA",
        antes: { status: "SUSPENDED" },
        depois: { status: "DELETED", removerApos: "2026-11-02T12:00:00.000Z" },
      },
    ]);
  });

  it("@spec:AC-211 excluir de novo não empurra o prazo", async () => {
    const banco = repositorio({
      ...ATIVA,
      status: "DELETED",
      excluidaEm: AGORA,
      removerApos: new Date("2026-11-02T12:00:00.000Z"),
    });

    expect(
      await excluirLoja(
        { lojaId: LOJA, confirmacao: "Pastel da Joi", administradorId: ADMIN },
        banco.repo,
        new Date("2026-10-20T12:00:00.000Z"),
      ),
    ).toEqual({ ok: true, mudou: false });
    expect(banco.gravacoes).toEqual([]);
  });
});

describe("restaurar dentro do prazo, e só nele (AC-211)", () => {
  const EXCLUIDA: SituacaoGravada = {
    ...ATIVA,
    status: "DELETED",
    excluidaEm: AGORA,
    removerApos: new Date("2026-11-02T12:00:00.000Z"),
  };

  it("@spec:AC-211 dentro do prazo, a loja volta à situação de antes da exclusão — a suspensa volta suspensa", async () => {
    const banco = repositorio(EXCLUIDA, { antesDaExclusao: "SUSPENDED" });

    const resultado = await restaurarLoja(
      LOJA,
      ADMIN,
      banco.repo,
      new Date("2026-11-01T12:00:00.000Z"),
    );

    expect(resultado).toEqual({ ok: true, mudou: true });
    expect(banco.gravacoes).toEqual(["restauracao:SUSPENDED"]);
    expect(banco.registros).toEqual([
      {
        lojaId: LOJA,
        atorId: ADMIN,
        acao: "LOJA_RESTAURADA",
        antes: {
          status: "DELETED",
          excluidaEm: "2026-10-03T12:00:00.000Z",
          removerApos: "2026-11-02T12:00:00.000Z",
        },
        depois: { status: "SUSPENDED" },
      },
    ]);
  });

  it("@spec:AC-211 vencido o prazo, ou já removida em definitivo, não há o que restaurar", async () => {
    const vencida = repositorio(EXCLUIDA, { antesDaExclusao: "ACTIVE" });
    expect(
      await restaurarLoja(
        LOJA,
        ADMIN,
        vencida.repo,
        new Date("2026-11-02T12:00:00.000Z"),
      ),
    ).toEqual({ ok: false, motivo: "PRAZO_VENCIDO" });
    expect(vencida.gravacoes).toEqual([]);

    const removida = repositorio({ ...EXCLUIDA, removerApos: null });
    expect(await restaurarLoja(LOJA, ADMIN, removida.repo, AGORA)).toEqual({
      ok: false,
      motivo: "PRAZO_VENCIDO",
    });

    const ativa = repositorio(ATIVA);
    expect(await restaurarLoja(LOJA, ADMIN, ativa.repo, AGORA)).toEqual({
      ok: true,
      mudou: false,
    });
    expect(ativa.gravacoes).toEqual([]);
  });
});

describe("a remoção definitiva roda loja por loja (AC-211)", () => {
  it("@spec:AC-211 cada loja vencida é removida numa transação própria, e a que outra rodada já pegou fica de fora", async () => {
    const transacoes: string[] = [];
    const repo: RepositorioDaRemocao = {
      lojasVencidas: async (agora, limite) => {
        transacoes.push(`listar:${agora.toISOString()}:${limite}`);
        return ["loja-a", "loja-b", "loja-c"];
      },
      removerEmDefinitivo: async (lojaId) => {
        transacoes.push(`remover:${lojaId}`);
        if (lojaId === "loja-b") return null;
        return lojaId === "loja-a" ? ["loja-a/doc-1"] : [];
      },
    };
    let abertas = 0;

    const removidas = await removerLojasVencidas(AGORA, async (trabalho) => {
      abertas += 1;
      return trabalho(repo);
    });

    expect(removidas).toEqual([
      { lojaId: "loja-a", chavesDeArquivo: ["loja-a/doc-1"] },
      { lojaId: "loja-c", chavesDeArquivo: [] },
    ]);
    // Uma transação para listar e uma por loja.
    expect(abertas).toBe(4);
    expect(transacoes[0]).toBe("listar:2026-10-03T12:00:00.000Z:20");
  });
});
