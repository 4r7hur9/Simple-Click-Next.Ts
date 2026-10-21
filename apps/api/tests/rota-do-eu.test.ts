/**
 * Prova da rota "quem sou eu" (`GET /v1/eu`, T-115, AC-134).
 *
 * Dois donos de lojas diferentes, contra o banco descartável deste arquivo e
 * pela aplicação montada de verdade (token assinado, contexto, transação e a
 * função `app.lojas_da_sessao()` da migração 0046). O dono A também tem uma
 * segunda loja, uma suspensa, uma excluída, um vínculo revogado e um convite
 * não aceito: só o que está ativo pode aparecer, e nunca a loja do dono B.
 */
import { randomUUID } from "node:crypto";

import { esquemaDoEu, permissoesDoPapel } from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
} from "@simpleclick/testing";
import type { IdentidadeDeTeste, LojaDeTeste } from "@simpleclick/testing";
import type { Express } from "express";
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  assinarTokenDeAcesso,
  type PapelDaSessao,
} from "../src/modules/auth/token.ts";
import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
  exigirVariavel,
} from "./apoio-de-isolamento.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: Express;
let donoA: IdentidadeDeTeste;
let donoB: IdentidadeDeTeste;
let lojaA: LojaDeTeste;
let segundaDaA: LojaDeTeste;
let suspensaDaA: LojaDeTeste;
let lojaB: LojaDeTeste;
let revogada: LojaDeTeste;
let pendente: LojaDeTeste;
let excluida: LojaDeTeste;

/** Um token de acesso da identidade, no papel pedido, assinado com o segredo do ambiente. */
function token(
  identidadeId: string,
  papel: PapelDaSessao,
  agora?: Date,
): string {
  return assinarTokenDeAcesso(
    { identidadeId, papel, sessaoId: randomUUID(), familiaId: randomUUID() },
    exigirVariavel("JWT_SECRET"),
    agora,
  );
}

/** Chama `GET /v1/eu` como o site chama: só com o portador do token. */
function eu(autorizacao?: string): request.Test {
  const pedido = request(app).get("/v1/eu");
  return autorizacao === undefined
    ? pedido
    : pedido.set("Authorization", autorizacao);
}

