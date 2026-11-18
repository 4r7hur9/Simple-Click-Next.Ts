// @vitest-environment jsdom
/**
 * Prova da conta, da loja fechada e do pedido criado (card #110, T-11007).
 *
 * O perigo desta tela é herdar o que é de outra pessoa: o servidor devolve o
 * pedido gravado a quem repetir a chave, sem olhar quem pede, e o pedido traz
 * nome, telefone e endereço. Por isso, depois de uma sessão perdida ou de uma
 * troca de conta, nada da conta anterior pode ir junto do envio.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { EVENTO_ACESSO_CONCLUIDO } from "../src/features/auth/JanelaDeAcesso";
import { PassoDoFechamento } from "../src/features/checkout/PassoDoFechamento";
import type { PreparoDoFechamento } from "../src/features/checkout/preparo-do-fechamento";
import { AVISO_DE_CARRINHO_MUDOU } from "../src/lib/carrinho-do-navegador";

import {
  CASA,
  CONTA,
  LOJA,
  OUTRA_CONTA,
  PEDIDO,
  TRABALHO,
  botao,
  clicarAsync,
  confirmar,
  desmontarTudo,
  esperar,
  fechamento,
  montar,
} from "./apoio-do-fechamento";

afterEach(() => {
  desmontarTudo();
  vi.restoreAllMocks();
});

const CONFIG = {
  formas: {
    aceitaEntrega: true,
    aceitaRetirada: true,
    enderecoDaLoja: "Rua da Vila, 10",
  },
  formasDePagamento: ["PIX", "CASH"],
  pix: { chave: "loja@pix.test", tipo: "EMAIL", titular: "Loja" },
  entrega: {
    taxaCentavos: 500,
    nomeDaTaxa: "Taxa de entrega",
    gratisAcimaDeCentavos: null,
    minimoParaEntregaCentavos: null,
  },
};

function pronto(
  conta: typeof CONTA | null,
  enderecos = [TRABALHO, CASA],
): PreparoDoFechamento {
  return { estado: "pronto", config: CONFIG, conta, enderecos };
}

type Corpo = {
  chaveDeIdempotencia: string;
  enderecoId?: string;
  telefone?: string;
  [campo: string]: unknown;
};

function corpoDe(
  fechar: { mock: { calls: unknown[][] } },
  indice: number,
): Corpo {
  return fechar.mock.calls[indice]?.[1] as Corpo;
}

/** O passo do fechamento com a rede e a janela de acesso simuladas. */
function passo(preparar: ReturnType<typeof vi.fn>) {
  const { fechar, conferir } = fechamento();
  const pedirConta = vi.fn();
  const elemento = (
    <PassoDoFechamento
      apelidoDaLoja={LOJA}
      linkDoCatalogo={`/loja/${LOJA}/cardapio`}
      rotuloDoCatalogo="Cardápio"
      preparar={preparar as never}
      aoVoltar={vi.fn()}
      aoFecharJanela={vi.fn()}
      pedirConta={pedirConta}
      conferir={conferir as never}
      fechar={fechar as never}
      salvarEndereco={vi.fn() as never}
    />
  );
  return { elemento, fechar, conferir, pedirConta };
}

