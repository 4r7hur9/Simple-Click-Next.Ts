// @vitest-environment jsdom
/**
 * Prova da exibição do cardápio na televisão (AC-925 a AC-931).
 *
 * DUAS FORMAS DE DESENHAR, de propósito. `renderToStaticMarkup` é o que o
 * servidor entrega antes de qualquer script: prova que a televisão mostra
 * produto no primeiro instante. `createRoot` com relógio de mentira é a
 * televisão ligada o dia inteiro: prova que a tela avança, que o preço novo
 * chega e que a rede caindo não apaga nada.
 *
 * Os ganchos têm prova própria ao lado deles (`src/features/tv/*.test.ts`).
 * Aqui a pergunta é o que a PAREDE mostra.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import axe, { type Result } from "axe-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";
import {
  CONTRASTE_MINIMO_TEXTO,
  PALETA_ESCURA,
  calcularTemaDaLoja,
  relacaoDeContraste,
} from "@simpleclick/ui";

import {
  caminhoDosModulos,
  enderecoParaOCelular,
  gerarCodigo,
} from "../src/features/tv/codigo";
import {
  ExibicaoDeCardapio,
  type ExibicaoDeCardapioProps,
  type LojaNaTv,
} from "../src/features/tv/ExibicaoDeCardapio";
import type { ResultadoDoCatalogoNoNavegador } from "../src/lib/catalogo-do-navegador";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// O Vitest roda da raiz do repositório; em ambiente jsdom `import.meta.url`
// não é um endereço de arquivo, então o caminho sai do diretório de trabalho.
const FOLHA = readFileSync(
  join(process.cwd(), "packages/ui/styles/exibicao.css"),
  "utf8",
);

const LOJA: LojaNaTv = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  rotuloDoCatalogo: "Cardápio",
  // A cor da paleta, que já passa no contraste: a prova da cor escolhida pelo
  // dono é a de AC-926, e mora em `calcularTemaDaLoja`.
  corPrincipal: PALETA_ESCURA.primaria,
};

const VITRINE = "https://simpleclick.app/l/sabor-e-cia/catalogo";

function produto(
  sobrescrita: Partial<CatalogoDaVitrineNoContrato["destaques"][number]> = {},
): CatalogoDaVitrineNoContrato["destaques"][number] {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    apelido: "coxinha",
    nome: "Coxinha",
    chamada: "Massa de batata, recheio de frango",
    precoCentavos: 750,
    precoAnteriorCentavos: null,
    imagem: null,
    destaque: false,
    disponivel: true,
    ...sobrescrita,
  };
}

const CATALOGO: CatalogoDaVitrineNoContrato = {
  secoes: [
    {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      apelido: "salgados",
      nome: "Salgados",
      produtos: [
        produto(),
        produto({
          id: "22222222-2222-4222-8222-222222222222",
          apelido: "empada",
          nome: "Empada",
          precoCentavos: 900,
        }),
        produto({
          id: "33333333-3333-4333-8333-333333333333",
          apelido: "kibe",
          nome: "Kibe",
          precoCentavos: 800,
          disponivel: false,
        }),
      ],
    },
    {
      id: "bbbbbbbb-2222-4222-8222-222222222222",
      apelido: "bebidas",
      nome: "Bebidas",
      produtos: [
        produto({
          id: "44444444-4444-4444-8444-444444444444",
          apelido: "guarana",
          nome: "Guaraná",
          chamada: null,
          precoCentavos: 600,
        }),
      ],
    },
  ],
  destaques: [],
  versao: "1",
};

/** O mesmo catálogo depois de o dono mexer: coxinha mais cara, kibe de volta. */
const CATALOGO_NOVO: CatalogoDaVitrineNoContrato = {
  ...CATALOGO,
  secoes: [
    {
      ...CATALOGO.secoes[0]!,
      produtos: [
        produto({ precoCentavos: 850 }),
        produto({
          id: "22222222-2222-4222-8222-222222222222",
          apelido: "empada",
          nome: "Empada",
          precoCentavos: 900,
        }),
        produto({
          id: "33333333-3333-4333-8333-333333333333",
          apelido: "kibe",
          nome: "Kibe",
          precoCentavos: 800,
          disponivel: true,
        }),
      ],
    },
    CATALOGO.secoes[1]!,
  ],
  versao: "2",
};

