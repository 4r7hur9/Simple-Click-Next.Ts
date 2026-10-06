// @vitest-environment jsdom
/**
 * Funcionalidades liberadas por loja, nas telas (AC-212, AC-213, P-011,
 * P-012).
 *
 * O portão de verdade está provado contra o banco em
 * `apps/api/tests/admin-funcionalidades.test.ts`. Aqui se prova o que só as
 * telas mostram: o menu do dono sem a área desligada, os quatro estados e o
 * ato em dois passos na administração, e que nenhuma tela pede pagamento.
 */
import axe from "axe-core";
import type { FuncionalidadesDaLojaNoContrato } from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  enderecoDasFuncionalidades,
  FuncionalidadesDaLoja,
  FuncionalidadesNaTela,
  MENSAGEM_DE_FALHA_DAS_FUNCIONALIDADES,
} from "../src/features/admin/FuncionalidadesDaLoja.tsx";
import { NavegacaoDaConfiguracao } from "../src/features/config/NavegacaoDaConfiguracao.tsx";
import { navegacaoVisivel } from "../src/features/config/secoes.ts";
import { MANIFESTO_DE_ROTAS } from "../src/lib/routes.ts";
import { caminhoPermitido } from "../src/server/admin-api.ts";
import {
  botao,
  clicar,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

afterEach(desmontar);

const LOJA_ID = "5b0c0000-0000-4000-8000-000000000001";

function lista(ligada: boolean): FuncionalidadesDaLojaNoContrato {
  return {
    loja: { id: LOJA_ID, nome: "Pastel da Joi" },
    funcionalidades: [
      {
        chave: "auto_print",
        rotulo: "Impressão térmica",
        descricao: "Cupom na impressora térmica.",
        temEfeito: true,
        ligada,
        limite: null,
        excecao: ligada
          ? null
          : {
              motivo: "Impressora recolhida",
              definidaEm: "2026-10-06T12:00:00.000Z",
              definidaPor: { id: "adm", nome: "Ana" },
            },
      },
      {
        chave: "custom_domain",
        rotulo: "Domínio próprio",
        descricao: "Endereço próprio.",
        temEfeito: false,
        ligada: true,
        limite: null,
        excecao: null,
      },
    ],
  };
}

function rotulosDoMenu(tela: ParentNode): string[] {
  return [
    ...tela.querySelectorAll('nav[aria-label="Configurações da loja"] a'),
  ].map((link) => link.textContent ?? "");
}

describe("o menu do dono (AC-212)", () => {
  it("@spec:AC-212 com a impressão térmica desligada, a área de impressão não aparece no menu", async () => {
    simularApi(() => ({
      status: 200,
      corpo: {
        funcionalidades: [
          { chave: "auto_print", ligada: false },
          { chave: "custom_domain", ligada: true },
        ],
      },
    }));
    const tela = montar(<NavegacaoDaConfiguracao />);
    await esperar();

    expect(rotulosDoMenu(tela)).not.toContain("Impressão");
    expect(rotulosDoMenu(tela)).toContain("Pagamento");
  });

  it("@spec:AC-212 ligada, a área aparece; e a regra esconde só a seção da funcionalidade desligada", async () => {
    const chamadas = simularApi(() => ({
      status: 200,
      corpo: { funcionalidades: [{ chave: "auto_print", ligada: true }] },
    }));
    const tela = montar(<NavegacaoDaConfiguracao />);
    await esperar();

    expect(chamadas[0]?.url).toBe("/api/loja/funcionalidades");
    expect(rotulosDoMenu(tela)).toContain("Impressão");
    expect(
      navegacaoVisivel(new Set(["auto_print"])).map((item) => item.secao),
    ).toEqual(["pagamento", "entrega", "horario", "contato", "aparencia"]);
    expect(navegacaoVisivel(new Set())).toHaveLength(6);
  });
});

describe("a tela da administração (AC-212, AC-213, P-011)", () => {
  it("@spec:AC-212 @principle:P-011 os quatro estados: carregando, não encontrada, erro e pronta", () => {
    const desenhar = (
      estado: Parameters<typeof FuncionalidadesNaTela>[0]["estado"],
    ) =>
      renderToStaticMarkup(
        <FuncionalidadesNaTela
          lojaId={LOJA_ID}
          estado={estado}
          aoTentarDeNovo={() => {}}
          aoAlterar={() => {}}
        />,
      );

    expect(desenhar({ fase: "carregando" })).toContain(
      "Carregando as funcionalidades",
    );
    expect(desenhar({ fase: "nao-encontrada" })).toContain(
      "Loja não encontrada",
    );
    expect(
      desenhar({
        fase: "erro",
        mensagem: MENSAGEM_DE_FALHA_DAS_FUNCIONALIDADES,
      }),
    ).toContain("Tentar de novo");
    const pronta = desenhar({ fase: "pronta", dados: lista(false) });
    expect(pronta).toContain("Desligada para esta loja");
    expect(pronta).toContain("Impressora recolhida");
    expect(pronta).toContain("Sempre ligada nesta versão");
  });

  it("@spec:AC-212 desligar pede confirmação com motivo e manda o ato à API", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "PUT"
        ? { status: 200, corpo: lista(false) }
        : { status: 200, corpo: lista(true) },
    );
    const tela = montar(<FuncionalidadesDaLoja lojaId={LOJA_ID} />);
    await esperar();
    expect(chamadas[0]?.url).toBe(enderecoDasFuncionalidades(LOJA_ID));

    clicar(botao(tela, "Desligar impressão térmica"));
    const formulario = exigir<HTMLFormElement>(tela, "form");
    // Sem motivo, nada é enviado.
    await enviar(formulario);
    expect(chamadas.filter((chamada) => chamada.metodo === "PUT")).toEqual([]);
    expect(tela.textContent).toContain("ao menos 3 letras");

    digitar(
      exigir<HTMLInputElement>(tela, "#motivo-auto_print"),
      "Sem impressora",
    );
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    const ato = chamadas.find((chamada) => chamada.metodo === "PUT");
    expect(ato?.url).toBe(enderecoDasFuncionalidades(LOJA_ID, "auto_print"));
    expect(ato?.corpo).toEqual({ ligada: false, motivo: "Sem impressora" });
    expect(tela.textContent).toContain("Desligada para esta loja");
    expect(tela.textContent).toContain("Alteração registrada");
  });

  it("@spec:AC-212 o site repassa a leitura e a alteração, e só pelos métodos delas", () => {
    expect(caminhoPermitido(`lojas/${LOJA_ID}/funcionalidades`, "GET")).toBe(
      true,
    );
    expect(
      caminhoPermitido(`lojas/${LOJA_ID}/funcionalidades/auto_print`, "PUT"),
    ).toBe(true);
    expect(
      caminhoPermitido(`lojas/${LOJA_ID}/funcionalidades/auto_print`, "DELETE"),
    ).toBe(false);
    expect(caminhoPermitido(`lojas/${LOJA_ID}/funcionalidades`, "POST")).toBe(
      false,
    );
  });

  it("@spec:AC-213 a tela diz sem custo e sem limite, e nenhuma tela do site pede pagamento", () => {
    const pronta = renderToStaticMarkup(
      <FuncionalidadesNaTela
        lojaId={LOJA_ID}
        estado={{ fase: "pronta", dados: lista(true) }}
        aoTentarDeNovo={() => {}}
        aoAlterar={() => {}}
      />,
    ).toLowerCase();
    expect(pronta).toContain("sem custo e sem limite");
    for (const cobranca of [
      "r$",
      "preço",
      "plano",
      "assinatura",
      "fatura",
      "pagar",
    ]) {
      expect(pronta).not.toContain(cobranca);
    }

    // No manifesto de telas, nenhuma é de cobrança da plataforma.
    const telas = MANIFESTO_DE_ROTAS.map((tela) =>
      `${tela.rota} ${tela.tela}`.toLowerCase(),
    );
    for (const tela of telas) {
      expect(tela).not.toMatch(/assinatura|fatura|cobran[cç]a|upgrade|plano/);
    }
  });

  it("@spec:AC-212 @principle:P-012 a confirmação com motivo não tem violação crítica nem séria", async () => {
    simularApi(() => ({ status: 200, corpo: lista(true) }));
    const tela = montar(<FuncionalidadesDaLoja lojaId={LOJA_ID} />);
    await esperar();
    clicar(botao(tela, "Desligar impressão térmica"));

    const resultado = await axe.run(tela, {
      rules: { region: { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (violacao) =>
        violacao.impact === "critical" || violacao.impact === "serious",
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
  }, 60_000);
});
