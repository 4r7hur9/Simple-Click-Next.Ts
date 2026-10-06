/**
 * Tradução das respostas da ponte de sessão (`/api/auth/...`) para os
 * estados das telas de acesso (T-113).
 *
 * Fica fora das páginas para as provas conferirem a tradução sem montar a
 * tela, e para login, segundo fator e código de recuperação lerem a mesma
 * resposta do mesmo jeito.
 */
import type { RespostaDoCodigoNaTela } from "./CodigoForm.tsx";
import type { RespostaDaRecuperacaoNaTela } from "./CodigoDeRecuperacaoForm.tsx";
import type { RespostaDoLoginNaTela } from "./LoginForm.tsx";

/** O corpo que a ponte devolve, lido sem confiar na forma. */
type Corpo = Record<string, unknown>;

const texto = (valor: unknown): string =>
  typeof valor === "string" ? valor : "";

/** Login: sessão, desafio ou recusa (AC-105, AC-108, AC-119, AC-122). */
export function respostaDoLogin(
  status: number,
  corpo: Corpo,
): RespostaDoLoginNaTela {
  if (status === 200 && corpo["status"] === "SESSAO_CRIADA") {
    return {
      status: "SESSAO_CRIADA",
      redirecionarPara: texto(corpo["redirecionarPara"]) || "/minha-conta",
    };
  }
  if (status === 200 && corpo["status"] === "DESAFIO_DE_SEGUNDO_FATOR") {
    return {
      status: "DESAFIO_DE_SEGUNDO_FATOR",
      desafioId: texto(corpo["desafioId"]),
      canal: corpo["canal"] === "TOTP" ? "TOTP" : "EMAIL",
    };
  }
  if (corpo["status"] === "CONFIGURACAO_DO_APLICATIVO_OBRIGATORIA") {
    return { status: "CONFIGURACAO_OBRIGATORIA" };
  }
  if (status === 403) return { status: "EMAIL_NAO_VERIFICADO" };
  if (status === 429) {
    const espera = Number(corpo["esperaSegundos"]);
    return {
      status: "MUITAS_TENTATIVAS",
      esperaSegundos: Number.isFinite(espera) ? espera : 60,
    };
  }
  if (status === 503) {
    return {
      status: "INDISPONIVEL",
      mensagem:
        texto(corpo["mensagem"]) ||
        "O serviço está indisponível no momento. Tente mais tarde.",
    };
  }
  return { status: "CREDENCIAIS_INVALIDAS" };
}

/** Segundo fator: sessão, tentativa errada ou desafio que acabou. */
export function respostaDoCodigo(
  status: number,
  corpo: Corpo,
): RespostaDoCodigoNaTela {
  if (status === 200 && corpo["status"] === "SESSAO_CRIADA") {
    return {
      status: "SESSAO_CRIADA",
      redirecionarPara: texto(corpo["redirecionarPara"]) || "/minha-conta",
    };
  }
  if (corpo["status"] === "CODIGO_INCORRETO") {
    return {
      status: "CODIGO_INCORRETO",
      tentativasRestantes: Number(corpo["tentativasRestantes"] ?? 0),
    };
  }
  if (corpo["status"] === "BLOQUEADO") return { status: "BLOQUEADO" };
  if (corpo["status"] === "DESAFIO_EXPIRADO") {
    return { status: "DESAFIO_EXPIRADO" };
  }
  return { status: "DESAFIO_INVALIDO" };
}

/** Código de recuperação: sessão (com orientação) ou código inválido. */
export function respostaDaRecuperacao(
  status: number,
  corpo: Corpo,
): RespostaDaRecuperacaoNaTela {
  if (status === 200 && corpo["status"] === "SESSAO_CRIADA") {
    const orientarPara = texto(corpo["orientarPara"]);
    return {
      status: "SESSAO_CRIADA",
      redirecionarPara: texto(corpo["redirecionarPara"]) || "/minha-conta",
      ...(orientarPara === "" ? {} : { orientarPara }),
    };
  }
  if (corpo["status"] === "CODIGO_INVALIDO")
    return { status: "CODIGO_INVALIDO" };
  return {
    status: "ERRO",
    mensagem:
      texto(corpo["mensagem"]) ||
      "Não foi possível confirmar o código agora. Tente novamente.",
  };
}
