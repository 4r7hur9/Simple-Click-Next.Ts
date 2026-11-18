// @vitest-environment jsdom
/**
 * O tom de cada ato sensível (card #113, T-11306), conforme a tabela
 * ato → passos → tom do design.md (seção 5): só recusar e excluir usam o
 * tom de perigo no botão de confirmar; todos têm nome e consequência em
 * TEXTO, então a diferença não depende só da cor.
 */
import type { FichaDaLojaNoContrato } from "@simpleclick/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AcoesLoja,
  consequenciasDoAto,
} from "../src/features/admin/AcoesLoja.tsx";
import {
  AtosDeAprovacao,
  consequenciasDoAtoDeAprovacao,
} from "../src/features/admin/AtosDeAprovacao.tsx";
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

const LOJA_ID = "5c1d0e2f-0000-4000-8000-000000000001";

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

const tom = (elemento: Element) =>
  [...elemento.classList].find((c) => c.startsWith("sc-botao--")) ?? "";

describe("atos de aprovação", () => {
  const CASOS = [
    [
      "PENDING_APPROVAL",
      "Aprovar",
      "Confirmar aprovação",
      "aprovar",
      "primaria",
    ],
    ["PENDING_APPROVAL", "Recusar", "Confirmar recusa", "recusar", "perigo"],
    ["INACTIVE", "Ativar loja", "Confirmar ativação", "ativar", "primaria"],
    [
      "ACTIVE",
      "Desativar loja",
      "Confirmar desativação",
      "desativar",
      "primaria",
    ],
  ] as const;

  it.each(CASOS)(
    "[CA-6] @spec:AC-11315 %s · %s: confirmar com tom %s, nome do ato no título e a consequência em texto",
    async (status, abrir, confirmar, ato, tomEsperado) => {
      simularApi(() => ({ status: 200, corpo: FICHA }));
      const tela = montar(
        <AtosDeAprovacao
          loja={{ id: LOJA_ID, nome: FICHA.nome, status }}
          aoMudar={() => undefined}
        />,
      );
      clicar(botao(tela, abrir));
      await esperar();
      expect(tom(botao(tela, confirmar))).toBe(`sc-botao--${tomEsperado}`);
      const titulo = exigir(tela, "dialog h2").textContent ?? "";
      expect(titulo).toMatch(
        /^(Aprovar|Recusar|Ativar|Desativar) Pastel da Joi\?$/,
      );
      for (const consequencia of consequenciasDoAtoDeAprovacao(ato, status)) {
        expect(tela.textContent).toContain(consequencia);
      }
    },
  );

  it("[CA-6] @spec:AC-11315 o botão que abre a janela nunca usa o tom de perigo: o perigo fica no confirmar", () => {
    for (const status of [
      "PENDING_APPROVAL",
      "ACTIVE",
      "INACTIVE",
      "REJECTED",
    ] as const) {
      simularApi(() => ({ status: 200, corpo: FICHA }));
      const tela = montar(
        <AtosDeAprovacao
          loja={{ id: LOJA_ID, nome: FICHA.nome, status }}
          aoMudar={() => undefined}
        />,
      );
      for (const b of tela.querySelectorAll("button")) {
        expect(tom(b), `${status}: ${b.textContent}`).not.toBe(
          "sc-botao--perigo",
        );
      }
      desmontar();
    }
  });
});

describe("atos da situação", () => {
  it("[CA-6] @spec:AC-11315 excluir usa perigo para abrir e para confirmar; suspender, reativar e restaurar usam o tom comum", async () => {
    simularApi(() => ({ status: 200, corpo: FICHA }));
    const ativa = montar(
      <AcoesLoja
        ficha={FICHA}
        aoMudar={() => undefined}
        agora={() => new Date("2026-10-10T12:00:00.000Z")}
      />,
    );
    expect(tom(botao(ativa, "Suspender loja"))).toBe("sc-botao--secundaria");
    expect(tom(botao(ativa, "Excluir loja…"))).toBe("sc-botao--perigo");

    digitar(exigir<HTMLTextAreaElement>(ativa, "textarea"), "Mensalidade");
    await enviar(exigir<HTMLFormElement>(ativa, "form"));
    expect(tom(botao(ativa, "Confirmar a suspensão"))).toBe(
      "sc-botao--primaria",
    );
    for (const c of consequenciasDoAto("suspender")) {
      expect(ativa.textContent).toContain(c);
    }
    expect(ativa.textContent).toContain("Suspender Pastel da Joi?");
    desmontar();

    const excluir = montar(
      <AcoesLoja ficha={FICHA} aoMudar={() => undefined} />,
    );
    clicar(botao(excluir, "Excluir loja…"));
    await esperar();
    expect(tom(botao(excluir, "Excluir a loja"))).toBe("sc-botao--perigo");
    for (const c of consequenciasDoAto("excluir")) {
      expect(excluir.textContent).toContain(c);
    }
    expect(excluir.textContent).toContain("Excluir Pastel da Joi?");
    desmontar();

    const suspensa = montar(
      <AcoesLoja
        ficha={{
          ...FICHA,
          status: "INACTIVE",
          suspensao: { desde: "2026-10-01T12:30:00.000Z", motivo: "Atraso" },
        }}
        aoMudar={() => undefined}
      />,
    );
    clicar(botao(suspensa, "Reativar loja"));
    await esperar();
    expect(tom(botao(suspensa, "Confirmar a reativação"))).toBe(
      "sc-botao--primaria",
    );
    for (const c of consequenciasDoAto("reativar")) {
      expect(suspensa.textContent).toContain(c);
    }
    desmontar();

    const excluida = montar(
      <AcoesLoja
        ficha={{
          ...FICHA,
          status: "DELETED",
          retencao: {
            excluidaEm: "2026-10-03T12:00:00.000Z",
            removerApos: "2026-11-02T12:00:00.000Z",
          },
        }}
        aoMudar={() => undefined}
        agora={() => new Date("2026-10-10T12:00:00.000Z")}
      />,
    );
    clicar(botao(excluida, "Restaurar loja"));
    await esperar();
    expect(tom(botao(excluida, "Confirmar a restauração"))).toBe(
      "sc-botao--primaria",
    );
    for (const c of consequenciasDoAto("restaurar")) {
      expect(excluida.textContent).toContain(c);
    }
  });

  it("[CA-6] @spec:AC-11315 cada consequência de cada ato é um texto não vazio (a diferença não é só de cor)", () => {
    for (const ato of [
      "suspender",
      "reativar",
      "excluir",
      "restaurar",
    ] as const) {
      const textos = consequenciasDoAto(ato);
      expect(textos.length, ato).toBeGreaterThan(0);
      for (const t of textos) expect(t.trim().length).toBeGreaterThan(10);
    }
  });
});
