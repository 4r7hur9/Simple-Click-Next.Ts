/**
 * Ponta a ponta do estoque por variação (T-313, AC-331).
 *
 * Uma venda de três M baixa o M de 10 para 7, e o dono vê a baixa na tela de
 * estoque, com o movimento do pedido; depois ajusta pela contagem física e o
 * histórico guarda os dois. A venda passa pela API de verdade (carrinho e
 * fechamento), com a mesma origem que o site usaria — o fechamento pela tela
 * já tem cenário próprio (`checkout.spec.ts`).
 */
import { expect, test } from "@playwright/test";

import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  APELIDO_DO_PAINEL,
  criarCamisetaComGrade,
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

let lojaId: string;

test.beforeAll(async () => {
  ({ id: lojaId } = await garantirLojaDoPainel());
});

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

test("@spec:AC-331 a venda de três M aparece no estoque do dono, com o movimento do pedido, e o ajuste manual entra no histórico", async ({
  page,
  playwright,
}, info) => {
  const camiseta = await criarCamisetaComGrade(
    lojaId,
    nomeUnico("Camiseta Básica", info.project.name),
    { P: 4, M: 10, G: 6 },
  );

  // A VENDA, pelo carrinho e pelo fechamento da API, com a sessão do carrinho
  // guardada no próprio contexto de requisição.
  const cliente = await playwright.request.newContext({
    baseURL: ENDERECO_DA_API,
    extraHTTPHeaders: { Origin: ENDERECO_DO_SITE },
  });
  const item = await cliente.post(
    `/v1/vitrine/${APELIDO_DO_PAINEL}/carrinho/itens`,
    {
      data: {
        produtoId: camiseta.produtoId,
        variacaoId: camiseta.variacoes.M,
        quantidade: 3,
        escolhas: [],
      },
    },
  );
  expect(item.status()).toBe(201);
  const pedido = await cliente.post(
    `/v1/vitrine/${APELIDO_DO_PAINEL}/pedidos`,
    {
      data: {
        contato: { nome: "Cliente do Ponta a Ponta", telefone: "11988887777" },
        entrega: "PICKUP",
        chaveDeIdempotencia: `e2e-${camiseta.produtoId}`,
      },
    },
  );
  expect(pedido.status()).toBe(201);
  await cliente.dispose();

  // O DONO, na tela de estoque.
  await page.goto(`/painel/produtos/${camiseta.produtoId}/estoque`);
  await expect(page.getByText("3 variação(ões) no estoque.")).toBeVisible();

  const botaoDe = (tamanho: string) =>
    page.getByRole("button").filter({
      has: page.locator("strong", { hasText: new RegExp(`^${tamanho}$`) }),
    });
  await expect(botaoDe("M")).toContainText("7");
  await expect(botaoDe("P")).toContainText("4");
  await expect(botaoDe("G")).toContainText("6");

  await botaoDe("M").click();
  // O bloco do histórico é o pai direto do título, e não qualquer ancestral:
  // um ancestral largo traria junto os botões das variações, que também são
  // itens de lista.
  const historico = page
    .getByRole("heading", { name: "Histórico de M" })
    .locator("xpath=..");
  await expect(historico.getByRole("listitem").first()).toContainText(
    "-3 unidades · Baixa automática do pedido",
  );
  await expect(historico.getByRole("listitem").first()).toContainText("10 → 7");

  // A CONTAGEM FÍSICA, com motivo.
  await page.getByLabel("Nova quantidade").fill("12");
  await page.getByLabel("Motivo").fill("Contagem física de sábado");
  await page.getByRole("button", { name: "Ajustar estoque" }).click();
  await expect(
    page.getByText("Estoque ajustado e movimento registrado."),
  ).toBeVisible();

  await expect(botaoDe("M")).toContainText("12");
  await expect(historico.getByRole("listitem")).toHaveCount(2);
  await expect(historico.getByRole("listitem").first()).toContainText(
    "+5 unidades · Contagem física de sábado",
  );
  await expect(historico.getByRole("listitem").first()).toContainText("7 → 12");
});
