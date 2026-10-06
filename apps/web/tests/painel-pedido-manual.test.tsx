// @vitest-environment jsdom
/**
 * Prova da montagem do pedido manual na tela (AC-707, AC-708, AC-709, AC-712).
 *
 * A tela é montada com produtos no formato da página do produto e a rede
 * respondendo sem servidor. O que se prova: o grupo obrigatório impede o item
 * de entrar com a mesma frase da vitrine; o corpo enviado não carrega preço; o
 * pedido avulso vai sem cadastro; e a repetição chega preenchida, apontando o
 * que saiu do catálogo.
 */
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import {
  MontarPedido,
  type ProdutoParaMontar,
} from "../src/features/painel-pedidos/MontarPedido.tsx";
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

const LANCHE: ProdutoParaMontar = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "X-Salada",
  precoCentavos: 2000,
  disponivel: true,
  grupos: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      nome: "Molho",
      descricao: null,
      minimo: 1,
      maximo: 1,
      permiteRepetir: false,
      eixoDeVariacao: false,
      obrigatorio: true,
      regra: "Escolha 1",
      opcoes: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          nome: "Ketchup",
          acrescimo: null,
          acrescimoCentavos: 0,
          marcadaPorPadrao: false,
          disponivel: true,
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          nome: "Mostarda",
          acrescimo: "+ R$ 1,50",
          acrescimoCentavos: 150,
          marcadaPorPadrao: false,
          disponivel: true,
        },
      ],
    },
  ],
  variacoes: [],
};

const SUCO: ProdutoParaMontar = {
  id: "55555555-5555-4555-8555-555555555555",
  nome: "Suco de laranja",
  precoCentavos: 800,
  disponivel: true,
  grupos: [],
  variacoes: [],
};

const PEDIDO_CRIADO = {
  id: "66666666-6666-4666-8666-666666666666",
  numero: 57,
  codigo: "A-0057",
  status: "PENDING",
  canal: "MANUAL",
  clienteId: null,
  subtotalCentavos: 2950,
  taxaDeEntregaCentavos: 0,
  totalCentavos: 2950,
};

function escolherProduto(tela: HTMLElement, produtoId: string): void {
  const seletor = [...tela.querySelectorAll("select")].find((s) =>
    [...s.options].some((o) => o.value === produtoId),
  );
  if (seletor === undefined) throw new Error("não achei o seletor de produto");
  digitar(seletor, produtoId);
}

function marcar(tela: HTMLElement, nome: string): void {
  const rotulo = [...tela.querySelectorAll("label")].find((l) =>
    (l.textContent ?? "").includes(nome),
  );
  const entrada = rotulo?.querySelector("input");
  if (!entrada) throw new Error(`não achei a opção "${nome}"`);
  clicar(entrada);
}

describe("o grupo obrigatório impede o item, como na vitrine (AC-708)", () => {
  it("@spec:AC-708 sem escolher o molho, o lanche não entra e a tela aponta o grupo pendente", async () => {
    simularApi(() => ({ status: 201, corpo: PEDIDO_CRIADO }));
    const tela = montar(<MontarPedido produtos={[LANCHE, SUCO]} />);

    escolherProduto(tela, LANCHE.id);
    clicar(botao(tela, "Adicionar"));

    expect(tela.textContent).toContain("Escolha 1 opção em Molho.");
    expect(tela.querySelector('ul[aria-label="Itens do pedido"]')).toBeNull();

    marcar(tela, "Ketchup");
    clicar(botao(tela, "Adicionar"));
    const itens = exigir(tela, 'ul[aria-label="Itens do pedido"]');
    expect(itens.textContent).toContain("1× X-Salada — Ketchup");
  });

  it("@spec:AC-708 a recusa do servidor ao confirmar também aponta o que falta", async () => {
    simularApi(() => ({
      status: 422,
      corpo: {
        erro: "pedido_incompleto",
        pendencias: [
          {
            produtoId: LANCHE.id,
            produto: "X-Salada",
            grupoId: "22222222-2222-4222-8222-222222222222",
            grupo: "Molho",
            motivo: "FALTA_ESCOLHER",
            explicacao: "Escolha 1 opção em Molho.",
          },
        ],
      },
    }));
    const tela = montar(<MontarPedido produtos={[LANCHE, SUCO]} />);
    digitar(exigir<HTMLInputElement>(tela, "#manual-nome"), "Rita");
    digitar(
      exigir<HTMLInputElement>(tela, "#manual-telefone"),
      "11 97000-0001",
    );
    escolherProduto(tela, SUCO.id);
    clicar(botao(tela, "Adicionar"));

    await enviar(
      exigir<HTMLFormElement>(tela, 'form[aria-label="Montar pedido manual"]'),
    );
    expect(tela.textContent).toContain("X-Salada: Escolha 1 opção em Molho.");
  });
});

