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
import { afterEach, describe, expect, it, vi } from "vitest";

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
  renderizarDeNovo,
  simularApi,
} from "./apoio-config.tsx";
import { opcoesDoSeletor } from "./apoio-seletor.ts";

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
  const seletor = [
    ...tela.querySelectorAll<HTMLButtonElement>('button[role="combobox"]'),
  ].find((s) => opcoesDoSeletor(s).some((o) => o.valor === produtoId));
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
  it("carrega uma ficha ao selecionar e reutiliza a mesma ficha ao reabrir", async () => {
    let leituras = 0;
    const resumo = { ...LANCHE, grupos: [], variacoes: [] };
    const tela = montar(
      <MontarPedido
        produtos={[resumo]}
        carregarDetalhe={async () => {
          leituras += 1;
          return LANCHE;
        }}
      />,
    );

    escolherProduto(tela, LANCHE.id);
    await esperar();
    expect(leituras).toBe(1);
    expect(tela.textContent).toContain("Ketchup");

    clicar(botao(tela, "Cancelar"));
    escolherProduto(tela, LANCHE.id);
    await esperar();
    expect(leituras).toBe(1);
    expect(tela.textContent).toContain("Ketchup");
  });

  it("mostra erro e permite tentar carregar a ficha de novo", async () => {
    let leituras = 0;
    const tela = montar(
      <MontarPedido
        produtos={[{ ...LANCHE, grupos: [], variacoes: [] }]}
        carregarDetalhe={async () => {
          leituras += 1;
          if (leituras === 1) throw new Error("rede indisponível");
          return LANCHE;
        }}
      />,
    );

    escolherProduto(tela, LANCHE.id);
    await esperar();
    expect(tela.textContent).toContain("Não foi possível abrir o produto");
    clicar(botao(tela, "Tentar de novo"));
    await esperar();
    expect(leituras).toBe(2);
    expect(tela.textContent).toContain("Ketchup");
  });

  it("descarta a ficha atrasada depois de cancelar e escolher outro produto", async () => {
    let liberarLanche!: (produto: ProdutoParaMontar) => void;
    const tela = montar(
      <MontarPedido
        produtos={[
          { ...LANCHE, grupos: [], variacoes: [] },
          { ...SUCO, grupos: [], variacoes: [] },
        ]}
        carregarDetalhe={(id) =>
          id === LANCHE.id
            ? new Promise((resolver) => {
                liberarLanche = resolver;
              })
            : Promise.resolve(SUCO)
        }
      />,
    );

    escolherProduto(tela, LANCHE.id);
    expect(tela.textContent).toContain("Carregando opções do produto");
    clicar(botao(tela, "Cancelar"));
    escolherProduto(tela, SUCO.id);
    await esperar();
    expect(
      tela.querySelector('section[aria-label="Montar Suco de laranja"]'),
    ).not.toBeNull();

    liberarLanche(LANCHE);
    await esperar();
    expect(
      tela.querySelector('section[aria-label="Montar Suco de laranja"]'),
    ).not.toBeNull();
    expect(
      tela.querySelector('section[aria-label="Montar X-Salada"]'),
    ).toBeNull();
  });

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
    clicar(botao(tela, "Cliente novo"));
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
    expect(tela.textContent).toContain("Pedido A-0057 lançado");
    expect(
      tela.querySelector(`a[href="/painel/pedidos/${PEDIDO_CRIADO.id}"]`),
    ).not.toBeNull();
  });

  it("@spec:AC-709 sem cadastro: nome e telefone no próprio pedido, e a tela cobra os dois", async () => {
    const chamadas = simularApi(() => ({ status: 201, corpo: PEDIDO_CRIADO }));
    const tela = montar(<MontarPedido produtos={[LANCHE, SUCO]} />);
    clicar(botao(tela, "Cliente novo"));
    // Sem guardar na lista: o pedido sai só com nome e telefone.
    marcar(tela, "Guardar na lista");
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
    expect(tela.textContent).toContain("Pedido A-0057 lançado");
  });

  it("cliente cadastrado: escolhe na lista e o pedido vai com a ficha dele", async () => {
    const CLIENTE = {
      id: "77777777-7777-4777-8777-777777777777",
      nome: "Dona Marta",
      telefone: "+5585988887777",
      email: null,
      temConta: false,
      totalDePedidos: 3,
      totalGastoCentavos: 9000,
      ultimoPedidoEm: "2026-10-10T12:00:00.000Z",
    };
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "GET"
        ? { status: 200, corpo: { clientes: [CLIENTE] } }
        : { status: 201, corpo: PEDIDO_CRIADO },
    );
    const tela = montar(<MontarPedido produtos={[LANCHE, SUCO]} />);
    await esperar();

    // Sem escolher ninguém, o pedido não sai e a tela explica.
    escolherProduto(tela, SUCO.id);
    clicar(botao(tela, "Adicionar"));
    const formulario = exigir<HTMLFormElement>(
      tela,
      'form[aria-label="Montar pedido manual"]',
    );
    await enviar(formulario);
    expect(tela.textContent).toContain("Escolha um cliente da lista");
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);

    await esperar();
    clicar(exigir<HTMLButtonElement>(tela, `[data-cliente="${CLIENTE.id}"]`));
    expect(tela.textContent).toContain("Dona Marta");
    expect(tela.textContent).toContain("3 pedidos");

    await enviar(formulario);
    const lancamento = chamadas.find((c) => c.metodo === "POST");
    expect(lancamento?.corpo).toMatchObject({
      cliente: { tipo: "cadastrado", clienteId: CLIENTE.id },
      entrega: "PICKUP",
    });
    expect(tela.textContent).toContain("Pedido A-0057 lançado");
  });

  it("cliente novo é guardado na lista antes do pedido, que sai com a ficha criada", async () => {
    const FICHA = {
      id: "88888888-8888-4888-8888-888888888888",
      nome: "Yara Nova",
      telefone: "+5511960001234",
      email: null,
      temConta: false,
      endereco: null,
      observacao: null,
      criadoEm: "2026-10-16T12:00:00.000Z",
    };
    const chamadas = simularApi((chamada) =>
      chamada.url.includes("/clientes") && chamada.metodo === "POST"
        ? { status: 201, corpo: FICHA }
        : chamada.metodo === "GET"
          ? { status: 200, corpo: { clientes: [] } }
          : { status: 201, corpo: PEDIDO_CRIADO },
    );
    const tela = montar(<MontarPedido produtos={[LANCHE, SUCO]} />);
    clicar(botao(tela, "Cliente novo"));
    digitar(exigir<HTMLInputElement>(tela, "#manual-nome"), "Yara Nova");
    digitar(
      exigir<HTMLInputElement>(tela, "#manual-telefone"),
      "11 96000-1234",
    );
    escolherProduto(tela, SUCO.id);
    clicar(botao(tela, "Adicionar"));

    await enviar(
      exigir<HTMLFormElement>(tela, 'form[aria-label="Montar pedido manual"]'),
    );

    const posts = chamadas.filter((c) => c.metodo === "POST");
    expect(posts[0]?.url).toContain("/api/painel/clientes");
    expect(posts[0]?.corpo).toMatchObject({ nome: "Yara Nova" });
    expect(posts[1]?.corpo).toMatchObject({
      cliente: { tipo: "cadastrado", clienteId: FICHA.id },
    });
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

  it("D-2 a descrição da repetição nomeia a opção mesmo com a lista do balcão sem grupos", async () => {
    simularApi((chamada) =>
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
                  precoUnitarioCentavos: 2000,
                  totalDaLinhaCentavos: 2000,
                  precoUnitarioDaEpocaCentavos: 2000,
                  pendencias: [],
                },
              ],
              indisponiveis: [],
              subtotalCentavos: 2000,
            },
          }
        : { status: 201, corpo: PEDIDO_CRIADO },
    );
    const tela = montar(
      <MontarPedido
        produtos={[{ ...LANCHE, grupos: [], variacoes: [] }]}
        carregarDetalhe={async () => LANCHE}
        repetirPedidoId="88888888-8888-4888-8888-888888888888"
      />,
    );
    await esperar();
    const itens = exigir(tela, 'ul[aria-label="Itens do pedido"]');
    expect(itens.textContent).toContain("1× X-Salada — Ketchup");
    expect(itens.textContent).toContain("R$ 20,00");
  });
});

