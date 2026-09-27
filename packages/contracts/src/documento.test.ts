import { describe, expect, it } from "vitest";

import { esquemaDaNovaLoja } from "./admin.ts";
import {
  conferirDocumento,
  MENSAGEM_DE_DOCUMENTO_INVALIDO,
} from "./documento.ts";

/** Um cadastro que passa inteiro, para cada teste mudar só o documento. */
const CADASTRO_VALIDO = {
  nome: "Pastel da Joi",
  documento: "11.222.333/0001-81",
  responsavel: {
    nome: "Joice Almeida",
    email: "joice@exemplo.test",
    telefone: "11988887777",
  },
  endereco: {
    cep: "01310100",
    logradouro: "Avenida Paulista",
    numero: "1000",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP",
  },
  tipoDeNegocio: "FOOD_SNACK",
  apelido: "pastel-da-joi",
};

describe("CPF e CNPJ pelo dígito verificador", () => {
  it("@spec:AC-202 aceita CPF e CNPJ corretos, com ou sem máscara, e guarda só os dígitos", () => {
    expect(conferirDocumento("529.982.247-25")).toEqual({
      valido: true,
      tipo: "CPF",
      numero: "52998224725",
    });
    expect(conferirDocumento("11222333000181")).toEqual({
      valido: true,
      tipo: "CNPJ",
      numero: "11222333000181",
    });
  });

  it("@spec:AC-202 recusa dígito verificador incorreto, sequência repetida e tamanho errado", () => {
    for (const invalido of [
      "529.982.247-24", // último dígito trocado
      "11.222.333/0001-80", // idem, no CNPJ
      "111.111.111-11", // passa na conta e não existe
      "00000000000000",
      "1234567890", // dez dígitos
      "5299822472a",
    ]) {
      expect(conferirDocumento(invalido), invalido).toEqual({
        valido: false,
        motivo: MENSAGEM_DE_DOCUMENTO_INVALIDO,
      });
    }
  });

  it("@spec:AC-202 o formulário de cadastro recusa o documento inválido apontando o campo e explicando o motivo", () => {
    const resultado = esquemaDaNovaLoja.safeParse({
      ...CADASTRO_VALIDO,
      documento: "529.982.247-24",
    });

    expect(resultado.success).toBe(false);
    const problema = resultado.error?.issues.find(
      (questao) => questao.path.join(".") === "documento",
    );
    expect(problema?.message).toBe(MENSAGEM_DE_DOCUMENTO_INVALIDO);
  });

  it("o cadastro válido sai normalizado para a gravação", () => {
    const resultado = esquemaDaNovaLoja.parse(CADASTRO_VALIDO);

    expect(resultado.documento).toBe("11222333000181");
    expect(resultado.responsavel.telefone).toBe("+5511988887777");
    expect(resultado.endereco.uf).toBe("SP");
  });
});