describe("[CA-20] sem conta, o cliente entra e continua (AC-11020)", () => {
  it("[CA-20] @spec:AC-11020 a sessão vence no envio: o envio trava até a mesma conta voltar, e a sacola continua", async () => {
    const preparar = vi.fn().mockResolvedValue(pronto(CONTA));
    const { elemento, fechar, pedirConta } = passo(preparar);
    fechar.mockResolvedValueOnce({ estado: "sem-conta" } as never);
    const { caixa } = await montar(elemento);

    await confirmar(caixa);

    expect(pedirConta).toHaveBeenCalledTimes(1);
    expect(caixa.querySelector('[role="alert"]')?.textContent).toContain(
      "Entre de novo",
    );
    // Travado: outro toque em confirmar não envia nada.
    await confirmar(caixa);
    expect(fechar).toHaveBeenCalledTimes(1);

    // A mesma conta volta: destrava, sem perder o formulário.
    const opcoes = pedirConta.mock.calls[0]?.[0] as { aoEntrar: () => void };
    await act(async () => {
      opcoes.aoEntrar();
    });
    await esperar();
    expect(caixa.textContent).toContain("Pedido de Ana Paula");
    await confirmar(caixa);
    expect(fechar).toHaveBeenCalledTimes(2);
    expect(caixa.textContent).toContain("A-0007");
    // A chave do envio que perdeu a sessão não é reaproveitada.
    expect(corpoDe(fechar, 1).chaveDeIdempotencia).not.toBe(
      corpoDe(fechar, 0).chaveDeIdempotencia,
    );
  });

  it("[CA-20] @spec:AC-11020 entrar por outra janela de acesso também destrava (sem passar pelo botão)", async () => {
    const preparar = vi.fn().mockResolvedValue(pronto(CONTA));
    const { elemento, fechar } = passo(preparar);
    fechar.mockResolvedValueOnce({ estado: "sem-conta" } as never);
    const { caixa } = await montar(elemento);
    await confirmar(caixa);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(EVENTO_ACESSO_CONCLUIDO, {
          detail: { novaConta: false },
        }),
      );
    });
    await esperar();
    await confirmar(caixa);

    expect(fechar).toHaveBeenCalledTimes(2);
  });

  it("[CA-20] @spec:AC-11020 entra OUTRA conta: dados, endereços e chave são os dela, e nada da anterior vai junto", async () => {
    const preparar = vi
      .fn()
      .mockResolvedValueOnce(pronto(CONTA))
      .mockResolvedValue(pronto(OUTRA_CONTA, []));
    const { elemento, fechar, pedirConta } = passo(preparar);
    fechar.mockResolvedValueOnce({ estado: "sem-conta" } as never);
    const { caixa } = await montar(elemento);
    await confirmar(caixa);
    const chaveDeAna = corpoDe(fechar, 0).chaveDeIdempotencia;

    const opcoes = pedirConta.mock.calls[0]?.[0] as { aoEntrar: () => void };
    await act(async () => {
      opcoes.aoEntrar();
    });
    await esperar();

    // A tela já é da Bia: nome, telefone e nenhum endereço da Ana.
    expect(caixa.textContent).toContain("Pedido de Bia Souza");
    expect(caixa.textContent).not.toContain("Ana Paula");
    expect(caixa.textContent).not.toContain("Santos Dumont");
    expect(caixa.querySelector('input[name="endereco-salvo"]')).toBeNull();

    const retirada = caixa.querySelector<HTMLInputElement>(
      'input[value="PICKUP"]',
    );
    await clicarAsync(retirada);
    await confirmar(caixa);

    const enviado = corpoDe(fechar, 1);
    expect(enviado.chaveDeIdempotencia).not.toBe(chaveDeAna);
    expect(enviado.enderecoId).toBeUndefined();
    expect(JSON.stringify(enviado)).not.toContain(TRABALHO.id);
    expect(JSON.stringify(enviado)).not.toContain("ana@cliente.test");
  });

  it("[CA-20] @spec:AC-11020 a rede cai e OUTRA conta entra sem 401: tentar de novo não reenvia a chave da anterior", async () => {
    const preparar = vi
      .fn()
      .mockResolvedValueOnce(pronto(CONTA))
      .mockResolvedValue(pronto(OUTRA_CONTA, []));
    const { elemento, fechar } = passo(preparar);
    fechar.mockResolvedValueOnce({
      estado: "falhou",
      motivo: "sem rede",
    } as never);
    const { caixa } = await montar(elemento);
    await confirmar(caixa);
    expect(fechar).toHaveBeenCalledTimes(1);

    // Em outra aba a pessoa trocou de conta: o cookie agora é da Bia.
    await clicarAsync(botao(caixa, "Tentar de novo"));
    await esperar();

    // A chave e o corpo da Ana NÃO foram reenviados com a sessão da Bia.
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(caixa.textContent).toContain("Pedido de Bia Souza");
    expect(caixa.textContent).not.toContain("Ana Paula");
  });

  it("[CA-20] @spec:AC-11020 sem conta ao tentar de novo, não reenvia e a tela volta a pedir para entrar", async () => {
    const preparar = vi
      .fn()
      .mockResolvedValueOnce(pronto(CONTA))
      .mockResolvedValue(pronto(null));
    const { elemento, fechar, pedirConta } = passo(preparar);
    fechar.mockResolvedValueOnce({
      estado: "falhou",
      motivo: "sem rede",
    } as never);
    const { caixa } = await montar(elemento);
    await confirmar(caixa);

    await clicarAsync(botao(caixa, "Tentar de novo"));
    await esperar();

    expect(fechar).toHaveBeenCalledTimes(1);
    expect(pedirConta).toHaveBeenCalledTimes(1);
    expect(caixa.textContent).toContain("Entre na sua conta para finalizar");
  });
});

