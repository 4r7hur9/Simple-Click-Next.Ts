/**
 * Tradução das respostas da ponte de sessão (`/api/auth/...`) para os
 * estados das telas de acesso (T-113).
 *
 * Fica fora das páginas para as provas conferirem a tradução sem montar a
 * tela, e para login, segundo fator e código de recuperação lerem a mesma
 * resposta do mesmo jeito.
 */
import type { RespostaDoCadastroNaTela } from "./CadastroForm.tsx";
import type { RespostaDoCodigoNaTela } from "./CodigoForm.tsx";
import type { RespostaDaRecuperacaoNaTela } from "./CodigoDeRecuperacaoForm.tsx";
import type { RespostaDoLoginNaTela } from "./LoginForm.tsx";

/** O corpo que a ponte devolve, lido sem confiar na forma. */
type Corpo = Record<string, unknown>;

/** Sem destino na resposta: o cliente começa pelo feed (card #37). */
const DESTINO_PADRAO = "/explorar/produtos";

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
      redirecionarPara:
        texto(corpo["redirecionarPara"]) || DESTINO_PADRAO,
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

/**
 * Cadastro: a conta nasce com a sessão aberta (201 + SESSAO_CRIADA). O 201
 * sem sessão é o formato antigo, ainda lido para não quebrar.
 */
export function respostaDoCadastro(
  status: number,
  corpo: Corpo,
): RespostaDoCadastroNaTela {
  if (status === 201 && corpo["status"] === "SESSAO_CRIADA") {
    return {
      status: "SESSAO_CRIADA",
      redirecionarPara:
        texto(corpo["redirecionarPara"]) || DESTINO_PADRAO,
    };
  }
  if (status === 201) {
    return { status: "CADASTRADO", mensagem: texto(corpo["mensagem"]) };
  }
  if (status === 409) {
    return {
      status: "EMAIL_EM_USO",
      mensagem: "Este e-mail já tem conta. Entre com a sua senha.",
    };
  }
  if (status === 422) {
    return {
      status: "SENHA_FRACA",
      mensagem:
        texto(corpo["mensagem"]) ||
        "Use pelo menos 12 caracteres e evite senhas muito conhecidas.",
    };
  }
  const campos = corpo["campos"];
  if (status === 400 && Array.isArray(campos)) {
    return {
      status: "CAMPOS_INVALIDOS",
      campos: campos.map((item: Record<string, unknown>) => ({
        campo: texto(item["caminho"]),
        mensagem: texto(item["mensagem"]),
      })),
    };
  }
  if (status === 429) {
    return {
      status: "INDISPONIVEL",
      mensagem:
        "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
    };
  }
  return {
    status: "INDISPONIVEL",
    mensagem:
      texto(corpo["mensagem"]) ||
      "Não foi possível criar a conta agora. Tente novamente.",
  };
}

/** Segundo fator: sessão, tentativa errada ou desafio que acabou. */
export function respostaDoCodigo(
  status: number,
  corpo: Corpo,
): RespostaDoCodigoNaTela {
  if (status === 200 && corpo["status"] === "SESSAO_CRIADA") {
    return {
      status: "SESSAO_CRIADA",
      redirecionarPara:
        texto(corpo["redirecionarPara"]) || DESTINO_PADRAO,
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
      redirecionarPara:
        texto(corpo["redirecionarPara"]) || DESTINO_PADRAO,
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

export type RespostaDaLojaNaTela =
  | { readonly status: "CRIADA"; readonly apelido: string }
  | {
      readonly status: "APELIDO_EM_USO";
      readonly mensagem: string;
      readonly sugestao: string | null;
    }
  | { readonly status: "CAMPOS_INVALIDOS"; readonly campos: readonly { campo: string; mensagem: string }[] }
  | { readonly status: "LIMITE"; readonly mensagem: string }
  | { readonly status: "SEM_SESSAO" }
  | { readonly status: "INDISPONIVEL"; readonly mensagem: string };

/** Abrir a loja (`lojas`): criada, endereço em uso, campo inválido ou limite. */
export function respostaDaLoja(
  status: number,
  corpo: Corpo,
): RespostaDaLojaNaTela {
  const loja = corpo["loja"];
  if (
    status === 201 &&
    typeof loja === "object" &&
    loja !== null &&
    typeof (loja as Record<string, unknown>)["apelido"] === "string"
  ) {
    return {
      status: "CRIADA",
      apelido: (loja as Record<string, string>)["apelido"] ?? "",
    };
  }
  if (status === 401) return { status: "SEM_SESSAO" };
  if (status === 409 && corpo["erro"] === "apelido_em_uso") {
    return {
      status: "APELIDO_EM_USO",
      mensagem: "Este endereço já está em uso. Escolha outro.",
      sugestao: typeof corpo["sugestao"] === "string" ? corpo["sugestao"] : null,
    };
  }
  if (status === 409 && corpo["erro"] === "limite_atingido") {
    return {
      status: "LIMITE",
      mensagem:
        texto(corpo["mensagem"]) ||
        "Esta conta já chegou ao limite de lojas.",
    };
  }
  const campos = corpo["campos"];
  if (status === 400 && Array.isArray(campos)) {
    return {
      status: "CAMPOS_INVALIDOS",
      campos: campos.map((item: Record<string, unknown>) => ({
        campo: texto(item["caminho"]),
        mensagem: texto(item["mensagem"]),
      })),
    };
  }
  return {
    status: "INDISPONIVEL",
    mensagem:
      "Sua conta foi criada, mas não deu para cadastrar a loja agora. Tente de novo.",
  };
}
