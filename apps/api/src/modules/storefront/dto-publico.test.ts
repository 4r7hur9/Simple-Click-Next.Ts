/**
 * Prova da saída pública (AC-904, P-009).
 *
 * O teste alimenta a projeção com uma loja que tem TUDO preenchido — CNPJ,
 * telefones do dono, e-mail, coordenadas — e afirma que nada disso aparece.
 * Alimentar com uma loja mínima provaria só que campo ausente não aparece, que
 * é o que ninguém está em dúvida.
 */
import { describe, expect, it } from "vitest";

import {
  lojaParaVitrine,
  CAMPOS_PUBLICOS_DA_LOJA,
  NUNCA_SAEM,
  type LojaDoBanco,
} from "./dto-publico.ts";

/** Uma loja com todos os campos preenchidos, inclusive os sensíveis. */
const LOJA_COMPLETA = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "SC-0042",
  slug: "sabor-e-cia",
  name: "Sabor & Cia",
  legalName: "Sabor e Companhia Alimentos LTDA",
  docNumber: "12345678000199",
  docType: "CNPJ",
  status: "ACTIVE",
  verticalCode: "FOOD",
  timezone: "America/Sao_Paulo",
  currency: "BRL",
  fulfillmentModes: ["DELIVERY", "PICKUP"],
  whatsappE164: "5511988887777",
  phone1: "1133334444",
  phone2: "1133335555",
  email: "dono@sabor.com.br",
  street: "Rua das Flores",
  number: "123",
  complement: "Loja 2",
  neighborhood: "Centro",
  city: "São Paulo",
  uf: "SP",
  zip: "01000000",
  lat: "-23.55",
  lng: "-46.63",
  catalogVersion: 42n,
  createdBy: "22222222-2222-2222-2222-222222222222",
};

const CONFIGURACAO = {
  landing: {
    boasVindas: "Comida caseira todo dia",
    sobre: "Uma história de receitas de família.",
    logo: "https://exemplo.test/logo.png",
    capa: "https://exemplo.test/capa.jpg",
  },
  theme: { primaria: "#0f6e5c", fundo: "#ffffff", desconhecida: "roxo" },
  // O que NUNCA pode sair, guardado no mesmo documento:
  payment: { chavePix: "loja@sabor.com.br", nomeDoRecebedor: "Sabor & Cia" },
  whatsapp: {
    numero: "5511988887777",
    textoPadrao: "Olá",
    publico: false,
  },
  printing: { chaveDoAgente: "segredo-da-impressora" },
};

describe("a vitrine mostra o que o dono quis mostrar (AC-904)", () => {
  it("@spec:AC-904 nome, apelido, ramo e boas-vindas aparecem", () => {
    const publica = lojaParaVitrine(LOJA_COMPLETA as LojaDoBanco, CONFIGURACAO);

    expect(publica.nome).toBe("Sabor & Cia");
    expect(publica.apelido).toBe("sabor-e-cia");
    expect(publica.ramo).toBe("FOOD");
    expect(publica.boasVindas).toBe("Comida caseira todo dia");
    expect(publica.sobre).toBe("Uma história de receitas de família.");
    expect(publica.whatsappPublico).toBeNull();
  });

  it("@spec:AC-904 o endereço para retirada aparece sem CEP nem coordenada", () => {
    // Quem vai retirar precisa da rua e do número. Coordenada exata e CEP junto
    // do número são dado de localização precisa, e a vitrine não precisa deles.
    const publica = lojaParaVitrine(LOJA_COMPLETA as LojaDoBanco, CONFIGURACAO);

    expect(publica.enderecoParaRetirada?.logradouro).toBe("Rua das Flores");
    expect(publica.enderecoParaRetirada?.cidade).toBe("São Paulo");
    expect(JSON.stringify(publica)).not.toContain("01000000");
    expect(JSON.stringify(publica)).not.toContain("-23.55");
  });

  it("@spec:AC-904 loja sem endereço cadastrado devolve nulo, e não um objeto de vazios", () => {
    const semEndereco = {
      ...LOJA_COMPLETA,
      street: null,
      number: null,
      complement: null,
      neighborhood: null,
      city: null,
      uf: null,
    };

    expect(
      lojaParaVitrine(semEndereco as LojaDoBanco, CONFIGURACAO)
        .enderecoParaRetirada,
    ).toBeNull();
  });
});

