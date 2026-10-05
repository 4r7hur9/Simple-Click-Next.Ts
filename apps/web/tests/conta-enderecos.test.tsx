// @vitest-environment jsdom
/**
 * Prova dos endereços salvos na conta e do pré-preenchimento do fechamento
 * (T-707, AC-509).
 *
 * Duas pontas do mesmo critério: a pessoa cadastra o endereço UMA vez na
 * conta, e o fechamento de qualquer loja chega com o padrão dela preenchido.
 * A rede responde sem servidor, com corpos no formato do contrato.
 */
import { afterEach, describe, expect, it } from "vitest";

import { EnderecosSalvos } from "../src/features/conta/EnderecosSalvos.tsx";
import { conhecidosDaConta } from "../src/lib/enderecos-da-conta.ts";
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

const CASA = {
  id: "11111111-1111-4111-8111-111111111111",
  rotulo: "Casa",
  destinatario: "Ana Paula",
  logradouro: "Rua das Flores",
  numero: "123",
  complemento: "Apto 21",
  bairro: "Vila Mariana",
  cidade: "São Paulo",
  estado: "SP",
  cep: "04110000",
  pontoDeReferencia: "Ao lado da padaria",
  padrao: true,
};

const TRABALHO = {
  ...CASA,
  id: "22222222-2222-4222-8222-222222222222",
  rotulo: "Trabalho",
  logradouro: "Avenida Paulista",
  numero: "1000",
  complemento: null,
  bairro: "Bela Vista",
  pontoDeReferencia: null,
  padrao: false,
};

describe("meus endereços na conta (AC-509)", () => {
  it("@spec:AC-509 a lista mostra o padrão primeiro, dizendo que ele vem preenchido nos pedidos", async () => {
    simularApi(() => ({ status: 200, corpo: { enderecos: [CASA, TRABALHO] } }));
    const tela = montar(<EnderecosSalvos />);
    await esperar();

    const itens = [...tela.querySelectorAll("[data-endereco]")];
    expect(itens.map((i) => i.getAttribute("data-endereco"))).toEqual([
      CASA.id,
      TRABALHO.id,
    ]);
    expect(itens[0]?.textContent).toContain(
      "Padrão — vem preenchido nos pedidos",
    );
    expect(itens[0]?.textContent).toContain(
      "Rua das Flores, 123 · Apto 21 · Vila Mariana · São Paulo/SP",
    );
    expect(itens[1]?.textContent).not.toContain("Padrão");
  });

  it("@spec:AC-509 carregando, vazio e erro com nova tentativa", async () => {
    let tentativas = 0;
    simularApi(() => {
      tentativas += 1;
      return tentativas === 1
        ? { status: 500, corpo: {} }
        : { status: 200, corpo: { enderecos: [] } };
    });
    const tela = montar(<EnderecosSalvos />);
    expect(tela.textContent).toContain("Carregando seus endereços");
    await esperar();
    expect(tela.textContent).toContain(
      "Não foi possível carregar seus endereços",
    );

    clicar(botao(tela, "Tentar de novo"));
    await esperar();
    expect(tela.textContent).toContain("Nenhum endereço salvo");
  });

  it("@spec:AC-509 cadastrar um endereço envia o formulário e recarrega a lista", async () => {
    let salvos: unknown[] = [];
    const chamadas = simularApi((chamada) => {
      if (chamada.metodo === "POST") {
        salvos = [CASA];
        return { status: 201, corpo: CASA };
      }
      return { status: 200, corpo: { enderecos: salvos } };
    });
    const tela = montar(<EnderecosSalvos />);
    await esperar();

    clicar(botao(tela, "Cadastrar endereço"));
    const formulario = exigir<HTMLFormElement>(
      tela,
      'form[aria-label="Novo endereço"]',
    );
    digitar(exigir<HTMLInputElement>(formulario, "#endereco-rotulo"), "Casa");
    digitar(
      exigir<HTMLInputElement>(formulario, "#endereco-logradouro"),
      "Rua das Flores",
    );
    digitar(exigir<HTMLInputElement>(formulario, "#endereco-numero"), "123");
    digitar(exigir<HTMLInputElement>(formulario, "#endereco-estado"), "sp");
    await enviar(formulario);

    expect(chamadas.find((c) => c.metodo === "POST")).toMatchObject({
      url: "/api/conta/enderecos",
      corpo: {
        rotulo: "Casa",
        logradouro: "Rua das Flores",
        numero: "123",
        estado: "SP",
        padrao: false,
      },
    });
    expect(tela.querySelector(`[data-endereco="${CASA.id}"]`)).not.toBeNull();
  });

  it("@spec:AC-509 trocar o padrão é um toque, e apagar pede confirmação na tela", async () => {
    const chamadas = simularApi((chamada) => {
      if (chamada.metodo === "PUT")
        return { status: 200, corpo: { ...TRABALHO, padrao: true } };
      if (chamada.metodo === "DELETE") return { status: 204 };
      return { status: 200, corpo: { enderecos: [CASA, TRABALHO] } };
    });
    const tela = montar(<EnderecosSalvos />);
    await esperar();

    clicar(botao(tela, "Usar como padrão"));
    await esperar();
    expect(chamadas.find((c) => c.metodo === "PUT")).toMatchObject({
      url: `/api/conta/enderecos/${TRABALHO.id}`,
      corpo: { logradouro: "Avenida Paulista", padrao: true },
    });

    const trabalho = exigir(tela, `[data-endereco="${TRABALHO.id}"]`);
    clicar(botao(trabalho, "Apagar"));
    expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(false);
    clicar(
      botao(exigir(tela, `[data-endereco="${TRABALHO.id}"]`), "Sim, apagar"),
    );
    await esperar();
    expect(chamadas.find((c) => c.metodo === "DELETE")?.url).toBe(
      `/api/conta/enderecos/${TRABALHO.id}`,
    );
  });
});

describe("o fechamento chega com o endereço padrão da conta (AC-509)", () => {
  function respondendo(corpo: unknown, status = 200): typeof fetch {
    return (async () =>
      new Response(JSON.stringify(corpo), {
        status,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
  }

  it("@spec:AC-509 logado, o nome e o endereço padrão vêm prontos para os campos do fechamento", async () => {
    const conhecidos = await conhecidosDaConta(
      "token-de-teste",
      respondendo({ enderecos: [TRABALHO, CASA] }),
    );
    expect(conhecidos).toEqual({
      nome: "Ana Paula",
      endereco: {
        logradouro: "Rua das Flores",
        numero: "123",
        complemento: "Apto 21",
        bairro: "Vila Mariana",
        cidade: "São Paulo",
        cep: "04110000",
        pontoDeReferencia: "Ao lado da padaria",
      },
    });
  });

  it("@spec:AC-509 sem sessão, sem endereço ou com a API fora, o fechamento abre em branco", async () => {
    expect(
      await conhecidosDaConta(undefined, respondendo({ enderecos: [CASA] })),
    ).toEqual({});
    expect(
      await conhecidosDaConta("token", respondendo({ enderecos: [] })),
    ).toEqual({});
    expect(await conhecidosDaConta("token", respondendo({}, 401))).toEqual({});
    const semRede = (async () => {
      throw new Error("sem rede");
    }) as unknown as typeof fetch;
    expect(await conhecidosDaConta("token", semRede)).toEqual({});
  });
});
