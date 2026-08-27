// @vitest-environment jsdom
/**
 * Prova da busca na vitrine, do lado da tela (AC-408, AC-409, AC-415).
 *
 * O DESENHO É `renderToStaticMarkup`, e isso é a prova em si: é exatamente o
 * que o servidor entrega antes de qualquer script rodar. Uma busca que só
 * funciona depois do JavaScript passaria num teste que monta o componente no
 * navegador e reprovaria na fila do ônibus — que é onde a vitrine é usada.
 *
 * O QUE ESTE ARQUIVO NÃO PROVA é o casamento em si: "pao" achar "Pão" é do
 * índice de texto do PostgreSQL, e está provado contra banco de verdade em
 * `apps/api/tests/busca-vitrine.int.test.ts`. Aqui o servidor já mandou o
 * catálogo filtrado, e o que se prova é o que a tela faz com ele.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import axe, { type Result } from "axe-core";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import { AbasDeCategoria } from "../src/features/vitrine/AbasDeCategoria";
import {
  BuscaProduto,
  SemResultado,
} from "../src/features/vitrine/BuscaProduto";
import { GradeDeProdutos } from "../src/features/vitrine/GradeDeProdutos";
import { prepararCatalogo } from "../src/server/catalogo-na-tela";

const LOJA = "sabor-e-cia";
const ROTULO = "Cardápio";

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

/** O que a API devolve quando "coxinha" casa: só a seção que teve acerto. */
const SO_SALGADOS: CatalogoDaVitrineNoContrato = {
  secoes: [
    {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      apelido: "salgados",
      nome: "Salgados",
      produtos: [produto()],
    },
  ],
  // Sem destaque: com busca valendo, o servidor não os manda (AC-408).
  destaques: [],
  versao: "1",
};

/** O que a API devolve quando nada casa: nenhuma seção. */
const NADA: CatalogoDaVitrineNoContrato = {
  secoes: [],
  destaques: [],
  versao: "1",
};

