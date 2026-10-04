/**
 * As regras da fila de impressão que não precisam de banco (T-607 — AC-624,
 * AC-625, AC-621).
 *
 * A prova contra o PostgreSQL de verdade — dois agentes ao mesmo tempo,
 * confirmação perdida, prazo vencido — está em
 * `apps/api/tests/impressao-sem-duplicar.test.ts`. Aqui ficam as decisões
 * puras que aquela prova usa: quanto esperar depois de cada falha, quando
 * desistir, e o que o agente recebe a partir da linha da fila.
 */
import { describe, expect, it } from "vitest";

import { esquemaDoTrabalhoDeImpressao } from "@simpleclick/contracts";
import { gerarCupom, type CupomImpresso } from "@simpleclick/core";

import {
  destinoDaFalha,
  ErroDoCupomDoTrabalho,
  ESPERA_INICIAL_MS,
  MAXIMO_DE_TENTATIVAS,
  montarCupomDoTrabalho,
  projetarTrabalhoEntregue,
  type LinhaReivindicada,
} from "./fila.usecase.ts";
import {
  montarPedidoParaCupom,
  type LerConfiguracaoDoCupom,
  type PedidoGuardadoParaCupom,
} from "./pedido-para-cupom.ts";

/**
 * A configuração como a borda a interpreta (o módulo da loja). Aqui uma versão
 * fixa: o que está sob prova é a fila, não a leitura da configuração.
 */
const lerConfiguracao58: LerConfiguracaoDoCupom = () => ({
  larguraMm: 58,
  conteudo: {
    enderecoCliente: true,
    observacoes: true,
    totalEmDestaque: false,
  },
});

/** O pedido como o cliente tipado o lê: dinheiro em `bigint`, instante em `Date`. */
const PEDIDO_PELO_CLIENTE_TIPADO: PedidoGuardadoParaCupom = {
  code: "A-0042",
  channel: "ONLINE",
  fulfillment: "DELIVERY",
  paymentMethod: "CASH",
  changeForCents: 10_000n,
  subtotalCents: 6_650n,
  deliveryFeeCents: 800n,
  deliveryFeeMode: "VALUE",
  discountCents: 0n,
  pickupDiscountCents: 0n,
  totalCents: 7_450n,
  customerNote: "Tocar a campainha do portão azul",
  storeTimezone: "America/Sao_Paulo",
  placedAt: new Date("2026-10-03T17:42:10.123Z"),
  contato: {
    name: "Maria Conceição",
    phoneE164: "5511988887777",
    recipientName: null,
    street: "Rua das Flores",
    number: "123",
    complement: "Apto 12",
    neighborhood: "Centro",
    city: "São Paulo",
    uf: "SP",
    zip: "01000-000",
    referencePoint: null,
  },
  itens: [
    {
      productName: "Açaí com granola",
      variantName: "500 ml",
      quantity: 2,
      lineTotalCents: 4_700n,
      note: "Sem granola na metade, é alergia",
      opcoes: [
        {
          groupNameSnapshot: "Adicionais",
          optionNameSnapshot: "Paçoca",
          action: "ADD",
          quantity: 2,
          priceDeltaCents: 400n,
        },
      ],
    },
    {
      productName: "Guaraná",
      variantName: null,
      quantity: 3,
      lineTotalCents: 1_950n,
      note: null,
      opcoes: [],
    },
  ],
};

/**
 * O MESMO pedido como `app.cupom_do_trabalho` o devolve: JSON, com dinheiro em
 * número e o instante em texto ISO.
 */
function pedidoPelaFuncaoDaFila(): unknown {
  return JSON.parse(
    JSON.stringify(PEDIDO_PELO_CLIENTE_TIPADO, (_chave, valor: unknown) =>
      typeof valor === "bigint" ? Number(valor) : valor,
    ),
  );
}

function cupomDeExemplo(via = 1): CupomImpresso {
  return gerarCupom(
    montarPedidoParaCupom(PEDIDO_PELO_CLIENTE_TIPADO, "Açaí da Vila"),
    { larguraMm: 58, via },
  );
}

function linha(
  sobrescrita: Partial<LinhaReivindicada> = {},
): LinhaReivindicada {
  return {
    id: "6f1c2d3e-0000-4000-8000-000000000001",
    order_id: "6f1c2d3e-0000-4000-8000-0000000000aa",
    order_code: "A-0042",
    blocks: cupomDeExemplo(),
    attempt: 1,
    lease_until: new Date("2026-10-03T17:43:10.000Z"),
    created_at: new Date("2026-10-03T17:42:11.000Z"),
    ...sobrescrita,
  };
}

