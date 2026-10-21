/**
 * A loja que o próprio lojista abre (`POST /v1/auth/lojas`, card #25).
 *
 * Qualquer conta logada pede: a loja nasce AGUARDANDO APROVAÇÃO, com a pessoa
 * como dona, e respeita o limite de lojas por dono (409 `limite_atingido`). A
 * criação é do banco (`app.solicitar_loja`, migração 0052), porque a
 * credencial das lojas não insere em `stores`.
 *
 * Ser dona muda o papel da conta — e a sessão aberta antes, com o papel
 * antigo, cairia na próxima renovação. Por isso a resposta já abre a sessão
 * nova (mesmo corpo do login), com a loja criada em `loja`.
 */

import type { LojaSolicitadaNoContrato } from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";

/** Quantos apelidos derivados do nome se tenta antes de desistir. */
const TENTATIVAS_DE_APELIDO = 20;

/** O apelido a partir do nome: sem acento, minúsculo, com hífen. */
export function apelidoDoNome(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `loja-${base || "nova"}`;
}

/** Os candidatos, na ordem: o próprio, depois -2, -3… */
export function candidatosDeApelido(base: string, quantos: number): string[] {
  const lista = [base];
  for (let numero = 2; lista.length < quantos; numero += 1) {
    lista.push(`${base.slice(0, 63 - `-${numero}`.length)}-${numero}`);
  }
  return lista;
}

export type ResultadoDaLojaSolicitada =
  | {
      readonly resultado: "CRIADA";
      readonly codigo: string;
      readonly apelido: string;
    }
  | { readonly resultado: "SEM_SESSAO" }
  | { readonly resultado: "TIPO_DESCONHECIDO" }
  | { readonly resultado: "APELIDO_EM_USO"; readonly sugestao: string | null }
  | {
      readonly resultado: "LIMITE_ATINGIDO";
      readonly limite: number;
      readonly uso: number;
    };

interface LinhaDaSolicitacao {
  readonly resultado: string;
  readonly code: string | null;
  readonly slug: string | null;
  readonly limite: number | null;
  readonly uso: number | null;
}

/**
 * Pede a loja no banco, como a pessoa do contexto. Apelido escolhido que já
 * existe é recusado com sugestão; apelido derivado do nome ganha sufixo.
 */
export async function solicitarLoja(
  dados: LojaSolicitadaNoContrato,
): Promise<ResultadoDaLojaSolicitada> {
  const escolhido = dados.apelido !== undefined;
  const base = dados.apelido ?? apelidoDoNome(dados.nome);
  const candidatos = candidatosDeApelido(
    base,
    escolhido ? 1 : TENTATIVAS_DE_APELIDO,
  );
  const tx = transacaoAtual();

  for (const apelido of candidatos) {
    const [linha] = await tx.$queryRaw<LinhaDaSolicitacao[]>`
      SELECT resultado, code, slug, limite, uso
        FROM app.solicitar_loja(${dados.nome}, ${apelido}, ${dados.tipoDeNegocio},
                                ${dados.whatsapp ?? null}, ${dados.cidade ?? null},
                                ${dados.uf ?? null})`;
    switch (linha?.resultado) {
      case "CRIADA":
        return {
          resultado: "CRIADA",
          codigo: linha.code ?? "",
          apelido: linha.slug ?? apelido,
        };
      case "APELIDO_EM_USO":
        continue;
      case "LIMITE_ATINGIDO":
        return {
          resultado: "LIMITE_ATINGIDO",
          limite: Number(linha.limite ?? 0),
          uso: Number(linha.uso ?? 0),
        };
      case "TIPO_DESCONHECIDO":
        return { resultado: "TIPO_DESCONHECIDO" };
      default:
        return { resultado: "SEM_SESSAO" };
    }
  }

  if (!escolhido) return { resultado: "APELIDO_EM_USO", sugestao: null };
  // Para o apelido escolhido, sugere o primeiro livre com sufixo.
  for (const sugestao of candidatosDeApelido(base, TENTATIVAS_DE_APELIDO).slice(
    1,
  )) {
    const [livre] = await tx.$queryRaw<{ livre: boolean }[]>`
      SELECT app.apelido_livre(${sugestao}) AS livre`;
    if (livre?.livre === true) return { resultado: "APELIDO_EM_USO", sugestao };
  }
  return { resultado: "APELIDO_EM_USO", sugestao: null };
}

