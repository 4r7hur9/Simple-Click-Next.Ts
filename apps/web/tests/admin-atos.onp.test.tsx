// @vitest-environment jsdom
/**
 * Atos sensíveis da administração, do lado da tela (card #113, T-11301).
 *
 * Provas de REGRESSÃO escritas antes do retoque visual, verdes contra o
 * código de hoje: o que a reforma não pode afrouxar. O ato de verdade (e a
 * linha na trilha) está provado contra o banco nos testes de API
 * (`apps/api/tests/admin-gestao.test.ts`, `admin-situacao.test.ts`); aqui se
 * prova o que a TELA faz: primeiro clique sem rede, motivo, nome da loja,
 * e o endereço, o método e o corpo enviados por cada um dos oito atos.
 */
import type { FichaDaLojaNoContrato } from "@simpleclick/contracts";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AcoesLoja } from "../src/features/admin/AcoesLoja.tsx";
import { AtosDeAprovacao } from "../src/features/admin/AtosDeAprovacao.tsx";
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
const NOME = "Pastel da Joi";

const FICHA: FichaDaLojaNoContrato = {
  id: LOJA_ID,
  codigo: "0007",
  nome: NOME,
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

const SUSPENSA: FichaDaLojaNoContrato = {
  ...FICHA,
  status: "INACTIVE",
  suspensao: { desde: "2026-10-01T12:30:00.000Z", motivo: "Atraso" },
};

const EXCLUIDA: FichaDaLojaNoContrato = {
  ...FICHA,
  status: "DELETED",
  retencao: {
    excluidaEm: "2026-10-03T12:00:00.000Z",
    removerApos: "2026-11-02T12:00:00.000Z",
  },
};

const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});

