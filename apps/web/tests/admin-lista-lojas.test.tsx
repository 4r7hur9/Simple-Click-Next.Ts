// @vitest-environment jsdom
/**
 * Lista e busca de lojas na tela da administração (AC-206, P-011).
 *
 * A lista de verdade está provada contra o banco em
 * `apps/api/tests/admin-lista.test.ts`. Aqui se prova o que só a tela
 * mostra: os quatro estados, as colunas que a administração lê, o caminho
 * até a ficha — e que a busca digitada é a que vai para a API.
 */
import type { ListaDeLojasNoContrato } from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  dataDeCadastro,
  enderecoDaLista,
  ListaLojas,
  MENSAGEM_DE_SESSAO,
  TabelaDeLojas,
  type TabelaDeLojasProps,
} from "../src/features/admin/ListaLojas.tsx";
import {
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

const LISTA: ListaDeLojasNoContrato = {
  lojas: [
    {
      id: "3a3c3d4e-0000-4000-8000-000000000003",
      codigo: "0003",
      nome: "Moda Boa Vista",
      apelido: "moda-boa-vista",
      tipoDeNegocio: { codigo: "APPAREL", nome: "Roupas" },
      status: "SUSPENDED",
      cidade: "São Paulo",
      uf: "SP",
      criadaEm: "2026-01-05T12:00:00.000Z",
    },
    {
      id: "3a3c3d4e-0000-4000-8000-000000000001",
      codigo: "0001",
      nome: "Pastel da Joi",
      apelido: "pastel-da-joi",
      tipoDeNegocio: { codigo: "FOOD_SNACK", nome: "Lanchonete" },
      status: "ACTIVE",
      cidade: null,
      uf: null,
      criadaEm: "2025-12-20T15:30:00.000Z",
    },
  ],
  total: 27,
  pagina: 1,
  porPagina: 25,
};

function desenhar(sobrescrita: Partial<TabelaDeLojasProps> = {}): Document {
  const props: TabelaDeLojasProps = {
    termo: "",
    estado: { fase: "pronta", lista: LISTA },
    aoMudarTermo: () => undefined,
    aoBuscar: () => undefined,
    aoTentarDeNovo: () => undefined,
    aoIrParaPagina: () => undefined,
    ...sobrescrita,
  };
  document.body.innerHTML = renderToStaticMarkup(<TabelaDeLojas {...props} />);
  return document;
}

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("a lista de lojas na tela", () => {
  it("@spec:AC-206 @principle:P-011 cobre carregando, vazio, erro e sucesso, cada um com o papel de acessibilidade certo", () => {
    const carregando = desenhar({ estado: { fase: "carregando" } });
    expect(carregando.querySelector('[role="status"]')?.textContent).toContain(
      "Carregando lojas",
    );

    const vazio = desenhar({
      estado: { fase: "pronta", lista: { ...LISTA, lojas: [], total: 0 } },
      termo: "nada-a-ver",
    });
    expect(vazio.body.textContent).toContain("Nenhuma loja encontrada");
    expect(vazio.body.textContent).toContain("Confira o nome");
    expect(
      vazio.querySelector('a[href="/admin/lojas/nova"]')?.textContent,
    ).toContain("Cadastrar loja");

    const erro = desenhar({
      estado: { fase: "erro", mensagem: MENSAGEM_DE_SESSAO },
    });
    const alerta = erro.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain("A lista não carregou");
    expect(alerta?.textContent).toContain(MENSAGEM_DE_SESSAO);
    expect(alerta?.querySelector("button")?.textContent).toContain(
      "Tentar de novo",
    );

    const sucesso = desenhar();
    expect(sucesso.querySelector("table")).not.toBeNull();
    expect(sucesso.querySelector('[role="status"]')?.textContent).toContain(
      "27 lojas encontradas",
    );
  });

  it("@spec:AC-206 cada linha mostra código, nome com o caminho até a ficha, tipo de negócio, situação e data de cadastro", () => {
    const pagina = desenhar();
    const linhas = [...pagina.querySelectorAll("tbody tr")];
    expect(linhas).toHaveLength(2);

    const primeira = linhas[0];
    expect(primeira?.textContent).toContain("0003");
    expect(primeira?.textContent).toContain("Moda Boa Vista");
    expect(primeira?.textContent).toContain("Roupas");
    expect(primeira?.textContent).toContain("Suspensa");
    expect(primeira?.textContent).toContain("05/01/2026");
    expect(primeira?.textContent).toContain("São Paulo/SP");
    expect(primeira?.querySelector("a")?.getAttribute("href")).toBe(
      "/admin/lojas/3a3c3d4e-0000-4000-8000-000000000003",
    );

    expect(linhas[1]?.textContent).toContain("Ativa");
    expect(linhas[1]?.textContent).toContain("/l/pastel-da-joi");

    // 27 lojas em páginas de 25: a segunda página existe.
    const paginacao = pagina.querySelector(
      'nav[aria-label="Páginas da lista"]',
    );
    expect(paginacao?.textContent).toContain("Página 1 de 2");
  });

  it("@spec:AC-206 a data de cadastro é lida no fuso de Brasília, e o endereço da consulta leva a busca digitada", () => {
    expect(dataDeCadastro("2026-01-06T01:30:00.000Z")).toBe("05/01/2026");
    expect(enderecoDaLista({ busca: "", pagina: 1 })).toBe(
      "/api/admin/lojas?pagina=1",
    );
    expect(enderecoDaLista({ busca: " 11.222.333/0001-81 ", pagina: 2 })).toBe(
      "/api/admin/lojas?pagina=2&busca=11.222.333%2F0001-81",
    );
  });

  it("@spec:AC-206 a tela pede a lista ao abrir e repete a consulta com o que a pessoa digitou ao buscar", async () => {
    const chamadas = simularApi(() => ({ status: 200, corpo: LISTA }));
    const tela = montar(<ListaLojas />);
    await esperar();

    expect(chamadas.map((chamada) => chamada.url)).toEqual([
      "/api/admin/lojas?pagina=1",
    ]);
    expect(tela.querySelector("table")).not.toBeNull();

    digitar(exigir<HTMLInputElement>(tela, "#busca-de-lojas"), "pastel");
    await enviar(exigir<HTMLFormElement>(tela, 'form[role="search"]'));

    expect(chamadas.at(-1)?.url).toBe("/api/admin/lojas?pagina=1&busca=pastel");
  });

  it("@spec:AC-206 sessão sem acesso vira o estado de erro com a frase que explica, e não uma lista vazia", async () => {
    simularApi(() => ({ status: 403, corpo: { erro: "acesso_negado" } }));
    const tela = montar(<ListaLojas />);
    await esperar();

    expect(tela.querySelector("table")).toBeNull();
    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      MENSAGEM_DE_SESSAO,
    );
  });
});
