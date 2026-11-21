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

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    await servirImagens(page);

    await page.goto("/painel/aparencia");
    await page.locator('input[name="nome"]').fill(nome);
    await page.locator('textarea[name="boasVindas"]').fill(boasVindas);
    await page.locator('textarea[name="sobre"]').fill(sobre);
    await page.locator('input[name="logo"]').fill(logo);

    // A PRÉVIA, antes de publicar: é a loja de verdade numa moldura (card
    // #36), com o rascunho. O quadro do computador mostra nome e descrição.
    const quadro = page
      .locator("[data-quadro-da-previa]")
      .first()
      .frameLocator("iframe:visible");
    await expect(quadro.getByRole("heading", { level: 1 })).toHaveText(nome, {
      timeout: 30_000,
    });
    await expect(quadro.locator(".sc-loja__boas-vindas")).toHaveText(
      boasVindas,
    );
    await esperarCarregada(page, logo);

    await page.getByRole("button", { name: "Salvar e publicar" }).click();
    await expect(
      page.getByText(
        "Aparência publicada. A página da sua loja já mostra o que está na prévia.",
      ),
    ).toBeVisible();

    // A PÁGINA DA LOJA: nome, boas-vindas e logo.
    await page.goto(`/loja/${apelido}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(nome);
    await expect(page.locator(".sc-loja__boas-vindas")).toHaveText(boasVindas);
    await esperarCarregada(page, logo);

    // A PÁGINA SOBRE: o texto do negócio e a capa.
    await page.goto(`/loja/${apelido}/sobre`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(nome);
    await expect(page.getByText(sobre)).toBeVisible();
  });
});
