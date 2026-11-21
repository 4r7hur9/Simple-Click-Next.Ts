/**
 * Ponta a ponta do formato de impressão escolhido pelo dono (T-908).
 *
 * O dono troca o papel e o conteúdo do cupom pela tela do painel, e o cupom
 * do MESMO pedido, aberto de novo, sai no formato novo. A medida fina da folha
 * em milímetros é de `imprimir.spec.ts`; aqui o que se prova é a escolha da
 * tela chegando ao cupom. A impressão é interceptada: `window.print` vira um
 * contador, e nenhuma impressora é necessária.
 *
 * O pedido entra pela API de verdade (carrinho e fechamento), com entrega e
 * endereço — é o endereço que a escolha do dono tira do cupom.
 */
import { expect, test, type Page } from "@playwright/test";

import {
  criarClienteDeTeste,
  tokenDoCliente,
} from "../fixtures/redesign-lojas.ts";
import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  chaveDeIdempotencia,
  comALojaDoPainelSoParaMim,
} from "../fixtures/config-loja.ts";
import {
  criarProdutoSimples,
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

test.describe.configure({ timeout: 180_000 });

const RUA = "Rua das Paineiras do Cupom";

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
  await context.addInitScript(() => {
    window.print = () => undefined;
  });
});

/** Abre o cupom do pedido e devolve a folha. */
async function abrirCupom(pagina: Page, pedidoId: string) {
  await pagina.goto(`/imprimir/${pedidoId}`);
  const folha = pagina.locator(".sc-cupom");
  await expect(folha).toBeVisible();
  return folha;
}

test("@spec:AC-919 @spec:AC-920 o papel e o conteúdo escolhidos no painel valem para o cupom seguinte do mesmo pedido", async ({
  page,
  playwright,
}, info) => {
  const { id: lojaId } = await garantirLojaDoPainel();
  const nome = nomeUnico("Suéter", info.project.name);
  const produto = await criarProdutoSimples(lojaId, nome, 8_900);

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    // O PEDIDO, com entrega e endereço.
    const cliente = await playwright.request.newContext({
      baseURL: ENDERECO_DA_API,
      extraHTTPHeaders: {
        Origin: ENDERECO_DO_SITE,
        // O pedido exige conta: o cliente da prova entra com a dele.
        authorization: `Bearer ${tokenDoCliente(
          (await criarClienteDeTeste("Cliente da API")).identidadeId,
        )}`,
      },
    });
    const item = await cliente.post(`/v1/vitrine/${apelido}/carrinho/itens`, {
      data: { produtoId: produto, quantidade: 1, escolhas: [] },
    });
    expect(item.status()).toBe(201);
    const resposta = await cliente.post(`/v1/vitrine/${apelido}/pedidos`, {
      data: {
        contato: {
          nome: "Cliente do Cupom",
          telefone: "11944443333",
          logradouro: RUA,
          numero: "120",
          bairro: "Centro",
          cidade: "São Paulo",
        },
        entrega: "DELIVERY",
        chaveDeIdempotencia: chaveDeIdempotencia(),
      },
    });
    expect(resposta.status()).toBe(201);
    const { id: pedidoId } = (await resposta.json()) as { id: string };
    await cliente.dispose();

    // ANTES: papel de 80 mm, com o endereço do cliente.
    await page.goto("/painel/config/impressao");
    await page.getByLabel(/80 mm/).check();
    await page.getByLabel("Endereço do cliente").check();
    await page.getByRole("button", { name: "Salvar impressão" }).click();
    await expect(
      page.getByText("Impressão salva. O próximo cupom já sai neste formato."),
    ).toBeVisible();
    let folha = await abrirCupom(page, pedidoId);
    await expect(folha).toHaveAttribute("data-papel-mm", "80");
    await expect(folha).toContainText(RUA);

    // O DONO troca para 58 mm, tira o endereço e destaca o total.
    await page.goto("/painel/config/impressao");
    await page.getByLabel(/58 mm/).check();
    await page.getByLabel("Endereço do cliente").uncheck();
    await page.getByLabel("Total em destaque").check();
    await page.getByRole("button", { name: "Salvar impressão" }).click();
    await expect(
      page.getByText("Impressão salva. O próximo cupom já sai neste formato."),
    ).toBeVisible();

    // DEPOIS: o mesmo pedido em 58 mm, sem o endereço, com o essencial.
    folha = await abrirCupom(page, pedidoId);
    await expect(folha).toHaveAttribute("data-papel-mm", "58");
    await expect(folha).not.toContainText(RUA);
    await expect(folha).toContainText(/su.ter/i);
    await expect(folha).toContainText(/89,00/);
  });
});
