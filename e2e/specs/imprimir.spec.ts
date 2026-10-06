/**
 * Impressão por clique, num navegador de verdade (T-606 — AC-617, AC-618).
 *
 * O teste de componente (`apps/web/tests/imprimir-cupom.test.tsx`) prova as
 * linhas e as medidas declaradas. Aqui entra o que só um navegador mede: a
 * largura da folha em milímetros, a página do PDF que o Chromium gera com o
 * CSS de página, a borda direita de cada valor e o diálogo de impressão que
 * abre sozinho — sem programa nenhum além do navegador.
 *
 * A IMPRESSÃO É INTERCEPTADA: `window.print` vira um contador. O que se prova
 * é que a página pede a impressão, uma vez, com o papel certo — e não que
 * existe uma impressora ligada na máquina do teste.
 *
 * O PEDIDO É DO PRÓPRIO CENÁRIO, montado direto no banco na loja do painel, e
 * apagado no fim: fila com pedido de teste é fila em que ninguém confia. A
 * loja volta como estava no fim, qualquer que seja o resultado.
 */
import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { assinarTokenDeAcesso } from "../../apps/api/src/modules/auth/token.ts";
import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import { comALojaDoPainelSoParaMim } from "../fixtures/config-loja.ts";
import { garantirLojaDoPainel } from "../fixtures/painel.ts";

/** 1 mm em pixels de CSS: 96 pixels por polegada, 25,4 mm por polegada. */
const PX_POR_MM = 96 / 25.4;

// Os cenários mudam a largura de papel da LOJA DO PAINEL — a mesma que o site
// do ponta a ponta usa (`NEXT_PUBLIC_DEV_STORE_SLUG` do `playwright.config.ts`)
// e que `config-impressao.spec.ts` configura. Por isso cada cenário roda com a
// loja só para ele, cria o próprio pedido e a devolve como estava
// (`comALojaDoPainelSoParaMim`). Esperar a vez conta no prazo.
test.describe.configure({ mode: "serial", timeout: 180_000 });

let banco: Client;
let lojaId: string;
/** O dono da loja do painel: identidade e vínculo de verdade (dívida 92). */
let donoId: string;
let pedidoId: string;

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error("o ponta a ponta precisa de DATABASE_URL_DIRETA");
  }
  return new Client({ connectionString: url });
}

/** Cria o pedido do teste, com acento, escolhas, observações e entrega. */
async function criarPedido(): Promise<string> {
  const numero = await banco.query<{ n: string }>(
    `SELECT app.proximo_numero_de_pedido($1::uuid) AS n`,
    [lojaId],
  );
  const n = Number(numero.rows[0]?.n);
  const pedido = await banco.query<{ id: string }>(
    `INSERT INTO app.orders
       (store_id, number, code, public_token, status, channel, fulfillment,
        payment_method, change_for_cents, subtotal_cents, items_total_cents,
        delivery_fee_cents, delivery_fee_mode, total_cents, customer_note)
     VALUES ($1, $2, $3, $4, 'PENDING', 'ONLINE', 'DELIVERY', 'CASH', 10000,
             6650, 6650, 800, 'VALUE', 7450, $5)
     RETURNING id`,
    [
      lojaId,
      n,
      `E-${String(n).padStart(4, "0")}`,
      randomUUID().replaceAll("-", ""),
      "Tocar a campainha do portão azul",
    ],
  );
  const id = pedido.rows[0]?.id;
  if (id === undefined) throw new Error("o pedido do teste não foi criado");

  await banco.query(
    `INSERT INTO app.order_contacts
       (order_id, store_id, name, phone_e164, street, number, neighborhood,
        city, uf, zip)
     VALUES ($1, $2, 'Maria Conceição', '5511988887777', 'Rua das Flores',
             '123', 'Centro', 'São Paulo', 'SP', '01000-000')`,
    [id, lojaId],
  );
  const acai = await banco.query<{ id: string }>(
    `INSERT INTO app.order_items
       (store_id, order_id, product_name, variant_name, quantity,
        unit_price_cents, options_total_cents, line_total_cents, note,
        sort_order)
     VALUES ($1, $2, 'Açaí com granola', '500 ml', 2, 2150, 400, 4700,
             'Sem granola na metade, é alergia', 0)
     RETURNING id`,
    [lojaId, id],
  );
  await banco.query(
    `INSERT INTO app.order_item_options
       (store_id, order_item_id, group_name_snapshot, option_name_snapshot,
        quantity, price_delta_cents)
     VALUES ($1, $2, 'Adicionais', 'Paçoca', 2, 400)`,
    [lojaId, acai.rows[0]?.id],
  );
  await banco.query(
    `INSERT INTO app.order_items
       (store_id, order_id, product_name, quantity, unit_price_cents,
        line_total_cents, sort_order)
     VALUES ($1, $2, 'Guaraná Antarctica lata 350ml gelado', 3, 650, 1950, 1)`,
    [lojaId, id],
  );
  return id;
}

