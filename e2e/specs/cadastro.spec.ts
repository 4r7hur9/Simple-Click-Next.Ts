/**
 * Ponta a ponta do cadastro do cliente (T-114, substitui a prova da T-110).
 *
 * Navegador de verdade contra a API de verdade, num banco descartável
 * (`run-isolado.mjs`): a pessoa se cadastra, não entra antes de confirmar,
 * confirma pelo link que chegou na caixa de e-mail de prova, entra, e sai.
 * O que se confere no fim é o que importa para a segurança: a sessão mora em
 * cookie que script nenhum lê, e sair revoga o token no servidor — não basta
 * o cookie sumir do navegador.
 */
import { test } from "@playwright/test";

import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  campo,
  cookiesDaSessao,
  enviarLogin,
  renovarDireto,
  FRASE_FORTE_DE_PROVA,
  expect,
} from "../fixtures/acesso.ts";
import {
  ASSUNTOS,
  enderecoUnico,
  esperarEmail,
  linkDoEmail,
} from "../fixtures/caixa-de-email.ts";

// Cada Argon2 custa perto de um segundo com a máquina carregada, e o cenário
// deriva a senha várias vezes.
test.describe.configure({ timeout: 90_000 });

test("@spec:AC-100 @spec:AC-103 @spec:AC-108 @spec:AC-109 @spec:AC-112 o cliente se cadastra, confirma o e-mail pelo link, entra direto e sai de verdade", async ({
  page,
  context,
}, info) => {
  const email = enderecoUnico("cliente", info.project.name);

  // AC-100: cadastro válido cria a conta pendente.
  await page.goto("/cadastrar");
  await campo(page, "Nome").fill("Ana Souza");
  await campo(page, "E-mail").fill(email);
  await campo(page, "Celular com DDD").fill("11 91234-5678");
  await campo(page, "Senha").fill(FRASE_FORTE_DE_PROVA);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(
    page.getByText("Conta criada. Falta confirmar o e-mail."),
  ).toBeVisible();

  // Antes de confirmar, a conta não entra.
  await enviarLogin(page, email, FRASE_FORTE_DE_PROVA);
  await expect(
    page.getByText("Confirme seu e-mail antes de entrar."),
  ).toBeVisible();
  expect((await cookiesDaSessao(context)).renovacao).toBeUndefined();

  // AC-103: o link do e-mail confirma, e só uma vez. Abrir o link não gasta
  // nada; quem confirma é o botão.
  const link = linkDoEmail(await esperarEmail(email, ASSUNTOS.verificacao));
  expect(link.startsWith(`${ENDERECO_DO_SITE}/verificar-email?token=`)).toBe(
    true,
  );
  await page.goto(link);
  await page.getByRole("button", { name: "Confirmar meu e-mail" }).click();
  await expect(page.getByText("E-mail verificado.")).toBeVisible();

  await page.goto(link);
  await page.getByRole("button", { name: "Confirmar meu e-mail" }).click();
  await expect(page.getByText("Link inválido")).toBeVisible();

  // AC-108: cliente sem segundo fator entra direto na conta dele. A tela de
  // pedidos só abre com sessão aceita pela API — sem ela, volta ao login.
  await enviarLogin(page, email, FRASE_FORTE_DE_PROVA);
  await expect(page).toHaveURL(/\/minha-conta\/pedidos$/);
  await expect(
    page.getByRole("heading", { name: "Meus pedidos" }),
  ).toBeVisible();

  // AC-109: os tokens moram em cookie HttpOnly, Secure e SameSite, e nada de
  // sessão vai para o armazenamento que o script da página alcança.
  const { renovacao, acesso } = await cookiesDaSessao(context);
  expect(renovacao).toMatchObject({ httpOnly: true, secure: true });
  expect(acesso).toMatchObject({ httpOnly: true, secure: true });
  expect(["Lax", "Strict"]).toContain(renovacao?.sameSite);
  const visivelAoScript = await page.evaluate(() => ({
    cookies: document.cookie,
    armazenado: JSON.stringify({ ...localStorage, ...sessionStorage }),
  }));
  expect(visivelAoScript.cookies).not.toContain("sc_refresh");
  expect(visivelAoScript.cookies).not.toContain("sc_access");
  expect(visivelAoScript.armazenado).not.toContain(renovacao?.value ?? "-");
  expect(visivelAoScript.armazenado).not.toContain(acesso?.value ?? "-");

  // AC-112: sair apaga os cookies E revoga o token no servidor.
  const tokenAnterior = decodeURIComponent(renovacao?.value ?? "");
  await page.goto("/minha-conta/seguranca");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  const depois = await cookiesDaSessao(context);
  expect(depois.renovacao).toBeUndefined();
  expect(depois.acesso).toBeUndefined();
  expect(
    await renovarDireto(ENDERECO_DA_API, ENDERECO_DO_SITE, tokenAnterior),
  ).toBe(401);
  await page.goto("/minha-conta/pedidos");
  await expect(page).toHaveURL(/\/entrar$/);
});
