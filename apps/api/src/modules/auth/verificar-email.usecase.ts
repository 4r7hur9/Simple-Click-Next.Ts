import { createHash, randomBytes } from "node:crypto";

import {
  type CodigoDeVerificacao,
  type CodigosRepo,
  type IdentidadeDeVerificacao,
} from "./codigos.repo.ts";

export const PRAZO_DO_LINK_DE_VERIFICACAO_EM_MS = 24 * 60 * 60 * 1000;
export const LIMITE_DE_REENVIOS_POR_JANELA = 3;
export const JANELA_DE_REENVIO_EM_MS = 60 * 60 * 1000;

export interface PedidoDeEmailDeVerificacao {
  readonly destinatario: string;
  readonly nome: string;
  readonly urlDeVerificacao: string;
}

export interface EnfileiradorDeEmailDeVerificacao {
  enfileirar(dados: PedidoDeEmailDeVerificacao): Promise<unknown>;
}

export type ResultadoDaVerificacao =
  | { readonly situacao: "verificado"; readonly identidade: IdentidadeDeVerificacao }
  | { readonly situacao: "expirado" }
  | { readonly situacao: "invalido" };

export type ResultadoDoReenvio =
  | { readonly situacao: "reenviado" }
  | { readonly situacao: "limite_atingido"; readonly disponivelEm: Date }
  | { readonly situacao: "invalido" };

export function resumirTokenDeVerificacao(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function gerarTokenDeVerificacao(): string {
  return randomBytes(32).toString("base64url");
}

export function urlDeVerificacao(origemDoSite: string, token: string): string {
  return `${origemDoSite.replace(/\/+$/, "")}/verificar-email?token=${encodeURIComponent(token)}`;
}

export function criarCasoDeUsoDeVerificacaoDeEmail(dependencias: {
  readonly codigos: CodigosRepo;
  readonly email: EnfileiradorDeEmailDeVerificacao;
  readonly origemDoSite: string;
  readonly agora?: () => Date;
  readonly gerarToken?: () => string;
  readonly gerarId?: () => string;
}) {
  const agora = dependencias.agora ?? (() => new Date());
  const gerarToken = dependencias.gerarToken ?? gerarTokenDeVerificacao;
  const gerarId = dependencias.gerarId ?? (() => crypto.randomUUID());

  return {
    async verificar(token: string): Promise<ResultadoDaVerificacao> {
      return dependencias.codigos.consumirVerificacao(resumirTokenDeVerificacao(token), agora());
    },

    async reenviar(tokenDoLinkExpirado: string): Promise<ResultadoDoReenvio> {
      const instante = agora();
      const autorizacao = await dependencias.codigos.autorizarReenvioDeLinkExpirado(
        resumirTokenDeVerificacao(tokenDoLinkExpirado),
        instante,
        LIMITE_DE_REENVIOS_POR_JANELA,
        JANELA_DE_REENVIO_EM_MS,
      );
      if (autorizacao.situacao !== "liberado") return autorizacao;

      const token = gerarToken();
      const codigo: CodigoDeVerificacao = {
        id: gerarId(),
        identidadeId: autorizacao.identidade.id,
        resumoDoToken: resumirTokenDeVerificacao(token),
        enviadoEm: instante,
        expiraEm: new Date(instante.getTime() + PRAZO_DO_LINK_DE_VERIFICACAO_EM_MS),
        usadoEm: null,
      };
      await dependencias.codigos.criarVerificacao(codigo);
      await dependencias.email.enfileirar({
        destinatario: autorizacao.identidade.email,
        nome: autorizacao.identidade.nome,
        urlDeVerificacao: urlDeVerificacao(dependencias.origemDoSite, token),
      });
      return { situacao: "reenviado" };
    },
  };
}
