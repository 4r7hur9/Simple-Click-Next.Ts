import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  contarFiltros,
  lerArquivo,
  lerFolha,
  regrasDe,
  semComentarios,
} from "./apoio-css";

/**
 * Onde o vidro (card #153) está e onde NÃO está nas folhas do `packages/ui`.
 *
 * O dono do fundo, da sombra e do desfoque de cada superfície é o vidro.css:
 * se outra folha, importada depois, declarasse um `background` para o mesmo
 * seletor, ela repintaria a superfície e o vidro sumiria sem aviso.
 */

const url = (nome: string): URL =>
  new URL(`../styles/${nome}`, import.meta.url);
const bruto = (nome: string): string =>
  readFileSync(fileURLToPath(url(nome)), "utf8");
const folha = (nome: string) => lerFolha(lerArquivo(url(nome)));

/** As folhas de superfície que ficam em `packages/ui/styles` e vêm depois do vidro. */
const FOLHAS = [
  "conta.css",
  "sobre.css",
  "produto.css",
  "legal.css",
  "pedidos.css",
  "fechamento.css",
  "vitrine.css",
] as const;

/** As superfícies cujo fundo, sombra e desfoque são do vidro.css. */
const HOSTS = [
  ".sc-acesso-janela",
  ".sc-sobre-janela",
  ".sc-cookies",
  ".sc-sacola-barra",
  ".sc-janela-pedido",
  ".sc-painel",
  ".sc-aviso-rapido__texto",
  ".sc-janela-produto",
  ".sc-flutuante__gaveta.sc-carrinho-janela",
  ".sc-gaveta-modal.sc-conta-modal",
] as const;

const PINTURAS = [
  "background",
  "background-color",
  "background-image",
  "box-shadow",
  "backdrop-filter",
  "-webkit-backdrop-filter",
] as const;

describe("um dono para o vidro de cada superfície", () => {
  for (const arquivo of FOLHAS) {
    it(`[CA-5] ${arquivo} não repinta fundo, sombra nem desfoque de uma superfície de vidro`, () => {
      const f = folha(arquivo);
      for (const host of HOSTS) {
        for (const regra of regrasDe(f, host)) {
          // `::before`, `::backdrop` e estados têm outro seletor: não entram aqui.
          for (const propriedade of PINTURAS) {
            expect(
              regra.declaracoes.has(propriedade),
              `${arquivo}: ${host} declara ${propriedade}`,
            ).toBe(false);
          }
        }
      }
    });
  }

  it("[CA-5] os dois lados do par -webkit- estão em todas as folhas tocadas", () => {
    for (const arquivo of [
      "vidro.css",
      ...FOLHAS,
      "stories.css",
      "narrativa.css",
      "landing.css",
    ]) {
      const { puro, webkit } = contarFiltros(lerArquivo(url(arquivo)));
      expect(webkit, `${arquivo}: -webkit-backdrop-filter`).toBe(puro);
    }
  });

  it("[CA-5] a barra da sacola e o painel de ordem seguem o nível certo: forte e médio", () => {
    const vidro = folha("vidro.css");
    const nivel = (host: string): string | undefined =>
      regrasDe(vidro, host)
        .filter((r) => r.contexto.length === 0)
        .map((r) => r.declaracoes.get("--v-opacidade"))
        .find((v) => v !== undefined);
    expect(nivel(".sc-sacola-barra")).toBe("var(--vidro-opacidade-forte)");
    expect(nivel(".sc-painel")).toBe("var(--vidro-opacidade-medio)");
    expect(nivel(".sc-janela-pedido")).toBe("var(--vidro-opacidade-medio)");
  });
});

