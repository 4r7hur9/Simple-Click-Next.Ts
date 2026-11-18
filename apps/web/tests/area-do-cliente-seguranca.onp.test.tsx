// @vitest-environment jsdom
/**
 * Segurança, privacidade e aplicativo autenticador (card #111, AC-11115 a
 * AC-11118, AC-11121, AC-11130). Prova as MENSAGENS e o comportamento da tela;
 * que ninguém encerra a conexão de outra pessoa (AC-11118) depende da política
 * do banco e ainda não tem teste de API com duas contas.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import {
  ExcluirConta,
  SessoesAbertas,
  TrocarSenha,
} from "../src/features/conta/SegurancaDaConta";
import { ExportarMeusDados } from "../src/features/conta/PrivacidadeDaConta";
import { AtivacaoDoAplicativo } from "../src/app/(conta)/conta/seguranca/aplicativo/AtivacaoDoAplicativo";
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
} from "./apoio-config";

afterEach(() => {
  desmontar();
  localStorage.clear();
  sessionStorage.clear();
});

describe("trocar a senha (AC-11117)", () => {
  it("[CA-17] @spec:AC-11117 diz 'em até 15 minutos' e não promete encerramento imediato", async () => {
    simularApi(() => ({ status: 200, corpo: {} }));
    const raiz = montar(<TrocarSenha />);
    digitar(
      exigir<HTMLInputElement>(raiz, "#senha-atual"),
      "senha-antiga-1234",
    );
    digitar(
      exigir<HTMLInputElement>(raiz, "#senha-nova"),
      "uma-senha-nova-bem-longa-9",
    );
    await enviar(
      exigir<HTMLFormElement>(raiz, 'form[aria-label="Trocar senha"]'),
    );
    expect(raiz.textContent).toContain("em até 15 minutos");
    expect(raiz.textContent).not.toMatch(/foram desconectados|imediat/i);
    expect(raiz.textContent).toContain("este continua conectado");
  });
});

const SESSAO = {
  id: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
  tipo: "navegador" as const,
  atual: false,
  iniciadaEm: "2026-09-20T10:00:00.000Z",
  ultimoAcessoEm: "2026-09-21T10:00:00.000Z",
};
const ESTA = {
  ...SESSAO,
  id: "6b5c4d3e-2f10-4b0c-9d8e-7f6a5b4c3d2e",
  atual: true,
};

describe("conexões abertas (AC-11118)", () => {
  it("[CA-18] @spec:AC-11118 a conexão atual não tem botão de encerrar", () => {
    const raiz = montar(<SessoesAbertas inicial={[ESTA, SESSAO]} />);
    expect(raiz.querySelectorAll("button")).toHaveLength(1);
    expect(exigir(raiz, `[data-sessao="${ESTA.id}"]`).textContent).toContain(
      "Este aparelho",
    );
  });

  it("[CA-18] @spec:AC-11118 se a API disser 'não encontrada', a lista não muda e um aviso aparece", async () => {
    const chamadas = simularApi(() => ({
      status: 404,
      corpo: { erro: "nao_encontrada" },
    }));
    const raiz = montar(<SessoesAbertas inicial={[ESTA, SESSAO]} />);
    clicar(botao(raiz, "Encerrar"));
    await esperar();
    expect(chamadas[0]).toMatchObject({
      url: `/api/conta/sessoes/${SESSAO.id}`,
      metodo: "DELETE",
    });
    expect(raiz.querySelectorAll("[data-sessao]")).toHaveLength(2);
    expect(raiz.textContent).toContain(
      "Não foi possível encerrar essa conexão",
    );
  });

  it("[CA-30] @spec:AC-11130 encerrar mostra a espera e não aceita clique duplo", async () => {
    let solta: (() => void) | undefined;
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      chamadas.push(url);
      return new Promise<Response>((resolver) => {
        solta = () => resolver(new Response(null, { status: 204 }));
      });
    });
    const raiz = montar(<SessoesAbertas inicial={[ESTA, SESSAO]} />);
    const alvo = botao(raiz, "Encerrar");
    clicar(alvo);
    clicar(alvo);
    expect(alvo.getAttribute("aria-busy")).toBe("true");
    expect(chamadas).toHaveLength(1);
    await act(async () => {
      solta?.();
    });
    await esperar();
    expect(raiz.querySelectorAll("[data-sessao]")).toHaveLength(1);
  });
});

describe("exportar e excluir (AC-11115)", () => {
  it("[CA-15] @spec:AC-11115 exportar pede a senha e explica senha incorreta e limite de pedidos", async () => {
    simularApi(() => ({ status: 403, corpo: { erro: "senha_incorreta" } }));
    const raiz = montar(<ExportarMeusDados />);
    clicar(botao(raiz, "Baixar meus dados"));
    const baixar = exigir<HTMLButtonElement>(raiz, 'button[type="submit"]');
    expect(baixar.disabled).toBe(true);
    digitar(exigir<HTMLInputElement>(raiz, "#exportar-senha"), "errada");
    await enviar(
      exigir<HTMLFormElement>(raiz, 'form[aria-label="Baixar meus dados"]'),
    );
    expect(raiz.textContent).toContain("A senha está incorreta.");
    desmontar();

    simularApi(() => ({ status: 429, corpo: { erro: "muitas_exportacoes" } }));
    const outra = montar(<ExportarMeusDados />);
    clicar(botao(outra, "Baixar meus dados"));
    digitar(exigir<HTMLInputElement>(outra, "#exportar-senha"), "certa");
    await enviar(
      exigir<HTMLFormElement>(outra, 'form[aria-label="Baixar meus dados"]'),
    );
    expect(outra.textContent).toContain("Tente de novo em uma hora");
  });

  it("[CA-15] @spec:AC-11115 excluir exige a senha e a palavra EXCLUIR", () => {
    const raiz = montar(<ExcluirConta sairDepois={async () => {}} />);
    clicar(botao(raiz, "Excluir minha conta"));
    const enviarBotao = botao(raiz, "Excluir para sempre");
    expect(enviarBotao.disabled).toBe(true);
    digitar(
      exigir<HTMLInputElement>(raiz, "#confirmar-excluir-conta"),
      "minha-senha",
    );
    expect(enviarBotao.disabled).toBe(true);
    digitar(
      exigir<HTMLInputElement>(raiz, "#palavra-excluir-conta"),
      "excluir",
    );
    expect(enviarBotao.disabled).toBe(true);
    digitar(
      exigir<HTMLInputElement>(raiz, "#palavra-excluir-conta"),
      "EXCLUIR",
    );
    expect(enviarBotao.disabled).toBe(false);
  });

  it.each([
    ["senha_incorreta", "A senha está incorreta."],
    ["tem_loja", "Você é dono de uma loja."],
    ["e_administrador", "Contas da administração não são excluídas por aqui."],
  ])(
    "[CA-15] @spec:AC-11115 a recusa %s é explicada e a pessoa não sai",
    async (erro, trecho) => {
      simularApi(() => ({ status: 409, corpo: { erro } }));
      const sair = vi.fn(async () => {});
      const raiz = montar(<ExcluirConta sairDepois={sair} />);
      clicar(botao(raiz, "Excluir minha conta"));
      digitar(
        exigir<HTMLInputElement>(raiz, "#confirmar-excluir-conta"),
        "minha-senha",
      );
      digitar(
        exigir<HTMLInputElement>(raiz, "#palavra-excluir-conta"),
        "EXCLUIR",
      );
      await enviar(
        exigir<HTMLFormElement>(raiz, 'form[aria-label="excluir-conta"]'),
      );
      expect(raiz.textContent).toContain(trecho);
      expect(sair).not.toHaveBeenCalled();
    },
  );

  it("[CA-15] @spec:AC-11115 depois de excluir, a sessão local é encerrada", async () => {
    simularApi(() => ({ status: 204 }));
    const sair = vi.fn(async () => {});
    const raiz = montar(<ExcluirConta sairDepois={sair} />);
    clicar(botao(raiz, "Excluir minha conta"));
    digitar(
      exigir<HTMLInputElement>(raiz, "#confirmar-excluir-conta"),
      "minha-senha",
    );
    digitar(
      exigir<HTMLInputElement>(raiz, "#palavra-excluir-conta"),
      "EXCLUIR",
    );
    await enviar(
      exigir<HTMLFormElement>(raiz, 'form[aria-label="excluir-conta"]'),
    );
    expect(sair).toHaveBeenCalledOnce();
  });
});

describe("aplicativo autenticador (AC-11121)", () => {
  const SEGREDO = "JBSWY3DPEHPK3PXP";

  function api() {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/preparar")) {
        return Response.json({
          segredo: SEGREDO,
          uriDoAplicativo: `otpauth://totp/x?secret=${SEGREDO}`,
        });
      }
      return Response.json({
        codigosDeRecuperacao: ["ABCD-1234", "EFGH-5678"],
      });
    });
  }

  it("[CA-21] @spec:AC-11121 chave e códigos não vão para endereço, título nem armazenamento", async () => {
    api();
    const raiz = montar(<AtivacaoDoAplicativo />);
    await esperar();
    digitar(
      exigir<HTMLInputElement>(
        raiz,
        'input[inputmode="numeric"], input[name="codigo"], input[type="text"]',
      ),
      "123456",
    );
    await enviar(exigir<HTMLFormElement>(raiz, "form"));
    expect(raiz.textContent).toContain("ABCD-1234");
    const guardado =
      JSON.stringify({ ...localStorage }) +
      JSON.stringify({ ...sessionStorage });
    expect(guardado).not.toContain(SEGREDO);
    expect(guardado).not.toContain("ABCD-1234");
    expect(window.location.href).not.toContain("ABCD");
    expect(window.location.href).not.toContain(SEGREDO);
    expect(document.title).not.toContain(SEGREDO);
  });

  it("[CA-21] @spec:AC-11121 ao voltar pelo histórico do navegador, os códigos não reaparecem", async () => {
    api();
    const raiz = montar(<AtivacaoDoAplicativo />);
    await esperar();
    digitar(
      exigir<HTMLInputElement>(
        raiz,
        'input[inputmode="numeric"], input[name="codigo"], input[type="text"]',
      ),
      "123456",
    );
    await enviar(exigir<HTMLFormElement>(raiz, "form"));
    expect(raiz.textContent).toContain("ABCD-1234");
    await act(async () => {
      const evento = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(evento, "persisted", { value: true });
      window.dispatchEvent(evento);
    });
    await esperar();
    expect(raiz.textContent).not.toContain("ABCD-1234");
  });
});
