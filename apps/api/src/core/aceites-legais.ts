/**
 * O aceite versionado dos documentos legais (LGPD, card #79).
 *
 *   GET  /v1/conta/aceites   — o que falta aceitar (versão vigente) e o histórico
 *   POST /v1/conta/aceites   — registra o aceite dos documentos pendentes
 *
 * Toda conta aceita os Termos de Uso e a Política de Privacidade; quem é dona
 * de loja aceita também os Termos do Lojista. Cada aceite grava documento,
 * versão, data/hora, IP e navegador; a tabela só acrescenta (migração 0073).
 *
 * `exigirAceiteVigente` é o freio das AÇÕES DE ESCRITA (POST, PUT, PATCH e
 * DELETE em `/v1`): conta com aceite pendente recebe 403 `aceite_pendente`.
 * Ler (GET), tudo de `/v1/auth` (entrar, sair, renovar) e tudo de `/v1/conta`
 * (aceitar, exportar, excluir, dados) continuam livres.
 */
import { timingSafeEqual, createHash } from "node:crypto";
import { isIP } from "node:net";

import {
  CABECALHO_DA_PONTE,
  CABECALHO_DO_AGENTE_DO_VISITANTE,
  CABECALHO_DO_ENDERECO_DO_VISITANTE,
  DOCUMENTOS_DE_TODA_CONTA,
  TAMANHO_MINIMO_DO_SEGREDO_DA_PONTE,
  VERSAO_DOS_DOCUMENTOS_LEGAIS,
  type DocumentoLegal,
  type SituacaoDosAceites,
} from "@simpleclick/contracts";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { executarComoRequisicao } from "./contexto.ts";
import { banco, type AcessoAoBanco, type TransacaoDoBanco } from "./db.ts";

/** IP e navegador de quem aceitou, como a API os enxerga. */
export interface OrigemDoAceite {
  readonly ip: string | null;
  readonly agente: string | null;
}

function resumo(texto: string): Buffer {
  return createHash("sha256").update(texto, "utf8").digest();
}

/** A ponte do site só vale com o segredo compartilhado (AC-120). */
function ponteConfere(requisicao: Request, segredoDaPonte: string | undefined): boolean {
  const segredo = segredoDaPonte?.trim() ?? "";
  if (segredo.length < TAMANHO_MINIMO_DO_SEGREDO_DA_PONTE) return false;
  const prova = requisicao.get(CABECALHO_DA_PONTE);
  return prova !== undefined && timingSafeEqual(resumo(prova), resumo(segredo));
}

/**
 * Quem está aceitando. Pelo site, o IP e o navegador vêm da ponte (com a
 * prova do segredo); chamada direta (aplicativo) vale a conexão e o
 * `User-Agent`. Texto sempre cortado: é dado de fora.
 */
export function origemDoAceite(
  requisicao: Request,
  segredoDaPonte: string | undefined = process.env["SEGREDO_DA_PONTE"],
): OrigemDoAceite {
  const pelaPonte = ponteConfere(requisicao, segredoDaPonte);
  const informado = pelaPonte
    ? requisicao.get(CABECALHO_DO_ENDERECO_DO_VISITANTE)?.trim()
    : undefined;
  const ip =
    informado !== undefined && isIP(informado) !== 0
      ? informado
      : (requisicao.socket.remoteAddress ?? null);
  const agente = pelaPonte
    ? requisicao.get(CABECALHO_DO_AGENTE_DO_VISITANTE)
    : requisicao.get("user-agent");
  return {
    ip: ip === null ? null : ip.slice(0, 64),
    agente: agente === undefined || agente === "" ? null : agente.slice(0, 300),
  };
}

/** Registra o aceite na versão vigente. Repetir o mesmo aceite não duplica. */
export async function registrarAceites(
  tx: TransacaoDoBanco,
  identidadeId: string,
  documentos: readonly DocumentoLegal[],
  quando: { readonly origem: "SIGNUP" | "RENEWAL"; readonly de: OrigemDoAceite },
): Promise<void> {
  const { origem, de } = quando;
  for (const documento of new Set(documentos)) {
    await tx.$executeRaw`
      INSERT INTO app.legal_acceptances
        (identity_id, document, version, origin, ip, user_agent)
      VALUES (${identidadeId}::uuid, ${documento}, ${VERSAO_DOS_DOCUMENTOS_LEGAIS[documento]},
              ${origem}, ${de.ip}, ${de.agente})
      ON CONFLICT (identity_id, document, version) DO NOTHING`;
  }
}