async function apagarPedido(id: string): Promise<void> {
  await banco.query(
    `DELETE FROM app.order_item_options WHERE order_item_id IN
       (SELECT id FROM app.order_items WHERE order_id = $1)`,
    [id],
  );
  await banco.query(`DELETE FROM app.order_items WHERE order_id = $1`, [id]);
  await banco.query(
    `DELETE FROM app.order_status_history WHERE order_id = $1`,
    [id],
  );
  await banco.query(`DELETE FROM app.order_contacts WHERE order_id = $1`, [id]);
  await banco.query(`DELETE FROM app.orders WHERE id = $1`, [id]);
}

async function usarPapel(larguraMm: 58 | 80): Promise<void> {
  await banco.query(
    `UPDATE app.store_settings SET printing = $2::jsonb WHERE store_id = $1`,
    [
      lojaId,
      JSON.stringify({
        larguraMm,
        conteudo: {
          pedido: true,
          itens: true,
          total: true,
          enderecoCliente: true,
          totalEmDestaque: false,
          observacoes: true,
        },
      }),
    ],
  );
}

/** Sessão do dono da loja, como o login local a emite, e a impressão interceptada. */
async function prepararNavegador(
  contexto: BrowserContext,
  site: string | undefined,
): Promise<void> {
  if (site === undefined)
    throw new Error("o projeto do Playwright precisa de baseURL");
  const segredo = process.env["JWT_SECRET"];
  if (segredo === undefined || segredo === "") {
    throw new Error("o ponta a ponta precisa de JWT_SECRET para a sessão");
  }
  const acesso = assinarTokenDeAcesso(
    {
      identidadeId: donoId,
      papel: "OWNER",
      sessaoId: randomUUID(),
      familiaId: randomUUID(),
    },
    segredo,
  );
  await contexto.addCookies([
    { name: "sc_access", value: acesso, url: site, httpOnly: true },
  ]);
  await contexto.addInitScript(() => {
    const janela = window as unknown as { impressoes: number };
    janela.impressoes = 0;
    window.print = () => {
      janela.impressoes += 1;
    };
  });
}

function impressoes(pagina: Page): Promise<number> {
  return pagina.evaluate(
    () => (window as unknown as { impressoes: number }).impressoes,
  );
}

/** Largura da primeira página do PDF, em milímetros. */
function larguraDoPdfEmMm(pdf: Buffer): number {
  const caixa = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(
    pdf.toString("latin1"),
  );
  if (caixa === null) throw new Error("o PDF não declara o tamanho da página");
  return (Number(caixa[1]) * 25.4) / 72;
}

test.beforeAll(async () => {
  // A loja e o dono do painel, os mesmos que o site do ponta a ponta usa.
  ({ id: lojaId, donoId } = await garantirLojaDoPainel());
  banco = conectar();
  await banco.connect();
});

test.afterAll(async () => {
  await banco?.end();
});

/** Roda o cenário com a loja do painel só para ele e um pedido novo nela. */
async function comPedidoNaLojaDoPainel(cenario: () => Promise<void>) {
  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async () => {
    pedidoId = await criarPedido();
    try {
      await cenario();
    } finally {
      await apagarPedido(pedidoId);
    }
  });
}

test("@spec:AC-617 o cupom sai por um clique no pedido, no papel configurado, sem instalar nada", async ({
  page,
  context,
  baseURL,
}) => {
  await comPedidoNaLojaDoPainel(async () => {
    await usarPapel(80);
    await prepararNavegador(context, baseURL);

    await page.goto(`/painel/pedidos/${pedidoId}`);
    const [cupom] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("link", { name: "Imprimir cupom" }).click(),
    ]);
    await cupom.waitForLoadState("load");

    const folha = cupom.locator(".sc-cupom");
    await expect(folha).toBeVisible();
    // O diálogo de impressão do navegador abriu sozinho, uma vez.
    await expect.poll(() => impressoes(cupom)).toBe(1);

    // Sem a casca do aplicativo: nada do painel vai para o papel.
    await expect(
      cupom.getByRole("navigation", { name: "Navegação do painel" }),
    ).toHaveCount(0);

    // Legível: o conteúdo do pedido, com acento.
    await expect(folha).toContainText("Açaí com granola (500 ml)");
    await expect(folha).toContainText("Guaraná Antarctica");
    await expect(folha).toContainText("Maria Conceição");
    await expect(folha).toContainText("Tocar a campainha do portão azul");

    // O papel impresso tem a largura configurada: o Chromium gera a página com
    // o CSS de página do cupom.
    const pdf = await cupom.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(larguraDoPdfEmMm(pdf)).toBeCloseTo(80, 0);
  });
});

