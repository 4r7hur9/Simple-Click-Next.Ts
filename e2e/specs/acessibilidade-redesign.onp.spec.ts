/**
 * Acessibilidade, larguras, tema e movimento das telas do redesign (card
 * #114: AC-11409, AC-11413, AC-11415).
 *
 * UM TESTE POR TELA, uma etapa por largura e tema: a falha diz onde reprovou.
 * As conferências são `expect.soft`, para o relatório trazer TODAS as
 * barreiras da tela de uma vez — o teste reprova do mesmo jeito.
 *
 * - axe com as tags WCAG 2.2 A/AA e o contraste ativo; nada sério ou crítico,
 *   e as regras mínimas do design §6 precisam ter rodado (sem isso uma
 *   montagem errada passa com zero violação);
 * - nenhuma rolagem lateral nem elemento passando da borda, em toda largura
 *   do projeto e no zoom de 200% (640px, projeto `publico`);
 * - a página SEGUE O TEMA DO APARELHO: o fundo do claro é outro que o do
 *   escuro (decisão do usuário; na loja, card #131);
 * - com movimento reduzido, nenhuma animação passa de 200ms nem se repete,
 *   medido depois de rolar a página (o que entra ao rolar também conta).
 *
 * LARGURAS PELO PROJETO (sem `test.skip`): `celular` mede 344 e 390;
 * `publico`, 768, 1024, 1280 e o zoom. O axe roda só em 344 e 1280
 * (`LARGURAS_DO_AXE`, D-8 do #114, aplicado no #135), nos dois temas; as
 * outras larguras seguem medindo rolagem lateral, borda e movimento no tema
 * escuro. O tema claro roda na largura do axe de cada projeto (344 e 1280)
 * — orçamento do portão de 15 minutos.
 */
import { expect, test } from "@playwright/test";

import {
  LOJAS_DA_CARGA_DEMO,
  clienteLogado,
  conferirCargaDemo,
  garantirLojaDaJornada,
} from "../fixtures/redesign-lojas.ts";
import {
  LARGURA_DO_ZOOM_200,
  REGRAS_QUE_PRECISAM_RODAR,
  TELAS_DO_REDESIGN,
  alturaPara,
  animacoesLongas,
  ehCelular,
  esperarAssentar,
  fundoDaPagina,
  jaEscolheuOsCookies,
  larguras,
  medirEstouro,
  origemDoSite,
  prepararPagina,
  rodaAxeEm,
  rodarAxe,
  type DadosDasTelas,
  type Tema,
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
  test(`[CA-12] @spec:AC-11409 @spec:AC-11413 @spec:AC-11415 ${tela.id} (${tela.card}) sem barreira em cada largura e tema`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(150_000);
    await jaEscolheuOsCookies(context, origemDoSite(info));
    if (tela.logada) {
      await clienteLogado(
        context,
        origemDoSite(info),
        "Cliente da Acessibilidade",
      );
    }
    const larguraDoClaro = ehCelular(info) ? 344 : 1280;

    for (const largura of larguras(info)) {
      const temas: Tema[] =
        largura === larguraDoClaro ? ["escuro", "claro"] : ["escuro"];
      const fundos: Partial<Record<Tema, string>> = {};

      for (const tema of temas) {
        await test.step(`${largura}px, tema ${tema}`, async () => {
          await page.setViewportSize({
            width: largura,
            height: alturaPara(largura),
          });
          await prepararPagina(page, tema);
          await tela.abrir(page, dados);
          await esperarAssentar(page);
          const onde = `${tela.id} ${largura}px ${tema}`;

          if (rodaAxeEm(largura)) {
            const axe = await rodarAxe(page);
            const naoRodaram = REGRAS_QUE_PRECISAM_RODAR.filter(
              (regra) => !axe.rodadas.includes(regra),
            );
            expect
              .soft(naoRodaram, `regras mínimas sem rodar em ${onde}`)
              .toEqual([]);
            expect.soft(axe.graves, `axe em ${onde}`).toEqual([]);
          }

          const estouro = await medirEstouro(page);
          expect
            .soft(estouro.rolagem, `rolagem lateral em ${onde}`)
            .toBeLessThanOrEqual(estouro.largura);
          expect
            .soft(estouro.fora, `elementos fora da borda em ${onde}`)
            .toEqual([]);

          fundos[tema] = await fundoDaPagina(page);

          if (tema === "escuro") {
            await page.evaluate(() =>
              window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "instant",
              }),
            );
            await page.waitForTimeout(150);
            expect
              .soft(
                await animacoesLongas(page),
                `animação longa com movimento reduzido em ${onde}`,
              )
              .toEqual([]);
          }
        });
      }

      if (fundos.claro !== undefined) {
        expect
          .soft(
            fundos.claro,
            `${tela.id} segue o tema do aparelho em ${largura}px`,
          )
          .not.toBe(fundos.escuro);
      }
    }

    if (!ehCelular(info)) {
      await test.step(`zoom de 200% (${LARGURA_DO_ZOOM_200}px)`, async () => {
        await page.setViewportSize({ width: LARGURA_DO_ZOOM_200, height: 720 });
        await prepararPagina(page, "escuro");
        await tela.abrir(page, dados);
        await esperarAssentar(page);
        const estouro = await medirEstouro(page);
        expect
          .soft(
            estouro.rolagem,
            `rolagem lateral no zoom de 200% em ${tela.id}`,
          )
          .toBeLessThanOrEqual(estouro.largura);
        expect
          .soft(estouro.fora, `fora da borda no zoom de 200% em ${tela.id}`)
          .toEqual([]);
      });
    }
  });
}
