// @vitest-environment jsdom
/**
 * Dado pessoal nas telas da administração (card #113, T-11304). Segue o
 * inventário do design.md (seção 4): cada tela mostra só os campos pessoais
 * que já mostrava, e o termo buscado não vai para título, link nem mensagem.
 *
 * Os valores de exemplo são únicos e marcados, e a conferência olha o HTML
 * inteiro (atributos incluídos), não só o texto visível.
 */
import type {
  ListaDeContasNoContrato,
  ListaDeLojasNoContrato,
} from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  CONSULTA_INICIAL,
  TabelaDeLojas,
  type TabelaDeLojasProps,
} from "../src/features/admin/ListaLojas.tsx";
import { TabelaDeContas } from "../src/features/admin/ListaDeContas.tsx";

const EMAIL = "marca-email-unico@exemplo.test";
const TELEFONE = "+5511955550123";
const CNPJ = "11.222.333/0001-81";
const CNPJ_PURO = "11222333000181";
const TERMO = "marina-busca@exemplo.test";

const CONTAS: ListaDeContasNoContrato = {
  contas: [
    {
      identidadeId: "9a9b9c9d-0000-4000-8000-000000000001",
      nome: "Bia Torres",
      email: EMAIL,
      telefone: TELEFONE,
      criadaEm: "2026-10-16T12:00:00.000Z",
      tipo: "DONO",
      lojas: [],
      pendentes: 0,
      lojasEmUso: 0,
      limiteDeLojas: 2,
    },
  ],
  total: 1,
  pagina: 1,
  porPagina: 25,
  contagens: { donos: 1, equipe: 0 },
};

const LOJAS: ListaDeLojasNoContrato = {
  lojas: [
    {
      id: "3a3c3d4e-0000-4000-8000-000000000003",
      codigo: "0003",
      nome: "Moda Boa Vista",
      apelido: "moda-boa-vista",
      tipoDeNegocio: { codigo: "APPAREL", nome: "Roupas" },
      status: "ACTIVE",
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
  ],
  total: 1,
  pagina: 1,
  porPagina: 25,
  contagens: {
    todas: 1,
    PENDING_APPROVAL: 0,
    ACTIVE: 1,
    INACTIVE: 0,
    REJECTED: 0,
  },
};

function html(elemento: React.ReactElement): string {
  return renderToStaticMarkup(elemento);
}

function lojas(sobrescrita: Partial<TabelaDeLojasProps> = {}): string {
  return html(
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
      {...sobrescrita}
    />,
  );
}

function contas(
  estado: Parameters<typeof TabelaDeContas>[0]["estado"],
  termo = "",
): string {
  return html(
    <TabelaDeContas
      consulta={{ tipo: "donos", busca: termo, pagina: 1 }}
      termo={termo}
      estado={estado}
      aoMudarTermo={() => undefined}
      aoBuscar={() => undefined}
      aoMudarTipo={() => undefined}
      aoTentarDeNovo={() => undefined}
      aoIrParaPagina={() => undefined}
    />,
  );
}

/** O que a tela escreve fora do campo de busca, onde o termo do próprio usuário mora. */
function semOCampoDeBusca(marcacao: string): string {
  return marcacao.replace(/<input[^>]*>/g, "");
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("inventário de dado pessoal por tela", () => {
  it("[CA-8] @spec:AC-11305 a lista de contas mostra o e-mail e não o telefone; nenhum documento", () => {
    const marcacao = contas({ fase: "pronta", lista: CONTAS });
    expect(marcacao).toContain(EMAIL);
    expect(marcacao).not.toContain(TELEFONE);
    expect(marcacao).not.toContain("11955550123");
    expect(marcacao).not.toContain(CNPJ);
    expect(marcacao).not.toContain(CNPJ_PURO);
  });

  it("[CA-8] @spec:AC-11305 a lista de lojas mostra o nome do dono e nenhum e-mail, telefone nem documento", () => {
    // O exemplo do campo de busca (placeholder) não é dado de ninguém.
    const marcacao = semOCampoDeBusca(lojas());
    expect(marcacao).toContain("Ricardo Lima");
    expect(marcacao).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
    expect(marcacao).not.toMatch(/\+55\d{10,11}|\(\d{2}\)\s?\d{4,5}-\d{4}/);
    expect(marcacao).not.toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14}/);
  });
});

describe("o termo buscado não vai para título, link nem mensagem", () => {
  it.each([
    [
      "lojas: vazio",
      () =>
        lojas({
          termo: TERMO,
          consulta: { ...CONSULTA_INICIAL, busca: TERMO },
          estado: {
            fase: "pronta",
            lista: { ...LOJAS, lojas: [], total: 0 },
          },
        }),
    ],
    [
      "lojas: erro",
      () =>
        lojas({
          termo: TERMO,
          consulta: { ...CONSULTA_INICIAL, busca: TERMO },
          estado: { fase: "erro", mensagem: "Não foi possível carregar." },
        }),
    ],
    [
      "lojas: resultado",
      () =>
        lojas({
          termo: TERMO,
          consulta: { ...CONSULTA_INICIAL, busca: TERMO },
        }),
    ],
    [
      "contas: vazio",
      () =>
        contas(
          {
            fase: "pronta",
            lista: { ...CONTAS, contas: [], total: 0 },
          },
          TERMO,
        ),
    ],
    [
      "contas: erro",
      () =>
        contas({ fase: "erro", mensagem: "Não foi possível carregar." }, TERMO),
    ],
  ])("[CA-8] @spec:AC-11306 %s", (_nome, desenhar) => {
    const marcacao = desenhar();
    const fora = semOCampoDeBusca(marcacao);
    expect(fora).not.toContain(TERMO);
    expect(fora).not.toContain(encodeURIComponent(TERMO));
    expect(fora).not.toMatch(/title="[^"]*marina/i);
    // Nenhum link leva a termo digitado: nem interno nem para fora do site.
    expect(fora).not.toMatch(/href="[^"]*marina/i);
    expect(fora).not.toMatch(/href="https?:/);
    expect(document.title).not.toContain("marina");
  });
});
