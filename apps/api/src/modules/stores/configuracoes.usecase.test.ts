/**
 * Prova das regras puras das configurações (T-900: AC-921, AC-922, AC-923).
 *
 * A gravação de verdade, com transação e trilha no banco, está provada em
 * `apps/api/tests/config-loja-secoes.int.test.ts`. Aqui mora o que se decide
 * sem banco: quais seções existem, o que conta como mudança, o que vai para
 * a trilha e o que a borda recusa.
 */
import { describe, expect, it } from "vitest";
import {
  CONFIGURACOES_DA_PLATAFORMA,
  SECOES_DO_DONO,
} from "@simpleclick/contracts";

import { ESQUEMAS_DAS_SECOES } from "./configuracoes.schema.ts";
import {
  diferencas,
  mascarar,
  registroDaAlteracao,
  regrasDaTrilha,
} from "./configuracoes.usecase.ts";

describe("as seções do dono (AC-921)", () => {
  it("@spec:AC-921 o dono tem exatamente pagamento, entrega, horário, contato, apresentação e impressão", () => {
    expect([...SECOES_DO_DONO]).toEqual([
      "pagamento",
      "entrega",
      "horario",
      "contato",
      "aparencia",
      "impressao",
    ]);
    expect(Object.keys(ESQUEMAS_DAS_SECOES).sort()).toEqual(
      [...SECOES_DO_DONO].sort(),
    );
  });

  it("@spec:AC-921 nada do cadastro da plataforma é seção do dono", () => {
    const secoes = SECOES_DO_DONO.map((secao) => secao.toLowerCase());
    for (const daPlataforma of CONFIGURACOES_DA_PLATAFORMA) {
      const normalizado = daPlataforma
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
      expect(secoes.some((secao) => normalizado.includes(secao))).toBe(false);
    }
  });

  it("@spec:AC-921 toda seção recusa campo que não é dela — inclusive os da plataforma", () => {
    const intrusos = {
      slug: "outro-apelido",
      verticalCode: "FOOD_BAKERY",
      docNumber: "12345678000199",
      contrato: "assinado",
      funcionalidades: ["tv"],
    };
    const validos: Record<(typeof SECOES_DO_DONO)[number], unknown> = {
      pagamento: { formas: ["CASH"], pix: null },
      entrega: {
        aceitaEntrega: true,
        aceitaRetirada: true,
        taxaCentavos: null,
        nomeDaTaxa: null,
        gratisAcimaDeCentavos: null,
        minimoParaEntregaCentavos: null,
        minimoParaRetiradaCentavos: null,
        prazoMinutos: null,
      },
      horario: { semana: [], fechadoAgora: false, excecoes: [] },
      contato: {
        numero: "(11) 91234-5678",
        saudacao: "Olá!",
        publico: false,
      },
      aparencia: {
        nome: "Pastelaria da Zica",
        boasVindas: null,
        sobre: null,
        logo: null,
        capa: null,
        corPrimaria: null,
      },
      impressao: {
        larguraMm: 80,
        conteudo: {
          pedido: true,
          itens: true,
          total: true,
          enderecoCliente: true,
          totalEmDestaque: false,
          observacoes: true,
        },
      },
    };

    for (const secao of SECOES_DO_DONO) {
      const esquema = ESQUEMAS_DAS_SECOES[secao];
      expect(esquema.safeParse(validos[secao]).success, secao).toBe(true);
      expect(
        esquema.safeParse({ ...(validos[secao] as object), ...intrusos })
          .success,
        secao,
      ).toBe(false);
    }
  });
});

