/**
 * Contas criadas pelos passos de verdade, para as provas da identidade
 * persistida (T-111): cadastro com o primeiro link de verificação gravado no
 * banco, verificação, login com senha e leitura da linha da identidade.
 *
 * Fica separado de `apoio-da-identidade.ts` (que monta os repositórios) para
 * que cada prova importe só o que usa e nenhum arquivo passe do tamanho que
 * se lê de uma vez.
 */
import type pg from "pg";
import { vi } from "vitest";

import { sufixoDeTeste } from "@simpleclick/testing";

import {
  comoVisitante,
  FRASE_DA_PROVA,
  type RepositoriosDaIdentidade,
} from "./apoio-da-identidade.ts";
import { entrarComSenha } from "../src/modules/auth/login.usecase.ts";
import {
  avaliarPoliticaDeSenha,
  derivarSenha,
  senhaConfere,
} from "../src/modules/auth/senha.ts";
import {
  criarCasoDeUsoDeVerificacaoDeEmail,
  gerarTokenDeVerificacao,
  PRAZO_DO_LINK_DE_VERIFICACAO_EM_MS,
  resumirTokenDeVerificacao,
} from "../src/modules/auth/verificar-email.usecase.ts";

/** E-mail que nenhuma outra prova usa. */
export function emailNovo(): string {
  return `pessoa-${sufixoDeTeste()}@exemplo.test`;
}

/** A política de senha de verdade, como a API valida. */
export async function validarNovaSenha(senha: string): Promise<void> {
  if (!avaliarPoliticaDeSenha(senha).valida) {
    throw new Error("senha fora da política");
  }
}

/** Avisos do cadastro que criam o primeiro link de verificação no banco. */
export function avisosQueCriamOLink(repositorios: RepositoriosDaIdentidade) {
  const links = new Map<string, string>();
  return {
    links,
    enviarVerificacao: vi.fn(async ({ email }: { email: string }) => {
      const token = gerarTokenDeVerificacao();
      const agora = new Date();
      const criado = await repositorios.codigos.criarVerificacaoParaEmail(
        email.trim().toLowerCase(),
        {
          id: crypto.randomUUID(),
          resumoDoToken: resumirTokenDeVerificacao(token),
          enviadoEm: agora,
          expiraEm: new Date(
            agora.getTime() + PRAZO_DO_LINK_DE_VERIFICACAO_EM_MS,
          ),
        },
      );
      if (criado !== null) links.set(email.trim().toLowerCase(), token);
    }),
    enviarAvisoDeCadastroExistente: vi.fn(async () => undefined),
  };
}

/**
 * Conta PENDENTE de verificação, pelo caminho antigo (o cadastro da rota já
 * nasce verificado): é o que as provas do link de verificação precisam.
 */
export function cadastrar(
  repositorios: RepositoriosDaIdentidade,
  email: string,
  avisos = avisosQueCriamOLink(repositorios),
  senha = FRASE_DA_PROVA,
) {
  return comoVisitante(async () => {
    const politica = avaliarPoliticaDeSenha(senha);
    if (!politica.valida) {
      return {
        cadastrado: false as const,
        campos: politica.problemas.map((problema) => ({
          campo: "senha" as const,
          problema,
        })),
      };
    }
    const { criada } = await repositorios.identidades.criarPendenteSeAusente({
      nome: "Pessoa da prova",
      emailNormalizado: email.trim().toLowerCase(),
      telefoneE164: "+5511912345678",
      senhaDerivada: await derivarSenha(senha),
    });
    if (criada) {
      await avisos.enviarVerificacao({ email });
    } else {
      await avisos.enviarAvisoDeCadastroExistente();
    }
    return {
      cadastrado: true as const,
      mensagem:
        "Seus dados foram recebidos. Enviamos instruções para confirmar seu e-mail.",
      verificacaoDeEmailPendente: true as const,
    };
  });
}

/** Conta criada e verificada pelos passos de verdade; devolve o id. */
export async function contaVerificada(
  repositorios: RepositoriosDaIdentidade,
  email = emailNovo(),
): Promise<{ readonly id: string; readonly email: string }> {
  const avisos = avisosQueCriamOLink(repositorios);
  await cadastrar(repositorios, email, avisos);
  const token = avisos.links.get(email);
  if (token === undefined) throw new Error("o cadastro não criou o link");
  const verificacao = criarCasoDeUsoDeVerificacaoDeEmail({
    codigos: repositorios.codigos,
    email: { enfileirar: async () => undefined },
    origemDoSite: "https://simpleclick.exemplo.test",
  });
  const resultado = await comoVisitante(() => verificacao.verificar(token));
  if (resultado.situacao !== "verificado") {
    throw new Error(`verificação falhou: ${resultado.situacao}`);
  }
  return { id: resultado.identidade.id, email };
}

/** Login de verdade com senha; desafio e sessão ficam em duplos. */
export function entrar(
  repositorios: RepositoriosDaIdentidade,
  email: string,
  senha: string,
) {
  const criarDesafioDeSegundoFator = vi.fn(async () => ({
    desafioId: "desafio-da-prova",
  }));
  const criarSessao = vi.fn(async () => ({ sessaoId: "sessao-da-prova" }));
  return comoVisitante(async () => ({
    resultado: await entrarComSenha(
      { email, senha },
      {
        identidades: repositorios.login,
        conferirSenha: senhaConfere,
        criarDesafioDeSegundoFator,
        criarSessao,
      },
    ),
    criarDesafioDeSegundoFator,
    criarSessao,
  }));
}

/** A linha da identidade lida pelo migrador, que contorna o isolamento. */
export async function identidadeNoBanco(migrador: pg.Client, email: string) {
  const { rows } = await migrador.query<{
    id: string;
    password_hash: string | null;
    email_verified_at: Date | null;
    phone_e164: string | null;
  }>(
    `SELECT id, password_hash, email_verified_at, phone_e164
       FROM app.identities WHERE email_norm = $1`,
    [email],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Cadastro e verificação de e-mail
