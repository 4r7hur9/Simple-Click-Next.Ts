// @vitest-environment jsdom
/**
 * Prova da tela de entrega e do que o checkout faz com ela (T-902: AC-905 a AC-908).
 *
 * O dono digita em reais; a API guarda centavos. A conversão é da tela, e é
 * aqui que se prova que "8,00" chega como 800 — e que valor que não é dinheiro
 * é apontado, e não gravado como "a combinar" em silêncio.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import {
  FechamentoDaCompra,
  type EntregaDaLojaNaTela,
} from "../src/features/checkout/FechamentoDaCompra.tsx";
import {
  centavosParaReais,
  FormularioEntrega,
  reaisParaCentavos,
} from "../src/features/config/FormularioEntrega.tsx";
import {
  clicar,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

afterEach(desmontar);

const ENTREGA_SALVA = {
  aceitaEntrega: true,
  aceitaRetirada: true,
  taxaCentavos: null,
  nomeDaTaxa: "Taxa de entrega",
  gratisAcimaDeCentavos: null,
  minimoParaEntregaCentavos: null,
  minimoParaRetiradaCentavos: null,
  prazoMinutos: null,
};

describe("o dono digita em reais (AC-906, AC-907, AC-908)", () => {
  it("@spec:AC-906 taxa de R$ 8,00 com nome próprio chega à API como 800 centavos e o nome dado", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "PUT"
        ? { status: 204 }
        : { status: 200, corpo: ENTREGA_SALVA },
    );
    const tela = montar(<FormularioEntrega />);
    await esperar();

    digitar(exigir(tela, 'input[name="taxaCentavos"]'), "8,00");
    digitar(exigir(tela, 'input[name="nomeDaTaxa"]'), "Motoboy");
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    const envio = chamadas.find((chamada) => chamada.metodo === "PUT");
    expect(envio?.corpo).toMatchObject({
      taxaCentavos: 800,
      nomeDaTaxa: "Motoboy",
    });
  });

  it("@spec:AC-907 entrega grátis acima de R$ 60,00 vai como 6000 centavos", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "PUT"
        ? { status: 204 }
        : { status: 200, corpo: ENTREGA_SALVA },
    );
    const tela = montar(<FormularioEntrega />);
    await esperar();

    digitar(exigir(tela, 'input[name="gratisAcimaDeCentavos"]'), "60");
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(
      chamadas.find((chamada) => chamada.metodo === "PUT")?.corpo,
    ).toMatchObject({ gratisAcimaDeCentavos: 6_000 });
  });

  it("@spec:AC-908 mínimo de R$ 25,00 para entrega vai como 2500, e retirada sem mínimo vai vazia", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "PUT"
        ? { status: 204 }
        : { status: 200, corpo: ENTREGA_SALVA },
    );
    const tela = montar(<FormularioEntrega />);
    await esperar();

    digitar(exigir(tela, 'input[name="minimoParaEntregaCentavos"]'), "25,00");
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(
      chamadas.find((chamada) => chamada.metodo === "PUT")?.corpo,
    ).toMatchObject({
      minimoParaEntregaCentavos: 2_500,
      minimoParaRetiradaCentavos: null,
    });
  });

  it("@spec:AC-906 a conversão é exata nos dois sentidos, e o que não é dinheiro é recusado", () => {
    expect(reaisParaCentavos("0,29")).toBe(29);
    expect(reaisParaCentavos("1.234,5")).toBe(123_450);
    expect(reaisParaCentavos("R$ 8")).toBe(800);
    expect(reaisParaCentavos("")).toBeNull();
    expect(reaisParaCentavos("oito")).toBe("invalido");
    expect(reaisParaCentavos("8,0,0")).toBe("invalido");
    expect(centavosParaReais(800)).toBe("8,00");
    expect(centavosParaReais(null)).toBe("");
  });

  it("@spec:AC-906 valor que não é dinheiro é apontado no campo e nada vai para a API", async () => {
    const chamadas = simularApi(() => ({ status: 200, corpo: ENTREGA_SALVA }));
    const tela = montar(<FormularioEntrega />);
    await esperar();

    digitar(exigir(tela, 'input[name="taxaCentavos"]'), "oito reais");
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(chamadas.some((chamada) => chamada.metodo === "PUT")).toBe(false);
    expect(
      exigir(tela, 'input[name="taxaCentavos"]').getAttribute("aria-invalid"),
    ).toBe("true");
  });
});

describe("os modos de recebimento (AC-905)", () => {
  it("@spec:AC-905 desligar entrega e retirada avisa o dono do que isso significa", async () => {
    simularApi(() => ({ status: 200, corpo: ENTREGA_SALVA }));
    const tela = montar(<FormularioEntrega />);
    await esperar();

    clicar(exigir(tela, 'input[name="aceitaEntrega"]'));
    clicar(exigir(tela, 'input[name="aceitaRetirada"]'));

    expect(tela.textContent).toContain(
      "o cliente não consegue finalizar pedido",
    );
  });

  const ENTREGA_NA_TELA: EntregaDaLojaNaTela = {
    taxaCentavos: 700,
    nomeDaTaxa: "Motoboy",
    gratisAcimaDeCentavos: null,
    minimoParaEntregaCentavos: null,
  };

  async function checkout(formas: {
    aceitaEntrega: boolean;
    aceitaRetirada: boolean;
  }) {
    const conferir = vi.fn().mockResolvedValue({
      estado: "conferido",
      conferencia: {
        mudancas: [],
        precisaConfirmar: false,
        itens: [
          {
            itemId: "11111111-1111-4111-8111-111111111111",
            produtoId: "22222222-2222-4222-8222-222222222222",
            nome: "Marmita",
            quantidade: 1,
            precoUnitarioCentavos: 2_000,
            totalDaLinhaCentavos: 2_000,
          },
        ],
        subtotalCentavos: 2_000,
      },
    });
    const tela = montar(
      <FechamentoDaCompra
        apelidoDaLoja="marmitaria"
        formas={formas}
        formasDePagamento={["CASH"]}
        pix={null}
        entrega={ENTREGA_NA_TELA}
        linkDoCatalogo="/loja/marmitaria/cardapio"
        rotuloDoCatalogo="Cardápio"
        conta={{ nome: "Ana Paula", email: "ana@cliente.test", telefone: "+5511988887777" }}
        conferir={conferir as never}
        fechar={vi.fn() as never}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await esperar();
    return tela;
  }

  it("@spec:AC-905 o checkout oferece exatamente os modos ativados", async () => {
    const soEntrega = await checkout({
      aceitaEntrega: true,
      aceitaRetirada: false,
    });
    expect(soEntrega.textContent).toContain("receber em casa");
    expect(soEntrega.textContent).not.toContain("Retirar no local");
    desmontar();

    const osDois = await checkout({
      aceitaEntrega: true,
      aceitaRetirada: true,
    });
    const opcoes = [
      ...osDois.querySelectorAll<HTMLInputElement>('input[name="entrega"]'),
    ].map((opcao) => opcao.value);
    expect(opcoes).toEqual(["DELIVERY", "PICKUP"]);
  });

  it("@spec:AC-905 sem nenhum modo ativo o cliente não tem como finalizar", async () => {
    const tela = await checkout({
      aceitaEntrega: false,
      aceitaRetirada: false,
    });

    expect(tela.querySelector("form")).toBeNull();
    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "não está recebendo pedidos",
    );
    expect(tela.textContent).not.toContain("Retirar no local");
  });
});
