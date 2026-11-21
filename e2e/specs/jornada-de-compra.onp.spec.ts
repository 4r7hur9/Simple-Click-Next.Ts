/**
 * A jornada de compra depois do redesign Stitch (card #114, US-11402).
 *
 * O QUE SE PROVA: que a mudança visual não custou venda. Da busca ao pedido,
 * os resultados são os de sempre: os produtos certos aparecem, a variação e o
 * adicional somam no preço, o obrigatório segura, a sacola guarda itens,
 * quantidades, atacado e total, e o pedido sai com código, acompanhamento e a
 * mensagem pronta do WhatsApp.
 *
 * VALORES FIXOS (ASM-11406), da loja exclusiva `e2e-jornada`
 * (`fixtures/redesign-lojas.ts`): nada aqui depende de uma gravação do
 * sistema antigo, nem da `e2e-lanchonete`, que outros cenários usam.
 *
 * CADA TESTE TEM A SUA CONTA (identidade nova, sem telefone nem endereço): o
 * fechamento pede o telefone só a quem não tem, e uma conta compartilhada
 * mudaria a tela do teste seguinte. O fechamento EXIGE conta (o "Seu nome" de
 * convidado não existe mais).
 *
 * LARGURAS: o projeto `celular` compra a 344px (sacola em barra + janela); o
 * `publico`, a 1280px (sacola em coluna lateral). Os dois caminhos da sacola
 * são provados sem `test.skip`.
 *
 * O `onp-spec verify` só roda o vitest: estas provas são evidência à parte, no
 * relatório do Playwright (Q-11405).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { interceptarWhatsApp, janelasAbertas } from "../fixtures/intercepts.ts";
import {
  APELIDO_DA_JORNADA,
  JORNADA,
  clienteLogado,
  garantirLojaDaJornada,
  type LojaDaJornada,
} from "../fixtures/redesign-lojas.ts";
import {
  ehCelular,
  jaEscolheuOsCookies,
  origemDoSite,
} from "../fixtures/redesign.ts";

let loja: LojaDaJornada;

test.beforeAll(async () => {
  loja = await garantirLojaDaJornada();
});

test.beforeEach(async ({ page, context }, info) => {
  await jaEscolheuOsCookies(context, origemDoSite(info));
  const largura = ehCelular(info) ? 344 : 1280;
  await page.setViewportSize({
    width: largura,
    height: ehCelular(info) ? 882 : 900,
  });
});

/** Escreve "R$ 14,50" a partir de centavos, como a tela mostra. */
function reais(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
}

const CATALOGO = `/loja/${APELIDO_DA_JORNADA}/cardapio`;

/** O campo de busca visível do catálogo (topo até 1279px; sobre a grade a partir de 1280px). */
const campoDeBusca = (page: Page) =>
  page.locator("#busca-no-topo:visible, #busca-sobre-a-grade:visible").first();

const janelaDoProduto = (page: Page) =>
  page.locator("dialog.sc-janela-produto[open]");

/** Os nomes dos produtos que o catálogo mostra agora. */
async function produtosNaGrade(page: Page): Promise<string[]> {
  return page
    .locator("main a.sc-vitrine__link")
    .evaluateAll((links) =>
      links.map(
        (l) =>
          l.querySelector("h3, [class*='nome']")?.textContent?.trim() ??
          l.textContent?.trim() ??
          "",
      ),
    );
}

async function abrirProduto(page: Page, produtoId: string): Promise<Locator> {
  await page.goto(`/loja/${APELIDO_DA_JORNADA}/produto/${produtoId}`);
  const janela = janelaDoProduto(page);
  await expect(janela).toBeVisible();
  return janela;
}

/** Adiciona o produto simples aberto e espera o aviso de que entrou. */
async function adicionarSimples(page: Page, produtoId: string): Promise<void> {
  const janela = await abrirProduto(page, produtoId);
  await janela.locator(".sc-produto__adicionar").click();
  await expect(page.getByText(/Adicionado à sacola/)).toBeAttached();
  await expect(janela).toBeHidden();
}

/**
 * A sacola aberta: a coluna lateral a partir de 1280px, ou a janela aberta
 * pela barra de baixo nas larguras menores.
 */
