import { describe, expect, it } from "vitest";

import {
  contextoAtual,
  criarContexto,
  ehPapelDeAcesso,
  ErroSemContexto,
  ErroSemLojaNoContexto,
  executarComoRequisicao,
  executarNoContexto,
  exigirContexto,
  exigirLojaDoContexto,
  PAPEIS_DE_ACESSO,
} from "./contexto.ts";

/**
 * O contexto da requisição é a metade em memória do isolamento — a outra
 * metade é o banco. Estes testes cobram dele o que um servidor real cobra: que
 * o valor sobreviva a `await`, que duas requisições concorrentes não se
 * misturem e que a ausência seja recusada em vez de virar um contexto vazio.
 */

const LOJA_A = "11111111-1111-4111-8111-111111111111";
const LOJA_B = "22222222-2222-4222-8222-222222222222";

/** Devolve o controle ao laço de eventos, forçando a troca de tarefa. */
const cederAVez = (ms = 0): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

describe("papéis de acesso", () => {
  it("são exatamente os nomes que as políticas do banco comparam", () => {
    expect([...PAPEIS_DE_ACESSO]).toEqual([
      "PUBLIC",
      "CUSTOMER",
      "OWNER",
      "STAFF",
      "PRINT_AGENT",
    ]);
  });

  it("recusa o que não é papel conhecido", () => {
    expect(ehPapelDeAcesso("OWNER")).toBe(true);
    expect(ehPapelDeAcesso("ADMIN")).toBe(false);
    expect(ehPapelDeAcesso(undefined)).toBe(false);
  });
});

describe("montagem do contexto", () => {
  it("trata papel ausente como PUBLIC, o menor privilégio", () => {
    expect(criarContexto({ lojaId: LOJA_A }).papel).toBe("PUBLIC");
  });

  it("dá identificador próprio a cada requisição", () => {
    expect(criarContexto().requisicaoId).not.toBe(criarContexto().requisicaoId);
  });

  it("preserva o identificador quando ele vem de fora", () => {
    expect(criarContexto({ requisicaoId: "req-1" }).requisicaoId).toBe("req-1");
  });
});

describe("propagação pela cadeia de execução", () => {
  it("sobrevive a await e a chamada aninhada, sem passar parâmetro", async () => {
    // É a razão de o contexto existir: doze camadas abaixo, sem nenhuma delas
    // ter recebido a loja como argumento, a resposta continua a mesma.
    const camadaFunda = async (): Promise<string | undefined> => {
      await cederAVez(5);
      return contextoAtual()?.lojaId;
    };
    const camadaDoMeio = async (): Promise<string | undefined> => {
      await cederAVez(1);
      return camadaFunda();
    };

    const visto = await executarComoRequisicao(
      { lojaId: LOJA_A, papel: "OWNER" },
      () => camadaDoMeio(),
    );

    expect(visto).toBe(LOJA_A);
  });

  it("não deixa o contexto escapar para fora da requisição", async () => {
    await executarComoRequisicao({ lojaId: LOJA_A }, async () => {
      await cederAVez();
      expect(contextoAtual()?.lojaId).toBe(LOJA_A);
    });

    expect(contextoAtual()).toBeUndefined();
  });

  it("mantém um contexto por requisição quando muitas correm em paralelo", async () => {
    // Uma variável de módulo passaria neste teste só por sorte de ordenação:
    // aqui as requisições se intercalam de propósito, e cada uma confere a
    // própria loja DEPOIS de ter cedido a vez para as outras.
    const requisicoes = Array.from({ length: 40 }, (_, indice) => {
      const loja = indice % 2 === 0 ? LOJA_A : LOJA_B;
      return executarComoRequisicao({ lojaId: loja }, async () => {
        await cederAVez(indice % 7);
        const durante = contextoAtual()?.lojaId;
        await cederAVez((indice * 3) % 5);
        return { esperada: loja, durante, depois: contextoAtual()?.lojaId };
      });
    });

    for (const resultado of await Promise.all(requisicoes)) {
      expect(resultado.durante).toBe(resultado.esperada);
      expect(resultado.depois).toBe(resultado.esperada);
    }
  });

  it("deixa a requisição interna sobrepor a externa sem contaminá-la", async () => {
    await executarComoRequisicao({ lojaId: LOJA_A }, async () => {
      await executarComoRequisicao({ lojaId: LOJA_B }, async () => {
        await cederAVez();
        expect(contextoAtual()?.lojaId).toBe(LOJA_B);
      });
      expect(contextoAtual()?.lojaId).toBe(LOJA_A);
    });
  });
});

describe("exigência de contexto", () => {
  it("recusa quem tenta usar o contexto fora de uma requisição", () => {
    expect(() => exigirContexto()).toThrow(ErroSemContexto);
    // A mensagem precisa dizer o que fazer, e não só que faltou algo.
    expect(() => exigirContexto()).toThrow(/executarNoContexto/);
  });

  it("devolve o contexto quando ele existe", () => {
    const contexto = criarContexto({ lojaId: LOJA_A, papel: "STAFF" });
    executarNoContexto(contexto, () => {
      expect(exigirContexto()).toBe(contexto);
      expect(exigirLojaDoContexto()).toBe(LOJA_A);
    });
  });

  it("recusa pedir a loja numa requisição que não tem loja", () => {
    // Seguir sem loja devolveria zero linhas, e o defeito apareceria como
    // "sumiu o dado", longe da causa.
    executarNoContexto(criarContexto({ requisicaoId: "req-9" }), () => {
      expect(() => exigirLojaDoContexto()).toThrow(ErroSemLojaNoContexto);
      expect(() => exigirLojaDoContexto()).toThrow(/req-9/);
    });
  });
});
