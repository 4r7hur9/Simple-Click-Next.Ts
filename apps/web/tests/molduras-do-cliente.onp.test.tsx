// @vitest-environment jsdom
/**
 * As molduras do cliente (card #105): explorar, loja e conta montam o topo e
 * a barra inferior no lugar da lateral, o papel vem só da sessão lida no
 * servidor, a janela de acesso da loja continua montada e o tutorial aponta
 * para elementos que ainda existem.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { desmontar, montar } from "./apoio-config.tsx";

const ambiente = vi.hoisted(() => ({
  usuario: { papel: "visitante" } as Record<string, unknown>,
  cidade: vi.fn(
    async () =>
      ({ cidade: "Campinas", uf: "SP" }) as {
        cidade: string;
        uf: string;
      } | null,
  ),
  tutorialVisto: vi.fn(async (_papel: string) => true),
  vitrine: {
    estado: "encontrada",
    vitrine: { loja: { apelido: "padaria", nome: "Padaria", tema: null } },
  } as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/loja/padaria/cardapio",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("../src/server/usuario-da-sessao.ts", () => ({
  usuarioDoPedidoAtual: async () => ambiente.usuario,
}));
vi.mock("../src/server/cidade-do-topo.ts", () => ({
  cidadeDoPedidoAtual: () => ambiente.cidade(),
}));
vi.mock("../src/server/tutorial-da-sessao.ts", () => ({
  tutorialJaVistoNestePedido: (papel: string) => ambiente.tutorialVisto(papel),
}));
vi.mock("../src/server/actions/auth.ts", () => ({
  sairPelaBarra: vi.fn(),
  sairDaConta: vi.fn(),
  encerrarTodasAsSessoes: vi.fn(),
}));
vi.mock("../src/server/vitrine.ts", () => ({
  buscarVitrine: async () => ambiente.vitrine,
}));
vi.mock("../src/lib/contagem-da-sacola.ts", () => ({
  contarItensDaSacola: async () => 2,
}));

import {
  BarraInferiorDaSessao,
  NavegacaoDaSessao,
} from "../src/app/_usuario/sessao.tsx";
import LayoutDoExplorar from "../src/app/(explorar)/explorar/layout.tsx";
import LayoutDaMinhaConta from "../src/app/(conta)/conta/layout.tsx";
import MolduraDaLoja from "../src/app/(loja)/loja/[slug]/layout.tsx";
import { JanelaDeAcesso } from "../src/features/auth/JanelaDeAcesso.tsx";
import { RodapeLegal } from "../src/features/legal/RodapeLegal.tsx";
import { PASSOS_DO_TUTORIAL } from "../src/features/tutorial/passos.ts";
import { Tutorial } from "../src/features/tutorial/Tutorial.tsx";
import { LateralDoUsuario } from "../src/features/usuario/LateralDoUsuario.tsx";

const cliente = {
  papel: "cliente",
  nome: "Ana Ribeiro",
  primeiroNome: "Ana",
  iniciais: "AR",
  email: "ana@exemplo.test",
  loja: null,
  temOutrasLojas: false,
};
const PADARIA = { apelido: "padaria", nome: "Padaria" };

beforeEach(() => {
  ambiente.usuario = { papel: "visitante" };
  ambiente.cidade.mockClear();
  ambiente.tutorialVisto.mockClear();
});
afterEach(desmontar);

/** Todos os tipos de componente da árvore de elementos (sem renderizar). */
function tipos(no: ReactNode, achados = new Set<unknown>()): Set<unknown> {
  if (Array.isArray(no)) {
    no.forEach((filho) => tipos(filho, achados));
  } else if (isValidElement(no)) {
    achados.add(no.type);
    tipos((no.props as { children?: ReactNode }).children, achados);
  }
  return achados;
}