async function abrirSacola(page: Page): Promise<Locator> {
  const coluna = page.locator("aside.sc-sacola-coluna");
  const barra = page.locator(".sc-sacola-barra__abrir");
  // A sacola aparece depois que o item entra: espera uma das duas formas.
  await expect(coluna.or(barra).first()).toBeVisible();
  if (await coluna.isVisible()) return coluna;
  await page.locator(".sc-sacola-barra__abrir").click();
  const janela = page.locator("dialog[open]").filter({
    has: page.locator("#titulo-do-carrinho"),
  });
  await expect(janela).toBeVisible();
  return janela;
}

/** Vai da sacola ao fechamento e devolve a janela do fechamento. */
async function irAoFechamento(page: Page): Promise<Locator> {
  const sacola = await abrirSacola(page);
  await sacola.getByRole("button", { name: "Fechar pedido" }).click();
  const fechamento = page.locator("dialog[open]").filter({
    has: page.locator("#titulo-do-fechamento"),
  });
  await expect(fechamento).toBeVisible();
  return fechamento;
}

/** Abre o fechamento já com telefone (se pedido) e "Retirar no local" marcados. */
async function prepararRetirada(page: Page): Promise<Locator> {
  const fechamento = await irAoFechamento(page);
  await fechamento.getByLabel(/Retirar no local/).check();
  // A conta nova não tem telefone: o fechamento pede um. Preenchido DEPOIS da
  // forma de receber, que redesenha o formulário, e conferido no campo.
  const telefone = fechamento.locator("#checkout-telefone");
  if (await telefone.isVisible()) {
    await telefone.fill("(85) 98888-7777");
    await expect(telefone).not.toHaveValue("");
  }
  return fechamento;
}

/** Confirma o pedido e devolve o código mostrado. */
async function confirmar(page: Page, fechamento: Locator): Promise<string> {
  await fechamento.getByRole("button", { name: "Confirmar pedido" }).click();
  const titulo = page.getByRole("heading", { name: /Pedido .+ registrado/ });
  await expect(titulo).toBeVisible({ timeout: 20_000 });
  const codigo = /Pedido (\S+) registrado/.exec(
    (await titulo.textContent()) ?? "",
  )?.[1];
  expect(codigo, "o pedido ganha código").toBeTruthy();
  return codigo ?? "";
}

/** Fecha o pedido retirando no local e devolve o código mostrado. */
async function confirmarRetirando(page: Page): Promise<string> {
  return confirmar(page, await prepararRetirada(page));
}

test.describe("busca", () => {
  test("[CA-1] @spec:AC-11404 a busca do catálogo encontra os produtos esperados, e só eles", async ({
    page,
  }) => {
    await page.goto(CATALOGO);
    await expect(page.locator("main a.sc-vitrine__link")).toHaveCount(3);

    await campoDeBusca(page).fill("pastel");
    await campoDeBusca(page).press("Enter");
    await expect(page).toHaveURL(/busca=pastel/);
    const achados = await produtosNaGrade(page);
    expect(achados.join(" | ")).toContain(JORNADA.pastel.nome);
    expect(achados).toHaveLength(1);

    await campoDeBusca(page).fill("coxinha");
    await campoDeBusca(page).press("Enter");
    await expect(page).toHaveURL(/busca=coxinha/);
    await expect(page.locator("main a.sc-vitrine__link")).toHaveCount(1);
    await expect(page.locator("main a.sc-vitrine__link")).toContainText(
      JORNADA.coxinha.nome,
    );
  });

  test("[CA-2] @spec:AC-11404 a busca sem resultado mostra o estado vazio com uma saída", async ({
    page,
  }) => {
    await page.goto(`${CATALOGO}?busca=zz-nada-disso-existe`);
    await expect(page.locator("main a.sc-vitrine__link")).toHaveCount(0);
    await expect(page.getByText(/Nada encontrado para/)).toBeVisible();
    const saida = page.getByRole("link", { name: "Limpar a busca" });
    await expect(saida).toBeVisible();
    await saida.click();
    await expect(page.locator("main a.sc-vitrine__link")).toHaveCount(3);
  });

  test("[CA-3] @spec:AC-11404 a busca da descoberta acha o produto da loja pelo nome", async ({
    page,
  }) => {
    await page.goto("/explorar/produtos");
    const busca = page
      .getByRole("searchbox", { name: "Buscar produtos" })
      .filter({ visible: true })
      .first();
    await busca.fill(JORNADA.pastel.nome);
    await busca.press("Enter");
    await expect(page).toHaveURL(/busca=Pastel/);
    const resultados = page.getByRole("region", {
      name: "Produtos encontrados",
    });
    await expect(
      resultados
        .getByRole("link", { name: new RegExp(JORNADA.pastel.nome) })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    // O refri da mesma loja também está na descoberta, mas não casa com a busca.
    await expect(
      resultados.getByRole("link", { name: new RegExp(JORNADA.refri.nome) }),
    ).toHaveCount(0);
  });
});

test.describe("variação e adicional", () => {
  test("[CA-4] @spec:AC-11405 a variação e o adicional somam no preço como antes", async ({
    page,
  }) => {
    const janela = await abrirProduto(page, loja.pastelId);
    const adicionar = janela.locator(".sc-produto__adicionar");

    await janela.getByText("Grande", { exact: true }).click();
    await expect(adicionar).toContainText(reais(JORNADA.pastel.grande));
    await janela.getByText("Pimenta").click();
    await expect(adicionar).toContainText(
      reais(JORNADA.pastel.grande + JORNADA.pastel.pimenta),
    );
    await janela.getByText("Médio", { exact: true }).click();
    await expect(adicionar).toContainText(
      reais(JORNADA.pastel.medio + JORNADA.pastel.pimenta),
    );

    await adicionar.click();
    await expect(page.getByText(/Adicionado à sacola/)).toBeAttached();
    const sacola = await abrirSacola(page);
    await expect(sacola).toContainText(JORNADA.pastel.nome);
    await expect(sacola).toContainText("Molho: Pimenta");
    await expect(sacola).toContainText(
      reais(JORNADA.pastel.medio + JORNADA.pastel.pimenta),
    );
  });

  test("[CA-5] @spec:AC-11405 sem a escolha obrigatória o produto não entra na sacola, com aviso", async ({
    page,
  }) => {
    const janela = await abrirProduto(page, loja.pastelId);
    await janela.getByText("Grande", { exact: true }).click();
    await janela.locator(".sc-produto__adicionar").click();

    const grupo = janela.locator(".sc-produto__grupo--pendente");
    await expect(grupo).toBeVisible();
    await expect(grupo).toContainText("Molho");
    await expect(janela.getByText("Escolha 1 opção em Molho.")).toBeVisible();
    await expect(janela).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Sacola, vazia/ }),
    ).toBeAttached();
  });
});