describe("o que nunca sai, não sai (AC-904, P-009)", () => {
  const publica = lojaParaVitrine(LOJA_COMPLETA as LojaDoBanco, CONFIGURACAO);
  const comoTexto = JSON.stringify(publica);

  it("@spec:AC-904 @principle:P-009 a CHAVE PIX não aparece na vitrine", () => {
    // É o risco que o crítico apontou e que foi observado num concorrente. A
    // chave aparece em um lugar só: no fechamento de um pedido daquela loja.
    expect(comoTexto).not.toContain("loja@sabor.com.br");
    expect(comoTexto).not.toContain("chavePix");
  });

  it("@spec:AC-904 @principle:P-009 documento e razão social do dono não aparecem", () => {
    expect(comoTexto).not.toContain("12345678000199");
    expect(comoTexto).not.toContain("Sabor e Companhia");
  });

  it("@spec:AC-904 @principle:P-009 telefone e e-mail do dono não aparecem", () => {
    // O número do dono na vitrine é alvo de mensagem em massa. Ele chega ao
    // cliente pelo link do WhatsApp, montado no fechamento — não aqui.
    expect(comoTexto).not.toContain("5511988887777");
    expect(comoTexto).not.toContain("1133334444");
    expect(comoTexto).not.toContain("dono@sabor.com.br");
  });

  it("@spec:AC-402 o estado administrativo da loja não aparece", () => {
    // Devolver "INACTIVE" contaria a quem perguntar que aquele endereço existe
    // e foi suspenso — que é justamente o que AC-402 manda não revelar.
    expect(comoTexto).not.toContain("ACTIVE");
    expect(comoTexto).not.toContain("status");
  });

  it("@spec:AC-904 nenhum valor sensível escapa, conferido pela lista inteira", () => {
    // Percorre TODOS os campos que a lista diz que nunca saem, em vez de
    // conferir os que alguém lembrou de escrever num teste.
    const vazamentos: string[] = [];
    for (const campo of Object.keys(NUNCA_SAEM)) {
      const valor = (LOJA_COMPLETA as Record<string, unknown>)[campo];
      if (typeof valor !== "string" || valor.length < 4) continue;
      if (comoTexto.includes(valor)) vazamentos.push(`${campo}=${valor}`);
    }

    expect(vazamentos, vazamentos.join(" | ")).toEqual([]);
  });

  it("@spec:AC-904 configuração interna inteira fica de fora", () => {
    expect(comoTexto).not.toContain("segredo-da-impressora");
    expect(comoTexto).not.toContain("textoPadrao");
  });
});

describe("a lista é de permitidos, e não de proibidos (AC-904)", () => {
  it("@spec:AC-904 campo novo no banco NÃO aparece sozinho na vitrine", () => {
    // É a prova do desenho. Com lista de proibidos, toda coluna nova nasceria
    // pública e o vazamento aconteceria na migração em que alguém esquecesse de
    // proibi-la — meses depois, sem nenhuma revisão reclamar.
    const comCampoNovo = {
      ...LOJA_COMPLETA,
      margemDeLucroInterna: "0.42",
      anotacaoDoAdministrador: "cliente atrasa pagamento",
    };

    const saida = JSON.stringify(
      lojaParaVitrine(comCampoNovo as LojaDoBanco, CONFIGURACAO),
    );

    expect(saida).not.toContain("0.42");
    expect(saida).not.toContain("atrasa pagamento");
  });

  it("@spec:AC-904 só cor em notação hexadecimal entra no tema", () => {
    // O valor vai para dentro de uma folha de estilo. Texto livre ali é caminho
    // para injetar regra de CSS na página de todo mundo que abrir a loja.
    const publica = lojaParaVitrine(LOJA_COMPLETA as LojaDoBanco, {
      theme: {
        primaria: "#0f6e5c",
        fundo: "url(javascript:alert(1))",
        texto: "red; background: url(http://exemplo.test)",
      },
    });

    expect(publica.cores).toEqual({ primaria: "#0f6e5c" });
  });

  it("card #64: o selo de status e a cor da capa chegam ao tema, validados", () => {
    const publica = lojaParaVitrine(LOJA_COMPLETA as LojaDoBanco, {
      theme: {
        seloDeStatus: "CLARO",
        coresDasImagens: { "https://img.test/capa.webp": "#6B1414" },
      },
    });
    expect(publica.tema).toMatchObject({
      seloDeStatus: "CLARO",
      coresDasImagens: { "https://img.test/capa.webp": "#6b1414" },
    });

    const invalida = lojaParaVitrine(LOJA_COMPLETA as LojaDoBanco, {
      theme: {
        seloDeStatus: "<script>",
        coresDasImagens: { "https://img.test/capa.webp": "red; x: y" },
      },
    });
    expect(invalida.tema).toMatchObject({
      seloDeStatus: "AUTOMATICO",
      coresDasImagens: {},
    });
  });

  it("@spec:AC-904 tema sem nenhuma cor válida devolve nulo, e não um objeto vazio", () => {
    expect(
      lojaParaVitrine(LOJA_COMPLETA as LojaDoBanco, { theme: { x: "y" } })
        .cores,
    ).toBeNull();
  });

  it("@spec:AC-904 as duas listas não se contradizem", () => {
    // Um campo que estivesse nas duas seria uma decisão que ninguém tomou: a
    // lista de permitidos mandaria, e a de proibidos daria falsa segurança a
    // quem a lesse.
    const nos_dois = [...CAMPOS_PUBLICOS_DA_LOJA].filter(
      (campo) => campo in NUNCA_SAEM,
    );

    expect(nos_dois, nos_dois.join(", ")).toEqual([]);
  });
});
