// @vitest-environment jsdom
/**
 * Correções da validação do redesign nas telas do cliente (card #132, achados
 * A1, A3, A6, A7 e A8 do #114). As provas de navegador ficam nos specs do
 * #114 (`e2e/specs/*redesign*.onp.spec.ts`); aqui, o comportamento de cada
 * peça, sem navegador:
 *
 * - o carrossel de fotos do post recebe foco e anda pelas setas do teclado;
 * - o nome do menu da conta contém as iniciais que o avatar mostra;
 * - a sacola que não conseguiu confirmar a leitura NÃO diz que está vazia;
 * - o produto inexistente diz "Produto não encontrado" e volta ao catálogo;
 * - pedidos e favoritos vazios oferecem "Explorar lojas".
 */
import { act, createElement, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { desmontar, exigir, montar } from "./apoio-config.tsx";

const ambiente = vi.hoisted(() => ({
  conferir: vi.fn(),
  itens: vi.fn(),
  parametros: { slug: "padaria-do-ze" } as Record<string, string>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/explorar",
  useParams: () => ambiente.parametros,
}));
vi.mock("next/image", () => ({
  default: ({
    priority: _p,
    fill: _f,
    ...props
  }: ComponentProps<"img"> & {
    readonly priority?: boolean;
    readonly fill?: boolean;
  }) => createElement("img", props),
}));
vi.mock("../src/lib/carrinho-do-navegador.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  conferirCarrinho: (...args: unknown[]) => ambiente.conferir(...args),
  verItensDoCarrinho: (...args: unknown[]) => ambiente.itens(...args),
}));

import { MidiaDoPost } from "../src/features/feed/MidiaDoPost.tsx";
import { verPelaConferencia } from "../src/features/carrinho/ver-pela-conferencia.ts";
import { MeusPedidos } from "../src/features/conta/MeusPedidos.tsx";
import {
  ListaDeLojas,
  ListaDeProdutosFavoritos,
} from "../src/features/conta/LojasDaConta.tsx";
import ProdutoNaoEncontrado from "../src/app/(loja)/loja/[slug]/produto/[id]/not-found.tsx";
import { MenuDaConta } from "../src/features/usuario/MenuDaConta.tsx";
import { LocalizacaoDoTopo } from "../src/features/usuario/LocalizacaoDoTopo.tsx";
import { VISITANTE, type UsuarioDaBarra } from "../src/lib/quem-esta-logado.ts";

beforeEach(() => {
  ambiente.conferir.mockReset();
  ambiente.itens.mockReset();
  ambiente.parametros = { slug: "padaria-do-ze" };
});
afterEach(desmontar);

