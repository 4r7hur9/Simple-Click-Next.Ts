/**
 * Capturas das telas do redesign por largura e tema (card #114: AC-11401) e
 * os dados do Stitch fora do texto pintado (AC-11421).
 *
 * UMA CAPTURA por tela × largura × tema, de página inteira, com movimento
 * reduzido e fontes prontas, e um FRAGMENTO JSON ao lado (tela, largura, tema,
 * loja, data, referência do Stitch). Tudo vai para a pasta de saída do teste
 * (`test-results/`, fora do git): o portão não suja a árvore e dois projetos
 * nunca escrevem o mesmo arquivo. A consolidação em `.rmcode/capturas/114/`
 * e a leitura lado a lado com o Stitch são da revisão (T-11/T-13).
 *
 * O TEXTO PINTADO de cada tela é lido e conferido contra os dados ilustrativos
 * do export do Stitch (CNPJ, telefone, "10x sem juros", cupom, marcas
 * automotivas…): nada disso pode virar conteúdo (P-105).
 *
 * Sem baseline de pixels (Q-11402): a comparação é a revisão do dono.
 */
import { stat, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  LOJAS_DA_CARGA_DEMO,
  clienteLogado,
  conferirCargaDemo,
  garantirLojaDaJornada,
} from "../fixtures/redesign-lojas.ts";
import {
  DADOS_DO_STITCH,
  TELAS_DO_REDESIGN,
  TEMAS,
  alturaPara,
  esperarAssentar,
  jaEscolheuOsCookies,
  larguras,
  origemDoSite,
  prepararPagina,
  type DadosDasTelas,
} from "../fixtures/redesign.ts";

let dados: DadosDasTelas;

test.beforeAll(async () => {
  await conferirCargaDemo();
  const jornada = await garantirLojaDaJornada();
  dados = {
    lojaDemo: LOJAS_DA_CARGA_DEMO[1].apelido,
    produtoDaJornada: jornada.coxinhaId,
    apelidoDaJornada: "e2e-jornada",
  };
});

for (const tela of TELAS_DO_REDESIGN) {
  test(`[CA-30] @spec:AC-11401 @spec:AC-11421 capturas de ${tela.id} (${tela.card}) em cada largura e tema, sem dado do Stitch`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(180_000);
    await jaEscolheuOsCookies(context, origemDoSite(info));
    if (tela.logada)
      await clienteLogado(context, origemDoSite(info), "Cliente das Capturas");

    for (const largura of larguras(info)) {
      for (const tema of TEMAS) {
        await test.step(`${largura}px ${tema}`, async () => {
          await page.setViewportSize({
            width: largura,
            height: alturaPara(largura),
          });
          await prepararPagina(page, tema);
          await tela.abrir(page, dados);
          await esperarAssentar(page);

          const nome = `${tela.id}-${largura}-${tema}`;
          const arquivo = info.outputPath(`${nome}.png`);
          await page.screenshot({ path: arquivo, fullPage: true });
          expect((await stat(arquivo)).size, `captura ${nome}`).toBeGreaterThan(
            1_000,
          );

          await writeFile(
            info.outputPath(`${nome}.json`),
            JSON.stringify(
              {
                tela: tela.id,
                card: tela.card,
                largura,
                tema,
                loja:
                  tela.id === "sacola"
                    ? dados.apelidoDaJornada
                    : tela.logada
                      ? null
                      : dados.lojaDemo,
                rota: new URL(page.url()).pathname,
                referencia: tela.referencia,
                data: new Date().toISOString(),
                projeto: info.project.name,
              },
              null,
              2,
            ),
          );

          const texto = await page.locator("body").innerText();
          const achados = DADOS_DO_STITCH.filter((padrao) =>
            padrao.test(texto),
          ).map(String);
          expect
            .soft(achados, `dados do Stitch no texto de ${nome}`)
            .toEqual([]);
        });
      }
    }
  });
}
