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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONSULTA_INICIAL,
  consultaDoEndereco,
  dataDeCadastro,
  enderecoDaLista,
  enderecoDaPagina,
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

const substituir = vi.fn();
const atualizar = vi.fn();
let enderecoAtual = "";
let parametrosEm = "";
let parametros = new URLSearchParams();

// A lista lê e escreve a consulta no endereço da página: aqui o roteador é de
// mentira, e o teste confere para onde ele foi mandado.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: substituir, refresh: atualizar }),
  // O mesmo objeto enquanto o endereço não muda, como o roteador de verdade:
  // um novo a cada desenho refaria a consulta sem parar.
  useSearchParams: () => {
    if (parametrosEm !== enderecoAtual) {
      parametrosEm = enderecoAtual;
      parametros = new URLSearchParams(enderecoAtual);
    }
    return parametros;
  },
}));

const CONTAGENS = {
  todas: 27,
  PENDING_APPROVAL: 3,
  ACTIVE: 20,
  INACTIVE: 3,
  REJECTED: 1,
};

const LISTA: ListaDeLojasNoContrato = {
  lojas: [
    {
      id: "3a3c3d4e-0000-4000-8000-000000000003",
      codigo: "0003",
      nome: "Moda Boa Vista",
      apelido: "moda-boa-vista",
      tipoDeNegocio: { codigo: "APPAREL", nome: "Roupas" },
      status: "INACTIVE",
      cidade: "São Paulo",
      uf: "SP",
      criadaEm: "2026-01-05T12:00:00.000Z",
      dono: {
        identidadeId: "9a9b9c9d-0000-4000-8000-000000000001",
        nome: "Ricardo Lima",
      },
      pedidos: 18,
      faturamentoCentavos: 305840,
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
      dono: null,
      pedidos: 0,
      faturamentoCentavos: 0,
    },
    {
      id: "3a3c3d4e-0000-4000-8000-000000000009",
      codigo: "0009",
      nome: "Doceria da Bia",
      apelido: "doceria-da-bia",
      tipoDeNegocio: { codigo: "FOOD_SNACK", nome: "Lanchonete" },
      status: "PENDING_APPROVAL",
      cidade: null,
      uf: null,
      criadaEm: "2026-10-16T12:00:00.000Z",
      dono: null,
      pedidos: 0,
      faturamentoCentavos: 0,
    },
  ],
  total: 27,
  pagina: 1,
  porPagina: 25,
  contagens: CONTAGENS,
};

