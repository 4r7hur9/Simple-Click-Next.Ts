// @vitest-environment jsdom
/**
 * Nomes e selos cortados na administração (card #6). O jsdom não calcula
 * layout, então a prova tem duas metades: a marcação das listas principais
 * traz o nome completo e o selo ao lado dele, e a folha do modo administração
 * traz as regras que impedem o corte (selo que não encolhe, texto que quebra).
 */
import { readFileSync } from "node:fs";

import type {
  ListaDeLojasNoContrato,
  ListaDePessoasNoContrato,
} from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TabelaDeContas } from "../src/features/admin/ListaDeContas.tsx";
import {
  CONSULTA_INICIAL,
  TabelaDeLojas,
} from "../src/features/admin/ListaLojas.tsx";

const NOME_DA_LOJA = "Casa de Carnes e Frios Bom Pastor da Vila Mariana Ltda";
const NOME_DA_PESSOA = "Maria Aparecida Fernandes de Albuquerque Montenegro";
const EMAIL = "maria.aparecida.fernandes.albuquerque.montenegro@exemplo-longo.test";

const LOJAS: ListaDeLojasNoContrato = {
  lojas: [
    {
      id: "3a3c3d4e-0000-4000-8000-000000000003",
      codigo: "0003",
      nome: NOME_DA_LOJA,
      apelido: "casa-de-carnes-e-frios-bom-pastor-da-vila-mariana",
      tipoDeNegocio: { codigo: "FOOD", nome: "Alimentação" },
      status: "PENDING_APPROVAL",
      cidade: "São Paulo",
      uf: "SP",
      criadaEm: "2026-01-05T12:00:00.000Z",
      dono: {
        identidadeId: "9a9b9c9d-0000-4000-8000-000000000001",
        nome: NOME_DA_PESSOA,
      },
      pedidos: 18,
      faturamentoCentavos: 305840,
    },
  ],
  total: 1,
  pagina: 1,
  porPagina: 25,
  contagens: {
    todas: 1,
    PENDING_APPROVAL: 1,
    ACTIVE: 0,
    INACTIVE: 0,
    REJECTED: 0,
  },
};

const CONTAS: ListaDePessoasNoContrato = {
  pessoas: [
    {
      identidadeId: "9a9b9c9d-0000-4000-8000-000000000001",
      nome: NOME_DA_PESSOA,
      email: EMAIL,
      criadaEm: "2026-10-16T12:00:00.000Z",
      desativada: false,
      temSenha: false,
      donoDeLojas: 1,
      equipeDeLojas: 0,
      protegida: false,
    },
  ],
  total: 1,
  pagina: 1,
  porPagina: 25,
  contagens: { todas: 1, clientes: 0, donos: 1, equipe: 0 },
};

const CSS = readFileSync(
  `${process.cwd()}/packages/ui/styles/administracao-da-plataforma.css`,
  "utf8",
);

function lojas(): string {
  return renderToStaticMarkup(
    <TabelaDeLojas
      consulta={CONSULTA_INICIAL}
      termo=""
      tipos={[]}
      aoMudarFiltro={() => undefined}
      aoMudarLoja={() => undefined}
      estado={{ fase: "pronta", lista: LOJAS }}
      aoMudarTermo={() => undefined}
      aoBuscar={() => undefined}
      aoTentarDeNovo={() => undefined}
      aoIrParaPagina={() => undefined}
    />,
  );
}

function contas(): string {
  return renderToStaticMarkup(
    <TabelaDeContas
      consulta={{ tipo: "donos", situacao: "ativas", busca: "", pagina: 1 }}
      termo=""
      estado={{ fase: "pronta", lista: CONTAS }}
      aoMudarTermo={() => undefined}
      aoBuscar={() => undefined}
      aoMudarTipo={() => undefined}
      aoMudarSituacao={() => undefined}
      aoTentarDeNovo={() => undefined}
      aoIrParaPagina={() => undefined}
    />,
  );
}

describe("textos longos na administração", () => {
  it("a lista de lojas mostra o nome inteiro, o dono e o selo da situação", () => {
    const marcacao = lojas();
    expect(marcacao).toContain(NOME_DA_LOJA);
    expect(marcacao).toContain(NOME_DA_PESSOA);
    expect(marcacao).toMatch(/class="sc-selo sc-selo--[a-z]+"[^>]*>.*Pendente/s);
  });

  it("a lista de contas mostra nome e e-mail inteiros com os selos de tipo e situação", () => {
    const marcacao = contas();
    expect(marcacao).toContain(NOME_DA_PESSOA);
    expect(marcacao).toContain(EMAIL);
    expect(marcacao).toContain("Sem senha ainda");
    expect(marcacao).toContain("sc-selo");
  });

  it("a folha do admin impede o corte: selo não encolhe e texto livre quebra", () => {
    expect(CSS).toMatch(/\.sc-selo[\s\S]*?flex-shrink:\s*0/);
    expect(CSS).toMatch(/white-space:\s*nowrap/);
    expect(CSS).toMatch(/overflow-wrap:\s*anywhere/);
    expect(CSS).toContain(".sc-selo--longo");
  });
});
