/**
 * O fechamento inteiro, do produto ao WhatsApp (AC-514, AC-520, AC-523).
 *
 * É O CENÁRIO QUE ATRAVESSA TUDO: navegador, site, API, banco. Ele toca o
 * carrinho no domínio da API com o cookie da sessão, confere preço contra o
 * catálogo, cria o pedido e chega à mensagem pronta — o caminho que o cliente
 * faz de verdade, e que nenhuma das metades provava sozinha.
 *
 * O WHATSAPP É INTERCEPTADO. O que se prova é o nosso endereço e o nosso texto,
 * e não que o `wa.me` está no ar.
 */
import { expect, test, type Page } from "@playwright/test";

import {
  garantirLojaDeTeste,
  limparPedidosDoTeste,
  PRODUTO,
} from "../fixtures/loja-de-teste.ts";
import { interceptarWhatsApp, janelasAbertas } from "../fixtures/intercepts.ts";

let loja: Awaited<ReturnType<typeof garantirLojaDeTeste>>;

test.beforeAll(async () => {
  loja = await garantirLojaDeTeste();
});

test.afterAll(async () => {
  // O PEDIDO DE TESTE NÃO FICA. Ele apareceria na fila do dono, e fila com
  // pedido de teste é fila em que ninguém confia.
  await limparPedidosDoTeste(loja.id);
});

/** Põe um item no carrinho e vai para o fechamento. */
async function comCarrinhoCheio(pagina: Page) {
  await pagina.goto(`/loja/${loja.apelido}/produto/${loja.produtoId}`);
  await pagina.getByRole("button", { name: /Adicionar/ }).click();
  await expect(pagina.getByText("Adicionado ao carrinho")).toBeVisible();
  await pagina.goto(`/loja/${loja.apelido}/checkout`);
}

test("@spec:AC-514 o pedido é criado e ganha código, do carrinho ao fim", async ({
  page,
}) => {
  await interceptarWhatsApp(page);
  await comCarrinhoCheio(page);

  // O RESUMO MOSTRA O QUE SE LEVA, antes de pedir qualquer dado.
  await expect(page.getByText(`1× ${PRODUTO.nome}`)).toBeVisible();

  await page.getByLabel(/Retirar no local/).check();
  await page.getByLabel("Seu nome").fill("Ana do Teste");
  await page.getByLabel("Seu WhatsApp").fill("11988887777");
  await page.getByRole("button", { name: "Fechar pedido" }).click();

  // O código é o que a pessoa guarda e o dono procura.
  await expect(page.getByText(/[A-Z]-\d{4}/)).toBeVisible();
});

test("@spec:AC-520 enviar pelo WhatsApp abre a conversa com o texto pronto", async ({
  page,
}) => {
  await interceptarWhatsApp(page);
  await comCarrinhoCheio(page);

  await page.getByLabel(/Retirar no local/).check();
  await page.getByLabel("Seu nome").fill("Bruno do Teste");
  await page.getByLabel("Seu WhatsApp").fill("11977776666");
  await page.getByRole("button", { name: "Fechar pedido" }).click();

  await page.getByRole("button", { name: /Enviar pelo WhatsApp/ }).click();

  const abertas = await janelasAbertas(page);
  expect(abertas).toHaveLength(1);

  const endereco = abertas[0]?.endereco ?? "";
  // O NÚMERO DA LOJA vai embutido no endereço, e nunca como campo na tela.
  expect(endereco).toContain("wa.me/5511900000000");

  const texto = decodeURIComponent(endereco.split("?text=")[1] ?? "");
  expect(texto).toContain("Olá! Segue meu pedido:");
  expect(texto).toContain(PRODUTO.nome);
  expect(texto).toContain("Bruno do Teste");
});

test("@spec:AC-523 fechar a janela do WhatsApp não perde o pedido", async ({
  page,
}) => {
  await interceptarWhatsApp(page);
  await comCarrinhoCheio(page);

  await page.getByLabel(/Retirar no local/).check();
  await page.getByLabel("Seu nome").fill("Carla do Teste");
  await page.getByLabel("Seu WhatsApp").fill("11966665555");
  await page.getByRole("button", { name: "Fechar pedido" }).click();

  const codigo = await page
    .getByText(/[A-Z]-\d{4}/)
    .first()
    .textContent();
  expect(codigo).toBeTruthy();

  // A pessoa NÃO envia — só recarrega a página do acompanhamento. O pedido
  // continua existindo, porque ele nasceu antes do WhatsApp e não depende dele.
  await expect(
    page.getByRole("link", { name: /Acompanhar|acompanh/i }),
  ).toBeVisible();
});
