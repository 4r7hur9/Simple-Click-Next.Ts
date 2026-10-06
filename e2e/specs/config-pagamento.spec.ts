/**
 * Ponta a ponta do pagamento e da entrega configurados pelo dono (T-908).
 *
 * O dono salva pela tela do painel e o CLIENTE vê o efeito no fechamento da
 * mesma loja, num navegador de verdade: tela do painel, rota do site, API,
 * banco, aviso ao site e fechamento. Cada metade já tem prova própria
 * (`config-pagamento.test.tsx`, `config-pagamento.int.test.ts`,
 * `config-entrega.int.test.ts`); o que só este cenário prova é o caminho
 * inteiro, sem esperar o cache vencer.
 *
 * A loja do painel é só do cenário enquanto ele roda, e volta como estava
 * (`fixtures/config-loja.ts`).
 */
import { expect, test } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  comALojaDoPainelSoParaMim,
  irAoFechamentoCom,
} from "../fixtures/config-loja.ts";
import { interceptarWhatsApp } from "../fixtures/intercepts.ts";
import {
  criarProdutoSimples,
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

// Esperar a vez da loja (o outro projeto do Playwright pode estar com ela)
// conta no prazo do cenário.
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

test("@spec:AC-900 @spec:AC-902 a chave PIX salva no painel aparece no checkout, com o nome do recebedor", async ({
  page,
}, info) => {
  const { id: lojaId } = await garantirLojaDoPainel();
  const produto = await criarProdutoSimples(
    lojaId,
    nomeUnico("Camiseta Pix", info.project.name),
    3_990,
  );
  const chave = `pix-${info.project.name}@malharia.test`;

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    // ANTES: a loja aceita PIX, mas não tem chave — o checkout não o oferece
    // e as outras formas continuam (AC-902).
    await irAoFechamentoCom(page, apelido, [produto]);
    const formas = page.getByRole("group", { name: "Forma de pagamento" });
    await expect(formas.getByLabel("Dinheiro")).toBeVisible();
    await expect(formas.getByLabel("PIX")).toHaveCount(0);

    // O DONO cadastra a chave pela tela.
    await page.goto("/painel/config/pagamento");
    await expect(page.getByLabel("PIX")).toBeChecked();
    await page.getByLabel("Tipo da chave").selectOption("EMAIL");
    await page.getByLabel("Chave", { exact: true }).fill(chave);
    await page.getByLabel("Nome de quem recebe").fill("Malharia do Painel");
    await page.getByRole("button", { name: "Salvar pagamento" }).click();
    await expect(
      page.getByText(
        "Pagamento salvo. O PIX já aparece no seu checkout, com a chave e o nome de Malharia do Painel.",
      ),
    ).toBeVisible();

    // DEPOIS: o cliente escolhe PIX e vê a chave e o recebedor.
    await page.goto(`/l/${apelido}/checkout`);
    await page
      .getByRole("group", { name: "Forma de pagamento" })
      .getByLabel("PIX")
      .check();
    await expect(page.getByText("Pague com PIX")).toBeVisible();
    const caixa = page.locator(".sc-pix");
    await expect(caixa.locator("code")).toHaveText(chave);
    await expect(caixa).toContainText("Recebedor");
    await expect(caixa).toContainText("Malharia do Painel");
  });
});

test("@spec:AC-905 @spec:AC-906 @spec:AC-907 @spec:AC-908 taxa, entrega grátis, mínimo e modos salvos no painel chegam ao fechamento", async ({
  page,
}, info) => {
  const { id: lojaId } = await garantirLojaDoPainel();
  const barato = await criarProdutoSimples(
    lojaId,
    nomeUnico("Meia", info.project.name),
    2_000,
  );
  const caro = await criarProdutoSimples(
    lojaId,
    nomeUnico("Jaqueta", info.project.name),
    7_000,
  );

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    await interceptarWhatsApp(page);

    // O DONO: taxa de R$ 8,00 com nome próprio, grátis acima de R$ 60,00 e
    // mínimo de R$ 25,00 só para entrega.
    await page.goto("/painel/config/entrega");
    await expect(page.getByLabel("Entrega", { exact: true })).toBeChecked();
    await expect(page.getByLabel("Retirada no local")).toBeChecked();
    await page.getByLabel("Taxa de entrega (R$)").fill("8,00");
    await page.getByLabel("Nome da taxa").fill("Frete da malharia");
    await page.getByLabel("Entrega grátis acima de (R$)").fill("60,00");
    await page.getByLabel("Mínimo para entrega (R$)").fill("25,00");
    await page.getByLabel("Mínimo para retirada (R$)").fill("");
    await page.getByRole("button", { name: "Salvar entrega" }).click();
    await expect(
      page.getByText("Entrega salva. O checkout já usa estes valores."),
    ).toBeVisible();

    // PEDIDO DE R$ 20,00: a taxa em linha própria, com o nome do dono, entra
    // no total, e o mínimo impede a entrega dizendo quanto falta.
    await irAoFechamentoCom(page, apelido, [barato]);
    const resumo = page.locator(".sc-resumo");
    await expect(page.getByLabel("Receber em casa")).toBeVisible();
    await expect(page.getByLabel("Retirar no local")).toBeVisible();
    await expect(resumo.getByText("Frete da malharia")).toBeVisible();
    await expect(resumo).toContainText(/Frete da malharia\s*R\$\s8,00/);
    await expect(resumo).toContainText(/Total\s*R\$\s28,00/);
    await expect(
      page.getByText("Faltam R$ 5,00 para o pedido mínimo de entrega."),
    ).toBeVisible();

    // A RETIRADA CONTINUA PERMITIDA abaixo do mínimo da entrega.
    await page.getByLabel("Retirar no local").check();
    await page.getByLabel("Seu nome").fill("Cliente da Retirada");
    await page.getByLabel("Seu WhatsApp").fill("11988887777");
    await page.getByRole("button", { name: "Fechar pedido" }).click();
    await expect(
      page.getByRole("button", { name: /Enviar pelo WhatsApp/ }),
    ).toBeVisible();

    // PEDIDO DE R$ 70,00: acima de R$ 60,00 a entrega sai grátis. O carrinho
    // que virou o pedido anterior já saiu de cena (AC-524), então a mesma
    // sessão começa num carrinho novo, só com a jaqueta.
    await irAoFechamentoCom(page, apelido, [caro]);
    await expect(resumo).toContainText(/Frete da malharia\s*Grátis/);
    await expect(resumo).toContainText(/Total\s*R\$\s70,00/);
    await expect(page.getByText(/para o pedido mínimo de entrega/)).toHaveCount(
      0,
    );

    // SÓ RETIRADA: desligar a entrega tira a opção do checkout.
    await page.goto("/painel/config/entrega");
    await page.getByLabel("Entrega", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Salvar entrega" }).click();
    await expect(
      page.getByText("Entrega salva. O checkout já usa estes valores."),
    ).toBeVisible();
    // Com um modo só, o fechamento diz qual é, em vez de oferecer escolha.
    await page.goto(`/l/${apelido}/checkout`);
    await expect(page.getByText(/Esta loja atende por/)).toContainText(
      "retirar no local",
    );
    await expect(page.getByLabel("Receber em casa")).toHaveCount(0);
    await expect(resumo).not.toContainText("Frete da malharia");
  });
});
