// @vitest-environment jsdom
/**
 * Prova de receber e pagar no fechamento (card #110, T-11005).
 *
 * As regras já existiam; o redesign só reorganiza a tela. Aqui se prova que
 * continuam valendo: só as formas que a loja oferece, a taxa e o mínimo, o PIX
 * copiável, o troco, e o erro do servidor junto do campo certo sem perder o
 * que a pessoa já preencheu.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  CASA,
  CONFERENCIA,
  CONTA,
  TRABALHO,
  botao,
  clicar,
  confirmar,
  desmontarTudo,
  digitar,
  fechamento,
  montar,
} from "./apoio-do-fechamento";

afterEach(desmontarTudo);

describe("[CA-10] entrega e retirada conforme a loja oferece (AC-11010)", () => {
  it("[CA-10] @spec:AC-11010 uma loja com as duas formas deixa escolher entre elas", async () => {
    const { caixa } = await montar(fechamento().elemento);

    const opcoes = [
      ...caixa.querySelectorAll<HTMLInputElement>('input[name="entrega"]'),
    ];
    expect(opcoes.map((o) => o.value)).toEqual(["DELIVERY", "PICKUP"]);
    expect(caixa.textContent).toContain("Receber em casa");
    expect(caixa.textContent).toContain("Retirar no local");
  });

  it("[CA-10] @spec:AC-11010 com uma forma só, aparece uma frase e nenhuma opção", async () => {
    const { caixa } = await montar(
      fechamento({
        formas: {
          aceitaEntrega: false,
          aceitaRetirada: true,
          enderecoDaLoja: "Rua da Vila, 10",
        },
      }).elemento,
    );

    expect(caixa.querySelector('input[name="entrega"]')).toBeNull();
    expect(caixa.textContent).toContain("Esta loja atende por");
    expect(caixa.textContent).toContain("retirar no local");
  });

  it("[CA-10] @spec:AC-11010 sem nenhuma das duas, explica e não deixa concluir", async () => {
    const { caixa } = await montar(
      fechamento({
        formas: { aceitaEntrega: false, aceitaRetirada: false },
      }).elemento,
    );

    expect(caixa.querySelector('[role="alert"]')?.textContent).toContain(
      "não está recebendo pedidos",
    );
    expect(caixa.querySelector("form")).toBeNull();
    expect(caixa.querySelector('button[type="submit"]')).toBeNull();
  });
});

describe("[CA-11] endereço salvo, taxa e pedido mínimo (AC-11011)", () => {
  it("[CA-11] @spec:AC-11011 a taxa da loja entra no total da entrega e sai na retirada", async () => {
    const { caixa } = await montar(fechamento().elemento);

    clicar(caixa.querySelector(`input[value="${CASA.id}"]`));
    const resumo = caixa.querySelector(".sc-resumo")?.textContent ?? "";
    expect(resumo).toContain("Taxa de entrega");
    expect(resumo).toContain("R$ 5,00");
    // 2 × R$ 12,00 + R$ 5,00.
    expect(resumo).toContain("R$ 29,00");

    clicar(caixa.querySelector('input[value="PICKUP"]'));
    expect(caixa.querySelector(".sc-resumo")?.textContent).not.toContain(
      "Taxa de entrega",
    );
  });

  it("[CA-11] @spec:AC-11011 abaixo do mínimo diz quanto falta e bloqueia o envio", async () => {
    const { elemento, fechar } = fechamento({
      entrega: {
        taxaCentavos: 500,
        nomeDaTaxa: "Taxa de entrega",
        gratisAcimaDeCentavos: null,
        minimoParaEntregaCentavos: 3000,
      },
    });
    const { caixa } = await montar(elemento);

    // Subtotal R$ 24,00 contra mínimo de R$ 30,00.
    expect(caixa.textContent).toContain("Faltam R$ 6,00");
    const enviar = caixa.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(enviar?.disabled).toBe(true);

    await confirmar(caixa);
    expect(fechar).not.toHaveBeenCalled();
  });

  it("[CA-11] @spec:AC-11011 dá para cadastrar um endereço novo sem sair do fechamento", async () => {
    const { caixa } = await montar(fechamento().elemento);

    clicar(botao(caixa, "Adicionar novo endereço"));
    expect(caixa.querySelector("#endereco-logradouro")).not.toBeNull();
    // Continua no fechamento: o resumo e o botão de confirmar seguem à vista.
    expect(caixa.querySelector('button[type="submit"]')).not.toBeNull();
  });
});

describe("[CA-12] só as formas de pagamento da loja (AC-11012)", () => {
  it("[CA-12] @spec:AC-11012 aparecem PIX e dinheiro, e mais nada; sem dado de cartão", async () => {
    const { caixa } = await montar(fechamento().elemento);

    const formas = [
      ...caixa.querySelectorAll<HTMLInputElement>(
        '.sc-pagamento input[type="radio"]',
      ),
    ].map((entrada) => entrada.value);
    expect(formas).toEqual(["PIX", "CASH"]);
    expect(caixa.querySelector('input[autocomplete^="cc-"]')).toBeNull();
    expect(caixa.querySelector('input[name*="cartao" i]')).toBeNull();
    expect(caixa.textContent).not.toMatch(/parcel|boleto|cupom/i);
  });

  it("[CA-12] @spec:AC-11012 PIX mostra a chave da loja com o botão de copiar", async () => {
    const { caixa } = await montar(fechamento().elemento);

    clicar(caixa.querySelector('input[value="PIX"]'));
    expect(caixa.textContent).toContain("loja@pix.test");
    expect(botao(caixa, "Copiar")).toBeDefined();
  });

  it("[CA-12] @spec:AC-11012 dinheiro deixa informar o troco", async () => {
    const { caixa } = await montar(fechamento().elemento);

    expect(caixa.querySelector('input[name="trocoPara"]')).toBeNull();
    clicar(caixa.querySelector('input[value="CASH"]'));
    expect(caixa.querySelector('input[name="trocoPara"]')).not.toBeNull();
  });
});

describe("[CA-13] dado recusado no campo certo, sem perder o resto (AC-11013)", () => {
  it("[CA-13] @spec:AC-11013 o telefone recusado aparece junto do campo, e o resto continua", async () => {
    const { elemento, fechar } = fechamento({
      conta: { ...CONTA, telefone: null },
      enderecos: [],
    });
    const { caixa } = await montar(elemento);
    fechar.mockResolvedValueOnce({
      estado: "recusado",
      codigo: "telefone_invalido",
      motivo: "Esse telefone não parece válido.",
    } as never);

    clicar(caixa.querySelector('input[value="PICKUP"]'));
    clicar(caixa.querySelector('input[value="CASH"]'));
    digitar(
      caixa.querySelector<HTMLTextAreaElement | HTMLInputElement>(
        "#checkout-observacao",
      ),
      "tocar o interfone",
    );
    digitar(
      caixa.querySelector<HTMLInputElement>('input[name="telefone"]'),
      "85 98888-7777",
    );
    await confirmar(caixa);

    const campo = caixa.querySelector<HTMLInputElement>(
      'input[name="telefone"]',
    );
    expect(campo?.getAttribute("aria-invalid")).toBe("true");
    expect(caixa.textContent).toContain("Esse telefone não parece válido.");
    // Nada foi perdido.
    expect(
      caixa.querySelector<HTMLInputElement>('input[value="PICKUP"]')?.checked,
    ).toBe(true);
    expect(
      caixa.querySelector<HTMLInputElement>('input[value="CASH"]')?.checked,
    ).toBe(true);
    expect(
      caixa.querySelector<HTMLInputElement>("#checkout-observacao")?.value,
    ).toBe("tocar o interfone");
  });

  it("[CA-13] @spec:AC-11013 o servidor que exige o endereço mostra a frase no grupo do endereço", async () => {
    const { elemento, fechar } = fechamento();
    const { caixa } = await montar(elemento);
    fechar.mockResolvedValueOnce({
      estado: "recusado",
      codigo: "endereco_obrigatorio",
      motivo: "Escolha onde entregar.",
    } as never);

    clicar(caixa.querySelector(`input[value="${TRABALHO.id}"]`));
    await confirmar(caixa);

    const alerta = caixa.querySelector("#endereco-erro");
    expect(alerta?.textContent).toContain("Escolha onde entregar.");
    expect(alerta?.closest("fieldset")).not.toBeNull();
    // A forma de receber continua a mesma.
    expect(
      caixa.querySelector<HTMLInputElement>('input[value="DELIVERY"]')?.checked,
    ).toBe(true);
    expect(CONFERENCIA.itens).toHaveLength(1);
  });
});
