/**
 * Prova da leitura do formato do WhatsApp (AC-940).
 *
 * O que está sob prova é a fidelidade: a prévia precisa mostrar a mensagem como
 * ela CHEGA, e não como ela é escrita. O dono de loja abre o WhatsApp quarenta
 * vezes por dia — asterisco à vista faz a landing parecer quebrada justamente
 * para quem mais entende do assunto.
 */
import { describe, expect, it } from "vitest";

import { lerMensagemDoWhatsApp } from "./texto-whatsapp.ts";

/** O texto de uma linha, sem a marcação. */
function texto(linha: readonly { texto: string }[]): string {
  return linha.map((p) => p.texto).join("");
}

describe("negrito do WhatsApp (AC-940)", () => {
  it("@spec:AC-940 o que está entre asteriscos vira negrito, e os asteriscos somem", () => {
    const [linha] = lerMensagemDoWhatsApp("*Pedido A-1042*");

    expect(linha).toEqual([{ texto: "Pedido A-1042", negrito: true }]);
    expect(texto(linha ?? [])).not.toContain("*");
  });

  it("@spec:AC-940 negrito no meio da linha não come o resto", () => {
    const [linha] = lerMensagemDoWhatsApp("*Total: R$ 32,00* no PIX");

    expect(linha).toEqual([
      { texto: "Total: R$ 32,00", negrito: true },
      { texto: " no PIX", negrito: false },
    ]);
  });

  it("@spec:AC-940 asterisco duplicado se comporta como no aplicativo", () => {
    // Escrevi este teste esperando que `**x**` não virasse negrito, e estava
    // errado sobre o aplicativo: o WhatsApp casa o par INTERNO e deixa os
    // externos como texto. A implementação já fazia isso; a expectativa é que
    // estava inventando uma regra que o aparelho de quem recebe não segue.
    const [linha] = lerMensagemDoWhatsApp("preço **especial**");

    expect(linha).toEqual([
      { texto: "preço *", negrito: false },
      { texto: "especial", negrito: true },
      { texto: "*", negrito: false },
    ]);
  });

  it("@spec:AC-940 asterisco solto continua sendo asterisco", () => {
    const [linha] = lerMensagemDoWhatsApp("2 * 3 = 6");

    expect(texto(linha ?? [])).toBe("2 * 3 = 6");
  });
});

describe("as quebras de linha são parte do formato (AC-940)", () => {
  it("@spec:AC-940 cada linha vira uma linha, e nenhuma se perde", () => {
    // As quebras separam cliente, itens, entrega e pagamento. Juntá-las
    // produziria um parágrafo único que ninguém lê no celular.
    const linhas = lerMensagemDoWhatsApp("*Itens*\n2x Pastel\n\n*Total*");

    expect(linhas).toHaveLength(4);
    expect(texto(linhas[1] ?? [])).toBe("2x Pastel");
  });

  it("@spec:AC-940 a linha vazia continua existindo", () => {
    // Ela é o espaço entre os blocos. Sumir com ela colaria "Itens" no cliente
    // de cima.
    const linhas = lerMensagemDoWhatsApp("a\n\nb");

    expect(linhas).toHaveLength(3);
    expect(texto(linhas[1] ?? [])).toBe("");
  });

  it("@spec:AC-940 acento e emoji atravessam intactos", () => {
    const [linha] = lerMensagemDoWhatsApp("*Açaí na tigela 🍧*");

    expect(linha?.[0]?.texto).toBe("Açaí na tigela 🍧");
  });
});

describe("o formato não abre caminho para injeção (P-009)", () => {
  it("@spec:AC-940 a saída é TEXTO em pedaços, e nunca marcação", () => {
    // Devolver texto com etiquetas obrigaria a tela a injetá-lo como HTML, e
    // isso transformaria qualquer texto que um dia venha de fora — o nome da
    // loja, a observação do cliente — em código executável na página.
    const linhas = lerMensagemDoWhatsApp("<script>alert(1)</script> *ok*");

    expect(texto(linhas[0] ?? [])).toBe("<script>alert(1)</script> ok");
    for (const pedaco of linhas[0] ?? []) {
      expect(typeof pedaco.texto).toBe("string");
      expect(Object.keys(pedaco).sort()).toEqual(["negrito", "texto"]);
    }
  });
});
