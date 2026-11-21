/**
 * Administração exclusiva de quem tem o grant (card #163, T-4): a API não
 * confia na alegação `role=ADMIN` do token. Quem checa é o banco, ao vivo, a
 * cada requisição (trava 2), e a rotação do token de renovação recusa e
 * derruba a família quando o papel mudou.
 *
 * - CA-5 (R-2): token ADMIN sem grant, dono e cliente recebem 403; sem token, 401.
 * - CA-6 (R-3): revogar o grant derruba o MESMO token ainda válido (de 200 a
 *   403), recusa o refresh com a família em ROLE_CHANGED, e o novo login volta
 *   com `adminDaPlataforma=false`. (O 404 da casca do site é do E2E do T-5.)
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarIdentidade,
  criarLoja,
  type IdentidadeDeTeste,
  type LojaDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  ORIGEM_DA_ADMINISTRACAO,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";
import {
  abrirInstancia,
  comoVisitante,
  dependenciasDaSessao,
  type RepositoriosDaIdentidade,
} from "./apoio-da-identidade.ts";
import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  iniciarSessao,
  renovarSessao,
} from "../src/modules/auth/sessao.usecase.ts";

let migrador: pg.Client;
let api: ApiDaAdministracao;
let instancia: RepositoriosDaIdentidade;
let acessoDoEu: AcessoAoBanco;
let appDoEu: ReturnType<typeof criarApp>;
let loja: LojaDeTeste;
let dono: IdentidadeDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao();
  instancia = abrirInstancia();
  acessoDoEu = abrirAcessoDaAplicacao(bancoDoArquivo().url, {
    maxDeConexoes: 4,
  });
  appDoEu = criarApp({ origens: [], eu: { acesso: acessoDoEu } });
  dono = await criarIdentidade({ nome: "Dono da loja alvo" });
  loja = await criarLoja({ nome: "Loja alvo da revogação", dono });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await instancia?.acesso.encerrar();
  await acessoDoEu?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

/** Um dia qualquer, para o período das métricas. */
const PERIODO = "inicio=2026-01-01&fim=2026-01-31";

type Chamada = (cabecalhos: Record<string, string>) => request.Test;

/** As rotas da administração que o CA-5 manda provar, com entrada válida. */
function rotasDaAdministracao(): Record<string, Chamada> {
  const post = (metodo: "get" | "put" | "patch", caminho: string, corpo?: object) =>
    (cabecalhos: Record<string, string>): request.Test => {
      const pedido = request(api.app)[metodo](caminho).set(cabecalhos);
      return corpo === undefined ? pedido : pedido.send(corpo);
    };
  return {
    "GET /lojas": post("get", "/v1/admin/lojas"),
    "GET /metricas": post("get", `/v1/admin/metricas?${PERIODO}`),
    "PUT /lojas/:id/funcionalidades/:chave": post(
      "put",
      `/v1/admin/lojas/${loja.id}/funcionalidades/auto_print`,
      { ligada: true, motivo: "prova de acesso" },
    ),
    "PUT /stories/limite": post("put", "/v1/admin/stories/limite", {
      padrao: 5,
    }),
    "PUT /lojas/:id/stories/limite": post(
      "put",
      `/v1/admin/lojas/${loja.id}/stories/limite`,
      { limite: 3 },
    ),
    "PATCH /lojas/:id": post("patch", `/v1/admin/lojas/${loja.id}`, {
      nome: "Nome que ninguém sem grant pode dar",
    }),
  };
}

async function nomeDaLoja(): Promise<string> {
  const { rows } = await migrador.query<{ name: string }>(
    "SELECT name FROM app.stores WHERE id = $1",
    [loja.id],
  );
  return rows[0]?.name ?? "";
}

async function revogarGrant(identidadeId: string): Promise<void> {
  await migrador.query(
    `UPDATE app.platform_admins SET revoked_at = now()
      WHERE identity_id = $1 AND revoked_at IS NULL`,
    [identidadeId],
  );
}

