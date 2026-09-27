/**
 * Ponta a ponta do criador de especificações (T-313, AC-325).
 *
 * O dono cria, DENTRO da seção, as especificações dos produtos dela — uma
 * lista obrigatória que vira filtro e um número com unidade —, e o cadastro de
 * produto daquela seção passa a pedir exatamente esses campos, recusando salvar
 * sem o obrigatório.
 */
import { expect, test, type Page } from "@playwright/test";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  entrarComoDono,
  garantirLojaDoPainel,
  nomeUnico,
} from "../fixtures/painel.ts";

test.beforeAll(async () => {
  await garantirLojaDoPainel();
});

test.beforeEach(async ({ context }) => {
  await entrarComoDono(context, ENDERECO_DO_SITE);
});

/** Cria uma especificação e espera o formulário voltar (ele é remontado). */
async function criarEspecificacao(
  page: Page,
  campos: {
    readonly nome: string;
    readonly tipo: "texto" | "numero" | "lista" | "booleano";
    readonly unidade?: string;
    readonly opcoes?: string;
    readonly obrigatoria?: boolean;
    readonly filtravel?: boolean;
  },
): Promise<void> {
  await page.getByLabel("Nome", { exact: true }).fill(campos.nome);
  await page.getByLabel("Tipo de valor").selectOption(campos.tipo);
  if (campos.unidade !== undefined) {
    await page.getByLabel("Unidade (opcional)").fill(campos.unidade);
  }
  if (campos.opcoes !== undefined) {
    await page.getByLabel("Opções da lista").fill(campos.opcoes);
  }
  await page
    .getByLabel("Obrigatória no cadastro do produto")
    .setChecked(campos.obrigatoria === true);
  await page
    .getByLabel("Usar como filtro na vitrine")
    .setChecked(campos.filtravel === true);
  await page.getByRole("button", { name: "Criar especificação" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Especificação criada." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar especificação" }),
  ).toBeVisible();
}

test("@spec:AC-325 a seção ganha as próprias especificações, e o produto dela passa a pedi-las", async ({
  page,
}, info) => {
  const secao = nomeUnico("Pneus", info.project.name);
  const produto = nomeUnico("Pneu Aro", info.project.name);

  await page.goto("/painel/categorias");
  await expect(
    page.getByRole("status").filter({ hasText: /categoria/ }),
  ).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill(secao);
  await page.getByRole("button", { name: "Criar categoria" }).click();
  await expect(
    page.getByText("Categoria criada e pronta para receber produtos."),
  ).toBeVisible();

  await page.getByRole("link", { name: `Especificações de ${secao}` }).click();
  await expect(
    page.getByText("Nenhuma especificação criada ainda.", { exact: false }),
  ).toBeVisible();

  await criarEspecificacao(page, {
    nome: "Aro",
    tipo: "lista",
    opcoes: "13, 14, 15",
    obrigatoria: true,
    filtravel: true,
  });
  await criarEspecificacao(page, {
    nome: "Largura",
    tipo: "numero",
    unidade: "mm",
  });

  const cadastradas = page.getByRole("list", {
    name: "Especificações cadastradas",
  });
  const aro = cadastradas.getByRole("listitem").filter({ hasText: "Aro" });
  await expect(aro).toContainText("Lista de opções");
  await expect(aro).toContainText("obrigatória");
  await expect(aro).toContainText("filtro da vitrine");
  const largura = cadastradas
    .getByRole("listitem")
    .filter({ hasText: "Largura" });
  await expect(largura).toContainText("Número");
  await expect(largura).toContainText("mm");
  await expect(largura).toContainText("opcional");

  // O produto desta seção herda os campos, na ordem em que foram criados.
  await page.goto("/painel/produtos/novo");
  await expect(page.getByText("Preencha os dados do produto.")).toBeVisible();
  await page.getByLabel("Nome do produto").fill(produto);
  await page.getByLabel(/^Categoria/).selectOption({ label: secao });
  await page.getByLabel("Preço (R$)").fill("299,90");

  const campoAro = page.getByLabel(/^Aro/);
  const campoLargura = page.getByLabel(/^Largura \(mm\)/);
  await expect(campoAro).toBeVisible();
  await expect(campoLargura).toBeVisible();
  await expect(campoAro.locator("option")).toHaveText([
    "Escolha…",
    "13",
    "14",
    "15",
  ]);

  // Sem o obrigatório, o cadastro não sai. Quem barra primeiro é o próprio
  // navegador: o campo nasce `required`, e o formulário nem chega a ser
  // enviado — a mensagem escrita pelo app é a segunda linha de defesa.
  await page.getByRole("button", { name: "Cadastrar produto" }).click();
  expect(
    await campoAro.evaluate(
      (campo) => (campo as HTMLSelectElement).validity.valueMissing,
    ),
  ).toBe(true);
  await expect(page).toHaveURL(/\/painel\/produtos\/novo$/);

  await campoAro.selectOption("14");
  await campoLargura.fill("205");
  await page.getByRole("button", { name: "Cadastrar produto" }).click();
  await expect(page).toHaveURL(/\/painel\/produtos$/);
  await expect(
    page.getByRole("listitem").filter({ hasText: produto }),
  ).toBeVisible();
});
