// @vitest-environment jsdom
/**
 * Prova da página do produto (AC-410, AC-411, AC-412, AC-413, AC-414).
 *
 * DOIS MODOS DE PROVA, e a divisão é a mesma da página. O que o servidor
 * desenha é provado com `renderToStaticMarkup` — é exatamente o que chega antes
 * de qualquer script. O formulário de escolhas é provado montando o componente
 * de verdade e clicando nele, porque o AC-411 fala de um total que muda NA HORA,
 * e um total que só existe depois de recarregar não atende o critério.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import axe, { type Result } from "axe-core";

import type { ProdutoNoContrato } from "@simpleclick/contracts";

import { EscolhasDoProduto } from "../src/features/produto/EscolhasDoProduto";
import { SeloDePreco } from "../src/features/produto/SeloDePreco";
import { prepararProduto, resumoParaCompartilhar } from "../src/server/produto";

const LOJA = "sabor-e-cia";

const DA_API: ProdutoNoContrato = {
  id: "11111111-1111-4111-8111-111111111111",
  apelido: "x-salada",
  nome: "X-Salada",
  chamada: "Pão, hambúrguer, queijo e salada",
  descricao: "Nosso clássico, feito na chapa na hora do pedido.",
  imagens: [
    {
      url: "https://exemplo.test/x-salada.jpg",
      texto: "X-Salada na tábua",
      largura: 800,
      altura: 600,
    },
    {
      url: "https://exemplo.test/x-salada-2.jpg",
      texto: null,
      largura: null,
      altura: null,
    },
  ],
  precoCentavos: 2000,
  precoAnteriorCentavos: null,
  grupos: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      nome: "Ponto da carne",
      descricao: null,
      tipo: "INGREDIENT",
      minimo: 1,
      maximo: 1,
      permiteRepetir: false,
      eixoDeVariacao: false,
      opcoes: [
        {
          id: "aaaaaaaa-1111-4111-8111-111111111111",
          nome: "Ao ponto",
          acrescimoCentavos: 0,
          marcadaPorPadrao: false,
          disponivel: true,
        },
        {
          id: "aaaaaaaa-2222-4222-8222-222222222222",
          nome: "Bem passada",
          acrescimoCentavos: 0,
          marcadaPorPadrao: false,
          disponivel: true,
        },
      ],
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      nome: "Adicionais",
      descricao: "Turbine o seu lanche",
      tipo: "ADDON",
      minimo: 0,
      maximo: null,
      permiteRepetir: false,
      eixoDeVariacao: false,
      opcoes: [
        {
          id: "bbbbbbbb-1111-4111-8111-111111111111",
          nome: "Bacon",
          acrescimoCentavos: 300,
          marcadaPorPadrao: false,
          disponivel: true,
        },
        {
          id: "bbbbbbbb-2222-4222-8222-222222222222",
          nome: "Cheddar",
          acrescimoCentavos: 250,
          marcadaPorPadrao: false,
          disponivel: false,
        },
      ],
    },
  ],
  variacoes: [],
  disponivel: true,
  motivoIndisponivel: null,
  aceitaObservacao: true,
  secao: {
    id: "44444444-4444-4444-8444-444444444444",
    apelido: "lanches",
    nome: "Lanches",
  },
};

function naTela(sobrescrita: Partial<ProdutoNoContrato> = {}, aberta = true) {
  return prepararProduto({ ...DA_API, ...sobrescrita }, LOJA, aberta);
}

/** Texto puro, como um leitor de tela ouviria. */
function comoSeLe(html: string): string {
  const caixa = document.createElement("div");
  caixa.innerHTML = html;
  const partes: string[] = [];
  const caminhante = document.createTreeWalker(caixa, NodeFilter.SHOW_TEXT);
  while (caminhante.nextNode()) {
    const trecho = (caminhante.currentNode.textContent ?? "").trim();
    if (trecho !== "") partes.push(trecho);
  }
  return partes.join(" ").replace(/\s+/g, " ");
}

/** Monta o formulário de verdade e devolve o nó e a raiz, para clicar nele. */
function montar(produto: ReturnType<typeof naTela>) {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  let raiz: Root;
  act(() => {
    raiz = createRoot(caixa);
    raiz.render(<EscolhasDoProduto produto={produto} />);
  });
  return {
    caixa,
    desmontar: () => {
      act(() => raiz.unmount());
      caixa.remove();
    },
  };
}

