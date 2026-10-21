// @vitest-environment jsdom
/**
 * Card #52 — as páginas próprias do catálogo: Estoque (números do topo,
 * situação, filtro, ajuste rápido na linha e "avisar abaixo de"), Variações e
 * Opções e adicionais. Desde o card #76 cada página lê UMA página da visão
 * geral (`?recorte=`), com filtro, ordem e números feitos no servidor; aqui o
 * servidor é simulado.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/painel/estoque",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));

import { PainelDeEstoque } from "../src/features/painel-estoque/PainelDeEstoque.tsx";
import { paginasVisiveis } from "../src/features/painel-estoque/lista-paginada.tsx";
import {
  gruposDeOpcoes,
  indicadoresDoEstoque,
  linhasDaPagina,
  linhasDeEstoque,
  situacaoDoEstoque,
  temVariacoes,
  type ProdutoNaVisao,
} from "../src/features/painel-estoque/visao-do-catalogo.ts";
import { PainelDeOpcoes } from "../src/features/painel-opcoes/PainelDeOpcoes.tsx";
import { PainelDeVariacoes } from "../src/features/painel-variacoes/PainelDeVariacoes.tsx";
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

/** `[quantidade, avisar abaixo de]`; o resto tem padrão. */
function variacao(
  id: string,
  nome: string,
  [quantidade, minimoAlerta]: readonly [number | null, number | null],
  { precoCentavos = 1000, padrao = false } = {},
) {
  return {
    id,
    nome,
    sku: null,
    padrao,
    disponivel: true,
    precoCentavos,
    quantidade,
    reservado: quantidade === null ? null : 0,
    minimoAlerta,
    estoqueBaixo:
      quantidade !== null &&
      minimoAlerta !== null &&
      quantidade <= minimoAlerta,
  };
}

const PRODUTOS: ProdutoNaVisao[] = [
  {
    id: "p-1",
    nome: "Camiseta",
    status: "PUBLISHED",
    disponivel: true,
    categoriaId: "c-1",
    categoriaNome: "Roupas",
    variacoes: [
      variacao("v-p", "P", [0, 2]),
      variacao("v-m", "M", [2, 3]),
      variacao("v-g", "G", [10, 3]),
    ],
    grupos: [
      {
        id: "g-t",
        nome: "Tamanho",
        tipo: "VARIATION",
        minimo: 1,
        maximo: 1,
        eixoDeVariacao: true,
        ativo: true,
        opcoes: [],
      },
    ],
  },
  {
    id: "p-2",
    nome: "Pastel de carne",
    status: "PUBLISHED",
    disponivel: true,
    categoriaId: "c-2",
    categoriaNome: "Pastéis",
    variacoes: [
      variacao("v-u", "Padrão", [null, null], {
        precoCentavos: 1200,
        padrao: true,
      }),
    ],
    grupos: [
      {
        id: "g-b",
        nome: "Borda recheada",
        tipo: "ADDON",
        minimo: 0,
        maximo: 1,
        eixoDeVariacao: false,
        ativo: true,
        opcoes: [
          { nome: "Catupiry", acrescimoCentavos: 300, disponivel: true },
        ],
      },
    ],
  },
];

afterEach(() => {
  desmontar();
  window.history.replaceState(null, "", "/");
});

/** A página que a API devolveria para o recorte, sem filtro nenhum. */
function paginaDoServidor(url: string, produtos: readonly ProdutoNaVisao[]) {
  const recorte = new URL(url, "http://teste").searchParams.get("recorte");
  const base = {
    pagina: 1,
    porPagina: 50,
    totalDePaginas: 1,
    categorias: [
      { valor: "c-2", rotulo: "Pastéis" },
      { valor: "c-1", rotulo: "Roupas" },
    ],
  };
  if (recorte === "estoque") {
    const linhas = linhasDeEstoque(produtos);
    return {
      ...base,
      produtos,
      linhas: linhas.map((linha) => ({
        produtoId: linha.produto.id,
        variacaoId: linha.variacao.id === "" ? null : linha.variacao.id,
        unica: linha.unica,
        situacao: linha.situacao,
      })),
      total: linhas.length,
      totalDaLoja: linhas.length,
      indicadores: indicadoresDoEstoque(linhas),
    };
  }
  const comAlgo = produtos.filter((produto) =>
    recorte === "variacoes"
      ? temVariacoes(produto)
      : gruposDeOpcoes(produto).length > 0,
  );
  return {
    ...base,
    produtos: comAlgo,
    total: comAlgo.length,
    totalDaLoja: produtos.length,
    indicadores: {},
  };
}

