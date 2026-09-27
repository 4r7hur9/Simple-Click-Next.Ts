/**
 * Apoio comum às provas da administração de lojas (admin-lojas).
 *
 * Monta a API do jeito que ela roda: rotas da administração pela credencial
 * `sc_admin`, rotas da loja pela `sc_app`, as duas derivadas do banco
 * descartável deste arquivo. O token é assinado com o MESMO segredo que a API
 * confere, e nenhum valor dele mora no código (P-002): vem do ambiente, ou é
 * sorteado na hora quando o ambiente não tem.
 */

import { randomBytes, randomUUID } from "node:crypto";

import { bancoDoArquivo } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  exigirVariavel,
} from "./apoio-de-isolamento.ts";
import { criarApp, type OpcoesDoApp } from "../src/app.ts";
import { criarAcessoAoBanco, type AcessoAoBanco } from "../src/core/db.ts";
import {
  assinarTokenDeAcesso,
  type PapelDaSessao,
} from "../src/modules/auth/token.ts";
import type { ConviteParaEnviar } from "../src/modules/admin/convite-do-dono.ts";

/** Espera generosa: o primeiro arquivo do dia ainda constrói o molde. */
export const ESPERA_DA_ADMINISTRACAO = 120_000;

// A API lê o segredo do ambiente a cada requisição. Sem ele no `.env`, a prova
// sorteia um só para este processo — valor que não existe fora da execução.
process.env.JWT_SECRET ??= randomBytes(48).toString("base64url");

/** Assina um token de acesso como a API assinaria no login. */
export function tokenDe(identidadeId: string, papel: PapelDaSessao): string {
  return assinarTokenDeAcesso(
    {
      identidadeId,
      papel,
      sessaoId: randomUUID(),
      familiaId: randomUUID(),
    },
    process.env.JWT_SECRET ?? "",
  );
}

/** A origem que a prova declara, e que a API monta como autorizada. */
export const ORIGEM_DA_ADMINISTRACAO = "https://admin.exemplo.test";

/**
 * Cabeçalhos prontos para o `supertest`: o token e a origem. Método que muda
 * estado sem origem autorizada é recusado antes de chegar à rota (AC-126).
 */
export function comoPapel(
  identidadeId: string,
  papel: PapelDaSessao,
): { authorization: string; origin: string } {
  return {
    authorization: `Bearer ${tokenDe(identidadeId, papel)}`,
    origin: ORIGEM_DA_ADMINISTRACAO,
  };
}

/** Acesso pela credencial da administração, sobre o banco deste arquivo. */
export function abrirAcessoDaAdministracao(): AcessoAoBanco {
  const destino = new URL(bancoDoArquivo().url);
  destino.username = "sc_admin";
  destino.password = exigirVariavel("SENHA_BANCO_ADMINISTRACAO");
  return criarAcessoAoBanco({
    urlDaAplicacao: destino.toString(),
    maxDeConexoes: 4,
    esperaPorConexaoMs: 60_000,
    duracaoMaximaMs: 60_000,
  });
}

/** A API montada para a prova, e o que a prova precisa enxergar dela. */
export interface ApiDaAdministracao {
  readonly app: ReturnType<typeof criarApp>;
  readonly acessoDaAdministracao: AcessoAoBanco;
  readonly acessoDaAplicacao: AcessoAoBanco;
  /** Todo convite que a API mandou, na ordem. */
  readonly convitesEnviados: ConviteParaEnviar[];
  /** Faz o próximo envio de convite falhar, como um provedor fora do ar. */
  falharProximoConvite(): void;
  encerrar(): Promise<void>;
}

export function montarApiDaAdministracao(
  sobrescrita: OpcoesDoApp = {},
  agora: () => Date = () => new Date(),
): ApiDaAdministracao {
  const acessoDaAdministracao = abrirAcessoDaAdministracao();
  const acessoDaAplicacao = abrirAcessoDaAplicacao(bancoDoArquivo().url, {
    maxDeConexoes: 4,
  });
  const convitesEnviados: ConviteParaEnviar[] = [];
  let falhar = false;

  const app = criarApp({
    origens: [ORIGEM_DA_ADMINISTRACAO],
    ...sobrescrita,
    vitrine: { acesso: acessoDaAplicacao, agora, ...sobrescrita.vitrine },
    administracao: {
      acesso: acessoDaAdministracao,
      agora,
      enviarConvite: async (convite) => {
        if (falhar) {
          falhar = false;
          throw new Error("provedor de e-mail fora do ar");
        }
        convitesEnviados.push(convite);
      },
      ...sobrescrita.administracao,
    },
  });

  return {
    app,
    acessoDaAdministracao,
    acessoDaAplicacao,
    convitesEnviados,
    falharProximoConvite: () => {
      falhar = true;
    },
    encerrar: async () => {
      await acessoDaAdministracao.encerrar();
      await acessoDaAplicacao.encerrar();
    },
  };
}
