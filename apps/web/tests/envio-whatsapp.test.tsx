// @vitest-environment jsdom
/**
 * Prova do envio pelo WhatsApp na tela (AC-520, AC-523).
 *
 * O que está sob prova não é o caminho feliz — é o que sobra quando ele falha.
 * O pedido já existe quando esta tela aparece; a mensagem é a única coisa que
 * pode se perder, e o cliente precisa saber disso e ter como continuar.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EnvioWhatsApp } from "../src/features/checkout/EnvioWhatsApp";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const ENDERECO = "https://wa.me/5511988887777?text=Pedido%20A-1042";
const TEXTO = "*Pedido A-1042*\n1x Marmita — R$ 20,00";
const ACOMPANHAR = "https://app.simpleclick.com.br/l/sabor/p/9f3c1a7b";

function montar(
  sobrescrita: Partial<Parameters<typeof EnvioWhatsApp>[0]> = {},
): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() =>
    raiz?.render(
      <EnvioWhatsApp
        codigoDoPedido="A-1042"
        enderecoDaConversa={ENDERECO}
        textoDoPedido={TEXTO}
        linkDeAcompanhamento={ACOMPANHAR}
        {...sobrescrita}
      />,
    ),
  );
  return container;
}

function botao(dentro: HTMLElement, trecho: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find((candidato) =>
    (candidato.textContent ?? "").includes(trecho),
  );
  if (!achado) throw new Error(`não existe botão com "${trecho}" na tela`);
  return achado;
}

describe("enviar abre a conversa com o texto pronto (AC-520)", () => {
  it("@spec:AC-520 o clique abre o endereço da loja em aba isolada", async () => {
    const abertos: string[] = [];
    const tela = montar({
      abrir: ((endereco: string, alvo: string, opcoes: string) => {
        abertos.push(`${endereco}|${alvo}|${opcoes}`);
        return {} as Window;
      }) as typeof window.open,
    });

    await act(async () => {
      botao(tela, "Enviar pelo WhatsApp").click();
    });

    expect(abertos[0]).toContain(ENDERECO);
    expect(abertos[0]).toContain("noopener");
    expect(tela.textContent).toContain("Conversa aberta");
  });

  it("@spec:AC-520 a abertura acontece no próprio clique, sem espera no meio", async () => {
    // Se houvesse `await` de servidor antes de abrir, o gesto teria terminado e
    // o navegador bloquearia a janela — sem erro, sem evento, sem nada.
    let abriuDuranteOClique = false;
    const tela = montar({
      abrir: (() => {
        abriuDuranteOClique = true;
        return {} as Window;
      }) as typeof window.open,
    });

    botao(tela, "Enviar pelo WhatsApp").click();
    expect(abriuDuranteOClique).toBe(true);
  });
});

describe("falha no envio não perde o pedido (AC-523)", () => {
  it("@spec:AC-523 antes de qualquer clique a tela já garante que o pedido está registrado", () => {
    // É a primeira coisa que o cliente lê. Se a garantia viesse depois do
    // botão, quem fechasse a janela sairia achando que não pediu nada.
    const tela = montar();

    expect(tela.textContent).toContain("A-1042");
    expect(tela.textContent).toContain("já está na fila da loja");
  });

  it("@spec:AC-523 o link de acompanhamento existe mesmo sem nenhum envio", () => {
    const tela = montar();
    const link = [...tela.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === ACOMPANHAR,
    );

    expect(link).toBeDefined();
  });

  it("@spec:AC-523 janela bloqueada vira aviso, link para clicar e texto para copiar", async () => {
    const tela = montar({ abrir: (() => null) as typeof window.open });

    await act(async () => {
      botao(tela, "Enviar pelo WhatsApp").click();
    });

    expect(tela.textContent).toContain("bloqueou a janela");
    // Um link de verdade: o clique passa a ser do usuário, e navegador nenhum
    // bloqueia isso.
    const link = [...tela.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === ENDERECO,
    );
    expect(link).toBeDefined();
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("@spec:AC-523 o texto do pedido pode ser copiado quando a janela não abre", async () => {
    let copiado: string | null = null;
    const tela = montar({
      abrir: (() => null) as typeof window.open,
      copiar: async (texto) => {
        copiado = texto;
      },
    });

    await act(async () => {
      botao(tela, "Enviar pelo WhatsApp").click();
    });
    await act(async () => {
      botao(tela, "Copiar o texto").click();
    });

    expect(copiado).toBe(TEXTO);
    expect(tela.textContent).toContain("Texto copiado");
  });

  it("@spec:AC-523 endereço inválido não abre nada e oferece o texto do mesmo jeito", async () => {
    const abertos: string[] = [];
    const tela = montar({
      enderecoDaConversa: "https://site-que-imita-a-loja.test/pedido",
      abrir: ((endereco: string) => {
        abertos.push(endereco);
        return {} as Window;
      }) as typeof window.open,
    });

    await act(async () => {
      botao(tela, "Enviar pelo WhatsApp").click();
    });

    expect(abertos).toEqual([]);
    expect(tela.textContent).toContain("Copiar o texto");
    // E não oferece o link: clicar nele levaria o cliente ao site errado logo
    // depois de ele ter digitado nome, telefone e endereço.
    expect(
      [...tela.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ).not.toContain("https://site-que-imita-a-loja.test/pedido");
  });

  it("@spec:AC-523 depois de abrir, o caminho para tentar de novo continua na tela", async () => {
    const tela = montar({
      abrir: (() => ({}) as Window) as typeof window.open,
    });

    await act(async () => {
      botao(tela, "Enviar pelo WhatsApp").click();
    });

    // Quem fechou a conversa sem enviar precisa de um caminho, e ele é o mesmo
    // botão — que continua ali, e o aviso diz isso.
    expect(botao(tela, "Enviar pelo WhatsApp").disabled).toBe(false);
    expect(tela.textContent).toContain("Não enviou?");
  });
});