describe("CA-5: token ADMIN sem grant não administra nada [CA-5]", () => {
  it(
    "[CA-5] ADMIN sem grant, dono e cliente recebem 403 em todas as rotas, e a loja não muda",
    async () => {
      const semGrant = await criarIdentidade({ nome: "Alega ser admin" });
      const cliente = await criarIdentidade({ nome: "Cliente comum" });
      const nomeAntes = await nomeDaLoja();

      for (const [rota, chamar] of Object.entries(rotasDaAdministracao())) {
        const falsos: [string, Record<string, string>][] = [
          ["ADMIN sem grant", comoPapel(semGrant.id, "ADMIN")],
          ["OWNER", comoPapel(dono.id, "OWNER")],
          ["CUSTOMER", comoPapel(cliente.id, "CUSTOMER")],
        ];
        for (const [quem, cabecalhos] of falsos) {
          const resposta = await chamar(cabecalhos);
          expect(resposta.status, `${rota} como ${quem}`).toBe(403);
        }
      }
      expect(await nomeDaLoja()).toBe(nomeAntes);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-5] sem token é 401 em todas as rotas",
    async () => {
      for (const [rota, chamar] of Object.entries(rotasDaAdministracao())) {
        const resposta = await chamar({ origin: ORIGEM_DA_ADMINISTRACAO });
        expect(resposta.status, rota).toBe(401);
      }
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("CA-6: revogar o grant vale na hora [CA-6]", () => {
  it(
    "[CA-6] o MESMO token ainda válido passa a 403 em leitura e em mutação, o refresh é recusado com ROLE_CHANGED e o novo login não é admin",
    async () => {
      const administradora = await criarAdministradorDaPlataforma({
        nome: "Administradora que será revogada",
      });
      const dependencias = {
        ...dependenciasDaSessao(instancia),
        segredoDeAssinatura: process.env.JWT_SECRET ?? "",
      };
      const sessao = await comoVisitante(() =>
        iniciarSessao(
          {
            identidadeId: administradora.id,
            papel: "ADMIN",
            cliente: "navegador",
          },
          dependencias,
        ),
      );
      const mesmoToken = {
        authorization: `Bearer ${sessao.tokenDeAcesso}`,
        origin: ORIGEM_DA_ADMINISTRACAO,
      };
      const ler = () => request(api.app).get("/v1/admin/lojas").set(mesmoToken);
      const mutar = (nome: string) =>
        request(api.app)
          .patch(`/v1/admin/lojas/${loja.id}`)
          .set(mesmoToken)
          .send({ nome });

      // Antes: com o grant, o token funciona na leitura e na mutação.
      expect((await ler()).status).toBe(200);
      expect((await mutar("Nome pela administradora")).status).toBe(200);
      expect(await nomeDaLoja()).toBe("Nome pela administradora");

      await revogarGrant(administradora.id);

      // Depois: o token segue assinado e dentro do prazo, e mesmo assim cai.
      expect((await ler()).status).toBe(403);
      expect((await mutar("Nome depois da revogação")).status).toBe(403);
      expect(await nomeDaLoja()).toBe("Nome pela administradora");

      // O refresh não devolve acesso: recusado, família revogada ROLE_CHANGED.
      const renovada = await comoVisitante(() =>
        renovarSessao(sessao.tokenDeRenovacao, dependencias),
      );
      expect(renovada).toEqual({ estado: "recusada" });
      const { rows } = await migrador.query<{ revoked_reason: string | null }>(
        "SELECT revoked_reason FROM app.sessions WHERE identity_id = $1",
        [administradora.id],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((linha) => linha.revoked_reason === "ROLE_CHANGED")).toBe(
        true,
      );

      // Um novo login só sai como não-admin, e /v1/eu confirma.
      await expect(
        comoVisitante(() =>
          iniciarSessao(
            {
              identidadeId: administradora.id,
              papel: "ADMIN",
              cliente: "navegador",
            },
            dependencias,
          ),
        ),
      ).rejects.toThrow();
      const novoLogin = await comoVisitante(() =>
        iniciarSessao(
          {
            identidadeId: administradora.id,
            papel: "CUSTOMER",
            cliente: "navegador",
          },
          dependencias,
        ),
      );
      const eu = await request(appDoEu)
        .get("/v1/eu")
        .set("Authorization", `Bearer ${novoLogin.tokenDeAcesso}`);
      expect(eu.status).toBe(200);
      expect(eu.body.adminDaPlataforma).toBe(false);
      expect(eu.body.identidade.id).toBe(administradora.id);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