describe("a repetição não atropela o operador (card #137, achado 4)", () => {
  const ID_ANTIGO = "88888888-8888-4888-8888-888888888888";

  function repeticaoDe(produtos: readonly ProdutoParaMontar[]) {
    return {
      pedidoOriginal: { id: ID_ANTIGO, codigo: "A-0007" },
      clienteId: null,
      entrega: "PICKUP",
      itens: produtos.map((produto) => ({
        produtoId: produto.id,
        variacaoId: null,
        nome: produto.nome,
        variacao: null,
        quantidade: 1,
        escolhas:
          produto.id === LANCHE.id || produto.grupos.length > 0
            ? [
                {
                  grupoId: "22222222-2222-4222-8222-222222222222",
                  opcaoId: "33333333-3333-4333-8333-333333333333",
                  quantidade: 1,
                },
              ]
            : [],
        observacao: null,
        precoUnitarioCentavos: 2000,
        totalDaLinhaCentavos: 2000,
        precoUnitarioDaEpocaCentavos: 2000,
        pendencias: [],
      })),
      indisponiveis: [],
      subtotalCentavos: 2000 * produtos.length,
    };
  }

  /** A rede com a repetição presa até a prova soltar. */
  function repeticaoPresa(corpo: unknown) {
    let soltar: () => void = () => undefined;
    const portao = new Promise<void>((resolver) => {
      soltar = resolver;
    });
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", async (endereco: RequestInfo | URL) => {
      chamadas.push(String(endereco));
      await portao;
      return new Response(JSON.stringify(corpo), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    return { soltar: () => soltar(), chamadas };
  }

  const linhas = (tela: HTMLElement) =>
    [...exigir(tela, 'ul[aria-label="Itens do pedido"]').querySelectorAll("li")].map(
      (li) => li.textContent ?? "",
    );

  it("[CA-4] a repetição atrasada entra sem apagar o item que o operador já pôs", async () => {
    const rede = repeticaoPresa(repeticaoDe([LANCHE]));
    const tela = montar(
      <MontarPedido produtos={[LANCHE, SUCO]} repetirPedidoId={ID_ANTIGO} />,
    );
    await esperar();

    // Enquanto a repetição carrega, o operador monta o suco à mão.
    escolherProduto(tela, SUCO.id);
    clicar(botao(tela, "Adicionar"));
    expect(linhas(tela).join("|")).toContain("Suco de laranja");

    rede.soltar();
    await esperar();
    const itens = linhas(tela).join("|");
    expect(itens).toContain("1× X-Salada — Ketchup");
    expect(itens).toContain("Suco de laranja");
  });

  it("[CA-4] trocar a identidade de produtos e carregarDetalhe não reaplica a repetição", async () => {
    simularApi(() => ({ status: 200, corpo: repeticaoDe([LANCHE]) }));
    const resumo = { ...LANCHE, grupos: [], variacoes: [] };
    const tela = montar(
      <MontarPedido
        produtos={[resumo, SUCO]}
        carregarDetalhe={async () => LANCHE}
        repetirPedidoId={ID_ANTIGO}
      />,
    );
    await esperar();
    expect(linhas(tela)).toHaveLength(1);

    // O operador tira o lanche repetido; a página renderiza de novo com
    // listas e funções novas (como o servidor faz).
    clicar(botao(tela, "Tirar"));
    expect(tela.querySelector('ul[aria-label="Itens do pedido"]')).toBeNull();
    renderizarDeNovo(
      <MontarPedido
        produtos={[{ ...resumo }, { ...SUCO }]}
        carregarDetalhe={async () => ({ ...LANCHE })}
        repetirPedidoId={ID_ANTIGO}
      />,
    );
    await esperar();
    expect(tela.querySelector('ul[aria-label="Itens do pedido"]')).toBeNull();
  });

  it("[CA-4] resultado de uma repetição que deixou de valer é descartado", async () => {
    const rede = repeticaoPresa(repeticaoDe([LANCHE]));
    const tela = montar(
      <MontarPedido produtos={[LANCHE, SUCO]} repetirPedidoId={ID_ANTIGO} />,
    );
    await esperar();
    // O operador desiste da repetição antes de ela chegar.
    renderizarDeNovo(<MontarPedido produtos={[LANCHE, SUCO]} repetirPedidoId={null} />);
    rede.soltar();
    await esperar();
    expect(tela.querySelector('ul[aria-label="Itens do pedido"]')).toBeNull();
    expect(rede.chamadas.filter((url) => url.endsWith("/repetir"))).toHaveLength(1);
  });

  it("[CA-4] lê as fichas da repetição no máximo três por vez, só as que precisam", async () => {
    const muitos = Array.from({ length: 8 }, (_, indice) => ({
      ...LANCHE,
      id: `11111111-1111-4111-8111-${String(indice).padStart(12, "0")}`,
      nome: `Lanche ${indice}`,
      grupos: [],
    }));
    simularApi(() => ({
      status: 200,
      corpo: repeticaoDe(muitos.map((produto) => ({ ...produto, grupos: LANCHE.grupos }))),
    }));
    let emVoo = 0;
    let pico = 0;
    const lidos: string[] = [];
    const tela = montar(
      <MontarPedido
        produtos={[...muitos, SUCO]}
        carregarDetalhe={async (id) => {
          lidos.push(id);
          emVoo += 1;
          pico = Math.max(pico, emVoo);
          await new Promise((resolver) => setTimeout(resolver, 1));
          emVoo -= 1;
          const base = muitos.find((produto) => produto.id === id);
          return base ? { ...base, grupos: LANCHE.grupos } : null;
        }}
        repetirPedidoId={ID_ANTIGO}
      />,
    );
    for (let vez = 0; vez < 6; vez += 1) await esperar();

    expect(pico).toBeLessThanOrEqual(3);
    expect(new Set(lidos).size).toBe(8);
    expect(lidos).not.toContain(SUCO.id);
    expect(linhas(tela)).toHaveLength(8);
    expect(linhas(tela).join("|")).toContain("Lanche 7 — Ketchup");
  });
});
