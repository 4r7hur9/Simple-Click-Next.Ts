// @vitest-environment jsdom
/**
 * O topo do cliente e o menu da conta (card #105): marca, abas como links com
 * uma página atual, busca que leva ao campo do feed e o menu por papel com
 * "Ver tutorial" e "Sair".
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clicar, desmontar, exigir, montar } from "./apoio-config.tsx";

const rota = vi.hoisted(() => ({
  caminho: "/explorar/produtos",
  busca: "",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => rota.caminho,
  useSearchParams: () => new URLSearchParams(rota.busca),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { EVENTO_VER_TUTORIAL } from "../src/features/tutorial/passos.ts";
import { MenuDaConta } from "../src/features/usuario/MenuDaConta.tsx";
import { TopoDoCliente } from "../src/features/usuario/TopoDoCliente.tsx";
import { VISITANTE, type UsuarioDaBarra } from "../src/lib/quem-esta-logado.ts";

const cliente: UsuarioDaBarra = {
  papel: "cliente",
  nome: "Ana Ribeiro",
  primeiroNome: "Ana",
  iniciais: "AR",
  email: "ana@exemplo.test",
  loja: null,
  temOutrasLojas: false,
};
const dono: UsuarioDaBarra = {
  ...cliente,
  papel: "dono",
  loja: { apelido: "padaria", nome: "Padaria" },
};
const PADARIA = { apelido: "padaria", nome: "Padaria" };

const sair = vi.fn(async (_caminho: string) => undefined);

beforeEach(() => {
  rota.caminho = "/explorar/produtos";
  rota.busca = "";
  sair.mockClear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  desmontar();
  document.getElementById("sc-feed-busca")?.remove();
});

function topo(
  usuario: UsuarioDaBarra,
  loja?: { apelido: string; nome: string },
) {
  return montar(<TopoDoCliente usuario={usuario} loja={loja} sair={sair} />);
}

describe("marca e abas", () => {
  it("[CA-11] @spec:AC-10502 a marca leva a /explorar", () => {
    const tela = topo(cliente);
    const marca = exigir<HTMLAnchorElement>(tela, ".sc-topo-cliente__marca");
    expect(marca.getAttribute("href")).toBe("/explorar");
    expect(marca.getAttribute("aria-label")).toContain("SimpleClick");
  });

  it("[CA-11] @spec:AC-10501 as quatro abas são links e só a atual leva aria-current", () => {
    rota.caminho = "/explorar/lojas";
    const tela = topo(cliente);
    const abas = [
      ...tela.querySelectorAll<HTMLAnchorElement>(".sc-topo-cliente__aba"),
    ];
    expect(abas.map((a) => a.textContent)).toEqual([
      "Explorar",
      "Lojas",
      "Favoritos",
      "Pedidos",
    ]);
    expect(abas.map((a) => a.getAttribute("href"))).toEqual([
      "/explorar/produtos",
      "/explorar/lojas",
      "/conta/favoritos",
      "/conta/pedidos",
    ]);
    const atuais = abas.filter(
      (a) => a.getAttribute("aria-current") === "page",
    );
    expect(atuais.map((a) => a.textContent)).toEqual(["Lojas"]);
  });

  it("[CA-11] @spec:AC-10501 em Perfil nenhuma aba é a atual e o avatar nunca leva aria-current", () => {
    rota.caminho = "/conta/dados";
    const tela = topo(cliente);
    expect(
      tela.querySelectorAll(".sc-topo-cliente__aba[aria-current]"),
    ).toHaveLength(0);
    expect(
      exigir(tela, ".sc-menu-conta__botao").hasAttribute("aria-current"),
    ).toBe(false);
  });

  it("[CA-11] @spec:AC-10525 as abas levam a busca e os filtros comuns", () => {
    rota.busca = "busca=pao&entrega=entrega&categoria=salgados";
    const tela = topo(cliente);
    const lojas = exigir<HTMLAnchorElement>(tela, '[data-navegacao="lojas"]');
    const url = new URL(lojas.getAttribute("href") ?? "", "https://x.test");
    expect(url.pathname).toBe("/explorar/lojas");
    expect(url.searchParams.get("busca")).toBe("pao");
    expect(url.searchParams.get("entrega")).toBe("entrega");
    expect(url.searchParams.get("categoria")).toBeNull();
  });

  it("[CA-11] @spec:AC-10524 some na TV da loja", () => {
    rota.caminho = "/loja/padaria/tv";
    const tela = topo(cliente, PADARIA);
    expect(tela.querySelector(".sc-topo-cliente")).toBeNull();
  });

  it("[CA-11] @spec:AC-10501 mostra os espaços de localização e de sacola entregues pelo servidor", () => {
    const tela = montar(
      <TopoDoCliente
        usuario={cliente}
        sair={sair}
        localizacao={<span id="local">São Paulo, SP</span>}
        sacola={<span id="sacola">3</span>}
      />,
    );
    expect(tela.querySelector("#local")?.textContent).toBe("São Paulo, SP");
    expect(tela.querySelector("#sacola")?.textContent).toBe("3");
  });
});

describe("busca", () => {
  it("[CA-12] @spec:AC-10502 fora do feed o ícone leva ao campo de busca do feed", () => {
    rota.caminho = "/conta";
    const tela = topo(cliente);
    const busca = exigir<HTMLAnchorElement>(tela, '[data-navegacao="buscar"]');
    expect(busca.getAttribute("href")).toBe("/explorar/produtos#sc-feed-busca");
    expect(busca.getAttribute("aria-label")).toBe("Buscar");
  });

  it("[CA-12] @spec:AC-10502 já no feed só move o foco, sem navegar", () => {
    const campo = document.createElement("input");
    campo.id = "sc-feed-busca";
    document.body.append(campo);
    const tela = topo(cliente);
    const busca = exigir(tela, '[data-navegacao="buscar"]');
    const evento = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      busca.dispatchEvent(evento);
    });
    expect(evento.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(campo);
  });

  it("[CA-12] @spec:AC-10502 sem o campo na página a navegação segue (não bloqueia o clique)", () => {
    const tela = topo(cliente);
    const busca = exigir(tela, '[data-navegacao="buscar"]');
    const evento = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      busca.dispatchEvent(evento);
    });
    expect(evento.defaultPrevented).toBe(false);
  });

  it("[CA-12] @spec:AC-10502 ao chegar com o endereço do campo, o topo leva o foco até ele", async () => {
    window.history.replaceState(null, "", "/explorar/produtos#sc-feed-busca");
    const campo = document.createElement("input");
    campo.id = "sc-feed-busca";
    document.body.append(campo);
    topo(cliente);
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 50));
    });
    expect(document.activeElement).toBe(campo);
  });
});

describe("menu da conta", () => {
  function menu(usuario: UsuarioDaBarra, loja?: typeof PADARIA) {
    return montar(<MenuDaConta usuario={usuario} loja={loja} sair={sair} />);
  }
  const painel = (tela: HTMLElement) =>
    exigir<HTMLElement>(tela, ".sc-menu-conta__painel");
  const botaoDoMenu = (tela: HTMLElement) =>
    exigir<HTMLButtonElement>(tela, ".sc-menu-conta__botao");

  it("[CA-13] @spec:AC-10516 começa fechado e o botão abre e fecha com aria-expanded", () => {
    const tela = menu(cliente);
    expect(painel(tela).hidden).toBe(true);
    expect(botaoDoMenu(tela).getAttribute("aria-expanded")).toBe("false");
    clicar(botaoDoMenu(tela));
    expect(painel(tela).hidden).toBe(false);
    expect(botaoDoMenu(tela).getAttribute("aria-expanded")).toBe("true");
    clicar(botaoDoMenu(tela));
    expect(painel(tela).hidden).toBe(true);
  });

  it("[CA-13] @spec:AC-10516 Esc fecha e devolve o foco ao botão", () => {
    const tela = menu(cliente);
    clicar(botaoDoMenu(tela));
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(painel(tela).hidden).toBe(true);
    expect(document.activeElement).toBe(botaoDoMenu(tela));
  });

  it("[CA-13] @spec:AC-10516 clique fora fecha", () => {
    const tela = menu(cliente);
    clicar(botaoDoMenu(tela));
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(painel(tela).hidden).toBe(true);
  });

  it("[CA-13] @spec:AC-10515 o cliente vê os itens da conta e nunca o painel nem a administração", () => {
    const tela = menu(cliente);
    const hrefs = [...tela.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/conta/pedidos");
    expect(hrefs).toContain("/conta/favoritos");
    expect(
      hrefs.some((h) => h?.startsWith("/painel") || h?.startsWith("/admin")),
    ).toBe(false);
  });

  it("[CA-13] @spec:AC-10515 o dono vê o painel e nunca a administração", () => {
    const tela = menu(dono);
    const hrefs = [...tela.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/painel");
    expect(hrefs.some((h) => h?.startsWith("/admin"))).toBe(false);
  });

  it("[CA-13] @spec:AC-10511 dentro da loja Entrar e Criar conta abrem a janela de acesso", () => {
    rota.caminho = "/loja/padaria/cardapio";
    const tela = menu(VISITANTE, PADARIA);
    const entrar = exigir<HTMLAnchorElement>(
      tela,
      '[data-abre-acesso="entrar"]',
    );
    expect(entrar.getAttribute("href")).toBe(
      "/entrar?proximo=%2Floja%2Fpadaria%2Fcardapio",
    );
    expect(tela.querySelector('[data-abre-acesso="criar"]')).not.toBeNull();
  });

  it("[CA-13] @spec:AC-10511 fora da loja o visitante navega para entrar, sem janela", () => {
    const tela = menu(VISITANTE);
    expect(tela.querySelector("[data-abre-acesso]")).toBeNull();
    const hrefs = [...tela.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.some((h) => h?.startsWith("/entrar"))).toBe(true);
    // O visitante não tem "Sair" nem "Ver tutorial".
    expect(tela.textContent).not.toContain("Sair");
    expect(tela.textContent).not.toContain("Ver tutorial");
  });

  it("[CA-13] @spec:AC-10516 Ver tutorial (cliente) dispara o evento do tutorial e fecha o menu", () => {
    const tela = menu(cliente);
    clicar(botaoDoMenu(tela));
    const ouvinte = vi.fn();
    window.addEventListener(EVENTO_VER_TUTORIAL, ouvinte);
    clicar(exigir(tela, "[data-ver-tutorial]"));
    window.removeEventListener(EVENTO_VER_TUTORIAL, ouvinte);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(painel(tela).hidden).toBe(true);
  });

  it("[CA-13] @spec:AC-10516 só o cliente tem Ver tutorial", () => {
    expect(menu(dono).querySelector("[data-ver-tutorial]")).toBeNull();
  });

  it("[CA-13] @spec:AC-10516 Sair chama a ação do servidor com a página atual e apaga os dados locais", async () => {
    rota.caminho = "/loja/padaria/cardapio";
    window.localStorage.setItem(
      "sc:feed:local",
      JSON.stringify({ lat: -23.5, lng: -46.6 }),
    );
    window.localStorage.setItem(
      "sc:feed:stories-vistos",
      JSON.stringify(["s1"]),
    );
    const tela = menu(cliente, PADARIA);
    clicar(exigir(tela, ".sc-menu-conta__item--sair"));
    await act(async () => {});
    expect(sair).toHaveBeenCalledWith("/loja/padaria/cardapio");
    expect(window.localStorage.getItem("sc:feed:local")).toBeNull();
    expect(window.localStorage.getItem("sc:feed:stories-vistos")).toBeNull();
  });

  it("[CA-13] @spec:AC-10501 o item da página atual leva aria-current no menu", () => {
    rota.caminho = "/conta/pedidos";
    const tela = menu(cliente);
    const atual = tela.querySelectorAll(
      '.sc-menu-conta__item[aria-current="page"]',
    );
    expect([...atual].map((a) => a.textContent)).toEqual(["Pedidos"]);
  });
});
