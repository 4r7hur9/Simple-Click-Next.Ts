// @vitest-environment jsdom
/**
 * Chip, faixa de chips e abas (card #104, T-10405): o chip ativo é anunciado
 * (marcado ou atual), todo chip entra na ordem do Tab, e as abas trocam pelo
 * teclado com o foco itinerante do padrão WAI-ARIA.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Abas,
  Chip,
  FaixaDeChips,
  TemaDaMarca,
  type ComponenteDeLinkProps,
} from "@simpleclick/ui";

// O jsdom troca o esquema de `import.meta.url`; o Vitest roda na raiz.
const CSS = readFileSync(
  join(process.cwd(), "packages", "ui", "styles", "componentes.css"),
  "utf8",
);

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

function montar(arvore: ReactNode): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(arvore));
  return container;
}

const tecla = (alvo: Element, key: string): void => {
  act(() => {
    alvo.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
};

const ABAS = [
  { id: "publicacoes", rotulo: "Publicações", painel: <p>Posts da loja</p> },
  { id: "sobre", rotulo: "Sobre", painel: <p>Horários e endereço</p> },
  { id: "avisos", rotulo: "Avisos", painel: <p>Sem avisos</p> },
];

describe("chip de filtro e de categoria", () => {
  it("[CA-10] @spec:AC-10410 o filtro é um botão anunciado como marcado ou não", () => {
    const tela = montar(
      <FaixaDeChips rotulo="Filtros">
        <Chip ativo aoAlternar={() => {}}>
          Aberto agora
        </Chip>
        <Chip aoAlternar={() => {}}>Entrega</Chip>
      </FaixaDeChips>,
    );
    const [ligado, desligado] = [...tela.querySelectorAll("button")];
    expect(ligado?.getAttribute("aria-pressed")).toBe("true");
    expect(desligado?.getAttribute("aria-pressed")).toBe("false");
    expect(ligado?.className).toContain("sc-chip--ativo");
    expect(desligado?.className).not.toContain("sc-chip--ativo");
    expect(tela.querySelector("[role=group]")?.getAttribute("aria-label")).toBe(
      "Filtros",
    );
  });

  it("[CA-10] @spec:AC-10410 o filtro responde ao toque e ao teclado (clique nativo do botão)", () => {
    let chamadas = 0;
    const tela = montar(
      <Chip aoAlternar={() => (chamadas += 1)}>Aberto agora</Chip>,
    );
    act(() => tela.querySelector("button")?.click());
    expect(chamadas).toBe(1);
  });

  it("[CA-10] @spec:AC-10410 a categoria é um link, e a atual é anunciada por aria-current", () => {
    const tela = montar(
      <FaixaDeChips rotulo="Categorias" navegacao>
        <Chip href="/loja/x/cardapio?c=pizzas" ativo contagem={12}>
          Pizzas
        </Chip>
        <Chip href="/loja/x/cardapio?c=bebidas">Bebidas</Chip>
      </FaixaDeChips>,
    );
    const [atual, outra] = [...tela.querySelectorAll("a")];
    expect(atual?.getAttribute("aria-current")).toBe("true");
    expect(outra?.hasAttribute("aria-current")).toBe(false);
    expect(atual?.hasAttribute("aria-pressed")).toBe(false);
    expect(atual?.textContent).toContain("Pizzas");
    expect(atual?.textContent).toContain("12");
    expect(tela.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Categorias",
    );
  });

  it("[CA-10] @spec:AC-10410 o link usa o componente injetado, para navegar sem recarregar", () => {
    function LinkDoApp({
      href,
      className,
      children,
      ...resto
    }: ComponenteDeLinkProps) {
      return (
        <a data-do-app href={href} className={className} {...resto}>
          {children}
        </a>
      );
    }
    const html = renderToStaticMarkup(
      <Chip href="/explorar" componenteDeLink={LinkDoApp} ativo>
        Explorar
      </Chip>,
    );
    expect(html).toContain("data-do-app");
    expect(html).toContain('aria-current="true"');
  });

  it("[CA-10] @spec:AC-10410 todo chip da faixa entra na ordem do Tab, mesmo sem barra de rolagem visível", () => {
    const tela = montar(
      <FaixaDeChips rotulo="Categorias" navegacao>
        {[
          "Pizzas",
          "Lanches",
          "Bebidas",
          "Sobremesas",
          "Combos",
          "Porções",
        ].map((nome) => (
          <Chip key={nome} href={`/c/${nome}`}>
            {nome}
          </Chip>
        ))}
      </FaixaDeChips>,
    );
    const chips = [...tela.querySelectorAll<HTMLElement>(".sc-chip")];
    expect(chips).toHaveLength(6);
    for (const chip of chips) {
      expect(chip.tagName).toBe("A");
      expect(chip.getAttribute("href")).not.toBeNull();
      expect(chip.getAttribute("tabindex")).toBeNull();
    }
    // A faixa esconde a barra, e não os itens.
    expect(CSS).toMatch(/\.sc-chips\s*\{[^}]*scrollbar-width:\s*none/);
    expect(CSS).toMatch(/\.sc-chips\s*\{[^}]*overflow-x:\s*auto/);
    expect(CSS).not.toMatch(/\.sc-chip(s)?\s*\{[^}]*display:\s*none/);
  });

  it("[CA-10] @spec:AC-10410 chip desabilitado não é alcançado nem navega", () => {
    const botao = montar(
      <Chip desabilitado aoAlternar={() => {}}>
        Esgotado
      </Chip>,
    ).querySelector("button");
    expect(botao?.disabled).toBe(true);

    const html = renderToStaticMarkup(
      <Chip desabilitado href="/x">
        Esgotado
      </Chip>,
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain("href=");
  });

  it("[CA-10] @spec:AC-10410 o ativo é verde com letra escura, e a regra tem anel de foco", () => {
    expect(CSS).toMatch(
      /\.sc-chip--ativo,[\s\S]*?\{[^}]*background-color:\s*var\(--cor-primaria\)[^}]*color:\s*var\(--cor-em-primaria\)/,
    );
    expect(CSS).toMatch(
      /\.sc-chip:focus-visible[\s\S]*?outline:\s*2px solid var\(--cor-foco\)/,
    );
  });
});

describe("abas", () => {
  it("[CA-11] @spec:AC-10411 monta tablist, tab e tabpanel ligados entre si, com só a primeira aba no Tab", () => {
    const tela = montar(
      <Abas id="loja" rotulo="Conteúdo da loja" abas={ABAS} />,
    );
    const lista = tela.querySelector("[role=tablist]");
    const abas = [...tela.querySelectorAll<HTMLElement>("[role=tab]")];
    const paineis = [...tela.querySelectorAll<HTMLElement>("[role=tabpanel]")];

    expect(lista?.getAttribute("aria-label")).toBe("Conteúdo da loja");
    expect(abas.map((aba) => aba.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(abas.map((aba) => aba.tabIndex)).toEqual([0, -1, -1]);
    expect(paineis.map((painel) => painel.hidden)).toEqual([false, true, true]);
    abas.forEach((aba, i) => {
      expect(aba.getAttribute("aria-controls")).toBe(paineis[i]?.id);
      expect(paineis[i]?.getAttribute("aria-labelledby")).toBe(aba.id);
    });
    expect(tela.textContent).toContain("Posts da loja");
  });

  it("[CA-11] @spec:AC-10411 a seta direita troca de aba, mostra o painel e leva o foco", () => {
    const tela = montar(<Abas id="loja" rotulo="Conteúdo" abas={ABAS} />);
    const abas = () => [...tela.querySelectorAll<HTMLElement>("[role=tab]")];

    tecla(abas()[0] as HTMLElement, "ArrowRight");

    expect(abas()[1]?.getAttribute("aria-selected")).toBe("true");
    expect(abas()[0]?.getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(abas()[1]);
    expect(abas().map((aba) => aba.tabIndex)).toEqual([-1, 0, -1]);
    const visivel = [
      ...tela.querySelectorAll<HTMLElement>("[role=tabpanel]"),
    ].find((painel) => !painel.hidden);
    expect(visivel?.textContent).toBe("Horários e endereço");
  });

  it("[CA-11] @spec:AC-10411 a seta esquerda volta, e as duas dão a volta nas pontas", () => {
    const tela = montar(<Abas id="loja" rotulo="Conteúdo" abas={ABAS} />);
    const abas = () => [...tela.querySelectorAll<HTMLElement>("[role=tab]")];

    tecla(abas()[0] as HTMLElement, "ArrowLeft");
    expect(abas()[2]?.getAttribute("aria-selected")).toBe("true");

    tecla(abas()[2] as HTMLElement, "ArrowRight");
    expect(abas()[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("[CA-11] @spec:AC-10411 Home vai à primeira aba e End à última", () => {
    const tela = montar(
      <Abas id="loja" rotulo="Conteúdo" abas={ABAS} ativaInicial="sobre" />,
    );
    const abas = () => [...tela.querySelectorAll<HTMLElement>("[role=tab]")];

    tecla(abas()[1] as HTMLElement, "End");
    expect(abas()[2]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(abas()[2]);

    tecla(abas()[2] as HTMLElement, "Home");
    expect(abas()[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("[CA-11] @spec:AC-10411 outras teclas não mudam a aba, e o clique também troca", () => {
    const tela = montar(<Abas id="loja" rotulo="Conteúdo" abas={ABAS} />);
    const abas = () => [...tela.querySelectorAll<HTMLElement>("[role=tab]")];

    tecla(abas()[0] as HTMLElement, "a");
    expect(abas()[0]?.getAttribute("aria-selected")).toBe("true");

    act(() => abas()[2]?.click());
    expect(abas()[2]?.getAttribute("aria-selected")).toBe("true");
    expect(abas().map((aba) => aba.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("[CA-11] @spec:AC-10411 controlada: avisa a troca e só muda quando quem chama muda `ativa`", () => {
    const trocas: string[] = [];
    const tela = montar(
      <Abas
        id="loja"
        rotulo="Conteúdo"
        abas={ABAS}
        ativa="publicacoes"
        aoTrocar={(id) => trocas.push(id)}
      />,
    );
    const abas = () => [...tela.querySelectorAll<HTMLElement>("[role=tab]")];

    tecla(abas()[0] as HTMLElement, "ArrowRight");
    expect(trocas).toEqual(["sobre"]);
    // Quem chama não atualizou `ativa`: a aba selecionada continua a mesma.
    expect(abas()[0]?.getAttribute("aria-selected")).toBe("true");
  });
});

describe("peças dentro da loja", () => {
  it("[CA-15] @spec:AC-10415 chip e abas leem só a cor principal do SimpleClick, sem cor de loja, e nunca a cor de marca", () => {
    const html = renderToStaticMarkup(
      <TemaDaMarca>
        <Chip ativo aoAlternar={() => {}}>
          Entrega
        </Chip>
        <Abas id="x" rotulo="Abas" abas={ABAS} />
      </TemaDaMarca>,
    );
    expect(html).not.toMatch(/--cor-primaria|style=/);
    expect(html).toContain("sc-chip--ativo");
    expect(html).toContain('role="tablist"');

    const trechoDasPecas = CSS.slice(
      CSS.indexOf("/* --- chip e faixa de chips"),
    );
    expect(trechoDasPecas).not.toMatch(/--cor-marca|--cor-sobre-marca/);
    expect(trechoDasPecas).toMatch(
      /\.sc-abas__aba\[aria-selected="true"\][^}]*var\(--cor-primaria-texto\)/,
    );
  });
});
