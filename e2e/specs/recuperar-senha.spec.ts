/**
 * Ponta a ponta da recuperação de senha (T-114, substitui a prova da T-110).
 *
 * Duas coisas que só fazem sentido juntas, no navegador de verdade: o pedido
 * não conta a ninguém se o e-mail tem conta (a tela responde igual e só o
 * endereço cadastrado recebe o link), e a senha nova derruba as sessões que
 * estavam abertas com a antiga — num outro navegador, inclusive.
 */
import { test } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  campo,
  definirSenhaPeloLink,
  entrarComCodigoDoEmail,
  prepararDonoPeloConvite,
  FRASE_FORTE_DE_PROVA,
  expect,
} from "../fixtures/acesso.ts";
import {
  ASSUNTOS,
  enderecoUnico,
  esperarEmail,
  linkDoEmail,
  mensagensPara,
} from "../fixtures/caixa-de-email.ts";

test.describe.configure({ timeout: 120_000 });

const CONFIRMACAO =
  "Se existir uma conta para este e-mail, enviaremos as instruções para redefinir sua senha.";

const FRASE_NOVA_DE_PROVA = "Girassol de vidro no quintal 2027!";

test("@spec:AC-114 @spec:AC-115 o pedido responde igual com ou sem conta, e a senha nova entra e derruba a sessão do outro navegador", async ({
  page,
  browser,
}, info) => {
  const email = enderecoUnico("dono-recupera", info.project.name);
  const semConta = enderecoUnico("ninguem", info.project.name);

  // Uma sessão aberta com a senha antiga, noutro navegador.
  const outroContexto = await browser.newContext({ baseURL: ENDERECO_DO_SITE });
  const outro = await outroContexto.newPage();
  await prepararDonoPeloConvite(outro, email, ENDERECO_DO_SITE);
  await entrarComCodigoDoEmail(outro, email, FRASE_FORTE_DE_PROVA);
  await expect(outro).toHaveURL(/\/painel$/);

  // AC-114: a mesma confirmação para o e-mail sem conta e para o com conta.
  const pedir = async (endereco: string) => {
    await page.goto("/recuperar-senha");
    await expect(
      page.getByRole("heading", { name: "Esqueceu sua senha?" }),
    ).toBeVisible();
    await campo(page, "E-mail").fill(endereco);
    await page.getByRole("button", { name: "Enviar instruções" }).click();
    await expect(page.getByText(CONFIRMACAO)).toBeVisible();
  };
  await pedir(semConta);
  await pedir(email);

  // Só o endereço cadastrado recebe o link.
  const link = linkDoEmail(await esperarEmail(email, ASSUNTOS.recuperacao));
  expect(await mensagensPara(semConta)).toEqual([]);

  // AC-115: a senha nova é aceita, e o link não vale de novo.
  await definirSenhaPeloLink(page, link, FRASE_NOVA_DE_PROVA);
  await expect(page.getByText("Senha nova salva.")).toBeVisible();
  await definirSenhaPeloLink(page, link, FRASE_NOVA_DE_PROVA);
  await expect(page.getByText("Este link não vale mais.")).toBeVisible();

  // A sessão do outro navegador, aberta com a senha antiga, não renova mais.
  const renovacaoDoOutro = await outro.request.post("/api/auth/renovar");
  expect(renovacaoDoOutro.status()).toBe(401);
  await outroContexto.close();

  // A senha antiga não entra; a nova entra até o painel.
  await page.goto("/entrar");
  await campo(page, "E-mail").fill(email);
  await campo(page, "Senha").fill(FRASE_FORTE_DE_PROVA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();

  await entrarComCodigoDoEmail(page, email, FRASE_NOVA_DE_PROVA);
  await expect(page).toHaveURL(/\/painel$/);
});
