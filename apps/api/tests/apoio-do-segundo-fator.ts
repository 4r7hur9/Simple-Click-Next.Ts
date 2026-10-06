/**
 * Apoio às provas do segundo fator persistido (T-111): código do aplicativo
 * calculado como um celular faria, dona de loja com senha, sessão criada pelo
 * caso de uso de verdade, desafio por e-mail aberto no banco e aplicativo
 * ativado pelo caminho de verdade.
 *
 * Compartilhado por `segundo-fator-persistido.test.ts`,
 * `aplicativo-autenticador-persistido.test.ts` e
 * `isolamento-da-identidade.test.ts`, para que as três montem o cenário do
 * mesmo jeito.
 */
import type pg from "pg";

import { criarLoja } from "@simpleclick/testing";

import {
  ASSINATURA_DA_PROVA,
  comoPessoa,
  comoVisitante,
  dependenciasDaSessao,
  FRASE_DA_PROVA,
  type RepositoriosDaIdentidade,
} from "./apoio-da-identidade.ts";
import type { PapelDeAcesso } from "../src/core/contexto.ts";
import { criarCodigosDeRecuperacao } from "../src/modules/auth/recovery-codes.ts";
import {
  gerarCodigoDoDesafio,
  PRAZO_DO_DESAFIO_EM_MS,
} from "../src/modules/auth/segundo-fator.repo.ts";
import { derivarSenha } from "../src/modules/auth/senha.ts";
import { iniciarSessao } from "../src/modules/auth/sessao.usecase.ts";
import {
  verificarTokenDeAcesso,
  type PapelDaSessao,
} from "../src/modules/auth/token.ts";
import {
  ativarAplicativoTotp,
  gerarCodigoTotp,
  prepararAtivacaoTotp,
} from "../src/modules/auth/totp.usecase.ts";

export const PASSO_EM_MS = 30_000;

/** Código do aplicativo no passo atual mais `passos` (como um celular). */
export function codigoDoAplicativo(segredo: string, passos = 0): string {
  return gerarCodigoTotp(segredo, new Date(Date.now() + passos * PASSO_EM_MS));
}

/** Um código de seis dígitos que com certeza não é o informado. */
export function codigoDiferente(codigo: string): string {
  return codigo === "000000" ? "111111" : "000000";
}

/** Dá senha à identidade criada pelos construtores de prova. */
export async function darSenha(
  migrador: pg.Client,
  identidadeId: string,
): Promise<void> {
  await migrador.query(
    `UPDATE app.identities SET password_hash = $2 WHERE id = $1`,
    [identidadeId, await derivarSenha(FRASE_DA_PROVA)],
  );
}

/** Dona de loja com senha e e-mail verificado. */
export async function donaComSenha(migrador: pg.Client) {
  const loja = await criarLoja();
  await darSenha(migrador, loja.dono.id);
  return loja.dono;
}

/** Cria a sessão de verdade e devolve o id dela, como o login faria. */
export function criarSessaoDe(
  repositorios: RepositoriosDaIdentidade,
  papel: PapelDaSessao,
) {
  return async (entrada: { readonly identidadeId: string } | string) => {
    const identidadeId =
      typeof entrada === "string" ? entrada : entrada.identidadeId;
    const sessao = await iniciarSessao(
      { identidadeId, papel, cliente: "navegador" },
      dependenciasDaSessao(repositorios),
    );
    return {
      sessaoId: verificarTokenDeAcesso(
        sessao.tokenDeAcesso,
        ASSINATURA_DA_PROVA,
      ).sessaoId,
    };
  };
}

/** Abre um desafio por e-mail e devolve o código que "foi" para a caixa. */
export async function desafioPorEmail(
  repositorios: RepositoriosDaIdentidade,
  identidadeId: string,
) {
  const codigo = gerarCodigoDoDesafio();
  const agora = new Date();
  const { desafioId } = await comoVisitante(async () =>
    repositorios.desafios.criar({
      identidadeId,
      canal: "EMAIL",
      codigoDerivado: await derivarSenha(codigo),
      expiraEm: new Date(agora.getTime() + PRAZO_DO_DESAFIO_EM_MS),
      agora,
    }),
  );
  return { desafioId, codigo };
}

/** Ativa o aplicativo pelo caminho de verdade; devolve segredo e códigos. */
export async function ativarAplicativo(
  repositorios: RepositoriosDaIdentidade,
  identidadeId: string,
  papel: PapelDeAcesso,
) {
  return comoPessoa(identidadeId, papel, async () => {
    const preparada = await prepararAtivacaoTotp(
      identidadeId,
      "pessoa@exemplo.test",
      { repositorio: repositorios.totp, cifrador: repositorios.cifrador },
    );
    const codigoDaAtivacao = codigoDoAplicativo(preparada.segredo);
    const ativacao = await ativarAplicativoTotp(
      identidadeId,
      codigoDaAtivacao,
      {
        repositorio: repositorios.totp,
        cifrador: repositorios.cifrador,
        gerarCodigosDeRecuperacao: (id) =>
          criarCodigosDeRecuperacao(id, repositorios.codigosDeRecuperacao),
      },
    );
    if (ativacao.status !== "ATIVADO") throw new Error("não ativou");
    return {
      segredo: preparada.segredo,
      codigoDaAtivacao,
      codigosDeRecuperacao: ativacao.codigosDeRecuperacao,
    };
  });
}

/** Papéis das sessões gravadas para a identidade, lidos pelo migrador. */
export async function sessoesDe(migrador: pg.Client, identidadeId: string) {
  const { rows } = await migrador.query<{ role_at_issue: string }>(
    `SELECT role_at_issue FROM app.sessions WHERE identity_id = $1`,
    [identidadeId],
  );
  return rows;
}
