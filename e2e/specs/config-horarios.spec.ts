/**
 * Ponta a ponta do horário de funcionamento (T-908).
 *
 * O dono mexe na grade e no "fechar agora" pela tela do painel, e a vitrine e
 * o fechamento da MESMA loja obedecem, sem esperar o cache vencer. O cálculo
 * tem prova pura (`horario-loja.test.ts`) e a gravação, prova contra o banco;
 * o que só este cenário prova é o caminho inteiro até o cliente ser impedido.
 *
 * O RELÓGIO NÃO DECIDE. A loja do painel abre o dia inteiro, todos os dias;
 * fechar é tirar a faixa do dia de HOJE no fuso da loja, que vale a qualquer
 * hora em que o cenário rode. A loja volta como estava no fim
 * (`fixtures/config-loja.ts`).
 */
import { expect, test, type Page } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  comALojaDoPainelSoParaMim,
  diaDaSemanaNaLoja,
  irAoFechamentoCom,
  preencherWhatsAppSeFaltar,
} from "../fixtures/config-loja.ts";
import { interceptarWhatsApp } from "../fixtures/intercepts.ts";
import {
  criarProdutoSimples,
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

test.describe.configure({ timeout: 180_000 });

const DIAS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

/** Salva a tela de horário e espera a confirmação. */
async function salvarHorario(pagina: Page): Promise<void> {
  await pagina.getByRole("button", { name: "Salvar horário" }).click();
  await expect(
    pagina.getByText("Horário salvo. A vitrine já segue a nova grade."),
  ).toBeVisible();
}

/** A marca de situação da vitrine da loja. */
function situacao(pagina: Page) {
  return pagina.locator(".sc-loja__situacao");
}

/** O cliente tenta fechar um pedido para retirar, com o que está no carrinho. */
async function tentarFechar(pagina: Page, apelido: string): Promise<void> {
  await pagina.goto(`/loja/${apelido}/checkout`);
  // O nome vem da conta que entrou (o pedido exige conta): só o WhatsApp.
  await pagina.getByLabel(/Retirar no local/).check();
  await preencherWhatsAppSeFaltar(pagina, "11977776666");
  await pagina.getByRole("button", { name: "Confirmar pedido" }).click();
}

test("@spec:AC-911 fechar agora pelo painel impede o cliente de pedir, e desligar volta a receber sem mexer na semana", async ({
  page,
}, info) => {
  const { id: lojaId } = await garantirLojaDoPainel();
  const produto = await criarProdutoSimples(
    lojaId,
    nomeUnico("Boné", info.project.name),
    2_500,
  );

  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    await interceptarWhatsApp(page);
    // O carrinho é montado com a loja aberta: quem fecha é o dono, depois.
    await irAoFechamentoCom(page, apelido, [produto]);

    await page.goto("/painel/config/horarios");
    await expect(
      page.getByRole("button", { name: "Remover faixa" }),
    ).toHaveCount(7);
    await page.getByLabel(/Parar de receber pedidos agora/).check();
    await salvarHorario(page);

    // A VITRINE avisa, e o FECHAMENTO recusa — com o carrinho preservado.
    await page.goto(`/loja/${apelido}`);
    await expect(situacao(page)).toHaveClass(/sc-loja__situacao--fechada/);
    await tentarFechar(page, apelido);
    // O pedido não nasce: a tela recusa dizendo que a loja está fechada (e,
    // quando há previsão, quando abre — AC-517) e o carrinho continua lá.
    await expect(page.getByText(/^A loja está fechada agora/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Enviar pelo WhatsApp/ }),
    ).toHaveCount(0);
    await expect(page.locator(".sc-resumo")).toContainText("Boné");

    // DESLIGAR o fechamento temporário: a semana está intacta e a loja volta.
    await page.goto("/painel/config/horarios");
    await expect(
      page.getByLabel(/Parar de receber pedidos agora/),
    ).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Remover faixa" }),
    ).toHaveCount(7);
    await page.getByLabel(/Parar de receber pedidos agora/).uncheck();
    await salvarHorario(page);

    await page.goto(`/loja/${apelido}`);
    await expect(situacao(page)).toHaveText(/Aberta agora/);
    await tentarFechar(page, apelido);
    await expect(
      page.getByRole("button", { name: /Enviar pelo WhatsApp/ }),
    ).toBeVisible();
  });
});

test("@spec:AC-909 o dia sem faixa na grade deixa a vitrine fechada com a próxima abertura, e a faixa de volta reabre", async ({
  page,
}) => {
  await comALojaDoPainelSoParaMim(ENDERECO_DO_SITE, async ({ apelido }) => {
    const hoje = DIAS[diaDaSemanaNaLoja()] ?? "Domingo";

    // HOJE SEM FAIXA, no fuso da loja: fechada agora, abre no dia seguinte.
    await page.goto("/painel/config/horarios");
    const remover = page.getByRole("button", { name: "Remover faixa" });
    await expect(remover).toHaveCount(7);
    await remover.nth(DIAS.indexOf(hoje)).click();
    await expect(
      page.getByRole("button", { name: `Abrir ${hoje.toLowerCase()}` }),
    ).toBeVisible();
    await salvarHorario(page);

    await page.goto(`/loja/${apelido}`);
    await expect(situacao(page)).toHaveClass(/sc-loja__situacao--fechada/);
    await expect(situacao(page)).toContainText("Fechada agora");
    await expect(situacao(page)).not.toContainText("horário não informado");

    // A FAIXA DE VOLTA, o dia inteiro: aberta de novo.
    await page.goto("/painel/config/horarios");
    await page
      .getByRole("button", { name: `Abrir ${hoje.toLowerCase()}` })
      .click();
    const indice = DIAS.indexOf(hoje);
    await page
      .locator(`input[name="semana.${indice}.faixas.0.abre"]`)
      .fill("00:00");
    await page
      .locator(`input[name="semana.${indice}.faixas.0.fecha"]`)
      .fill("23:59");
    await salvarHorario(page);

    await page.goto(`/loja/${apelido}`);
    await expect(situacao(page)).toHaveText(/Aberta agora/);
  });
});
