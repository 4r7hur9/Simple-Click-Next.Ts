// @vitest-environment jsdom
/**
 * Prova do fechamento na janela do carrinho, com conta obrigatória.
 *
 * O que se prova: os dados de quem pede vêm da CONTA (sem digitar de novo), o
 * telefone só é pedido quando a conta não tem, os endereços salvos aparecem
 * para escolher com o padrão marcado, o novo é salvo na conta, a retirada não
 * pede endereço, e sem sessão a janela de acesso abre e, ao entrar, o
 * fechamento segue. As chamadas de rede entram por propriedade.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  FechamentoDaCompra,
  type FechamentoDaCompraProps,
} from "../src/features/checkout/FechamentoDaCompra";
import { PassoDoFechamento } from "../src/features/checkout/PassoDoFechamento";
import {
  telefoneParaLer,
  type PreparoDoFechamento,
} from "../src/features/checkout/preparo-do-fechamento";
import type { ConferenciaNaTela } from "../src/lib/carrinho-do-navegador";
import type { EnderecoSalvo } from "../src/lib/enderecos-da-conta";

const LOJA = "pastelaria-da-vila";

const CONFERENCIA: ConferenciaNaTela = {
  mudancas: [],
  precisaConfirmar: false,
  itens: [
    {
      itemId: "11111111-1111-4111-8111-111111111111",
      produtoId: "22222222-2222-4222-8222-222222222222",
      nome: "Pastel de carne",
      quantidade: 2,
      precoUnitarioCentavos: 1200,
      totalDaLinhaCentavos: 2400,
    },
  ],
  subtotalCentavos: 2400,
};

const CASA: EnderecoSalvo = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rotulo: "Casa",
  destinatario: null,
  logradouro: "Rua das Flores",
  numero: "120",
  complemento: null,
  bairro: "Centro",
  cidade: "Fortaleza",
  estado: "CE",
  cep: null,
  pontoDeReferencia: null,
  padrao: false,
};

const TRABALHO: EnderecoSalvo = {
  ...CASA,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  rotulo: "Trabalho",
  logradouro: "Av. Santos Dumont",
  numero: "900",
  padrao: true,
};

const CONTA = {
  nome: "Ana Paula",
  email: "ana@cliente.test",
  telefone: "+5585999998888",
};

const PEDIDO = {
  id: "33333333-3333-4333-8333-333333333333",
  numero: 7,
  codigo: "A-0007",
  tokenPublico: "token-do-pedido",
  jaExistia: false,
  subtotalCentavos: 2400,
  taxaDeEntregaCentavos: 500,
  totalCentavos: 2900,
  whatsapp: null,
};

let desmontar: (() => void) | null = null;

afterEach(() => {
  desmontar?.();
  desmontar = null;
});

async function esperar() {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
}

async function montar(elemento: React.ReactElement) {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  let raiz: Root;
  await act(async () => {
    raiz = createRoot(caixa);
    raiz.render(elemento);
  });
  await esperar();
  desmontar = () => {
    act(() => raiz.unmount());
    caixa.remove();
  };
  return caixa;
}

function fechamento(props: Partial<FechamentoDaCompraProps> = {}) {
  const fechar = vi.fn().mockResolvedValue({ estado: "criado", pedido: PEDIDO });
  const salvarEndereco = vi.fn();
  const elemento = (
    <FechamentoDaCompra
      apelidoDaLoja={LOJA}
      formas={{
        aceitaEntrega: true,
        aceitaRetirada: true,
        enderecoDaLoja: "Rua da Vila, 10 · Centro",
      }}
      formasDePagamento={["PIX", "CASH"]}
      pix={{ chave: "vila@pix.test", tipo: "EMAIL", titular: "Vila" }}
      entrega={{
        taxaCentavos: 500,
        nomeDaTaxa: "Taxa de entrega",
        gratisAcimaDeCentavos: null,
        minimoParaEntregaCentavos: null,
      }}
      linkDoCatalogo={`/loja/${LOJA}/cardapio`}
      rotuloDoCatalogo="Cardápio"
      conta={CONTA}
      enderecos={[TRABALHO, CASA]}
      conferir={
        vi
          .fn()
          .mockResolvedValue({ estado: "conferido", conferencia: CONFERENCIA }) as never
      }
      fechar={fechar as never}
      salvarEndereco={salvarEndereco as never}
      {...props}
    />
  );
  return { elemento, fechar, salvarEndereco };
}

function clicar(elemento: Element | null) {
  act(() => {
    elemento?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function digitar(elemento: HTMLInputElement | null, texto: string) {
  if (elemento === null) return;
  act(() => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set?.call(elemento, texto);
    elemento.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function confirmar(caixa: HTMLElement) {
  await act(async () => {
    caixa
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("quem pede vem da conta", () => {
  it("mostra nome e telefone da conta numa linha, sem campos para digitar", async () => {
    const caixa = await montar(fechamento().elemento);

    expect(caixa.textContent).toContain("Pedido de Ana Paula");
    expect(caixa.textContent).toContain("(85) 99999-8888");
    expect(caixa.querySelector('input[name="nome"]')).toBeNull();
    expect(caixa.querySelector('input[name="telefone"]')).toBeNull();
  });

  it("conta sem telefone pede o telefone, e ele vai junto do pedido", async () => {
    const { elemento, fechar } = fechamento({
      conta: { ...CONTA, telefone: null },
    });
    const caixa = await montar(elemento);
    clicar(caixa.querySelector('input[value="PICKUP"]'));

    await confirmar(caixa);
    expect(fechar).not.toHaveBeenCalled();
    expect(caixa.textContent).toContain("Informe o telefone com DDD");

    digitar(
      caixa.querySelector<HTMLInputElement>('input[name="telefone"]'),
      "85 98888-7777",
    );
    await confirmar(caixa);
    expect(fechar.mock.calls[0]?.[1]).toMatchObject({
      telefone: "85 98888-7777",
      entrega: "PICKUP",
    });
  });

  it("formata o telefone da conta para ler", () => {
    expect(telefoneParaLer("+5585999998888")).toBe("(85) 99999-8888");
    expect(telefoneParaLer("+558533334444")).toBe("(85) 3333-4444");
    expect(telefoneParaLer("+351912345678")).toBe("+351912345678");
  });
});

describe("o endereço de entrega", () => {
  it("os endereços salvos aparecem para escolher, com o padrão já marcado", async () => {
    const caixa = await montar(fechamento().elemento);

    const opcoes = [
      ...caixa.querySelectorAll<HTMLInputElement>('input[name="endereco-salvo"]'),
    ];
    expect(opcoes.map((o) => o.value)).toEqual([TRABALHO.id, CASA.id]);
    expect(opcoes.find((o) => o.checked)?.value).toBe(TRABALHO.id);
    expect(caixa.textContent).toContain("Padrão");
  });

  it("confirmar envia o endereço escolhido pelo id, sem repetir os campos", async () => {
    const { elemento, fechar } = fechamento();
    const caixa = await montar(elemento);
    clicar(caixa.querySelector(`input[value="${CASA.id}"]`));

    await confirmar(caixa);
    const enviado = fechar.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(enviado["enderecoId"]).toBe(CASA.id);
    expect(enviado["endereco"]).toBeUndefined();
    expect(enviado["contato"]).toBeUndefined();
    expect(enviado["telefone"]).toBeUndefined();
    // Entrega: itens + taxa.
    expect(enviado["totalVistoCentavos"]).toBe(2900);
  });

  it("conta sem endereço abre direto os campos do novo, que vão junto do pedido", async () => {
    const { elemento, fechar } = fechamento({ enderecos: [] });
    const caixa = await montar(elemento);

    expect(caixa.querySelector("#endereco-logradouro")).not.toBeNull();
    await confirmar(caixa);
    expect(fechar).not.toHaveBeenCalled();
    expect(caixa.textContent).toContain("Informe a rua ou avenida.");

    digitar(caixa.querySelector("#endereco-logradouro"), "Rua Nova");
    digitar(caixa.querySelector("#endereco-numero"), "15");
    digitar(caixa.querySelector("#endereco-bairro"), "Aldeota");
    await confirmar(caixa);
    expect(fechar.mock.calls[0]?.[1]).toMatchObject({
      entrega: "DELIVERY",
      endereco: { logradouro: "Rua Nova", numero: "15", bairro: "Aldeota" },
    });
  });

  it("'Salvar endereço' guarda na conta e já deixa o novo escolhido", async () => {
    const novo: EnderecoSalvo = {
      ...CASA,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      rotulo: null,
      logradouro: "Rua Nova",
      numero: "15",
      bairro: "Aldeota",
    };
    const { elemento, salvarEndereco, fechar } = fechamento();
    salvarEndereco.mockResolvedValue({ estado: "salvo", endereco: novo });
    const caixa = await montar(elemento);

    const adicionar = [...caixa.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Adicionar novo endereço"),
    );
    clicar(adicionar ?? null);
    digitar(caixa.querySelector("#endereco-logradouro"), "Rua Nova");
    digitar(caixa.querySelector("#endereco-numero"), "15");
    digitar(caixa.querySelector("#endereco-bairro"), "Aldeota");
    const salvar = [...caixa.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Salvar endereço"),
    );
    await act(async () => {
      salvar?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(salvarEndereco).toHaveBeenCalledWith(
      expect.objectContaining({ logradouro: "Rua Nova", padrao: false }),
    );
    expect(
      caixa.querySelector<HTMLInputElement>(`input[value="${novo.id}"]`)
        ?.checked,
    ).toBe(true);

    await confirmar(caixa);
    expect(fechar.mock.calls[0]?.[1]).toMatchObject({ enderecoId: novo.id });
  });

  it("na retirada o endereço some, aparece o da loja, e nada de endereço vai junto", async () => {
    const { elemento, fechar } = fechamento();
    const caixa = await montar(elemento);
    clicar(caixa.querySelector('input[value="PICKUP"]'));

    expect(caixa.querySelector('input[name="endereco-salvo"]')).toBeNull();
    expect(caixa.textContent).toContain("Rua da Vila, 10 · Centro");
    await confirmar(caixa);
    const enviado = fechar.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(enviado["enderecoId"]).toBeUndefined();
    expect(enviado["endereco"]).toBeUndefined();
    expect(enviado["totalVistoCentavos"]).toBe(2400);
  });

  it("loja que só faz retirada não oferece entrega nem pede endereço", async () => {
    const caixa = await montar(
      fechamento({ formas: { aceitaEntrega: false, aceitaRetirada: true } })
        .elemento,
    );
    expect(caixa.querySelector("#entrega-DELIVERY")).toBeNull();
    expect(caixa.querySelector('input[name="endereco-salvo"]')).toBeNull();
    expect(caixa.textContent).toContain("retirar no local");
  });
});

describe("as recusas da API", () => {
  it("sessão vencida pede para entrar de novo", async () => {
    const aoPrecisarDeConta = vi.fn();
    const { elemento, fechar } = fechamento({ aoPrecisarDeConta });
    fechar.mockResolvedValueOnce({ estado: "sem-conta" });
    const caixa = await montar(elemento);

    await confirmar(caixa);
    expect(aoPrecisarDeConta).toHaveBeenCalledTimes(1);
    expect(caixa.querySelector('[role="alert"]')?.textContent).toContain(
      "Entre de novo",
    );
  });

  it("telefone recusado aparece junto do campo, com a frase da API", async () => {
    const { elemento, fechar } = fechamento({
      conta: { ...CONTA, telefone: null },
    });
    fechar.mockResolvedValueOnce({
      estado: "recusado",
      codigo: "telefone_invalido",
      motivo: "Esse número não parece um celular com DDD.",
    });
    const caixa = await montar(elemento);
    clicar(caixa.querySelector('input[value="PICKUP"]'));
    digitar(
      caixa.querySelector<HTMLInputElement>('input[name="telefone"]'),
      "1234567890",
    );

    await confirmar(caixa);
    expect(caixa.textContent).toContain("Esse número não parece um celular");
  });

  it("criado o pedido, mostra o código e o acompanhamento", async () => {
    const { elemento } = fechamento();
    const caixa = await montar(elemento);

    await confirmar(caixa);
    expect(caixa.textContent).toContain("A-0007");
    expect(
      caixa.querySelector(`a[href="/loja/${LOJA}/pedido/token-do-pedido"]`),
    ).not.toBeNull();
  });
});

describe("o passo do fechamento exige conta", () => {
  const PRONTO_SEM_CONTA: PreparoDoFechamento = {
    estado: "pronto",
    config: {
      formas: { aceitaEntrega: true, aceitaRetirada: true },
      formasDePagamento: ["CASH"],
      pix: null,
      entrega: {
        taxaCentavos: null,
        nomeDaTaxa: null,
        gratisAcimaDeCentavos: null,
        minimoParaEntregaCentavos: null,
      },
    },
    conta: null,
    enderecos: [],
  };

  it("sem sessão abre a janela de acesso e, ao entrar, segue no fechamento", async () => {
    const preparar = vi
      .fn()
      .mockResolvedValueOnce(PRONTO_SEM_CONTA)
      .mockResolvedValueOnce({ ...PRONTO_SEM_CONTA, conta: CONTA });
    const pedirConta = vi.fn();
    const caixa = await montar(
      <PassoDoFechamento
        apelidoDaLoja={LOJA}
        linkDoCatalogo={`/loja/${LOJA}/cardapio`}
        rotuloDoCatalogo="Cardápio"
        preparar={preparar}
        aoVoltar={vi.fn()}
        aoFecharJanela={vi.fn()}
        pedirConta={pedirConta}
        conferir={
          vi.fn().mockResolvedValue({
            estado: "conferido",
            conferencia: CONFERENCIA,
          }) as never
        }
      />,
    );

    expect(pedirConta).toHaveBeenCalledTimes(1);
    expect(caixa.textContent).toContain("Entre na sua conta para finalizar");
    expect(caixa.querySelector("form")).toBeNull();

    const opcoes = pedirConta.mock.calls[0]?.[0] as {
      aoEntrar: () => void;
    };
    await act(async () => {
      opcoes.aoEntrar();
    });
    await esperar();

    expect(preparar).toHaveBeenCalledTimes(2);
    expect(caixa.textContent).toContain("Pedido de Ana Paula");
    expect(caixa.querySelector("form")).not.toBeNull();
  });

  it("falha ao preparar mostra a mensagem e tenta de novo", async () => {
    const preparar = vi
      .fn()
      .mockResolvedValueOnce({ estado: "indisponivel" })
      .mockResolvedValueOnce({ ...PRONTO_SEM_CONTA, conta: CONTA });
    const caixa = await montar(
      <PassoDoFechamento
        apelidoDaLoja={LOJA}
        linkDoCatalogo={`/loja/${LOJA}/cardapio`}
        rotuloDoCatalogo="Cardápio"
        preparar={preparar}
        aoVoltar={vi.fn()}
        aoFecharJanela={vi.fn()}
        pedirConta={vi.fn()}
        conferir={
          vi.fn().mockResolvedValue({
            estado: "conferido",
            conferencia: CONFERENCIA,
          }) as never
        }
      />,
    );

    expect(caixa.textContent).toContain("Não deu para abrir o fechamento");
    const tentar = [...caixa.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Tentar de novo"),
    );
    await act(async () => {
      tentar?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await esperar();
    expect(caixa.querySelector("form")).not.toBeNull();
  });
});