/** Vincula a identidade à loja por fora do isolamento, no estado pedido. */
async function vincular(
  loja: LojaDeTeste,
  identidade: IdentidadeDeTeste,
  estado: "revogado" | "pendente",
): Promise<void> {
  await migrador.query(
    `INSERT INTO app.store_members
       (store_id, identity_id, role, invite_accepted_at, revoked_at)
     VALUES ($1, $2, 'OWNER',
             CASE WHEN $3 = 'revogado' THEN now() ELSE NULL END,
             CASE WHEN $3 = 'revogado' THEN now() ELSE NULL END)`,
    [loja.id, identidade.id, estado],
  );
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = criarApp({ origens: [], eu: { acesso } });

  donoA = await criarIdentidade({ nome: "Ana Dona" });
  donoB = await criarIdentidade({ nome: "Bruno Dono" });
  lojaA = await criarLoja({ nome: "Açaí da Ana", dono: donoA });
  segundaDaA = await criarLoja({ nome: "Bazar da Ana", dono: donoA });
  suspensaDaA = await criarLoja({
    nome: "Cantina da Ana",
    dono: donoA,
    status: "INACTIVE",
  });
  excluida = await criarLoja({ nome: "Doceria da Ana", dono: donoA });
  await migrador.query(
    `UPDATE app.stores SET deleted_at = now() WHERE id = $1`,
    [excluida.id],
  );
  lojaB = await criarLoja({ nome: "Empório do Bruno", dono: donoB });
  revogada = await criarLoja({ nome: "Feira de outra pessoa" });
  pendente = await criarLoja({ nome: "Granja de outra pessoa" });
  await vincular(revogada, donoA, "revogado");
  await vincular(pendente, donoA, "pendente");
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

describe("quem sou eu (GET /v1/eu)", () => {
  it("@spec:AC-134 cada dono recebe a própria identidade e só as lojas com vínculo ativo", async () => {
    const deA = await eu(`Bearer ${token(donoA.id, "OWNER")}`);
    expect(deA.status).toBe(200);
    expect(deA.headers["cache-control"]).toBe("no-store");
    const corpoA = esquemaDoEu.parse(deA.body);
    expect(corpoA.identidade).toEqual({
      id: donoA.id,
      email: donoA.email,
      nome: "Ana Dona",
      papel: "OWNER",
      telefone: null,
    });
    expect(corpoA.papelEfetivo).toBe("DONO");
    expect(corpoA.adminDaPlataforma).toBe(false);
    expect(corpoA.lojasDaConta).toEqual(corpoA.lojas);
    expect(corpoA.lojas).toEqual([
      {
        apelido: lojaA.apelido,
        nome: "Açaí da Ana",
        papel: "OWNER",
        situacao: "ACTIVE",
        permissoes: [...permissoesDoPapel("OWNER")],
      },
      {
        apelido: segundaDaA.apelido,
        nome: "Bazar da Ana",
        papel: "OWNER",
        situacao: "ACTIVE",
        permissoes: [...permissoesDoPapel("OWNER")],
      },
      {
        apelido: suspensaDaA.apelido,
        nome: "Cantina da Ana",
        papel: "OWNER",
        situacao: "INACTIVE",
        permissoes: [...permissoesDoPapel("OWNER")],
      },
    ]);

    const deB = await eu(`Bearer ${token(donoB.id, "OWNER")}`);
    expect(deB.status).toBe(200);
    const corpoB = esquemaDoEu.parse(deB.body);
    expect(corpoB.identidade.id).toBe(donoB.id);
    expect(corpoB.lojas.map((loja) => loja.apelido)).toEqual([lojaB.apelido]);

    // Nada do que não está ativo aparece para ninguém.
    const todas = [...corpoA.lojas, ...corpoB.lojas].map((l) => l.apelido);
    for (const fora of [revogada, pendente, excluida]) {
      expect(todas).not.toContain(fora.apelido);
    }
    expect(corpoA.lojas.map((l) => l.apelido)).not.toContain(lojaB.apelido);
  });

  it("@spec:AC-134 sem token, com token adulterado ou vencido, a resposta é 401", async () => {
    const valido = token(donoA.id, "OWNER");
    const adulterado = `${valido.slice(0, -2)}${valido.endsWith("AA") ? "BB" : "AA"}`;
    const vencido = token(
      donoA.id,
      "OWNER",
      new Date(Date.now() - 60 * 60_000),
    );

    for (const autorizacao of [
      undefined,
      "Bearer ",
      `Bearer ${adulterado}`,
      `Bearer ${vencido}`,
      `Basic ${valido}`,
    ]) {
      const resposta = await eu(autorizacao);
      expect(resposta.status).toBe(401);
      expect(resposta.body).toEqual({ erro: "nao_autenticado" });
    }
  });

  it("@spec:AC-134 sessão de cliente ou da administração recebe a lista de lojas vazia", async () => {
    // A mesma pessoa que é dona, numa sessão de cliente: o papel da sessão
    // manda, e cliente não tem loja.
    const comoCliente = await eu(`Bearer ${token(donoA.id, "CUSTOMER")}`);
    expect(comoCliente.status).toBe(200);
    expect(esquemaDoEu.parse(comoCliente.body)).toMatchObject({
      identidade: { id: donoA.id, papel: "CUSTOMER" },
      lojas: [],
    });

    const comoAdministracao = await eu(`Bearer ${token(donoB.id, "ADMIN")}`);
    expect(comoAdministracao.status).toBe(200);
    expect(esquemaDoEu.parse(comoAdministracao.body)).toMatchObject({
      identidade: { id: donoB.id, papel: "ADMIN" },
      lojas: [],
    });
  });

  it("o papel efetivo sai do que a conta tem: admin, dono, equipe ou cliente — seja qual for a sessão", async () => {
    // Dono numa sessão de cliente: `lojas` segue a sessão (vazia), mas o
    // papel efetivo e `lojasDaConta` mostram o que a conta tem.
    const donoComoCliente = esquemaDoEu.parse(
      (await eu(`Bearer ${token(donoB.id, "CUSTOMER")}`)).body,
    );
    expect(donoComoCliente.lojas).toEqual([]);
    expect(donoComoCliente.papelEfetivo).toBe("DONO");
    expect(donoComoCliente.lojasDaConta?.map((l) => l.apelido)).toEqual([
      lojaB.apelido,
    ]);

    const equipe = await criarIdentidade({
      nome: "Eva da Equipe",
      telefone: "+5511955554444",
    });
    await migrador.query(
      `INSERT INTO app.store_members
         (store_id, identity_id, role, invite_accepted_at)
       VALUES ($1, $2, 'STAFF', now())`,
      [lojaB.id, equipe.id],
    );
    const daEquipe = esquemaDoEu.parse(
      (await eu(`Bearer ${token(equipe.id, "CUSTOMER")}`)).body,
    );
    expect(daEquipe.identidade.telefone).toBe("+5511955554444");
    expect(daEquipe.papelEfetivo).toBe("EQUIPE");
    expect(daEquipe.lojasDaConta).toEqual([
      {
        apelido: lojaB.apelido,
        nome: "Empório do Bruno",
        papel: "STAFF",
        situacao: "ACTIVE",
        permissoes: [...permissoesDoPapel("STAFF")],
      },
    ]);

    const cliente = await criarIdentidade({ nome: "Caio Cliente" });
    const doCliente = esquemaDoEu.parse(
      (await eu(`Bearer ${token(cliente.id, "CUSTOMER")}`)).body,
    );
    expect(doCliente.papelEfetivo).toBe("CLIENTE");
    expect(doCliente.lojasDaConta).toEqual([]);
    expect(doCliente.adminDaPlataforma).toBe(false);

    const admin = await criarIdentidade({ nome: "Ada Admin" });
    await migrador.query(
      `INSERT INTO app.platform_admins (identity_id) VALUES ($1)`,
      [admin.id],
    );
    const daAdmin = esquemaDoEu.parse(
      (await eu(`Bearer ${token(admin.id, "ADMIN")}`)).body,
    );
    expect(daAdmin.papelEfetivo).toBe("ADMIN");
    expect(daAdmin.adminDaPlataforma).toBe(true);
  });

  it("@spec:AC-134 token de identidade que não existe responde como token inválido", async () => {
    const resposta = await eu(`Bearer ${token(randomUUID(), "OWNER")}`);
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ erro: "nao_autenticado" });
  });

  it("@spec:AC-134 a função do banco só abre as lojas da identidade e do papel do contexto", async () => {
    const lojasNoContexto = (dados: Parameters<typeof comoRequisicao>[1]) =>
      comoRequisicao(
        acesso,
        dados,
        (tx) =>
          tx.$queryRaw<{ store_slug: string }[]>`
          SELECT store_slug FROM app.lojas_da_sessao()`,
      ).then((linhas) => linhas.map((linha) => linha.store_slug));

    expect(
      await lojasNoContexto({ usuarioId: donoB.id, papel: "OWNER" }),
    ).toEqual([lojaB.apelido]);
    // Sem identidade, como cliente ou como visitante: nada.
    expect(await lojasNoContexto({ papel: "OWNER" })).toEqual([]);
    expect(
      await lojasNoContexto({ usuarioId: donoA.id, papel: "CUSTOMER" }),
    ).toEqual([]);
    expect(
      await lojasNoContexto({ usuarioId: donoA.id, papel: "PUBLIC" }),
    ).toEqual([]);

    // E ninguém além da credencial que atende requisição a executa.
    const permissoes = await migrador.query<{ papel: string }>(
      `SELECT r.rolname AS papel
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN pg_roles r
        WHERE n.nspname = 'app' AND p.proname = 'lojas_da_sessao'
          AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
          AND r.rolname IN ('sc_app', 'sc_admin', 'public', 'sc_print_agent')`,
    );
    expect(permissoes.rows.map((linha) => linha.papel)).toEqual(["sc_app"]);
  });
});