/** Acha o controle de uma opção pelo texto ao lado dele. */
function controleDe(caixa: HTMLElement, nome: string): HTMLInputElement {
  const rotulos = [...caixa.querySelectorAll("label")];
  const rotulo = rotulos.find((l) => (l.textContent ?? "").includes(nome));
  const entrada = rotulo?.querySelector("input");
  if (!(entrada instanceof HTMLInputElement)) {
    throw new Error(`não achei o controle de "${nome}"`);
  }
  return entrada;
}

function clicar(elemento: HTMLElement) {
  act(() => {
    elemento.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function textoDoBotao(caixa: HTMLElement): string {
  return caixa.querySelector(".sc-produto__adicionar")?.textContent ?? "";
}

describe("a página mostra tudo que preciso decidir (AC-410)", () => {
  it("@spec:AC-410 o preço vem escrito pelo servidor, com a promoção em palavras", () => {
    const html = renderToStaticMarkup(
      <SeloDePreco preco="R$ 12,00" precoAnterior="R$ 15,00" />,
    );
    const lido = comoSeLe(html);

    expect(lido).toContain("De R$ 15,00");
    expect(lido).toContain("por R$ 12,00");
  });

  it("@spec:AC-410 produto sem preço único convida a escolher, em vez de mostrar um valor que muda sozinho", () => {
    const lido = comoSeLe(renderToStaticMarkup(<SeloDePreco preco={null} />));

    expect(lido).toContain("Escolha uma opção para ver o preço");
    expect(lido).not.toContain("R$ 0,00");
  });

  it("@spec:AC-410 os grupos aparecem com a regra e com o obrigatório sinalizado", () => {
    const { caixa, desmontar } = montar(naTela());
    const lido = caixa.textContent ?? "";

    expect(lido).toContain("Ponto da carne");
    expect(lido).toContain("obrigatório");
    expect(lido).toContain("Adicionais");
    // O grupo opcional NÃO é anunciado como obrigatório.
    expect(lido).toContain("Opcional");
    desmontar();
  });

  it("@spec:AC-410 o campo de observação e o botão com o total estão na tela", () => {
    const { caixa, desmontar } = montar(naTela());

    expect(caixa.querySelector("textarea")).not.toBeNull();
    expect(textoDoBotao(caixa)).toContain("Adicionar");
    expect(textoDoBotao(caixa)).toContain("R$ 20,00");
    desmontar();
  });

  it("@spec:AC-410 o acréscimo da opção aparece com sinal, para não parecer o preço dela", () => {
    const { caixa, desmontar } = montar(naTela());

    expect(caixa.textContent).toContain("+ R$ 3,00");
    desmontar();
  });

  it("@spec:AC-410 opção esgotada aparece desabilitada, e não some", () => {
    // Sumir faria o produto parecer ter menos opções do que tem.
    const { caixa, desmontar } = montar(naTela());

    expect(caixa.textContent).toContain("Cheddar");
    expect(controleDe(caixa, "Cheddar").disabled).toBe(true);
    desmontar();
  });
});

describe("o total acompanha as escolhas em tempo real (AC-411)", () => {
  it("@spec:AC-411 marcar o adicional muda o total na hora, sem recarregar", () => {
    const { caixa, desmontar } = montar(naTela());

    expect(textoDoBotao(caixa)).toContain("R$ 20,00");
    clicar(controleDe(caixa, "Bacon"));
    expect(textoDoBotao(caixa)).toContain("R$ 23,00");

    desmontar();
  });

  it("@spec:AC-411 o cenário do critério: R$ 20,00 mais R$ 3,00, vezes dois, dá R$ 46,00", () => {
    const { caixa, desmontar } = montar(naTela());

    clicar(controleDe(caixa, "Bacon"));
    const mais = caixa.querySelector<HTMLButtonElement>(
      'button[aria-label="Aumentar a quantidade"]',
    );
    clicar(mais!);

    expect(textoDoBotao(caixa)).toContain("R$ 46,00");
    desmontar();
  });

  it("@spec:AC-411 desmarcar devolve o total ao valor anterior", () => {
    const { caixa, desmontar } = montar(naTela());

    clicar(controleDe(caixa, "Bacon"));
    clicar(controleDe(caixa, "Bacon"));

    expect(textoDoBotao(caixa)).toContain("R$ 20,00");
    desmontar();
  });

  it("@spec:AC-411 o total é anunciado a quem ouve a página", () => {
    // Sem `aria-live`, quem não vê aperta o botão sem saber quanto vai pagar.
    const { caixa, desmontar } = montar(naTela());
    const total = caixa.querySelector(".sc-produto__total");

    expect(total?.getAttribute("aria-live")).toBe("polite");
    desmontar();
  });
});

describe("escolha obrigatória pendente bloqueia com indicação clara (AC-412)", () => {
  it("@spec:AC-412 sem escolher o obrigatório, adicionar não adiciona", async () => {
    const levar = vi.fn().mockResolvedValue(undefined);
    const caixa = document.createElement("div");
    document.body.appendChild(caixa);
    let raiz: Root;
    act(() => {
      raiz = createRoot(caixa);
      raiz.render(<EscolhasDoProduto produto={naTela()} aoAdicionar={levar} />);
    });

    const botao = caixa.querySelector<HTMLButtonElement>(
      ".sc-produto__adicionar",
    );
    clicar(botao!);
    await act(async () => {});

    expect(levar).not.toHaveBeenCalled();

    act(() => raiz.unmount());
    caixa.remove();
  });

  it("@spec:AC-412 a página diz o que falta, nomeando o grupo", () => {
    const { caixa, desmontar } = montar(naTela());

    clicar(caixa.querySelector<HTMLButtonElement>(".sc-produto__adicionar")!);

    const aviso = caixa.querySelector(".sc-produto__pendencia");
    expect(aviso?.textContent).toContain("Ponto da carne");
    desmontar();
  });

  it("@spec:AC-412 o grupo pendente é marcado visualmente, e não só o rodapé", () => {
    const { caixa, desmontar } = montar(naTela());

    clicar(caixa.querySelector<HTMLButtonElement>(".sc-produto__adicionar")!);

    expect(caixa.querySelector(".sc-produto__grupo--pendente")).not.toBeNull();
    desmontar();
  });

  it("@spec:AC-412 a página rola até o grupo pendente", () => {
    // `scrollIntoView` não existe no jsdom: a espiã é a prova de que a página
    // manda ir até lá, e o alvo é conferido junto para não bastar "chamou".
    const alvos: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      alvos.push(this.id);
    };

    const { caixa, desmontar } = montar(naTela());
    clicar(caixa.querySelector<HTMLButtonElement>(".sc-produto__adicionar")!);

    expect(alvos).toContain("grupo-22222222-2222-4222-8222-222222222222");

    Element.prototype.scrollIntoView = original;
    desmontar();
  });

  it("@spec:AC-412 escolhido o obrigatório, o item é levado ao servidor", async () => {
    const levar = vi.fn().mockResolvedValue(undefined);
    const caixa = document.createElement("div");
    document.body.appendChild(caixa);
    let raiz: Root;
    act(() => {
      raiz = createRoot(caixa);
      raiz.render(<EscolhasDoProduto produto={naTela()} aoAdicionar={levar} />);
    });

    clicar(controleDe(caixa, "Ao ponto"));
    clicar(caixa.querySelector<HTMLButtonElement>(".sc-produto__adicionar")!);
    await act(async () => {});

    expect(levar).toHaveBeenCalledTimes(1);
    expect(levar.mock.calls[0]?.[0]).toMatchObject({
      produtoId: DA_API.id,
      quantidade: 1,
    });

    act(() => raiz.unmount());
    caixa.remove();
  });

  it("@spec:AC-412 o formulário recém-aberto não acusa pendência nenhuma", () => {
    // Marcar de vermelho antes de a pessoa tentar a acusa de um erro que ela
    // ainda não teve chance de cometer.
    const { caixa, desmontar } = montar(naTela());

    expect(caixa.querySelector(".sc-produto__pendencia")).toBeNull();
    expect(caixa.querySelector(".sc-produto__grupo--pendente")).toBeNull();
    desmontar();
  });
});

describe("produto indisponível é visto mas não comprado (AC-413)", () => {
  it("@spec:AC-413 produto esgotado tem o botão desabilitado e a explicação ao lado", () => {
    const { caixa, desmontar } = montar(
      naTela({ disponivel: false, motivoIndisponivel: "ESGOTADO" }),
    );

    const botao = caixa.querySelector<HTMLButtonElement>(
      ".sc-produto__adicionar",
    );
    expect(botao?.disabled).toBe(true);
    expect(caixa.textContent).toContain("acabou");
    desmontar();
  });

  it("@spec:AC-413 fora do horário de venda explica isso, e não diz que acabou", () => {
    const produto = naTela({
      disponivel: false,
      motivoIndisponivel: "FORA_DO_HORARIO",
    });

    expect(produto.explicacaoDaIndisponibilidade).toContain(
      "não está sendo vendido agora",
    );
  });

  it("@spec:AC-413 loja fechada vence o estado do produto", () => {
    // De nada adianta dizer que o item está disponível se ninguém vai preparar
    // o pedido agora.
    const produto = naTela({}, false);

    expect(produto.disponivel).toBe(false);
    expect(produto.motivoIndisponivel).toBe("LOJA_FECHADA");
    expect(produto.explicacaoDaIndisponibilidade).toContain("fechada");
  });

  it("@spec:AC-413 o produto continua VISÍVEL: nome, preço e opções seguem na tela", () => {
    const { caixa, desmontar } = montar(
      naTela({ disponivel: false, motivoIndisponivel: "ESGOTADO" }),
    );

    expect(caixa.textContent).toContain("Ponto da carne");
    expect(caixa.textContent).toContain("Bacon");
    desmontar();
  });

  it("@spec:AC-413 sem produto à venda, o seletor de quantidade sai da tela", () => {
    // Escolher quantas unidades de algo que não se pode comprar é convite a um
    // beco sem saída.
    const { caixa, desmontar } = montar(
      naTela({ disponivel: false, motivoIndisponivel: "ESGOTADO" }),
    );

    expect(
      caixa.querySelector('button[aria-label="Aumentar a quantidade"]'),
    ).toBeNull();
    desmontar();
  });
});

describe("o endereço do produto pode ser compartilhado (AC-414)", () => {
  it("@spec:AC-414 a prévia do compartilhamento traz o nome e o preço", () => {
    const resumo = resumoParaCompartilhar(naTela(), "Sabor & Cia");

    expect(resumo).toContain("Pão, hambúrguer, queijo e salada");
    expect(resumo).toContain("R$ 20,00");
  });

  it("@spec:AC-414 produto sem chamada nem descrição ainda rende uma prévia com a loja", () => {
    const resumo = resumoParaCompartilhar(
      naTela({ chamada: null, descricao: null }),
      "Sabor & Cia",
    );

    expect(resumo).toContain("X-Salada");
    expect(resumo).toContain("Sabor & Cia");
  });

  it("@spec:AC-414 o caminho de volta leva à loja certa, e à seção do produto", () => {
    // Tudo que a página precisa está no endereço: nada mora em sessão, e por
    // isso o link aberto em outro aparelho chega ao mesmo lugar.
    const produto = naTela();

    expect(produto.linkDoCatalogo).toBe(`/l/${LOJA}/catalogo`);
    expect(produto.linkDaSecao).toBe(`/l/${LOJA}/catalogo?categoria=lanches`);
  });
});

describe("acessibilidade da página do produto (AC-410)", () => {
  const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);
  let violacoes: Result[] = [];
  let avaliadas = 0;

  beforeAll(async () => {
    const caixa = document.createElement("main");
    caixa.innerHTML = "<h1>X-Salada</h1>";
    document.body.appendChild(caixa);
    const alvo = document.createElement("div");
    caixa.appendChild(alvo);

    act(() => {
      createRoot(alvo).render(<EscolhasDoProduto produto={naTela()} />);
    });

    const resultado = await axe.run(caixa);
    violacoes = resultado.violations;
    avaliadas = resultado.passes.length + resultado.violations.length;
  });

  it("@spec:AC-410 @principle:P-012 sem violação crítica nem séria", () => {
    expect(avaliadas).toBeGreaterThan(0);

    const graves = violacoes
      .filter((v) => NIVEIS_QUE_REPROVAM.has(v.impact ?? ""))
      .map((v) => `${v.id}: ${v.help}`);
    expect(graves, graves.join(" | ")).toEqual([]);
  });
});