describe("[CA-21] loja fechada informa quando abre e guarda a sacola (AC-11021)", () => {
  it("[CA-21] @spec:AC-11021 o pedido não é criado, a tela diz quando a loja abre e a sacola continua", async () => {
    const aviso = vi.fn();
    window.addEventListener(AVISO_DE_CARRINHO_MUDOU, aviso);
    const motivo = "A loja está fechada agora. Ela abre amanhã às 18:00.";
    const { elemento, fechar, conferir } = fechamento();
    fechar.mockResolvedValueOnce({ estado: "nao-pode", motivo } as never);
    const { caixa } = await montar(elemento);

    await confirmar(caixa);
    window.removeEventListener(AVISO_DE_CARRINHO_MUDOU, aviso);

    expect(fechar).toHaveBeenCalledTimes(1);
    expect(caixa.querySelector('[role="alert"]')?.textContent).toBe(motivo);
    // A sacola não foi esvaziada: ninguém avisou que ela mudou, e os itens
    // continuam na tela, no formulário.
    expect(aviso).not.toHaveBeenCalled();
    expect(conferir).toHaveBeenCalledTimes(2);
    expect(caixa.querySelector("form")).not.toBeNull();
    expect(caixa.textContent).not.toContain("Sua sacola está vazia");
  });
});

describe("[CA-22] pedido criado leva ao próximo passo e esvazia a sacola (AC-11022)", () => {
  it("[CA-22] @spec:AC-11022 sem WhatsApp na loja, mostra o número e o link para acompanhar", async () => {
    const aviso = vi.fn();
    window.addEventListener(AVISO_DE_CARRINHO_MUDOU, aviso);
    const { elemento } = fechamento();
    const { caixa } = await montar(elemento);

    await confirmar(caixa);
    window.removeEventListener(AVISO_DE_CARRINHO_MUDOU, aviso);

    expect(caixa.textContent).toContain("A-0007");
    const acompanhar = caixa.querySelector<HTMLAnchorElement>(
      `a[href="/loja/${LOJA}/pedido/${PEDIDO.tokenPublico}"]`,
    );
    expect(acompanhar).not.toBeNull();
    // A barra e a coluna esvaziam: o aviso de que a sacola mudou saiu, uma vez.
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("[CA-22] @spec:AC-11022 com WhatsApp na loja, o próximo passo é enviar a mensagem", async () => {
    const { elemento, fechar } = fechamento();
    fechar.mockResolvedValueOnce({
      estado: "criado",
      pedido: {
        ...PEDIDO,
        whatsapp: {
          endereco: "https://wa.me/5585900000000?text=Pedido",
          texto: "Pedido A-0007",
          completo: true,
        },
      },
    } as never);
    const { caixa } = await montar(elemento);

    await confirmar(caixa);

    expect(caixa.textContent).toContain("A-0007");
    expect(caixa.textContent).toMatch(/WhatsApp/);
    // O passo seguinte é o botão que abre a conversa com a loja.
    const abrir = [...caixa.querySelectorAll("a, button")].find((alvo) =>
      /WhatsApp/.test(alvo.textContent ?? ""),
    );
    expect(abrir).toBeDefined();
  });
});
