// @vitest-environment jsdom
/**
 * Prova do formulário de fechamento (AC-505, AC-506, AC-508, AC-509).
 *
 * As regras já estão provadas na borda da API. Aqui a pergunta é se a pessoa
 * consegue CHEGAR ao fim do formulário: se ela não digita endereço à toa, se
 * vê todos os campos pendentes de uma vez, e se o que ela já preencheu
 * sobrevive a uma recusa.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  FormularioCheckout,
  type EnvioDoFechamento,
} from "../src/features/checkout/FormularioCheckout";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const AS_DUAS = {
  aceitaEntrega: true,
  aceitaRetirada: true,
  enderecoDaLoja: "Rua da Loja, 45 - Centro",
};

function montar(
  sobrescrita: Partial<Parameters<typeof FormularioCheckout>[0]> = {},
): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() =>
    raiz?.render(
      <FormularioCheckout
        formas={AS_DUAS}
        aoEnviar={() => {}}
        {...sobrescrita}
      />,
    ),
  );
  return container;
}

function campo(dentro: HTMLElement, id: string): HTMLInputElement {
  const achado = dentro.querySelector<HTMLInputElement>(`#${id}`);
  if (!achado) throw new Error(`não existe campo #${id}`);
  return achado;
}

function digitar(elemento: HTMLInputElement, texto: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(elemento, texto);
  elemento.dispatchEvent(new Event("input", { bubbles: true }));
}

function enviar(dentro: HTMLElement) {
  const formulario = dentro.querySelector("form");
  formulario?.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
}

describe("a escolha decide se o endereço existe (AC-505)", () => {
  it("@spec:AC-505 na entrega os campos de endereço aparecem", () => {
    const tela = montar();

    expect(tela.querySelector("#endereco-logradouro")).not.toBeNull();
    expect(tela.querySelector("#endereco-bairro")).not.toBeNull();
  });

  it("@spec:AC-505 na retirada o endereço some e o da LOJA é mostrado", async () => {
    // Pedir endereço antes de saber se vai haver entrega faz a pessoa digitar
    // sete campos para depois descobrir que não precisava.
    const tela = montar();

    await act(async () => {
      campo(tela, "entrega-PICKUP").click();
    });

    expect(tela.querySelector("#endereco-logradouro")).toBeNull();
    expect(tela.textContent).toContain("Rua da Loja, 45 - Centro");
  });

  it("@spec:AC-505 voltar para entrega traz os campos de volta com o que já foi digitado", async () => {
    const tela = montar();
    digitar(campo(tela, "endereco-logradouro"), "Rua das Flores");

    await act(async () => {
      campo(tela, "entrega-PICKUP").click();
    });
    await act(async () => {
      campo(tela, "entrega-DELIVERY").click();
    });

    expect(campo(tela, "endereco-logradouro").value).toBe("Rua das Flores");
  });
});

describe("a loja só oferece o que ela faz (AC-506)", () => {
  it("@spec:AC-506 loja que só faz retirada NÃO mostra a opção de entrega", () => {
    // Opção desabilitada com aviso ao lado é convite para tentar. Aqui ela
    // simplesmente não existe.
    const tela = montar({
      formas: { ...AS_DUAS, aceitaEntrega: false },
    });

    expect(tela.querySelector("#entrega-DELIVERY")).toBeNull();
    expect(tela.querySelector("#endereco-logradouro")).toBeNull();
    expect(tela.textContent).toContain("retirar no local");
  });

  it("@spec:AC-506 loja que só faz entrega já começa na entrega, sem grupo de uma opção só", () => {
    const tela = montar({
      formas: { ...AS_DUAS, aceitaRetirada: false },
    });

    expect(tela.querySelector("#entrega-PICKUP")).toBeNull();
    expect(tela.querySelector("#endereco-logradouro")).not.toBeNull();
  });
});

describe("os campos pendentes são apontados antes de enviar (AC-508)", () => {
  it("@spec:AC-508 formulário vazio não envia e aponta todos os pendentes de uma vez", async () => {
    // Um por vez faz a pessoa corrigir, enviar, descobrir outro, e desistir no
    // terceiro.
    let enviados = 0;
    const tela = montar({
      aoEnviar: () => {
        enviados += 1;
      },
    });

    await act(async () => {
      enviar(tela);
    });

    expect(enviados).toBe(0);
    expect(tela.textContent).toContain("campos precisam da sua atenção");
    expect(tela.textContent).toContain("Informe seu nome");
    expect(tela.textContent).toContain("Informe o bairro");
  });

  it("@spec:AC-508 o que já foi preenchido sobrevive à recusa", async () => {
    const tela = montar();
    digitar(campo(tela, "checkout-nome"), "Maria Conceição");

    await act(async () => {
      enviar(tela);
    });

    expect(campo(tela, "checkout-nome").value).toBe("Maria Conceição");
    // E o erro que sobrou é do que falta, não do que já está certo.
    expect(tela.textContent).not.toContain("Informe seu nome");
  });

  it("@spec:AC-508 na retirada o endereço não é cobrado", async () => {
    // Lista, e não uma variável que começa nula: o compilador não acompanha
    // atribuição feita dentro de retorno de chamada, estreita o tipo para nulo
    // e depois para `never` — e as asserções param de significar alguma coisa.
    const enviados: EnvioDoFechamento[] = [];
    const tela = montar({ aoEnviar: (dados) => enviados.push(dados) });

    await act(async () => {
      campo(tela, "entrega-PICKUP").click();
    });
    digitar(campo(tela, "checkout-nome"), "João Paulo");
    digitar(campo(tela, "checkout-telefone"), "11988887777");

    await act(async () => {
      enviar(tela);
    });

    expect(enviados).toHaveLength(1);
    // Endereço vai NULO: mandá-lo seria enviar dado pessoal que ninguém pediu,
    // e o servidor recusa a chave num pedido de retirada.
    expect(enviados[0]?.endereco).toBeNull();
    expect(enviados[0]?.entrega).toBe("PICKUP");
  });

  it("@spec:AC-508 na entrega o pedido só sai com o endereço mínimo", async () => {
    // Lista, e não uma variável que começa nula: o compilador não acompanha
    // atribuição feita dentro de retorno de chamada, estreita o tipo para nulo
    // e depois para `never` — e as asserções param de significar alguma coisa.
    const enviados: EnvioDoFechamento[] = [];
    const tela = montar({ aoEnviar: (dados) => enviados.push(dados) });

    digitar(campo(tela, "checkout-nome"), "Ana Souza");
    digitar(campo(tela, "checkout-telefone"), "11977776666");
    digitar(campo(tela, "endereco-logradouro"), "Rua das Flores");
    digitar(campo(tela, "endereco-numero"), "123");
    digitar(campo(tela, "endereco-bairro"), "Centro");

    await act(async () => {
      enviar(tela);
    });

    expect(enviados[0]?.endereco?.bairro).toBe("Centro");
  });
});

describe("quem já pediu chega com os dados preenchidos (AC-509)", () => {
  it("@spec:AC-509 nome, telefone e endereço vêm preenchidos", () => {
    const tela = montar({
      conhecidos: {
        nome: "Carla Dias",
        telefone: "5511966665555",
        endereco: { logradouro: "Av. Brasil", numero: "900", bairro: "Jardim" },
      },
    });

    expect(campo(tela, "checkout-nome").value).toBe("Carla Dias");
    expect(campo(tela, "checkout-telefone").value).toBe("5511966665555");
    expect(campo(tela, "endereco-logradouro").value).toBe("Av. Brasil");
    expect(campo(tela, "endereco-bairro").value).toBe("Jardim");
  });

  it("@spec:AC-509 os campos preenchidos são EDITÁVEIS, e não travados", () => {
    // Preenchido e travado seria pior que vazio: a pessoa mudou de casa e não
    // tem como corrigir.
    const tela = montar({
      conhecidos: { nome: "Carla Dias", endereco: { bairro: "Jardim" } },
    });

    expect(campo(tela, "checkout-nome").disabled).toBe(false);
    digitar(campo(tela, "endereco-bairro"), "Centro");
    expect(campo(tela, "endereco-bairro").value).toBe("Centro");
  });

  it("@spec:AC-509 quem nunca pediu vê os campos vazios, sem inventar nada", () => {
    const tela = montar();

    expect(campo(tela, "checkout-nome").value).toBe("");
    expect(campo(tela, "endereco-bairro").value).toBe("");
  });
});
