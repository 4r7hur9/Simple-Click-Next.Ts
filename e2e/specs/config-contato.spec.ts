/**
 * Ponta a ponta do contato de WhatsApp e da mensagem do pedido (T-908).
 *
 * O dono digita o número com máscara e a saudação pela tela do painel, vê a
 * prévia, salva, e o próximo pedido do cliente abre a conversa no número
 * normalizado, começando pela saudação dele e sem marca da plataforma. A tela
 * e a API têm prova própria (`config-contato.test.tsx`,
 * `config-contato.int.test.ts`); aqui é o caminho inteiro.
 *
 * O WHATSAPP É INTERCEPTADO (`fixtures/intercepts.ts`): o que se prova é o
 * endereço e o texto, e não que o `wa.me` está no ar.
 */
import { expect, test } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  comALojaDoPainelSoParaMim,
  irAoFechamentoCom,
} from "../fixtures/config-loja.ts";
import { interceptarWhatsApp, janelasAbertas } from "../fixtures/intercepts.ts";
import {
  criarProdutoSimples,
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

test("@spec:AC-913 @spec:AC-915 o número e a saudação salvos no painel são os da conversa do próximo pedido", async ({
  page,
}, info) => {
  const { id: lojaId } = await garantirLojaDoPainel();
  const produto = await criarProdutoSimples(
    lojaId,
    nomeUnico("Cachecol", info.project.name),
    4_500,
  );
  const saudacao = `Oi, Malharia! Pedido novo (${info.project.name}):`;

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    await interceptarWhatsApp(page);
    await page.goto("/painel/config/contato");
    const numero = page.getByLabel("WhatsApp da loja");

    // NÚMERO IMPOSSÍVEL é recusado na hora, dizendo o que falta.
    await numero.fill("1234");
    await expect(page.locator('[data-numero="recusado"]')).toBeVisible();

    // COM MÁSCARA e sem o código do país: a tela mostra como ficou.
    await numero.fill("(11) 98765-4321");
    await expect(page.locator('[data-numero="normalizado"]')).toContainText(
      "+55",
    );

    // A SAUDAÇÃO aparece na prévia, com as partes do pedido que não saem.
    await page.getByLabel("Saudação da mensagem").fill(saudacao);
    const previa = page.locator('[data-previa="mensagem"]');
    await expect(previa).toContainText(saudacao);
    await expect(previa).not.toContainText("SimpleClick");

    await page.getByRole("button", { name: "Salvar contato" }).click();
    await expect(
      page.getByText(
        "Contato salvo. Os próximos pedidos chegam neste número, com esta mensagem.",
      ),
    ).toBeVisible();

    // O CLIENTE fecha o pedido e envia pelo WhatsApp.
    await irAoFechamentoCom(page, apelido, [produto]);
    await page.getByLabel("Retirar no local").check();
    await page.getByLabel("Seu nome").fill("Cliente do Contato");
    await page.getByLabel("Seu WhatsApp").fill("11955554444");
    await page.getByRole("button", { name: "Fechar pedido" }).click();
    await page.getByRole("button", { name: /Enviar pelo WhatsApp/ }).click();

    const abertas = await janelasAbertas(page);
    expect(abertas).toHaveLength(1);
    const endereco = abertas[0]?.endereco ?? "";
    expect(endereco).toContain("wa.me/5511987654321");
    const texto = decodeURIComponent(endereco.split("?text=")[1] ?? "");
    expect(texto.startsWith(saudacao)).toBe(true);
    expect(texto).toContain("Cliente do Contato");
    expect(texto).not.toContain("SimpleClick");
  });
});