test.describe("sacola", () => {
  test("[CA-6] @spec:AC-11406 quantidade, atacado, remoção e recarga mantêm itens e total", async ({
    page,
  }) => {
    await adicionarSimples(page, loja.refriId);
    await adicionarSimples(page, loja.coxinhaId);

    let sacola = await abrirSacola(page);
    const aumentar = sacola.getByRole("button", {
      name: `Aumentar quantidade de ${JORNADA.refri.nome}`,
    });
    // Um clique por vez, esperando a contagem da sacola acompanhar (refris + 1 coxinha).
    for (let i = 1; i < JORNADA.refri.minimoAtacado; i += 1) {
      await aumentar.click();
      await expect(sacola).toContainText(`${i + 2} itens`);
    }
    // 6 refris no atacado (R$ 4,00) + 1 coxinha.
    const totalNoAtacado =
      JORNADA.refri.minimoAtacado * JORNADA.refri.atacado +
      JORNADA.coxinha.preco;
    await expect(sacola).toContainText(reais(totalNoAtacado));
    await expect(sacola).toContainText(reais(JORNADA.refri.atacado));

    // Uma a menos sai do atacado: volta ao varejo.
    await sacola
      .getByRole("button", {
        name: `Diminuir quantidade de ${JORNADA.refri.nome}`,
      })
      .click();
    const totalNoVarejo =
      (JORNADA.refri.minimoAtacado - 1) * JORNADA.refri.varejo +
      JORNADA.coxinha.preco;
    await expect(sacola).toContainText(reais(totalNoVarejo));

    await sacola
      .getByRole("button", {
        name: `Remover ${JORNADA.coxinha.nome} do carrinho`,
      })
      .click();
    await expect(sacola).not.toContainText(JORNADA.coxinha.nome);
    const semCoxinha = (JORNADA.refri.minimoAtacado - 1) * JORNADA.refri.varejo;
    await expect(sacola).toContainText(reais(semCoxinha));

    await page.reload();
    sacola = await abrirSacola(page);
    await expect(sacola).toContainText(JORNADA.refri.nome);
    await expect(sacola).not.toContainText(JORNADA.coxinha.nome);
    await expect(sacola).toContainText(reais(semCoxinha));
  });

  test("[CA-7] @spec:AC-11406 a sacola de uma sessão não aparece em outra", async ({
    page,
    browser,
  }, info) => {
    await adicionarSimples(page, loja.coxinhaId);
    await expect(
      page.getByRole("button", { name: /^Sacola, 1 item/ }),
    ).toBeAttached();

    const outra = await browser.newContext({
      viewport: page.viewportSize() ?? { width: 1280, height: 900 },
    });
    try {
      await jaEscolheuOsCookies(outra, origemDoSite(info));
      const pagina = await outra.newPage();
      await pagina.goto(CATALOGO);
      await expect(
        pagina.getByRole("button", { name: /^Sacola, vazia/ }),
      ).toBeAttached();
      await expect(
        pagina.locator(".sc-sacola-barra, aside.sc-sacola-coluna li"),
      ).toHaveCount(0);
    } finally {
      await outra.close();
    }
  });
});

