// @vitest-environment jsdom
/**
 * O rodapé do SimpleClick (#97): colunas, contato, faixa final, nada de
 * sublinhado e espaço para o aviso de cookies.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import axe from "axe-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LINK_PARA_COMECAR, LINK_PARA_ENTRAR } from "../src/features/landing/conteudo.ts";
import { RodapeDoSimpleClick, redesDoSimpleClick } from "../src/features/legal/RodapeDoSimpleClick.tsx";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(AQUI, "../../../packages/ui/styles/landing-rodape.css"), "utf8");

function rodape(props: Parameters<typeof RodapeDoSimpleClick>[0] = { redes: [], emailDoSuporte: "ajuda@exemplo.test" }) {
  const caixa = document.createElement("div");
  caixa.innerHTML = renderToStaticMarkup(<RodapeDoSimpleClick {...props} />);
  return caixa;
}

const hrefs = (raiz: ParentNode, seletor: string) =>
  [...raiz.querySelectorAll<HTMLAnchorElement>(`${seletor} a`)].map((a) => a.getAttribute("href"));

describe("rodapé do SimpleClick", () => {
  it("é um footer só, com marca, frase e o botão de criar a loja", () => {
    const r = rodape();
    expect(r.querySelectorAll("footer")).toHaveLength(1);
    const marca = r.querySelector(".sc-rodape__marca")!;
    expect(marca.querySelector('a[href="/"]')?.textContent).toContain("simpleclick");
    const chamada = marca.querySelector<HTMLAnchorElement>(".sc-rodape__chamada")!;
    expect(chamada.getAttribute("href")).toBe(LINK_PARA_COMECAR);
    expect(chamada.textContent).toBe("Criar minha loja grátis");
  });

  it("tem as colunas Produto, Para lojistas e Empresa e legal, cada uma nomeada pelo título", () => {
    const r = rodape();
    const colunas = [...r.querySelectorAll("nav.sc-rodape__coluna")];
    expect(colunas.map((c) => r.querySelector(`#${c.getAttribute("aria-labelledby")}`)?.textContent)).toEqual([
      "Produto",
      "Para lojistas",
      "Empresa e legal",
    ]);
    expect(hrefs(r, ".sc-rodape__coluna--produto")).toEqual(["/#como-funciona", "/#taxas", "/#preco", "/explorar"]);
    expect(hrefs(r, ".sc-rodape__coluna--lojistas")).toEqual([LINK_PARA_COMECAR, LINK_PARA_ENTRAR, "/painel", "/#duvidas"]);
    expect(hrefs(r, ".sc-rodape__coluna--empresa")).toEqual([
      "/termos-de-uso",
      "/politica-de-privacidade",
      "/cookies",
      "/lgpd",
      "mailto:ajuda@exemplo.test",
    ]);
    expect(r.querySelector(".sc-rodape__coluna--empresa button")?.textContent).toBe("Preferências de cookies");
  });

  it("contato por e-mail sempre; redes só quando o endereço existe, abrindo em outra aba", () => {
    expect(rodape().querySelectorAll(".sc-rodape__contatos li")).toHaveLength(2);
    const r = rodape({
      emailDoSuporte: "ajuda@exemplo.test",
      redes: redesDoSimpleClick({ INSTAGRAM_DO_SIMPLECLICK: "https://instagram.com/simpleclick" }),
    });
    const instagram = r.querySelector<HTMLAnchorElement>('a[href="https://instagram.com/simpleclick"]')!;
    expect(instagram.textContent).toContain("Instagram");
    expect(instagram.target).toBe("_blank");
    expect(instagram.rel).toContain("noopener");
    expect(redesDoSimpleClick({})).toEqual([]);
  });

  it("faixa final com copyright, selo e voltar ao topo", () => {
    const base = rodape().querySelector(".sc-rodape__base")!;
    expect(base.textContent).toContain(`© ${new Date().getFullYear()} SimpleClick`);
    expect(base.textContent).toContain("Feito no Brasil");
    expect(base.querySelector("button.sc-rodape__topo")?.textContent).toBe("Voltar ao topo");
  });

  it("ícones são decorativos (o nome vem do texto ao lado)", () => {
    for (const svg of rodape().querySelectorAll("svg")) {
      expect(svg.closest('[aria-hidden="true"]') ?? svg.getAttribute("aria-hidden")).toBeTruthy();
    }
  });


  it("sem violação crítica nem séria no axe", async () => {
    document.body.replaceChildren(rodape());
    const resultado = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    const graves = resultado.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => `${v.id}: ${v.help}`);
    expect(graves).toEqual([]);
    document.body.replaceChildren();
  }, 30_000);
});

describe("estilo do rodapé", () => {
  it("nenhum link sublinhado; o foco tem contorno visível", () => {
    expect(CSS).not.toMatch(/text-decoration:\s*underline/);
    expect(CSS).toMatch(/\.sc-rodape a,\s*\.sc-rodape button \{[^}]*text-decoration: none/);
    expect(CSS).toMatch(/:focus-visible \{[^}]*outline: 2px solid var\(--cor-foco\)/);
  });

  it("alvos de toque de 44 px e 4 / 2 colunas conforme a largura", () => {
    expect(CSS).toMatch(/\.sc-rodape__link \{[^}]*min-block-size: var\(--altura-toque\)/);
    expect(CSS).toMatch(/\.sc-rodape__grade \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(CSS).toMatch(/@media \(min-width: 64rem\) \{\s*\.sc-rodape__grade \{\s*grid-template-columns: minmax\(18rem, 1\.6fr\) repeat\(3, minmax\(0, 1fr\)\)/);
  });

  it("com o aviso aberto, o rodapé ganha só uma folga fixa (não a altura do aviso)", () => {
    expect(CSS).toMatch(/body:has\(\.sc-cookies\) \.sc-rodape \{[^}]*--espaco-8/);
    expect(CSS).not.toMatch(/--altura-do-aviso-de-cookies/);
  });
});