/** O endereço está livre? Quando não, o primeiro parecido que está. */
export async function conferirApelido(
  apelido: string,
): Promise<{ readonly disponivel: boolean; readonly sugestao: string | null }> {
  const tx = transacaoAtual();
  const [linha] = await tx.$queryRaw<{ livre: boolean }[]>`
    SELECT app.apelido_livre(${apelido}) AS livre`;
  if (linha?.livre === true) return { disponivel: true, sugestao: null };
  for (const sugestao of candidatosDeApelido(apelido, TENTATIVAS_DE_APELIDO).slice(
    1,
  )) {
    const [livre] = await tx.$queryRaw<{ livre: boolean }[]>`
      SELECT app.apelido_livre(${sugestao}) AS livre`;
    if (livre?.livre === true) return { disponivel: false, sugestao };
  }
  return { disponivel: false, sugestao: null };
}

export type ResultadoDaLojaEmAnalise =
  | "OK"
  | "SEM_SESSAO"
  | "NAO_ENCONTRADA"
  | "ESTADO_INVALIDO"
  | "TIPO_DESCONHECIDO";

/** O dono corrige os dados da loja que está aguardando ou foi recusada. */
export async function corrigirLojaEmAnalise(
  apelido: string,
  dados: Omit<LojaSolicitadaNoContrato, "apelido" | "aceitouTermosDoLojista">,
): Promise<ResultadoDaLojaEmAnalise> {
  const [linha] = await transacaoAtual().$queryRaw<{ resultado: string }[]>`
    SELECT app.editar_loja_em_analise(${apelido}, ${dados.nome},
             ${dados.tipoDeNegocio}, ${dados.whatsapp ?? null},
             ${dados.cidade ?? null}, ${dados.uf ?? null}) AS resultado`;
  return linha?.resultado === "EDITADA"
    ? "OK"
    : (linha?.resultado as ResultadoDaLojaEmAnalise | undefined) ??
        "NAO_ENCONTRADA";
}

/** O dono reenvia a loja recusada para uma nova análise. */
export async function reenviarLojaRecusada(
  apelido: string,
): Promise<ResultadoDaLojaEmAnalise> {
  const [linha] = await transacaoAtual().$queryRaw<{ resultado: string }[]>`
    SELECT app.reenviar_loja(${apelido}) AS resultado`;
  return linha?.resultado === "REENVIADA"
    ? "OK"
    : (linha?.resultado as ResultadoDaLojaEmAnalise | undefined) ??
        "NAO_ENCONTRADA";
}

export interface LojaEmAnalise {
  readonly nome: string;
  readonly tipoDeNegocio: string;
  readonly whatsapp: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
  readonly status: "PENDING_APPROVAL" | "REJECTED";
  readonly recusa: { readonly desde: string; readonly motivo: string } | null;
}

/** Os dados da loja em análise (ou recusada) da pessoa dona; `null` se não for dela. */
export async function lerLojaEmAnalise(
  apelido: string,
): Promise<LojaEmAnalise | null> {
  const [linha] = await transacaoAtual().$queryRaw<
    {
      nome: string;
      vertical: string;
      whatsapp: string | null;
      cidade: string | null;
      uf: string | null;
      status: "PENDING_APPROVAL" | "REJECTED";
      recusa_motivo: string | null;
      recusa_em: Date | null;
    }[]
  >`SELECT * FROM app.minha_loja_em_analise(${apelido})`;
  if (linha === undefined) return null;
  return {
    nome: linha.nome,
    tipoDeNegocio: linha.vertical,
    whatsapp: linha.whatsapp,
    cidade: linha.cidade,
    uf: linha.uf,
    status: linha.status,
    recusa:
      linha.status === "REJECTED" && linha.recusa_em !== null
        ? { desde: linha.recusa_em.toISOString(), motivo: linha.recusa_motivo ?? "" }
        : null,
  };
}
