/**
 * Regras dos vínculos pela administração (card #170, T-4), sem banco: o
 * repositório é uma memória que anota a ORDEM das chamadas, para provar que as
 * travas (advisory, loja, pessoas) vêm antes de qualquer escrita, e que a
 * trilha da loja recebe só ids e papel — o motivo fica na da plataforma.
 */
import { describe, expect, it } from "vitest";

import {
  adicionarDono,
  adicionarEquipe,
  removerDono,
  removerEquipe,
  substituirDono,
  type LojaTravada,
  type PessoaDoVinculo,
  type RepositorioDeVinculos,
  type VinculoTravado,
} from "./vinculos.usecase.ts";

const AGORA = new Date("2026-11-21T12:00:00.000Z");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const LOJA = "00000000-0000-4000-8000-00000000105a";
const ANA = "00000000-0000-4000-8000-000000000001";
const BETO = "00000000-0000-4000-8000-000000000002";
const MOTIVO = "Pedido do dono por escrito";

function pessoa(
  id: string,
  sobrescrita: Partial<PessoaDoVinculo> = {},
): PessoaDoVinculo {
  return {
    id,
    temSenha: true,
    desativada: false,
    protegida: false,
    ...sobrescrita,
  };
}

function vinculo(sobrescrita: Partial<VinculoTravado> = {}): VinculoTravado {
  return {
    id: "vinculo-existente",
    papel: "OWNER",
    revogado: false,
    aceito: true,
    ...sobrescrita,
  };
}

interface Cenario {
  readonly loja?: LojaTravada | null;
  readonly pessoas?: PessoaDoVinculo[];
  readonly vinculos?: Record<string, VinculoTravado>;
  readonly outrosDonos?: number;
  readonly vagasDeLojas?: { limite: number; uso: number };
  readonly vagasDeEquipe?: { limite: number; uso: number };
}

function memoria(cenario: Cenario = {}) {
  const chamadas: string[] = [];
  const naLoja: {
    acao: string;
    antes: unknown;
    depois: unknown;
    vinculoId: string;
  }[] = [];
  const naPlataforma: { acao: string; depois: Record<string, unknown> }[] =
    [];
  const gravados: { identidadeId: string; papel: string; existente: unknown }[] =
    [];
  const revogados: string[] = [];
  const sessoesRevogadas: string[] = [];
  const loja =
    cenario.loja === undefined ? { id: LOJA, status: "ACTIVE" } : cenario.loja;
  const repositorio: RepositorioDeVinculos = {
    travarVagasDeLojas: async (id) => {
      chamadas.push(`vagasDeLojas:${id}`);
      return cenario.vagasDeLojas ?? { limite: 2, uso: 0 };
    },
    travarVagasDeEquipe: async (id) => {
      chamadas.push(`vagasDeEquipe:${id}`);
      return cenario.vagasDeEquipe ?? { limite: 1, uso: 0 };
    },
    travarLoja: async () => {
      chamadas.push("loja");
      return loja;
    },
    travarPessoas: async (ids) => {
      chamadas.push(`pessoas:${[...ids].join(",")}`);
      return new Map(
        (cenario.pessoas ?? [pessoa(ANA), pessoa(BETO)])
          .filter((p) => ids.includes(p.id))
          .map((p) => [p.id, p]),
      );
    },
    travarVinculo: async (_loja, id) => {
      chamadas.push(`vinculo:${id}`);
      return cenario.vinculos?.[id] ?? null;
    },
    outrosDonosAtivos: async () => {
      chamadas.push("outrosDonos");
      return cenario.outrosDonos ?? 0;
    },
    gravarVinculo: async (dados) => {
      chamadas.push(`gravar:${dados.identidadeId}:${dados.papel}`);
      gravados.push({
        identidadeId: dados.identidadeId,
        papel: dados.papel,
        existente: dados.existente,
      });
      return dados.existente?.id ?? `novo-${dados.identidadeId}`;
    },
    revogarVinculo: async (id) => {
      chamadas.push(`revogar:${id}`);
      revogados.push(id);
    },
    revogarSessoes: async (id) => {
      chamadas.push(`sessoes:${id}`);
      sessoesRevogadas.push(id);
      return 3;
    },
    registrarNaLoja: async (ato) => {
      chamadas.push(`trilhaDaLoja:${ato.acao}`);
      naLoja.push(ato);
    },
    registrarNaPlataforma: async (ato) => {
      chamadas.push(`trilhaDaPlataforma:${ato.acao}`);
      naPlataforma.push({ acao: ato.acao, depois: { ...ato.depois } });
    },
  };
  return {
    dependencias: { repositorio, agora: () => AGORA },
    chamadas,
    naLoja,
    naPlataforma,
    gravados,
    revogados,
    sessoesRevogadas,
  };
}

