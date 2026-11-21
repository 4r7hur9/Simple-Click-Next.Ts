/**
 * Ponta a ponta do contrato e dos documentos da loja (T-209, AC-203 a AC-205).
 *
 * A administração envia o contrato em PDF, vê a recusa de um arquivo com o
 * tipo disfarçado (nome e tipo de PDF, conteúdo de outra coisa) e abre o
 * contrato pelo link temporário gerado no clique. O link só entrega o arquivo
 * com a sessão da administração: o mesmo endereço, sem o cookie, é recusado.
 *
 * O armazenamento é a pasta temporária que `e2e/iniciar-api.mjs` dá à API
 * (`ARMAZENAMENTO_PRIVADO_DIR`); nada fica para a próxima execução.
 */
import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  criarLojaPelaAdministracao,
  entrarComoAdministrador,
  NOME_DO_ADMINISTRADOR,
} from "../fixtures/admin.ts";
import { resolverAvisoDeCookies } from "../fixtures/acesso.ts";
import { nomeUnico } from "../fixtures/painel.ts";
import { escolherNoSeletor } from "../fixtures/seletor.ts";
import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";

/** Um PDF mínimo: o que importa para a conferência são os bytes do começo. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
);

/** Um executável com nome e tipo de PDF: o disfarce que a API recusa. */
const DISFARCADO = Buffer.concat([
  Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]),
  Buffer.from("isto nao e um pdf"),
]);

test.beforeEach(async ({ context }) => {
  await entrarComoAdministrador(context, ENDERECO_DO_SITE);
});

test("@spec:AC-203 @spec:AC-204 @spec:AC-205 o contrato em PDF entra, o disfarçado é recusado e o arquivo só abre pelo link temporário com a sessão", async ({
  page,
  playwright,
}, info) => {
  const api = await playwright.request.newContext({ baseURL: ENDERECO_DA_API });
  const loja = await criarLojaPelaAdministracao(
    api,
    ENDERECO_DO_SITE,
    nomeUnico("Doceria", info.project.name),
  );
  await api.dispose();

  // Pela ficha, o caminho que a pessoa faz.
  await page.goto(`/admin/lojas/${loja.id}`);
  await resolverAvisoDeCookies(page);
  await page
    .getByRole("navigation", { name: "Seções da loja" })
    .getByRole("link", { name: "Contrato e documentos" })
    .click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Contrato e documentos" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Nenhum documento enviado ainda")).toBeVisible();

  const arquivo = page.locator("#documento-arquivo");
  const enviar = page.getByRole("button", { name: "Enviar documento" });

  // O DISFARCE: nome .pdf e tipo application/pdf, conteúdo de executável.
  await escolherNoSeletor(
    page,
    page.locator("#documento-tipo"),
    "Contrato assinado",
  );
  await arquivo.setInputFiles({
    name: "contrato.pdf",
    mimeType: "application/pdf",
    buffer: DISFARCADO,
  });
  await enviar.click();
  await expect(page.locator("#documento-arquivo-erro")).toContainText(
    "Tipo de arquivo não permitido",
  );
  await expect(page.getByText("Nenhum documento enviado ainda")).toBeVisible();

  // O CONTRATO de verdade entra e aparece na lista, com quem enviou.
  await arquivo.setInputFiles({
    name: "contrato-assinado.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await enviar.click();
  await expect(page.getByText("Documento enviado")).toBeVisible();
  const lista = page.getByRole("list", { name: "Documentos guardados" });
  await expect(lista.getByText("contrato-assinado.pdf")).toBeVisible();
  await expect(lista).toContainText(`por ${NOME_DO_ADMINISTRADOR}`);

  // A ABERTURA: o link nasce no clique e o arquivo sai como download.
  const linkGerado = page.waitForResponse(
    (resposta) =>
      resposta.request().method() === "POST" &&
      /\/documentos\/[^/]+\/link$/.test(new URL(resposta.url()).pathname),
  );
  const baixado = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Abrir contrato-assinado.pdf" })
    .click();
  const resposta = await linkGerado;
  expect(resposta.status()).toBe(201);
  const download = await baixado;
  expect(download.suggestedFilename()).toBe("contrato-assinado.pdf");
  const caminho = await download.path();
  expect((await readFile(caminho)).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(
    page.getByText("Documento entregue como download."),
  ).toBeVisible();

  // O LINK NÃO É PÚBLICO: com a sessão ele entrega como anexo; sem o cookie,
  // o mesmo endereço é recusado.
  const { link } = (await resposta.json()) as { link: string };
  const noSite = link.replace(/^\/v1\/admin\//, "/api/admin/");
  const comSessao = await page.request.get(noSite);
  expect(comSessao.status()).toBe(200);
  expect(comSessao.headers()["content-disposition"]).toContain("attachment");

  const anonimo = await playwright.request.newContext({
    baseURL: ENDERECO_DO_SITE,
  });
  const semSessao = await anonimo.get(noSite);
  expect(semSessao.status()).toBe(401);
  await anonimo.dispose();
});
