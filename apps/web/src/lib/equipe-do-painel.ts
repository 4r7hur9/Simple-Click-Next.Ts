/**
 * A equipe da loja como a tela do dono a consome (card #32).
 *
 * Fala com as rotas do PRÓPRIO SITE (`/api/painel/equipe`), que levam a sessão
 * do dono à API; o token nunca chega ao script da página. NUNCA LANÇA: queda
 * de rede, sessão vencida e recusa viram estados que a tela sabe mostrar.
 */
import {
  esquemaDaEquipe,
  esquemaDoMembroDaEquipe,
  MENSAGENS_DA_EQUIPE,
  type MembroDaEquipe,
} from "@simpleclick/contracts";

export type { MembroDaEquipe };

export const ENDERECO_DA_EQUIPE = "/api/painel/equipe";

export type Buscar = typeof fetch;

export interface EquipeLida {
  readonly membros: readonly MembroDaEquipe[];
  readonly limite: { readonly limite: number; readonly uso: number };
}

export type LeituraDaEquipe =
  | { readonly estado: "ok"; readonly equipe: EquipeLida }
  | { readonly estado: "sem-permissao" }
  | { readonly estado: "erro" };

/** O que a ação devolve à tela: deu certo ou a frase do motivo. */
export type ResultadoDaAcao<T = null> =
  | { readonly estado: "ok"; readonly valor: T }
  | {
      readonly estado: "recusado";
      readonly mensagem: string;
      readonly motivo: string;
      /** Erro por campo (`senha`, `email`...), quando a API disse qual. */
      readonly campo?: string;
    };

async function pedir(
  buscar: Buscar,
  endereco: string,
  metodo: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  corpo?: unknown,
): Promise<Response | null> {
  try {
    return await buscar(endereco, {
      method: metodo,
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
  } catch {
    return null;
  }
}

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    return null;
  }
}

interface CorpoDeRecusa {
  readonly erro?: string;
  readonly mensagem?: string;
  readonly campo?: string;
}

function lerRecusa(valor: unknown): CorpoDeRecusa {
  if (typeof valor !== "object" || valor === null) return {};
  const o = valor as Record<string, unknown>;
  const campos = Array.isArray(o["campos"]) ? (o["campos"] as unknown[]) : [];
  const primeiro = campos[0];
  const caminho =
    typeof primeiro === "object" && primeiro !== null
      ? (primeiro as Record<string, unknown>)["caminho"]
      : undefined;
  return {
    ...(typeof o["erro"] === "string" ? { erro: o["erro"] } : {}),
    ...(typeof o["mensagem"] === "string" ? { mensagem: o["mensagem"] } : {}),
    ...(typeof caminho === "string" ? { campo: caminho } : {}),
  };
}

const FRASES: Readonly<Record<string, string>> = {
  limite_atingido: "Limite do seu plano atingido, fale com o suporte.",
  ja_e_membro: MENSAGENS_DA_EQUIPE.jaEMembro,
  senha_obrigatoria: MENSAGENS_DA_EQUIPE.senhaObrigatoria,
  senha_nao_gerenciada: MENSAGENS_DA_EQUIPE.senhaNaoGerenciada,
  dono_nao_sai: MENSAGENS_DA_EQUIPE.donoNaoSai,
  sem_permissao: "Só o dono da loja cuida da equipe.",
  nao_autenticado: "Sua sessão acabou. Entre de novo.",
};

async function recusa(resposta: Response | null): Promise<ResultadoDaAcao<never>> {
  if (resposta === null) {
    return {
      estado: "recusado",
      motivo: "rede",
      mensagem: "Sem conexão agora. Tente de novo.",
    };
  }
  const corpo = lerRecusa(await lerJson(resposta));
  const motivo = corpo.erro ?? `http_${resposta.status}`;
  const campo = corpo.campo;
  return {
    estado: "recusado",
    motivo,
    mensagem:
      FRASES[motivo] ??
      corpo.mensagem ??
      "Não foi possível concluir. Tente de novo.",
    ...(campo === undefined ? {} : { campo }),
  };
}

export async function lerEquipe(buscar: Buscar = fetch): Promise<LeituraDaEquipe> {
  const resposta = await pedir(buscar, ENDERECO_DA_EQUIPE, "GET");
  if (resposta === null) return { estado: "erro" };
  if (resposta.status === 403) return { estado: "sem-permissao" };
  if (!resposta.ok) return { estado: "erro" };
  const lido = esquemaDaEquipe.safeParse(await lerJson(resposta));
  return lido.success ? { estado: "ok", equipe: lido.data } : { estado: "erro" };
}

export async function cadastrarMembro(
  dados: { nome: string; email: string; senha: string },
  buscar: Buscar = fetch,
): Promise<ResultadoDaAcao<MembroDaEquipe>> {
  const resposta = await pedir(buscar, ENDERECO_DA_EQUIPE, "POST", dados);
  if (resposta === null || !resposta.ok) return recusa(resposta);
  const corpo = await lerJson(resposta);
  const lido = esquemaDoMembroDaEquipe.safeParse(
    typeof corpo === "object" && corpo !== null
      ? (corpo as Record<string, unknown>)["membro"]
      : undefined,
  );
  return lido.success ? { estado: "ok", valor: lido.data } : recusa(null);
}

export async function mudarAcesso(
  id: string,
  ativo: boolean,
  buscar: Buscar = fetch,
): Promise<ResultadoDaAcao> {
  const resposta = await pedir(
    buscar,
    `${ENDERECO_DA_EQUIPE}/${encodeURIComponent(id)}`,
    "PATCH",
    { ativo },
  );
  if (resposta === null || !resposta.ok) return recusa(resposta);
  return { estado: "ok", valor: null };
}

export async function removerMembro(
  id: string,
  buscar: Buscar = fetch,
): Promise<ResultadoDaAcao> {
  const resposta = await pedir(
    buscar,
    `${ENDERECO_DA_EQUIPE}/${encodeURIComponent(id)}`,
    "DELETE",
  );
  if (resposta === null || !resposta.ok) return recusa(resposta);
  return { estado: "ok", valor: null };
}

export async function trocarSenhaDoMembro(
  id: string,
  senha: string,
  buscar: Buscar = fetch,
): Promise<ResultadoDaAcao> {
  const resposta = await pedir(
    buscar,
    `${ENDERECO_DA_EQUIPE}/${encodeURIComponent(id)}/senha`,
    "PUT",
    { senha },
  );
  if (resposta === null || !resposta.ok) return recusa(resposta);
  return { estado: "ok", valor: null };
}
