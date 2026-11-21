/**
 * Regras dos atos sobre pessoas (card #170, T-3), sem banco: o repositório é
 * uma memória que anota a ORDEM das chamadas, para provar que as travas vêm
 * antes de tudo e que a trilha nunca recebe token, resumo nem link.
 */
import { describe, expect, it } from "vitest";

import {
  cadastrarPessoa,
  caminhoDoAcesso,
  desativarPessoa,
  editarPessoa,
  gerarAcessoDaPessoa,
  reativarPessoa,
  VALIDADE_DO_ACESSO_EM_MS,
  type AtoDePessoa,
  type LojaSemOutroDono,
  type PessoaTravada,
  type RepositorioDePessoas,
} from "./pessoas.usecase.ts";

const AGORA = new Date("2026-11-21T12:00:00.000Z");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const TOKEN = "token-secreto-de-prova-com-32-bytes-aleatorios";
const RESUMO = "resumo-do-token-de-prova";

function pessoa(sobrescrita: Partial<PessoaTravada> = {}): PessoaTravada {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "ana@exemplo.test",
    nome: "Ana Souza",
    telefone: "+5511988887777",
    temSenha: true,
    desativadaEm: null,
    protegida: false,
    ...sobrescrita,
  };
}

function memoria(
  inicial: PessoaTravada | null,
  extras: {
    readonly lojasSemDono?: LojaSemOutroDono[];
    readonly emailEmUso?: string;
  } = {},
) {
  const chamadas: string[] = [];
  const atos: AtoDePessoa[] = [];
  const acessos: { resumo: string; expiraEm: Date; emissorId: string }[] = [];
  let atual = inicial;
  const repositorio: RepositorioDePessoas = {
    travarLojasDoDono: async () => {
      chamadas.push("travarLojas");
    },
    travarPessoa: async () => {
      chamadas.push("travarPessoa");
      return atual;
    },
    criarPessoa: async (dados) => {
      chamadas.push("criar");
      if (extras.emailEmUso !== undefined) return null;
      atual = pessoa({
        id: "00000000-0000-4000-8000-0000000000aa",
        email: dados.email,
        nome: dados.nome,
        telefone: dados.telefone,
        temSenha: false,
      });
      return atual.id;
    },
    identidadeDoEmail: async () => extras.emailEmUso ?? null,
    atualizarPessoa: async (_id, campos) => {
      chamadas.push(`atualizar:${Object.keys(campos).join(",")}`);
    },
    lojasQueFicariamSemDono: async () => {
      chamadas.push("lojasSemDono");
      return extras.lojasSemDono ?? [];
    },
    marcarDesativada: async () => {
      chamadas.push("desativar");
      return 2;
    },
    marcarReativada: async () => {
      chamadas.push("reativar");
    },
    consumirAcessosPendentes: async () => {
      chamadas.push("consumir");
    },
    gravarAcesso: async (acesso) => {
      chamadas.push("gravarAcesso");
      acessos.push(acesso);
    },
    registrar: async (ato) => {
      chamadas.push(`trilha:${ato.acao}`);
      atos.push(ato);
    },
  };
  return {
    repositorio,
    chamadas,
    atos,
    acessos,
    dependencias: {
      repositorio,
      agora: () => AGORA,
      gerarToken: () => TOKEN,
      resumirToken: () => RESUMO,
    },
  };
}

describe("cadastrar pessoa [CA-3]", () => {
  it("[CA-3] cria sem senha, grava CONTA_CRIADA mascarada e já gera o link", async () => {
    const m = memoria(null);
    const resultado = await cadastrarPessoa(
      {
        nome: "Bruno Lima",
        email: "bruno@exemplo.test",
        telefone: "+5511912345678",
      },
      ADMIN,
      m.dependencias,
    );
    expect(resultado.ok).toBe(true);
    const criada = m.atos.find((ato) => ato.acao === "CONTA_CRIADA");
    const texto = JSON.stringify(criada);
    expect(texto).not.toContain("Bruno Lima");
    expect(texto).not.toContain("bruno@exemplo.test");
    expect(texto).not.toContain("912345678");
    expect(m.chamadas).toContain("trilha:ACESSO_GERADO");
  });

  it("[CA-3] e-mail em uso recusa com a identidade existente e não grava nada", async () => {
    const m = memoria(null, { emailEmUso: "id-existente" });
    const resultado = await cadastrarPessoa(
      { nome: "Bruno", email: "bruno@exemplo.test" },
      ADMIN,
      m.dependencias,
    );
    expect(resultado).toEqual({
      ok: false,
      motivo: "EMAIL_EM_USO",
      identidadeId: "id-existente",
    });
    expect(m.atos).toEqual([]);
    expect(m.acessos).toEqual([]);
  });
});

describe("editar pessoa [CA-3]", () => {
  it("[CA-3] só nome e telefone mudam, e a trilha guarda só o final", async () => {
    const m = memoria(pessoa());
    const resultado = await editarPessoa(
      pessoa().id,
      { nome: "Ana Paula", telefone: "+5511900001111" },
      ADMIN,
      m.repositorio,
    );
    expect(resultado).toEqual({ ok: true });
    expect(m.chamadas).toContain("atualizar:nome,telefone");
    const texto = JSON.stringify(m.atos);
    expect(texto).not.toContain("Ana Paula");
    expect(texto).not.toContain("900001111");
    expect(m.atos[0]?.acao).toBe("CONTA_EDITADA");
  });

  it("[CA-11] conta com grant ativo é recusada com a identidade travada", async () => {
    const m = memoria(pessoa({ protegida: true }));
    const resultado = await editarPessoa(
      pessoa().id,
      { nome: "X" },
      ADMIN,
      m.repositorio,
    );
    expect(resultado).toEqual({ ok: false, motivo: "PROTEGIDA" });
    expect(m.chamadas).toEqual(["travarPessoa"]);
  });
});