describe("a navegação montada com a sessão", () => {
  it("[CA-24] @spec:AC-10515 o cliente recebe topo com a cidade lida no servidor e o tutorial", async () => {
    ambiente.usuario = cliente;
    const arvore = await NavegacaoDaSessao({});
    const html = renderToStaticMarkup(arvore);
    expect(html).toContain("sc-topo-cliente");
    expect(html).toContain("Campinas, SP");
    expect(tipos(arvore).has(Tutorial)).toBe(true);
    expect(ambiente.cidade).toHaveBeenCalledTimes(1);
    expect(ambiente.tutorialVisto).toHaveBeenCalledWith("cliente");
  });

  it("[CA-24] @spec:AC-10515 só o cliente lê a cidade e ganha tutorial: visitante, dono, equipe e admin não", async () => {
    for (const papel of ["visitante", "dono", "equipe", "admin"]) {
      ambiente.usuario = { ...cliente, papel };
      const arvore = await NavegacaoDaSessao({});
      expect(tipos(arvore).has(Tutorial)).toBe(false);
    }
    expect(ambiente.cidade).not.toHaveBeenCalled();
    expect(ambiente.tutorialVisto).not.toHaveBeenCalled();
  });

  it("[CA-24] @spec:AC-10515 o papel vem só da sessão do servidor: nada no endereço o muda", async () => {
    ambiente.usuario = { papel: "visitante" };
    const html = renderToStaticMarkup(await NavegacaoDaSessao({}));
    expect(html).not.toContain("/painel");
    expect(html).not.toContain("/admin");
  });

  it("[CA-24] @spec:AC-10509 a sacola do topo só existe dentro de uma loja", async () => {
    ambiente.usuario = cliente;
    expect(renderToStaticMarkup(await NavegacaoDaSessao({}))).not.toContain(
      "sc-sacola-topo",
    );
    expect(
      renderToStaticMarkup(await NavegacaoDaSessao({ loja: PADARIA })),
    ).toContain("sc-sacola-topo");
  });

  it("[CA-24] @spec:AC-10503 a barra inferior sai com a sessão do pedido", async () => {
    ambiente.usuario = cliente;
    const html = renderToStaticMarkup(await BarraInferiorDaSessao());
    expect(html).toContain('aria-label="Navegação principal"');
    expect(html).toContain("sc-barra-inferior");
  });
});

describe("as três molduras", () => {
  const filho = <main id="conteudo" />;

  it("[CA-24] @spec:AC-10504 explorar: topo, conteúdo, rodapé e barra; sem a lateral", () => {
    const arvore = LayoutDoExplorar({ children: filho });
    const t = tipos(arvore);
    expect(t.has(NavegacaoDaSessao)).toBe(true);
    expect(t.has(BarraInferiorDaSessao)).toBe(true);
    expect(t.has(RodapeLegal)).toBe(true);
    expect(t.has(LateralDoUsuario)).toBe(false);
    expect(t.has("main")).toBe(true);
  });

  it("[CA-24] @spec:AC-10504 conta: topo, conteúdo, rodapé e barra; sem a lateral", () => {
    const t = tipos(LayoutDaMinhaConta({ children: filho }));
    expect(t.has(NavegacaoDaSessao)).toBe(true);
    expect(t.has(BarraInferiorDaSessao)).toBe(true);
    expect(t.has(RodapeLegal)).toBe(true);
    expect(t.has(LateralDoUsuario)).toBe(false);
  });

  it("[CA-24] @spec:AC-10511 loja: topo, rodapé, barra e a janela de acesso continua montada", async () => {
    const arvore = await MolduraDaLoja({
      children: filho,
      params: Promise.resolve({ slug: "padaria" }),
    });
    const t = tipos(arvore);
    expect(t.has(NavegacaoDaSessao)).toBe(true);
    expect(t.has(BarraInferiorDaSessao)).toBe(true);
    expect(t.has(RodapeLegal)).toBe(true);
    expect(t.has(JanelaDeAcesso)).toBe(true);
    expect(t.has(LateralDoUsuario)).toBe(false);
  });

  it("[CA-24] @spec:AC-10509 a loja entrega o apelido ao topo (e a sacola dele)", async () => {
    const arvore = (await MolduraDaLoja({
      children: filho,
      params: Promise.resolve({ slug: "padaria" }),
    })) as ReactElement<{ children: ReactNode }>;
    const filhos = ([] as ReactNode[]).concat(arvore.props.children);
    const topo = filhos.find(
      (f) => isValidElement(f) && f.type === NavegacaoDaSessao,
    ) as ReactElement<{ loja?: { apelido: string } }>;
    expect(topo.props.loja?.apelido).toBe("padaria");
  });

  it("[CA-24] @spec:AC-10504 a ordem do Tab: topo antes do conteúdo e a barra depois", () => {
    const arvore = LayoutDoExplorar({ children: filho }) as ReactElement<{
      children: ReactNode[];
    }>;
    const ordem = arvore.props.children.map((f) =>
      isValidElement(f) ? f.type : null,
    );
    expect(ordem.indexOf(NavegacaoDaSessao)).toBeLessThan(
      ordem.indexOf("main"),
    );
    expect(ordem.indexOf("main")).toBeLessThan(
      ordem.indexOf(BarraInferiorDaSessao),
    );
  });
});

