/**
 * Apoio às provas do arranque de produção (T-024): monta o ambiente de
 * produção da prova, roda o arranque como o operador rodaria (lendo o código
 * do aplicativo que a própria prova calcula) e cria banco VAZIO descartável.
 *
 * As senhas dos papéis vêm do ambiente de teste, e não são sorteadas: papel é
 * objeto do agrupamento inteiro, e trocar a senha aqui derrubaria as outras
 * provas que dividem o mesmo PostgreSQL.
 */

import {
  apagarBanco,
  conectar,
  exigirNomeEfemero,
  nomeNovoDeBancoDeTeste,
  urlDoBanco,
  urlDoServidorDeTeste,
} from "@simpleclick/testing";

import { CHAVE_DA_PROVA } from "./apoio-da-identidade.ts";
import { exigirVariavel } from "./apoio-de-isolamento.ts";
import { executarArranque } from "../src/arranque.ts";
import type { ConviteDoAplicativo } from "../src/modules/auth/primeira-administracao.ts";
import { gerarCodigoTotp } from "../src/modules/auth/totp.usecase.ts";

/** Frase da primeira administração da prova: cumpre a política de senha. */
export const FRASE_DA_ADMINISTRACAO = "frase longa da primeira administração";

const SENHAS_DOS_PAPEIS = {
  SENHA_BANCO_MIGRADOR: exigirVariavel("SENHA_BANCO_MIGRADOR"),
  SENHA_BANCO_APLICACAO: exigirVariavel("SENHA_BANCO_APLICACAO"),
  SENHA_BANCO_ADMINISTRACAO: exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
};

/** O ambiente que o operador montaria, apontando para o banco da prova. */
export function ambienteDeArranque(
  url: string,
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: "production",
    DATABASE_URL_ARRANQUE: url,
    ...SENHAS_DOS_PAPEIS,
    CHAVE_CIFRA_TOTP: CHAVE_DA_PROVA,
    ...extra,
  };
}

/** O código que o aplicativo mostraria, `passos` adiante de agora. */
export function codigoDoAplicativo(chave: string, passos = 0): string {
  return gerarCodigoTotp(chave, new Date(Date.now() + passos * 30_000));
}

export interface ExecucaoDoArranque {
  readonly codigo: number;
  readonly saida: readonly string[];
  readonly convites: readonly ConviteDoAplicativo[];
  /** O que a prova digitou, na ordem. */
  readonly digitados: readonly string[];
}

/**
 * Roda o arranque. Por padrão digita o código certo do aplicativo; a prova
 * pode trocar o que é digitado.
 */
export async function rodarArranque(
  ambiente: Record<string, string | undefined>,
  digitar: (convite: ConviteDoAplicativo) => string = (convite) =>
    codigoDoAplicativo(convite.chave),
): Promise<ExecucaoDoArranque> {
  const saida: string[] = [];
  const convites: ConviteDoAplicativo[] = [];
  const digitados: string[] = [];
  const codigo = await executarArranque({
    ambiente,
    escrever: (linha) => saida.push(linha),
    lerCodigoDoAplicativo: async (convite) => {
      convites.push(convite);
      const digitado = digitar(convite);
      digitados.push(digitado);
      return digitado;
    },
  });
  return { codigo, saida, convites, digitados };
}

/** Banco descartável e completamente vazio (`template0`), como o do provedor. */
export async function criarBancoVazio(
  rotulo: string,
): Promise<{ readonly nome: string; readonly url: string }> {
  const servidor = urlDoServidorDeTeste();
  const nome = exigirNomeEfemero(nomeNovoDeBancoDeTeste(rotulo));
  const administrativo = await conectar(servidor);
  try {
    await administrativo.query(`CREATE DATABASE ${nome} TEMPLATE template0`);
  } finally {
    await administrativo.end();
  }
  return { nome, url: urlDoBanco(servidor, nome) };
}

export { apagarBanco };