const SEGUNDOS_POR_TELA = 12;
const SEGUNDOS_ENTRE_ATUALIZACOES = 60;

/**
 * Nos cenários de ATUALIZAÇÃO a tela fica parada na primeira seção: com o
 * rodízio girando a cada doze segundos, aos sessenta a parede já estaria em
 * "Bebidas", e o preço da coxinha não estaria à vista para ser conferido.
 */
const TELA_PARADA = { segundosPorTela: SEGUNDOS_ENTRE_ATUALIZACOES * 10 };

const encontrado = (
  catalogo: CatalogoDaVitrineNoContrato,
): ResultadoDoCatalogoNoNavegador => ({ estado: "encontrado", catalogo });
const semRede: ResultadoDoCatalogoNoNavegador = {
  estado: "falhou",
  motivo: "falha de rede",
};

/** Quem nunca responde: a rede está no meio de uma busca. */
const pendente = (): Promise<ResultadoDoCatalogoNoNavegador> =>
  new Promise(() => {});

function propriedades(
  sobrescrita: Partial<ExibicaoDeCardapioProps> = {},
): ExibicaoDeCardapioProps {
  return {
    loja: LOJA,
    catalogoInicial: CATALOGO,
    enderecoDaVitrine: VITRINE,
    segundosPorTela: SEGUNDOS_POR_TELA,
    segundosEntreAtualizacoes: SEGUNDOS_ENTRE_ATUALIZACOES,
    buscar: async () => encontrado(CATALOGO),
    ...sobrescrita,
  };
}

/** O que o servidor entrega, antes de qualquer script. */
function desenhar(sobrescrita: Partial<ExibicaoDeCardapioProps> = {}): string {
  return renderToStaticMarkup(
    <ExibicaoDeCardapio {...propriedades(sobrescrita)} />,
  );
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

// --- a televisão ligada: montagem de verdade, com relógio de mentira --------

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.useRealTimers();
});

/** Fixa o tamanho da janela que o componente mede ao montar. */
function comJanela(largura: number, altura: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: largura,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: altura,
  });
}

function ligar(
  sobrescrita: Partial<ExibicaoDeCardapioProps> = {},
): HTMLElement {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() =>
    raiz?.render(<ExibicaoDeCardapio {...propriedades(sobrescrita)} />),
  );
  return container;
}

/** Deixa o tempo passar na televisão. */
async function esperar(segundos: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(segundos * 1000);
  });
}

const nomesNaTela = (tela: HTMLElement): string[] =>
  [...tela.querySelectorAll(".sc-exibicao__nome")].map(
    (nome) => nome.textContent ?? "",
  );

// ---------------------------------------------------------------------------

describe("a TV mostra o cardápio sem ninguém operar (AC-925)", () => {
  it("@spec:AC-925 o servidor entrega a primeira tela com produtos e preços, antes de qualquer script", () => {
    const lido = comoSeLe(desenhar());

    expect(lido).toContain("Sabor & Cia");
    expect(lido).toContain("Salgados");
    expect(lido).toContain("Coxinha");
    expect(lido).toContain("R$ 7,50");
    expect(lido).toContain("Empada");
    expect(lido).toContain("R$ 9,00");
  });

  it("@spec:AC-925 não há botão, link, campo nem nada que espere toque ou clique", () => {
    const html = desenhar();

    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("onclick");
  });

  it("@spec:AC-925 a folha esconde o cursor e a barra de rolagem, e ocupa a tela inteira", () => {
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*cursor:\s*none/);
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*overflow:\s*hidden/);
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*position:\s*fixed/);
  });

  it("@spec:AC-925 as telas avançam sozinhas no relógio, e voltam ao início", async () => {
    comJanela(1920, 1080);
    const tela = ligar();

    expect(tela.querySelector(".sc-exibicao__secao")?.textContent).toBe(
      "Salgados",
    );
    expect(nomesNaTela(tela)).toEqual(["Coxinha", "Empada"]);

    await esperar(SEGUNDOS_POR_TELA);
    expect(tela.querySelector(".sc-exibicao__secao")?.textContent).toBe(
      "Bebidas",
    );
    expect(nomesNaTela(tela)).toEqual(["Guaraná"]);

    await esperar(SEGUNDOS_POR_TELA);
    expect(tela.querySelector(".sc-exibicao__secao")?.textContent).toBe(
      "Salgados",
    );
  });

  it("@spec:AC-925 a tela diz em que ponto do rodízio está, para quem confere de perto", async () => {
    const tela = ligar();

    expect(tela.querySelector(".sc-exibicao__passo")?.textContent).toBe(
      "1 de 2",
    );
    await esperar(SEGUNDOS_POR_TELA);
    expect(tela.querySelector(".sc-exibicao__passo")?.textContent).toBe(
      "2 de 2",
    );
  });
});