/** Os documentos que esta conta precisa ter aceitado hoje. */
async function documentosExigidos(tx: TransacaoDoBanco): Promise<DocumentoLegal[]> {
  const [dona] = await tx.$queryRaw<{ dona: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM app.minhas_lojas() WHERE member_role = 'OWNER') AS dona`;
  return dona?.dona === true
    ? [...DOCUMENTOS_DE_TODA_CONTA, "MERCHANT_TERMS"]
    : [...DOCUMENTOS_DE_TODA_CONTA];
}

interface LinhaDoAceite {
  readonly document: DocumentoLegal;
  readonly version: string;
  readonly accepted_at: Date;
  readonly origin: "SIGNUP" | "RENEWAL";
}

/** Lê, como a conta do contexto, o que falta aceitar e o histórico. */
export async function situacaoDosAceites(tx: TransacaoDoBanco): Promise<SituacaoDosAceites> {
  const linhas = await tx.$queryRaw<LinhaDoAceite[]>`
    SELECT document, version, accepted_at, origin
      FROM app.legal_acceptances
     WHERE identity_id = app.current_user_id()
     ORDER BY accepted_at DESC, id DESC`;
  const aceitos = new Set(linhas.map((l) => `${l.document}@${l.version}`));
  const pendentes = (await documentosExigidos(tx))
    .filter((d) => !aceitos.has(`${d}@${VERSAO_DOS_DOCUMENTOS_LEGAIS[d]}`))
    .map((documento) => ({ documento, versao: VERSAO_DOS_DOCUMENTOS_LEGAIS[documento] }));
  return {
    pendentes,
    historico: linhas.map((l) => ({
      documento: l.document,
      versao: l.version,
      aceitoEm: l.accepted_at.toISOString(),
      origem: l.origin,
    })),
  };
}

export interface OpcoesDoFreioDeAceite {
  readonly acesso?: AcessoAoBanco;
  /** A conta da sessão (Bearer ou cookie); `null` sem sessão válida. */
  readonly identidade: (requisicao: Request) => string | null;
  /** Quanto tempo o "está em dia" fica na memória, em ms. */
  readonly validadeEmMs?: number;
}

/** Leitura nunca é freada. */
const METODOS_DE_LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);

/** Caminhos que nunca são freados: é por eles que a pessoa regulariza ou sai. */
const LIVRES = /^\/v1\/(auth|conta)(\/|$)/;

/**
 * Recusa ações de criação (POST) de conta com aceite pendente. Só olha quem
 * tem sessão válida; visitante, agente de impressão e webhook passam. "Em dia"
 * fica 60 s na memória (a versão do documento entra na chave: trocar a versão
 * invalida tudo); pendente nunca é guardado. Se o banco falhar, a requisição
 * segue: o freio não pode derrubar o checkout por uma falha de leitura.
 */
export function exigirAceiteVigente(opcoes: OpcoesDoFreioDeAceite): RequestHandler {
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();
  const identidade = opcoes.identidade;
  const validade = opcoes.validadeEmMs ?? 60_000;
  const emDia = new Map<string, number>();
  const versao = Object.values(VERSAO_DOS_DOCUMENTOS_LEGAIS).join("|");

  return (requisicao: Request, resposta: Response, proximo: NextFunction): void => {
    if (
      METODOS_DE_LEITURA.has(requisicao.method) ||
      LIVRES.test(requisicao.originalUrl.split("?")[0] ?? "")
    ) {
      proximo();
      return;
    }
    const id = identidade(requisicao);
    if (id === null) {
      proximo();
      return;
    }
    const chave = `${versao}:${id}`;
    const ate = emDia.get(chave);
    if (ate !== undefined && ate > Date.now()) {
      proximo();
      return;
    }
    executarComoRequisicao({ usuarioId: id, papel: "CUSTOMER" }, () =>
      acesso().emTransacao(situacaoDosAceites),
    )
      .then((situacao) => {
        if (situacao.pendentes.length === 0) {
          if (emDia.size > 10_000) emDia.clear();
          emDia.set(chave, Date.now() + validade);
          proximo();
          return;
        }
        resposta.set("cache-control", "no-store");
        resposta.status(403).json({
          erro: "aceite_pendente",
          mensagem:
            "Os Termos de Uso e a Política de Privacidade foram atualizados. Aceite a nova versão para continuar.",
          pendentes: situacao.pendentes,
        });
      })
      .catch(() => proximo());
  };
}
