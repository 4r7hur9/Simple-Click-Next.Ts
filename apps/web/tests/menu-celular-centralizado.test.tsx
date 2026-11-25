// @vitest-environment jsdom
/**
 * Prova da barra de atalhos do celular: o botão "Menu" fica na coluna do meio
 * (centro horizontal), os atalhos se dividem entre os dois lados, o nome
 * acessível é "Abrir menu" e o `aria-expanded` acompanha a gaveta. Não há
 * layout no jsdom, então a centralização é provada pela estrutura e pela
 * classe de grade que o CSS usa (1fr · auto · 1fr, com colunas iguais).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rota = vi.hoisted(() => ({ caminho: "/painel/pedidos" }));
vi.mock("next/navigation", () => ({ usePathname: () => rota.caminho }));

import {
  IconeInicio,
  IconePedido,
  IconePedidoManual,
  IconeProduto,
} from "@simpleclick/ui";

import {
  MenuLateral,
  type ItemDoMenu,
  type SecaoDoMenu,
} from "../src/features/painel/MenuLateral.tsx";
import { clicar, desmontar, montar } from "./apoio-config.tsx";

const CLASSE_DO_MEIO = "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]";

const inicio: ItemDoMenu = {
  rotulo: "Início",
  href: "/painel",
  icone: IconeInicio,
  exato: true,
};
const pedidos: ItemDoMenu = {
  rotulo: "Pedidos",
  href: "/painel/pedidos",
  icone: IconePedido,
  contador: 3,
};
const novoPedido: ItemDoMenu = {
  rotulo: "Novo pedido",
  href: "/painel/pedidos/novo",
  icone: IconePedidoManual,
};
const produtos: ItemDoMenu = {
  rotulo: "Produtos",
  href: "/painel/produtos",
  icone: IconeProduto,
};

const secoes: readonly SecaoDoMenu[] = [
  { titulo: "Operação", itens: [inicio, pedidos, novoPedido, produtos] },
];

function barra(tela: HTMLElement): HTMLElement {
  const nav = tela.querySelector<HTMLElement>('nav[aria-label="Atalhos"]');
  if (nav === null) throw new Error("a barra de atalhos não está na tela");
  return nav;
}

/** A grade da barra: o primeiro filho direto da nav. */
function grade(tela: HTMLElement): HTMLElement {
  const g = barra(tela).firstElementChild;
  if (!(g instanceof HTMLElement)) throw new Error("sem grade na barra");
  return g;
}

function montarComAtalhos(atalhos: readonly ItemDoMenu[]): HTMLElement {
  return montar(
    <MenuLateral
      rotulo="Navegação do painel"
      marca={<a href="/painel">simpleclick</a>}
      secoes={secoes}
      atalhos={atalhos}
      botaoDoMenuNosAtalhos
    />,
  );
}

beforeEach(() => {
  rota.caminho = "/painel/pedidos";
  vi.stubGlobal(
    "matchMedia",
    () =>
      ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
});
afterEach(desmontar);

describe("centralização do botão Menu na barra do celular", () => {
  it("[CA-22] com atalhos dos dois lados, o botão Menu é a coluna do meio", () => {
    const tela = montarComAtalhos([inicio, pedidos, novoPedido, produtos]);
    const filhos = [...grade(tela).children];
    expect(grade(tela).className).toContain(CLASSE_DO_MEIO);
    expect(filhos).toHaveLength(3);
    expect(filhos[0]?.tagName).toBe("UL");
    expect(filhos[1]?.tagName).toBe("BUTTON");
    expect(filhos[2]?.tagName).toBe("UL");
    // Metade dos atalhos de cada lado.
    expect(filhos[0]?.querySelectorAll("li")).toHaveLength(2);
    expect(filhos[2]?.querySelectorAll("li")).toHaveLength(2);
  });

  it("[CA-22] com número ímpar de atalhos, o botão continua no meio e o lado esquerdo leva o a mais", () => {
    const tela = montarComAtalhos([inicio, pedidos, novoPedido]);
    const filhos = [...grade(tela).children];
    expect(filhos[1]?.tagName).toBe("BUTTON");
    expect(filhos[0]?.querySelectorAll("li")).toHaveLength(2);
    expect(filhos[2]?.querySelectorAll("li")).toHaveLength(1);
  });

  it("[CA-22] sem outras opções na barra, o botão Menu fica sozinho no meio", () => {
    const tela = montarComAtalhos([]);
    const filhos = [...grade(tela).children];
    expect(grade(tela).className).toContain(CLASSE_DO_MEIO);
    expect(filhos[1]?.tagName).toBe("BUTTON");
    expect(filhos[0]?.querySelectorAll("li")).toHaveLength(0);
    expect(filhos[2]?.querySelectorAll("li")).toHaveLength(0);
  });

  it("[CA-22] sem o botão Menu, os atalhos ficam numa lista só, sem coluna do meio", () => {
    const tela = montar(
      <MenuLateral
        rotulo="Navegação do painel"
        marca={<a href="/painel">simpleclick</a>}
        secoes={secoes}
        atalhos={[inicio, pedidos]}
      />,
    );
    expect(grade(tela).className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(grade(tela).querySelector("button")).toBeNull();
  });
});

describe("o botão Menu da barra", () => {
  it("[CA-22] tem nome acessível 'Abrir menu', alvo de toque de 44px ou mais e aria-expanded", () => {
    const tela = montarComAtalhos([inicio, pedidos]);
    const botao = grade(tela).querySelector("button");
    if (botao === null) throw new Error("sem o botão Menu");
    expect(botao.textContent).toBe("Menu");
    expect(botao.getAttribute("aria-label")).toBe("Abrir menu");
    // min-h-16 (4rem = 64px) e w-16 (64px): acima do mínimo de 44px.
    expect(botao.className).toContain("min-h-16");
    expect(botao.className).toContain("w-16");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(botao.getAttribute("aria-controls")).not.toBeNull();
  });

  it("[CA-22] abre a gaveta e marca aria-expanded como verdadeiro", () => {
    const tela = montarComAtalhos([inicio, pedidos]);
    const botao = grade(tela).querySelector("button");
    if (botao === null) throw new Error("sem o botão Menu");
    clicar(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    const gaveta = tela.querySelector("aside");
    expect(gaveta?.getAttribute("role")).toBe("dialog");
    expect(botao.getAttribute("aria-controls")).toBe(gaveta?.id);
  });
});