describe("carrossel do post pelo teclado (A1)", () => {
  const midias = [
    { tipo: "imagem", url: "/a.webp", texto: "Frente" },
    { tipo: "imagem", url: "/b.webp", texto: "Verso" },
    { tipo: "imagem", url: "/c.webp", texto: "Lado" },
  ] as unknown as ComponentProps<typeof MidiaDoPost>["midias"];

  it("[CA-1] o trilho com várias fotos entra na ordem do Tab e as setas do teclado o fazem andar", () => {
    const tela = montar(<MidiaDoPost midias={midias} nome="Pastel" />);
    const trilho = exigir<HTMLDivElement>(tela, ".sc-post__trilho");
    expect(trilho.tabIndex).toBe(0);
    expect(trilho.getAttribute("aria-label")).toBe("Fotos de Pastel");

    Object.defineProperty(trilho, "clientWidth", { value: 300 });
    const rolar = vi.fn();
    trilho.scrollTo = rolar as unknown as typeof trilho.scrollTo;

    act(() => {
      trilho.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(rolar).toHaveBeenLastCalledWith({ left: 300, behavior: "smooth" });

    act(() => {
      trilho.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      );
    });
    expect(rolar).toHaveBeenLastCalledWith({ left: 600, behavior: "smooth" });
  });

  it("[CA-1] as duas setas da tela são botões sempre montados; a do começo fica indisponível sem sumir", () => {
    const tela = montar(<MidiaDoPost midias={midias} nome="Pastel" />);
    const antes = exigir<HTMLButtonElement>(tela, ".sc-post__seta--antes");
    const depois = exigir<HTMLButtonElement>(tela, ".sc-post__seta--depois");
    expect(antes.tagName).toBe("BUTTON");
    expect(antes.getAttribute("aria-disabled")).toBe("true");
    expect(depois.getAttribute("aria-disabled")).toBeNull();
  });

  it("[CA-1] com uma foto só não há carrossel nem parada de Tab à toa", () => {
    const tela = montar(
      <MidiaDoPost midias={midias.slice(0, 1)} nome="Pastel" />,
    );
    const trilho = exigir<HTMLDivElement>(tela, ".sc-post__trilho");
    expect(trilho.hasAttribute("tabindex")).toBe(false);
    expect(tela.querySelector(".sc-post__seta")).toBeNull();
  });
});

/** Como o axe compara: minúsculas, sem pontuação, espaços únicos. */
const normal = (t: string) =>
  t
    .toLowerCase()
    // Como o axe: o que está entre parênteses não conta.
    .replace(/\([^()]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
/**
 * O texto que se vê no botão, inclusive o marcado `aria-hidden`: cada pedaço
 * de texto separado por espaço (a chamada e o rótulo são linhas diferentes).
 */
function visivel(el: Element): string {
  const pedacos: string[] = [];
  const andar = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let no = andar.nextNode(); no !== null; no = andar.nextNode()) {
    pedacos.push(no.textContent ?? "");
  }
  return normal(pedacos.join(" "));
}

describe("o nome dos botões do topo contém o texto que se vê (A3, WCAG 2.5.3)", () => {
  const cliente: UsuarioDaBarra = {
    papel: "cliente",
    nome: "Ana Ribeiro",
    primeiroNome: "Ana",
    iniciais: "AR",
    email: "ana@exemplo.test",
    loja: null,
    temOutrasLojas: false,
  };
  const sair = vi.fn(async (_caminho: string) => undefined);

  it.each([
    ["logada", cliente],
    ["visitante", VISITANTE],
  ] as const)("[CA-5] menu da conta (%s)", (_quem, usuario) => {
    const tela = montar(<MenuDaConta usuario={usuario} sair={sair} />);
    const botao = exigir(tela, ".sc-menu-conta__botao");
    expect(visivel(botao).length).toBeGreaterThan(0);
    expect(normal(botao.getAttribute("aria-label") ?? "")).toContain(
      visivel(botao),
    );
  });

  it("[CA-5] localização, com a chamada 'Sua região' à mostra", () => {
    const tela = montar(
      <LocalizacaoDoTopo cidade={{ cidade: "Fortaleza", uf: "CE" }} />,
    );
    const botao = exigir(tela, ".sc-local-topo__botao");
    expect(visivel(botao)).toBe("sua região fortaleza ce");
    expect(normal(botao.getAttribute("aria-label") ?? "")).toContain(
      visivel(botao),
    );
  });
});

describe("sacola que não carregou (A6)", () => {
  const conferidaVazia = {
    estado: "conferido",
    conferencia: { itens: [], subtotalCentavos: 0 },
  };

  it("[CA-2] a conferência vazia com a sacola guardada sem responder é ERRO, e não sacola vazia", async () => {
    ambiente.conferir.mockResolvedValue(conferidaVazia);
    ambiente.itens.mockResolvedValue(null);
    await expect(verPelaConferencia("padaria-do-ze")).rejects.toThrow();
  });

  it("[CA-2] com a sacola guardada confirmando, vazia é vazia", async () => {
    ambiente.conferir.mockResolvedValue(conferidaVazia);
    ambiente.itens.mockResolvedValue([]);
    const carrinho = await verPelaConferencia("padaria-do-ze");
    expect(carrinho.itens).toEqual([]);
    expect(carrinho.totalDeItens).toBe(0);
  });
});

describe("produto inexistente numa loja que existe (A7)", () => {
  it("[CA-3] diz que o PRODUTO não foi encontrado e leva ao catálogo da loja", () => {
    const tela = montar(<ProdutoNaoEncontrado />);
    expect(exigir(tela, "h1").textContent).toBe("Produto não encontrado");
    expect(tela.textContent).not.toMatch(/loja não está disponível/i);
    const volta = exigir<HTMLAnchorElement>(tela, "a");
    expect(volta.getAttribute("href")).toBe("/loja/padaria-do-ze/cardapio");
    expect(volta.textContent).toBe("Ver o catálogo da loja");
  });

  it("[CA-3] o apelido vai codificado no link (nada de caminho montado à mão)", () => {
    ambiente.parametros = { slug: "a b/c" };
    const tela = montar(<ProdutoNaoEncontrado />);
    expect(exigir(tela, "a").getAttribute("href")).toBe(
      "/loja/a%20b%2Fc/cardapio",
    );
  });
});

describe("conta vazia tem saída (A8)", () => {
  function saida(tela: HTMLElement) {
    const link = [...tela.querySelectorAll("a")].find(
      (a) => a.textContent === "Explorar lojas",
    );
    expect(link, "link Explorar lojas").toBeDefined();
    return link?.getAttribute("href");
  }

  it("[CA-4] sem pedidos: a mensagem e 'Explorar lojas' (/explorar)", () => {
    const tela = montar(
      <MeusPedidos leitura={{ estado: "ok", pedidos: [] }} />,
    );
    expect(tela.textContent).toContain("Você ainda não fez nenhum pedido");
    expect(saida(tela)).toBe("/explorar");
  });

  it("[CA-4] sem produtos favoritos: a mensagem e 'Explorar lojas'", () => {
    const tela = montar(<ListaDeProdutosFavoritos produtos={[]} />);
    expect(tela.textContent).toContain("Nenhum produto favorito ainda");
    expect(saida(tela)).toBe("/explorar");
  });

  it("[CA-4] sem lojas favoritas: a mensagem e 'Explorar lojas'", () => {
    const tela = montar(
      <ListaDeLojas
        lojas={[]}
        vazio={{ titulo: "Nenhuma loja favorita ainda", descricao: "…" }}
      />,
    );
    expect(tela.textContent).toContain("Nenhuma loja favorita ainda");
    expect(saida(tela)).toBe("/explorar");
  });
});