describe("o pedido manual é lançado pela loja (AC-707, AC-709)", () => {
  it("@spec:AC-707 da ficha do cliente, o pedido vai sem preço nenhum no corpo e volta com o número", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.url.startsWith("/api/painel/clientes/")
        ? {
            status: 200,
            corpo: {
              cliente: {
                id: "77777777-7777-4777-8777-777777777777",
                nome: "Paulo Telefone",
                telefone: "+5511981234567",
                email: null,
                temConta: false,
                endereco: null,
                observacao: null,
                criadoEm: "2026-09-01T12:00:00.000Z",
              },
              pedidos: [],
            },
          }
        : {
            status: 201,
            corpo: {
              ...PEDIDO_CRIADO,
              clienteId: "77777777-7777-4777-8777-777777777777",
            },
          },
    );
    const tela = montar(
      <MontarPedido
        produtos={[LANCHE, SUCO]}
        clienteId="77777777-7777-4777-8777-777777777777"
      />,
    );
    await esperar();
    expect(tela.textContent).toContain("Pedido para Paulo Telefone");

    escolherProduto(tela, LANCHE.id);
    marcar(tela, "Mostarda");
    clicar(botao(tela, "+"));
    clicar(botao(tela, "Adicionar"));
    expect(tela.textContent).toContain("R$ 43,00");

    await enviar(
      exigir<HTMLFormElement>(tela, 'form[aria-label="Montar pedido manual"]'),
    );

    const lancamento = chamadas.find((c) => c.metodo === "POST");
    expect(lancamento?.url).toBe("/api/painel/pedidos/manual");
    expect(lancamento?.corpo).toEqual({
      cliente: {
        tipo: "cadastrado",
        clienteId: "77777777-7777-4777-8777-777777777777",
      },
      itens: [
        {
          produtoId: LANCHE.id,
          variacaoId: null,
          quantidade: 2,
          escolhas: [
            {
              grupoId: "22222222-2222-4222-8222-222222222222",
              opcaoId: "44444444-4444-4444-8444-444444444444",
              quantidade: 1,
            },
          ],
        },
      ],
      entrega: "PICKUP",
      formaDePagamento: "PIX",
      observacao: null,
    });
    expect(JSON.stringify(lancamento?.corpo)).not.toMatch(/centavos/i);
    expect(tela.textContent).toContain("Pedido #57 lançado");
    expect(
      tela.querySelector(`a[href="/painel/pedidos/${PEDIDO_CRIADO.id}"]`),
    ).not.toBeNull();
  });

  it("@spec:AC-709 sem cadastro: nome e telefone no próprio pedido, e a tela cobra os dois", async () => {
    const chamadas = simularApi(() => ({ status: 201, corpo: PEDIDO_CRIADO }));
    const tela = montar(<MontarPedido produtos={[LANCHE, SUCO]} />);
    escolherProduto(tela, SUCO.id);
    clicar(botao(tela, "Adicionar"));

    const formulario = exigir<HTMLFormElement>(
      tela,
      'form[aria-label="Montar pedido manual"]',
    );
    await enviar(formulario);
    expect(tela.textContent).toContain("Informe o nome de quem pede.");
    expect(chamadas).toHaveLength(0);

    digitar(
      exigir<HTMLInputElement>(tela, "#manual-nome"),
      "Yara Sem Cadastro",
    );
    digitar(
      exigir<HTMLInputElement>(tela, "#manual-telefone"),
      "(11) 96000-1234",
    );
    await enviar(formulario);

    expect(chamadas[0]?.corpo).toMatchObject({
      cliente: {
        tipo: "avulso",
        nome: "Yara Sem Cadastro",
        telefone: "(11) 96000-1234",
      },
    });
    expect(tela.textContent).toContain("Pedido #57 lançado");
  });

  it("@spec:AC-707 a montagem não tem problema grave de acessibilidade", async () => {
    simularApi(() => ({ status: 201, corpo: PEDIDO_CRIADO }));
    const tela = montar(<MontarPedido produtos={[LANCHE, SUCO]} />);
    escolherProduto(tela, LANCHE.id);
    const resultado = await axe.run(tela, {
      rules: { "color-contrast": { enabled: false } },
    });
    const graves = resultado.violations.filter((violacao) =>
      ["critical", "serious"].includes(violacao.impact ?? ""),
    );
    expect(graves).toEqual([]);
  }, 60_000);
});

describe("a repetição chega preenchida com os preços de hoje (AC-712)", () => {
  it("@spec:AC-712 os itens do pedido antigo entram prontos, e o que saiu do catálogo é apontado", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.url.endsWith("/repetir")
        ? {
            status: 200,
            corpo: {
              pedidoOriginal: {
                id: "88888888-8888-4888-8888-888888888888",
                codigo: "A-0007",
              },
              clienteId: null,
              entrega: "PICKUP",
              itens: [
                {
                  produtoId: LANCHE.id,
                  variacaoId: null,
                  nome: "X-Salada",
                  variacao: null,
                  quantidade: 1,
                  escolhas: [
                    {
                      grupoId: "22222222-2222-4222-8222-222222222222",
                      opcaoId: "33333333-3333-4333-8333-333333333333",
                      quantidade: 1,
                    },
                  ],
                  observacao: null,
                  precoUnitarioCentavos: 2500,
                  totalDaLinhaCentavos: 2500,
                  precoUnitarioDaEpocaCentavos: 2000,
                  pendencias: [],
                },
              ],
              indisponiveis: [
                {
                  nome: "Batata frita",
                  variacao: null,
                  quantidade: 1,
                  precoUnitarioDaEpocaCentavos: 900,
                  motivo: "FORA_DO_CATALOGO",
                },
              ],
              subtotalCentavos: 2500,
            },
          }
        : { status: 201, corpo: PEDIDO_CRIADO },
    );
    const tela = montar(
      <MontarPedido
        produtos={[LANCHE, SUCO]}
        repetirPedidoId="88888888-8888-4888-8888-888888888888"
      />,
    );
    await esperar();

    expect(chamadas[0]?.url).toBe(
      "/api/painel/pedidos/88888888-8888-4888-8888-888888888888/repetir",
    );
    const itens = exigir(tela, 'ul[aria-label="Itens do pedido"]');
    expect(itens.textContent).toContain("1× X-Salada — Ketchup");
    expect(itens.textContent).toContain("R$ 25,00");
    expect(itens.textContent).toContain("custava R$ 20,00 cada");
    expect(tela.textContent).toContain(
      "Batata frita saiu do catálogo — custava R$ 9,00.",
    );
  });
});
