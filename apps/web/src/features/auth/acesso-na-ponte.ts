/**
 * As duas chamadas de acesso à ponte do site (`/api/auth/...`): entrar e
 * criar conta. Ficam aqui porque as páginas `/entrar` e `/cadastrar` e a
 * janela de acesso da loja falam com a ponte do mesmo jeito.
 *
 * Os tokens nunca chegam aqui: a ponte grava os cookies HttpOnly e devolve
 * só o próximo passo.
 */
import type {
  DadosDoCadastroNaTela,
  RespostaDoCadastroNaTela,
} from "./CadastroForm.tsx";
import type { RespostaDoLoginNaTela } from "./LoginForm.tsx";
import {
  respostaDaLoja,
  respostaDoCadastro,
  respostaDoLogin,
  type RespostaDaLojaNaTela,
} from "./respostas-de-acesso.ts";

/** Corpo JSON da ponte; vazio quando ela não devolveu JSON. */
async function lerCorpo(resposta: Response): Promise<Record<string, unknown>> {
  try {
    const corpo: unknown = await resposta.json();
    return typeof corpo === "object" && corpo !== null
      ? (corpo as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function postar(caminho: string, corpo: unknown): Promise<Response> {
  return fetch(`/api/auth/${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(corpo),
  });
}

export async function enviarLogin(entrada: {
  readonly email: string;
  readonly senha: string;
}): Promise<RespostaDoLoginNaTela> {
  const resposta = await postar("login", entrada);
  return respostaDoLogin(resposta.status, await lerCorpo(resposta));
}

export async function enviarCadastro(
  dados: DadosDoCadastroNaTela,
): Promise<RespostaDoCadastroNaTela> {
  const resposta = await postar("cadastro", dados);
  return respostaDoCadastro(resposta.status, await lerCorpo(resposta));
}

/** Os dados da loja que o dono cadastra (`POST /v1/auth/lojas`). */
export interface DadosDaLojaNaTela {
  readonly nome: string;
  readonly tipoDeNegocio: string;
  readonly apelido: string;
  readonly whatsapp?: string;
  readonly cidade?: string;
  readonly uf?: string;
  /** Aceite dos Termos do Lojista (card #79). */
  readonly aceitouTermosDoLojista: true;
}

/** Abre a loja da conta logada; ela nasce aguardando aprovação. */
export async function enviarLoja(
  dados: DadosDaLojaNaTela,
): Promise<RespostaDaLojaNaTela> {
  const resposta = await postar("lojas", dados);
  return respostaDaLoja(resposta.status, await lerCorpo(resposta));
}
