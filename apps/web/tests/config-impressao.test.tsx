// @vitest-environment jsdom
/**
 * Prova da tela de impressão do cupom (T-906: AC-919, AC-920).
 *
 * A tela oferece a largura do rolo e os opcionais — e NÃO oferece interruptor
 * para o essencial, que sai em todo cupom.
 */
import { afterEach, describe, expect, it } from "vitest";

import { FormularioImpressao } from "../src/features/config/FormularioImpressao.tsx";
import {
  clicar,
  desmontar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

afterEach(desmontar);

const SALVA = {
  larguraMm: 80,
  conteudo: {
    pedido: true,
    itens: true,
    total: true,
    enderecoCliente: true,
    totalEmDestaque: false,
    observacoes: true,
  },
};

describe("formato do cupom na tela", () => {
  it("@spec:AC-919 trocar o papel para 58 mm envia a largura nova", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "PUT"
        ? { status: 204 }
        : { status: 200, corpo: SALVA },
    );
    const tela = montar(<FormularioImpressao />);
    await esperar();

    expect(tela.textContent).toContain("58 mm (32 colunas)");
    expect(tela.textContent).toContain("80 mm (48 colunas)");
    clicar(exigir(tela, 'input[name="larguraMm"][value="58"]'));
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(
      chamadas.find((chamada) => chamada.metodo === "PUT")?.corpo,
    ).toMatchObject({ larguraMm: 58 });
  });

  it("@spec:AC-920 o dono desliga o endereço e liga o total em destaque, e o essencial não tem interruptor", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "PUT"
        ? { status: 204 }
        : { status: 200, corpo: SALVA },
    );
    const tela = montar(<FormularioImpressao />);
    await esperar();

    for (const essencial of ["pedido", "itens", "total"]) {
      expect(
        tela.querySelector(`input[name="conteudo.${essencial}"]`),
      ).toBeNull();
    }
    expect(exigir(tela, "[data-essencial]").textContent).toMatch(
      /não podem ser\s+desligados/,
    );

    clicar(exigir(tela, 'input[name="conteudo.enderecoCliente"]'));
    clicar(exigir(tela, 'input[name="conteudo.totalEmDestaque"]'));
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(chamadas.find((chamada) => chamada.metodo === "PUT")?.corpo).toEqual(
      {
        larguraMm: 80,
        conteudo: {
          ...SALVA.conteudo,
          enderecoCliente: false,
          totalEmDestaque: true,
        },
      },
    );
  });
});
