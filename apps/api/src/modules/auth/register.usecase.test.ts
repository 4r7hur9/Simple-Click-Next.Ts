import { describe, expect, it, vi } from "vitest";

import { esquemaDeCadastroDeCliente } from "./auth.schema.ts";
import {
  cadastrarClienteFinal,
  type AvisosDeCadastro,
  type NovaIdentidade,
  type RepositorioDeIdentidades,
} from "./register.usecase.ts";

const ENTRADA = esquemaDeCadastroDeCliente.parse({
  nome: "Ana Souza",
  email: "Ana@Exemplo.com",
  telefone: "+5511912345678",
  senha: "Cacto azul sob a lua 2026!",
});

function dependenciasPara(criada: boolean): {
  readonly identidades: RepositorioDeIdentidades;
  readonly avisos: AvisosDeCadastro;
  readonly identidadesCriadas: NovaIdentidade[];
  readonly verificacoes: unknown[];
  readonly avisosDeExistente: unknown[];
} {
  const identidadesCriadas: NovaIdentidade[] = [];
  const verificacoes: unknown[] = [];
  const avisosDeExistente: unknown[] = [];

  return {
    identidades: {
      criarSeAusente: vi.fn(async (identidade: NovaIdentidade) => {
        identidadesCriadas.push(identidade);
        return { criada };
      }),
    },
    avisos: {
      enviarVerificacao: vi.fn(async (dados) => {
        verificacoes.push(dados);
      }),
      enviarAvisoDeCadastroExistente: vi.fn(async (dados) => {
        avisosDeExistente.push(dados);
      }),
    },
    identidadesCriadas,
    verificacoes,
    avisosDeExistente,
  };
}

describe("cadastro de cliente final", () => {
  it("@spec:AC-100 cadastro válido cria conta pendente de verificação e envia instruções", async () => {
    const dependencias = dependenciasPara(true);

    const resposta = await cadastrarClienteFinal(ENTRADA, dependencias);

    expect(resposta).toEqual({
      cadastrado: true,
      mensagem:
        "Seus dados foram recebidos. Enviamos instruções para confirmar seu e-mail.",
      verificacaoDeEmailPendente: true,
    });
    expect(dependencias.identidadesCriadas).toHaveLength(1);
    expect(dependencias.identidadesCriadas[0]).toMatchObject({
      emailNormalizado: "ana@exemplo.com",
      emailVerificadoEm: null,
    });
    expect(dependencias.identidadesCriadas[0]?.senhaDerivada).not.toBe(
      ENTRADA.senha,
    );
    expect(dependencias.verificacoes).toEqual([
      { email: "ana@exemplo.com", nome: "Ana Souza" },
    ]);
  });

  it("@spec:AC-101 e-mail já cadastrado devolve a mesma confirmação e avisa o dono do endereço", async () => {
    const novo = dependenciasPara(true);
    const existente = dependenciasPara(false);

    const respostaNova = await cadastrarClienteFinal(ENTRADA, novo);
    const respostaExistente = await cadastrarClienteFinal(ENTRADA, existente);

    expect(respostaExistente).toEqual(respostaNova);
    expect(existente.verificacoes).toEqual([]);
    expect(existente.avisosDeExistente).toEqual([
      { email: "ana@exemplo.com", nome: "Ana Souza" },
    ]);
  });

  it("@spec:AC-102 senha fraca recusa o cadastro com cada motivo e não cria conta", async () => {
    const dependencias = dependenciasPara(true);
    const entradaFraca = { ...ENTRADA, senha: "123456" };

    const resposta = await cadastrarClienteFinal(entradaFraca, dependencias);

    expect(resposta).toMatchObject({ cadastrado: false });
    if (!resposta.cadastrado) {
      expect(resposta.campos.map(({ problema }) => problema.codigo)).toEqual([
        "minimo_de_caracteres",
        "senha_vazada",
      ]);
      expect(
        resposta.campos.map(({ problema }) => problema.mensagem).join(" "),
      ).toContain("pelo menos 12 caracteres");
      expect(
        resposta.campos.map(({ problema }) => problema.mensagem).join(" "),
      ).toContain("vazamentos conhecidos");
    }
    expect(dependencias.identidadesCriadas).toEqual([]);
    expect(dependencias.verificacoes).toEqual([]);
  });
});
