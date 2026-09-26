// @vitest-environment jsdom
/**
 * Prova do filtro por especificação na tela da vitrine (AC-328).
 *
 * O que vira filtro e o que o filtro deixa passar está provado contra o banco
 * em `apps/api/tests/filtro-especificacao.int.test.ts`. Aqui a pergunta é se a
 * tela entrega isso SEM script: o desenho é o do servidor
 * (`renderToStaticMarkup`), e o filtro é um formulário GET que monta o
 * endereço que a API entende.
 */
import axe from "axe-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FiltroEspecificacao } from "../src/features/vitrine/FiltroEspecificacao";

const FILTROS = [
  { chave: "aro", nome: "Aro", valores: ["15", "16"] },
  { chave: "run-flat", nome: "Run flat", valores: ["false", "true"] },
];

function desenhar(selecionados: readonly string[] = []) {
  return renderToStaticMarkup(
    <FiltroEspecificacao
      filtros={FILTROS}
      selecionados={selecionados}
      acao="/l/autopecas/catalogo"
      categoria="pneus"
      busca={null}
    />,
  );
}

describe("o filtro por especificação na vitrine (AC-328)", () => {
  it("@spec:AC-328 cada especificação filtrável vira um grupo de opções num formulário que funciona sem script", () => {
    const pagina = document.createElement("div");
    pagina.innerHTML = desenhar(["aro=15"]);

    const formulario = pagina.querySelector("form");
    expect(formulario?.getAttribute("method")).toBe("get");
    expect(formulario?.getAttribute("action")).toBe("/l/autopecas/catalogo");
    // A categoria vai junto, para o filtro valer dentro de Pneus.
    expect(
      pagina.querySelector<HTMLInputElement>('input[name="categoria"]')?.value,
    ).toBe("pneus");

    expect(
      [...pagina.querySelectorAll("legend")].map((item) => item.textContent),
    ).toEqual(["Aro", "Run flat"]);
    const caixas = [
      ...pagina.querySelectorAll<HTMLInputElement>('input[name="filtro"]'),
    ];
    expect(caixas.map((caixa) => caixa.value)).toEqual([
      "aro=15",
      "aro=16",
      "run-flat=false",
      "run-flat=true",
    ]);
    // O que já foi escolhido volta marcado.
    expect(caixas.filter((caixa) => caixa.checked).map((c) => c.value)).toEqual(
      ["aro=15"],
    );
  });

  it("@spec:AC-328 verdadeiro ou falso aparece em palavras, e o endereço continua o do banco", () => {
    const pagina = document.createElement("div");
    pagina.innerHTML = desenhar();

    const grupo = [...pagina.querySelectorAll("fieldset")][1];
    expect(
      [...(grupo?.querySelectorAll("label") ?? [])].map((r) => r.textContent),
    ).toEqual(["Não", "Sim"]);
  });

  it("@spec:AC-328 sem especificação filtrável, não há filtro nenhum", () => {
    expect(
      renderToStaticMarkup(
        <FiltroEspecificacao
          filtros={[]}
          selecionados={[]}
          acao="/l/autopecas/catalogo"
          categoria="pneus"
          busca={null}
        />,
      ),
    ).toBe("");
  });

  it("@spec:AC-328 @principle:P-012 o filtro não tem violação crítica nem séria de acessibilidade", async () => {
    const pagina = document.createElement("main");
    pagina.innerHTML = desenhar(["aro=16"]);
    document.body.append(pagina);

    const resultado = await axe.run(pagina, {
      rules: { region: { enabled: false } },
    });
    pagina.remove();

    expect(
      resultado.violations
        .filter(
          (item) => item.impact === "critical" || item.impact === "serious",
        )
        .map((item) => item.id),
    ).toEqual([]);
  });
});