function desenhar(sobrescrita: Partial<TabelaDeLojasProps> = {}): Document {
  const props: TabelaDeLojasProps = {
    consulta: CONSULTA_INICIAL,
    termo: "",
    tipos: [{ codigo: "FOOD_SNACK", nome: "Lanchonete" }],
    aoMudarFiltro: () => undefined,
    aoMudarLoja: () => undefined,
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
  substituir.mockReset();
  atualizar.mockReset();
  enderecoAtual = "";
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
      consulta: { ...CONSULTA_INICIAL, busca: "nada-a-ver" },
    });
    expect(vazio.body.textContent).toContain("Nenhuma loja encontrada");
    expect(vazio.body.textContent).toContain("confira o nome");
    expect(vazio.body.textContent).toContain("Limpar filtros");

    const semNada = desenhar({
      estado: { fase: "pronta", lista: { ...LISTA, lojas: [], total: 0 } },
    });
    expect(
      semNada.querySelector('a[href="/admin/lojas/nova"]')?.textContent,
    ).toContain("Cadastrar loja");

    const semPendentes = desenhar({
      estado: { fase: "pronta", lista: { ...LISTA, lojas: [], total: 0 } },
      consulta: { ...CONSULTA_INICIAL, situacao: "PENDING_APPROVAL" },
    });
    expect(semPendentes.body.textContent).toContain(
      "Nenhuma loja esperando aprovação",
    );

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
    expect(linhas).toHaveLength(3);

    const primeira = linhas[0];
    expect(primeira?.textContent).toContain("0003");
    expect(primeira?.textContent).toContain("Moda Boa Vista");
    expect(primeira?.textContent).toContain("Roupas");
    expect(primeira?.textContent).toContain("Inativa");
    expect(primeira?.textContent).toContain("Ricardo Lima");
    // O e-mail do dono mora na conta, não na lista (P-009).
    expect(primeira?.textContent).not.toContain("@");
    expect(primeira?.textContent).toContain("18");
    expect(primeira?.textContent).toMatch(/R\$\s?3\.058,40/);
    expect(primeira?.textContent).toContain("05/01/2026");
    expect(primeira?.textContent).toContain("São Paulo/SP");
    expect(primeira?.querySelector("a")?.getAttribute("href")).toBe(
      "/admin/lojas/3a3c3d4e-0000-4000-8000-000000000003",
    );

    expect(linhas[1]?.textContent).toContain("Ativa");
    expect(linhas[1]?.textContent).toContain("/loja/pastel-da-joi");
    expect(linhas[1]?.textContent).toContain("Sem dono");

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

  it("card #29 as pílulas mostram quantas lojas há em cada situação, e a fila de aprovação chama atenção", () => {
    const pagina = desenhar();
    const filtros = pagina.querySelector(
      '[role="group"][aria-label="Filtrar por situação"]',
    );
    const texto = filtros?.textContent ?? "";
    for (const rotulo of [
      "Todas",
      "Pendentes de aprovação",
      "Ativas",
      "Inativas",
      "Recusadas",
    ]) {
      expect(texto).toContain(rotulo);
    }
    expect(texto).toContain("27");
    expect(texto).toContain("3");
    expect(
      filtros?.querySelector('button[aria-pressed="true"]')?.textContent,
    ).toContain("Todas");
    // Com lojas na fila e outro filtro, um aviso leva direto a elas.
    expect(pagina.body.textContent).toContain(
      "3 lojas esperam a sua aprovação",
    );
    expect(pagina.body.textContent).toContain("Ver pendentes");

    const naFila = desenhar({
      consulta: { ...CONSULTA_INICIAL, situacao: "PENDING_APPROVAL" },
    });
    expect(naFila.body.textContent).not.toContain("esperam a sua aprovação");
    expect(
      naFila.querySelector('button[aria-pressed="true"]')?.textContent,
    ).toContain("Pendentes de aprovação");
  });

  it("card #29 só a loja pendente tem Aprovar e Recusar na linha; as outras têm Abrir", () => {
    const linhas = [...desenhar().querySelectorAll("tbody tr")];
    const rotulos = (linha: Element | undefined) =>
      [
        ...(linha?.querySelectorAll("td:last-child button, td:last-child a") ??
          []),
      ].map((item) => item.textContent?.trim());
    expect(rotulos(linhas[2])).toEqual(["Aprovar", "Recusar"]);
    expect(rotulos(linhas[0])).toEqual(["Abrir"]);
  });

  it("card #29 a consulta vai e volta do endereço da página: só o que difere do padrão aparece", () => {
    expect(enderecoDaPagina(CONSULTA_INICIAL)).toBe("/admin/lojas");
    const consulta = consultaDoEndereco(
      new URLSearchParams(
        "situacao=PENDING_APPROVAL&tipo=FOOD_SNACK&ordem=faturamento&busca=bia&pagina=2",
      ),
    );
    expect(consulta).toEqual({
      situacao: "PENDING_APPROVAL",
      tipo: "FOOD_SNACK",
      ordem: "faturamento",
      busca: "bia",
      pagina: 2,
    });
    expect(enderecoDaPagina(consulta)).toBe(
      "/admin/lojas?situacao=PENDING_APPROVAL&tipo=FOOD_SNACK&ordem=faturamento&busca=bia&pagina=2",
    );
    // Valor desconhecido no endereço não vira filtro.
    expect(
      consultaDoEndereco(
        new URLSearchParams("situacao=DELETED&ordem=x&pagina=-4"),
      ),
    ).toEqual(CONSULTA_INICIAL);
    expect(enderecoDaLista(consulta)).toBe(
      "/api/admin/lojas?pagina=2&busca=bia&situacao=PENDING_APPROVAL&tipo=FOOD_SNACK&ordem=faturamento",
    );
  });

  it("@spec:AC-206 a tela lê a consulta do endereço, pede a lista e, ao buscar, manda a busca digitada para o endereço", async () => {
    enderecoAtual = "situacao=ACTIVE";
    const chamadas = simularApi((chamada) =>
      chamada.url === "/api/admin/tipos-de-negocio"
        ? { status: 200, corpo: { tipos: [] } }
        : { status: 200, corpo: LISTA },
    );
    const tela = montar(<ListaLojas />);
    await esperar();

    expect(chamadas.map((chamada) => chamada.url)).toContain(
      "/api/admin/lojas?pagina=1&situacao=ACTIVE",
    );
    expect(tela.querySelector("table")).not.toBeNull();

    digitar(exigir<HTMLInputElement>(tela, "#busca-de-lojas"), "pastel");
    await enviar(exigir<HTMLFormElement>(tela, 'form[role="search"]'));

    expect(substituir).toHaveBeenCalledWith(
      "/admin/lojas?situacao=ACTIVE&busca=pastel",
      { scroll: false },
    );
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