function desenharBusca(termo: string | null): string {
  return renderToStaticMarkup(
    <BuscaProduto
      acao={`/l/${LOJA}/catalogo`}
      termo={termo}
      rotuloDoCatalogo={ROTULO}
    />,
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

describe("a busca funciona sem script (AC-408, AC-415)", () => {
  it("@spec:AC-415 é um formulário GET, e não um campo que depende de JavaScript", () => {
    const html = desenharBusca(null);

    // `method="get"` E uma ação de verdade: com os dois, apertar enter navega
    // sozinho. Sem eles, o campo é um enfeite até o script chegar — e o AC-415
    // proíbe exatamente isso na vitrine.
    expect(html).toContain('method="get"');
    expect(html).toContain(`action="/l/${LOJA}/catalogo"`);
    expect(html).toContain('name="busca"');
  });

  it("@spec:AC-408 o campo abre preenchido com o termo que está valendo", () => {
    const html = desenharBusca("coxinha");

    // Sem isto, refinar a busca obriga a digitar tudo de novo: a pessoa volta
    // para um campo vazio depois de já ter procurado.
    expect(html).toContain('value="coxinha"');
  });

  it("@spec:AC-408 o campo abre vazio quando não há busca", () => {
    expect(desenharBusca(null)).toContain('value=""');
  });

  it("@spec:AC-408 tem botão de enviar, para quem não descobre que enter busca", () => {
    // O botão não é redundante com o enter: sem script, ele é a única forma
    // visível de enviar — e no celular o enter do teclado não é óbvio.
    expect(desenharBusca(null)).toContain('type="submit"');
  });

  it("@spec:AC-408 o campo tem rótulo, mesmo com o placeholder dizendo o mesmo", () => {
    const html = desenharBusca(null);

    // Placeholder SOME quando a pessoa digita, e não é lido como rótulo por
    // todo leitor de tela. O `<label>` fica, e é ele que responde "o que é
    // este campo?" depois da primeira letra.
    expect(html).toContain("<label");
    expect(html).toContain('for="busca-na-vitrine"');
    expect(html).toContain('id="busca-na-vitrine"');
  });

  it("@spec:AC-408 o rótulo usa o vocabulário do ramo da loja", () => {
    // Loja de roupa não tem cardápio. O rótulo vem da loja, e não do código.
    const html = renderToStaticMarkup(
      <BuscaProduto
        acao={`/l/${LOJA}/catalogo`}
        termo={null}
        rotuloDoCatalogo="Catálogo"
      />,
    );

    expect(comoSeLe(html)).toContain("Buscar no catálogo");
    expect(html).not.toContain("cardápio");
  });
});

describe("o resultado vem agrupado por categoria (AC-408)", () => {
  it("@spec:AC-408 mostra só as seções que o servidor devolveu", () => {
    const naTela = prepararCatalogo(SO_SALGADOS, {
      apelidoDaLoja: LOJA,
      termoBuscado: "coxinha",
    });

    const html = renderToStaticMarkup(
      <>
        {naTela.secoes.map((secao, indice) => (
          <GradeDeProdutos
            key={secao.id}
            secao={secao}
            primeira={indice === 0}
          />
        ))}
      </>,
    );

    const lido = comoSeLe(html);
    expect(lido).toContain("Salgados");
    expect(lido).toContain("Coxinha");
    expect(lido).not.toContain("Bebidas");
  });

  it("@spec:AC-408 resultado vazio NÃO é lido como loja sem catálogo", () => {
    const naTela = prepararCatalogo(NADA, {
      apelidoDaLoja: LOJA,
      termoBuscado: "bicicleta",
    });

    // A DIFERENÇA É O QUE A TELA DIZ. Uma loja cheia que não vende bicicleta
    // não pode receber "o cardápio está sendo montado": isso descreveria a
    // loja, e não a busca — e o dono veria o catálogo dele sumir por uma
    // palavra que um visitante digitou.
    expect(naTela.lojaSemCatalogo).toBe(false);
    expect(naTela.buscaSemAcerto).toBe(true);
  });

  it("@spec:AC-407 loja sem produto nenhum continua sendo loja sem catálogo", () => {
    const naTela = prepararCatalogo(NADA, { apelidoDaLoja: LOJA });

    expect(naTela.lojaSemCatalogo).toBe(true);
    expect(naTela.buscaSemAcerto).toBe(false);
  });

  it("@spec:AC-408 a busca atravessa as abas de categoria", () => {
    const naTela = prepararCatalogo(SO_SALGADOS, {
      apelidoDaLoja: LOJA,
      termoBuscado: "coxinha",
    });

    // Clicar numa aba ESTREITA o resultado; não recomeça. Perder o termo ali
    // obrigaria a digitar de novo a cada aba.
    for (const aba of naTela.abas) {
      expect(aba.link).toContain("busca=coxinha");
    }
  });

  it("@spec:AC-408 sem busca, as abas não carregam parâmetro nenhum", () => {
    const naTela = prepararCatalogo(SO_SALGADOS, { apelidoDaLoja: LOJA });

    expect(naTela.abas[0]?.link).toBe(`/l/${LOJA}/catalogo`);
  });

  it("@spec:AC-408 o termo é escapado antes de entrar no endereço", () => {
    const naTela = prepararCatalogo(SO_SALGADOS, {
      apelidoDaLoja: LOJA,
      termoBuscado: "pão & cia",
    });

    // Sem escape, o `&` cortaria o endereço no meio e o segundo pedaço viraria
    // outro parâmetro — a busca chegaria ao servidor como "pão ".
    expect(naTela.abas[0]?.link).toContain("busca=p%C3%A3o%20%26%20cia");
  });
});

describe("nada encontrado diz o termo e oferece a saída (AC-409)", () => {
  const html = renderToStaticMarkup(
    <SemResultado
      termo="bicicleta"
      linkDeTodos={`/l/${LOJA}/catalogo`}
      rotuloDoCatalogo={ROTULO}
    />,
  );

  it("@spec:AC-409 repete o termo digitado na mensagem", () => {
    // "Nada encontrado" sozinho deixa a dúvida entre erro de digitação, busca
    // quebrada e loja que não vende. Repetir o termo responde as três.
    expect(comoSeLe(html)).toContain("bicicleta");
  });

  it("@spec:AC-409 oferece um link de verdade para limpar a busca", () => {
    // Link, e não botão: sem script, um `<button>` aqui não leva a lugar
    // nenhum, e vazio sem caminho de volta é beco sem saída.
    expect(html).toContain(`href="/l/${LOJA}/catalogo"`);
    expect(comoSeLe(html)).toContain("Limpar a busca");
  });

  it("@spec:AC-409 o link de limpar a busca não carrega o termo de volta", () => {
    const naTela = prepararCatalogo(NADA, {
      apelidoDaLoja: LOJA,
      termoBuscado: "bicicleta",
    });

    // `linkDeTodas` mantém a busca e troca a categoria; `linkSemBusca` desfaz
    // tudo. Trocar os dois aqui devolveria a pessoa à mesma tela vazia.
    expect(naTela.linkSemBusca).toBe(`/l/${LOJA}/catalogo`);
    expect(naTela.linkDeTodas).toContain("busca=bicicleta");
  });
});

describe("acessibilidade da busca (AC-408, P-012)", () => {
  const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);
  let violacoes: Result[] = [];
  let avaliadas = 0;

  beforeAll(async () => {
    document.body.innerHTML = `<main><h1>Cardápio</h1>${desenharBusca(
      "coxinha",
    )}${renderToStaticMarkup(
      <SemResultado
        termo="coxinha"
        linkDeTodos={`/l/${LOJA}/catalogo`}
        rotuloDoCatalogo={ROTULO}
      />,
    )}</main>`;

    const resultado = await axe.run(document.body);
    violacoes = resultado.violations;
    avaliadas = resultado.passes.length + resultado.violations.length;
  });

  it("@spec:AC-408 @principle:P-012 sem violação crítica nem séria", () => {
    // Sem esta primeira asserção, um erro de montagem faria o axe não avaliar
    // nada e o teste passaria com zero violação.
    expect(avaliadas).toBeGreaterThan(0);

    const graves = violacoes
      .filter((v) => NIVEIS_QUE_REPROVAM.has(v.impact ?? ""))
      .map((v) => `${v.id}: ${v.help}`);
    expect(graves, graves.join(" | ")).toEqual([]);
  });

  it("@spec:AC-408 @principle:P-012 o formulário se anuncia como busca", () => {
    // `role="search"` é o que põe o campo no atalho de regiões do leitor de
    // tela: sem ele, chegar à busca exige percorrer a página inteira.
    expect(desenharBusca(null)).toContain('role="search"');
  });
});

describe("as abas somem quando a busca não deixa o que filtrar (AC-408)", () => {
  it("@spec:AC-408 uma seção sozinha não vira faixa de filtro", () => {
    const naTela = prepararCatalogo(SO_SALGADOS, {
      apelidoDaLoja: LOJA,
      termoBuscado: "coxinha",
    });

    // Com "Todas" + uma seção, filtrar não muda nada — e a faixa ocuparia o
    // topo da tela, que é o espaço mais caro da vitrine no celular.
    const html = renderToStaticMarkup(
      <AbasDeCategoria
        abas={naTela.abas}
        filtroEmVigor={naTela.filtroEmVigor}
      />,
    );

    expect(html).toBe("");
  });
});
