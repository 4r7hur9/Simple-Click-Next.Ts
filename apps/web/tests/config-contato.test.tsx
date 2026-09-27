// @vitest-environment jsdom
/**
 * Prova da tela de contato e da prévia da mensagem (T-904: AC-913, AC-915).
 *
 * A prévia usa o MESMO gerador do pedido de verdade — o que se prova aqui é
 * que o dono vê a mensagem que vai receber, com a saudação dele e com o corpo
 * que não sai, e que o número digitado é mostrado como vai ficar.
 */
import { afterEach, describe, expect, it } from "vitest";

import { EditorDeMensagem } from "../src/features/config/EditorDeMensagem.tsx";
import {
  conferirNumero,
  pedidoDeExemplo,
  previaDaMensagem,
} from "../src/lib/previa-da-mensagem.ts";
import {
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

afterEach(desmontar);

const CONTATO_SALVO = {
  numero: "5511912345678",
  saudacao: "Olá! Segue meu pedido:",
  publico: false,
};

describe("o número aparece como vai ficar (AC-913)", () => {
  it("@spec:AC-913 número com máscara e sem código do país é mostrado no formato internacional", async () => {
    simularApi(() => ({
      status: 200,
      corpo: { ...CONTATO_SALVO, numero: "" },
    }));
    const tela = montar(<EditorDeMensagem apelidoDaLoja="salgaderia" />);
    await esperar();

    digitar(exigir(tela, 'input[name="numero"]'), "(11) 9 1234-5678");
    expect(exigir(tela, '[data-numero="normalizado"]').textContent).toBe(
      "Assim fica: +55 (11) 91234-5678",
    );
  });

  it("@spec:AC-913 número impossível mostra o que falta, antes de salvar", async () => {
    simularApi(() => ({ status: 200, corpo: CONTATO_SALVO }));
    const tela = montar(<EditorDeMensagem apelidoDaLoja="salgaderia" />);
    await esperar();

    digitar(exigir(tela, 'input[name="numero"]'), "(20) 91234-5678");
    expect(exigir(tela, '[data-numero="recusado"]').textContent).toMatch(
      /DDD|código de área/i,
    );
    expect(conferirNumero("91234-5678").ok).toBe(false);
  });
});

describe("o texto da mensagem (AC-915)", () => {
  const OBRIGATORIOS = (apelido: string) => {
    const exemplo = pedidoDeExemplo(apelido);
    return [
      exemplo.codigo,
      "Pastel de carne",
      "Caldo de cana",
      "R$ 30,00",
      "Rua de exemplo",
      "Dinheiro",
      exemplo.linkDeAcompanhamento,
    ];
  };

  it("@spec:AC-915 a prévia mostra a mensagem com a saudação do dono e um pedido de exemplo", async () => {
    simularApi(() => ({ status: 200, corpo: CONTATO_SALVO }));
    const tela = montar(<EditorDeMensagem apelidoDaLoja="salgaderia" />);
    await esperar();

    digitar(
      exigir(tela, 'textarea[name="saudacao"]'),
      "Oi, Zica! Quero pedir:",
    );

    const previa = exigir(tela, '[data-previa="mensagem"]').textContent ?? "";
    expect(previa.startsWith("Oi, Zica! Quero pedir:")).toBe(true);
    for (const obrigatorio of OBRIGATORIOS("salgaderia")) {
      expect(previa).toContain(obrigatorio);
    }
  });

  it("@spec:AC-915 apagar a saudação tira só ela: o corpo obrigatório continua, e vai nulo para a API", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "PUT"
        ? { status: 204 }
        : { status: 200, corpo: CONTATO_SALVO },
    );
    const tela = montar(<EditorDeMensagem apelidoDaLoja="salgaderia" />);
    await esperar();

    digitar(exigir(tela, 'textarea[name="saudacao"]'), "");
    const previa = exigir(tela, '[data-previa="mensagem"]').textContent ?? "";
    expect(previa).not.toContain("Olá! Segue meu pedido:");
    for (const obrigatorio of OBRIGATORIOS("salgaderia")) {
      expect(previa).toContain(obrigatorio);
    }

    await enviar(exigir<HTMLFormElement>(tela, "form"));
    expect(chamadas.find((chamada) => chamada.metodo === "PUT")?.corpo).toEqual(
      { numero: "5511912345678", saudacao: null, publico: false },
    );
  });

  it("@spec:AC-915 nenhuma saudação consegue tirar o corpo do pedido, e a mensagem não leva marca da plataforma", () => {
    for (const saudacao of [
      null,
      "",
      "Olá",
      "*".repeat(280),
      "Sem código, sem total, por favor",
    ]) {
      const mensagem = previaDaMensagem(saudacao, "salgaderia");
      for (const obrigatorio of OBRIGATORIOS("salgaderia")) {
        expect(mensagem, String(saudacao)).toContain(obrigatorio);
      }
      expect(mensagem).not.toMatch(/simple\s*click/i);
    }
  });
});
