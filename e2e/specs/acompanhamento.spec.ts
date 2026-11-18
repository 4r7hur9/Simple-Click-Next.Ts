/**
 * Ponta a ponta do ACOMPANHAMENTO do pedido (T-611 — AC-604, AC-612..AC-614).
 *
 * O cliente fecha um pedido com entrega na vitrine e fica com a página do link
 * aberta. Em outro navegador, o dono aceita, inicia o preparo, marca a saída e
 * conclui. Cada passo tem de chegar à página do cliente sozinho, sem ele
 * recarregar, e ficar registrado com horário e quem o deu. A máquina de status,
 * a página e o código não enumerável têm provas próprias
 * (`maquina-status.test.ts`, `acompanhamento-pedido.test.tsx`,
 * `acompanhamento-nao-enumeravel.test.ts`); só aqui o caminho é o inteiro:
 * botão do painel, rota do site, API, banco e a consulta da página do cliente.
 *
 * A loja do painel é só do cenário enquanto ele roda (`fixtures/config-loja.ts`):
 * fechar a loja ou mudar a entrega no meio derrubaria o pedido.
 */
import { randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

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
  fazerPedidoNaVitrine,
  historicoGravado,
  outroNavegador,
  pedidoDoLink,
} from "../fixtures/pedido-operacao.ts";

// Esperar a vez da loja e quatro rodadas da consulta contam no prazo.
test.describe.configure({ timeout: 180_000 });

/** Os passos que o dono dá, e como o cliente os lê na página dele. */
const PASSOS = [
  { status: "ACCEPTED", botao: "Aceitar pedido", cliente: "Pedido aceito" },
  { status: "PREPARING", botao: "Iniciar preparo", cliente: "Em preparo" },
  {
    status: "OUT_FOR_DELIVERY",
    botao: "Saiu para entrega",
    cliente: "Saiu para entrega",
  },
  {
    status: "COMPLETED",
    botao: "Concluir pedido",
    cliente: "Pedido concluído",
  },
] as const;

/** Marca a página: se ela navegar (recarregar), a marca some. */
async function marcarSemRecarregar(pagina: Page): Promise<void> {
  await pagina.evaluate(() => {
    (window as unknown as { __semRecarregar?: true }).__semRecarregar = true;
  });
}

function aindaSemRecarregar(pagina: Page): Promise<boolean> {
  return pagina.evaluate(
    () =>
      (window as unknown as { __semRecarregar?: true }).__semRecarregar ===
      true,
  );
}

