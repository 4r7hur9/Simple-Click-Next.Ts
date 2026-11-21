/**
 * Acesso direto à administração da plataforma (card #163, T-5).
 *
 * Só quem tem grant ativo em `platform_admins` entra em /admin. Os demais
 * recebem 404 neutro (ou o redirecionamento para /entrar, sem sessão), sem
 * nenhum rastro do menu no HTML nem no payload RSC. A API barra também o
 * token que SÓ DIZ "ADMIN", sem grant.
 *
 * Roda só no e2e isolado (`pnpm --filter @simpleclick/e2e test:e2e:isolado`):
 * a fixture recusa banco que não seja simpleclick_test ou sc_e2e_*.
 */
import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext } from "@playwright/test";

import {
  conectarEmBancoDeTeste,
  entrarComoAdministrador,
  garantirAdministrador,
  tokenDoAdministrador,
} from "../fixtures/admin.ts";
import { garantirLojaDoPainel, tokenDoDono } from "../fixtures/painel.ts";
import {
  criarClienteDeTeste,
  tokenDoCliente,
} from "../fixtures/redesign-lojas.ts";
import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";

const MENU = "Administração da plataforma";
const ID_QUALQUER = "00000000-0000-4000-8000-000000000001";
const CAMINHOS = ["/admin", `/admin/lojas/${ID_QUALQUER}`];
const REDIRECIONAMENTOS = [301, 302, 303, 307, 308];

