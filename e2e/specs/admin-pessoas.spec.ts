/**
 * Pessoas na administração, de ponta a ponta (card #170, T-13).
 *
 * Cadastro pela tela com o link único mostrado uma vez, definição de senha
 * pelo link, desativação e reativação pela ficha, e a troca de dono de uma
 * loja pela API da administração (dono único não pode ser desativado).
 *
 * Roda só no e2e isolado (`node e2e/run-isolado.mjs`): as fixtures recusam
 * qualquer banco que não seja simpleclick_test ou sc_e2e_*.
 */
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  FRASE_FORTE_DE_PROVA,
  definirSenhaPeloLink,
} from "../fixtures/acesso.ts";
import {
  conectarEmBancoDeTeste,
  criarLojaPelaAdministracao,
  entrarComoAdministrador,
  garantirAdministrador,
  porLojaNoAr,
  tokenDoAdministrador,
} from "../fixtures/admin.ts";
import { jaEscolheuOsCookies } from "../fixtures/redesign.ts";
import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";

const MOTIVO = "Ponta a ponta da gestão de pessoas";

/**
 * Dono exige acesso já definido. O caminho de verdade (link único) tem o
 * primeiro cenário; aqui só se marca a senha como definida, direto no banco
 * descartável, para chegar aos vínculos.
 */
async function comAcessoDefinido(identidadeId: string): Promise<void> {
  const banco = await conectarEmBancoDeTeste();
  try {
    await banco.query(
      `UPDATE app.identities SET password_hash = 'e2e-sem-login' WHERE id = $1`,
      [identidadeId],
    );
  } finally {
    await banco.end();
  }
}

// O Playwright exige o padrão de desestruturação no primeiro argumento.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  // O cenário cria dados únicos; um projeto basta.
  test.skip(info.project.name !== "publico", "roda só no projeto publico");
});

test("[CA-9] cadastra a pessoa e mostra o link único uma só vez", async ({
  page,
  context,
}) => {
  await entrarComoAdministrador(context, ENDERECO_DO_SITE);
  await jaEscolheuOsCookies(context, ENDERECO_DO_SITE);
  const email = `pessoa-${randomUUID().slice(0, 8)}@e2e-admin.test`;

  await page.goto("/admin/contas/nova");
  await page
    .getByLabel("Nome", { exact: false })
    .first()
    .fill("Pessoa Nova E2E");
  await page.locator("#nova-pessoa-email").fill(email);
  await page.getByRole("button", { name: "Cadastrar e gerar o link" }).click();

  const janela = page.getByRole("dialog", { name: "Link de acesso gerado" });
  await expect(janela).toBeVisible();
  const link = await janela.locator("input[readonly]").inputValue();
  expect(link).toContain("/definir-senha?token=");

  // Fecha: o link não volta nem na tela nem depois de recarregar.
  await page.getByRole("button", { name: "Já copiei, fechar" }).click();
  await expect(janela).toBeHidden();
  await expect(page.locator("body")).not.toContainText("token=");
  await page.reload();
  await expect(page.locator("body")).not.toContainText("/definir-senha?token=");
});

// O caminho de verdade do link único: a pessoa abre, define a senha e vê a
// confirmação. (Exigiu a correção da origem "null" na ponte de identidade.)
test("[CA-9] a pessoa abre o link, define a senha e vê a confirmação", async ({
  page,
  context,
  playwright,
}) => {
  const api = await playwright.request.newContext({ baseURL: ENDERECO_DA_API });
  const adminId = await garantirAdministrador();
  const resposta = await api.post("/v1/admin/pessoas", {
    headers: {
      authorization: `Bearer ${tokenDoAdministrador(adminId)}`,
      origin: ENDERECO_DO_SITE,
    },
    data: {
      nome: "Pessoa do link",
      email: `l-${randomUUID().slice(0, 8)}@e2e-admin.test`,
      telefone: "",
    },
  });
  const { acesso } = (await resposta.json()) as {
    acesso: { caminho: string };
  };
  await jaEscolheuOsCookies(context, ENDERECO_DO_SITE);
  await definirSenhaPeloLink(
    page,
    `${ENDERECO_DO_SITE}${acesso.caminho}`,
    FRASE_FORTE_DE_PROVA,
  );
  await expect(
    page.getByText(/Acesso liberado\.|Senha nova salva\./),
  ).toBeVisible();
});

