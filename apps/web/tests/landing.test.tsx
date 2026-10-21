// @vitest-environment jsdom
/**
 * Prova da landing ("/").
 *
 * A página é desenhada por `renderToStaticMarkup`: é o que o servidor entrega
 * antes de qualquer script. Se está aqui, está para quem bloqueia script, para
 * quem caiu de rede no meio, e para o buscador.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import axe, { type Result } from "axe-core";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { Contador, partesDoContador } from "../src/features/landing/Contador.tsx";
import {
  COMPARACAO,
  EMPRESAS_DA_COMPARACAO,
  FONTES_DA_COMPARACAO,
  LINK_PARA_COMECAR,
  LINK_PARA_ENTRAR,
} from "../src/features/landing/conteudo.ts";
import {
  custoNoAplicativo,
  emReais,
} from "../src/features/landing/custo-do-aplicativo.ts";
import { LandingDoSimpleClick } from "../src/features/landing/LandingDoSimpleClick.tsx";
import { TELAS_DO_APP } from "../src/features/landing/telas-do-app.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PUBLICO = join(AQUI, "../public");
const PASTA_DA_LANDING = join(AQUI, "../src/features/landing");

const html = () => renderToStaticMarkup(<LandingDoSimpleClick />);

function comoSeLe(marcacao: string): string {
  const caixa = document.createElement("div");
  caixa.innerHTML = marcacao;
  return (caixa.textContent ?? "").replace(/\s+/g, " ");
}

/** Todos os arquivos de código da landing, inclusive em subpastas. */
function arquivosDaLanding(pasta = PASTA_DA_LANDING): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDaLanding(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe("a página chega inteira do servidor", () => {
  it("tem um título principal e o caminho para criar a loja", () => {
    const marcacao = html();
    expect(marcacao.match(/<h1\b/g)).toHaveLength(1);
    expect(marcacao).toContain(`href="${LINK_PARA_COMECAR.replace("&", "&amp;")}"`);
    expect(comoSeLe(marcacao)).toContain("Criar minha loja grátis");
  });

  it("todas as seções do menu existem", () => {
    const marcacao = html();
    for (const ancora of ["como-funciona", "por-dentro", "taxas", "comparar", "preco"]) {
      expect(marcacao).toContain(`href="#${ancora}"`);
      expect(marcacao).toContain(`id="${ancora}"`);
    }
  });

  it("a história é contada em texto: vitrine, pedido, painel e ramos", () => {
    const lido = comoSeLe(html());
    for (const frase of [
      "Seu cardápio. Seu link. Seu lucro.",
      "Tirou a foto, já está à venda.",
      "O cliente pede em três toques.",
      "Pedido novo apita no seu balcão.",
      "O dia inteiro numa tela só.",
      "Do hambúrguer…",
      "…à autopeça.",
    ]) {
      expect(lido).toContain(frase);
    }
  });

  it("fala a língua de quem tem loja", () => {
    const lido = comoSeLe(html()).toLowerCase();
    for (const jargao of ["multi-tenant", "saas", "headless", "isolamento"]) {
      expect(lido, `jargão na landing: ${jargao}`).not.toContain(jargao);
    }
  });
});

describe("a tipografia das cenas: hierarquia, destaque e cor", () => {
  const caixa = () => {
    const div = document.createElement("div");
    div.innerHTML = html();
    return div;
  };
  const ACENTOS = ["limao", "ambar", "brasa", "aco"];

  it("toda cena tem acento da marca e uma palavra-chave em destaque no título", () => {
    const cenas = [...caixa().querySelectorAll<HTMLElement>(".sc-lp-momento")];
    expect(cenas).toHaveLength(7);
    for (const cena of cenas) {
      expect(ACENTOS, cena.id).toContain(cena.dataset["acento"]);
      const titulo = cena.querySelector(`#${cena.getAttribute("aria-labelledby")}`);
      expect(titulo?.querySelector(".sc-lp-destaque"), cena.id).toBeTruthy();
    }
  });

  it("cada ramo tem a sua cor: brasa no hambúrguer, aço na autopeça", () => {
    const div = caixa();
    expect(div.querySelector<HTMLElement>("#ramos")?.dataset["acento"]).toBe("brasa");
    expect(div.querySelector<HTMLElement>("#autopeca")?.dataset["acento"]).toBe("aco");
    expect(div.querySelector("#ramos .sc-lp-destaque")?.textContent).toBe("hambúrguer");
    expect(div.querySelector("#autopeca .sc-lp-destaque")?.textContent).toBe("autopeça");
  });

  it("as cenas numeradas têm etiqueta com número (decorativo) e rótulo", () => {
    const cenas = [...caixa().querySelectorAll<HTMLElement>(".sc-lp-momento:not([data-cena='0'])")];
    cenas.forEach((cena, i) => {
      const numero = cena.querySelector(".sc-lp-etiqueta__numero");
      expect(numero?.textContent, cena.id).toBe(String(i + 1).padStart(2, "0"));
      expect(numero?.getAttribute("aria-hidden"), cena.id).toBe("true");
      expect(cena.querySelector(".sc-lp-etiqueta__rotulo")?.textContent?.trim(), cena.id).not.toBe("");
    });
  });

  it("cada cena fecha com um detalhe curto: checks, etapas ou trilha", () => {
    for (const cena of caixa().querySelectorAll<HTMLElement>(".sc-lp-momento")) {
      const detalhe = cena.querySelector(".sc-lp-heroi__garantias, .sc-lp-beneficios, .sc-lp-etapas, .sc-lp-trilha");
      expect(detalhe, cena.id).toBeTruthy();
      expect(detalhe!.querySelectorAll("li").length, cena.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("o apoio mostra o benefício em negrito", () => {
    for (const apoio of caixa().querySelectorAll(".sc-lp-heroi__texto, .sc-lp-momento__texto-corrido")) {
      expect(apoio.querySelector("strong")?.textContent?.length ?? 0).toBeGreaterThan(3);
    }
  });

  it("a pontuação nunca fica sozinha no começo da linha depois de um destaque", () => {
    const div = caixa();
    expect(div.querySelector("#pedido .sc-lp-junto")?.textContent).toBe("três toques.");
    for (const destaque of div.querySelectorAll(".sc-lp-destaque, .sc-lp-apoio__forte")) {
      const depois = destaque.nextSibling?.textContent ?? destaque.parentElement?.nextSibling?.textContent ?? "";
      if (destaque.parentElement?.classList.contains("sc-lp-junto")) continue;
      expect(depois, destaque.textContent ?? "").not.toMatch(/^[.,…:;!?]/);
    }
  });

  it("a animação dos destaques só existe para quem aceita movimento", () => {
    const css = readFileSync(join(PASTA_DA_LANDING, "cenas/tipografia.css"), "utf8");
    const [antes, depois = ""] = css.split("@media (prefers-reduced-motion: no-preference)");
    expect(depois).toMatch(/animation:\s*sc-lp-/);
    expect(antes).not.toMatch(/animation:\s*sc-lp-/);
    expect(readFileSync(join(AQUI, "../src/app/page.tsx"), "utf8")).toContain("cenas/tipografia.css");
  });
});

describe("o produto é o protagonista: telas reais e fotos reais", () => {
  it("toda tela citada existe em public/landing/app e é leve", () => {
    for (const nome of Object.keys(TELAS_DO_APP)) {
      const arquivo = join(PUBLICO, "landing/app", `${nome}.webp`);
      expect(existsSync(arquivo), nome).toBe(true);
      expect(readFileSync(arquivo).byteLength, nome).toBeLessThan(150 * 1024);
    }
  });

  it("a página usa as telas reais e as duas fotos de produto", () => {
    const marcacao = html();
    for (const nome of ["cardapio", "produto", "fechamento", "painel-pedidos", "produto-autopecas"]) {
      expect(marcacao).toContain(`/landing/app/${nome}.webp`);
    }
    expect(marcacao).toContain("/landing/produtos/hamburguer-800.webp");
    expect(marcacao).toContain("/landing/produtos/peca-800.webp");
  });

  it("a foto do cartão do cardápio tem posição medida, para o encaixe", () => {
    const { foto } = TELAS_DO_APP.cardapio;
    for (const valor of [foto.x, foto.y, foto.largura, foto.altura]) {
      expect(valor).toBeGreaterThan(0);
      expect(valor).toBeLessThan(1);
    }
  });

  it("só o herói carrega com prioridade; o resto espera a rolagem", () => {
    const marcacao = html();
    const prioridades = marcacao.match(/fetchPriority="high"/gi) ?? [];
    expect(prioridades.length).toBeGreaterThan(0);
    expect(prioridades.length).toBeLessThanOrEqual(4);
    expect(marcacao).toContain('loading="lazy"');
  });

  it("nada de 3D nem de canvas na landing", () => {
    for (const arquivo of arquivosDaLanding()) {
      // A decisão de 3D continua servindo à apresentação da loja (MundoDaLoja).
      if (arquivo.endsWith("podeRodar3D.ts")) continue;
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte, arquivo).not.toMatch(/from "three"/);
      expect(fonte, arquivo).not.toMatch(/import\("three"\)/);
      // O GSAP só chega por import() dinâmico, dentro do efeito (tipos podem).
      expect(fonte, arquivo).not.toMatch(/^import (?!type ).* from "gsap/m);
    }
    expect(html()).not.toContain("<canvas");
  });

  it("os aparelhos são decorativos para o leitor de tela", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = html();
    const decorativos = caixa.querySelectorAll(
      ".sc-lp-narrativa__aparelhos, .sc-lp-momento__figura, .sc-lp-convite__palco",
    );
    expect(decorativos.length).toBeGreaterThan(0);
    for (const palco of decorativos) {
      expect(palco.getAttribute("aria-hidden")).toBe("true");
    }
  });
});

describe("o convite final repete a primeira tela", () => {
  const convite = () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = html();
    return caixa.querySelector<HTMLElement>("#comecar")!;
  };

  it("fecha a página com o título, o apoio e os dois caminhos", () => {
    const secao = convite();
    expect(secao).toBeTruthy();
    expect(secao.parentElement?.lastElementChild).toBe(secao);
    expect(secao.querySelector("h2#lp-convite")?.textContent?.replace(/\s+/g, " ")).toBe("Sua loja no ar hoje.");
    expect(secao.querySelector(".sc-lp-convite__hoje")?.textContent).toBe("hoje");
    const links = [...secao.querySelectorAll("a")].map((a) => [a.textContent?.trim(), a.getAttribute("href")]);
    expect(links).toContainEqual(["Criar minha loja grátis", LINK_PARA_COMECAR]);
    expect(links).toContainEqual(["Já tenho conta", LINK_PARA_ENTRAR]);
  });

  it("tem o ✦ em 3D, MacBook, iPhone e iPad com telas reais e os balões de pedido", () => {
    const secao = convite();
    expect(secao.querySelectorAll(".sc-lp-convite__estrela-camada").length).toBeGreaterThan(8);
    expect(secao.querySelector(".sc-lp-iphone img")?.getAttribute("src")).toBe("/landing/app/loja.webp");
    expect(secao.querySelector(".sc-lp-mac img")?.getAttribute("src")).toBe("/landing/app/painel-pedidos.webp");
    expect(secao.querySelector(".sc-lp-convite__ipad img")?.getAttribute("src")).toBe("/landing/app/painel-metricas.webp");
    const baloes = [...secao.querySelectorAll(".sc-lp-convite__balao")].map((b) => b.textContent);
    expect(baloes).toContain("Pedido #2014Confirmado · Pix");
    expect(secao.textContent).toContain("Novo pedido · R$ 55,80");
    // Sem as fotos de produto: aqui só os aparelhos.
    expect(secao.querySelector(".sc-lp-produto")).toBeNull();
  });

  it("no fim da página nada carrega com prioridade", () => {
    const secao = convite();
    expect(secao.querySelector('[fetchpriority="high"]')).toBeNull();
    for (const imagem of secao.querySelectorAll("img")) {
      expect(imagem.getAttribute("loading"), imagem.getAttribute("src") ?? "").toBe("lazy");
    }
  });

  it("todo movimento do convite só existe para quem aceita movimento", () => {
    const css = readFileSync(join(PASTA_DA_LANDING, "secoes/convite-final.css"), "utf8");
    const [antes, depois = ""] = css.split("@media (prefers-reduced-motion: no-preference)");
    expect(depois).toMatch(/animation:\s*sc-lp-convite-/);
    expect(depois).toContain('[data-convite="armado"]');
    // O ✦ gira com a rolagem: a variável só existe quando o script a escreve.
    expect(css).toMatch(/rotateY\(calc\([^)]*var\(--convite-rolagem/);
    expect(antes).not.toMatch(/animation:|transition:|data-convite="armado"/);
  });
});

describe("comparação só com fonte", () => {
  it("as quatro empresas aparecem, com o SimpleClick em destaque", () => {
    const marcacao = html();
    for (const empresa of EMPRESAS_DA_COMPARACAO) {
      expect(marcacao).toContain(`data-empresa="${empresa.chave}"`);
    }
    expect(comoSeLe(marcacao)).toContain("Zé Delivery");
  });

  it("cada fonte é https e tem data de consulta", () => {
    expect(FONTES_DA_COMPARACAO.length).toBeGreaterThanOrEqual(6);
    const marcacao = html();
    for (const fonte of FONTES_DA_COMPARACAO) {
      expect(fonte.url).toMatch(/^https:\/\//);
      expect(fonte.data).toMatch(/\d{2}\/\d{2}\/2026/);
      expect(marcacao).toContain(fonte.url.replace(/&/g, "&amp;"));
    }
  });

  it("nenhuma célula fica vazia", () => {
    for (const linha of COMPARACAO) {
      for (const empresa of EMPRESAS_DA_COMPARACAO) {
        expect(linha[empresa.chave].texto.trim().length, linha.criterio).toBeGreaterThan(1);
        expect(["sim", "parcial", "nao", "sem-dado"]).toContain(linha[empresa.chave].selo);
      }
    }
  });
});

describe("contadores", () => {
  it.each([
    ["até 23%", { antes: "até ", valor: 23, casas: 0, depois: "%" }],
    ["+3,2%", { antes: "+", valor: 3.2, casas: 1, depois: "%" }],
    ["R$ 150", { antes: "R$ ", valor: 150, casas: 0, depois: "" }],
    ["5,1 milhões", { antes: "", valor: 5.1, casas: 1, depois: " milhões" }],
  ])("%s é separado em partes", (texto, esperado) => {
    expect(partesDoContador(texto)).toEqual(esperado);
  });

  it("o leitor de tela ouve só o valor final", () => {
    const marcacao = renderToStaticMarkup(<Contador texto="58%" />);
    expect(marcacao).toContain('aria-hidden="true" data-contador="58"');
    expect(marcacao).toContain('<span class="sc-lp-so-leitor">58%</span>');
  });
});

describe("a conta do aplicativo usa a tabela oficial", () => {
  it("plano com entrega, R$ 8.000 no mês", () => {
    const custo = custoNoAplicativo(8000, "entrega");
    expect(custo.comissao).toBe(1840);
    expect(custo.pagamentoOnline).toBe(256);
    expect(custo.mensalidade).toBe(150);
    expect(custo.totalNoMes).toBe(2246);
    expect(custo.totalNoAno).toBe(26952);
  });

  it("abaixo de R$ 1.800 não há mensalidade", () => {
    const custo = custoNoAplicativo(1500, "basico");
    expect(custo.mensalidade).toBe(0);
    expect(custo.totalNoMes).toBe(228);
  });

  it("valor inválido vira zero, sem NaN na tela", () => {
    expect(custoNoAplicativo(Number.NaN, "basico").totalNoMes).toBe(0);
    expect(custoNoAplicativo(-10, "entrega").parteDoFaturamento).toBe(0);
  });

  it("o valor não quebra a linha entre R$ e o número", () => {
    expect(emReais(2246)).toBe("R$ 2.246");
  });
});

describe("acessibilidade (axe)", () => {
  let violacoes: Result[] = [];
  let avaliadas = 0;

  beforeAll(async () => {
    document.body.innerHTML = html();
    const resultado = await axe.run(document.body, {
      // O jsdom não calcula cor nem layout; contraste é conferido na tela.
      rules: { "color-contrast": { enabled: false } },
    });
    violacoes = resultado.violations;
    avaliadas = resultado.passes.length + resultado.violations.length;
  }, 30_000);

  it("sem violação crítica nem séria", () => {
    expect(avaliadas).toBeGreaterThan(0);
    const graves = violacoes
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => `${v.id}: ${v.help}`);
    expect(graves).toEqual([]);
  });
});

describe("revisão final (#94): leitor de tela, teclado e layout estável", () => {
  const ler = (relativo: string) => readFileSync(join(PASTA_DA_LANDING, relativo), "utf8");

  it("um rodapé só na página: a landing não abre um segundo contentinfo", () => {
    // O RodapeLegal (logo depois da landing, em page.tsx) é o rodapé da página.
    expect(html()).not.toMatch(/<footer\b/);
    expect(html()).toContain('aria-label="Mais do SimpleClick"');
  });

  it("o que ainda vai entrar na tela continua focável e lido (opacidade, nunca visibility)", () => {
    for (const arquivo of ["secoes/Entrada.tsx", "secoes/GraficoAnimado.tsx", "secoes/MovimentoDosCartoes.tsx", "NarrativaDaLanding.tsx"]) {
      expect(ler(arquivo), arquivo).not.toMatch(/autoAlpha/);
    }
    // O foco do Tab termina na hora a entrada do bloco que o recebe.
    expect(ler("NarrativaDaLanding.tsx")).toMatch(/addEventListener\("focusin"/);
  });

  it("parágrafo dividido em linhas não ganha aria-label (proibido em <p>)", () => {
    const slide = ler("cenas-em-slide.ts");
    expect(slide).toMatch(/\.sc-lp-momento__texto-corrido, \.sc-lp-heroi__texto"\);[\s\S]*aria: "none"/);
  });

  it("o brilho atrás dos aparelhos troca de tamanho por transform, sem mexer no layout", () => {
    const tipografia = ler("cenas/tipografia.css");
    expect(tipografia).not.toMatch(/transition:\s*inset/);
    expect(tipografia).toMatch(/\.sc-lp-narrativa__aparelhos::before \{[^}]*transition: transform/);
  });
});

describe("dados de mercado (#95): três telas, cartões 3D e fontes discretas", () => {
  const secao = () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = html();
    return caixa.querySelector<HTMLElement>("#taxas")!;
  };
  const css = () => readFileSync(join(AQUI, "../../../packages/ui/styles/landing-dados.css"), "utf8");

  it("a seção #taxas tem três telas e um botão para começar em cada uma", () => {
    const telas = [...secao().querySelectorAll<HTMLElement>("[data-tela-de-dados]")];
    expect(telas).toHaveLength(3);
    for (const tela of telas) {
      const links = [...tela.querySelectorAll<HTMLAnchorElement>("a.sc-lp-botao")].map((a) => a.getAttribute("href"));
      expect(links, tela.id).toContain(LINK_PARA_COMECAR);
    }
    // O botão da conta é o do pedido do dono, dentro do resultado.
    const conclusao = secao().querySelector(".sc-prova-conta__conclusao")!;
    expect(conclusao.querySelector("a.sc-lp-botao")?.textContent?.trim()).toBe("Quero meu link sem comissão");
  });

  it("cada tela tem a altura da janela (menos o topo) a partir do tablet e cresce em tela baixa", () => {
    const folha = css();
    expect(folha).toMatch(/--dados-tela: calc\(100svh - 5rem\)/);
    expect(folha).toMatch(/@media \(min-width: 48rem\) \{\s*\.sc-dados__tela \{\s*min-block-size: var\(--dados-tela\)/);
    expect(folha).toMatch(/@media \(max-height: 37\.5rem\) \{\s*\.sc-dados__tela \{\s*min-block-size: 0/);
  });

  it("os cartões ficam lado a lado e iguais; com movimento reduzido, planos", () => {
    const folha = css();
    expect(folha).toMatch(/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    const reduzido = folha.split("@media (prefers-reduced-motion: reduce)")[1] ?? "";
    expect(reduzido).toMatch(/\.sc-dado3d,[\s\S]*transform: none/);
    // Só transform e opacidade animam (nada de layout nem de visibility).
    expect(folha).not.toMatch(/transition:[^;]*(inset|width|height|top|left)/);
  });

  it("nada de lista longa de fontes nem link sublinhado grande na seção", () => {
    const s = secao();
    expect(s.querySelector(".sc-prova__fontes, .sc-prova__nota, .sc-prova__ressalva")).toBeNull();
    expect(s.querySelectorAll(".sc-dado3d a.sc-dados__fonte")).toHaveLength(4);
    expect(css()).toMatch(/\.sc-dados__fonte \{[^}]*font-size: 0\.6875rem;[^}]*text-decoration: none;/);
  });
});

describe("seções depois da narrativa (#96): uma tela cada, com botão e destaque", () => {
  const caixa = () => {
    const div = document.createElement("div");
    div.innerHTML = html();
    return div;
  };
  const SECOES = ["comparar", "preco", "recursos", "depoimentos", "duvidas"];

  it("cada seção é uma tela (data-tela), na ordem, antes do convite", () => {
    const telas = [...caixa().querySelectorAll<HTMLElement>("section[data-tela]")].map((s) => s.id);
    expect(telas).toEqual(SECOES);
  });

  it("cada seção tem pílula, título com destaque colorido e um botão da landing", () => {
    const div = caixa();
    for (const id of SECOES) {
      const secao = div.querySelector<HTMLElement>(`#${id}`)!;
      expect(secao.querySelector(".sc-tela__pilula"), id).toBeTruthy();
      expect(secao.querySelector("h2 .sc-tela__destaque"), id).toBeTruthy();
      expect(secao.querySelector("a.sc-lp-botao"), id).toBeTruthy();
    }
  });

  it("o título de impacto tem as três frases, cada uma numa cor", () => {
    const titulo = caixa().querySelector("#preco h2")!;
    expect(titulo.textContent?.replace(/\s+/g, " ").trim()).toBe("Grátis. Sem comissão. Sem mensalidade.");
    const cores = [...titulo.querySelectorAll<HTMLElement>(".sc-tela__linha")].map((l) => l.dataset["cor"]);
    expect(cores).toEqual(["limao", "ambar", "prata"]);
  });

  it("a comparação tem as quatro empresas com ícone por célula e as fontes na gaveta", () => {
    const secao = caixa().querySelector("#comparar")!;
    expect(secao.querySelectorAll(".sc-regua__empresa")).toHaveLength(4);
    expect(secao.querySelectorAll(".sc-regua__linha")).toHaveLength(4 * COMPARACAO.length);
    expect(secao.querySelector("[popover] a[href^='https://']")).toBeTruthy();
    expect(secao.querySelector(".sc-lp-fontes, details")).toBeNull();
  });

  it("depoimentos são exemplos, marcados com discrição", () => {
    const secao = caixa().querySelector("#depoimentos")!;
    expect(secao.querySelectorAll(".sc-vozes__exemplo")).toHaveLength(3);
    expect(secao.textContent).toContain("não relatos de clientes reais");
  });

  it("as dúvidas abrem uma de cada vez e têm o caminho para falar com a gente", () => {
    const secao = caixa().querySelector("#duvidas")!;
    const itens = [...secao.querySelectorAll("details")];
    expect(itens.length).toBeGreaterThanOrEqual(6);
    expect(new Set(itens.map((d) => d.getAttribute("name"))).size).toBe(1);
    expect(secao.querySelector('a[href^="mailto:"]')?.textContent).toContain("Falar com a gente");
  });

  it("a entrada só existe com movimento e nunca usa visibility", () => {
    const css = readFileSync(join(PASTA_DA_LANDING, "secoes/landing-secoes.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const [antes, depois = ""] = css.split("@media (prefers-reduced-motion: no-preference) {\n  \n  .sc-tela[data-armado]");
    expect(antes).not.toMatch(/data-armado/);
    expect(depois).toMatch(/data-armado/);
    expect(css).not.toMatch(/visibility\s*:/);
    expect(css).toMatch(/min-block-size: var\(--tela-altura\)/);
  });
});
