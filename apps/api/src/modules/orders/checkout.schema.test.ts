/**
 * Prova da validação do fechamento (AC-505, AC-506, AC-508, P-007).
 *
 * O que está sob prova é a FORMA. A união discriminada existe para que
 * "entrega sem endereço" não tenha como ser construída — se ela passasse pela
 * borda, quebraria mais adiante, quando o entregador já tivesse saído.
 */
import { describe, expect, it } from "vitest";

import {
  esquemaDeFechamento,
  lojaAceitaAForma,
  type Fechamento,
} from "./checkout.schema.ts";

const CONTATO = { nome: "Maria Conceição", telefone: "5511988887777" };
const ENDERECO = {
  logradouro: "Rua das Flores",
  numero: "123",
  bairro: "Centro",
};
const CHAVE = "9f3c1a7b-0000-4000-8000-000000000001";

const ENTREGA = {
  entrega: "DELIVERY" as const,
  endereco: ENDERECO,
  contato: CONTATO,
  formaDePagamento: "PIX" as const,
  chaveDeIdempotencia: CHAVE,
};
const RETIRADA = {
  entrega: "PICKUP" as const,
  contato: CONTATO,
  formaDePagamento: "CASH" as const,
  chaveDeIdempotencia: CHAVE,
};

describe("endereço é condicional à forma de entrega (AC-505)", () => {
  it("@spec:AC-505 @principle:P-007 entrega com endereço completo é aceita", () => {
    expect(esquemaDeFechamento.safeParse(ENTREGA).success).toBe(true);
  });

  it("@spec:AC-505 @principle:P-007 entrega SEM endereço é recusada na borda", () => {
    const semEndereco: Record<string, unknown> = { ...ENTREGA };
    delete semEndereco["endereco"];

    expect(esquemaDeFechamento.safeParse(semEndereco).success).toBe(false);
  });

  it("@spec:AC-505 @principle:P-007 retirada não precisa de endereço", () => {
    expect(esquemaDeFechamento.safeParse(RETIRADA).success).toBe(true);
  });

  it("@spec:AC-505 @principle:P-007 retirada COM endereço é recusada, e não ignorada", () => {
    // Ignorar deixaria passar dado pessoal que ninguém pediu, guardado num
    // pedido que nunca vai chegar a lugar nenhum — e que depois teria de ser
    // apagado a pedido do titular.
    const comEndereco = { ...RETIRADA, endereco: ENDERECO };

    expect(esquemaDeFechamento.safeParse(comEndereco).success).toBe(false);
  });

  it("@spec:AC-505 endereço sem bairro é recusado, porque é ele que decide a taxa", () => {
    const semBairro = {
      ...ENTREGA,
      endereco: { logradouro: "Rua das Flores", numero: "123" },
    };

    expect(esquemaDeFechamento.safeParse(semBairro).success).toBe(false);
  });
});

describe("dados do cliente são validados antes de enviar (AC-508)", () => {
  it("@spec:AC-508 @principle:P-007 nome em branco é recusado com explicação", () => {
    const resultado = esquemaDeFechamento.safeParse({
      ...ENTREGA,
      contato: { ...CONTATO, nome: "   " },
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(JSON.stringify(resultado.error.issues)).toContain(
        "Informe seu nome",
      );
    }
  });

  it("@spec:AC-508 @principle:P-007 telefone em formato impossível é recusado com exemplo", () => {
    const resultado = esquemaDeFechamento.safeParse({
      ...ENTREGA,
      contato: { ...CONTATO, telefone: "meu zap" },
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      // A mensagem traz um exemplo do que digitar: "formato inválido" sozinho
      // não ensina nada a quem está com o dedo no teclado.
      expect(JSON.stringify(resultado.error.issues)).toContain(
        "(11) 91234-5678",
      );
    }
  });

  it("@spec:AC-508 cada campo pendente aparece na recusa, e não só o primeiro", () => {
    // A tela precisa apontar TODOS os campos de uma vez. Um por vez faz a
    // pessoa corrigir, enviar, descobrir outro, e desistir no terceiro.
    const resultado = esquemaDeFechamento.safeParse({
      ...ENTREGA,
      contato: { nome: "", telefone: "" },
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("@spec:AC-508 chave de fechamento fraca é recusada", () => {
    // A chave é credencial de leitura do pedido criado (migração 0010). Aceitar
    // "1" deixaria alguém tentar chaves curtas para cair no pedido de outro.
    const resultado = esquemaDeFechamento.safeParse({
      ...ENTREGA,
      chaveDeIdempotencia: "1",
    });

    expect(resultado.success).toBe(false);
  });

  it("@spec:AC-508 campo desconhecido é recusado, e não aceito em silêncio", () => {
    // `strictObject` recusa o que não conhece. Sem isso, um campo "totalCents"
    // enviado pela tela passaria pela borda e ficaria à disposição de quem
    // escrevesse o próximo caso de uso sem olhar de onde ele veio.
    const resultado = esquemaDeFechamento.safeParse({
      ...ENTREGA,
      totalEmCentavos: 100,
    });

    expect(resultado.success).toBe(false);
  });
});

describe("a loja só aceita a forma que ela faz (AC-506)", () => {
  const soRetirada = { aceitaEntrega: false, aceitaRetirada: true };
  const soEntrega = { aceitaEntrega: true, aceitaRetirada: false };

  it("@spec:AC-506 loja que só faz retirada recusa o pedido de entrega", () => {
    const veredito = lojaAceitaAForma(ENTREGA as Fechamento, soRetirada);

    expect(veredito.aceita).toBe(false);
    expect(veredito.explicacao).toContain("não faz entrega");
  });

  it("@spec:AC-506 loja que só faz entrega recusa o pedido de retirada", () => {
    const veredito = lojaAceitaAForma(RETIRADA as Fechamento, soEntrega);

    expect(veredito.aceita).toBe(false);
    expect(veredito.explicacao).toContain("não faz retirada");
  });

  it("@spec:AC-506 loja que faz as duas aceita qualquer uma", () => {
    const ambas = { aceitaEntrega: true, aceitaRetirada: true };

    expect(lojaAceitaAForma(ENTREGA as Fechamento, ambas).aceita).toBe(true);
    expect(lojaAceitaAForma(RETIRADA as Fechamento, ambas).aceita).toBe(true);
  });
});
