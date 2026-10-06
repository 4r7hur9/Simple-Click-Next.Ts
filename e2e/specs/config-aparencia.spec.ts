/**
 * Ponta a ponta da apresentação da loja (T-908).
 *
 * O dono edita nome, boas-vindas, sobre, logo e capa pela tela do painel, vê
 * a prévia ANTES de publicar, publica, e a página pública da mesma loja passa
 * a mostrar exatamente isso — sem esperar o cache vencer. A tela e a API têm
 * prova própria (`config-aparencia.test.tsx`, `config-aparencia.int.test.ts`).
 *
 * AS IMAGENS SÃO ENDEREÇOS https:// já hospedados, que é o caminho da tela
 * quando o ambiente não tem credencial de mídia. O navegador do cenário serve
 * esses endereços com uma imagem local: o que se prova é que a página pede a
 * imagem que o dono escolheu, e que ela carrega, sem depender de rede externa.
 */
import { expect, test, type Page } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import { comALojaDoPainelSoParaMim } from "../fixtures/config-loja.ts";
import { entrarComoDono } from "../fixtures/painel.ts";

test.describe.configure({ timeout: 180_000 });

/** Um PNG de 1×1, servido no lugar de qualquer imagem do domínio de teste. */
const PNG_MINIMO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const DOMINIO_DAS_IMAGENS = "https://imagens.e2e-config.test";

async function servirImagens(pagina: Page): Promise<void> {
  await pagina.route(`${DOMINIO_DAS_IMAGENS}/**`, (rota) =>
    rota.fulfill({ status: 200, contentType: "image/png", body: PNG_MINIMO }),
  );
}

/** A imagem precisa CARREGAR, e não só estar no HTML. */
async function esperarCarregada(pagina: Page, endereco: string) {
  const imagem = pagina.locator(`img[src="${endereco}"]`).first();
  await expect(imagem).toBeVisible();
  await expect
    .poll(() =>
      imagem.evaluate((elemento: HTMLImageElement) => elemento.naturalWidth),
    )
    .toBeGreaterThan(0);
}

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

test("@spec:AC-916 a apresentação editada no painel aparece na página pública da loja, com prévia antes de publicar", async ({
  page,
}, info) => {
  const marca = `${info.project.name}-${Date.now().toString(36)}`;
  const nome = `Malharia ${marca}`;
  const boasVindas = `Bem-vindo à malharia ${marca}.`;
  const sobre = `Tricô feito à mão desde 1998 — ${marca}.`;
  const logo = `${DOMINIO_DAS_IMAGENS}/logo-${marca}.png`;
  const capa = `${DOMINIO_DAS_IMAGENS}/capa-${marca}.png`;

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    await servirImagens(page);

    await page.goto("/painel/config/aparencia");
    await page.getByLabel("Nome de exibição").fill(nome);
    await page.getByLabel("Mensagem de boas-vindas").fill(boasVindas);
    await page.getByLabel(/Sobre o negócio/).fill(sobre);
    await page.locator('input[name="logo"]').fill(logo);
    await page.locator('input[name="capa"]').fill(capa);

    // A PRÉVIA, antes de publicar.
    const previa = page.locator('[data-previa="apresentacao"]');
    await expect(previa.locator("[data-previa-nome]")).toHaveText(nome);
    await expect(previa.locator("[data-previa-boas-vindas]")).toHaveText(
      boasVindas,
    );
    await expect(previa.locator("[data-previa-sobre]")).toHaveText(sobre);
    await esperarCarregada(page, logo);
    await esperarCarregada(page, capa);

    await page.getByRole("button", { name: "Publicar apresentação" }).click();
    await expect(
      page.getByText(
        "Apresentação publicada. A página da sua loja já mostra o que está na prévia.",
      ),
    ).toBeVisible();

    // A PÁGINA DA LOJA: nome, boas-vindas e logo.
    await page.goto(`/l/${apelido}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(nome);
    await expect(page.getByText(boasVindas)).toBeVisible();
    await esperarCarregada(page, logo);

    // A PÁGINA SOBRE: o texto do negócio e a capa.
    await page.goto(`/l/${apelido}/sobre`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(nome);
    await expect(page.getByText(sobre)).toBeVisible();
    await esperarCarregada(page, capa);
  });
});
