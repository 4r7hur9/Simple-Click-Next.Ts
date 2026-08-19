/**
 * Prova da abertura da conversa (AC-520, AC-523).
 *
 * O que estes testes protegem é a falha SILENCIOSA. Janela bloqueada não gera
 * erro nem evento: devolve `null`. Quem não conferir acha que enviou, e deixa o
 * cliente esperando resposta de uma mensagem que nunca saiu.
 */
import { describe, expect, it } from "vitest";

import {
  abrirConversa,
  ehEnderecoDoWhatsApp,
  type AbridorDeJanela,
} from "./whatsapp.ts";

const ENDERECO = "https://wa.me/5511988887777?text=Pedido%20A-1042";

/** Abridor que sempre consegue, guardando com o que foi chamado. */
function abridorQueAbre(registro: string[]): AbridorDeJanela {
  return (endereco, alvo, opcoes) => {
    registro.push(`${endereco} | ${alvo} | ${opcoes}`);
    return {} as Window;
  };
}

/** Abridor bloqueado, como um navegador com extensão de bloqueio. */
const abridorBloqueado: AbridorDeJanela = () => null;

describe("abrir a conversa do WhatsApp (AC-520)", () => {
  it("@spec:AC-520 o endereço da loja é aberto em aba nova, isolada da página do pedido", () => {
    const chamadas: string[] = [];

    expect(abrirConversa(ENDERECO, abridorQueAbre(chamadas))).toBe("abriu");
    expect(chamadas[0]).toContain(ENDERECO);
    expect(chamadas[0]).toContain("_blank");
    // Sem `noopener`, a página aberta recebe referência à janela do pedido e
    // pode trocá-la de endereço.
    expect(chamadas[0]).toContain("noopener");
    expect(chamadas[0]).toContain("noreferrer");
  });

  it("@spec:AC-523 janela bloqueada é detectada, e não confundida com envio", () => {
    expect(abrirConversa(ENDERECO, abridorBloqueado)).toBe("bloqueado");
  });
});

describe("só o WhatsApp é aberto (AC-520)", () => {
  it("@spec:AC-520 endereço de outro site é recusado antes de abrir", () => {
    // O endereço chega como dado, e dado vira página aberta. Sem esta
    // conferência, um valor adulterado levaria o cliente para um site qualquer
    // logo depois de ele ter digitado nome, telefone e endereço de entrega.
    const chamadas: string[] = [];
    const resultado = abrirConversa(
      "https://wa.me.exemplo-falso.test/5511988887777",
      abridorQueAbre(chamadas),
    );

    expect(resultado).toBe("endereco-invalido");
    expect(chamadas).toEqual([]);
  });

  it("@spec:AC-520 endereço sem conexão segura é recusado", () => {
    expect(ehEnderecoDoWhatsApp("http://wa.me/5511988887777")).toBe(false);
  });

  it("@spec:AC-520 os três endereços do WhatsApp são aceitos", () => {
    // O celular abre pelo aplicativo, o computador pela versão web: recusar
    // qualquer um deles quebraria metade dos clientes.
    for (const hospedeiro of [
      "wa.me",
      "api.whatsapp.com",
      "web.whatsapp.com",
    ]) {
      expect(
        ehEnderecoDoWhatsApp(`https://${hospedeiro}/send?phone=5511988887777`),
        hospedeiro,
      ).toBe(true);
    }
  });

  it("@spec:AC-520 endereço malformado responde não, em vez de estourar", () => {
    expect(ehEnderecoDoWhatsApp("nem endereço é")).toBe(false);
    expect(ehEnderecoDoWhatsApp("")).toBe(false);
  });

  it("@spec:AC-520 endereço de esquema perigoso é recusado", () => {
    expect(ehEnderecoDoWhatsApp("javascript:alert(1)")).toBe(false);
  });
});
