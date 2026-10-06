/**
 * Ponta a ponta da administração das lojas (T-209).
 *
 * A pessoa da administração cadastra a loja pela tela, troca o tipo de negócio
 * na ficha, suspende e reativa, e exclui com a confirmação pelo nome. Cada ato
 * passa pelo site (o repasse `/api/admin/*`) e pela API de verdade, com as
 * duas travas da administração e a credencial `sc_admin` no banco.
 *
 * As lojas dos cenários de situação nascem pela rota da administração
 * (`criarLojaPelaAdministracao`): o cadastro pela tela já tem cenário aqui, e
 * repeti-lo em cada cenário só deixaria a suíte mais lenta.
 */
import { expect, test } from "@playwright/test";

import {
  cnpjValido,
  criarLojaPelaAdministracao,
  entrarComoAdministrador,
  porLojaNoAr,
} from "../fixtures/admin.ts";
import { nomeUnico } from "../fixtures/painel.ts";
import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";

test.beforeEach(async ({ context }) => {
  await entrarComoAdministrador(context, ENDERECO_DO_SITE);
});

test("@spec:AC-200 @spec:AC-214 a administração cadastra a loja pela tela e troca o tipo de negócio na ficha", async ({
  page,
}, info) => {
  const nome = nomeUnico("Cantina", info.project.name);

  await page.goto("/admin/lojas/nova");
  await expect(
    page.getByRole("heading", { name: "Cadastrar loja" }),
  ).toBeVisible();

  await page.locator("#nova-loja-nome").fill(nome);
  await page.locator("#nova-loja-documento").fill(cnpjValido());
  const tipo = page.locator("#nova-loja-tipoDeNegocio");
  await expect(tipo).toBeVisible();
  await tipo.selectOption("FOOD_RESTAURANT");
  await page.locator("#nova-loja-responsavelNome").fill("Maria do Ponta");
  await page
    .locator("#nova-loja-responsavelEmail")
    .fill(`maria-${info.project.name}-${Date.now()}@e2e-admin.test`);
  await page.locator("#nova-loja-responsavelTelefone").fill("11988887777");
  await page.locator("#nova-loja-cep").fill("01310100");
  await page.locator("#nova-loja-logradouro").fill("Avenida Paulista");
  await page.locator("#nova-loja-numero").fill("1000");
  await page.locator("#nova-loja-bairro").fill("Bela Vista");
  await page.locator("#nova-loja-cidade").fill("São Paulo");
  await page.locator("#nova-loja-uf").selectOption("SP");

  await page
    .getByRole("button", { name: "Criar loja e enviar convite" })
    .click();
  await expect(page.getByText(/^Loja criada com o código \d{4,}/)).toBeVisible({
    timeout: 15_000,
  });

  // A FICHA da loja recém-criada, pelo link do aviso de sucesso.
  await page.getByRole("link", { name: "Abrir a ficha da loja" }).click();
  await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(page.getByText("Tipo atual:")).toContainText("Restaurante");

  // A TROCA do tipo de negócio, em dois passos: escolher e confirmar.
  await page.locator("#ficha-tipo-de-negocio").selectOption("APPAREL");
  await page.getByRole("button", { name: "Trocar tipo de negócio" }).click();
  await expect(page.getByText(`Trocar ${nome} para Roupas?`)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar a troca" }).click();
  await expect(
    page.getByText("Tipo de negócio trocado para Roupas"),
  ).toBeVisible();

  // Depois de recarregar, a loja continua com o ramo novo.
  await page.reload();
  await expect(page.getByText("Tipo atual:")).toContainText("Roupas", {
    timeout: 15_000,
  });
});

test("@spec:AC-209 @spec:AC-210 suspender tira a vitrine do ar com o motivo, e reativar devolve a loja como estava", async ({
  page,
  playwright,
}, info) => {
  const api = await playwright.request.newContext({ baseURL: ENDERECO_DA_API });
  const loja = await criarLojaPelaAdministracao(
    api,
    ENDERECO_DO_SITE,
    nomeUnico("Pastelaria", info.project.name),
  );
  await porLojaNoAr(loja.id);
  const motivo = "Mensalidade em atraso desde o mês passado.";

  await page.goto(`/admin/lojas/${loja.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: loja.nome }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("A loja está no ar.")).toBeVisible();

  // SUSPENDER: o motivo, o segundo passo com as consequências, e a recusa
  // vazia antes de qualquer envio.
  await page.getByRole("button", { name: "Suspender loja" }).click();
  await expect(page.locator("#ficha-motivo-da-suspensao-erro")).toBeVisible();
  await page.locator("#ficha-motivo-da-suspensao").fill(motivo);
  await page.getByRole("button", { name: "Suspender loja" }).click();
  await expect(page.getByText(`Suspender ${loja.nome}?`)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar a suspensão" }).click();
  await expect(
    page.getByText("Loja suspensa. A vitrine saiu do ar."),
  ).toBeVisible();
  await expect(page.getByText(/^Loja suspensa desde /)).toBeVisible();
  await expect(page.getByText(motivo).first()).toBeVisible();

  // A VITRINE saiu do ar: a API não serve a loja e o site mostra o aviso.
  const fora = await api.get(`/v1/vitrine/${loja.apelido}`);
  expect(fora.ok()).toBe(false);
  const vitrine = await page.context().newPage();
  await vitrine.goto(`/l/${loja.apelido}`);
  await expect(
    vitrine.getByRole("heading", { name: "Esta loja não está disponível" }),
  ).toBeVisible();
  await vitrine.close();

  // REATIVAR: a loja volta ao ar.
  await page.getByRole("button", { name: "Reativar loja" }).click();
  await expect(page.getByText(`Reativar ${loja.nome}?`)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar a reativação" }).click();
  await expect(
    page.getByText("Loja reativada. A vitrine voltou a atender."),
  ).toBeVisible();
  await expect(page.getByText("A loja está no ar.")).toBeVisible();
  const deVolta = await api.get(`/v1/vitrine/${loja.apelido}`);
  expect(deVolta.status()).toBe(200);

  await api.dispose();
});

test("@spec:AC-211 excluir exige digitar o nome da loja e deixa restaurar dentro do prazo", async ({
  page,
  playwright,
}, info) => {
  const api = await playwright.request.newContext({ baseURL: ENDERECO_DA_API });
  const loja = await criarLojaPelaAdministracao(
    api,
    ENDERECO_DO_SITE,
    nomeUnico("Mercearia", info.project.name),
  );
  await porLojaNoAr(loja.id);

  await page.goto(`/admin/lojas/${loja.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: loja.nome }),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Excluir loja…" }).click();
  await expect(page.getByText(`Excluir ${loja.nome}?`)).toBeVisible();
  const confirmar = page.getByRole("button", {
    name: "Excluir a loja",
    exact: true,
  });
  const campo = page.locator("#ficha-confirmacao-da-exclusao");

  // Sem o nome, ou com outro nome, o botão não age.
  await expect(confirmar).toBeDisabled();
  await campo.fill("Outra loja qualquer");
  await expect(confirmar).toBeDisabled();
  await campo.fill(loja.nome);
  await expect(confirmar).toBeEnabled();
  await confirmar.click();

  await expect(
    page.getByText("Loja excluída. Os dados ficam retidos até o fim do prazo."),
  ).toBeVisible();
  await expect(page.getByText(/^Loja excluída em /)).toBeVisible();
  await expect(
    page.getByText(/Até lá, a loja pode ser restaurada/),
  ).toBeVisible();
  expect((await api.get(`/v1/vitrine/${loja.apelido}`)).ok()).toBe(false);

  // RESTAURAR, dentro do prazo: a loja volta ao ar.
  await page.getByRole("button", { name: "Restaurar loja" }).click();
  await page.getByRole("button", { name: "Confirmar a restauração" }).click();
  await expect(page.getByText("Loja restaurada.")).toBeVisible();
  await expect(page.getByText("A loja está no ar.")).toBeVisible();

  await api.dispose();
});