async function cookie(contexto: BrowserContext, token: string): Promise<void> {
  await contexto.addCookies([
    {
      name: "sc_access",
      value: token,
      url: ENDERECO_DO_SITE,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/** Uma identidade de equipe (STAFF) vinculada à loja do painel. */
async function tokenDaEquipe(): Promise<string> {
  const loja = await garantirLojaDoPainel();
  const cliente = await conectarEmBancoDeTeste();
  try {
    const email = `equipe-${randomUUID().slice(0, 8)}@e2e-admin.test`;
    const identidade = await cliente.query<{ id: string }>(
      `INSERT INTO app.identities (email_norm, display_name, email_verified_at)
       VALUES ($1, 'Equipe do ponta a ponta', now()) RETURNING id`,
      [email],
    );
    const id = identidade.rows[0]?.id;
    if (id === undefined) throw new Error("sem identidade da equipe");
    await cliente.query(
      `INSERT INTO app.store_members (store_id, identity_id, role, invite_accepted_at)
       VALUES ($1, $2, 'STAFF', now())`,
      [loja.id, id],
    );
    return tokenDoDono(id);
  } finally {
    await cliente.end();
  }
}

/** Identidade que não está em platform_admins, com token que diz ADMIN. */
async function tokenAdminSemGrant(): Promise<string> {
  const pessoa = await criarClienteDeTeste("Admin sem grant");
  return tokenDoAdministrador(pessoa.identidadeId, "ADMIN");
}

test.describe("[CA-1] sem sessão", () => {
  test("[CA-1] anônimo vai para /entrar com destino seguro, sem menu", async ({
    context,
  }) => {
    for (const caminho of CAMINHOS) {
      const resposta = await context.request.get(
        `${ENDERECO_DO_SITE}${caminho}`,
        { maxRedirects: 0 },
      );
      expect(REDIRECIONAMENTOS).toContain(resposta.status());
      const destino = resposta.headers()["location"] ?? "";
      expect(destino).toContain("/entrar");
      // O destino que volta é o de /admin (o layout barra primeiro) e passa
      // pelo filtro de destino seguro: caminho interno da administração.
      expect(decodeURIComponent(destino.split("proximo=")[1] ?? "")).toMatch(
        /^\/admin(\/|$)/,
      );
      expect(await resposta.text()).not.toContain(MENU);
    }
  });

  test("[CA-1] token inválido (401 do /v1/eu) também vai para /entrar", async ({
    context,
  }) => {
    await cookie(context, "token.invalido.assinatura");
    const resposta = await context.request.get(`${ENDERECO_DO_SITE}/admin`, {
      maxRedirects: 0,
    });
    expect(REDIRECIONAMENTOS).toContain(resposta.status());
    expect(resposta.headers()["location"] ?? "").toContain("/entrar");
    expect(await resposta.text()).not.toContain(MENU);
  });
});

test.describe("[CA-2] sem grant", () => {
  const papeis: Array<[string, () => Promise<string>]> = [
    [
      "cliente",
      async () =>
        tokenDoCliente((await criarClienteDeTeste("Cliente")).identidadeId),
    ],
    ["dono", async () => tokenDoDono((await garantirLojaDoPainel()).donoId)],
    ["equipe", tokenDaEquipe],
    ["ADMIN no token sem grant", tokenAdminSemGrant],
  ];

  for (const [nome, obterToken] of papeis) {
    test(`[CA-2] ${nome}: 404 neutro, sem menu no HTML nem no RSC`, async ({
      context,
    }) => {
      await cookie(context, await obterToken());
      for (const caminho of CAMINHOS) {
        for (const cabecalhos of [{}, { RSC: "1" }]) {
          // Com o cabeçalho RSC o Next primeiro redireciona para a mesma URL
          // com o parâmetro `_rsc` (cache-busting); segue-se esse salto, e o
          // que vale é a resposta final.
          const rsc = "RSC" in cabecalhos;
          const resposta = await context.request.get(
            `${ENDERECO_DO_SITE}${caminho}`,
            { maxRedirects: rsc ? 1 : 0, headers: cabecalhos },
          );
          // HTML: 404 de verdade. RSC: o Next entrega o 404 DENTRO do payload
          // (status 200 depois do salto do `_rsc`); o que se prova é que
          // nenhuma tela nem menu da administração vai no corpo.
          expect(
            rsc ? [200, 404] : [404],
            `${caminho} ${JSON.stringify(cabecalhos)}`,
          ).toContain(resposta.status());
          const corpo = await resposta.text();
          expect(corpo).not.toContain(MENU);
          expect(corpo).not.toContain("Navegação da administração");
        }
      }
    });
  }

  test("[CA-2] o repasse /api/admin/lojas recusa quem não tem grant", async ({
    context,
  }) => {
    await cookie(context, await tokenAdminSemGrant());
    const lista = await context.request.get(
      `${ENDERECO_DO_SITE}/api/admin/lojas`,
    );
    expect(lista.status()).toBe(403);
    const troca = await context.request.patch(
      `${ENDERECO_DO_SITE}/api/admin/lojas/${ID_QUALQUER}`,
      { data: { nome: "Nome de prova" }, headers: { origin: ENDERECO_DO_SITE } },
    );
    expect(troca.status(), await troca.text()).toBe(403);
  });

  test("[CA-5] a API recusa ADMIN sem grant e dono; sem token, 401", async ({
    request,
  }) => {
    const semGrant = await tokenAdminSemGrant();
    const dono = tokenDoDono((await garantirLojaDoPainel()).donoId);
    for (const token of [semGrant, dono]) {
      const r = await request.get(`${ENDERECO_DA_API}/v1/admin/lojas`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(r.status()).toBe(403);
    }
    const anonimo = await request.get(`${ENDERECO_DA_API}/v1/admin/lojas`);
    expect(anonimo.status()).toBe(401);
  });
});

test.describe("[CA-3] com grant", () => {
  test("[CA-3] a conta com grant ativo vê o menu e as páginas", async ({
    context,
  }) => {
    await garantirAdministrador();
    await entrarComoAdministrador(context, ENDERECO_DO_SITE);
    for (const caminho of ["/admin", "/admin/lojas"]) {
      const resposta = await context.request.get(
        `${ENDERECO_DO_SITE}${caminho}`,
        { maxRedirects: 0 },
      );
      expect(resposta.status()).toBe(200);
      expect(await resposta.text()).toContain(MENU);
    }
  });
});