describe("desativar e reativar [CA-4] [CA-5]", () => {
  it("[CA-5] trava as lojas ANTES da identidade, e só então revoga e consome", async () => {
    const m = memoria(pessoa());
    const resultado = await desativarPessoa(
      pessoa().id,
      { motivo: "Pedido da pessoa" },
      ADMIN,
      m.dependencias,
    );
    expect(resultado).toEqual({ ok: true, sessoesEncerradas: 2 });
    expect(m.chamadas).toEqual([
      "travarLojas",
      "travarPessoa",
      "lojasSemDono",
      "desativar",
      "consumir",
      "trilha:CONTA_DESATIVADA",
    ]);
  });

  it("[CA-5] dona única de loja exige ciência; com ciência, prossegue", async () => {
    const lojas = [{ lojaId: "l1", nome: "Loja Um", apelido: "loja-um" }];
    const sem = memoria(pessoa(), { lojasSemDono: lojas });
    expect(
      await desativarPessoa(
        pessoa().id,
        { motivo: "m" },
        ADMIN,
        sem.dependencias,
      ),
    ).toEqual({ ok: false, motivo: "DONO_UNICO", lojas });
    expect(sem.chamadas).not.toContain("desativar");

    const com = memoria(pessoa(), { lojasSemDono: lojas });
    const resultado = await desativarPessoa(
      pessoa().id,
      { motivo: "m", lojasSemDonoCiente: true },
      ADMIN,
      com.dependencias,
    );
    expect(resultado.ok).toBe(true);
    expect(com.atos[0]?.depois).toMatchObject({ lojasSemDono: ["l1"] });
  });

  it("[CA-4] conta já desativada, protegida ou inexistente é recusada", async () => {
    for (const [inicial, motivo] of [
      [pessoa({ desativadaEm: AGORA }), "DESATIVADA"],
      [pessoa({ protegida: true }), "PROTEGIDA"],
      [null, "NAO_ENCONTRADA"],
    ] as const) {
      const m = memoria(inicial);
      expect(
        await desativarPessoa(
          pessoa().id,
          { motivo: "m" },
          ADMIN,
          m.dependencias,
        ),
      ).toEqual({ ok: false, motivo });
      expect(m.chamadas).not.toContain("desativar");
    }
  });

  it("[CA-4] reativar devolve o acesso e é idempotente para conta ativa", async () => {
    const desativada = memoria(pessoa({ desativadaEm: AGORA }));
    expect(
      await reativarPessoa(
        pessoa().id,
        { motivo: "Voltou" },
        ADMIN,
        desativada.repositorio,
      ),
    ).toEqual({ ok: true });
    expect(desativada.chamadas).toEqual([
      "travarPessoa",
      "reativar",
      "trilha:CONTA_REATIVADA",
    ]);

    const ativa = memoria(pessoa());
    expect(
      await reativarPessoa(
        pessoa().id,
        { motivo: "m" },
        ADMIN,
        ativa.repositorio,
      ),
    ).toEqual({ ok: true });
    expect(ativa.atos).toEqual([]);
  });
});

describe("link de acesso de uso único [CA-6]", () => {
  it("[CA-6] consome os pendentes, grava só o resumo com o emissor e vale 60 minutos", async () => {
    const m = memoria(pessoa());
    const resultado = await gerarAcessoDaPessoa(
      pessoa().id,
      { motivo: "Esqueceu a senha" },
      ADMIN,
      m.dependencias,
    );
    if (!resultado.ok) throw new Error("deveria gerar");
    expect(resultado.acesso.token).toBe(TOKEN);
    expect(resultado.acesso.expiraEm.getTime() - AGORA.getTime()).toBe(
      VALIDADE_DO_ACESSO_EM_MS,
    );
    expect(VALIDADE_DO_ACESSO_EM_MS).toBe(60 * 60 * 1000);
    expect(m.chamadas.indexOf("consumir")).toBeLessThan(
      m.chamadas.indexOf("gravarAcesso"),
    );
    expect(m.acessos).toEqual([
      {
        identidadeId: pessoa().id,
        resumo: RESUMO,
        expiraEm: resultado.acesso.expiraEm,
        emissorId: ADMIN,
      },
    ]);
    const trilha = JSON.stringify(m.atos);
    expect(trilha).not.toContain(TOKEN);
    expect(trilha).not.toContain(RESUMO);
    expect(trilha).not.toContain("definir-senha");
    expect(m.atos[0]).toMatchObject({
      acao: "ACESSO_GERADO",
      depois: { motivo: "Esqueceu a senha", jaTinhaSenha: true },
    });
  });

  it("[CA-6] conta desativada ou protegida não recebe link", async () => {
    for (const inicial of [
      pessoa({ desativadaEm: AGORA }),
      pessoa({ protegida: true }),
    ]) {
      const m = memoria(inicial);
      const resultado = await gerarAcessoDaPessoa(
        pessoa().id,
        { motivo: "m" },
        ADMIN,
        m.dependencias,
      );
      expect(resultado.ok).toBe(false);
      expect(m.acessos).toEqual([]);
    }
  });

  it("[CA-6] o caminho é relativo e codifica o token", () => {
    expect(caminhoDoAcesso("a+b/c")).toBe("/definir-senha?token=a%2Bb%2Fc");
  });
});
