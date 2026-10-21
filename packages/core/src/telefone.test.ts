/**
 * Prova de AC-913 — o número de WhatsApp é normalizado e o impossível é
 * recusado explicando o que falta.
 *
 * O que estes testes protegem não é o formato: é o silêncio. Um número errado
 * não falha em lugar nenhum — vira um `wa.me` que abre conversa inexistente, e
 * o dono só descobre quando o cliente reclama que não foi atendido.
 */
import { describe, expect, it } from "vitest";

import {
  linkDoWhatsApp,
  normalizarWhatsApp,
  type NumeroAceito,
} from "./telefone.ts";

/** Estreita o resultado e falha com a explicação, em vez de com `undefined`. */
function exigirAceito(entrada: string): NumeroAceito {
  const resultado = normalizarWhatsApp(entrada);
  if (!resultado.ok) {
    throw new Error(
      `esperava aceitar ${entrada}, recusou: ${resultado.explicacao}`,
    );
  }
  return resultado;
}

describe("normalização do número de WhatsApp (AC-913)", () => {
  it("@spec:AC-913 máscara, espaço e zero de interurbano chegam ao mesmo número", () => {
    // Cinco jeitos que uma pessoa de verdade digita o MESMO celular. Se algum
    // deles saísse diferente, metade das lojas ficaria com link morto.
    const formas = [
      "(11) 91234-5678",
      "11 91234 5678",
      "11912345678",
      "011 91234-5678",
      "+55 (11) 91234-5678",
    ];

    for (const forma of formas) {
      expect(exigirAceito(forma).e164, `forma: ${forma}`).toBe("5511912345678");
    }
  });

  it("@spec:AC-913 sem o código do país o número assume o Brasil", () => {
    const numero = exigirAceito("21 98888-7777");

    expect(numero.e164).toBe("5521988887777");
    expect(numero.pais).toBe("55");
    expect(numero.ddd).toBe("21");
    expect(numero.tipo).toBe("MOVEL");
  });

  it("@spec:AC-913 o número normalizado volta escrito para conferência", () => {
    // A tela precisa MOSTRAR como ficou: é o único momento em que quem cadastra
    // pode perceber que digitou o número de outra pessoa.
    expect(exigirAceito("11912345678").exibicao).toBe("+55 (11) 91234-5678");
    expect(exigirAceito("1133334444").exibicao).toBe("+55 (11) 3333-4444");
  });

  it("@spec:AC-913 telefone fixo é aceito, porque loja atende em fixo com WhatsApp Business", () => {
    const numero = exigirAceito("(31) 3333-4444");

    expect(numero.e164).toBe("553133334444");
    expect(numero.tipo).toBe("FIXO");
  });

  it("@spec:AC-913 o código de área 55 não é confundido com o código do país", () => {
    // Santa Maria (RS) usa o DDD 55, que é o MESMO número do código do país.
    // "55912345678" é um celular de lá; "5555912345678" é o mesmo número com o
    // país na frente. Quem separasse os dois primeiros dígitos sem olhar o
    // comprimento transformaria o primeiro em um DDD "91" que existe — e o link
    // sairia mudo, apontando para outra pessoa, sem erro nenhum aparecer.
    expect(exigirAceito("55912345678").ddd).toBe("55");
    expect(exigirAceito("55912345678").e164).toBe("5555912345678");
    expect(exigirAceito("5555912345678").ddd).toBe("55");
    expect(exigirAceito("+55 55 91234-5678").e164).toBe("5555912345678");
  });

  it("@spec:AC-913 número de outro país passa pela régua internacional", () => {
    const numero = normalizarWhatsApp("+351 912 345 678");

    expect(numero.ok).toBe(true);
    if (numero.ok) {
      expect(numero.e164).toBe("351912345678");
      expect(numero.tipo).toBe("INTERNACIONAL");
    }
  });
});

describe("recusa que explica o que falta (AC-913)", () => {
  it("@spec:AC-913 campo vazio pede o número em vez de dizer inválido", () => {
    const resultado = normalizarWhatsApp("   ");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.causa).toBe("VAZIO");
      expect(resultado.explicacao).toContain("Informe o número");
    }
  });

  it("@spec:AC-913 número curto diz quantos dígitos vieram e quantos deveriam vir", () => {
    const resultado = normalizarWhatsApp("(11) 1234-567");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.causa).toBe("CURTO_DEMAIS");
      expect(resultado.explicacao).toContain("10");
      expect(resultado.explicacao).toContain("11");
      expect(resultado.explicacao).toContain("9"); // quantos ele informou
    }
  });

  it("@spec:AC-913 código de área que não existe é apontado pelo número dele", () => {
    // 20 não é código de área brasileiro, e é o erro de digitação de quem
    // queria 21. Aceitar por "estar entre 11 e 99" geraria um link morto.
    const resultado = normalizarWhatsApp("(20) 91234-5678");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.causa).toBe("DDD_DESCONHECIDO");
      expect(resultado.explicacao).toContain("20");
    }
  });

  it("código de área 00 é citado como foi digitado, não como o que sobra do zero da discagem", () => {
    // "(00) 98666-0006": tirar o zero da discagem deixaria "09" no lugar do
    // DDD, e a frase apontaria um número que a pessoa não digitou.
    const resultado = normalizarWhatsApp("(00) 98666-0006");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.causa).toBe("DDD_DESCONHECIDO");
      expect(resultado.explicacao).toContain("código de área 00 ");
    }
  });

  it("@spec:AC-913 celular no formato antigo é recusado sem o sistema chutar o nove", () => {
    // Acrescentar o 9 sozinho pareceria gentileza e seria adivinhação: o número
    // resultante pode ser de outra pessoa, e ninguém saberia.
    const resultado = normalizarWhatsApp("(11) 8123-4567");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.causa).toBe("CELULAR_SEM_O_NOVE");
      expect(resultado.explicacao).toContain("9");
      expect(resultado.explicacao).toContain("81234567");
    }
  });

  it("@spec:AC-913 texto sem dígito nenhum recebe um exemplo do que digitar", () => {
    const resultado = normalizarWhatsApp("meu zap");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.causa).toBe("SEM_DIGITOS");
      expect(resultado.explicacao).toContain("(11) 91234-5678");
    }
  });

  it("@spec:AC-913 número comprido demais é recusado em vez de ser cortado", () => {
    const resultado = normalizarWhatsApp("11 91234-56789012");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.causa).toBe("LONGO_DEMAIS");
    }
  });
});

describe("link do WhatsApp (AC-913)", () => {
  it("@spec:AC-913 o link sai do número normalizado, com o texto escapado", () => {
    const numero = exigirAceito("(11) 91234-5678");
    const link = linkDoWhatsApp(numero, "*Pedido A-1042*\nAçaí 🍧");

    expect(link).toContain("https://wa.me/5511912345678?text=");
    // Quebra de linha e acento precisam sair escapados, senão o endereço quebra
    // no meio e o texto chega cortado — ou não chega.
    expect(link).toContain("%0A");
    expect(link).not.toContain("\n");
    expect(link).not.toContain("Açaí");
  });
});
