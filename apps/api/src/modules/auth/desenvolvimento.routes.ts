/**
 * Porta mínima de autenticação para o ambiente local.
 *
 * A implementação real de identidade permanece nos casos de uso e será
 * conectada quando a camada de persistência de autenticação entrar na API.
 * Enquanto isso, esta rota existe SOMENTE quando o ambiente fornece uma
 * credencial de teste e nunca é montada em produção.
 */
import { randomUUID } from "node:crypto";
import { Router } from "express";

import {
  assinarTokenDeAcesso,
  gerarTokenDeRenovacao,
  type PapelDaSessao,
} from "./token.ts";
import { derivarSenha, senhaConfere } from "./senha.ts";

export const EMAIL_DO_USUARIO_DE_TESTE = "SIMPLECLICK_DEV_TEST_EMAIL";
export const FRASE_DO_USUARIO_DE_TESTE = "SIMPLECLICK_DEV_TEST_PHRASE";

interface CredenciaisDaSessaoLocal {
  readonly email: string;
  readonly senha: string;
  readonly segredo: string;
}

interface SessaoParaNavegador {
  readonly tokenDeAcesso: string;
  readonly tokenDeRenovacao: string;
  readonly acessoExpiraEm: string;
}

function credenciaisDoAmbiente(
  fonte: Readonly<Record<string, string | undefined>>,
): CredenciaisDaSessaoLocal | undefined {
  if (fonte.NODE_ENV === "production") return undefined;

  const email = fonte[EMAIL_DO_USUARIO_DE_TESTE]?.trim().toLowerCase();
  const senha = fonte[FRASE_DO_USUARIO_DE_TESTE];
  const segredo = fonte.JWT_SECRET?.trim();
  if (!email || !senha || !segredo) return undefined;
  return { email, senha, segredo };
}

function respostaJson(status: number, corpo: Record<string, unknown>) {
  return { status, corpo };
}

/** Monta o login local apenas quando a credencial de teste foi explicitada. */
export function criarRotasDeAutenticacaoDeDesenvolvimento(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): Router {
  const router = Router();
  const credenciais = credenciaisDoAmbiente(fonte);
  let hashDaSenha: Promise<string> | undefined;

  router.post("/login", async (requisicao, resposta) => {
    if (credenciais === undefined) {
      const indisponivel = respostaJson(404, { erro: "nao_encontrado" });
      resposta.status(indisponivel.status).json(indisponivel.corpo);
      return;
    }

    const corpo = requisicao.body as {
      email?: unknown;
      senha?: unknown;
    };
    const email =
      typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
    const senha = typeof corpo.senha === "string" ? corpo.senha : "";

    hashDaSenha ??= derivarSenha(credenciais.senha);
    const senhaValida = await senhaConfere(senha, await hashDaSenha);
    if (email !== credenciais.email || !senhaValida) {
      resposta.status(401).json({ erro: "nao_autenticado" });
      return;
    }

    const agora = new Date();
    const sessaoId = randomUUID();
    const familiaId = randomUUID();
    const acessoExpiraEm = new Date(agora.getTime() + 15 * 60 * 1_000);

    const sessao: SessaoParaNavegador = {
      tokenDeAcesso: assinarTokenDeAcesso(
        {
          identidadeId: "usuario-de-teste-local",
          papel: "OWNER" satisfies PapelDaSessao,
          sessaoId,
          familiaId,
        },
        credenciais.segredo,
        agora,
      ),
      tokenDeRenovacao: gerarTokenDeRenovacao(),
      acessoExpiraEm: acessoExpiraEm.toISOString(),
    };

    resposta.status(200).json(sessao);
  });

  return router;
}
