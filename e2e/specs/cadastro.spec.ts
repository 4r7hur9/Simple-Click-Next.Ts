/**
 * Ponta a ponta do cadastro do cliente (T-114, substitui a prova da T-110).
 *
 * Navegador de verdade contra a API de verdade, num banco descartável
 * (`run-isolado.mjs`): a pessoa escolhe comprar, se cadastra, já entra com a
 * conta (sem confirmar e-mail, desde os cards #21 e #28) e sai.
 * O que se confere no fim é o que importa para a segurança: a sessão mora em
 * cookie que script nenhum lê, e sair revoga o token no servidor — não basta
 * o cookie sumir do navegador.
 */
import { test } from "@playwright/test";

import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  campo,
  cookiesDaSessao,
  renovarDireto,
  FRASE_FORTE_DE_PROVA,
  resolverAvisoDeCookies,
  expect,
} from "../fixtures/acesso.ts";
import { enderecoUnico } from "../fixtures/caixa-de-email.ts";

// Cada Argon2 custa perto de um segundo com a máquina carregada, e o cenário
// deriva a senha várias vezes.
test.describe.configure({ timeout: 90_000 });

test("@spec:AC-100 @spec:AC-108 @spec:AC-109 @spec:AC-112 o cliente se cadastra, já entra na conta e sai de verdade", async ({
  page,
  context,
}, info) => {
  const email = enderecoUnico("cliente", info.project.name);

  // AC-100: a pessoa escolhe comprar e o cadastro válido cria a conta. Desde
  // os cards #21 e #28 a conta de cliente nasce com o e-mail verificado: não
  // há link de confirmação nem bloqueio do primeiro login (o link segue
  // valendo para quem ainda o recebe, como o convite da equipe).
  await page.goto("/cadastrar");
  await page.getByRole("link", { name: /comprar/i }).click();
  await expect(page).toHaveURL(/\/cadastrar\?tipo=cliente/);
  await resolverAvisoDeCookies(page);
  await campo(page, "Seu nome").fill("Ana Souza");
  await campo(page, "E-mail").fill(email);
  await campo(page, "WhatsApp com DDD").fill("11 91234-5678");
  await campo(page, "Senha").fill(FRASE_FORTE_DE_PROVA);
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("button", { name: "Criar conta" }).click();

  // AC-108: cliente sem segundo fator entra direto na conta dele, já com a
  // sessão aberta pelo cadastro. A tela de pedidos só abre com sessão aceita
  // pela API — sem ela, volta ao login.
  await expect(page).toHaveURL(/\/explorar\/produtos$/);
  await page.goto("/conta/pedidos");
  await expect(page).toHaveURL(/\/conta\/pedidos$/);
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
  await page.goto("/conta/seguranca");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  const depois = await cookiesDaSessao(context);
  expect(depois.renovacao).toBeUndefined();
  expect(depois.acesso).toBeUndefined();
  expect(
    await renovarDireto(ENDERECO_DA_API, ENDERECO_DO_SITE, tokenAnterior),
  ).toBe(401);
  await page.goto("/conta/pedidos");
  await expect(page).toHaveURL(/\/entrar\?proximo=%2Fconta%2Fpedidos$/);
});
