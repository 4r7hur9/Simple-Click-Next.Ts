// @vitest-environment jsdom
/**
 * Recusas da administração por motivo (card #12, T-2): 403 `aceite_pendente`
 * e `acesso_negado` mostram o motivo real; 401 e os outros 403 mantêm a frase
 * de sessão de cada tela.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AtosDeAprovacao } from "../src/features/admin/AtosDeAprovacao.tsx";
import {
  FuncionalidadesDaLoja,
  MENSAGEM_DE_SESSAO_DAS_FUNCIONALIDADES,
} from "../src/features/admin/FuncionalidadesDaLoja.tsx";
import {
  HistoricoDeAuditoria,
  MENSAGEM_DE_SESSAO as SESSAO_DA_AUDITORIA,
} from "../src/features/admin/HistoricoDeAuditoria.tsx";
import {
  ListaLojas,
  MENSAGEM_DE_SESSAO as SESSAO_DA_LISTA,
} from "../src/features/admin/ListaLojas.tsx";
import { MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO } from "../src/features/admin/apresentacao.ts";
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

const parametros = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => parametros,
}));

const LOJA_ID = "5c1d0e2f-0000-4000-8000-000000000001";
const PEDIR_LIBERACAO =
  "Se continuar, peça a liberação a quem administra o SimpleClick.";
const MENSAGEM_CRUA = "Texto cru da API que não pode aparecer.";

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
  vi.unstubAllGlobals();
});

function pendente(...documentos: string[]) {
  return {
    erro: "aceite_pendente",
    mensagem: MENSAGEM_CRUA,
    pendentes: documentos.map((documento) => ({ documento })),
  };
}

async function aprovarCom(status: number, corpo: unknown) {
  simularApi(() => ({ status, corpo }));
  const tela = montar(
    <AtosDeAprovacao
      loja={{ id: LOJA_ID, nome: "Pastel", status: "PENDING_APPROVAL" }}
      aoMudar={() => {}}
    />,
  );
  clicar(botao(tela, "Aprovar"));
  await esperar();
  clicar(botao(tela, "Confirmar aprovação"));
  await esperar();
  return tela.textContent ?? "";
}

describe("atos: aceite pendente", () => {
  it("[CA-4] com 2 documentos, nomeia os dois e manda aceitar na janela", async () => {
    const texto = await aprovarCom(
      403,
      pendente("TERMS_OF_USE", "PRIVACY_POLICY"),
    );
    expect(texto).toContain(
      "Falta aceitar a versão nova de: Termos de Uso e Política de Privacidade. Aceite na janela “Atualizamos nossos termos”, que abriu por cima, e confirme de novo.",
    );
    expect(texto).not.toContain(MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO);
    expect(texto).not.toContain(MENSAGEM_CRUA);
  });

  it("[CA-4] com 3 documentos, lista com vírgula e 'e'", async () => {
    const texto = await aprovarCom(
      403,
      pendente("TERMS_OF_USE", "PRIVACY_POLICY", "MERCHANT_TERMS"),
    );
    expect(texto).toContain(
      "de: Termos de Uso, Política de Privacidade e Termos do Lojista.",
    );
  });

  it("[CA-4] código desconhecido e 'toString' são ignorados", async () => {
    const texto = await aprovarCom(
      403,
      pendente("TERMS_OF_USE", "XYZ", "toString"),
    );
    expect(texto).toContain("versão nova de: Termos de Uso. Aceite");
    expect(texto).not.toContain("XYZ");
    expect(texto).not.toContain("toString");
  });

  it("[CA-4] sem documento válido, a frase genérica não diz que a janela abriu", async () => {
    const texto = await aprovarCom(403, pendente("toString"));
    expect(texto).toContain(
      "Falta aceitar a versão nova dos termos. Aceite e confirme de novo.",
    );
    expect(texto).not.toContain("que abriu por cima");
    expect(texto).not.toContain(MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO);
  });
});

describe("funcionalidade (PUT)", () => {
  async function desligarCom(status: number, corpo: unknown) {
    const lista = {
      loja: { id: LOJA_ID, nome: "Pastel" },
      funcionalidades: [
        {
          chave: "auto_print",
          rotulo: "Impressão térmica",
          descricao: "Cupom.",
          temEfeito: true,
          ligada: true,
          limite: null,
          excecao: null,
        },
      ],
    };
    simularApi((c) =>
      c.metodo === "PUT" ? { status, corpo } : { status: 200, corpo: lista },
    );
    const tela = montar(<FuncionalidadesDaLoja lojaId={LOJA_ID} />);
    await esperar();
    clicar(botao(tela, "Desligar impressão térmica"));
    digitar(exigir<HTMLInputElement>(tela, "#motivo-auto_print"), "Sem papel");
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    return tela.textContent ?? "";
  }

  it("[CA-4] aceite pendente mostra os documentos, nunca a frase crua", async () => {
    const texto = await desligarCom(403, pendente("TERMS_OF_USE"));
    expect(texto).toContain("Falta aceitar a versão nova de: Termos de Uso.");
    expect(texto).not.toContain(MENSAGEM_CRUA);
  });

  it("[CA-5] acesso negado mostra a sessão mais a próxima ação", async () => {
    const texto = await desligarCom(403, {
      erro: "acesso_negado",
      mensagem: MENSAGEM_CRUA,
    });
    expect(texto).toContain(
      `${MENSAGEM_DE_SESSAO_DAS_FUNCIONALIDADES} ${PEDIR_LIBERACAO}`,
    );
    expect(texto).not.toContain(MENSAGEM_CRUA);
  });

  it("[CA-6] 401 mostra só a frase de sessão", async () => {
    const texto = await desligarCom(401, { mensagem: MENSAGEM_CRUA });
    expect(texto).toContain(MENSAGEM_DE_SESSAO_DAS_FUNCIONALIDADES);
    expect(texto).not.toContain(PEDIR_LIBERACAO);
    expect(texto).not.toContain(MENSAGEM_CRUA);
  });
});

describe("atos: acesso negado e outros motivos", () => {
  it("[CA-5] acesso_negado soma a próxima ação", async () => {
    const texto = await aprovarCom(403, { erro: "acesso_negado" });
    expect(texto).toContain(
      `${MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO} ${PEDIR_LIBERACAO}`,
    );
  });

  it("[CA-6] 403 sem código conhecido e 401 ficam só com a sessão", async () => {
    for (const [status, corpo] of [
      [403, { erro: "outra_coisa", mensagem: MENSAGEM_CRUA }],
      [403, null],
      [401, { erro: "acesso_negado" }],
    ] as const) {
      const texto = await aprovarCom(status, corpo);
      expect(texto).toContain(MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO);
      expect(texto).not.toContain(PEDIR_LIBERACAO);
      expect(texto).not.toContain(MENSAGEM_CRUA);
      desmontar();
    }
  });
});

describe("leituras", () => {
  it.each([
    ["lista", <ListaLojas key="l" />, SESSAO_DA_LISTA],
    ["auditoria", <HistoricoDeAuditoria key="a" />, SESSAO_DA_AUDITORIA],
  ])(
    "[CA-5] %s: acesso_negado soma a próxima ação",
    async (_n, tela, sessao) => {
      simularApi(() => ({ status: 403, corpo: { erro: "acesso_negado" } }));
      const raiz = montar(tela);
      await esperar();
      expect(raiz.querySelector('[role="alert"]')?.textContent).toContain(
        `${sessao} ${PEDIR_LIBERACAO}`,
      );
    },
  );

  it.each([
    ["lista", <ListaLojas key="l" />, SESSAO_DA_LISTA],
    ["auditoria", <HistoricoDeAuditoria key="a" />, SESSAO_DA_AUDITORIA],
  ])(
    "[CA-6] %s: 401 e 403 sem código ficam só com a sessão",
    async (_n, tela, sessao) => {
      simularApi(() => ({ status: 401, corpo: {} }));
      const raiz = montar(tela);
      await esperar();
      const texto = raiz.querySelector('[role="alert"]')?.textContent ?? "";
      expect(texto).toContain(sessao);
      expect(texto).not.toContain(PEDIR_LIBERACAO);
    },
  );
});
