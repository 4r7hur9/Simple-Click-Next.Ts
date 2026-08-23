import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  comoAdministracao,
  comoLoja,
  criarIdentidade,
  criarLoja,
  criarMembro,
  criarProduto,
} from "@simpleclick/testing";

import {
  exigirAcessoALoja,
  consultarDadosDaLojaComoAdministrador,
} from "../src/modules/auth/autorizar.ts";
import { criarRepositorioDeAuditoria } from "../src/modules/admin/auditoria.repo.ts";

describe("papéis e escopo de acesso", () => {
  it("@spec:AC-116 @principle:P-003 dono da loja A não lê produto da loja B, mesmo com o id direto", async () => {
    const lojaA = await criarLoja({ nome: "Loja A" });
    const lojaB = await criarLoja({ nome: "Loja B" });
    const donoDaLojaA = await criarIdentidade({ nome: "Dono da Loja A" });
    await criarMembro({ loja: lojaA, identidade: donoDaLojaA, papel: "OWNER" });
    const produtoDaLojaB = await criarProduto({
      loja: lojaB,
      nome: "Produto exclusivo da Loja B",
    });

    expect(() =>
      exigirAcessoALoja(
        {
          identidadeId: donoDaLojaA.id,
          papel: "OWNER",
          lojasPermitidas: [lojaA.id],
        },
        lojaB.id,
      ),
    ).toThrow("Você não tem permissão para acessar esta área.");

    const tentativaDireta = await comoLoja(lojaA, (tx) =>
      tx.query<{ id: string; name: string }>(
        "SELECT id, name FROM app.products WHERE id = $1",
        [produtoDaLojaB.id],
      ),
    );

    expect(tentativaDireta.rows).toEqual([]);
  });

  it("@spec:AC-118 administrador lê dados de qualquer loja e o acesso fica no histórico de auditoria", async () => {
    const loja = await criarLoja({ nome: "Loja auditada" });
    const admin = await criarIdentidade({ nome: "Administradora geral" });
    const produto = await criarProduto({
      loja,
      nome: "Produto lido pela administração",
    });
    const repositorio = criarRepositorioDeAuditoria({
      executar: (sql, valores) =>
        comoAdministracao((tx) => tx.query(sql, [...valores])),
    });

    const resultado = await consultarDadosDaLojaComoAdministrador(
      {
        identidadeId: admin.id,
        papel: "ADMIN",
        lojasPermitidas: [],
      },
      {
        lojaId: loja.id,
        entidade: "products",
        entidadeId: produto.id,
        registrarAcesso: (registro) => repositorio.registrarAcesso(registro),
        consultar: () =>
          comoAdministracao(async (tx) => {
            const consulta = await tx.query<{ id: string; name: string }>(
              "SELECT id, name FROM app.products WHERE id = $1",
              [produto.id],
            );
            return consulta.rows;
          }),
      },
    );

    expect(resultado).toEqual([
      { id: produto.id, name: "Produto lido pela administração" },
    ]);

    const auditoria = await comoAdministracao((tx) =>
      tx.query<{
        actor_id: string;
        actor_role: string;
        action: string;
        entity: string;
        entity_id: string | null;
        created_at: Date;
      }>(
        `SELECT actor_id::text, actor_role, action, entity, entity_id, created_at
           FROM app.audit_log
          WHERE store_id = $1 AND actor_id = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [loja.id, admin.id],
      ),
    );

    expect(auditoria.rows).toHaveLength(1);
    expect(auditoria.rows[0]).toMatchObject({
      actor_id: admin.id,
      actor_role: "ADMIN",
      action: "ADMIN_ACCESS",
      entity: "products",
      entity_id: produto.id,
    });
    expect(auditoria.rows[0]?.created_at).toBeInstanceOf(Date);
  });
});
