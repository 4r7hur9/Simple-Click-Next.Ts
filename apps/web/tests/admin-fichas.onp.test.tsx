// @vitest-environment jsdom
/**
 * Fichas da administração (card #113, T-11304 e T-11305): as cinco abas da
 * loja são páginas com `aria-current`, o cabeçalho mostra nome, situação em
 * selo com texto e o ato disponível, e a ficha da pessoa mostra o contato, os
 * vínculos e o limite de lojas do dono com a mesma regra de edição de hoje.
 */
import type {
  FichaDaLojaNoContrato,
  FichaDaPessoaNoContrato,
  SituacaoDaLoja,
} from "@simpleclick/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AbasDaLoja, ABAS_DA_LOJA } from "../src/features/admin/AbasDaLoja.tsx";
import { NOME_DA_SITUACAO } from "../src/features/admin/apresentacao.ts";
import { CabecalhoDaFicha } from "../src/features/admin/CabecalhoDaFicha.tsx";
import { FichaDaConta } from "../src/features/admin/FichaDaConta.tsx";
import { ProvedorDaFicha } from "../src/features/admin/ProvedorDaFicha.tsx";
import {
  botao,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

const { caminho } = vi.hoisted(() => ({ caminho: { valor: "" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => caminho.valor,
  useSearchParams: () => new URLSearchParams(),
}));

const LOJA_ID = "5c1d0e2f-0000-4000-8000-000000000001";
const DONO_ID = "9a9b9c9d-0000-4000-8000-000000000001";

const FICHA: FichaDaLojaNoContrato = {
  id: LOJA_ID,
  codigo: "0007",
  nome: "Pastel da Joi",
  razaoSocial: null,
  documento: { numero: "11222333000181", tipo: "CNPJ" },
  apelido: "pastel-da-joi",
  status: "ACTIVE",
  tipoDeNegocio: {
    codigo: "FOOD_SNACK",
    nome: "Lanchonete",
    controlaEstoque: false,
  },
  contato: { email: null, telefone: null },
  endereco: {
    cep: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
  },
  criadaEm: "2026-09-01T12:00:00.000Z",
  atualizadaEm: "2026-09-01T12:00:00.000Z",
  suspensao: null,
  retencao: null,
  historico: [],
};

beforeEach(() => {
  caminho.valor = `/admin/lojas/${LOJA_ID}`;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("abas da ficha da loja", () => {
  it("[CA-9] @spec:AC-11320 as cinco abas são links de página e só a atual leva aria-current", () => {
    const esperadas = [
      ["Resumo", `/admin/lojas/${LOJA_ID}`],
      ["Cadastro", `/admin/lojas/${LOJA_ID}/cadastro`],
      ["Contrato e documentos", `/admin/lojas/${LOJA_ID}/documentos`],
      ["Funcionalidades", `/admin/lojas/${LOJA_ID}/funcionalidades`],
      ["Histórico", `/admin/lojas/${LOJA_ID}/historico`],
    ];
    expect(ABAS_DA_LOJA).toHaveLength(5);
    for (const [rotulo, destino] of esperadas) {
      caminho.valor = destino as string;
      const tela = montar(<AbasDaLoja lojaId={LOJA_ID} />);
      const links = [...tela.querySelectorAll("a")];
      expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual(
        esperadas,
      );
      const atuais = links.filter(
        (a) => a.getAttribute("aria-current") === "page",
      );
      expect(atuais.map((a) => a.textContent)).toEqual([rotulo]);
      expect(
        tela.querySelector('nav[aria-label="Seções da loja"]'),
      ).not.toBeNull();
      // Navegação por página: nenhuma aba é role="tab".
      expect(tela.querySelector('[role="tab"], [role="tablist"]')).toBeNull();
      desmontar();
    }
  });
});

describe("cabeçalho da ficha da loja", () => {
  const SITUACOES: readonly SituacaoDaLoja[] = [
    "PENDING_APPROVAL",
    "ACTIVE",
    "INACTIVE",
    "REJECTED",
    "DELETED",
  ];

  it.each(SITUACOES)(
    "[CA-9] @spec:AC-11321 %s: a situação aparece num selo com o nome por extenso, ao lado do nome da loja",
    async (status) => {
      simularApi(() => ({
        status: 200,
        corpo: { ...FICHA, status },
      }));
      const tela = montar(
        <ProvedorDaFicha lojaId={LOJA_ID}>
          <CabecalhoDaFicha />
        </ProvedorDaFicha>,
      );
      await esperar();
      expect(tela.querySelector("h1")?.textContent).toBe("Pastel da Joi");
      const selos = [...tela.querySelectorAll(".sc-selo")].map(
        (s) => s.textContent,
      );
      expect(selos).toContain(NOME_DA_SITUACAO[status]);
      // Nenhum selo de loja verificada: é do card #118.
      expect(tela.textContent).not.toMatch(/verificada/i);
    },
  );

  it("[CA-9] @spec:AC-11320 o cabeçalho oferece o ato da hora (aprovar e recusar na análise; desativar na ativa)", async () => {
    simularApi(() => ({
      status: 200,
      corpo: { ...FICHA, status: "PENDING_APPROVAL" },
    }));
    const analise = montar(
      <ProvedorDaFicha lojaId={LOJA_ID}>
        <CabecalhoDaFicha />
      </ProvedorDaFicha>,
    );
    await esperar();
    expect(botao(analise, "Aprovar")).toBeDefined();
    expect(botao(analise, "Recusar")).toBeDefined();
    desmontar();

    simularApi(() => ({ status: 200, corpo: FICHA }));
    const ativa = montar(
      <ProvedorDaFicha lojaId={LOJA_ID}>
        <CabecalhoDaFicha />
      </ProvedorDaFicha>,
    );
    await esperar();
    expect(botao(ativa, "Desativar loja")).toBeDefined();
  });
});

describe("ficha da conta do dono", () => {
  const CONTA: FichaDaPessoaNoContrato = {
    identidadeId: DONO_ID,
    nome: "Bia Torres",
    email: "bia-unica@exemplo.test",
    telefone: "+5511900001111",
    criadaEm: "2026-10-16T12:00:00.000Z",
    desativada: false,
    desativadaEm: null,
    temSenha: true,
    donoDeLojas: 1,
    equipeDeLojas: 0,
    protegida: false,
    vinculos: [
      {
        lojaId: LOJA_ID,
        nome: "Doceria da Bia",
        apelido: "doceria-da-bia",
        status: "PENDING_APPROVAL",
        papel: "OWNER",
      },
    ],
    pedidos: { total: 0, ultimoEm: null, porLoja: [] },
    historico: [],
  };

  function conta() {
    return simularApi((chamada) => {
      if (chamada.url.endsWith("/api/admin/limites")) {
        return {
          status: 200,
          corpo: {
            lojasPorDono: 3,
            staffPorLoja: 5,
            produtosPorLoja: 500,
            categoriasPorLoja: 50,
            clientesPorLoja: 5000,
          },
        };
      }
      if (chamada.url.includes("/limites")) {
        return {
          status: 200,
          corpo: {
            identidadeId: DONO_ID,
            limite: { recurso: "lojas", limite: 2, uso: 1, restante: 1 },
            ajuste: 2,
          },
        };
      }
      return { status: 200, corpo: CONTA };
    });
  }

  it("[CA-9] @spec:AC-11322 mostra o contato, as lojas da conta e o limite de lojas com o uso atual", async () => {
    conta();
    const tela = montar(<FichaDaConta identidadeId={DONO_ID} />);
    await esperar();
    expect(tela.querySelector("h1")?.textContent).toBe("Bia Torres");
    expect(tela.textContent).toContain("bia-unica@exemplo.test");
    expect(tela.textContent).toContain("+5511900001111");
    expect(tela.textContent).toContain("Doceria da Bia");
    expect(tela.textContent).toContain("Limite de lojas");
    expect(tela.textContent).toContain("Lojas em uso");
    // A situação das lojas da conta também é um selo com o nome por extenso.
    expect(
      [...tela.querySelectorAll(".sc-selo")].map((s) => s.textContent),
    ).toContain(NOME_DA_SITUACAO.PENDING_APPROVAL);
  });

  it("[CA-9] @spec:AC-11322 o limite do dono salva sem pedir confirmação, com a mesma regra e o mesmo corpo de hoje", async () => {
    const chamadas = conta();
    const tela = montar(<FichaDaConta identidadeId={DONO_ID} />);
    await esperar();
    const campo = exigir<HTMLInputElement>(
      tela,
      'form input[type="number"], form input',
    );
    digitar(campo, "4");
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    const gravacoes = chamadas.filter((c) => c.metodo === "PATCH");
    expect(gravacoes).toEqual([
      {
        url: `/api/admin/donos/${DONO_ID}/limites`,
        metodo: "PATCH",
        corpo: { lojas: 4 },
      },
    ]);
    // Sem janela de confirmação no meio do caminho.
    expect(tela.querySelector("dialog[open]")).toBeNull();
  });
});