test("@spec:AC-604 @spec:AC-612 @spec:AC-613 o dono aceita, prepara, despacha e conclui, e o cliente vê cada passo sem recarregar", async ({
  page,
  browser,
}, info) => {
  const { id: lojaId, donoId } = await garantirLojaDoPainel();
  const nomeDoProduto = nomeUnico("Moletom", info.project.name);
  const produto = await criarProdutoSimples(lojaId, nomeDoProduto, 3_000);
  const nomeDoCliente = nomeUnico("Cliente do Link", info.project.name);
  const criados: string[] = [];

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    const dono = await outroNavegador(browser, info);
    try {
      // O CLIENTE fecha o pedido com entrega e abre o link de acompanhamento.
      const token = await fazerPedidoNaVitrine(page, {
        apelido,
        produtoId: produto,
        nomeDoCliente,
        modo: "entrega",
      });
      const pedido = await pedidoDoLink(token);
      criados.push(pedido.id);
      await page.goto(`/loja/${apelido}/pedido/${token}`);

      // AC-612: número, status em linguagem clara, linha do tempo, itens,
      // total, forma de pagamento e contato da loja.
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: `Pedido nº ${pedido.numero}`,
        }),
      ).toBeVisible();
      const status = page.locator("[data-status-atual]");
      await expect(status).toHaveText("Pedido recebido");
      await expect(
        page.getByText(
          "A loja recebeu seu pedido e vai confirmar em instantes.",
        ),
      ).toBeVisible();
      const linha = page.locator("[data-linha-do-tempo]");
      await expect(linha.locator('[data-passo="PENDING"]')).toContainText(
        "Pedido recebido",
      );
      await expect(page.getByText(`1× ${nomeDoProduto}`)).toBeVisible();
      await expect(page.locator("[data-total]")).toHaveText(/R\$\s35,00/);
      await expect(page.getByText("Dinheiro na entrega")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /^Contato da / }),
      ).toBeVisible();

      // O DONO abre o mesmo pedido no painel, em outro navegador.
      await entrarComoDono(dono, ENDERECO_DO_SITE);
      const painel = await dono.newPage();
      await painel.goto(`/painel/pedidos/${pedido.id}`);

      // AC-604 e AC-613: cada passo do dono chega à página do cliente sozinho.
      await marcarSemRecarregar(page);
      for (const passo of PASSOS) {
        await painel.locator(`button[data-status="${passo.status}"]`).click();
        await expect(status).toHaveText(passo.cliente, { timeout: 20_000 });
        await expect(
          linha.locator(`[data-passo="${passo.status}"]`),
        ).toContainText(passo.cliente);
      }
      expect(await aindaSemRecarregar(page)).toBe(true);
      await expect(
        page.getByText("Pedido entregue. Obrigado pela compra!"),
      ).toBeVisible();
      // Pedido de entrega nunca passa por "pronto para retirada".
      await expect(
        linha.locator('[data-passo="READY_FOR_PICKUP"]'),
      ).toHaveCount(0);

      // O pedido chegou a concluído, e o painel não oferece mais passo.
      await expect(
        painel.getByText(
          "Este pedido chegou ao fim do caminho: não há próxima ação.",
        ),
      ).toBeVisible();
      const historicoNoPainel = painel.locator("[data-linha-do-tempo]");
      for (const passo of PASSOS) {
        await expect(
          historicoNoPainel.locator(`[data-passo="${passo.status}"]`),
        ).toContainText("Dono da loja");
      }

      // Cada mudança gravada com horário e quem fez, na ordem do fluxo.
      const gravado = await historicoGravado(pedido.id);
      const doDono = gravado.filter((p) => p.papel === "OWNER");
      expect(doDono.map((p) => p.para)).toEqual(PASSOS.map((p) => p.status));
      for (const p of doDono) {
        expect(p.quem).toBe(donoId);
        expect(p.em).toBeInstanceOf(Date);
      }
    } finally {
      await dono.close();
    }
  }).finally(() => apagarPedidos(criados));
});

test("@spec:AC-614 link trocado ou adivinhado responde que o pedido não foi encontrado", async ({
  page,
}, info) => {
  const { id: lojaId } = await garantirLojaDoPainel();
  const produto = await criarProdutoSimples(
    lojaId,
    nomeUnico("Boné", info.project.name),
    2_500,
  );
  const nomeDoCliente = nomeUnico("Cliente Sigiloso", info.project.name);
  const criados: string[] = [];

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    const token = await fazerPedidoNaVitrine(page, {
      apelido,
      produtoId: produto,
      nomeDoCliente,
      modo: "retirada",
    });
    const pedido = await pedidoDoLink(token);
    criados.push(pedido.id);

    // Quem tenta o link é um visitante SEM sessão (o pedido agora exige conta,
    // e a conta de quem pediu mostraria o próprio nome no topo de toda página).
    await page.context().clearCookies();

    // O link verdadeiro abre o pedido.
    await page.goto(`/loja/${apelido}/pedido/${token}`);
    await expect(page.getByText(nomeDoCliente)).toBeVisible();

    // Trocar um caractere, usar o número, o identificador interno ou um
    // código sorteado: nenhum alcança o pedido, e todos dizem a mesma coisa.
    const ultimo = token.at(-1) === "A" ? "B" : "A";
    const tentativas = [
      `${token.slice(0, -1)}${ultimo}`,
      String(pedido.numero),
      pedido.id,
      randomBytes(24).toString("base64url"),
    ];
    for (const tentativa of tentativas) {
      const resposta = await page.goto(`/loja/${apelido}/pedido/${tentativa}`);
      expect(resposta?.status(), tentativa).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: "Pedido não encontrado" }),
      ).toBeVisible();
      await expect(page.getByText(nomeDoCliente)).toHaveCount(0);
    }
  }).finally(() => apagarPedidos(criados));
});
