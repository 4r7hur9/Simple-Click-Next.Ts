// @vitest-environment jsdom
/**
 * Prova da tela do feed (card #37): abas e pílulas marcam onde a pessoa está,
 * os cartões levam à loja e ao produto, a paginação aparece só com mais de uma
 * página, o coração favorita (e volta atrás se a API recusar), e a localização
 * só é pedida quando a pessoa quer "Mais perto" — negada, o feed segue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LojaDoFeed, ProdutoDoFeed } from "@simpleclick/contracts";

const navegacao = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navegacao }));
vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    ...props
  }: ComponentProps<"img"> & { readonly priority?: boolean }) => <img {...props} />,
}));

import { BarraDoFeed, CHAVE_DO_LOCAL } from "../src/features/feed/BarraDoFeed.tsx";
import { BotaoFavoritar } from "../src/features/feed/BotaoFavoritar.tsx";
import { lerConsulta } from "../src/features/feed/consulta.ts";
import {
  NOME_DO_COOKIE_DE_CONSENTIMENTO,
  serializarConsentimento,
} from "../src/features/legal/consentimento.ts";
import { TelaDoFeed } from "../src/features/feed/TelaDoFeed.tsx";
import { apagarLocalDoAparelho } from "../src/features/usuario/local-do-aparelho.ts";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

function montar(no: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(no));
  return container;
}

beforeEach(() => {
  navegacao.push.mockReset();
  navegacao.replace.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
});

const TIPOS = [
  { codigo: "FOOD_SNACK", nome: "Lanchonete", alimentacao: true },
  { codigo: "FOOD_ACAI", nome: "Açaiteria", alimentacao: true },
  { codigo: "APPAREL", nome: "Roupas", alimentacao: false },
];

const PRODUTO: ProdutoDoFeed = {
  id: "p1",
  nome: "Pastel de carne",
  descricao: null,
  precoCentavos: 1200,
  precoOriginalCentavos: 1500,
  imagem: "/demo/pastel.webp",
  categoria: "Pastéis",
  loja: {
    apelido: "pastelaria-da-vila",
    nome: "Pastelaria da Vila",
    tipoDeNegocio: "FOOD_SNACK",
    logo: null,
    cidade: "São Paulo",
    bairro: "Vila Nova",
    formasDeEntrega: ["PICKUP"],
  },
  distanciaKm: 1.2,
  publicadoEm: "2026-10-16T10:00:00.000Z",
};

const LOJA: LojaDoFeed = {
  apelido: "pastelaria-da-vila",
  nome: "Pastelaria da Vila",
  tipoDeNegocio: "FOOD_SNACK",
  tipoDeNegocioNome: "Lanchonete",
  cidade: "São Paulo",
  bairro: "Vila Nova",
  uf: "SP",
  formasDeEntrega: ["DELIVERY", "PICKUP"],
  logo: null,
  capa: null,
  corDestaque: "cor-da-loja",
  distanciaKm: 0.4,
  produtosNoFeed: 6,
  favorita: true,
  ultimaVisita: null,
};

describe("TelaDoFeed", () => {
  it("produtos: área, tipo marcado, cartão com preço, distância e links", () => {
    const tela = montar(
      <TelaDoFeed
        consulta={lerConsulta("produtos", { tipo: "FOOD_SNACK,FOOD_ACAI" })}
        tipos={TIPOS}
        conteudo={{ estado: "produtos", itens: [PRODUTO], total: 1, porPagina: 24 }}
        logado={false}
      />,
    );
    // As áreas Explorar/Lojas são as abas do topo (card #128): a tela diz qual é a dela.
    expect(tela.querySelector("main")?.getAttribute("data-aba")).toBe("produtos");
    expect(tela.querySelector("h1")?.textContent).toBe("Explorar produtos e lojas");
    expect(tela.querySelector('.sc-feed__categoria[aria-current="true"]')?.textContent).toBe("Comida");
    const cartao = tela.querySelector('[data-produto="p1"]');
    expect(cartao?.querySelector("a")?.getAttribute("href")).toBe(
      "/loja/pastelaria-da-vila/produto/p1",
    );
    expect(cartao?.textContent).toContain("1,2 km");
    expect(cartao?.querySelector("s")?.textContent).toMatch(/15,00/);
    expect(cartao?.querySelector(".sc-feed__etiqueta")?.getAttribute("href")).toBe(
      "/explorar/produtos?tipo=FOOD_SNACK%2CFOOD_ACAI&categoria=Past%C3%A9is",
    );
    expect(tela.querySelector(".sc-feed__paginacao")).toBeNull();
  });

  it("lojas: paginação com filtros mantidos (produtos rolam sem páginas, card #49)", () => {
    const tela = montar(
      <TelaDoFeed
        consulta={lerConsulta("lojas", { busca: "pastel", pagina: "2" })}
        tipos={TIPOS}
        conteudo={{ estado: "lojas", itens: [LOJA], total: 60, porPagina: 24 }}
        logado={false}
      />,
    );
    const nav = tela.querySelector(".sc-feed__paginacao");
    expect(nav?.textContent).toContain("Página 2 de 3");
    expect(nav?.querySelector('[rel="prev"]')?.getAttribute("href")).toBe("/explorar/lojas?busca=pastel");
    expect(nav?.querySelector('[rel="next"]')?.getAttribute("href")).toBe(
      "/explorar/lojas?busca=pastel&pagina=3",
    );
  });

  it("lojas: cartão leva à vitrine e o coração vem marcado", () => {
    const tela = montar(
      <TelaDoFeed
        consulta={lerConsulta("lojas", {})}
        tipos={TIPOS}
        conteudo={{ estado: "lojas", itens: [LOJA], total: 1, porPagina: 24 }}
        logado
      />,
    );
    const cartao = tela.querySelector('[data-loja="pastelaria-da-vila"]');
    expect(cartao?.querySelector("a")?.getAttribute("href")).toBe("/loja/pastelaria-da-vila");
    expect(cartao?.textContent).toContain("400 m");
    expect(cartao?.textContent).toContain("Entrega e retirada");
    expect(cartao?.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
    expect(tela.querySelector('.sc-feed__listas [aria-current="true"]')?.textContent).toBe("Todas as lojas");
  });

  it("favoritas sem conta: convida a entrar e volta para cá", () => {
    const tela = montar(
      <TelaDoFeed
        consulta={lerConsulta("lojas", { lista: "favoritas" })}
        tipos={TIPOS}
        conteudo={{ estado: "precisa-entrar" }}
        logado={false}
      />,
    );
    expect(tela.textContent).toContain("Entre para ver suas lojas favoritas");
    expect(tela.querySelector(".sc-feed__chamada")?.getAttribute("href")).toBe(
      "/entrar?proximo=%2Fexplorar%2Flojas%3Flista%3Dfavoritas",
    );
  });

  it("vazio com filtro oferece limpar; API fora mostra erro", () => {
    const vazio = montar(
      <TelaDoFeed
        consulta={lerConsulta("produtos", { busca: "xyz", ordem: "recentes" })}
        tipos={TIPOS}
        conteudo={{ estado: "produtos", itens: [], total: 0, porPagina: 24 }}
        logado={false}
      />,
    );
    expect(vazio.textContent).toContain("Nada encontrado com esses filtros");
    expect(vazio.querySelector(".sc-feed__chamada")?.getAttribute("href")).toBe(
      "/explorar/produtos?ordem=recentes",
    );
    act(() => raiz?.unmount());
    container?.remove();

    const fora = montar(
      <TelaDoFeed
        consulta={lerConsulta("lojas", {})}
        tipos={[]}
        conteudo={{ estado: "indisponivel" }}
        logado={false}
      />,
    );
    expect(fora.textContent).toContain("O feed não carregou");
  });
});

describe("BotaoFavoritar", () => {
  it("sem conta: link para entrar", () => {
    const tela = montar(
      <BotaoFavoritar apelido="moda" nome="Moda" favorita={false} logado={false} voltarPara="/explorar/lojas" />,
    );
    expect(tela.querySelector("a")?.getAttribute("href")).toBe("/entrar?proximo=%2Fexplorar%2Flojas");
    expect(tela.querySelector("a")?.getAttribute("aria-label")).toBe("Entre para favoritar loja Moda");
  });

  it("marca e, se a API recusar, volta atrás", async () => {
    const buscar = vi
      .fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(Response.json({ apelido: "moda", favorita: true }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const tela = montar(
      <BotaoFavoritar apelido="moda" nome="Moda" favorita={false} logado voltarPara="/" buscar={buscar} />,
    );
    const botao = tela.querySelector("button");
    await act(async () => botao?.click());
    expect(botao?.getAttribute("aria-pressed")).toBe("true");
    expect(buscar.mock.calls[0]?.[0]).toBe("/api/conta/favoritos/moda");
    expect(buscar.mock.calls[0]?.[1]?.method).toBe("POST");

    await act(async () => botao?.click());
    expect(buscar.mock.calls[1]?.[1]?.method).toBe("DELETE");
    expect(botao?.getAttribute("aria-pressed")).toBe("true");
    expect(botao?.hasAttribute("data-falhou")).toBe(true);
  });
});

describe("BarraDoFeed e localização", () => {
  /** A pessoa aceitou os cookies funcionais depois do texto da localização. */
  function comConsentimentoFuncional() {
    const escolhidoEm = Date.parse("2026-11-13T12:00:00-03:00");
    document.cookie = `${NOME_DO_COOKIE_DE_CONSENTIMENTO}=${serializarConsentimento(
      { desempenho: false, funcionais: true },
      escolhidoEm,
    )}; Path=/`;
  }

  afterEach(() => {
    document.cookie = `${NOME_DO_COOKIE_DE_CONSENTIMENTO}=; Path=/; Max-Age=0`;
    window.localStorage.clear();
    // A coordenada também vive na memória da página: cada teste começa limpo.
    apagarLocalDoAparelho();
  });

  function comGeolocalizacao(
    resposta: "ok" | "negado",
  ): ReturnType<typeof vi.fn> {
    const getCurrentPosition = vi.fn(
      (ok: PositionCallback, falha?: PositionErrorCallback | null) => {
        if (resposta === "ok") {
          ok({ coords: { latitude: -23.55052, longitude: -46.633308 } } as GeolocationPosition);
        } else {
          falha?.({ code: 1 } as GeolocationPositionError);
        }
      },
    );
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
    return getCurrentPosition;
  }

  it("não pede localização sozinha ao abrir", () => {
    const pedir = comGeolocalizacao("ok");
    montar(<BarraDoFeed consulta={lerConsulta("produtos", {})} />);
    expect(pedir).not.toHaveBeenCalled();
    expect(navegacao.replace).not.toHaveBeenCalled();
  });

  it("'Perto de mim' pede, arredonda, guarda (com consentimento) e ordena por distância", () => {
    comConsentimentoFuncional();
    comGeolocalizacao("ok");
    const tela = montar(<BarraDoFeed consulta={lerConsulta("lojas", { tipo: "APPAREL" })} />);
    const botao = [...tela.querySelectorAll("button")].find((b) => b.textContent?.includes("Perto de mim"));
    act(() => botao?.click());
    expect(navegacao.push).toHaveBeenCalledWith(
      "/explorar/lojas?tipo=APPAREL&ordem=distancia&lat=-23.551&lng=-46.633",
      { scroll: false },
    );
    expect(JSON.parse(window.localStorage.getItem(CHAVE_DO_LOCAL) ?? "null")).toEqual({
      lat: -23.551,
      lng: -46.633,
    });
  });

  it("[CA-18] @spec:AC-10506 'Mais perto' no endereço NÃO pede a localização ao abrir", () => {
    const pedir = comGeolocalizacao("ok");
    const tela = montar(<BarraDoFeed consulta={lerConsulta("produtos", { ordem: "distancia" })} />);
    expect(pedir).not.toHaveBeenCalled();
    expect(navegacao.replace).not.toHaveBeenCalled();
    expect(tela.textContent).toContain("precisamos da sua localização");
  });

  it("negada: avisa e segue por relevância", () => {
    comGeolocalizacao("negado");
    const tela = montar(<BarraDoFeed consulta={lerConsulta("produtos", { ordem: "distancia" })} />);
    const botao = [...tela.querySelectorAll("button")].find((b) => b.textContent?.includes("Perto de mim"));
    act(() => botao?.click());
    expect(tela.querySelector('[role="status"]')?.textContent).toContain("mostramos por relevância");
    expect(navegacao.push).not.toHaveBeenCalled();
  });

  it("localização guardada entra sozinha, sem perguntar", () => {
    comConsentimentoFuncional();
    const pedir = comGeolocalizacao("ok");
    window.localStorage.setItem(CHAVE_DO_LOCAL, JSON.stringify({ lat: -23.5, lng: -46.6 }));
    montar(<BarraDoFeed consulta={lerConsulta("produtos", { busca: "pastel" })} />);
    expect(pedir).not.toHaveBeenCalled();
    expect(navegacao.replace).toHaveBeenCalledWith(
      "/explorar/produtos?busca=pastel&lat=-23.5&lng=-46.6",
      { scroll: false },
    );
  });

  it("busca e forma de receber viram endereço", () => {
    const tela = montar(<BarraDoFeed consulta={lerConsulta("produtos", { pagina: "3" })} />);
    const campo = tela.querySelector("input") as HTMLInputElement;
    act(() => {
      const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      definir?.call(campo, "açaí");
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => tela.querySelector("form")?.requestSubmit());
    expect(navegacao.push).toHaveBeenLastCalledWith(
      "/explorar/produtos?busca=a%C3%A7a%C3%AD",
      { scroll: false },
    );
    const retirada = [...tela.querySelectorAll("button")].find((b) => b.textContent === "Retirada");
    act(() => retirada?.click());
    expect(navegacao.push).toHaveBeenLastCalledWith("/explorar/produtos?entrega=retirada", {
      scroll: false,
    });
  });
});
