/**
 * Ponta a ponta do acesso do dono (T-114, substitui a prova da T-110).
 *
 * O dono chega pelo convite: define a primeira senha pelo link, entra com a
 * senha e o código de seis dígitos que chegou por e-mail, e alcança o painel
 * da loja dele. Depois, as duas defesas da sessão que só o navegador de
 * verdade mostra inteiras: a renovação que troca o par e derruba a família
 * quando o token antigo reaparece, e o bloqueio por excesso de senhas erradas.
 *
 * Tudo contra a API de verdade, num banco descartável; os e-mails saem pela
 * caixa de prova (`fixtures/caixa-de-email.ts`).
 */
import { test } from "@playwright/test";

import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  campo,
  cookiesDaSessao,
  definirSenhaPeloLink,
  entrarComCodigoDoEmail,
  enviarLogin,
  prepararDonoPeloConvite,
  renovarDireto,
  FRASE_FORTE_DE_PROVA,
  expect,
} from "../fixtures/acesso.ts";
import {
  ASSUNTOS,
  enderecoUnico,
  esperarEmail,
} from "../fixtures/caixa-de-email.ts";

// Argon2 a cada senha, com a máquina carregada: o prazo padrão não basta.
test.describe.configure({ timeout: 120_000 });

test("@spec:AC-105 @spec:AC-106 o dono define a primeira senha pelo convite, entra com o código do e-mail e chega ao painel; o código não serve de novo", async ({
  page,
  context,
}, info) => {
  const email = enderecoUnico("dono", info.project.name);
  const convite = await prepararDonoPeloConvite(page, email, ENDERECO_DO_SITE);

  // O link do convite vale uma vez só.
  await definirSenhaPeloLink(page, convite, FRASE_FORTE_DE_PROVA);
  await expect(page.getByText("Este link não vale mais.")).toBeVisible();

  // AC-105: a senha certa leva ao código, e nenhuma sessão existe ainda.
  await enviarLogin(page, email, FRASE_FORTE_DE_PROVA);
  await expect(page).toHaveURL(/\/entrar\/verificacao\?desafio=/);
  await expect(
    page.getByText(
      "Informe o código de seis dígitos que enviamos ao seu e-mail.",
    ),
  ).toBeVisible();
  expect((await cookiesDaSessao(context)).renovacao).toBeUndefined();
  expect((await cookiesDaSessao(context)).acesso).toBeUndefined();

  // AC-106: o código certo abre o painel da loja do dono — e a lista de
  // categorias só carrega com a sessão aceita pela API.
  const { codigo, desafioId } = await entrarComCodigoDoEmail(
    page,
    email,
    FRASE_FORTE_DE_PROVA,
  );
  await expect(page).toHaveURL(/\/painel(\?|$)/);
  await page.goto("/painel/categorias");
  // A tela de categorias abre com a sessão aceita pela API (acaba o
  // carregamento em vez de voltar ao login).
  await expect(page).toHaveURL(/\/painel\/categorias$/);
  await expect(page.getByText("Carregando categorias…")).toHaveCount(0);

  // O mesmo código, no mesmo desafio, não abre outra sessão: a resposta é
  // uma recusa, e nenhum cookie novo sai dela.
  const repetido = await page.request.post("/api/auth/segundo-fator", {
    data: { desafioId, codigo },
  });
  const corpo = (await repetido.json()) as { status?: string };
  expect(corpo.status).toBeDefined();
  expect(corpo.status).not.toBe("SESSAO_CRIADA");
  expect(repetido.headers()["set-cookie"]).toBeUndefined();
});

test("@spec:AC-109 @spec:AC-110 a renovação troca o par, e o token antigo reaparecendo derruba a família e avisa o dono", async ({
  page,
  context,
}, info) => {
  const email = enderecoUnico("dono-renova", info.project.name);
  await prepararDonoPeloConvite(page, email, ENDERECO_DO_SITE);
  await entrarComCodigoDoEmail(page, email, FRASE_FORTE_DE_PROVA);
  await expect(page).toHaveURL(/\/painel(\?|$)/);

  const primeiro = (await cookiesDaSessao(context)).renovacao;
  expect(primeiro).toMatchObject({ httpOnly: true, secure: true });

  // Renovar pela ponte do site troca o cookie de renovação.
  const renovada = await page.request.post("/api/auth/renovar");
  expect(renovada.status()).toBe(200);
  const segundo = (await cookiesDaSessao(context)).renovacao;
  expect(segundo?.value).toBeDefined();
  expect(segundo?.value).not.toBe(primeiro?.value);

  // Alguém com a cópia do token antigo tenta usá-lo: recusa, a família cai
  // inteira — inclusive o token novo deste navegador — e o dono é avisado.
  const antes = Date.now();
  expect(
    await renovarDireto(
      ENDERECO_DA_API,
      ENDERECO_DO_SITE,
      decodeURIComponent(primeiro?.value ?? ""),
    ),
  ).toBe(401);
  const depoisDoReuso = await page.request.post("/api/auth/renovar");
  expect(depoisDoReuso.status()).toBe(401);
  await esperarEmail(email, ASSUNTOS.reusoDeSessao, antes);
  expect((await cookiesDaSessao(context)).renovacao).toBeUndefined();
});

test("@spec:AC-119 dez senhas erradas seguidas barram até a senha certa, com o tempo de espera, e o dono é avisado", async ({
  page,
}, info) => {
  const email = enderecoUnico("dono-bloqueio", info.project.name);
  await prepararDonoPeloConvite(page, email, ENDERECO_DO_SITE);

  await page.goto("/entrar");
  await campo(page, "E-mail").fill(email);
  const senha = campo(page, "Senha");
  const botao = page.getByRole("button", { name: "Entrar" });
  /** Envia uma senha e espera a resposta da ponte, para contar uma por uma. */
  const tentar = async (tentativa: string) => {
    await senha.fill(tentativa);
    await Promise.all([
      page.waitForResponse((resposta) =>
        resposta.url().endsWith("/api/auth/login"),
      ),
      botao.click(),
    ]);
  };

  const inicio = Date.now();
  for (let tentativa = 1; tentativa <= 10; tentativa += 1) {
    await tentar(`Senha errada numero ${tentativa}!`);
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  }

  await tentar(FRASE_FORTE_DE_PROVA);
  await expect(
    page.getByText(/Muitas tentativas\. Aguarde \d+ minuto/),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/entrar$/);
  await esperarEmail(email, ASSUNTOS.contaBloqueada, inicio);
});
