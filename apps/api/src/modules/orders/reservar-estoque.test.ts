import { describe, expect, it } from "vitest";

import { ErroDeDominio } from "../../core/erros.ts";
import {
  reservarEstoque,
  type EntradaDaReservaDeEstoque,
} from "./reservar-estoque.ts";

function bancoFalso(linhas: readonly Record<string, number>[]) {
  const chamadas: unknown[][] = [];
  return {
    chamadas,
    tx: {
      $queryRaw: async (...args: unknown[]) => {
        chamadas.push(args);
        return linhas;
      },
    },
  };
}

const entrada: EntradaDaReservaDeEstoque = {
  lojaId: "11111111-1111-1111-1111-111111111111",
  pedidoId: "22222222-2222-2222-2222-222222222222",
  itens: [
    { variacaoId: "33333333-3333-3333-3333-333333333333", quantidade: 1 },
    { variacaoId: "33333333-3333-3333-3333-333333333333", quantidade: 2 },
    { variacaoId: null, quantidade: 4 },
  ],
};

describe("reserva atômica do estoque (T-308)", () => {
  it("@spec:AC-333 agrupa linhas e reserva somente itens com variação", async () => {
    const banco = bancoFalso([{ quantity_before: 5, quantity_after: 2 }]);

    const resultado = await reservarEstoque(entrada, banco.tx);

    expect(banco.chamadas).toHaveLength(1);
    expect(resultado).toEqual([
      {
        variacaoId: "33333333-3333-3333-3333-333333333333",
        quantidade: 3,
        quantidadeAntes: 5,
        quantidadeDepois: 2,
      },
    ]);
  });

  it("@spec:AC-333 transforma falta de saldo em conflito de checkout", async () => {
    const banco = bancoFalso([]);

    const erro = await reservarEstoque(entrada, banco.tx).catch(
      (causa: unknown) => causa,
    );

    expect(erro).toBeInstanceOf(ErroDeDominio);
    expect((erro as ErroDeDominio).codigo).toBe("conflito");
  });

  it("@spec:AC-337 variação sem controle de estoque passa sem baixa, e não vira falta de saldo", async () => {
    // A linha de nulos é o "siga" da função (migração 0027). Lê-la como falta
    // de saldo foi o que impedia a lanchonete de fechar pedido de pizza P e G.
    const banco = bancoFalso([
      { quantity_before: null, quantity_after: null } as unknown as Record<
        string,
        number
      >,
    ]);

    await expect(reservarEstoque(entrada, banco.tx)).resolves.toEqual([]);
    expect(banco.chamadas).toHaveLength(1);
  });

  it("@spec:AC-333 não consulta o banco quando o pedido não tem variação", async () => {
    const banco = bancoFalso([]);

    await expect(
      reservarEstoque(
        { ...entrada, itens: [{ variacaoId: null, quantidade: 1 }] },
        banco.tx,
      ),
    ).resolves.toEqual([]);
    expect(banco.chamadas).toHaveLength(0);
  });
});