describe("o tutorial do cliente", () => {
  it("[CA-25] @spec:AC-10516 cada passo com alvo tem ao menos um alvo na navegação nova", async () => {
    ambiente.usuario = cliente;
    const topoEBarra = (
      <>
        {await NavegacaoDaSessao({ loja: PADARIA })}
        {await BarraInferiorDaSessao()}
      </>
    );
    montar(topoEBarra);
    // Deixa o ícone da sacola ler a contagem.
    await new Promise((resolver) => setTimeout(resolver, 0));
    const semAlvo: string[] = [];
    for (const passo of PASSOS_DO_TUTORIAL.cliente) {
      if (passo.alvos === undefined || passo.id === "favoritar") continue;
      const achou = passo.alvos.some(
        (seletor) => document.querySelector(seletor) !== null,
      );
      if (!achou) semAlvo.push(passo.id);
    }
    expect(semAlvo).toEqual([]);
  });

  it("[CA-25] @spec:AC-10516 o passo de favoritar tem o destino de Favoritos como alvo", async () => {
    ambiente.usuario = cliente;
    montar(await BarraInferiorDaSessao());
    const passo = PASSOS_DO_TUTORIAL.cliente.find((p) => p.id === "favoritar");
    expect(
      passo?.alvos?.some((seletor) => document.querySelector(seletor) !== null),
    ).toBe(true);
  });

  it("[CA-25] @spec:AC-10516 o passo final aponta para o botão do menu da conta (que tem 'Ver tutorial')", async () => {
    ambiente.usuario = cliente;
    montar(await NavegacaoDaSessao({}));
    const final = PASSOS_DO_TUTORIAL.cliente.find((p) => p.id === "rever");
    expect(final?.alvos).toContain("[data-menu-da-conta]");
    expect(document.querySelector("[data-menu-da-conta]")).not.toBeNull();
    expect(document.querySelector("[data-ver-tutorial]")).not.toBeNull();
  });
});

describe("itens do topo e da barra", () => {
  it("[CA-26] @spec:AC-10526 navegar pelo topo não mexe no carrinho: os itens são links e nenhum chama a API da sacola", async () => {
    ambiente.usuario = cliente;
    const html = renderToStaticMarkup(
      <>
        {await NavegacaoDaSessao({ loja: PADARIA })}
        {await BarraInferiorDaSessao()}
      </>,
    );
    expect(html).toContain('href="/explorar/produtos"');
    expect(html).toContain('href="/conta/pedidos"');
    expect(html).not.toMatch(/carrinho(?!")/);
  });
});