for (const larguraMm of [58, 80] as const) {
  test(`@spec:AC-618 papel de ${larguraMm} mm: nada cortado na lateral e os valores em coluna à direita`, async ({
    page,
    context,
    baseURL,
  }) => {
    await comPedidoNaLojaDoPainel(async () => {
      await usarPapel(larguraMm);
      await prepararNavegador(context, baseURL);
      await page.goto(`/imprimir/${pedidoId}`);
      await expect(page.locator(".sc-cupom")).toBeVisible();
      await page.emulateMedia({ media: "print" });

      const medida = await page.locator(".sc-cupom").evaluate((folha) => {
        const caixa = folha.getBoundingClientRect();
        const estilo = getComputedStyle(folha);
        const direitaDoTexto =
          caixa.right - Number.parseFloat(estilo.paddingRight);
        const esquerdaDoTexto =
          caixa.left + Number.parseFloat(estilo.paddingLeft);
        const linhas = [...folha.querySelectorAll(".sc-cupom__linha")].map(
          (linha) => {
            const trecho = document.createRange();
            trecho.selectNodeContents(linha);
            const texto = trecho.getBoundingClientRect();
            return {
              texto: linha.textContent ?? "",
              duplo: linha.classList.contains("sc-cupom__linha--duplo"),
              esquerda: texto.left,
              direita: texto.right,
            };
          },
        );
        return {
          larguraPx: caixa.width,
          esquerdaDoTexto,
          direitaDoTexto,
          linhas,
        };
      });

      // A folha tem a largura da bobina escolhida.
      expect(medida.larguraPx / PX_POR_MM).toBeCloseTo(larguraMm, 0);

      // Nenhuma linha passa da área que a cabeça de impressão alcança.
      const comTexto = medida.linhas.filter((l) => l.texto.trim() !== "");
      expect(comTexto.length).toBeGreaterThan(20);
      for (const linha of comTexto) {
        expect(linha.esquerda, linha.texto).toBeGreaterThanOrEqual(
          medida.esquerdaDoTexto - 0.5,
        );
        expect(linha.direita, linha.texto).toBeLessThanOrEqual(
          medida.direitaDoTexto + 0.5,
        );
      }

      // Os valores formam UMA coluna, encostada à direita.
      const valores = comTexto.filter(
        (l) => !l.duplo && /R\$ [\d.]+,\d{2}$/.test(l.texto),
      );
      expect(valores.length).toBeGreaterThanOrEqual(5);
      const bordas = valores.map((l) => l.direita);
      expect(Math.max(...bordas) - Math.min(...bordas)).toBeLessThan(1);

      const pdf = await page.pdf({ preferCSSPageSize: true });
      expect(larguraDoPdfEmMm(pdf)).toBeCloseTo(larguraMm, 0);
    });
  });
}

test("@spec:AC-621 imprimir de novo sai marcado como reimpressão, com o número da via", async ({
  page,
  context,
  baseURL,
}) => {
  await comPedidoNaLojaDoPainel(async () => {
    await usarPapel(80);
    await prepararNavegador(context, baseURL);
    await page.goto(`/imprimir/${pedidoId}`);
    await expect(page.locator(".sc-cupom")).toBeVisible();

    await page.getByRole("link", { name: "Imprimir outra via" }).click();
    await expect(page.locator(".sc-cupom")).toContainText("REIMPRESSÃO");
    await expect(page.locator(".sc-cupom")).toContainText(/\d+ª VIA/);
    await expect.poll(() => impressoes(page)).toBe(1);

    const vias = await banco.query<{ print_count: number }>(
      `SELECT print_count FROM app.orders WHERE id = $1`,
      [pedidoId],
    );
    expect(vias.rows[0]?.print_count).toBeGreaterThanOrEqual(2);
  });
});