describe("Minha conta em destaque", () => {
  const conta = folha("conta.css");
  const vidro = folha("vidro.css");

  it("[CA-6] a janela é a gaveta do DS no nível forte, com o desfoque na camada", () => {
    const gaveta = regrasDe(
      vidro,
      ".sc-gaveta-modal:not(.sc-gaveta-modal--embutida)",
    ).filter((r) => r.contexto.length === 0);
    expect(gaveta.some((r) => r.declaracoes.has("background-color"))).toBe(
      true,
    );

    const forte = regrasDe(vidro, ".sc-gaveta-modal")[0]!.declaracoes;
    expect(forte.get("--v-sombra")).toBe("var(--vidro-sombra-forte)");
    expect(forte.get("--v-filtro")).toBe("var(--vidro-filtro-forte)");
    expect(forte.get("--v-opacidade")).toBe("var(--vidro-opacidade-forte)");
  });

  it("[CA-6] a aresta de cima ganha um toque do verde da marca (--cor-primaria)", () => {
    const regras = regrasDe(conta, ".sc-gaveta-modal.sc-conta-modal::before");
    expect(regras).toHaveLength(1);
    const sombra = regras[0]!.declaracoes.get("box-shadow")!;
    expect(sombra).toContain("--cor-primaria");
    expect(sombra).toContain("--vidro-realce");
  });

  it("[CA-6] o fundo da página escurece com --vidro-sobreposicao e só desfoca de 48rem em diante", () => {
    const regras = regrasDe(conta, ".sc-gaveta-modal.sc-conta-modal::backdrop");
    const semMedia = regras.filter((r) => r.contexto.length === 0);
    const comMedia = regras.filter((r) =>
      r.contexto.some((c) => c.includes("min-width: 48rem")),
    );

    expect(semMedia).toHaveLength(1);
    expect(semMedia[0]!.declaracoes.get("background-color")).toBe(
      "var(--vidro-sobreposicao)",
    );
    expect(semMedia[0]!.declaracoes.has("backdrop-filter")).toBe(false);

    expect(comMedia).toHaveLength(1);
    expect(comMedia[0]!.declaracoes.get("backdrop-filter")).toBe(
      "blur(var(--vidro-desfoque-do-fundo))",
    );
    expect(comMedia[0]!.declaracoes.get("-webkit-backdrop-filter")).toBe(
      "blur(var(--vidro-desfoque-do-fundo))",
    );
  });

  it("[CA-6] a página de fundo continua sem rolar e o tamanho do modal não mudou", () => {
    const texto = conta.texto;
    expect(texto).toContain("html:has(.sc-conta-modal[open])");
    expect(texto).toContain(".sc-gaveta-modal.sc-conta-modal");
    expect(texto).toMatch(/inset: 0;\s*margin: auto;\s*inline-size: 100%;/);
  });

  it("[CA-6] a borda da janela centrada é a do vidro, e não a borda sólida de antes", () => {
    const bordas = regrasDe(conta, ".sc-gaveta-modal.sc-conta-modal")
      .map((r) => r.declaracoes.get("border"))
      .filter((v) => v !== undefined);
    expect(bordas).toContain("1px solid var(--vidro-borda)");
    expect(bordas.join(" ")).not.toContain("--cor-borda");
  });
});

describe("onde NÃO há desfoque", () => {
  it("[CA-7] o filtro do desktop é um bloco estático da lateral: sem desfoque e sem sombra", () => {
    const vitrine = folha("vitrine.css");
    const regra = regrasDe(vitrine, ".sc-catalogo .sc-painel--ajustes").find(
      (r) => r.declaracoes.get("position") === "static",
    )!;
    expect(regra).toBeDefined();
    expect(regra.declaracoes.get("backdrop-filter")).toBe("none");
    expect(regra.declaracoes.get("-webkit-backdrop-filter")).toBe("none");
    expect(regra.declaracoes.get("box-shadow")).toBe("none");
  });

  it("[CA-7] campos, botões, cartões e listas do DS não ganharam desfoque", () => {
    const componentes = lerArquivo(url("componentes.css"));
    const info = lerArquivo(url("info.css"));
    const calendario = lerArquivo(url("calendario.css"));
    for (const texto of [componentes, info, calendario]) {
      const { puro, webkit } = contarFiltros(texto);
      expect(puro + webkit).toBe(0);
    }
  });
});

describe("o vidro solto que já existia", () => {
  it("[CA-10] os controles do editor de stories leem o token, com o mesmo valor visual", () => {
    expect(bruto("stories.css")).toContain(
      "--sc-story-vidro: var(--vidro-sobre-midia);",
    );
    const tema = lerArquivo(url("theme.css"));
    expect(tema).toContain("--vidro-sobre-midia: rgb(255 255 255 / 14%);");
  });

  it("[CA-10] o selo da loja e o topo da landing usam os tokens, e o fundo deles segue a opacidade do token", () => {
    for (const [arquivo, seletor, opacidade] of [
      ["narrativa.css", ".sc-loja__situacao", "--vidro-opacidade-leve"],
      ["landing.css", ".sc-lp-topo", "--vidro-opacidade-medio"],
    ] as const) {
      const regra = regrasDe(folha(arquivo), seletor)[0]!;
      expect(regra.declaracoes.get("backdrop-filter")).toBe(
        "var(--vidro-filtro-leve)",
      );
      expect(regra.declaracoes.get("-webkit-backdrop-filter")).toBe(
        "var(--vidro-filtro-leve)",
      );
      expect(regra.declaracoes.get("background")).toContain(opacidade);
      expect(semComentarios(bruto(arquivo))).not.toMatch(/blur\(\d/);
    }
  });

  it("[CA-10] os comentários que diziam 'proibido' foram atualizados, e a exceção está registrada", () => {
    expect(bruto("sobre.css")).not.toContain("proibido no projeto");
    expect(bruto("conta.css")).not.toContain(
      "Sem `backdrop-filter`: o fundo escurece só com cor",
    );
    const cabecalho = bruto("vidro.css").slice(0, 3000);
    expect(cabecalho).toContain("AC-950");
    expect(cabecalho).toContain("EXCEÇÃO");
  });
});
