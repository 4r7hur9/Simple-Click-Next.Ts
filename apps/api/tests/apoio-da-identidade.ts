/**
 * Apoio às provas da identidade persistida (T-111).
 *
 * Existe para que as três provas — cadastro e recuperação, sessão, segundo
 * fator — montem os repositórios de banco do MESMO jeito: sobre o banco
 * descartável do arquivo, pela credencial que atende requisição (`sc_app`) e
 * dentro de um contexto de requisição, como a API faz. Uma prova que montasse
 * os repositórios por outro caminho provaria outra coisa.
 *
 * "Instância" aqui é um acesso ao banco com agrupador próprio: duas
 * instâncias são dois processos da API do ponto de vista do banco, e é assim
 * que AC-129 se prova sem subir dois servidores.
 */

import { randomBytes } from "node:crypto";

import { bancoDoArquivo } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import {
  CONTEXTO_DO_TOTP,
  criarCifradorDeSegredos,
  type CifradorDeSegredos,
} from "../src/core/cifra.ts";
import {
  executarComoRequisicao,
  type PapelDeAcesso,
} from "../src/core/contexto.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  codigosRepoNoBanco,
  repositorioDeIdentidadesNoBanco,
  repositorioDeRecuperacaoNoBanco,
  repositorioDoLoginNoBanco,
} from "../src/modules/auth/identidade.repo.ts";
import {
  repositorioDeCodigosDeRecuperacaoNoBanco,
  repositorioDeDesafiosNoBanco,
  repositorioTotpNoBanco,
} from "../src/modules/auth/segundo-fator.repo.ts";
import { repositorioDeSessoesNoBanco } from "../src/modules/auth/sessoes.repo.ts";
import type { DependenciasDaSessao } from "../src/modules/auth/sessao.usecase.ts";

/** Chave de cifra só desta execução: 32 bytes sorteados, nunca de ambiente. */
export const CHAVE_DA_PROVA = randomBytes(32).toString("base64");

/** Segredo de assinatura só desta execução, sorteado. */
export const ASSINATURA_DA_PROVA = randomBytes(48).toString("base64url");

/** Frase que cumpre a política de senha (doze caracteres, fora de vazamentos). */
export const FRASE_DA_PROVA = "uma frase longa da prova de identidade";
export const OUTRA_FRASE_DA_PROVA = "outra frase longa, escolhida depois";

/** Os repositórios de banco, montados sobre um acesso. */
export function repositoriosDaIdentidade(
  acesso: AcessoAoBanco,
  cifrador: CifradorDeSegredos = criarCifradorDeSegredos(
    CHAVE_DA_PROVA,
    CONTEXTO_DO_TOTP,
  ),
) {
  const deste = () => acesso;
  return {
    acesso,
    cifrador,
    identidades: repositorioDeIdentidadesNoBanco(deste),
    login: repositorioDoLoginNoBanco(deste),
    codigos: codigosRepoNoBanco(deste),
    recuperacao: repositorioDeRecuperacaoNoBanco(deste),
    sessoes: repositorioDeSessoesNoBanco(deste),
    desafios: repositorioDeDesafiosNoBanco(deste, { cifrador }),
    totp: repositorioTotpNoBanco(deste, cifrador),
    codigosDeRecuperacao: repositorioDeCodigosDeRecuperacaoNoBanco(deste),
  };
}

export type RepositoriosDaIdentidade = ReturnType<
  typeof repositoriosDaIdentidade
>;

/** Uma "instância da API": agrupador próprio sobre o banco do arquivo. */
export function abrirInstancia(cifrador?: CifradorDeSegredos) {
  return repositoriosDaIdentidade(
    abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 }),
    cifrador,
  );
}

/** Dependências da sessão sobre os repositórios da instância. */
export function dependenciasDaSessao(
  repositorios: RepositoriosDaIdentidade,
  avisarReusoDeToken: DependenciasDaSessao["avisador"]["avisarReusoDeToken"] = async () =>
    undefined,
): DependenciasDaSessao {
  return {
    repositorio: repositorios.sessoes,
    avisador: { avisarReusoDeToken },
    segredoDeAssinatura: ASSINATURA_DA_PROVA,
  };
}

/** Roda como requisição de quem ainda não é ninguém: cadastro, login. */
export function comoVisitante<T>(acao: () => Promise<T>): Promise<T> {
  return executarComoRequisicao({}, () => acao());
}

/** Roda como requisição de quem já está logado, fora de qualquer loja. */
export function comoPessoa<T>(
  identidadeId: string,
  papel: PapelDeAcesso,
  acao: () => Promise<T>,
): Promise<T> {
  return executarComoRequisicao({ usuarioId: identidadeId, papel }, () =>
    acao(),
  );
}
