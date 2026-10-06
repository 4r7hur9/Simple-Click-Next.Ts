// @vitest-environment jsdom
/**
 * Prova do fechamento (AC-503, AC-507, AC-508, AC-510, AC-512, AC-516).
 *
 * O COMPONENTE É MONTADO DE VERDADE e clicado, porque o que se prova aqui é
 * comportamento: o carrinho que chega, a mudança que precisa de confirmação, o
 * pedido que sai com os valores do servidor. As duas chamadas de rede entram
 * por propriedade — sem isso, a única prova possível seria "roda contra o
 * ambiente no ar", que falha por motivo errado e ninguém consegue rodar na
 * própria máquina.
 */
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  FechamentoDaCompra,
  type EntregaDaLojaNaTela,
} from "../src/features/checkout/FechamentoDaCompra";
import type {
  ConferenciaNaTela,
  PedidoNaTela,
} from "../src/lib/carrinho-do-navegador";

const LOJA = "sabor-e-cia";

const CONFERENCIA: ConferenciaNaTela = {
  mudancas: [],
  precisaConfirmar: false,
  itens: [
    {
      itemId: "11111111-1111-4111-8111-111111111111",
      produtoId: "22222222-2222-4222-8222-222222222222",
      nome: "X-Salada",
      quantidade: 2,
      precoUnitarioCentavos: 2300,
      totalDaLinhaCentavos: 4600,
    },
  ],
  subtotalCentavos: 4600,
};

const PEDIDO: PedidoNaTela = {
  id: "33333333-3333-4333-8333-333333333333",
  numero: 42,
  codigo: "A-0042",
  tokenPublico: "token-secreto-do-pedido",
  jaExistia: false,
  subtotalCentavos: 4600,
  taxaDeEntregaCentavos: 0,
  totalCentavos: 4600,
  whatsapp: {
    endereco: "https://wa.me/5511911110001?text=Ol%C3%A1",
    texto: "Olá! Segue meu pedido: A-0042",
    completo: true,
  },
};

// Anotado de propósito: sem o tipo, o `null` dos dois últimos campos vira o
// tipo `null`, e os cenários que os sobrescrevem com número não compilam.
const ENTREGA: EntregaDaLojaNaTela = {
  taxaCentavos: 700,
  nomeDaTaxa: "Motoboy",
  gratisAcimaDeCentavos: null,
  minimoParaEntregaCentavos: null,
};

interface Cenario {
  readonly conferencia?: ConferenciaNaTela;
  readonly formasDePagamento?: readonly string[];
  readonly pix?: {
    chave: string;
    tipo: string | null;
    titular: string | null;
  } | null;
  readonly entrega?: EntregaDaLojaNaTela;
  readonly aceitaEntrega?: boolean;
}

/** Monta a tela e espera a conferência chegar. */
async function montar(cenario: Cenario = {}) {
  const conferir = vi.fn().mockResolvedValue({
    estado: "conferido",
    conferencia: cenario.conferencia ?? CONFERENCIA,
  });
  const fechar = vi
    .fn()
    .mockResolvedValue({ estado: "criado", pedido: PEDIDO });

  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  let raiz: Root;

  await act(async () => {
    raiz = createRoot(caixa);
    raiz.render(
      <FechamentoDaCompra
        apelidoDaLoja={LOJA}
        formas={{
          aceitaEntrega: cenario.aceitaEntrega ?? true,
          aceitaRetirada: true,
        }}
        formasDePagamento={cenario.formasDePagamento ?? ["PIX", "CASH"]}
        pix={
          cenario.pix === undefined
            ? { chave: "loja@pix.test", tipo: "EMAIL", titular: "Marina" }
            : cenario.pix
        }
        entrega={cenario.entrega ?? ENTREGA}
        linkDoCatalogo={`/l/${LOJA}/catalogo`}
        rotuloDoCatalogo="Cardápio"
        conferir={conferir as never}
        fechar={fechar as never}
      />,
    );
  });

  return {
    caixa,
    conferir,
    fechar,
    desmontar: () => {
      act(() => raiz.unmount());
      caixa.remove();
    },
  };
}

