// @vitest-environment jsdom
/**
 * Prova do cadastro manual de cliente pela tela (AC-703, AC-704, AC-706).
 *
 * O dono cadastra pela própria lista: nome e telefone bastam, o que falta é
 * apontado campo a campo, e o repetido vira atalho para a ficha existente —
 * dizendo quando o existente tem conta na plataforma.
 */
import { afterEach, describe, expect, it } from "vitest";

import { ListaClientes } from "../src/features/painel-clientes/ListaClientes.tsx";
import type { ClienteDaLista } from "../src/lib/clientes-do-painel.ts";
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

afterEach(desmontar);

const JOAO: ClienteDaLista = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "João Açaí",
  telefone: "+5511988887777",
  email: null,
  temConta: false,
  totalDePedidos: 3,
  totalGastoCentavos: 6450,
  ultimoPedidoEm: "2026-09-20T15:00:00.000Z",
};

const ANA: ClienteDaLista = {
  id: "22222222-2222-4222-8222-222222222222",
  nome: "Ana Paula",
  telefone: "+5521966665555",
  email: "ana@exemplo.test",
  temConta: true,
  totalDePedidos: 0,
  totalGastoCentavos: 0,
  ultimoPedidoEm: null,
};

describe("o cadastro manual pela tela (AC-703, AC-704, AC-706)", () => {
  function abrirCadastro(tela: HTMLElement): HTMLFormElement {
    clicar(botao(tela, "Cadastrar cliente"));
    return exigir<HTMLFormElement>(tela, 'form[aria-label="Novo cliente"]');
  }

  it("@spec:AC-703 nome e telefone bastam: o cadastro vai à API e abre a ficha do cliente novo", async () => {
    const criados: string[] = [];
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "POST"
        ? {
            status: 201,
            corpo: {
              id: "33333333-3333-4333-8333-333333333333",
              nome: "Gabriel Balcão",
              telefone: "+5511934567890",
              email: null,
              temConta: false,
              endereco: null,
              observacao: null,
              criadoEm: "2026-09-27T12:00:00.000Z",
            },
          }
        : { status: 200, corpo: { clientes: [] } },
    );
    const tela = montar(
      <ListaClientes aoCadastrar={(ficha) => criados.push(ficha.id)} />,
    );
    await esperar();

    const formulario = abrirCadastro(tela);
    digitar(
      exigir<HTMLInputElement>(formulario, "#novo-cliente-nome"),
      "Gabriel Balcão",
    );
    digitar(
      exigir<HTMLInputElement>(formulario, "#novo-cliente-telefone"),
      "(11) 93456-7890",
    );
    await enviar(formulario);

    const cadastro = chamadas.find((c) => c.metodo === "POST");
    expect(cadastro?.url).toBe("/api/painel/clientes");
    expect(cadastro?.corpo).toEqual({
      nome: "Gabriel Balcão",
      telefone: "(11) 93456-7890",
      email: null,
      endereco: null,
      observacao: null,
    });
    expect(criados).toEqual(["33333333-3333-4333-8333-333333333333"]);
  });

  it("@spec:AC-703 sem nome e sem telefone, a tela aponta cada campo e não envia", async () => {
    const chamadas = simularApi(() => ({
      status: 200,
      corpo: { clientes: [] },
    }));
    const tela = montar(<ListaClientes />);
    await esperar();

    const formulario = abrirCadastro(tela);
    await enviar(formulario);

    expect(formulario.textContent).toContain("Informe o nome do cliente.");
    expect(formulario.textContent).toContain("Informe o telefone");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("@spec:AC-704 telefone repetido oferece abrir o cadastro existente, e o digitado fica", async () => {
    simularApi((chamada) =>
      chamada.metodo === "POST"
        ? {
            status: 409,
            corpo: {
              erro: "cliente_existente",
              clienteId: JOAO.id,
              nome: "João Açaí",
              motivo: "TELEFONE",
              vinculo: "MANUAL",
            },
          }
        : { status: 200, corpo: { clientes: [JOAO] } },
    );
    const tela = montar(<ListaClientes />);
    await esperar();

    const formulario = abrirCadastro(tela);
    digitar(
      exigir<HTMLInputElement>(formulario, "#novo-cliente-nome"),
      "João de Novo",
    );
    digitar(
      exigir<HTMLInputElement>(formulario, "#novo-cliente-telefone"),
      "11988887777",
    );
    await enviar(formulario);

    expect(formulario.textContent).toContain(
      "Já existe um cliente com este telefone",
    );
    const atalho = exigir<HTMLAnchorElement>(
      formulario,
      `a[href="/painel/clientes/${JOAO.id}"]`,
    );
    expect(atalho.textContent).toContain("Abrir cadastro de João Açaí");
    expect(
      exigir<HTMLInputElement>(formulario, "#novo-cliente-nome").value,
    ).toBe("João de Novo");
  });

  it("@spec:AC-706 cliente com conta é apontado como vínculo existente, não como duplicata", async () => {
    simularApi((chamada) =>
      chamada.metodo === "POST"
        ? {
            status: 409,
            corpo: {
              erro: "cliente_existente",
              clienteId: ANA.id,
              nome: "Ana Paula",
              motivo: "EMAIL",
              vinculo: "CONTA",
            },
          }
        : { status: 200, corpo: { clientes: [ANA] } },
    );
    const tela = montar(<ListaClientes />);
    await esperar();

    const formulario = abrirCadastro(tela);
    digitar(exigir<HTMLInputElement>(formulario, "#novo-cliente-nome"), "Ana");
    digitar(
      exigir<HTMLInputElement>(formulario, "#novo-cliente-telefone"),
      "21 90000-0000",
    );
    digitar(
      exigir<HTMLInputElement>(formulario, "#novo-cliente-email"),
      "ana@exemplo.test",
    );
    await enviar(formulario);

    expect(formulario.textContent).toContain("tem conta na plataforma");
    expect(
      formulario.querySelector(`a[href="/painel/clientes/${ANA.id}"]`),
    ).not.toBeNull();
  });
});