test.describe("fechamento", () => {
  test("[CA-8] @spec:AC-11407 o pedido sai com os itens e o total da sacola, ganha código, abre o acompanhamento e leva a mensagem pronta", async ({
    page,
    context,
  }, info) => {
    await clienteLogado(context, origemDoSite(info), "Cliente da Jornada");
    await interceptarWhatsApp(page);
    await adicionarSimples(page, loja.coxinhaId);
    await adicionarSimples(page, loja.refriId);

    const fechamento = await prepararRetirada(page);
    // Retirando no local não há taxa: o total do pedido é o da sacola.
    const total = reais(JORNADA.coxinha.preco + JORNADA.refri.varejo);
    await expect(fechamento.locator(".sc-resumo__linha--total")).toContainText(
      total,
    );
    const codigo = await confirmar(page, fechamento);

    await page.getByRole("button", { name: "Enviar pelo WhatsApp" }).click();
    const [janela] = await janelasAbertas(page);
    expect(janela?.endereco, "abre o WhatsApp").toMatch(/wa\.me|whatsapp/);
    const mensagem = decodeURIComponent(janela?.endereco ?? "");
    expect(mensagem).toContain(codigo);
    expect(mensagem).toContain(JORNADA.coxinha.nome);
    expect(mensagem).toContain(JORNADA.refri.nome);
    expect(mensagem).toContain(total);

    await page.getByRole("link", { name: "Acompanhar meu pedido" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/loja/${APELIDO_DA_JORNADA}/pedido/`),
    );
    await expect(page.locator("[data-status-atual]")).toBeVisible();
    await expect(page.locator("[data-total]")).toContainText(total);
    await expect(page.getByText(JORNADA.coxinha.nome)).toBeVisible();
  });

  test("[CA-9] @spec:AC-11407 sem conta o fechamento não cria pedido: pede para entrar", async ({
    page,
  }) => {
    await adicionarSimples(page, loja.coxinhaId);
    const sacola = await abrirSacola(page);
    await sacola.getByRole("button", { name: "Fechar pedido" }).click();
    await expect(
      page.getByRole("button", { name: "Confirmar pedido" }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("link", { name: /Entrar/ })
        .or(page.getByRole("button", { name: /Entrar/ }))
        .first(),
    ).toBeVisible();
  });

  test("[CA-10] @spec:AC-11407 o pedido de uma conta não aparece em Meus pedidos de outra", async ({
    page,
    context,
    browser,
  }, info) => {
    const origem = origemDoSite(info);
    await clienteLogado(context, origem, "Cliente Dono do Pedido");
    await adicionarSimples(page, loja.coxinhaId);
    const codigo = await confirmarRetirando(page);

    // A confirmação e Meus pedidos mostram o MESMO código ("A-0004", card
    // #135): cliente e loja falam do mesmo número.
    expect(codigo, "o código do pedido").toMatch(/^[A-Z]-\d{4}$/);
    const doPedido = (p: Page) =>
      p
        .getByRole("region", { name: "Lanchonete da Jornada" })
        .getByText(`Pedido ${codigo}`, { exact: true });

    await page.goto("/conta/pedidos");
    await expect(doPedido(page)).toBeVisible({ timeout: 15_000 });

    const outra = await browser.newContext();
    try {
      await jaEscolheuOsCookies(outra, origem);
      await clienteLogado(outra, origem, "Cliente Curioso");
      const pagina = await outra.newPage();
      await pagina.goto("/conta/pedidos");
      await expect(
        pagina.getByRole("heading", { name: "Meus pedidos", level: 1 }),
      ).toBeVisible();
      await expect(doPedido(pagina)).toHaveCount(0);
    } finally {
      await outra.close();
    }
  });
});
