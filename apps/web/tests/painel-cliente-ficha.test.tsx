// @vitest-environment jsdom
/**
 * Prova da ficha do cliente na tela (AC-705, AC-711, AC-713).
 *
 * O histórico do mais novo para o mais antigo, com o item que saiu do
 * catálogo marcado sem quebrar a tela; a repetição levando à montagem do
 * pedido; a correção e a remoção com confirmação na própria tela.
 */
import { afterEach, describe, expect, it } from "vitest";

import { FichaCliente } from "../src/features/painel-clientes/FichaCliente.tsx";
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

const JOAO_ID = "11111111-1111-4111-8111-111111111111";

const FICHA = {
  cliente: {
    id: JOAO_ID,
    nome: "João Açaí",
    telefone: "+5511988887777",
    email: null,
    temConta: false,
    endereco: {
      logradouro: "Rua das Flores",
      numero: "10",
      complemento: null,
      bairro: "Centro",
      cidade: null,
      estado: null,
      cep: null,
      pontoDeReferencia: null,
    },
    observacao: "Portão azul",
    criadoEm: "2026-09-01T12:00:00.000Z",
  },
  pedidos: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      numero: 42,
      codigo: "A-0042",
      status: "ACCEPTED",
      canal: "MANUAL",
      entrega: "PICKUP",
      totalCentavos: 2500,
      criadoEm: "2026-09-20T15:00:00.000Z",
      itens: [
        {
          nome: "X-Salada",
          variacao: null,
          quantidade: 1,
          totalCentavos: 2500,
          observacao: null,
          opcoes: [{ grupo: "Molho", nome: "Ketchup", quantidade: 1 }],
          indisponivel: false,
        },
      ],
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      numero: 7,
      codigo: "A-0007",
      status: "COMPLETED",
      canal: "ONLINE",
      entrega: "DELIVERY",
      totalCentavos: 2900,
      criadoEm: "2026-08-10T12:00:00.000Z",
      itens: [
        {
          nome: "X-Salada",
          variacao: null,
          quantidade: 1,
          totalCentavos: 2000,
          observacao: null,
          opcoes: [],
          indisponivel: false,
        },
        {
          nome: "Batata frita",
          variacao: null,
          quantidade: 1,
          totalCentavos: 900,
          observacao: null,
          opcoes: [],
          indisponivel: true,
        },
      ],
    },
  ],
};

describe("a ficha mostra o histórico e o que saiu do catálogo (AC-711, AC-713)", () => {
  it("@spec:AC-711 os pedidos aparecem do mais novo para o mais antigo, com número, data, itens, valor e status", async () => {
    simularApi(() => ({ status: 200, corpo: FICHA }));
    const tela = montar(<FichaCliente clienteId={JOAO_ID} />);
    await esperar();

    const cartoes = [...tela.querySelectorAll("[data-pedido]")];
    expect(cartoes.map((c) => c.getAttribute("data-pedido"))).toEqual([
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ]);
    const [recente] = cartoes;
    expect(recente?.textContent).toContain("Pedido #42");
    expect(recente?.textContent).toContain("20/09/2026");
    expect(recente?.textContent).toContain("Aceito");
    expect(recente?.textContent).toContain("R$ 25,00");
    expect(recente?.textContent).toContain("1× X-Salada");
    expect(recente?.textContent).toContain("Molho: Ketchup");
  });

  it("@spec:AC-713 o item de produto removido mostra nome e preço da época, marcado como não disponível", async () => {
    simularApi(() => ({ status: 200, corpo: FICHA }));
    const tela = montar(<FichaCliente clienteId={JOAO_ID} />);
    await esperar();

    const antigo = exigir(
      tela,
      '[data-pedido="55555555-5555-4555-8555-555555555555"]',
    );
    expect(antigo.textContent).toContain("1× Batata frita");
    expect(antigo.textContent).toContain("R$ 9,00");
    expect(antigo.textContent).toContain("Não está mais à venda");
    expect(antigo.textContent).toContain("a repetição aponta o que mudou");
  });

  it("@spec:AC-711 repetir leva à montagem do pedido com o pedido antigo e o cliente", async () => {
    simularApi(() => ({ status: 200, corpo: FICHA }));
    const tela = montar(<FichaCliente clienteId={JOAO_ID} />);
    await esperar();

    const repetir = [...tela.querySelectorAll("a")].find(
      (a) =>
        a.textContent === "Repetir pedido" &&
        a.getAttribute("href")?.includes("55555555"),
    );
    expect(repetir?.getAttribute("href")).toBe(
      `/painel/pedidos/novo?cliente=${JOAO_ID}&repetir=55555555-5555-4555-8555-555555555555`,
    );
  });
});

describe("corrigir e remover pela ficha (AC-705)", () => {
  it("@spec:AC-705 a correção vai à API e a ficha mostra o dado novo", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "PATCH"
        ? {
            status: 200,
            corpo: { ...FICHA.cliente, nome: "João Corrigido" },
          }
        : { status: 200, corpo: FICHA },
    );
    const tela = montar(<FichaCliente clienteId={JOAO_ID} />);
    await esperar();

    clicar(botao(tela, "Corrigir dados"));
    const formulario = exigir<HTMLFormElement>(
      tela,
      'form[aria-label="Corrigir dados do cliente"]',
    );
    digitar(
      exigir<HTMLInputElement>(formulario, `#ficha-${JOAO_ID}-nome`),
      "João Corrigido",
    );
    await enviar(formulario);

    const correcao = chamadas.find((c) => c.metodo === "PATCH");
    expect(correcao?.url).toBe(`/api/painel/clientes/${JOAO_ID}`);
    expect(correcao?.corpo).toMatchObject({ nome: "João Corrigido" });
    expect(tela.querySelector("h1")?.textContent).toBe("João Corrigido");
    expect(tela.textContent).toContain("Ficha corrigida.");
  });

  it("@spec:AC-705 remover pede confirmação na tela e avisa que os pedidos ficam", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "DELETE"
        ? { status: 204 }
        : { status: 200, corpo: FICHA },
    );
    const tela = montar(<FichaCliente clienteId={JOAO_ID} />);
    await esperar();

    clicar(botao(tela, "Remover cliente"));
    expect(tela.textContent).toContain("Os pedidos ficam.");
    expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(false);

    clicar(botao(tela, "Sim, remover"));
    await esperar();
    expect(chamadas.find((c) => c.metodo === "DELETE")?.url).toBe(
      `/api/painel/clientes/${JOAO_ID}`,
    );
    expect(tela.textContent).toContain("Cliente removido das listas");
    expect(tela.textContent).toContain("Os pedidos dele continuam na loja");
  });
});