test("[CA-9] desativa e reativa pela ficha; dono único não pode ser desativado", async ({
  page,
  context,
  playwright,
}) => {
  const request = await playwright.request.newContext({
    baseURL: ENDERECO_DA_API,
  });
  await entrarComoAdministrador(context, ENDERECO_DO_SITE);
  await jaEscolheuOsCookies(context, ENDERECO_DO_SITE);
  const adminId = await garantirAdministrador();
  const cabecalho = {
    authorization: `Bearer ${tokenDoAdministrador(adminId)}`,
    origin: ENDERECO_DO_SITE,
  };
  const criar = async (nome: string) => {
    const resposta = await request.post(`${ENDERECO_DA_API}/v1/admin/pessoas`, {
      headers: cabecalho,
      data: {
        nome,
        email: `p-${randomUUID().slice(0, 8)}@e2e-admin.test`,
        telefone: "",
      },
    });
    expect(resposta.status()).toBe(201);
    return ((await resposta.json()) as { identidadeId: string }).identidadeId;
  };

  const sozinha = await criar("Pessoa para desativar");
  await page.goto(`/admin/contas/${sozinha}`);
  await page.getByRole("button", { name: "Desativar conta" }).click();
  await page.getByRole("textbox", { name: /motivo/i }).fill(MOTIVO);
  await page.getByRole("button", { name: "Confirmar desativação" }).click();
  await expect(
    page.getByRole("button", { name: "Reativar conta" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reativar conta" }).click();
  await page.getByRole("textbox", { name: /motivo/i }).fill(MOTIVO);
  await page.getByRole("button", { name: "Confirmar reativação" }).click();
  await expect(
    page.getByRole("button", { name: "Desativar conta" }),
  ).toBeVisible();

  // Dono único de uma loja: a API recusa com dono_unico.
  const loja = await criarLojaPelaAdministracao(
    request,
    ENDERECO_DO_SITE,
    `Loja Pessoas ${randomUUID().slice(0, 6)}`,
  );
  const dono = await criar("Dono único");
  await comAcessoDefinido(dono);
  const atribuido = await request.post(
    `${ENDERECO_DA_API}/v1/admin/lojas/${loja.id}/donos`,
    { headers: cabecalho, data: { identidadeId: dono, motivo: MOTIVO } },
  );
  expect(atribuido.status()).toBe(201);
  const recusa = await request.put(
    `${ENDERECO_DA_API}/v1/admin/pessoas/${dono}/desativacao`,
    { headers: cabecalho, data: { motivo: MOTIVO } },
  );
  expect(recusa.status()).toBe(409);
  expect(((await recusa.json()) as { erro?: string }).erro).toBe("dono_unico");
});

test("[CA-9] troca o dono da loja e o banco reflete a troca", async ({
  playwright,
}) => {
  const request = await playwright.request.newContext({
    baseURL: ENDERECO_DA_API,
  });
  const adminId = await garantirAdministrador();
  const cabecalho = {
    authorization: `Bearer ${tokenDoAdministrador(adminId)}`,
    origin: ENDERECO_DO_SITE,
  };
  const criar = async (nome: string) => {
    const resposta = await request.post(`${ENDERECO_DA_API}/v1/admin/pessoas`, {
      headers: cabecalho,
      data: {
        nome,
        email: `d-${randomUUID().slice(0, 8)}@e2e-admin.test`,
        telefone: "",
      },
    });
    expect(resposta.status()).toBe(201);
    return ((await resposta.json()) as { identidadeId: string }).identidadeId;
  };
  const loja = await criarLojaPelaAdministracao(
    request,
    ENDERECO_DO_SITE,
    `Loja Troca ${randomUUID().slice(0, 6)}`,
  );
  await porLojaNoAr(loja.id);
  const antigo = await criar("Dono antigo");
  const novo = await criar("Dono novo");
  await comAcessoDefinido(antigo);
  await comAcessoDefinido(novo);
  expect(
    (
      await request.post(`${ENDERECO_DA_API}/v1/admin/lojas/${loja.id}/donos`, {
        headers: cabecalho,
        data: { identidadeId: antigo, motivo: MOTIVO },
      })
    ).status(),
  ).toBe(201);

  const troca = await request.put(
    `${ENDERECO_DA_API}/v1/admin/lojas/${loja.id}/donos/${antigo}/substituicao`,
    { headers: cabecalho, data: { novoDonoId: novo, motivo: MOTIVO } },
  );
  expect(troca.status()).toBe(200);

  const banco = await conectarEmBancoDeTeste();
  try {
    const donos = await banco.query<{ identity_id: string }>(
      `SELECT identity_id FROM app.store_members
        WHERE store_id = $1 AND role = 'OWNER' AND revoked_at IS NULL`,
      [loja.id],
    );
    // A loja nasce com o convite do responsável (pendente); a troca tira o
    // dono antigo e põe o novo.
    const ids = donos.rows.map((linha) => linha.identity_id);
    expect(ids).toContain(novo);
    expect(ids).not.toContain(antigo);
  } finally {
    await banco.end();
  }
});
