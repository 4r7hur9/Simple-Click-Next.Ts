// @vitest-environment jsdom
/**
 * Listas da administração com os chips do #104 (card #113, T-11303):
 * lojas, contas e o período das métricas da loja. Os filtros são botões
 * com `aria-pressed` dentro de um grupo com nome; a fila de pendentes chama
 * atenção por tom e por texto; a situação da loja é um selo com o nome por
 * extenso; não há seleção em lote; a consulta continua indo e voltando do
 * endereço.
 */
import type {
  ListaDeLojasNoContrato,
  ListaDePessoasNoContrato,
  SituacaoDaLoja,
} from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NOME_DA_SITUACAO } from "../src/features/admin/apresentacao.ts";
import {
  CONSULTA_INICIAL,
  consultaDoEndereco,
  enderecoDaLista,
  enderecoDaPagina,
  TabelaDeLojas,
  type ConsultaDaLista,
  type TabelaDeLojasProps,
} from "../src/features/admin/ListaLojas.tsx";
import { TabelaDeContas } from "../src/features/admin/ListaDeContas.tsx";
import { MetricasDaLoja } from "../src/features/admin/MetricasDaLoja.tsx";
import {
  clicar,
  desmontar,
  esperar,
  montar,
  simularApi,
} from "./apoio-config.tsx";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/lojas",
  useSearchParams: () => new URLSearchParams(),
}));

const LOJA_ID = "3a3c3d4e-0000-4000-8000-000000000001";
const SITUACOES: readonly SituacaoDaLoja[] = [
  "PENDING_APPROVAL",
  "ACTIVE",
  "INACTIVE",
  "REJECTED",
  "DELETED",
];

const LISTA: ListaDeLojasNoContrato = {
  lojas: SITUACOES.map((status, i) => ({
    id: `3a3c3d4e-0000-4000-8000-00000000010${i}`,
    codigo: `010${i}`,
    nome: `Loja ${status}`,
    apelido: `loja-${i}`,
    tipoDeNegocio: { codigo: "FOOD_SNACK", nome: "Lanchonete" },
    status,
    cidade: null,
    uf: null,
    criadaEm: "2026-10-16T12:00:00.000Z",
    dono: null,
    pedidos: 0,
    faturamentoCentavos: 0,
  })),
  total: 5,
  pagina: 1,
  porPagina: 25,
  contagens: {
    todas: 27,
    PENDING_APPROVAL: 3,
    ACTIVE: 20,
    INACTIVE: 3,
    REJECTED: 1,
  },
};

