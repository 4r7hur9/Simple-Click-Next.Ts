/**
 * Ponta a ponta da FILA DE PEDIDOS do dono (T-611 — AC-600).
 *
 * O dono está com a fila aberta; o cliente, em outro navegador, fecha um
 * pedido na vitrine. O pedido tem de aparecer na fila sozinho, sem recarregar,
 * com o bipe e o contador de "aguardando sua confirmação" atualizados. A regra
 * da fila e a consulta periódica têm prova de componente
 * (`apps/web/tests/painel-fila.test.tsx`); só aqui o caminho é o de verdade:
 * vitrine, API, banco, rota do painel no site e a tela.
 *
 * A loja do painel é só do cenário enquanto ele roda (`fixtures/config-loja.ts`):
 * o contador conta pedidos da loja inteira, e outro cenário fechando pedido ao
 * mesmo tempo mudaria a conta.
 */
import { expect, test } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import { comALojaDoPainelSoParaMim } from "../fixtures/config-loja.ts";
import {
  criarProdutoSimples,
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";
import {
  apagarPedidos,
  bipes,
  contarBipes,
  fazerPedidoNaVitrine,
  outroNavegador,
  pedidoDoLink,
} from "../fixtures/pedido-operacao.ts";

// Esperar a vez da loja conta no prazo do cenário.
test.describe.configure({ timeout: 180_000 });

test("@spec:AC-600 o pedido fechado na vitrine aparece na fila do dono sem recarregar, com bipe e contador", async ({
  page,
  browser,
}, info) => {
  const { id: lojaId } = await garantirLojaDoPainel();
  const produto = await criarProdutoSimples(
    lojaId,
    nomeUnico("Camiseta da Fila", info.project.name),
    4_500,
  );
  const nomeDoCliente = nomeUnico("Cliente da Fila", info.project.name);
  const criados: string[] = [];

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    const cliente = await outroNavegador(browser, info);
    try {
      // O DONO abre a fila, com o som trocado por um contador.
      await contarBipes(page.context());
      await entrarComoDono(page.context(), ENDERECO_DO_SITE);
      await page.goto("/painel/pedidos");
      await expect(
        page.getByText("Atualizando sozinha a cada poucos segundos."),
      ).toBeVisible();
      const contador = page.locator(
        '[data-contador="fila-aguardando-confirmacao"]',
      );
      const antes =
        (await contador.count()) === 0
          ? 0
          : Number(await contador.textContent());
      expect(await bipes(page)).toBe(0);

      // Nada mais acontece na página do dono: só o que ela busca sozinha.
      let recarregou = false;
      page.on("framenavigated", (quadro) => {
        if (quadro === page.mainFrame()) recarregou = true;
      });

      // O CLIENTE, em outro navegador, fecha o pedido na vitrine.
      const token = await fazerPedidoNaVitrine(await cliente.newPage(), {
        apelido,
        produtoId: produto,
        nomeDoCliente,
        modo: "retirada",
      });
      const pedido = await pedidoDoLink(token);
      criados.push(pedido.id);

      // O pedido aparece na fila, em destaque, marcado como novo.
      const grupo = page.locator('[data-grupo="fila-aguardando-confirmacao"]');
      const cartao = grupo.getByRole("article", {
        name: `Pedido número ${pedido.numero}, novo`,
      });
      await expect(cartao).toBeVisible({ timeout: 20_000 });
      await expect(cartao).toContainText(nomeDoCliente);
      await expect(cartao).toContainText("R$ 45,00");
      await expect(cartao).toContainText("Retirada");

      // Com aviso sonoro e o contador atualizado.
      await expect.poll(() => bipes(page)).toBe(1);
      await expect(contador).toHaveText(String(antes + 1));
      await expect(page.getByText("1 pedido novo")).toBeVisible();
      expect(recarregou).toBe(false);
    } finally {
      await cliente.close();
    }
  }).finally(() => apagarPedidos(criados));
});