describe("o que a trilha registra (AC-922)", () => {
  it("@spec:AC-922 só os campos que mudaram, com o valor de antes e o de depois", () => {
    const mudou = diferencas(
      { taxaCentavos: 800, nomeDaTaxa: "Motoboy", aceitaEntrega: true },
      { taxaCentavos: 1_000, nomeDaTaxa: "Motoboy", aceitaEntrega: false },
    );

    expect(mudou).toEqual([
      { campo: "aceitaEntrega", antes: true, depois: false },
      { campo: "taxaCentavos", antes: 800, depois: 1_000 },
    ]);
  });

  it("@spec:AC-922 documento aninhado vira campo com caminho, e lista é uma escolha só", () => {
    const mudou = diferencas(
      { formas: ["CASH"], pix: null },
      {
        formas: ["PIX", "CASH"],
        pix: { tipo: "EMAIL", chave: "a@b.test", titular: "Zica" },
      },
    );

    expect(mudou.map((m) => m.campo)).toEqual([
      "formas",
      "pix.chave",
      "pix.tipo",
      "pix.titular",
    ]);
    expect(mudou[0]).toEqual({
      campo: "formas",
      antes: ["CASH"],
      depois: ["PIX", "CASH"],
    });
  });

  it("@spec:AC-922 @principle:P-009 troca de chave PIX sai destacada, e a chave sai só pelo final", () => {
    const registro = registroDaAlteracao(
      "pagamento",
      [
        {
          campo: "pix.chave",
          antes: "12345678909",
          depois: "98765432100",
        },
      ],
      regrasDaTrilha("pagamento"),
    );

    expect(registro?.acao).toBe("CONFIG_SENSIVEL_ALTERADA");
    expect(registro?.camposSensiveis).toEqual(["pix.chave"]);
    expect(registro?.antes).toEqual({ "pix.chave": "…8909" });
    expect(registro?.depois).toEqual({ "pix.chave": "…2100" });
    expect(JSON.stringify(registro)).not.toContain("12345678909");
  });

  it("@spec:AC-922 trocar o WhatsApp que recebe o pedido também é sensível", () => {
    const registro = registroDaAlteracao(
      "contato",
      [{ campo: "numero", antes: "5511912345678", depois: "5511987654321" }],
      regrasDaTrilha("contato"),
    );

    expect(registro?.acao).toBe("CONFIG_SENSIVEL_ALTERADA");
    expect(JSON.stringify(registro)).not.toContain("5511912345678");
  });

  it("@spec:AC-922 alteração comum não é destacada, e nada mudou não vira registro", () => {
    const comum = registroDaAlteracao(
      "entrega",
      [{ campo: "taxaCentavos", antes: 800, depois: 900 }],
      regrasDaTrilha("entrega"),
    );
    expect(comum?.acao).toBe("CONFIG_ALTERADA");
    expect(comum?.antes).toEqual({ taxaCentavos: 800 });

    expect(registroDaAlteracao("entrega", [], regrasDaTrilha("entrega"))).toBe(
      null,
    );
  });

  it("@spec:AC-922 máscara guarda só o final, e não inventa valor para o vazio", () => {
    expect(mascarar("loja@pix.test")).toBe("…test");
    expect(mascarar("abc")).toBe("…");
    expect(mascarar(null)).toBe(null);
    expect(mascarar("")).toBe("");
  });
});

describe("a borda aponta cada campo (AC-923)", () => {
  it("@spec:AC-923 entrega com três campos errados recebe três problemas, um por campo", () => {
    const resultado = ESQUEMAS_DAS_SECOES.entrega.safeParse({
      aceitaEntrega: true,
      aceitaRetirada: "sim",
      taxaCentavos: 7.5,
      nomeDaTaxa: null,
      gratisAcimaDeCentavos: -1,
      minimoParaEntregaCentavos: null,
      minimoParaRetiradaCentavos: null,
      prazoMinutos: null,
    });

    expect(resultado.success).toBe(false);
    const caminhos = (resultado.error?.issues ?? []).map((q) =>
      q.path.join("."),
    );
    expect(caminhos.sort()).toEqual([
      "aceitaRetirada",
      "gratisAcimaDeCentavos",
      "taxaCentavos",
    ]);
    // A mensagem fala do campo, em português, e não do tipo do validador.
    for (const questao of resultado.error?.issues ?? []) {
      expect(questao.message).not.toMatch(/expected|received/i);
    }
  });

  it("@spec:AC-923 WhatsApp impossível é recusado com a explicação do que falta", () => {
    const resultado = ESQUEMAS_DAS_SECOES.contato.safeParse({
      numero: "(20) 91234-5678",
      saudacao: "Olá!",
      publico: false,
    });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.path).toEqual(["numero"]);
    expect(resultado.error?.issues[0]?.message).toMatch(/DDD|código de área/i);
  });
});
