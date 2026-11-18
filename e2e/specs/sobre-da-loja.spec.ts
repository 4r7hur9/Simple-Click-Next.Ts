/**
 * A página Sobre da loja, em navegador de verdade (AC-421, AC-422, AC-423).
 *
 * O QUE SÓ ESTE CENÁRIO PROVA. O componente tem prova de unidade
 * (`apps/web/tests/sobre-da-loja.test.tsx`) e a API tem prova contra o banco
 * (`apps/api/tests/vitrine-sem-dado-sensivel.test.ts`). O que nenhuma das duas
 * alcança é o caminho inteiro: a rota `/loja/{apelido}/sobre` existe no
 * framework, o servidor busca a loja na API de verdade, desenha a página, e o
 * que chega ao navegador — HTML e resposta da API — não carrega nada do
 * cadastro do dono.
 *
 * A LOJA É PRÓPRIA (`fixtures/loja-com-sobre.ts`): a da carga de exemplo não
 * tem WhatsApp marcado como público, e a loja das compras é regravada por
 * outros cenários em paralelo.
 */
import { expect, test } from "@playwright/test";

import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";
import {
  garantirLojaComSobre,
  LOJA_COM_SOBRE,
} from "../fixtures/loja-com-sobre.ts";

const PAGINA_SOBRE = `/loja/${LOJA_COM_SOBRE.apelido}/sobre`;

/**
 * Desde o redesign (cards #107/#129) o Sobre é uma JANELA aberta sobre a
 * vitrine da loja: a vitrine embaixo também mostra a logo e o endereço, e as
 * conferências olham só para a janela. Os nomes dos links também mudaram:
 * "Conversar no WhatsApp", "Ver o cardápio" e "Fechar" (volta à vitrine).
 */
const SOBRE = "dialog.sc-sobre-janela";

let imagens: { readonly logo: string; readonly capa: string };

test.beforeAll(async () => {
  imagens = await garantirLojaComSobre(ENDERECO_DO_SITE);

  // AQUECE A LOJA NA API antes do primeiro cenário. O site espera a API por no
  // máximo dois segundos (`api-client.ts`), e a primeira leitura de uma loja
  // recém-montada — cache frio, conexões abrindo — passou disso numa máquina
  // carregada: a página caiu na tela de erro, que sem JavaScript fica em
  // branco, e o cenário reprovou por um motivo que não é o dele. O
  // `iniciar-api.mjs` faz o mesmo com a loja da carga de exemplo.
  await expect
    .poll(
      async () =>
        (await fetch(`${ENDERECO_DA_API}/v1/vitrine/${LOJA_COM_SOBRE.apelido}`))
          .status,
      { timeout: 30_000 },
    )
    .toBe(200);
});

/** Tudo o que é do cadastro do dono e não pode sair em lugar nenhum. */
const NUNCA_SAEM = Object.values(LOJA_COM_SOBRE.cadastro);