beforeEach(() => {
  showModal.mockClear();
  // O jsdom não implementa a janela modal nativa: a prova usa um dublê que
  // conta as aberturas por showModal().
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

function atos(status: "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE" | "REJECTED") {
  const chamadas = simularApi(() => ({ status: 200, corpo: FICHA }));
  const aoMudar = vi.fn();
  const tela = montar(
    <AtosDeAprovacao
      loja={{ id: LOJA_ID, nome: NOME, status }}
      aoMudar={aoMudar}
    />,
  );
  return { chamadas, aoMudar, tela };
}

describe("atos de aprovação: confirmação antes de enviar", () => {
  const CASOS = [
    ["PENDING_APPROVAL", "Aprovar", "Confirmar aprovação", "aprovar", {}],
    ["INACTIVE", "Ativar loja", "Confirmar ativação", "ativar", {}],
    ["ACTIVE", "Desativar loja", "Confirmar desativação", "desativar", {}],
  ] as const;

  it.each(CASOS)(
    "[CA-5] @spec:AC-11311 %s: o botão abre a janela com showModal() e nada sai antes do segundo clique",
    async (status, abrir, confirmar, ato, corpo) => {
      const { chamadas, tela } = atos(status);

      clicar(botao(tela, abrir));
      await esperar();
      expect(showModal).toHaveBeenCalledTimes(1);
      expect(tela.textContent).toContain("registrada na auditoria");
      expect(chamadas).toEqual([]);

      clicar(botao(tela, confirmar));
      await esperar();
      expect(chamadas).toEqual([
        {
          url: `/api/admin/lojas/${LOJA_ID}/${ato}`,
          metodo: "POST",
          corpo,
        },
      ]);
    },
  );

  it("[CA-5] @spec:AC-11312 recusar sem motivo não envia e mostra o aviso; com motivo envia o motivo", async () => {
    const { chamadas, tela } = atos("PENDING_APPROVAL");

    clicar(botao(tela, "Recusar"));
    await esperar();
    clicar(botao(tela, "Confirmar recusa"));
    await esperar();
    expect(chamadas).toEqual([]);
    expect(tela.querySelector('[role="alert"]')).not.toBeNull();

    digitar(
      exigir<HTMLTextAreaElement>(tela, "textarea"),
      "O CNPJ não confere com a razão social.",
    );
    clicar(botao(tela, "Confirmar recusa"));
    await esperar();
    expect(chamadas).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}/recusar`,
        metodo: "POST",
        corpo: { motivo: "O CNPJ não confere com a razão social." },
      },
    ]);
  });

  it("[CA-5] @spec:AC-11314 desativar com motivo envia o motivo; sem motivo envia corpo vazio", async () => {
    const { chamadas, tela } = atos("ACTIVE");
    clicar(botao(tela, "Desativar loja"));
    await esperar();
    digitar(exigir<HTMLTextAreaElement>(tela, "textarea"), "Pedido do dono");
    clicar(botao(tela, "Confirmar desativação"));
    await esperar();
    expect(chamadas[0]?.corpo).toEqual({ motivo: "Pedido do dono" });
  });
});

describe("atos da situação: suspender, reativar, excluir e restaurar", () => {
  function acoes(ficha: FichaDaLojaNoContrato) {
    const chamadas = simularApi(() => ({ status: 200, corpo: ficha }));
    const tela = montar(
      <AcoesLoja
        ficha={ficha}
        aoMudar={() => undefined}
        agora={() => new Date("2026-10-10T12:00:00.000Z")}
      />,
    );
    return { chamadas, tela };
  }

  it("[CA-5] @spec:AC-11312 suspender sem motivo não envia nem pede confirmação; com motivo mostra o passo e só envia no confirmar", async () => {
    const { chamadas, tela } = acoes(FICHA);
    const formulario = exigir<HTMLFormElement>(
      tela,
      'form[aria-label="Suspensão da loja"]',
    );

    await enviar(formulario);
    expect(chamadas).toEqual([]);
    expect(tela.textContent).not.toContain("Confirmar a suspensão");

    digitar(exigir<HTMLTextAreaElement>(tela, "textarea"), "Mensalidade");
    await enviar(formulario);
    expect(chamadas).toEqual([]);
    expect(tela.textContent).toContain("Confirmar a suspensão");

    clicar(botao(tela, "Confirmar a suspensão"));
    await esperar();
    expect(chamadas).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}/suspensao`,
        metodo: "PUT",
        corpo: { motivo: "Mensalidade" },
      },
    ]);
  });

  it("[CA-5] @spec:AC-11311 reativar: primeiro clique sem rede; confirmar envia PUT sem corpo útil", async () => {
    const { chamadas, tela } = acoes(SUSPENSA);
    clicar(botao(tela, "Reativar loja"));
    await esperar();
    expect(chamadas).toEqual([]);
    clicar(botao(tela, "Confirmar a reativação"));
    await esperar();
    expect(chamadas).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}/reativacao`,
        metodo: "PUT",
        corpo: {},
      },
    ]);
  });

  it("[CA-5] @spec:AC-11314 restaurar: primeiro clique sem rede; confirmar envia PUT", async () => {
    const { chamadas, tela } = acoes(EXCLUIDA);
    clicar(botao(tela, "Restaurar loja"));
    await esperar();
    expect(chamadas).toEqual([]);
    clicar(botao(tela, "Confirmar a restauração"));
    await esperar();
    expect(chamadas).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}/restauracao`,
        metodo: "PUT",
        corpo: {},
      },
    ]);
  });

  it("[CA-5] @spec:AC-11313 excluir com nome quase igual não envia, nem por clique nem por Enter; com o nome exato envia DELETE com a confirmação", async () => {
    const { chamadas, tela } = acoes(FICHA);
    clicar(botao(tela, "Excluir loja…"));
    await esperar();
    const campo = exigir<HTMLInputElement>(
      tela,
      "#ficha-confirmacao-da-exclusao",
    );
    const confirmar = botao(tela, "Excluir a loja");
    expect(confirmar.disabled).toBe(true);

    for (const quase of ["pastel da joi", `${NOME}!`, "Pastel da", ""]) {
      digitar(campo, quase);
      expect(confirmar.disabled).toBe(true);
      clicar(confirmar);
      act(() => {
        for (const tipo of ["keydown", "keypress", "keyup"]) {
          campo.dispatchEvent(
            new KeyboardEvent(tipo, { key: "Enter", bubbles: true }),
          );
        }
      });
      await esperar();
      expect(chamadas).toEqual([]);
    }

    digitar(campo, `  ${NOME}  `);
    expect(confirmar.disabled).toBe(false);
    clicar(confirmar);
    await esperar();
    expect(chamadas).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}`,
        metodo: "DELETE",
        corpo: { confirmacao: `  ${NOME}  ` },
      },
    ]);
  });
});