function lojas(sobrescrita: Partial<TabelaDeLojasProps> = {}): HTMLElement {
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
  return document.body;
}

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("chips de filtro das listas", () => {
  it("[CA-7] @spec:AC-11318 a lista de lojas filtra por chips de botão, em grupo com nome, com a contagem de cada um", () => {
    const pagina = lojas();
    const grupo = pagina.querySelector(
      '[role="group"][aria-label="Filtrar por situação"]',
    );
    expect(grupo).not.toBeNull();
    const chips = [...(grupo?.querySelectorAll(".sc-chip") ?? [])];
    expect(chips.map((c) => c.tagName)).toEqual(Array(4).fill("BUTTON"));
    // Filtro é botão, nunca link: com href o Link pré-carregaria a busca.
    expect(grupo?.querySelectorAll("a, [href]")).toHaveLength(0);
    expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    const contagens = chips.map(
      (c) => c.querySelector(".sc-chip__contagem")?.textContent,
    );
    expect(contagens).toEqual(["27", "20", "3", "1"]);
  });

  it("[CA-7] @spec:AC-11318 todo chip fica na ordem do Tab (nenhum desabilitado nem com tabindex negativo)", () => {
    const chips = [...lojas().querySelectorAll<HTMLButtonElement>(".sc-chip")];
    expect(chips.length).toBe(4);
    for (const chip of chips) {
      expect(chip.disabled).toBe(false);
      expect(chip.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it("[CA-7] @spec:AC-11318 a fila de pendentes não é chip de Lojas: o aviso leva à tela Aprovações", () => {
    const pagina = lojas();
    const textos = [...pagina.querySelectorAll(".sc-chip")].map(
      (c) => c.textContent,
    );
    expect(textos.join(" ")).not.toContain("esperam por você");
    const ver = [...pagina.querySelectorAll("a")].find(
      (a) => a.textContent === "Ver pendentes",
    );
    expect(ver?.getAttribute("href")).toBe("/admin/aprovacoes");
  });

  it("[CA-7] @spec:AC-11318 a lista de pessoas filtra por tipo e por situação em chips de botão, em grupos com nome", () => {
    const lista: ListaDePessoasNoContrato = {
      pessoas: [],
      total: 0,
      pagina: 1,
      porPagina: 25,
      contagens: { todas: 12, clientes: 3, donos: 7, equipe: 2 },
    };
    document.body.innerHTML = renderToStaticMarkup(
      <TabelaDeContas
        consulta={{
          tipo: "donos",
          situacao: "ativas",
          busca: "",
          pagina: 1,
        }}
        termo=""
        estado={{ fase: "pronta", lista }}
        aoMudarTermo={() => undefined}
        aoBuscar={() => undefined}
        aoMudarTipo={() => undefined}
        aoMudarSituacao={() => undefined}
        aoTentarDeNovo={() => undefined}
        aoIrParaPagina={() => undefined}
      />,
    );
    const grupo = document.querySelector(
      '[role="group"][aria-label="Tipo de pessoa"]',
    );
    const chips = [...(grupo?.querySelectorAll("button.sc-chip") ?? [])];
    expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    expect(
      chips.map((c) => c.querySelector(".sc-chip__contagem")?.textContent),
    ).toEqual(["12", "3", "7", "2"]);
    expect(grupo?.querySelectorAll("[href]")).toHaveLength(0);
    const situacao = document.querySelector(
      '[role="group"][aria-label="Situação da conta"]',
    );
    expect(
      [...(situacao?.querySelectorAll("button.sc-chip") ?? [])].map((c) =>
        c.getAttribute("aria-pressed"),
      ),
    ).toEqual(["true", "false", "false"]);
  });

  it("[CA-7] @spec:AC-11318 o período das métricas da loja são chips; escolher outro muda o marcado", async () => {
    simularApi(() => ({ status: 403, corpo: { erro: "recusado" } }));
    const tela = montar(<MetricasDaLoja lojaId={LOJA_ID} />);
    await esperar();
    const grupo = tela.querySelector(
      '[role="group"][aria-label="Período do faturamento e dos pedidos"]',
    );
    expect(grupo).not.toBeNull();
    const chips = [
      ...(grupo?.querySelectorAll<HTMLButtonElement>("button.sc-chip") ?? []),
    ];
    expect(chips.length).toBeGreaterThan(1);
    expect(
      chips.filter((c) => c.getAttribute("aria-pressed") === "true"),
    ).toHaveLength(1);
    const outro = chips.find((c) => c.getAttribute("aria-pressed") === "false");
    clicar(outro as HTMLButtonElement);
    await esperar();
    expect(outro?.getAttribute("aria-pressed")).toBe("true");
    expect(
      [...(grupo?.querySelectorAll("button.sc-chip") ?? [])].filter(
        (c) => c.getAttribute("aria-pressed") === "true",
      ),
    ).toHaveLength(1);
  });
});

describe("lista de lojas: estados, selo e consulta", () => {
  it("[CA-7] @spec:AC-11317 os quatro estados aparecem com as peças comuns e o texto de hoje", () => {
    expect(
      lojas({ estado: { fase: "carregando" } }).querySelector('[role="status"]')
        ?.textContent,
    ).toContain("Carregando lojas");
    expect(
      lojas({ estado: { fase: "erro", mensagem: "Falhou" } }).querySelector(
        '[role="alert"]',
      )?.textContent,
    ).toContain("A lista não carregou");
    expect(
      lojas({
        estado: { fase: "pronta", lista: { ...LISTA, lojas: [], total: 0 } },
      }).textContent,
    ).toContain("Cadastrar loja");
    expect(lojas().querySelector("table")).not.toBeNull();
  });

  it("[CA-7] @spec:AC-11321 a situação aparece num selo com o nome por extenso, nas cinco situações", () => {
    const corpo = lojas();
    for (const status of SITUACOES) {
      const linha = [...corpo.querySelectorAll("tbody tr")].find((l) =>
        l.textContent?.includes(`Loja ${status}`),
      );
      expect(linha, status).toBeDefined();
      const selo = linha?.querySelector(".sc-selo");
      expect(selo?.textContent, status).toBe(NOME_DA_SITUACAO[status]);
    }
  });

  it("[CA-7] @spec:AC-11316 a lista não tem seleção em lote", () => {
    const corpo = lojas();
    expect(corpo.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(corpo.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
    const texto = corpo.textContent ?? "";
    expect(texto).not.toMatch(
      /Selecionar tudo|Aprovar selecionadas|Excluir selecionadas/i,
    );
  });

  it("[CA-7] @spec:AC-11318 busca, situação, tipo, ordem e página vão e voltam do endereço", () => {
    const consulta: ConsultaDaLista = {
      busca: "pastel",
      situacao: "PENDING_APPROVAL",
      tipo: "FOOD_SNACK",
      ordem: CONSULTA_INICIAL.ordem,
      pagina: 3,
    };
    const aoIda = enderecoDaPagina(consulta);
    const url = new URL(aoIda, "https://exemplo.test");
    expect(consultaDoEndereco(url.searchParams)).toEqual(consulta);
    expect(enderecoDaLista({ busca: "pastel", pagina: 3 })).toBe(
      "/api/admin/lojas?pagina=3&busca=pastel",
    );
  });
});
