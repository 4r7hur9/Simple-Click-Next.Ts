import { esquemaDaSenhaNova } from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import { conferirAntes } from "../src/features/auth/CadastroForm.tsx";
import {
  PASSOS_DO_CLIENTE,
  quantidadePorExtenso,
} from "../src/features/tutorial/passos.ts";

const validos = {
  nome: "Ana",
  email: "ana@exemplo.com",
  telefone: "+5511912345678",
  aceitouTermos: true,
};

describe("tutorial do cliente: o número do texto vem da lista", () => {
  it("boas-vindas cita a mesma quantidade que o indicador 'N de M' mostra", () => {
    const texto = PASSOS_DO_CLIENTE[0]?.texto ?? "";
    expect(texto).toContain(
      `Veja em ${quantidadePorExtenso(PASSOS_DO_CLIENTE.length)} passos`,
    );
    expect(texto).not.toContain("quatro");
  });

  it("escreve por extenso até dez e em dígitos depois", () => {
    expect(quantidadePorExtenso(6)).toBe("seis");
    expect(quantidadePorExtenso(12)).toBe("12");
  });
});

describe("cadastro: senha conferida na tela com o schema do contrato", () => {
  it("senha de 11 caracteres é recusada antes do envio", () => {
    const erros = conferirAntes({ ...validos, senha: "12345678901" });
    expect(erros["senha"]).toBe("Use pelo menos 12 caracteres.");
  });

  it("senha vazia pede para criar uma senha", () => {
    expect(conferirAntes({ ...validos, senha: "" })["senha"]).toBe(
      "Crie uma senha.",
    );
  });

  it("senha de 12 caracteres passa na tela", () => {
    expect(conferirAntes({ ...validos, senha: "uma frase boa" })["senha"]).toBe(
      undefined,
    );
    expect(esquemaDaSenhaNova.safeParse("123456789012").success).toBe(true);
  });
});
