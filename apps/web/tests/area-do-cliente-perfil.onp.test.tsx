// @vitest-environment jsdom
/**
 * Dados e endereços da conta (card #111, AC-11113, AC-11114, AC-11130).
 *
 * Prova a TELA. Que cada pessoa só vê e edita os próprios dados e endereços é
 * da API (`apps/api/tests/enderecos-do-cliente.int.test.ts`, e para
 * `PATCH dados` ainda não há teste de API com duas contas: recomendação ao
 * card de segurança).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { DadosDaConta } from "../src/features/conta/DadosDaConta";
import { EnderecosSalvos } from "../src/features/conta/EnderecosSalvos";
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

afterEach(desmontar);

const DADOS = {
  id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  nome: "Ana Paula",
  email: "ana@exemplo.com",
  telefone: "+5519991234567",
  cpf: null,
  aceitaOfertas: false,
  criadaEm: "2026-01-10T12:00:00.000Z",
  temSenha: true,
  aplicativoAutenticador: false,
};

describe("dados (AC-11113)", () => {
  it("[CA-13] @spec:AC-11113 o e-mail aparece fixo, com a explicação de que não muda aqui", () => {
    const raiz = montar(<DadosDaConta inicial={DADOS} />);
    const email = exigir<HTMLInputElement>(raiz, "#dados-email");
    expect(email.value).toBe("ana@exemplo.com");
    expect(email.readOnly || email.disabled).toBe(true);
    expect(raiz.textContent).toContain("não muda por aqui");
  });

  it("[CA-13] @spec:AC-11113 salvar manda só os campos editáveis (nunca o e-mail)", async () => {
    const chamadas = simularApi(() => ({ status: 200, corpo: {} }));
    const raiz = montar(<DadosDaConta inicial={DADOS} />);
    await enviar(
      exigir<HTMLFormElement>(raiz, 'form[aria-label="Meus dados"]'),
    );
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.metodo).toBe("PATCH");
    expect(chamadas[0]?.url).toBe("/api/conta/dados");
    expect(Object.keys(chamadas[0]?.corpo as object).sort()).toEqual([
      "aceitaOfertas",
      "cpf",
      "nome",
      "telefone",
    ]);
    expect(raiz.textContent).toContain("Dados salvos.");
  });

  it("[CA-30] @spec:AC-11130 a falha mostra a saída e não apaga o que a pessoa digitou", async () => {
    simularApi(() => ({ status: 422, corpo: { erro: "cpf_invalido" } }));
    const raiz = montar(<DadosDaConta inicial={DADOS} />);
    digitar(exigir<HTMLInputElement>(raiz, "#dados-nome"), "Ana Paula Souza");
    await enviar(
      exigir<HTMLFormElement>(raiz, 'form[aria-label="Meus dados"]'),
    );
    expect(raiz.textContent).toContain("Esse CPF não parece válido");
    expect(exigir<HTMLInputElement>(raiz, "#dados-nome").value).toBe(
      "Ana Paula Souza",
    );
  });

  it("[CA-30] @spec:AC-11130 enquanto salva, o botão mostra a espera e não aceita outro clique", async () => {
    let solta: (() => void) | undefined;
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      chamadas.push(url);
      return new Promise<Response>((resolver) => {
        solta = () => resolver(Response.json({}));
      });
    });
    const raiz = montar(<DadosDaConta inicial={DADOS} />);
    const formulario = exigir<HTMLFormElement>(
      raiz,
      'form[aria-label="Meus dados"]',
    );
    act(() => {
      formulario.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    const salvar = botao(raiz, "Salvando");
    expect(salvar.disabled).toBe(true);
    clicar(salvar);
    expect(chamadas).toHaveLength(1);
    await act(async () => {
      solta?.();
    });
    await esperar();
  });
});

const CASA = {
  id: "11111111-1111-4111-8111-111111111111",
  rotulo: "Casa",
  destinatario: "Ana Paula",
  logradouro: "Rua das Flores",
  numero: "123",
  complemento: null,
  bairro: "Centro",
  cidade: "Campinas",
  estado: "SP",
  cep: "13010000",
  pontoDeReferencia: null,
  padrao: true,
};
const TRABALHO = {
  ...CASA,
  id: "22222222-2222-4222-8222-222222222222",
  rotulo: "Trabalho",
  logradouro: "Avenida Brasil",
  padrao: false,
};

describe("endereços (AC-11114)", () => {
  it("[CA-14] @spec:AC-11114 só um endereço é o padrão na lista", async () => {
    simularApi(() => ({ status: 200, corpo: { enderecos: [CASA, TRABALHO] } }));
    const raiz = montar(<EnderecosSalvos />);
    await esperar();
    expect(raiz.querySelectorAll(".sc-endereco--padrao")).toHaveLength(1);
    expect(
      raiz.querySelector(`[data-endereco="${CASA.id}"]`)?.className,
    ).toContain("--padrao");
  });

  it("[CA-14] @spec:AC-11114 apagar o padrão avisa o que muda antes de confirmar", async () => {
    simularApi(() => ({ status: 200, corpo: { enderecos: [CASA, TRABALHO] } }));
    const raiz = montar(<EnderecosSalvos />);
    await esperar();
    const casa = exigir(raiz, `[data-endereco="${CASA.id}"]`);
    clicar(botao(casa, "Apagar"));
    expect(casa.textContent).toContain(
      "o mais antigo que sobrar passa a ser o padrão",
    );
    expect(botao(casa, "Sim, apagar")).toBeTruthy();
    // Apagar um endereço que não é o padrão não traz o aviso.
    const trabalho = exigir(raiz, `[data-endereco="${TRABALHO.id}"]`);
    clicar(botao(trabalho, "Apagar"));
    expect(trabalho.textContent).not.toContain("passa a ser o padrão");
  });

  it("[CA-30] @spec:AC-11130 usar como padrão mostra a espera e bloqueia outra ação até terminar", async () => {
    let solta: (() => void) | undefined;
    const metodos: string[] = [];
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      metodos.push(metodo);
      if (metodo === "GET")
        return Promise.resolve(Response.json({ enderecos: [CASA, TRABALHO] }));
      return new Promise<Response>((resolver) => {
        solta = () =>
          resolver(Response.json({ endereco: { ...TRABALHO, padrao: true } }));
      });
    });
    const raiz = montar(<EnderecosSalvos />);
    await esperar();
    const trabalho = exigir(raiz, `[data-endereco="${TRABALHO.id}"]`);
    const usar = botao(trabalho, "Usar como padrão");
    clicar(usar);
    expect(usar.getAttribute("aria-busy")).toBe("true");
    clicar(usar);
    expect(metodos.filter((m) => m === "PUT")).toHaveLength(1);
    await act(async () => {
      solta?.();
    });
    await esperar();
  });
});
