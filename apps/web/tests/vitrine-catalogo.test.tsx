// @vitest-environment jsdom
/**
 * Prova da vitrine: filtro por categoria, destaques e loja sem produto
 * (AC-405, AC-406, AC-407).
 *
 * O DESENHO É `renderToStaticMarkup`, e isso é a prova em si: é exatamente o
 * que o servidor entrega antes de qualquer script rodar. Um filtro que só
 * funciona depois do JavaScript passaria num teste que monta o componente no
 * navegador e reprovaria na fila do ônibus — que é onde a vitrine é usada.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import axe, { type Result } from "axe-core";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import { AbasDeCategoria } from "../src/features/vitrine/AbasDeCategoria";
import { Destaques } from "../src/features/vitrine/Destaques";
import { GradeDeProdutos } from "../src/features/vitrine/GradeDeProdutos";
import { prepararCatalogo } from "../src/server/catalogo-na-tela";

const LOJA = "sabor-e-cia";

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
      ],
    },
    {
      id: "bbbbbbbb-2222-4222-8222-222222222222",
      apelido: "bebidas",
      nome: "Bebidas",
      produtos: [
        produto({
          id: "33333333-3333-4333-8333-333333333333",
          apelido: "guarana",
          nome: "Guaraná",
          chamada: null,
          precoCentavos: 600,
        }),
      ],
    },
  ],
  destaques: [
    produto({
      id: "44444444-4444-4444-8444-444444444444",
      apelido: "pastel",
      nome: "Pastel de feira",
      destaque: true,
      precoCentavos: 1200,
      precoAnteriorCentavos: 1500,
    }),
  ],
  versao: "42",
};

/** Monta a vitrine inteira como a página a monta, e devolve o HTML. */
function desenharVitrine(categoria?: string): string {
  const naTela = prepararCatalogo(CATALOGO, {
    apelidoDaLoja: LOJA,
    categoriaEscolhida: categoria ?? null,
  });

  return renderToStaticMarkup(
    <>
      <AbasDeCategoria
        abas={naTela.abas}
        filtroEmVigor={naTela.filtroEmVigor}
      />
      <Destaques destaques={naTela.destaques} />
      {naTela.secoes.map((secao, indice) => (
        <GradeDeProdutos key={secao.id} secao={secao} primeira={indice === 0} />
      ))}
    </>,
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

describe("o cardápio chega pronto do servidor (AC-404)", () => {
  it("@spec:AC-404 as seções aparecem na ordem do dono, com os produtos delas", () => {
    const lido = comoSeLe(desenharVitrine());

    expect(lido).toContain("Salgados");
    expect(lido).toContain("Coxinha");
    expect(lido).toContain("Bebidas");
    expect(lido).toContain("Guaraná");
    // A ordem é a que o dono definiu, e a API já devolveu ordenada.
    expect(lido.indexOf("Salgados")).toBeLessThan(lido.indexOf("Bebidas"));
  });

  it("@spec:AC-404 o preço é escrito pelo servidor, e não montado na tela", () => {
    // Dinheiro é centavo inteiro (P-005), e quem o escreve é `packages/core`.
    // Se a tela passasse a fazer a conta, este teste continuaria passando — o
    // que ele guarda é o RESULTADO, e a fronteira é guardada pelo ESLint.
    const lido = comoSeLe(desenharVitrine());

    expect(lido).toContain("R$ 7,50");
    expect(lido).toContain("R$ 9,00");
    expect(lido).not.toContain("750");
  });

  it("@spec:AC-404 produto sem preço único convida a ver as opções, em vez de inventar um valor", () => {
    const semPreco = {
      ...CATALOGO,
      secoes: [
        {
          ...CATALOGO.secoes[0]!,
          produtos: [produto({ precoCentavos: null })],
        },
      ],
      destaques: [],
    };
    const naTela = prepararCatalogo(semPreco, { apelidoDaLoja: LOJA });
    const html = renderToStaticMarkup(
      <GradeDeProdutos secao={naTela.secoes[0]!} />,
    );

    expect(comoSeLe(html)).toContain("Ver opções");
    expect(comoSeLe(html)).not.toContain("R$ 0,00");
  });
});

describe("filtrar por categoria mostra só aquela seção (AC-405)", () => {
  it("@spec:AC-405 escolher Bebidas deixa na tela apenas os produtos de Bebidas", () => {
    const lido = comoSeLe(desenharVitrine("bebidas"));

    expect(lido).toContain("Guaraná");
    expect(lido).not.toContain("Coxinha");
    expect(lido).not.toContain("Empada");
  });

  it("@spec:AC-405 o filtro em vigor fica visível, em palavras e não só em cor", () => {
    const html = desenharVitrine("bebidas");

    // Em palavras, para quem não distingue a cor da aba (P-012)...
    expect(comoSeLe(html)).toContain("Mostrando Bebidas");
    // ...e em `aria-current`, para quem ouve a página.
    expect(html).toContain('aria-current="page"');
  });

  it("@spec:AC-405 dá para voltar a todas as categorias com um toque", () => {
    const html = desenharVitrine("bebidas");

    // O caminho de volta é um LINK para o endereço sem filtro: um toque, sem
    // script, e o buscador o segue.
    expect(html).toContain(`href="/loja/${LOJA}/cardapio"`);
    expect(comoSeLe(html)).toContain("Todas");
  });

  it("@spec:AC-405 cada aba é um link de verdade, e não um botão que precisa de script", () => {
    const html = desenharVitrine();

    expect(html).toContain(`href="/loja/${LOJA}/cardapio?categoria=bebidas"`);
    expect(html).toContain(`href="/loja/${LOJA}/cardapio?categoria=salgados"`);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("onclick");
  });

  it("@spec:AC-405 com filtro em vigor, os destaques saem da tela", () => {
    // O AC-405 promete APENAS os produtos daquela categoria. Um destaque de
    // outra seção continuar no topo desmentiria a promessa na primeira tela.
    const lido = comoSeLe(desenharVitrine("bebidas"));

    expect(lido).not.toContain("Pastel de feira");
    expect(lido).not.toContain("Destaques");
  });

  it("@spec:AC-405 categoria desconhecida no endereço não derruba a página", () => {
    const naTela = prepararCatalogo(CATALOGO, {
      apelidoDaLoja: LOJA,
      categoriaEscolhida: "sobremesas-que-nao-existem",
    });

    expect(naTela.filtroSemAcerto).toBe(true);
    // As abas continuam inteiras: a saída está sempre à mão.
    expect(naTela.abas.map((a) => a.nome)).toContain("Bebidas");
  });

  it("@spec:AC-405 loja com uma seção só não ganha faixa de filtro", () => {
    // Filtrar entre uma opção é enfeite ocupando o topo da tela — que é o
    // espaço mais caro da vitrine no celular.
    const umaSecao = { ...CATALOGO, secoes: [CATALOGO.secoes[0]!] };
    const naTela = prepararCatalogo(umaSecao, { apelidoDaLoja: LOJA });
    const html = renderToStaticMarkup(
      <AbasDeCategoria
        abas={naTela.abas}
        filtroEmVigor={naTela.filtroEmVigor}
      />,
    );

    expect(html).toBe("");
  });
});

describe("os destaques ficam em área própria no topo (AC-406)", () => {
  it("@spec:AC-406 os destaques aparecem em seção própria, antes do cardápio", () => {
    const html = desenharVitrine();
    const lido = comoSeLe(html);

    expect(lido).toContain("Destaques");
    expect(lido).toContain("Pastel de feira");

    // Antes da primeira seção do cardápio, e não misturado a ela. A comparação
    // é entre BLOCOS na marcação, e não entre palavras no texto lido: "Salgados"
    // aparece antes como ABA do filtro, e comparar o texto encontraria a aba em
    // vez da seção — um teste que reprovaria por motivo errado.
    expect(html.indexOf('class="sc-vitrine__destaques"')).toBeLessThan(
      html.indexOf('class="sc-vitrine__secao"'),
    );
  });

  it("@spec:AC-406 cada destaque leva ao produto correspondente", () => {
    const html = desenharVitrine();

    expect(html).toContain(
      `href="/loja/${LOJA}/produto/44444444-4444-4444-8444-444444444444"`,
    );
  });

  it("@spec:AC-406 a tira é navegável sem script, e alcançável pelo teclado", () => {
    // O encaixe do dedo é do CSS (`scroll-snap`); o que a marcação precisa
    // garantir é que quem não usa apontador chegue ao que está fora da vista.
    const html = desenharVitrine();

    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain("onclick");
  });

  it("@spec:AC-406 loja sem destaque não ganha faixa vazia com título", () => {
    const html = renderToStaticMarkup(<Destaques destaques={[]} />);

    expect(html).toBe("");
  });

  it("@spec:AC-406 a promoção é contada em palavras, e não só com o riscado", () => {
    // Riscado é estilo, e estilo não chega a quem ouve a página.
    const lido = comoSeLe(desenharVitrine());

    expect(lido).toContain("De R$ 15,00");
    expect(lido).toContain("por R$ 12,00");
  });

  it("@spec:AC-406 preço anterior menor que o atual não vira promessa de promoção", () => {
    const naTela = prepararCatalogo(
      {
        ...CATALOGO,
        destaques: [
          produto({ precoCentavos: 1200, precoAnteriorCentavos: 1000 }),
        ],
      },
      { apelidoDaLoja: LOJA },
    );

    expect(naTela.destaques[0]?.precoAnterior).toBeNull();
  });
});

describe("loja sem produto não parece quebrada (AC-407)", () => {
  it("@spec:AC-407 loja recém-criada é reconhecida como sem catálogo", () => {
    const vazio: CatalogoDaVitrineNoContrato = {
      secoes: [],
      destaques: [],
      versao: "1",
    };

    expect(
      prepararCatalogo(vazio, { apelidoDaLoja: LOJA }).lojaSemCatalogo,
    ).toBe(true);
  });

  it("@spec:AC-407 loja com seções criadas e nada publicado também é loja sem catálogo", () => {
    // Para quem abre a vitrine, categoria vazia e loja vazia são a mesma coisa:
    // não há o que pedir. A mensagem tem de ser a mesma.
    const soSecoes: CatalogoDaVitrineNoContrato = {
      secoes: [
        { ...CATALOGO.secoes[0]!, produtos: [] },
        { ...CATALOGO.secoes[1]!, produtos: [] },
      ],
      destaques: [],
      versao: "1",
    };

    expect(
      prepararCatalogo(soSecoes, { apelidoDaLoja: LOJA }).lojaSemCatalogo,
    ).toBe(true);
  });

  it("@spec:AC-407 seção vazia no meio de um cardápio cheio explica, em vez de deixar branco", () => {
    const naTela = prepararCatalogo(
      { ...CATALOGO, secoes: [{ ...CATALOGO.secoes[1]!, produtos: [] }] },
      { apelidoDaLoja: LOJA },
    );
    const lido = comoSeLe(
      renderToStaticMarkup(<GradeDeProdutos secao={naTela.secoes[0]!} />),
    );

    expect(lido).toContain("Ainda não há nada aqui");
  });
});

describe("produto esgotado é visto, e não escondido", () => {
  it("@spec:AC-404 o produto que acabou continua na grade, marcado", () => {
    // Sumir com o que acabou faz a vitrine encolher sozinha ao longo do dia, e
    // quem procurou a coxinha de ontem conclui que a loja parou de vendê-la.
    const naTela = prepararCatalogo(
      {
        ...CATALOGO,
        secoes: [
          {
            ...CATALOGO.secoes[0]!,
            produtos: [produto({ disponivel: false })],
          },
        ],
        destaques: [],
      },
      { apelidoDaLoja: LOJA },
    );
    const html = renderToStaticMarkup(
      <GradeDeProdutos secao={naTela.secoes[0]!} />,
    );

    expect(comoSeLe(html)).toContain("Coxinha");
    expect(comoSeLe(html)).toContain("Esgotado");
  });
});

describe("acessibilidade da vitrine (AC-405, AC-406)", () => {
  const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);
  let violacoes: Result[] = [];
  let avaliadas = 0;

  beforeAll(async () => {
    // `h1` de mentira só para a hierarquia da página existir: os componentes
    // começam no nível 2 por desenho, porque o título da página é a página.
    document.body.innerHTML = `<main><h1>Cardápio</h1>${desenharVitrine()}</main>`;

    const resultado = await axe.run(document.body);
    violacoes = resultado.violations;
    avaliadas = resultado.passes.length + resultado.violations.length;
  });

  it("@spec:AC-405 @principle:P-012 sem violação crítica nem séria", () => {
    // Sem esta primeira asserção, um erro de montagem faria o axe não avaliar
    // nada e o teste passaria com zero violação.
    expect(avaliadas).toBeGreaterThan(0);

    const graves = violacoes
      .filter((v) => NIVEIS_QUE_REPROVAM.has(v.impact ?? ""))
      .map((v) => `${v.id}: ${v.help}`);
    expect(graves, graves.join(" | ")).toEqual([]);
  });

  it("@spec:AC-406 @principle:P-012 a hierarquia de títulos não pula nível", () => {
    const html = `<h1>Cardápio</h1>${desenharVitrine()}`;
    const niveis = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));

    expect(niveis[0]).toBe(1);
    for (let i = 1; i < niveis.length; i += 1) {
      expect((niveis[i] ?? 0) - (niveis[i - 1] ?? 0)).toBeLessThanOrEqual(1);
    }
  });
});