describe("produto esgotado sai da TV (AC-930)", () => {
  it("@spec:AC-930 o produto indisponível não aparece em nenhuma tela do rodízio", async () => {
    const tela = ligar();
    const vistos = new Set<string>();

    for (let i = 0; i < 2; i++) {
      for (const nome of nomesNaTela(tela)) vistos.add(nome);
      await esperar(SEGUNDOS_POR_TELA);
    }

    expect(vistos.has("Coxinha")).toBe(true);
    expect(vistos.has("Kibe")).toBe(false);
    expect(desenhar()).not.toContain("esgotado");
  });

  it("@spec:AC-930 o produto que o dono libera de novo entra no rodízio na atualização seguinte", async () => {
    const tela = ligar({
      ...TELA_PARADA,
      buscar: async () => encontrado(CATALOGO_NOVO),
    });
    expect(nomesNaTela(tela)).not.toContain("Kibe");

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES);

    expect(nomesNaTela(tela)).toContain("Kibe");
  });
});

describe("texto legível a três metros (AC-926)", () => {
  it("@spec:AC-926 nome e preço usam o corpo medido, e o corpo vem da densidade", () => {
    const html = desenhar();

    // O servidor desenha para a televisão mais comum: 45 px de corpo.
    expect(html).toContain("--corpo:45px");
    expect(FOLHA).toMatch(
      /\.sc-exibicao__nome\s*\{[^}]*font-size:\s*var\(--corpo\)/,
    );
    expect(FOLHA).toMatch(
      /\.sc-exibicao__preco\s*\{[^}]*font-size:\s*calc\(var\(--corpo\)\s*\*\s*1\.1\)/,
    );
  });

  it("@spec:AC-926 as cores da parede passam na verificação de contraste, inclusive a cor da loja", () => {
    // A parede é escura: os pares são os do tema escuro do design system.
    expect(
      relacaoDeContraste(PALETA_ESCURA.tinta, PALETA_ESCURA.fundo),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    expect(
      relacaoDeContraste(PALETA_ESCURA.tintaSuave, PALETA_ESCURA.fundo),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);

    // O preço leva a cor da loja como LETRA sobre o fundo escuro: o tema a
    // ajusta até passar, seja qual for a cor que o dono escolheu.
    for (const cor of ["#0f6e5c", "#111111", "#ffff00", "#ff0000"]) {
      const tema = calcularTemaDaLoja(cor, { tema: "escuro" });
      expect(
        relacaoDeContraste(tema.corPrincipalComoTexto, PALETA_ESCURA.fundo),
        cor,
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
      expect(
        relacaoDeContraste(tema.corDoTexto, tema.corPrincipal),
        cor,
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    }
  });

  it("@spec:AC-926 a tela nunca mostra mais produtos do que cabem no corpo mínimo", () => {
    // Numa Full HD deitada cabem 12 no máximo; o cardápio tem 2 disponíveis
    // em Salgados, e é isso que aparece — sem espremer.
    const html = desenhar();
    const quantos = html.split('class="sc-exibicao__produto"').length - 1;

    expect(quantos).toBe(2);
    expect(quantos).toBeLessThanOrEqual(12);
  });
});

describe("a tela se adapta à televisão (AC-927)", () => {
  it.each([
    { largura: 1080, altura: 1920, capacidade: 9 },
    { largura: 720, altura: 1280, capacidade: 9 },
    { largura: 2160, altura: 3840, capacidade: 9 },
    { largura: 1440, altura: 900, capacidade: 7 },
  ])(
    "@spec:AC-927 $largura × $altura pagina antes de cortar produto, contando respiro e rodapé da folha",
    async ({ largura, altura, capacidade }) => {
      const produtos = Array.from({ length: 10 }, (_, indice) =>
        produto({ id: `produto-${indice}`, nome: `Produto ${indice + 1}` }),
      );
      const catalogo: CatalogoDaVitrineNoContrato = {
        secoes: [{ ...CATALOGO.secoes[0]!, produtos }],
        destaques: [],
        versao: "1",
      };
      comJanela(largura, altura);
      const tela = ligar({
        catalogoInicial: catalogo,
        buscar: async () => encontrado(catalogo),
      });
      const principal = tela.querySelector<HTMLElement>(".sc-exibicao__tela")!;
      const corpo = Number.parseFloat(
        principal.style.getPropertyValue("--corpo"),
      );
      const colunas = Number(principal.style.getPropertyValue("--colunas"));

      // jsdom não calcula layout. Lemos as medidas da folha de produção,
      // independentes da função de densidade, para conferir o espaço real.
      const proporcao = (padrao: RegExp): number => {
        const resultado = FOLHA.match(padrao);
        expect(resultado).not.toBeNull();
        return Number(resultado![1]);
      };
      const respiro = proporcao(
        /\.sc-exibicao__tela\s*\{[^}]*padding:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const cabecalho = proporcao(
        /\.sc-exibicao__cabecalho\s*\{[^}]*min-block-size:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const rodape = proporcao(
        /\.sc-exibicao__rodape\s*\{[^}]*block-size:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const linhaDoRodape = proporcao(
        /\.sc-exibicao__rodape\s*\{[^}]*line-height:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const linha = proporcao(
        /grid-auto-rows:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const codigo =
        largura < altura
          ? (altura *
              proporcao(
                /grid-template-rows:\s*auto minmax\(0, 1fr\)\s*([\d.]+)svh auto/,
              )) /
            100
          : 0;
      const alturaDosProdutos =
        Math.ceil(nomesNaTela(tela).length / colunas) * corpo * linha;
      const alturaCompleta =
        corpo * (2 * respiro + cabecalho + rodape) + codigo + alturaDosProdutos;

      expect(linhaDoRodape).toBeLessThanOrEqual(rodape);
      expect(alturaCompleta).toBeLessThanOrEqual(altura);
      expect(nomesNaTela(tela)).toEqual(
        produtos.slice(0, capacidade).map((item) => item.nome),
      );
      await esperar(SEGUNDOS_POR_TELA);
      expect(nomesNaTela(tela)).toEqual(
        produtos.slice(capacidade).map((item) => item.nome),
      );
    },
  );

  it("@spec:AC-927 deitada, a tela tem duas colunas e o código ao lado", () => {
    comJanela(1920, 1080);
    const tela = ligar();
    const principal = tela.querySelector<HTMLElement>(".sc-exibicao__tela");

    expect(principal?.dataset["orientacao"]).toBe("deitada");
    expect(principal?.style.getPropertyValue("--colunas")).toBe("2");
  });

  it("@spec:AC-927 em pé, a tela passa a uma coluna e o código vai para baixo", () => {
    comJanela(1080, 1920);
    const tela = ligar();
    const principal = tela.querySelector<HTMLElement>(".sc-exibicao__tela");

    expect(principal?.dataset["orientacao"]).toBe("em-pe");
    expect(principal?.style.getPropertyValue("--colunas")).toBe("1");
    expect(FOLHA).toContain("@media (orientation: portrait)");
  });

  it("@spec:AC-927 sem faixa preta nas bordas: a exibição cobre largura e altura inteiras", () => {
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*inline-size:\s*100vw/);
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*block-size:\s*100svh/);
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*inset:\s*0/);
  });

  it("@spec:AC-927 sem produto cortado: a linha do produto tem a mesma altura que a densidade conta", () => {
    // 2,6 corpos por produto nos dois lugares. Se um mudar sem o outro, o
    // último produto sai cortado na borda de baixo.
    expect(FOLHA).toMatch(
      /grid-auto-rows:\s*calc\(var\(--corpo\)\s*\*\s*2\.6\)/,
    );
  });
});

describe("preço mudado no painel aparece na TV (AC-928)", () => {
  it("@spec:AC-928 o preço novo aparece no intervalo seguinte, sem recarregar nem apertar nada", async () => {
    const tela = ligar({
      ...TELA_PARADA,
      buscar: async () => encontrado(CATALOGO_NOVO),
    });
    expect(tela.textContent).toContain("R$ 7,50");

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES);

    expect(tela.textContent).toContain("R$ 8,50");
    expect(tela.textContent).not.toContain("R$ 7,50");
  });

  it("@spec:AC-928 o rodapé diz quando foi a última atualização", () => {
    const tela = ligar();

    expect(tela.querySelector(".sc-exibicao__atualizado")?.textContent).toMatch(
      /Atualizado às \d{2}:\d{2}/,
    );
  });
});

describe("internet caindo não apaga o cardápio (AC-929)", () => {
  it("@spec:AC-929 com a rede fora, a televisão continua mostrando o último cardápio, sem tela de erro", async () => {
    const tela = ligar({ ...TELA_PARADA, buscar: async () => semRede });

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES * 3);

    expect(nomesNaTela(tela).length).toBeGreaterThan(0);
    expect(tela.textContent).toContain("R$ 7,50");
    expect(tela.querySelector('[role="alert"]')).toBeNull();
    // Uma linha discreta no rodapé, e não uma tela: quem olhar de perto sabe.
    expect(tela.querySelector(".sc-exibicao__aviso")?.textContent).toContain(
      "Sem conexão",
    );
  });

  it("@spec:AC-929 a rede caindo não para o rodízio", async () => {
    const tela = ligar({ buscar: async () => semRede });

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES);
    const antes = tela.querySelector(".sc-exibicao__secao")?.textContent;
    await esperar(SEGUNDOS_POR_TELA);

    expect(tela.querySelector(".sc-exibicao__secao")?.textContent).not.toBe(
      antes,
    );
  });

  it("@spec:AC-929 quando a conexão volta, a televisão volta a atualizar sozinha", async () => {
    let caiu = true;
    const tela = ligar({
      ...TELA_PARADA,
      buscar: async () => (caiu ? semRede : encontrado(CATALOGO_NOVO)),
    });

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES * 2);
    expect(tela.textContent).toContain("R$ 7,50");

    caiu = false;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(tela.textContent).toContain("R$ 8,50");
    expect(tela.querySelector(".sc-exibicao__aviso")).toBeNull();
  });
});

describe("a tela leva o cardápio para o celular (AC-931)", () => {
  it("@spec:AC-931 o código está na tela, é grande e leva à vitrine da loja vinda da TV", () => {
    const html = desenhar();
    const esperado = caminhoDosModulos(
      gerarCodigo(enderecoParaOCelular(VITRINE)),
    );

    expect(html).toContain('role="img"');
    expect(html).toContain(
      "Código para abrir simpleclick.app/l/sabor-e-cia/catalogo no celular",
    );
    expect(html).toContain(`d="${esperado}"`);
    // Elemento grande, e não selo de canto: 44% do lado menor da tela.
    expect(FOLHA).toMatch(/--tamanho-do-codigo:\s*44vmin/);
  });

  it("@spec:AC-931 o endereço aparece escrito, para quem prefere digitar", () => {
    expect(comoSeLe(desenhar())).toContain(
      "simpleclick.app/l/sabor-e-cia/catalogo",
    );
    expect(comoSeLe(desenhar())).toContain("Aponte a câmera");
  });

  it("@spec:AC-931 o código fica em TODA tela do rodízio, e não só numa", async () => {
    const tela = ligar();

    for (let i = 0; i < 3; i++) {
      expect(
        tela.querySelector('svg[role="img"] path')?.getAttribute("d"),
      ).toBe(caminhoDosModulos(gerarCodigo(enderecoParaOCelular(VITRINE))));
      await esperar(SEGUNDOS_POR_TELA);
    }
  });

  it("@spec:AC-931 o código é preto sobre branco, seja qual for a cor da loja", () => {
    expect(FOLHA).toMatch(
      /\.sc-codigo__fundo\s*\{[^}]*fill:\s*var\(--cor-tinta-extrema-clara\)/,
    );
    expect(FOLHA).toMatch(
      /\.sc-codigo__modulos\s*\{[^}]*fill:\s*var\(--cor-tinta-extrema-escura\)/,
    );
  });
});

describe("os quatro estados da parede (P-011)", () => {
  it("@principle:P-011 enquanto não há catálogo nenhum, a tela diz que está carregando", () => {
    const tela = ligar({ catalogoInicial: null, buscar: pendente });

    expect(tela.querySelector('[role="status"]')?.textContent).toContain(
      "Carregando o cardápio",
    );
  });

  it("@principle:P-011 sem catálogo e sem rede, a tela mostra erro e promete tentar sozinha", async () => {
    const tela = ligar({ catalogoInicial: null, buscar: async () => semRede });
    await esperar(0);

    const alerta = tela.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain("não carregou");
    expect(alerta?.textContent).toContain("sozinha");
    expect(tela.querySelector("button")).toBeNull();
  });

  it("@principle:P-011 catálogo sem produto disponível explica que está sendo montado", () => {
    const vazio: CatalogoDaVitrineNoContrato = {
      secoes: [
        {
          ...CATALOGO.secoes[0]!,
          produtos: [produto({ disponivel: false })],
        },
      ],
      destaques: [],
      versao: "1",
    };
    const lido = comoSeLe(desenhar({ catalogoInicial: vazio }));

    expect(lido).toContain("está sendo montado");
    expect(lido).not.toContain("Coxinha");
  });

  it("@principle:P-011 com catálogo, a tela mostra o rodízio", () => {
    expect(comoSeLe(desenhar())).toContain("Coxinha");
  });
});

describe("acessibilidade da exibição (P-012)", () => {
  const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);
  const descrever = (violacao: Result): string =>
    `${violacao.impact}: ${violacao.id} — ${violacao.help} (${violacao.nodes
      .map((no) => no.target.join(" "))
      .slice(0, 3)
      .join(" · ")})`;

  async function avaliar(html: string): Promise<axe.AxeResults> {
    document.documentElement.lang = "pt-BR";
    document.title = "Cardápio na TV · Sabor & Cia";
    document.body.className = "sc-raiz";
    document.body.innerHTML = html;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => null,
    });
    const resultado = await axe.run(document, {
      rules: { "color-contrast": { enabled: false } },
    });
    document.body.innerHTML = "";
    return resultado;
  }

  it("@spec:AC-926 @principle:P-012 sem violação crítica nem séria, no rodízio e nos estados", async () => {
    for (const html of [
      desenhar(),
      desenhar({ catalogoInicial: { secoes: [], destaques: [], versao: "1" } }),
    ]) {
      const resultado = await avaliar(html);
      const avaliadas = resultado.passes.length + resultado.violations.length;
      expect(avaliadas).toBeGreaterThan(0);
      const graves = resultado.violations.filter((violacao) =>
        NIVEIS_QUE_REPROVAM.has(violacao.impact ?? ""),
      );
      expect(graves.map(descrever)).toEqual([]);
    }
  });

  it("@principle:P-012 os títulos não pulam nível e o código tem nome acessível", () => {
    const html = desenhar();

    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h3");
    expect(html).toMatch(/<svg[^>]*aria-label="Código para abrir/);
  });

  it("@principle:P-012 quem pediu menos movimento recebe a tela nova inteira, sem animação", () => {
    expect(FOLHA).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.sc-exibicao__lista[^}]*\{\s*animation:\s*none/,
    );
  });
});
