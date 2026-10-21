// @vitest-environment jsdom
/**
 * Prova da tela de pagamento (T-901: AC-900, AC-901).
 *
 * A regra da chave está provada no domínio (`packages/core/src/chave-pix.test.ts`)
 * e o caminho até o checkout, contra o banco
 * (`apps/api/tests/config-pagamento.int.test.ts`). Aqui a pergunta é o que o
 * dono vê: a confirmação depois de salvar, e a recusa ao lado da chave.
 */
import { afterEach, describe, expect, it } from "vitest";

import { FormularioPagamento } from "../src/features/config/FormularioPagamento.tsx";
import { MENSAGEM_DE_RECUSA } from "../src/features/config/useSecao.ts";
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
import { seletorPeloNome } from "./apoio-seletor.ts";

afterEach(desmontar);

const SEM_PAGAMENTO = { formas: [], pix: null };

describe("cadastrar a chave PIX (AC-900)", () => {
  it("@spec:AC-900 o dono escolhe o tipo, informa a chave e o recebedor, e a confirmação aparece", async () => {
    let salvo: unknown = SEM_PAGAMENTO;
    const chamadas = simularApi((chamada) => {
      if (chamada.metodo === "PUT") {
        salvo = chamada.corpo;
        return { status: 204 };
      }
      return { status: 200, corpo: salvo };
    });
    const tela = montar(<FormularioPagamento />);
    await esperar();

    clicar(exigir(tela, 'input[name="forma-PIX"]'));
    clicar(exigir(tela, 'input[name="forma-CASH"]'));
    digitar(seletorPeloNome(tela, "pix.tipo"), "CPF");
    digitar(exigir(tela, 'input[name="pix.chave"]'), "529.982.247-25");
    digitar(exigir(tela, 'input[name="pix.titular"]'), "Zica da Silva");
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    const envio = chamadas.find((chamada) => chamada.metodo === "PUT");
    expect(envio?.corpo).toEqual({
      formas: ["PIX", "CASH"],
      pix: { tipo: "CPF", chave: "529.982.247-25", titular: "Zica da Silva" },
    });
    expect(exigir(tela, '[role="status"]').textContent).toBe(
      "Pagamento salvo. O PIX já aparece no seu checkout, com a chave e o nome de Zica da Silva.",
    );
  });

  it("@spec:AC-900 o campo da chave mostra o exemplo do tipo escolhido", async () => {
    simularApi(() => ({
      status: 200,
      corpo: {
        formas: ["PIX"],
        pix: { tipo: "TELEFONE", chave: "", titular: "" },
      },
    }));
    const tela = montar(<FormularioPagamento />);
    await esperar();

    const chave = exigir<HTMLInputElement>(tela, 'input[name="pix.chave"]');
    expect(chave.placeholder).toBe("(11) 91234-5678");
    digitar(seletorPeloNome(tela, "pix.tipo"), "CNPJ");
    expect(
      exigir<HTMLInputElement>(tela, 'input[name="pix.chave"]').placeholder,
    ).toBe("12.345.678/0001-95");
  });
});

describe("chave recusada (AC-901)", () => {
  it("@spec:AC-901 a recusa explica o formato ao lado da chave, e diz que a anterior continua valendo", async () => {
    const valendo = {
      formas: ["PIX"],
      pix: { tipo: "CPF", chave: "52998224725", titular: "Zica da Silva" },
    };
    const formato =
      "Chave do tipo CPF tem 11 dígitos, com ou sem pontos e traço — por exemplo 123.456.789-09 —, e precisa ser um CPF válido.";
    simularApi((chamada) =>
      chamada.metodo === "PUT"
        ? {
            status: 400,
            corpo: {
              erro: "entrada_invalida",
              campos: [
                { onde: "body", caminho: "pix.chave", mensagem: formato },
              ],
            },
          }
        : { status: 200, corpo: valendo },
    );
    const tela = montar(<FormularioPagamento />);
    await esperar();

    digitar(exigir(tela, 'input[name="pix.chave"]'), "529.982.247-26");
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    const chave = exigir<HTMLInputElement>(tela, 'input[name="pix.chave"]');
    expect(chave.getAttribute("aria-invalid")).toBe("true");
    expect(
      // O erro vem primeiro; depois dele, o texto do "i" da chave.
      exigir(tela, `#${chave.getAttribute("aria-describedby")?.split(" ")[0]}`)
        .textContent,
    ).toBe(formato);
    expect(exigir(tela, '[role="status"]').textContent).toBe(
      MENSAGEM_DE_RECUSA,
    );
  });
});