/** Nada foi escrito: nem vínculo, nem sessão, nem trilha. */
function nadaEscrito(m: ReturnType<typeof memoria>): void {
  expect(m.gravados).toEqual([]);
  expect(m.revogados).toEqual([]);
  expect(m.sessoesRevogadas).toEqual([]);
  expect(m.naLoja).toEqual([]);
  expect(m.naPlataforma).toEqual([]);
}

describe("adicionar dono", () => {
  it("[CA-8] trava advisory, loja e pessoa ANTES do vínculo, e só então grava", async () => {
    const m = memoria();
    const resultado = await adicionarDono(
      { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
      ADMIN,
      m.dependencias,
    );
    expect(resultado).toEqual({
      ok: true,
      vinculoId: `novo-${ANA}`,
      criado: true,
    });
    expect(m.chamadas).toEqual([
      `vagasDeLojas:${ANA}`,
      "loja",
      `pessoas:${ANA}`,
      `vinculo:${ANA}`,
      `gravar:${ANA}:OWNER`,
      "trilhaDaLoja:DONO_ADICIONADO",
      "trilhaDaPlataforma:DONO_ADICIONADO",
    ]);
  });

  it("[CA-9] a trilha da loja leva só ids e papel; o motivo vai só para a plataforma", async () => {
    const m = memoria();
    await adicionarDono(
      { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
      ADMIN,
      m.dependencias,
    );
    expect(m.naLoja).toEqual([
      {
        lojaId: LOJA,
        administradorId: ADMIN,
        acao: "DONO_ADICIONADO",
        vinculoId: `novo-${ANA}`,
        antes: null,
        depois: { identidadeId: ANA, papel: "OWNER" },
      },
    ]);
    expect(JSON.stringify(m.naLoja)).not.toContain(MOTIVO);
    expect(m.naPlataforma).toEqual([
      {
        acao: "DONO_ADICIONADO",
        depois: {
          motivo: MOTIVO,
          identidadeId: ANA,
          papel: "OWNER",
          sensivel: true,
        },
      },
    ]);
  });

  it("[CA-8] quem é da equipe vira dono na MESMA linha", async () => {
    const equipe = vinculo({ id: "linha-da-ana", papel: "STAFF" });
    const m = memoria({ vinculos: { [ANA]: equipe } });
    const resultado = await adicionarDono(
      { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
      ADMIN,
      m.dependencias,
    );
    expect(resultado).toMatchObject({ ok: true, vinculoId: "linha-da-ana" });
    expect(m.gravados).toEqual([
      { identidadeId: ANA, papel: "OWNER", existente: equipe },
    ]);
    expect(m.naLoja[0]?.antes).toEqual({ identidadeId: ANA, papel: "STAFF" });
  });

  it("[CA-8] dono ativo de novo é 409 ja_e_dono, sem escrever nada", async () => {
    const m = memoria({ vinculos: { [ANA]: vinculo() } });
    expect(
      await adicionarDono(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "JA_E_DONO" });
    nadaEscrito(m);
  });

  it("convite de dono pendente é aceito na mesma linha, sem contar vaga de novo", async () => {
    const pendente = vinculo({ id: "convite", aceito: false });
    const m = memoria({
      vinculos: { [ANA]: pendente },
      vagasDeLojas: { limite: 1, uso: 1 },
    });
    expect(
      await adicionarDono(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toMatchObject({ ok: true, vinculoId: "convite" });
  });

  it.each([
    ["sem senha", { temSenha: false }, "SEM_ACESSO_DEFINIDO"],
    ["desativada", { desativada: true }, "DESATIVADA"],
    ["protegida", { protegida: true }, "PROTEGIDA"],
    // Protegida vence: a conta da administração nunca é alvo, nem desativada.
    ["protegida e desativada", { protegida: true, desativada: true }, "PROTEGIDA"],
  ] as const)(
    "[CA-8] [CA-11] pessoa %s não recebe vínculo (conferido com ela travada)",
    async (_rotulo, sobrescrita, motivo) => {
      const m = memoria({ pessoas: [pessoa(ANA, sobrescrita)] });
      expect(
        await adicionarDono(
          { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
          ADMIN,
          m.dependencias,
        ),
      ).toEqual({ ok: false, motivo });
      expect(m.chamadas).toContain(`pessoas:${ANA}`);
      expect(m.chamadas).not.toContain(`vinculo:${ANA}`);
      nadaEscrito(m);
    },
  );

  it("loja inexistente ou excluída e pessoa inexistente são 404", async () => {
    const semLoja = memoria({ loja: null });
    expect(
      await adicionarDono(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        semLoja.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "LOJA_NAO_ENCONTRADA" });
    const semPessoa = memoria({ pessoas: [] });
    expect(
      await adicionarDono(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        semPessoa.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "PESSOA_NAO_ENCONTRADA" });
  });

  it("[CA-8] sem vaga de loja é 409 limite_atingido; loja recusada não ocupa vaga", async () => {
    const cheia = memoria({ vagasDeLojas: { limite: 2, uso: 2 } });
    expect(
      await adicionarDono(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        cheia.dependencias,
      ),
    ).toEqual({
      ok: false,
      motivo: "LIMITE_ATINGIDO",
      recurso: "lojas",
      limite: 2,
      uso: 2,
    });
    nadaEscrito(cheia);

    const recusada = memoria({
      loja: { id: LOJA, status: "REJECTED" },
      vagasDeLojas: { limite: 2, uso: 2 },
    });
    expect(
      await adicionarDono(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        recusada.dependencias,
      ),
    ).toMatchObject({ ok: true });
  });
});

describe("trocar o dono", () => {
  it("[CA-8] troca atômica: novo ativo, antigo revogado, sessões do antigo caem", async () => {
    const m = memoria({ vinculos: { [ANA]: vinculo({ id: "linha-da-ana" }) } });
    const resultado = await substituirDono(
      { lojaId: LOJA, antigoId: ANA, novoId: BETO, motivo: MOTIVO },
      ADMIN,
      m.dependencias,
    );
    expect(resultado).toEqual({
      ok: true,
      vinculoId: `novo-${BETO}`,
      criado: true,
      sessoesEncerradas: 3,
    });
    expect(m.chamadas).toEqual([
      `vagasDeLojas:${BETO}`,
      "loja",
      `pessoas:${ANA},${BETO}`,
      `vinculo:${ANA}`,
      `vinculo:${BETO}`,
      `gravar:${BETO}:OWNER`,
      "revogar:linha-da-ana",
      `sessoes:${ANA}`,
      "trilhaDaLoja:DONO_SUBSTITUIDO",
      "trilhaDaPlataforma:DONO_SUBSTITUIDO",
    ]);
    expect(m.sessoesRevogadas).toEqual([ANA]);
    expect(m.naLoja[0]).toMatchObject({
      antes: { identidadeId: ANA, papel: "OWNER" },
      depois: { identidadeId: BETO, papel: "OWNER" },
    });
    expect(JSON.stringify(m.naLoja)).not.toContain(MOTIVO);
    expect(m.naPlataforma[0]?.depois).toEqual({
      motivo: MOTIVO,
      antigoDonoId: ANA,
      novoDonoId: BETO,
      sessoesEncerradas: 3,
      sensivel: true,
    });
  });

  it("[CA-8] autotroca é 422 mesma_pessoa antes de qualquer trava", async () => {
    const m = memoria();
    expect(
      await substituirDono(
        { lojaId: LOJA, antigoId: ANA, novoId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "MESMA_PESSOA" });
    expect(m.chamadas).toEqual([]);
  });

  it("[CA-8] o antigo precisa ser DONO ativo da loja: equipe ou revogado é 404", async () => {
    for (const antigo of [
      vinculo({ papel: "STAFF" }),
      vinculo({ revogado: true }),
    ]) {
      const m = memoria({ vinculos: { [ANA]: antigo } });
      expect(
        await substituirDono(
          { lojaId: LOJA, antigoId: ANA, novoId: BETO, motivo: MOTIVO },
          ADMIN,
          m.dependencias,
        ),
      ).toEqual({ ok: false, motivo: "VINCULO_NAO_ENCONTRADO" });
      nadaEscrito(m);
    }
  });

  it("[CA-8] o novo sem senha, desativado ou protegido é 409; o antigo desativado pode sair", async () => {
    const m = memoria({
      pessoas: [pessoa(ANA), pessoa(BETO, { temSenha: false })],
      vinculos: { [ANA]: vinculo() },
    });
    expect(
      await substituirDono(
        { lojaId: LOJA, antigoId: ANA, novoId: BETO, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "SEM_ACESSO_DEFINIDO" });
    nadaEscrito(m);

    const antigoDesativado = memoria({
      pessoas: [pessoa(ANA, { desativada: true }), pessoa(BETO)],
      vinculos: { [ANA]: vinculo() },
    });
    expect(
      await substituirDono(
        { lojaId: LOJA, antigoId: ANA, novoId: BETO, motivo: MOTIVO },
        ADMIN,
        antigoDesativado.dependencias,
      ),
    ).toMatchObject({ ok: true });
  });

  it("[CA-11] antigo protegido é 409 conta_protegida", async () => {
    const m = memoria({
      pessoas: [pessoa(ANA, { protegida: true }), pessoa(BETO)],
      vinculos: { [ANA]: vinculo() },
    });
    expect(
      await substituirDono(
        { lojaId: LOJA, antigoId: ANA, novoId: BETO, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "PROTEGIDA" });
    nadaEscrito(m);
  });

  it("o novo que já é dono ativo é 409 ja_e_dono", async () => {
    const m = memoria({
      vinculos: { [ANA]: vinculo(), [BETO]: vinculo({ id: "linha-do-beto" }) },
    });
    expect(
      await substituirDono(
        { lojaId: LOJA, antigoId: ANA, novoId: BETO, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "JA_E_DONO" });
    nadaEscrito(m);
  });
});

describe("remover dono", () => {
  it("[CA-8] o último dono ativo não sai: 409 ultimo_dono", async () => {
    const m = memoria({ vinculos: { [ANA]: vinculo() }, outrosDonos: 0 });
    expect(
      await removerDono(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "ULTIMO_DONO" });
    nadaEscrito(m);
  });

  it("[CA-8] com outro dono ativo: revoked_at e sessões ROLE_CHANGED, trilha só com ids", async () => {
    const m = memoria({
      vinculos: { [ANA]: vinculo({ id: "linha-da-ana" }) },
      outrosDonos: 1,
    });
    expect(
      await removerDono(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: true });
    expect(m.revogados).toEqual(["linha-da-ana"]);
    expect(m.sessoesRevogadas).toEqual([ANA]);
    expect(m.naLoja[0]).toMatchObject({
      acao: "DONO_REMOVIDO",
      antes: { identidadeId: ANA, papel: "OWNER" },
      depois: null,
    });
    expect(m.naPlataforma[0]?.depois).toMatchObject({ motivo: MOTIVO });
  });

  it("[CA-8] a rota de dono não toca linha de equipe: 404", async () => {
    const m = memoria({
      vinculos: { [ANA]: vinculo({ papel: "STAFF" }) },
      outrosDonos: 1,
    });
    expect(
      await removerDono(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "VINCULO_NAO_ENCONTRADO" });
    nadaEscrito(m);
  });
});

describe("equipe", () => {
  it("[CA-8] adicionar trava a advisory da equipe antes da loja e respeita o limite", async () => {
    const m = memoria({ vagasDeEquipe: { limite: 1, uso: 1 } });
    expect(
      await adicionarEquipe(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({
      ok: false,
      motivo: "LIMITE_ATINGIDO",
      recurso: "staff",
      limite: 1,
      uso: 1,
    });
    expect(m.chamadas.slice(0, 2)).toEqual([`vagasDeEquipe:${LOJA}`, "loja"]);
    nadaEscrito(m);
  });

  it("[CA-8] POST de equipe sobre dono é 409 ja_e_dono", async () => {
    const m = memoria({ vinculos: { [ANA]: vinculo() } });
    expect(
      await adicionarEquipe(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "JA_E_DONO" });
    nadaEscrito(m);
  });

  it("quem já é da equipe: nada muda (repetir é seguro)", async () => {
    const m = memoria({
      vinculos: { [ANA]: vinculo({ id: "linha", papel: "STAFF" }) },
    });
    expect(
      await adicionarEquipe(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: true, vinculoId: "linha", criado: false });
    nadaEscrito(m);
  });

  it("adicionar grava STAFF e a trilha da loja sem motivo", async () => {
    const m = memoria();
    expect(
      await adicionarEquipe(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toMatchObject({ ok: true, criado: true });
    expect(m.gravados).toEqual([
      { identidadeId: ANA, papel: "STAFF", existente: null },
    ]);
    expect(m.naLoja[0]?.depois).toEqual({ identidadeId: ANA, papel: "STAFF" });
    expect(JSON.stringify(m.naLoja)).not.toContain(MOTIVO);
  });

  it("[CA-8] remover equipe é revoked_at; a linha de dono é 404", async () => {
    const m = memoria({
      vinculos: { [ANA]: vinculo({ id: "linha", papel: "STAFF" }) },
    });
    expect(
      await removerEquipe(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        m.dependencias,
      ),
    ).toEqual({ ok: true });
    expect(m.revogados).toEqual(["linha"]);
    expect(m.sessoesRevogadas).toEqual([]);

    const dono = memoria({ vinculos: { [ANA]: vinculo() } });
    expect(
      await removerEquipe(
        { lojaId: LOJA, identidadeId: ANA, motivo: MOTIVO },
        ADMIN,
        dono.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "VINCULO_NAO_ENCONTRADO" });
    nadaEscrito(dono);
  });
});