describe("as contas da página de estoque", () => {
  it("diz a situação de cada variação", () => {
    expect(situacaoDoEstoque({ quantidade: null, minimoAlerta: 3 })).toBe(
      "sem-controle",
    );
    expect(situacaoDoEstoque({ quantidade: 0, minimoAlerta: null })).toBe(
      "falta",
    );
    expect(situacaoDoEstoque({ quantidade: 3, minimoAlerta: 3 })).toBe("baixo");
    expect(situacaoDoEstoque({ quantidade: 4, minimoAlerta: 3 })).toBe(
      "normal",
    );
  });

  it("produto sem variação nenhuma também aparece, como sem controle", () => {
    const [linha] = linhasDeEstoque([
      { ...PRODUTOS[1]!, id: "p-3", variacoes: [], precoCentavos: 900 },
    ]);
    expect(linha?.situacao).toBe("sem-controle");
    expect(linha?.unica).toBe(true);
    expect(linha?.variacao.precoCentavos).toBe(900);
  });

  it("soma falta, baixo, unidades e valor estimado", () => {
    expect(indicadoresDoEstoque(linhasDeEstoque(PRODUTOS))).toEqual({
      emFalta: 1,
      estoqueBaixo: 1,
      totalDeItens: 12,
      valorEstimadoCentavos: 12_000,
    });
  });

  it("monta as linhas na ordem que o servidor escolheu, inclusive o produto sem variação", () => {
    const semVariacao = {
      ...PRODUTOS[1]!,
      id: "p-3",
      variacoes: [],
      precoCentavos: 900,
    };
    const linhas = linhasDaPagina(
      [
        { produtoId: "p-1", variacaoId: "v-g", unica: false, situacao: "normal" },
        { produtoId: "p-3", variacaoId: null, unica: true, situacao: "sem-controle" },
        { produtoId: "p-1", variacaoId: "v-p", unica: false, situacao: "falta" },
        // Linha de um produto que não veio (sumiu entre as leituras): fica fora.
        { produtoId: "p-9", variacaoId: "v-x", unica: true, situacao: "normal" },
      ],
      [PRODUTOS[0]!, semVariacao],
    );
    expect(linhas.map((linha) => linha.chave)).toEqual([
      "p-1:v-g",
      "p-3:",
      "p-1:v-p",
    ]);
    expect(linhas[1]?.variacao.precoCentavos).toBe(900);
    expect(linhas[2]?.situacao).toBe("falta");
  });

  it("a paginação mostra as pontas, a vizinhança e reticências", () => {
    expect(paginasVisiveis(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginasVisiveis(1, 203)).toEqual([1, 2, 3, 4, "…", 203]);
    expect(paginasVisiveis(7, 203)).toEqual([1, "…", 6, 7, 8, "…", 203]);
    expect(paginasVisiveis(203, 203)).toEqual([1, "…", 200, 201, 202, 203]);
  });
});

describe("a página Estoque", () => {
  it("mostra os números, ajusta na linha com motivo padrão e grava o aviso do produto", async () => {
    const chamadas = simularApi((chamada) => {
      if (chamada.url.startsWith("/api/catalogo/visao-geral")) {
        return { status: 200, corpo: paginaDoServidor(chamada.url, PRODUTOS) };
      }
      if (chamada.url.endsWith("/estoque/alerta")) {
        return { status: 200, corpo: { minimoAlerta: 5 } };
      }
      return { status: 201, corpo: { movimento: {} } };
    });
    const tela = montar(<PainelDeEstoque />);
    await esperar();
    // Uma página só, pedida ao servidor (card #76).
    expect(chamadas[0]?.url).toBe("/api/catalogo/visao-geral?recorte=estoque");

    const resumo = exigir<HTMLElement>(
      tela,
      '[aria-label="Resumo do estoque"]',
    );
    expect(resumo.textContent).toContain("Itens em falta1");
    expect(resumo.textContent).toContain("Total de itens12");
    expect(resumo.textContent).toMatch(/R\$\s?120,00/);
    expect(tela.textContent).toContain("Em falta");
    expect(tela.textContent).toContain("Sem controle");

    // Ajuste rápido: + duas vezes na M (2 → 4) e salvar sem motivo.
    const mais = exigir<HTMLButtonElement>(
      tela,
      'button[aria-label="Pôr mais 1 em Camiseta, M"]',
    );
    clicar(mais);
    clicar(mais);
    const formulario = exigir<HTMLFormElement>(
      tela,
      'form[aria-label="Ajustar o estoque de Camiseta, M"]',
    );
    expect(formulario.textContent).toContain("Salvar +2");
    await enviar(formulario);
    const ajuste = chamadas.find((c) => c.metodo === "POST");
    expect(ajuste?.url).toBe(
      "/api/catalogo/produtos/p-1/variacoes/v-m/estoque",
    );
    expect(ajuste?.corpo).toEqual({
      quantidadeAlvo: 4,
      motivo: "Ajuste rápido na página de estoque",
    });
    expect(tela.textContent).toContain("ajustado para 4");

    // Avisar abaixo de: vale para o produto inteiro.
    clicar(
      exigir(
        tela,
        'button[aria-label="Mudar o aviso de estoque baixo de Camiseta"]',
      ),
    );
    const aviso = exigir<HTMLFormElement>(
      tela,
      'form[aria-label="Alerta de estoque mínimo de Camiseta"]',
    );
    digitar(exigir<HTMLInputElement>(aviso, "input"), "5");
    await enviar(aviso);
    const gravado = chamadas.find((c) => c.metodo === "PUT");
    expect(gravado?.url).toBe("/api/catalogo/produtos/p-1/estoque/alerta");
    expect(gravado?.corpo).toEqual({ minimoAlerta: 5 });
    expect(tela.textContent).toContain("avisa quando chegar a 5");
    // Os números do topo acompanham sem reler a loja: com aviso em 5, a M (4)
    // fica baixa, a P (0) segue em falta e a G (10) normal.
    expect(resumo.textContent).toContain("Itens em falta1");
    expect(resumo.textContent).toContain("Estoque baixo1");
    expect(resumo.textContent).toContain("Total de itens14");
  });

  it("filtrar põe a consulta no endereço e pede de novo ao servidor", async () => {
    const chamadas = simularApi((chamada) => ({
      status: 200,
      corpo: paginaDoServidor(chamada.url, PRODUTOS),
    }));
    const tela = montar(<PainelDeEstoque />);
    await esperar();
    const busca = exigir<HTMLInputElement>(tela, 'input[type="search"]');
    digitar(busca, "camiseta");
    await new Promise((resolver) => setTimeout(resolver, 400));
    await esperar();
    expect(chamadas.at(-1)?.url).toBe(
      "/api/catalogo/visao-geral?busca=camiseta&recorte=estoque",
    );
    expect(window.location.search).toBe("?busca=camiseta");
  });

  it("erro de leitura não vira lista vazia", async () => {
    simularApi(() => ({ status: 500 }));
    const tela = montar(<PainelDeEstoque />);
    await esperar();
    expect(tela.textContent).toContain("Não foi possível carregar o estoque");
    expect(botao(tela, "Tentar de novo")).toBeTruthy();
  });
});

describe("as páginas Variações e Opções", () => {
  it("Variações lista quem tem grade e dá o atalho para quem não tem", async () => {
    simularApi((chamada) => ({
      status: 200,
      corpo: paginaDoServidor(chamada.url, PRODUTOS),
    }));
    const tela = montar(<PainelDeVariacoes />);
    await esperar();
    expect(tela.textContent).toContain("Camiseta");
    expect(tela.textContent).toContain("3 variações");
    expect(tela.textContent).not.toContain("Pastel de carne");
    expect(botao(tela, "Editar variações")).toBeTruthy();
  });

  it("Opções mostra os grupos com a regra e o acréscimo, sem o eixo da variação", async () => {
    simularApi((chamada) => ({
      status: 200,
      corpo: paginaDoServidor(chamada.url, PRODUTOS),
    }));
    const tela = montar(<PainelDeOpcoes />);
    await esperar();
    expect(tela.textContent).toContain("Borda recheada");
    expect(tela.textContent).toContain("Opcional, até 1");
    expect(tela.textContent).toMatch(/Catupiry \+R\$\s?3,00/);
    expect(tela.textContent).not.toContain("Camiseta");
  });
});