describe("espera crescente e desistência", () => {
  it("@spec:AC-624 falha volta para a fila com espera de 5 s que dobra a cada tentativa, e o cupom não se perde no limite", () => {
    expect(ESPERA_INICIAL_MS).toBe(5_000);
    expect(MAXIMO_DE_TENTATIVAS).toBe(6);

    expect(
      [1, 2, 3, 4, 5].map((tentativa) => destinoDaFalha(tentativa)),
    ).toEqual([
      { estado: "FAILED", esperaMs: 5_000 },
      { estado: "FAILED", esperaMs: 10_000 },
      { estado: "FAILED", esperaMs: 20_000 },
      { estado: "FAILED", esperaMs: 40_000 },
      { estado: "FAILED", esperaMs: 80_000 },
    ]);
    // Desistir é estado final À VISTA — o dono imprime por clique —, e não
    // apagar: é por isso que o limite não perde cupom.
    expect(destinoDaFalha(6)).toEqual({ estado: "DEAD" });
    expect(destinoDaFalha(9)).toEqual({ estado: "DEAD" });
  });

  it("tentativa fora do intervalo nunca vira espera negativa nem fracionária", () => {
    expect(destinoDaFalha(0)).toEqual({ estado: "FAILED", esperaMs: 5_000 });
    expect(destinoDaFalha(2.7)).toEqual({ estado: "FAILED", esperaMs: 10_000 });
  });
});

describe("o que o agente recebe", () => {
  it("@spec:AC-625 o reenvio entrega o cupom GUARDADO na linha, com o mesmo identificador", () => {
    const guardado = cupomDeExemplo();
    const primeira = projetarTrabalhoEntregue(linha({ blocks: guardado }));
    // A segunda entrega lê a mesma linha, agora com outra tentativa e outro
    // prazo: o cupom e o identificador não mudam, e é isso que deixa o agente
    // reconhecer o que já imprimiu.
    const reenvio = projetarTrabalhoEntregue(
      linha({
        blocks: JSON.parse(JSON.stringify(guardado)) as unknown,
        attempt: 2,
        lease_until: new Date("2026-10-03T17:44:30.000Z"),
      }),
    );

    expect(primeira).toEqual({
      id: "6f1c2d3e-0000-4000-8000-000000000001",
      pedido: { id: "6f1c2d3e-0000-4000-8000-0000000000aa", codigo: "A-0042" },
      tentativa: 1,
      prazoAte: "2026-10-03T17:43:10.000Z",
      cupom: guardado,
    });
    expect(reenvio.id).toBe(primeira.id);
    expect(reenvio.cupom).toEqual(primeira.cupom);
    expect(reenvio.tentativa).toBe(2);
  });

  it("@spec:AC-625 cupom guardado fora do contrato é recusado em vez de impresso errado", () => {
    const versaoDesconhecida = { ...cupomDeExemplo(), versao: 2 };

    expect(() =>
      projetarTrabalhoEntregue(linha({ blocks: versaoDesconhecida })),
    ).toThrow(ErroDoCupomDoTrabalho);
    expect(() => projetarTrabalhoEntregue(linha({ blocks: null }))).toThrow(
      ErroDoCupomDoTrabalho,
    );
  });

  it("o trabalho entregue cumpre o contrato que o agente lê, em 58 e em 80 mm, original e reimpressão", () => {
    for (const larguraMm of [58, 80] as const) {
      for (const via of [1, 2]) {
        const cupom = gerarCupom(
          montarPedidoParaCupom(PEDIDO_PELO_CLIENTE_TIPADO, "Açaí da Vila"),
          { larguraMm, via },
        );
        const entregue = projetarTrabalhoEntregue(linha({ blocks: cupom }));
        const lido = esquemaDoTrabalhoDeImpressao.safeParse(entregue);
        expect(lido.success, JSON.stringify(lido.error?.issues)).toBe(true);
      }
    }
  });
});

describe("o cupom da primeira entrega", () => {
  it("@spec:AC-621 o cupom do agente é o mesmo do clique, com a via que o banco somou", () => {
    const pelaFila = montarCupomDoTrabalho(
      {
        via: 1,
        loja: "Açaí da Vila",
        configuracao: { larguraMm: 58 },
        pedido: pedidoPelaFuncaoDaFila(),
      },
      lerConfiguracao58,
    );

    expect(pelaFila).toEqual(cupomDeExemplo(1));

    // Reenvio nunca passa por aqui; quem passa com via 3 é porque o pedido
    // já tinha duas vias impressas — e o cupom diz isso no papel.
    const terceira = montarCupomDoTrabalho(
      {
        via: 3,
        loja: "Açaí da Vila",
        configuracao: null,
        pedido: pedidoPelaFuncaoDaFila(),
      },
      lerConfiguracao58,
    );
    expect(terceira.via).toBe(3);
    expect(JSON.stringify(terceira.blocos)).toContain("REIMPRESSÃO");
  });

  it("dados que a fila não devolveu, ou incompletos, não viram cupom", () => {
    for (const dados of [
      null,
      "{",
      { via: 0, loja: "Loja", pedido: {} },
      { via: 1, loja: 7, pedido: {} },
      { via: 1, loja: "Loja", pedido: null },
    ]) {
      expect(() => montarCupomDoTrabalho(dados, lerConfiguracao58)).toThrow(
        ErroDoCupomDoTrabalho,
      );
    }
  });
});