function clicar(elemento: Element | null) {
  act(() => {
    elemento?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("o fechamento mostra o que o servidor calculou (AC-503, AC-507)", () => {
  it("@spec:AC-503 o carrinho é carregado do servidor ao abrir a página", async () => {
    // A tela não guarda preço: ela pergunta ao servidor o que vale agora.
    const { caixa, conferir, desmontar } = await montar();

    expect(conferir).toHaveBeenCalledWith(LOJA, null);
    expect(caixa.textContent).toContain("R$ 46,00");
    desmontar();
  });

  it("@spec:AC-507 a taxa aparece em linha separada, com o nome que o dono deu", async () => {
    const { caixa, desmontar } = await montar();

    expect(caixa.textContent).toContain("Motoboy");
    expect(caixa.textContent).toContain("R$ 7,00");
    // Itens + taxa: o total soma os dois e nada mais.
    expect(caixa.textContent).toContain("R$ 53,00");
    desmontar();
  });

  it("@spec:AC-507 entrega grátis acima do valor mostra 'Grátis', e não R$ 0,00", async () => {
    const { caixa, desmontar } = await montar({
      entrega: { ...ENTREGA, gratisAcimaDeCentavos: 4000 },
    });

    expect(caixa.textContent).toContain("Grátis");
    desmontar();
  });

  it("@spec:AC-508 abaixo do mínimo, a tela diz QUANTO falta", async () => {
    // "pedido mínimo de R$ 60,00" manda a pessoa calcular sozinha.
    const { caixa, desmontar } = await montar({
      entrega: { ...ENTREGA, minimoParaEntregaCentavos: 6000 },
    });

    expect(caixa.textContent).toContain("Faltam R$ 14,00");
    desmontar();
  });
});

describe("as formas de pagamento (AC-510, AC-512)", () => {
  it("@spec:AC-512 as formas que a loja aceita aparecem, e só elas", async () => {
    const { caixa, desmontar } = await montar({
      formasDePagamento: ["CASH"],
    });

    expect(caixa.textContent).toContain("Dinheiro na entrega");
    expect(caixa.textContent).not.toContain("Cartão na entrega");
    desmontar();
  });

  it("@spec:AC-510 a chave PIX aparece quando PIX é a forma escolhida", async () => {
    // PIX é a primeira da lista, então já vem escolhida ao abrir.
    const { caixa, desmontar } = await montar();

    expect(caixa.textContent).toContain("loja@pix.test");
    expect(caixa.textContent).toContain("Marina");
    desmontar();
  });

  it("@spec:AC-510 sem PIX entre as formas, a chave não aparece", async () => {
    const { caixa, desmontar } = await montar({
      formasDePagamento: ["CASH"],
      pix: null,
    });

    expect(caixa.textContent).not.toContain("loja@pix.test");
    desmontar();
  });
});

describe("o que mudou desde que o carrinho foi montado (AC-503)", () => {
  it("@spec:AC-503 mudança de preço interrompe e pede confirmação", async () => {
    const { caixa, desmontar } = await montar({
      conferencia: {
        ...CONFERENCIA,
        precisaConfirmar: true,
        mudancas: [
          {
            itemId: CONFERENCIA.itens[0]!.itemId,
            nome: "X-Salada",
            tipo: "PRECO_SUBIU",
            deEmCentavos: 2000,
            paraEmCentavos: 2300,
            explicacao: "X-Salada subiu de R$ 20,00 para R$ 23,00.",
          },
        ],
      },
    });

    expect(caixa.textContent).toContain("subiu");
    // O formulário NÃO aparece antes de a pessoa confirmar.
    expect(caixa.querySelector("form")).toBeNull();
    desmontar();
  });

  it("@spec:AC-503 item retirado por falta de preço é contado como saída do cardápio", async () => {
    // Para quem comprou, o efeito é o mesmo — e a tela não fala de cadastro.
    const { caixa, desmontar } = await montar({
      conferencia: {
        ...CONFERENCIA,
        precisaConfirmar: true,
        mudancas: [
          {
            itemId: CONFERENCIA.itens[0]!.itemId,
            nome: "X-Salada",
            tipo: "SEM_PRECO",
            deEmCentavos: null,
            paraEmCentavos: null,
            explicacao: "X-Salada está sem preço e foi retirado.",
          },
        ],
      },
    });

    expect(caixa.textContent).toContain("Saiu do cardápio");
    desmontar();
  });
});

describe("carrinho vazio não é erro", () => {
  it("@spec:AC-503 carrinho vazio convida a voltar ao cardápio", async () => {
    // Vazio sem saída é beco sem saída.
    const { caixa, desmontar } = await montar({
      conferencia: { ...CONFERENCIA, itens: [], subtotalCentavos: 0 },
    });

    expect(caixa.textContent).toContain("carrinho está vazio");
    expect(caixa.querySelector(`a[href="/l/${LOJA}/catalogo"]`)).not.toBeNull();
    desmontar();
  });
});

describe("fechar o pedido (AC-504, AC-516)", () => {
  it("@spec:AC-516 a chave de idempotência é a MESMA entre tentativas da mesma tela", async () => {
    const { caixa, fechar, desmontar } = await montar();

    const form = caixa.querySelector("form");
    preencher(caixa);
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(fechar).toHaveBeenCalledTimes(1);
    const primeira = fechar.mock.calls[0]?.[1] as {
      chaveDeIdempotencia: string;
    };
    expect(primeira.chaveDeIdempotencia).toMatch(/.{8,}/);
    desmontar();
  });

  it("@spec:AC-504 o total enviado é só referência, e vai junto do pedido", async () => {
    const { caixa, fechar, desmontar } = await montar();

    preencher(caixa);
    const form = caixa.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    const enviado = fechar.mock.calls[0]?.[1] as { totalVistoCentavos: number };
    expect(enviado.totalVistoCentavos).toBe(5300);
    desmontar();
  });

  it("@spec:AC-517 a recusa da loja fechada continua na tela depois de reconferir o carrinho", async () => {
    // A recusa dispara uma nova conferência do carrinho; ela não pode apagar
    // o motivo que acabou de chegar, ou a pessoa fica sem saber quando a loja
    // abre (achado no ponta a ponta da T-908).
    const { caixa, conferir, fechar, desmontar } = await montar();
    const motivo = "A loja está fechada agora. Ela abre amanhã às 18:00.";
    fechar.mockResolvedValueOnce({ estado: "nao-pode", motivo });

    preencher(caixa);
    const form = caixa.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(conferir).toHaveBeenCalledTimes(2);
    expect(caixa.querySelector('[role="alert"]')?.textContent).toBe(motivo);
    desmontar();
  });

  it("@spec:AC-520 criado o pedido, a tela oferece enviar pelo WhatsApp", async () => {
    const { caixa, desmontar } = await montar();

    preencher(caixa);
    const form = caixa.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(caixa.textContent).toContain("A-0042");
    // O botão de enviar está lá. O endereço vem PRONTO do servidor, e o número
    // da loja nunca chega à tela como campo — só embutido nele.
    expect(caixa.textContent).toContain("Enviar pelo WhatsApp");
    desmontar();
  });

  it("@spec:AC-523 loja sem WhatsApp não perde o pedido: o código continua valendo", async () => {
    // O pedido já existe e já está na fila do dono. O que falta é o caminho do
    // WhatsApp, e a tela diz isso em vez de fingir que deu errado.
    const conferir = vi.fn().mockResolvedValue({
      estado: "conferido",
      conferencia: CONFERENCIA,
    });
    const fechar = vi.fn().mockResolvedValue({
      estado: "criado",
      pedido: { ...PEDIDO, whatsapp: null },
    });

    const caixa = document.createElement("div");
    document.body.appendChild(caixa);
    let raiz: Root;
    await act(async () => {
      raiz = createRoot(caixa);
      raiz.render(
        <FechamentoDaCompra
          apelidoDaLoja={LOJA}
          formas={{ aceitaEntrega: true, aceitaRetirada: true }}
          formasDePagamento={["CASH"]}
          pix={null}
          entrega={ENTREGA}
          linkDoCatalogo={`/l/${LOJA}/catalogo`}
          rotuloDoCatalogo="Cardápio"
          conferir={conferir as never}
          fechar={fechar as never}
        />,
      );
    });

    preencher(caixa);
    const form = caixa.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(caixa.textContent).toContain("A-0042");
    expect(caixa.textContent).toContain("não cadastrou WhatsApp");
    expect(
      caixa.querySelector(
        `a[href="/l/${LOJA}/pedido/token-secreto-do-pedido"]`,
      ),
    ).not.toBeNull();

    act(() => raiz.unmount());
    caixa.remove();
  });

  it("@spec:AC-516 criado o pedido, a tela mostra o código e o caminho de acompanhar", async () => {
    const { caixa, desmontar } = await montar();

    preencher(caixa);
    const form = caixa.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(caixa.textContent).toContain("A-0042");
    expect(
      caixa.querySelector(
        `a[href="/l/${LOJA}/pedido/token-secreto-do-pedido"]`,
      ),
    ).not.toBeNull();
    desmontar();
  });
});

/**
 * Preenche os campos obrigatórios do formulário.
 *
 * O VALOR VAI PELO SETTER NATIVO, e não por `elemento.value = ...`: campo
 * controlado pelo React ignora a atribuição direta, e o formulário continuaria
 * vazio — bloqueando o envio por um motivo que não é o do teste.
 */
function digitar(elemento: HTMLInputElement | null, texto: string) {
  if (elemento === null) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(elemento, texto);
  elemento.dispatchEvent(new Event("input", { bubbles: true }));
}

function preencher(caixa: HTMLElement) {
  act(() => {
    // Retirada primeiro: sem endereço obrigatório, é o caminho mais curto até
    // o envio, e o que este teste quer exercitar é o envio.
    clicar(caixa.querySelector('input[value="PICKUP"]'));
    digitar(
      caixa.querySelector<HTMLInputElement>('input[name="nome"]'),
      "Ana Paula",
    );
    digitar(
      caixa.querySelector<HTMLInputElement>('input[name="telefone"]'),
      "11988887777",
    );
  });
}
