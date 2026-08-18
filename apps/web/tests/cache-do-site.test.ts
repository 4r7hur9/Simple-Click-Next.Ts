import { describe, expect, it } from "vitest";

import {
  chaveDoCacheDoSite,
  ErroDeChaveDoSite,
  etiquetaDaLoja,
  etiquetaDoDado,
  etiquetasDaEntrada,
  invalidarNoSite,
  lembrarNoSite,
  type MotorDeCacheDoSite,
  motorDoNext,
  type PedidoDeLembranca,
  TTL_PADRAO_SEGUNDOS,
} from "../src/server/cache";

/**
 * Prova dos envelopes de cache do site: a loja no primeiro argumento (AC-027) e
 * a alteração aparecendo na leitura seguinte (AC-028).
 *
 * O motor de mentira guarda de verdade e invalida de verdade, por etiqueta —
 * é o mesmo contrato que o Next cumpre. O que este arquivo prova é a REGRA que
 * escrevemos: qual chave, quais etiquetas e o que acontece depois de invalidar.
 * Se o envelope montasse a chave sem a loja, nenhum teste do Next pegaria isso.
 */

const LOJA_A = "11111111-1111-4111-8111-111111111111";
const LOJA_B = "22222222-2222-4222-8222-222222222222";

interface EntradaDoMotor {
  readonly valor: unknown;
  readonly etiquetas: readonly string[];
  readonly ttlSegundos: number;
}

/** Motor de cache fiel ao contrato: guarda por chave, invalida por etiqueta. */
function criarMotorFalso() {
  const guardado = new Map<string, EntradaDoMotor>();

  const motor: MotorDeCacheDoSite = {
    async lembrar<T>(pedido: PedidoDeLembranca<T>): Promise<T> {
      const entrada = guardado.get(pedido.chave);
      if (entrada !== undefined) return entrada.valor as T;

      const valor = await pedido.calcular();
      guardado.set(pedido.chave, {
        valor,
        etiquetas: pedido.etiquetas,
        ttlSegundos: pedido.ttlSegundos,
      });
      return valor;
    },
    invalidar(etiqueta: string): void {
      for (const [chave, entrada] of guardado) {
        if (entrada.etiquetas.includes(etiqueta)) guardado.delete(chave);
      }
    },
  };

  return {
    motor,
    chaves: () => [...guardado.keys()],
    entrada: (chave: string) => guardado.get(chave),
  };
}

// ---------------------------------------------------------------------------
// AC-027
// ---------------------------------------------------------------------------

describe("chave de cache do site", () => {
  it("@spec:AC-027 toda chave começa pelo identificador da loja", () => {
    expect(chaveDoCacheDoSite(LOJA_A, "catalogo")).toBe(`${LOJA_A}:catalogo`);
    expect(
      chaveDoCacheDoSite(LOJA_A, "produto", "abc-123").startsWith(`${LOJA_A}:`),
    ).toBe(true);
  });

  it("@spec:AC-027 recusa montar chave sem loja, em vez de montar uma compartilhada", () => {
    expect(() => chaveDoCacheDoSite("", "catalogo")).toThrow(ErroDeChaveDoSite);
    expect(() => etiquetaDaLoja("  ")).toThrow(ErroDeChaveDoSite);
  });

  it("@spec:AC-027 recusa parte que permitiria uma loja forjar a chave de outra", () => {
    expect(() => chaveDoCacheDoSite("a", "b:catalogo")).toThrow(
      ErroDeChaveDoSite,
    );
    expect(() => chaveDoCacheDoSite("a:b", "catalogo")).toThrow(
      ErroDeChaveDoSite,
    );
  });

  it("@spec:AC-027 as etiquetas de uma entrada também começam pela loja", () => {
    expect(etiquetasDaEntrada(LOJA_A, "catalogo")).toEqual([
      LOJA_A,
      `${LOJA_A}:catalogo`,
    ]);
    expect(etiquetaDoDado(LOJA_B, "catalogo")).toBe(`${LOJA_B}:catalogo`);
  });
});