test("@spec:AC-421 a página Sobre mostra a história, a logo e a capa da loja", async ({
  page,
}) => {
  await page.goto(PAGINA_SOBRE);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    LOJA_COM_SOBRE.nome,
  );
  await expect(page.getByText(LOJA_COM_SOBRE.historia)).toBeVisible();

  // A imagem precisa CARREGAR, e não só estar no HTML: um endereço quebrado
  // deixaria a moldura vazia e a asserção de atributo passaria assim mesmo.
  for (const endereco of [imagens.logo, imagens.capa]) {
    const imagem = page.locator(SOBRE).locator(`img[src="${endereco}"]`);
    await expect(imagem).toBeVisible();
    await expect
      .poll(() =>
        imagem.evaluate((elemento: HTMLImageElement) => elemento.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
});

test("@spec:AC-421 o caminho de volta leva à vitrine da loja", async ({
  page,
}) => {
  await page.goto(PAGINA_SOBRE);

  await page.locator(SOBRE).getByRole("link", { name: "Fechar" }).click();

  await expect(page).toHaveURL(
    `${ENDERECO_DO_SITE}/loja/${LOJA_COM_SOBRE.apelido}`,
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    LOJA_COM_SOBRE.nome,
  );
});

test("@spec:AC-422 a página mostra o endereço de retirada e o WhatsApp público, e nada do cadastro", async ({
  page,
}) => {
  const resposta = await page.goto(PAGINA_SOBRE);
  expect(resposta?.status()).toBe(200);

  const { endereco } = LOJA_COM_SOBRE;
  const retirada = page.locator(SOBRE).locator("address");
  await expect(retirada).toContainText(
    `${endereco.logradouro}, ${endereco.numero}`,
  );
  await expect(retirada).toContainText(endereco.bairro);
  await expect(retirada).toContainText(`${endereco.cidade} / ${endereco.uf}`);

  await expect(
    page.locator(SOBRE).getByRole("link", { name: /Conversar no WhatsApp/ }),
  ).toHaveAttribute("href", `https://wa.me/${LOJA_COM_SOBRE.whatsappPublico}`);

  // O HTML INTEIRO, e não só o texto visível: dado escondido num atributo ou
  // no pacote que o framework manda junto também é dado publicado.
  const html = await page.content();
  for (const sensivel of NUNCA_SAEM) {
    expect(html, `a página publicou ${sensivel}`).not.toContain(sensivel);
  }
});

test("@spec:AC-422 a resposta pública da API traz o contato autorizado e nada do cadastro", async ({
  request,
}) => {
  // Requisição CRUA à API, como qualquer um na internet pode fazer: esconder o
  // dado só na tela não adianta se ele sai na resposta que a tela consome.
  const resposta = await request.get(
    `${ENDERECO_DA_API}/v1/vitrine/${LOJA_COM_SOBRE.apelido}`,
  );
  expect(resposta.status()).toBe(200);

  const corpo = await resposta.text();
  expect(corpo).toContain(LOJA_COM_SOBRE.whatsappPublico);
  for (const sensivel of NUNCA_SAEM) {
    expect(corpo, `a API publicou ${sensivel}`).not.toContain(sensivel);
  }
});

test("@spec:AC-423 sem JavaScript a página continua legível e navegável", async ({
  browser,
}) => {
  // `baseURL` VAI À MÃO: contexto criado por `browser.newContext()` não herda
  // o `use` do projeto, e sem ele o endereço relativo não resolve.
  const contexto = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: ENDERECO_DO_SITE,
  });
  const pagina = await contexto.newPage();

  await pagina.goto(PAGINA_SOBRE);

  await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(
    LOJA_COM_SOBRE.nome,
  );
  await expect(pagina.getByText(LOJA_COM_SOBRE.historia)).toBeVisible();
  await expect(pagina.locator(SOBRE).locator("address")).toContainText(
    LOJA_COM_SOBRE.endereco.logradouro,
  );
  await expect(
    pagina.locator(SOBRE).getByRole("link", { name: /Conversar no WhatsApp/ }),
  ).toHaveAttribute("href", `https://wa.me/${LOJA_COM_SOBRE.whatsappPublico}`);

  // A navegação é link de verdade: com o script desligado, clicar ainda leva
  // à vitrine — e à lista de produtos.
  await pagina
    .locator(SOBRE)
    .getByRole("link", { name: "Ver o cardápio" })
    .first()
    .click();
  await expect(pagina).toHaveURL(
    `${ENDERECO_DO_SITE}/loja/${LOJA_COM_SOBRE.apelido}/cardapio`,
  );

  await pagina.goto(PAGINA_SOBRE);
  await pagina.locator(SOBRE).getByRole("link", { name: "Fechar" }).click();
  await expect(pagina).toHaveURL(
    `${ENDERECO_DO_SITE}/loja/${LOJA_COM_SOBRE.apelido}`,
  );

  await contexto.close();
});
