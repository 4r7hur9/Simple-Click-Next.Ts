// @vitest-environment jsdom
/**
 * Prova da janela de acesso da loja (card #23): abre por
 * `abrirJanelaDeAcesso` ou por link `data-abre-acesso`, troca entre entrar e
 * criar conta e, ao concluir, fecha, atualiza a página e chama `aoEntrar`.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  botao,
  clicar,
  desmontar,
  digitar,
  enviar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

const navegacao = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: navegacao.refresh,
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import {
  EVENTO_ACESSO_CONCLUIDO,
  JanelaDeAcesso,
  abrirJanelaDeAcesso,
} from "../src/features/auth/JanelaDeAcesso.tsx";

beforeEach(() => navegacao.refresh.mockReset());
afterEach(desmontar);

function janela(tela: HTMLElement): HTMLDialogElement {
  return exigir<HTMLDialogElement>(tela, "dialog");
}

describe("janela de acesso", () => {
  it("abre em Entrar e, ao entrar, fecha, atualiza a página e chama aoEntrar", async () => {
    const chamadas = simularApi(() => ({
      status: 200,
      corpo: {
        status: "SESSAO_CRIADA",
        redirecionarPara: "/conta/pedidos",
      },
    }));
    const tela = montar(<JanelaDeAcesso />);
    expect(janela(tela).open).toBe(false);

    const aoEntrar = vi.fn();
    const concluido = vi.fn();
    window.addEventListener(EVENTO_ACESSO_CONCLUIDO, concluido);
    act(() =>
      abrirJanelaDeAcesso({
        aoEntrar,
        motivo: "Para finalizar o pedido, entre.",
      }),
    );

    expect(janela(tela).open).toBe(true);
    expect(tela.textContent).toContain("Para finalizar o pedido, entre.");
    expect(exigir(tela, '[role="tab"][aria-selected="true"]').textContent).toBe(
      "Entrar",
    );

    digitar(exigir(tela, "#janela-entrar-email"), "ana@exemplo.com");
    digitar(exigir(tela, "#janela-entrar-senha"), "uma frase longa da ana");
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(chamadas[0]?.url).toBe("/api/auth/login");
    expect(janela(tela).open).toBe(false);
    expect(navegacao.refresh).toHaveBeenCalled();
    expect(aoEntrar).toHaveBeenCalledWith({ novaConta: false });
    expect(concluido).toHaveBeenCalled();
    window.removeEventListener(EVENTO_ACESSO_CONCLUIDO, concluido);
  });

  it("a aba Criar conta cria a conta já logada, sem sair da página", async () => {
    const chamadas = simularApi(() => ({
      status: 201,
      corpo: {
        status: "SESSAO_CRIADA",
        redirecionarPara: "/conta/pedidos",
      },
    }));
    const tela = montar(<JanelaDeAcesso />);
    const aoEntrar = vi.fn();
    act(() => abrirJanelaDeAcesso({ aoEntrar }));
    clicar(botao(tela, "Criar conta"));

    digitar(exigir(tela, "#janela-cadastro-nome"), "Ana Souza");
    digitar(exigir(tela, "#janela-cadastro-email"), "ana@exemplo.com");
    digitar(exigir(tela, "#janela-cadastro-telefone"), "11 91234-5678");
    digitar(
      exigir(tela, "#janela-cadastro-senha"),
      "Cacto azul sob a lua 2026!",
    );
    // Sem o aceite dos termos a conta não é criada (card #79).
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    expect(chamadas).toHaveLength(0);
    expect(tela.textContent).toContain("aceite os Termos de Uso");
    clicar(exigir(tela, "#janela-cadastro-aceite"));
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(chamadas[0]?.url).toBe("/api/auth/cadastro");
    expect(chamadas[0]?.corpo).toMatchObject({ aceitouTermos: true });
    expect(janela(tela).open).toBe(false);
    expect(aoEntrar).toHaveBeenCalledWith({ novaConta: true });
  });

  it("erro de login fica na janela, com mensagem que não diz qual campo falhou", async () => {
    simularApi(() => ({
      status: 401,
      corpo: { erro: "credenciais_invalidas" },
    }));
    const tela = montar(<JanelaDeAcesso />);
    const aoEntrar = vi.fn();
    act(() => abrirJanelaDeAcesso({ aoEntrar }));
    digitar(exigir(tela, "#janela-entrar-email"), "ana@exemplo.com");
    digitar(exigir(tela, "#janela-entrar-senha"), "errada errada errada");
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(janela(tela).open).toBe(true);
    expect(tela.textContent).toContain("E-mail ou senha incorretos.");
    expect(aoEntrar).not.toHaveBeenCalled();
  });

  it("link com data-abre-acesso abre a janela na aba pedida", () => {
    const tela = montar(
      <>
        <a href="/cadastrar" data-abre-acesso="criar">
          Criar conta
        </a>
        <JanelaDeAcesso />
      </>,
    );
    clicar(exigir(tela, "a[data-abre-acesso]"));
    expect(janela(tela).open).toBe(true);
    expect(exigir(tela, '[role="tab"][aria-selected="true"]').textContent).toBe(
      "Criar conta",
    );
  });

  it("o botão fechar fecha a janela", () => {
    const tela = montar(<JanelaDeAcesso />);
    act(() => abrirJanelaDeAcesso());
    clicar(botao(tela, "Fechar"));
    expect(janela(tela).open).toBe(false);
  });
});