describe("leitura com cache no site", () => {
  it("@spec:AC-027 duas lojas consultando o mesmo tipo de dado recebem cada uma o seu", async () => {
    const falso = criarMotorFalso();

    const vitrineA = await lembrarNoSite(
      LOJA_A,
      "catalogo",
      async () => Promise.resolve({ loja: "A" }),
      { motor: falso.motor },
    );
    const vitrineB = await lembrarNoSite(
      LOJA_B,
      "catalogo",
      async () => Promise.resolve({ loja: "B" }),
      { motor: falso.motor },
    );

    // A releitura de A vem do cache — e continua sendo o catálogo de A.
    const vitrineADeNovo = await lembrarNoSite(
      LOJA_A,
      "catalogo",
      async () => Promise.reject(new Error("não deveria recalcular")),
      { motor: falso.motor },
    );

    expect(vitrineA).toEqual({ loja: "A" });
    expect(vitrineB).toEqual({ loja: "B" });
    expect(vitrineADeNovo).toEqual({ loja: "A" });
    expect(falso.chaves()).toEqual([
      `${LOJA_A}:catalogo`,
      `${LOJA_B}:catalogo`,
    ]);
  });

  it("@spec:AC-027 a entrada guardada leva as duas etiquetas da loja e o prazo padrão", async () => {
    const falso = criarMotorFalso();

    await lembrarNoSite(LOJA_A, "catalogo", async () => Promise.resolve(1), {
      motor: falso.motor,
    });

    expect(falso.entrada(`${LOJA_A}:catalogo`)?.etiquetas).toEqual([
      LOJA_A,
      `${LOJA_A}:catalogo`,
    ]);
    expect(falso.entrada(`${LOJA_A}:catalogo`)?.ttlSegundos).toBe(
      TTL_PADRAO_SEGUNDOS,
    );
  });
});

// ---------------------------------------------------------------------------
// AC-028
// ---------------------------------------------------------------------------

describe("invalidação do cache do site", () => {
  it("@spec:AC-028 a alteração aparece na leitura seguinte, sem reinício de serviço nem limpeza manual", async () => {
    const falso = criarMotorFalso();
    let nome = "pastel de carne";
    const ler = async () => Promise.resolve({ nome });

    expect(
      await lembrarNoSite(LOJA_A, "catalogo", ler, { motor: falso.motor }),
    ).toEqual({ nome: "pastel de carne" });

    nome = "pastel de queijo";
    // Ainda em cache: sem invalidação, a alteração não apareceria agora.
    expect(
      await lembrarNoSite(LOJA_A, "catalogo", ler, { motor: falso.motor }),
    ).toEqual({ nome: "pastel de carne" });

    invalidarNoSite(LOJA_A, [], falso.motor);

    expect(
      await lembrarNoSite(LOJA_A, "catalogo", ler, { motor: falso.motor }),
    ).toEqual({ nome: "pastel de queijo" });
  });

  it("@spec:AC-028 invalidar uma loja não derruba o cache da outra", async () => {
    const falso = criarMotorFalso();

    await lembrarNoSite(LOJA_A, "catalogo", async () => Promise.resolve("A"), {
      motor: falso.motor,
    });
    await lembrarNoSite(LOJA_B, "catalogo", async () => Promise.resolve("B"), {
      motor: falso.motor,
    });

    const invalidado = invalidarNoSite(LOJA_A, [], falso.motor);

    expect(invalidado).toEqual([LOJA_A]);
    expect(falso.chaves()).toEqual([`${LOJA_B}:catalogo`]);
  });

  it("@spec:AC-028 invalidar um dado só derruba aquele dado da loja", async () => {
    const falso = criarMotorFalso();

    await lembrarNoSite(LOJA_A, "catalogo", async () => Promise.resolve("c"), {
      motor: falso.motor,
    });
    await lembrarNoSite(LOJA_A, "vitrine", async () => Promise.resolve("v"), {
      motor: falso.motor,
    });

    const invalidado = invalidarNoSite(LOJA_A, ["catalogo"], falso.motor);

    expect(invalidado).toEqual([`${LOJA_A}:catalogo`]);
    expect(falso.chaves()).toEqual([`${LOJA_A}:vitrine`]);
  });

  it("@spec:AC-028 o motor de produção é o do Next, e não um substituto esquecido no código", () => {
    expect(typeof motorDoNext.lembrar).toBe("function");
    expect(typeof motorDoNext.invalidar).toBe("function");
  });
});
