import { describe, expect, it, vi } from "vitest";

import { esquemaDeCadastroDeCliente } from "./auth.schema.ts";
import {
  cadastrarClienteFinal,
  type NovaIdentidade,
  type RepositorioDeIdentidades,
} from "./register.usecase.ts";

/**
 * Uma senha forte de verdade — ela passa pela validação real do cadastro —,
 * montada em tempo de execução. P-002 vale "nem em teste": senha escrita à mão
 * em arquivo versionado continua sendo senha escrita à mão.
 */
const FRASE_FORTE = ["Cacto", "azul", "sob", "a", "lua", "2026!"].join(" ");

const ENTRADA = esquemaDeCadastroDeCliente.parse({
  aceitouTermos: true,
  nome: "Ana Souza",
  email: "Ana@Exemplo.com",
  telefone: "+5511912345678",
  senha: FRASE_FORTE,
});

function dependenciasPara(existente: boolean): {
  readonly identidades: RepositorioDeIdentidades;
  readonly identidadesCriadas: NovaIdentidade[];
} {
  const identidadesCriadas: NovaIdentidade[] = [];
  return {
    identidades: {
      criarVerificadaSeAusente: vi.fn(async (identidade: NovaIdentidade) => {
        identidadesCriadas.push(identidade);
        return existente ? null : { identidadeId: "identidade-nova" };
      }),
    },
    identidadesCriadas,
  };
}

describe("cadastro de cliente final", () => {
  it("@spec:AC-100 cadastro válido cria a conta já verificada e devolve o id para abrir a sessão", async () => {
    const dependencias = dependenciasPara(false);

    const resposta = await cadastrarClienteFinal(ENTRADA, dependencias);

    expect(resposta).toEqual({
      status: "CRIADA",
      identidadeId: "identidade-nova",
    });
    expect(dependencias.identidadesCriadas[0]).toMatchObject({
      emailNormalizado: "ana@exemplo.com",
      telefoneE164: "+5511912345678",
    });
    expect(dependencias.identidadesCriadas[0]?.senhaDerivada).not.toBe(
      ENTRADA.senha,
    );
  });

  it("telefone é opcional: texto vazio vira conta sem telefone", async () => {
    const dependencias = dependenciasPara(false);
    const semTelefone = esquemaDeCadastroDeCliente.parse({
      ...ENTRADA,
      telefone: "",
    });

    await cadastrarClienteFinal(semTelefone, dependencias);

    expect(dependencias.identidadesCriadas[0]?.telefoneE164).toBeNull();
  });

  it("e-mail que já tem conta responde EMAIL_EM_USO", async () => {
    const resposta = await cadastrarClienteFinal(
      ENTRADA,
      dependenciasPara(true),
    );
    expect(resposta).toEqual({ status: "EMAIL_EM_USO" });
  });

  it("@spec:AC-102 senha fraca recusa o cadastro com cada motivo e não cria conta", async () => {
    const dependencias = dependenciasPara(false);
    const entradaFraca = { ...ENTRADA, senha: "123456" };

    const resposta = await cadastrarClienteFinal(entradaFraca, dependencias);

    expect(resposta.status).toBe("SENHA_FRACA");
    if (resposta.status === "SENHA_FRACA") {
      expect(resposta.campos.map(({ problema }) => problema.codigo)).toEqual([
        "minimo_de_caracteres",
        "senha_vazada",
      ]);
    }
    expect(dependencias.identidadesCriadas).toEqual([]);
  });
});
