// @vitest-environment jsdom
/**
 * Cadastro de dono (card #28): duas etapas, endereço da loja conferido e
 * conta + loja criadas em sequência; a loja nasce aguardando aprovação.
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CadastroDeDonoForm } from "../src/features/auth/CadastroDeDonoForm.tsx";
import {
  apelidoDigitado,
  apelidoDoNome,
  problemaDoApelido,
} from "../src/features/auth/endereco-da-loja.ts";
import { respostaDaLoja } from "../src/features/auth/respostas-de-acesso.ts";
import {
  clicar,
  desmontar,
  digitar,
  enviar,
  exigir,
  montar,
} from "./apoio-config.tsx";

afterEach(() => desmontar());

/** Deixa passar a espera da conferência do endereço (400 ms) e a resposta. */
async function esperarAConferencia(): Promise<void> {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 500));
  });
}

const TIPOS = [{ codigo: "FOOD_SNACK", nome: "Lanchonete" }];

function formulario(tela: HTMLElement): HTMLFormElement {
  return exigir<HTMLFormElement>(tela, "form");
}

async function passarPelaEtapaUm(tela: HTMLElement) {
  digitar(exigir(tela, "#dono-nome"), "Paulo Souza");
  digitar(exigir(tela, "#dono-email"), "paulo@exemplo.com");
  digitar(exigir(tela, "#dono-telefone"), "11 91234-5678");
  digitar(exigir(tela, "#dono-senha"), "Uma frase longa do Paulo 2026");
  clicar(exigir(tela, "#dono-aceite"));
  await enviar(formulario(tela));
}

describe("endereço da loja", () => {
  it("sai do nome, sem acento e com hífen", () => {
    expect(apelidoDoNome("Açaí do Zé & Cia")).toBe("acai-do-ze-cia");
    expect(apelidoDigitado("Minha Loja")).toBe("minha-loja");
    expect(problemaDoApelido("ab")).not.toBeNull();
    expect(problemaDoApelido("minha-loja")).toBeNull();
  });

  it("traduz a resposta de abrir loja", () => {
    expect(
      respostaDaLoja(201, { loja: { apelido: "x-y", status: "PENDING_APPROVAL" } }),
    ).toEqual({ status: "CRIADA", apelido: "x-y" });
    expect(
      respostaDaLoja(409, { erro: "apelido_em_uso", sugestao: "x-2" }),
    ).toMatchObject({ status: "APELIDO_EM_USO", sugestao: "x-2" });
    expect(respostaDaLoja(409, { erro: "limite_atingido" }).status).toBe(
      "LIMITE",
    );
    expect(respostaDaLoja(401, {}).status).toBe("SEM_SESSAO");
  });
});

describe("cadastro de dono", () => {
  it("confere a etapa 1 antes de seguir", async () => {
    const aoCadastrar = vi.fn();
    const tela = montar(
      <CadastroDeDonoForm
        tipos={TIPOS}
        aoCadastrar={aoCadastrar}
        aoAbrirLoja={vi.fn()}
        aoConcluir={vi.fn()}
      />,
    );
    await enviar(formulario(tela));
    expect(tela.textContent).toContain("Informe seu nome.");
    expect(aoCadastrar).not.toHaveBeenCalled();
  });

  it("cria a conta e a loja e vai para o painel", async () => {
    const aoCadastrar = vi.fn(async () => ({
      status: "SESSAO_CRIADA" as const,
      redirecionarPara: "/conta/pedidos",
    }));
    const aoAbrirLoja = vi.fn(async () => ({
      status: "CRIADA" as const,
      apelido: "lanches-do-paulo",
    }));
    const aoConcluir = vi.fn();
    const tela = montar(
      <CadastroDeDonoForm
        tipos={TIPOS}
        aoCadastrar={aoCadastrar}
        aoAbrirLoja={aoAbrirLoja}
        aoConcluir={aoConcluir}
        consultar={async () => ({ estado: "livre" })}
      />,
    );
    await passarPelaEtapaUm(tela);
    digitar(exigir(tela, "#dono-loja-nome"), "Lanches do Paulo");
    clicar(exigir(tela, "#dono-aceite-lojista"));
    digitar(exigir(tela, "#dono-tipo"), "FOOD_SNACK");
    expect(exigir<HTMLInputElement>(tela, "#dono-apelido").value).toBe(
      "lanches-do-paulo",
    );
    await esperarAConferencia();
    expect(tela.textContent).toContain("Endereço livre.");
    await enviar(formulario(tela));

    expect(aoCadastrar).toHaveBeenCalledWith(
      expect.objectContaining({ email: "paulo@exemplo.com", telefone: "+5511912345678" }),
    );
    expect(aoAbrirLoja).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: "Lanches do Paulo",
        tipoDeNegocio: "FOOD_SNACK",
        apelido: "lanches-do-paulo",
      }),
    );
    expect(aoConcluir).toHaveBeenCalledWith("/painel");
  });

  it("endereço em uso não cria a conta e oferece a sugestão", async () => {
    const aoCadastrar = vi.fn();
    const tela = montar(
      <CadastroDeDonoForm
        tipos={TIPOS}
        aoCadastrar={aoCadastrar}
        aoAbrirLoja={vi.fn()}
        aoConcluir={vi.fn()}
        consultar={async () => ({ estado: "ocupado", sugestao: "lanches-2" })}
      />,
    );
    await passarPelaEtapaUm(tela);
    digitar(exigir(tela, "#dono-loja-nome"), "Lanches");
    clicar(exigir(tela, "#dono-aceite-lojista"));
    digitar(exigir(tela, "#dono-tipo"), "FOOD_SNACK");
    await esperarAConferencia();
    expect(tela.textContent).toContain("lanches-2");
    await enviar(formulario(tela));
    expect(aoCadastrar).not.toHaveBeenCalled();
    expect(tela.textContent).toContain("Este endereço já está em uso.");
  });

  it("se a conta nasceu e a loja falhou, tentar de novo só reenvia a loja", async () => {
    const aoCadastrar = vi.fn(async () => ({
      status: "SESSAO_CRIADA" as const,
      redirecionarPara: "/conta/pedidos",
    }));
    const aoAbrirLoja = vi
      .fn()
      .mockResolvedValueOnce({ status: "INDISPONIVEL", mensagem: "Falhou." })
      .mockResolvedValueOnce({ status: "CRIADA", apelido: "lojinha" });
    const aoConcluir = vi.fn();
    const tela = montar(
      <CadastroDeDonoForm
        tipos={TIPOS}
        aoCadastrar={aoCadastrar}
        aoAbrirLoja={aoAbrirLoja}
        aoConcluir={aoConcluir}
        consultar={async () => ({ estado: "livre" })}
      />,
    );
    await passarPelaEtapaUm(tela);
    digitar(exigir(tela, "#dono-loja-nome"), "Lojinha");
    clicar(exigir(tela, "#dono-aceite-lojista"));
    digitar(exigir(tela, "#dono-tipo"), "FOOD_SNACK");
    await esperarAConferencia();
    expect(tela.textContent).toContain("Endereço livre.");
    await enviar(formulario(tela));
    expect(tela.textContent).toContain("Falhou.");
    await enviar(formulario(tela));
    expect(aoCadastrar).toHaveBeenCalledTimes(1);
    expect(aoAbrirLoja).toHaveBeenCalledTimes(2);
    expect(aoConcluir).toHaveBeenCalledWith("/painel");
  });
});
