// @vitest-environment jsdom
/**
 * Prova do /explorar como rede social (card #49): leitura folgada das mídias,
 * stories e comentários; o post (loja no topo, 4:5, Pedir, curtir com volta
 * atrás); a gaveta de comentários (aprovados + o próprio pendente, aviso de
 * aprovação, exige conta); a fileira de stories (anel novo/visto, ordem) e a
 * rolagem infinita pedindo a próxima página.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LojaDoFeed, ProdutoDoFeed } from "@simpleclick/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    fill: _fill,
    ...props
  }: ComponentProps<"img"> & { readonly priority?: boolean; readonly fill?: boolean }) => (
    <img {...props} />
  ),
}));

import { FeedDeLojas } from "../src/features/feed/FeedDeLojas.tsx";
import { FeedDePosts } from "../src/features/feed/FeedDePosts.tsx";
import { PostDeLoja } from "../src/features/feed/PostDeLoja.tsx";
import { GavetaDeComentarios } from "../src/features/feed/GavetaDeComentarios.tsx";
import { Post } from "../src/features/feed/Post.tsx";
import {
  CHAVE_DOS_STORIES_VISTOS,
  comentariosVisiveis,
  lerComentarios,
  lerStories,
  midiasDoProduto,
  postsDoCatalogo,
  ordenarStories,
  primeiroNaoVisto,
  tempoRelativo,
  temStoryNovo,
  type AcoesDoFeed,
} from "../src/features/feed/social.ts";
import { FileiraDeStories } from "../src/features/feed/Stories.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  window.localStorage.clear();
  // jsdom não tem showModal/close de <dialog>.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const PRODUTO: ProdutoDoFeed = {
  id: "p1",
  nome: "Pastel de carne",
  descricao: "Massa fina e crocante.",
  precoCentavos: 1200,
  precoOriginalCentavos: null,
  imagem: "/demo/pastel.webp",
  categoria: "Pastéis",
  loja: {
    apelido: "pastelaria-da-vila",
    nome: "Pastelaria da Vila",
    tipoDeNegocio: "FOOD_SNACK",
    logo: "/demo/logo.webp",
    cidade: "São Paulo",
    bairro: "Vila Nova",
    formasDeEntrega: ["PICKUP"],
  },
  distanciaKm: null,
  publicadoEm: "2026-10-16T10:00:00.000Z",
};

function acoesFalsas(mudancas: Partial<AcoesDoFeed> = {}): AcoesDoFeed {
  return {
    maisPosts: vi.fn(async () => ({ ok: true as const, dados: { itens: [], total: 0 } })),
    curtir: vi.fn(async (_id: string, quer: boolean) => ({
      ok: true as const,
      dados: { curtidas: quer ? 1 : 0, curtiu: quer },
    })),
    favoritarProduto: vi.fn(async (_id: string, quer: boolean) => ({
      ok: true as const,
      dados: { favorito: quer },
    })),
    comentarios: vi.fn(async () => ({ ok: true as const, dados: [] })),
    comentar: vi.fn(async (_id: string, texto: string) => ({
      ok: true as const,
      dados: {
        id: "c9",
        autor: "Ana",
        texto,
        criadoEm: "2026-10-17T12:00:00.000Z",
        situacao: "pendente" as const,
        meu: true,
      },
    })),
    ...mudancas,
  };
}

async function esperar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("social.ts (leitura com folga)", () => {
  it("mídias: usa `midias` quando vem; senão a imagem", () => {
    expect(midiasDoProduto(PRODUTO)).toEqual([{ tipo: "imagem", url: "/demo/pastel.webp" }]);
    const comVideo = {
      ...PRODUTO,
      midias: [
        { tipo: "video", url: "/v.mp4", capaUrl: "/c.webp" },
        { tipo: "imagem", url: "/a.webp" },
        { tipo: "imagem" },
      ],
    };
    expect(midiasDoProduto(comVideo)).toEqual([
      { tipo: "video", url: "/v.mp4", capa: "/c.webp" },
      { tipo: "imagem", url: "/a.webp" },
    ]);
    expect(midiasDoProduto({ ...PRODUTO, imagem: null })).toEqual([]);
  });

  it("stories: tira vencido e loja sem story; foto de perfil vem do logo", () => {
    const agora = Date.parse("2026-10-17T12:00:00.000Z");
    const lojas = lerStories(
      {
        lojas: [
          {
            apelido: "a",
            nome: "A",
            logo: "/a.webp",
            stories: [
              { id: 1, tipo: "imagem", url: "/1.webp", criadoEm: "2026-10-17T08:00:00.000Z", expiraEm: "2026-10-18T08:00:00.000Z" },
              { id: 2, tipo: "video", url: "/2.mp4", criadoEm: "2026-10-16T08:00:00.000Z", expiraEm: "2026-10-17T08:00:00.000Z" },
            ],
          },
          { apelido: "b", nome: "B", stories: [] },
          { nome: "sem apelido", stories: [] },
        ],
      },
      agora,
    );
    expect(lojas).toHaveLength(1);
    expect(lojas[0]?.foto).toBe("/a.webp");
    expect(lojas[0]?.stories.map((s) => s.id)).toEqual(["1"]);
    expect(lerStories(null)).toEqual([]);
  });

  it("stories no formato do #46: perfil em `loja`, iniciais e `visto` da API", () => {
    const [loja] = lerStories(
      {
        lojas: [
          {
            loja: { apelido: "pv", nome: "Pastelaria da Vila", fotoDePerfil: null, iniciais: "PV", corDestaque: null },
            favorita: true,
            temNaoVistos: false,
            ultimoEm: "2026-10-17T08:00:00.000Z",
            stories: [
              { id: "u1", tipo: "imagem", url: "/s.webp", capa: null, duracaoSegundos: null, largura: null, altura: null, legenda: "Hoje tem!", link: null, criadoEm: "2026-10-17T08:00:00.000Z", expiraEm: "2099-01-01T00:00:00.000Z", visto: true },
            ],
          },
        ],
      },
      Date.parse("2026-10-17T12:00:00.000Z"),
    );
    expect(loja).toMatchObject({ apelido: "pv", foto: null, iniciais: "PV", favorita: true });
    expect(loja?.stories[0]).toMatchObject({ legenda: "Hoje tem!", visto: true });
    // Visto pela API: anel cinza mesmo sem nada guardado no navegador.
    expect(loja === undefined ? null : temStoryNovo(loja, {})).toBe(false);
  });

  it("stories: anel novo some depois de visto; favoritas e novidades primeiro", () => {
    const loja = (apelido: string, criadoEm: string, favorita = false) => ({
      apelido,
      nome: apelido,
      foto: null,
      iniciais: apelido.toUpperCase(),
      favorita,
      stories: [{ id: apelido, tipo: "imagem" as const, url: "/x", criadoEm, duracaoMs: 5000 }],
    });
    const a = loja("a", "2026-10-17T01:00:00Z");
    const b = loja("b", "2026-10-17T02:00:00Z", true);
    const c = loja("c", "2026-10-17T03:00:00Z");
    const vistos = { c: "2026-10-17T03:00:00Z" };
    expect(temStoryNovo(c, vistos)).toBe(false);
    expect(temStoryNovo(a, vistos)).toBe(true);
    expect(ordenarStories([a, b, c], vistos).map((l) => l.apelido)).toEqual(["b", "a", "c"]);
    expect(primeiroNaoVisto(c, vistos)).toBe(0);
  });

  it("comentários: aprovados de todos e só os próprios pendentes", () => {
    const lista = lerComentarios({
      comentarios: [
        { id: "1", autor: { nome: "Bia" }, texto: "Top", criadoEm: "2026-10-17T02:00:00Z", situacao: "APPROVED" },
        { id: "2", autor: "Caio", texto: "Hmm", criadoEm: "2026-10-17T03:00:00Z", situacao: "pendente" },
        { id: "3", texto: "Meu", criadoEm: "2026-10-17T01:00:00Z", status: "pending", meu: true },
        { id: "4", texto: "Recusado", criadoEm: "2026-10-17T01:00:00Z", situacao: "recusado" },
      ],
    });
    expect(lista.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(comentariosVisiveis(lista).map((c) => c.id)).toEqual(["3", "1"]);
    expect(lista[2]?.autor).toBe("Cliente");
  });

  it("tempo relativo curto", () => {
    const agora = Date.parse("2026-10-17T12:00:00Z");
    expect(tempoRelativo("2026-10-17T11:59:30Z", agora)).toBe("agora");
    expect(tempoRelativo("2026-10-17T11:55:00Z", agora)).toBe("5 min");
    expect(tempoRelativo("2026-10-17T09:00:00Z", agora)).toBe("3 h");
    expect(tempoRelativo("2026-10-15T12:00:00Z", agora)).toBe("2 d");
  });
});

describe("Post", () => {
  it("loja no topo leva ao perfil; Pedir abre o produto; mídia 4:5", () => {
    const tela = montar(
      <Post
        produto={PRODUTO}
        logado={false}
        voltarPara="/explorar/produtos"
        acoes={acoesFalsas()}
        seguindo={false}
        aoMudarSeguir={() => undefined}
        aoAbrirComentarios={() => undefined}
      />,
    );
    expect(tela.querySelector(".sc-post__loja")?.getAttribute("href")).toBe("/loja/pastelaria-da-vila");
    expect(tela.querySelector(".sc-post__avatar img")?.getAttribute("src")).toBe("/demo/logo.webp");
    expect(tela.querySelector(".sc-post__pedir")?.getAttribute("href")).toBe(
      "/loja/pastelaria-da-vila/produto/p1",
    );
    expect(tela.querySelector(".sc-post__midia img")?.getAttribute("alt")).toBe("Pastel de carne");
    // Sem conta: curtir e seguir levam a entrar e voltar ao feed.
    expect(tela.querySelector('[aria-label="Entre para curtir"]')?.getAttribute("href")).toBe(
      "/entrar?proximo=%2Fexplorar%2Fprodutos",
    );
    // Favorito da loja: botão de TEXTO no topo, sem estrela.
    expect(tela.querySelector(".sc-feed__favoritar--seguir")?.textContent).toBe("Favoritar loja");
    expect(tela.querySelector(".sc-feed__favoritar--seguir svg")).toBeNull();
    expect(tela.querySelector(".sc-feed__favoritar--seguir")?.getAttribute("aria-label")).toBe(
      "Entre para favoritar loja Pastelaria da Vila",
    );
  });

  it("curtir conta na hora e volta atrás se a API recusar", async () => {
    const curtir = vi.fn(async () => ({ ok: false as const, motivo: "indisponivel" as const }));
    const tela = montar(
      <Post
        produto={{ ...PRODUTO, curtidas: 4 } as ProdutoDoFeed}
        logado
        voltarPara="/explorar/produtos"
        acoes={acoesFalsas({ curtir })}
        seguindo
        aoMudarSeguir={() => undefined}
        aoAbrirComentarios={() => undefined}
      />,
    );
    expect(tela.querySelector(".sc-post__curtidas")?.textContent).toBe("4 curtidas");
    expect(tela.querySelector(".sc-feed__favoritar--seguir")?.textContent).toBe("Loja favorita");
    expect(tela.querySelector(".sc-feed__favoritar--seguir")?.getAttribute("aria-label")).toBe(
      "Favorito: loja Pastelaria da Vila",
    );
    // A ÚNICA estrela do post (5 pontas) favorita o PRODUTO.
    expect(tela.querySelectorAll(".lucide-star")).toHaveLength(1);
    expect(tela.querySelector(".sc-feed__favoritar--acao .lucide-star")).not.toBeNull();
    expect(tela.querySelector(".sc-feed__favoritar--acao")?.getAttribute("aria-label")).toBe(
      "Favoritar produto Pastel de carne",
    );
    const botao = tela.querySelector<HTMLButtonElement>(".sc-post__acao--curtir");
    // Curtir é o brilho de 4 pontas, nunca coração (regra do chefe).
    expect(botao?.getAttribute("aria-label")).toBe("Curtir");
    expect(botao?.querySelector("svg path")?.getAttribute("d")).toMatch(/^M12 2\.5C/);
    expect(tela.querySelector(".lucide-heart")).toBeNull();
    act(() => botao?.click());
    expect(botao?.getAttribute("aria-pressed")).toBe("true");
    expect(botao?.getAttribute("aria-label")).toBe("Curtido");
    expect(botao?.querySelector("svg")?.getAttribute("data-preenchido")).toBe("true");
    expect(tela.querySelector(".sc-post__curtidas")?.textContent).toBe("5 curtidas");
    await esperar();
    expect(curtir).toHaveBeenCalledWith("p1", true);
    expect(botao?.getAttribute("aria-pressed")).toBe("false");
    expect(tela.querySelector(".sc-post__curtidas")?.textContent).toBe("4 curtidas");
    expect(tela.querySelector(".sc-post__aviso")?.textContent).toMatch(/Não deu para curtir/);
  });
});

describe("GavetaDeComentarios", () => {
  it("mostra aprovados, envia e avisa que aguarda aprovação", async () => {
    const acoes = acoesFalsas({
      comentarios: vi.fn(async () => ({
        ok: true as const,
        dados: [
          { id: "1", autor: "Bia", texto: "Muito bom!", criadoEm: "2026-10-16T12:00:00Z", situacao: "aprovado" as const, meu: false },
          { id: "2", autor: "Caio", texto: "Pendente alheio", criadoEm: "2026-10-16T13:00:00Z", situacao: "pendente" as const, meu: false },
        ],
      })),
    });
    const tela = montar(
      <GavetaDeComentarios produto={PRODUTO} logado voltarPara="/explorar/produtos" acoes={acoes} aoFechar={() => undefined} />,
    );
    await esperar();
    const itens = () => [...tela.querySelectorAll(".sc-comentario")].map((li) => li.textContent);
    expect(itens()).toEqual([expect.stringContaining("Muito bom!")]);

    const campo = tela.querySelector("textarea");
    act(() => {
      const definir = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      definir?.call(campo, "Quero dois!");
      campo?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => tela.querySelector("form")?.requestSubmit());
    await esperar();
    expect(acoes.comentar).toHaveBeenCalledWith("p1", "Quero dois!");
    expect(tela.querySelector(".sc-comentarios__retorno")?.textContent).toBe(
      "Seu comentário aguarda aprovação da loja.",
    );
    expect(itens()).toHaveLength(2);
    expect(tela.querySelector(".sc-comentario[data-pendente]")?.textContent).toContain("Aguardando aprovação");
  });

  it("sem conta: lê, mas para escrever pede entrar com volta ao feed", async () => {
    const tela = montar(
      <GavetaDeComentarios
        produto={PRODUTO}
        logado={false}
        voltarPara="/explorar/produtos?tipo=FOOD_SNACK"
        acoes={acoesFalsas()}
        aoFechar={() => undefined}
      />,
    );
    await esperar();
    expect(tela.querySelector("textarea")).toBeNull();
    expect(tela.querySelector(".sc-comentarios__entrar a")?.getAttribute("href")).toBe(
      "/entrar?proximo=%2Fexplorar%2Fprodutos%3Ftipo%3DFOOD_SNACK",
    );
    expect(tela.textContent).toContain("Ainda sem comentários");
  });
});

describe("FileiraDeStories", () => {
  const LOJAS = [
    { apelido: "a", nome: "Loja A", foto: "/a.webp", iniciais: "LA", favorita: false, stories: [{ id: "1", tipo: "imagem" as const, url: "/1.webp", criadoEm: "2026-10-17T01:00:00Z", duracaoMs: 5000 }] },
    { apelido: "b", nome: "Loja B", foto: null, iniciais: "LB", favorita: true, stories: [{ id: "2", tipo: "imagem" as const, url: "/2.webp", criadoEm: "2026-10-17T02:00:00Z", duracaoMs: 5000 }] },
  ];

  it("bolinhas com a foto da loja; favorita primeiro; visto fica cinza", () => {
    window.localStorage.setItem(CHAVE_DOS_STORIES_VISTOS, JSON.stringify({ b: "2026-10-17T02:00:00Z" }));
    const tela = montar(<FileiraDeStories lojas={LOJAS} />);
    const bolinhas = [...tela.querySelectorAll(".sc-stories__bolinha")];
    // b é favorita, mas já foi vista: quem tem novidade vem antes.
    expect(bolinhas.map((b) => b.querySelector(".sc-stories__nome")?.textContent)).toEqual(["Loja A", "Loja B"]);
    expect(bolinhas[0]?.hasAttribute("data-novo")).toBe(true);
    expect(bolinhas[1]?.hasAttribute("data-novo")).toBe(false);
    expect(bolinhas[0]?.querySelector("img")?.getAttribute("src")).toBe("/a.webp");
    // Sem foto de perfil, as iniciais da loja.
    expect(bolinhas[1]?.querySelector(".sc-stories__iniciais")?.textContent).toBe("LB");
  });

  it("abre o visualizador com 'Ver loja' e marca como visto", () => {
    const tela = montar(<FileiraDeStories lojas={LOJAS} />);
    act(() => tela.querySelector<HTMLButtonElement>(".sc-stories__bolinha")?.click());
    const janela = tela.querySelector(".sc-story");
    expect(janela?.getAttribute("aria-label")).toBe("Stories de Loja B");
    expect(janela?.querySelector(".sc-story__ver")?.getAttribute("href")).toBe("/loja/b");
    expect(JSON.parse(window.localStorage.getItem(CHAVE_DOS_STORIES_VISTOS) ?? "{}")).toEqual({
      b: "2026-10-17T02:00:00Z",
    });
  });

  it("sem stories, nada aparece", () => {
    const tela = montar(<FileiraDeStories lojas={[]} />);
    expect(tela.querySelector(".sc-stories")).toBeNull();
  });
});

describe("FeedDePosts", () => {
  it("'Carregar mais' pede a página 2 com os mesmos filtros e soma sem repetir", async () => {
    const maisPosts = vi.fn(async () => ({
      ok: true as const,
      dados: { itens: [PRODUTO, { ...PRODUTO, id: "p2", nome: "Pastel de queijo" }], total: 2 },
    }));
    const tela = montar(
      <FeedDePosts
        inicial={[PRODUTO]}
        total={2}
        parametros={{ tipo: "FOOD_SNACK" }}
        logado={false}
        voltarPara="/explorar/produtos"
        seguidas={[]}
        acoes={acoesFalsas({ maisPosts })}
      />,
    );
    act(() => tela.querySelector<HTMLButtonElement>(".sc-posts__mais")?.click());
    await esperar();
    expect(maisPosts).toHaveBeenCalledWith({ tipo: "FOOD_SNACK" }, 2);
    expect([...tela.querySelectorAll(".sc-post")].map((p) => p.getAttribute("data-produto"))).toEqual([
      "p1",
      "p2",
    ]);
    expect(tela.querySelector(".sc-posts__aviso")?.textContent).toContain("todos os 2 posts");
  });

  it("falha ao carregar mais: oferece tentar de novo", async () => {
    const maisPosts = vi.fn(async () => ({ ok: false as const, motivo: "indisponivel" as const }));
    const tela = montar(
      <FeedDePosts
        inicial={[PRODUTO]}
        total={5}
        parametros={{}}
        logado={false}
        voltarPara="/explorar/produtos"
        seguidas={[]}
        acoes={acoesFalsas({ maisPosts })}
      />,
    );
    act(() => tela.querySelector<HTMLButtonElement>(".sc-posts__mais")?.click());
    await esperar();
    expect(tela.querySelector(".sc-posts__aviso")?.textContent).toContain("Tentar de novo");
  });
});

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
  fotoDePerfil: null,
  iniciais: "PV",
  capa: null,
  corDestaque: "cor",
  distanciaKm: 0.4,
  produtosNoFeed: 6,
  favorita: false,
  ultimaVisita: null,
};

describe("PostDeLoja (aba Lojas no jeito de post)", () => {
  it("topo com iniciais e nome, capa padrão do ramo, fatos e 'Ver loja'", () => {
    const tela = montar(
      <PostDeLoja
        loja={LOJA}
        logado={false}
        voltarPara="/explorar/lojas"
        acoes={acoesFalsas()}
        favorita={false}
        aoMudarFavorita={() => undefined}
      />,
    );
    expect(tela.querySelector(".sc-post__avatar")?.textContent).toBe("PV");
    expect(tela.querySelector(".sc-post__loja")?.getAttribute("href")).toBe("/loja/pastelaria-da-vila");
    const midia = tela.querySelector<HTMLElement>(".sc-post__midia--loja");
    expect(midia?.style.getPropertyValue("--capa-url")).toContain("/capas-padrao/food_snack.svg");
    expect(tela.querySelector(".sc-post__pedir")?.textContent).toBe("Ver loja");
    expect(tela.querySelector(".sc-post__fatos")?.textContent).toContain("Entrega e retirada");
    expect(tela.querySelector(".sc-post__fatos")?.textContent).toContain("400 m");
    // Curtir = brilho; favoritar = estrela. Sem conta, os dois levam a entrar.
    expect(tela.querySelector('[aria-label="Entre para curtir"] svg path')).not.toBeNull();
    expect(tela.querySelector(".sc-feed__favoritar--acao .lucide-star")).not.toBeNull();
  });

  it("curtir a loja volta atrás quando a API ainda não existe", async () => {
    const tela = montar(
      <PostDeLoja
        loja={LOJA}
        logado
        voltarPara="/explorar/lojas"
        acoes={acoesFalsas()}
        favorita
        aoMudarFavorita={() => undefined}
      />,
    );
    const botao = tela.querySelector<HTMLButtonElement>(".sc-post__acao--curtir");
    act(() => botao?.click());
    await esperar();
    expect(botao?.getAttribute("aria-pressed")).toBe("false");
    // No post de LOJA a estrela é da loja, e só ela: o topo não repete.
    expect(tela.querySelector(".sc-feed__favoritar--seguir")).toBeNull();
    expect(tela.querySelectorAll(".lucide-star")).toHaveLength(1);
    expect(tela.querySelector(".sc-feed__favoritar--acao")?.getAttribute("aria-label")).toBe(
      "Favorito: loja Pastelaria da Vila",
    );
  });
});

describe("FeedDeLojas", () => {
  it("pede a página 2 de lojas com os mesmos filtros", async () => {
    const maisLojas = vi.fn(async () => ({
      ok: true as const,
      dados: { itens: [{ ...LOJA, apelido: "moda", nome: "Moda" }], total: 2 },
    }));
    const tela = montar(
      <FeedDeLojas
        inicial={[LOJA]}
        total={2}
        parametros={{ tipo: "FOOD_SNACK" }}
        paginada
        logado={false}
        voltarPara="/explorar/lojas"
        acoes={acoesFalsas({ maisLojas })}
      />,
    );
    act(() => tela.querySelector<HTMLButtonElement>(".sc-posts__mais")?.click());
    await esperar();
    expect(maisLojas).toHaveBeenCalledWith({ tipo: "FOOD_SNACK" }, 2);
    expect([...tela.querySelectorAll(".sc-post--loja")].map((p) => p.getAttribute("data-loja"))).toEqual([
      "pastelaria-da-vila",
      "moda",
    ]);
    expect(tela.querySelector(".sc-posts__aviso")?.textContent).toContain("todas as 2 lojas");
  });

  it("favoritas/recentes chegam inteiras: não pede mais", () => {
    const maisLojas = vi.fn();
    const tela = montar(
      <FeedDeLojas
        inicial={[LOJA]}
        total={1}
        parametros={{}}
        paginada={false}
        logado
        voltarPara="/explorar/lojas?lista=favoritas"
        acoes={acoesFalsas({ maisLojas })}
      />,
    );
    expect(tela.querySelector(".sc-posts__mais")).toBeNull();
    expect(maisLojas).not.toHaveBeenCalled();
  });
});

describe("postsDoCatalogo (vitrine = perfil com posts)", () => {
  it("cada produto à venda uma vez, no formato do post", () => {
    const loja = { apelido: "pv", nome: "PV", ramo: "FOOD_SNACK", logo: "/l.webp", formasDeEntrega: ["PICKUP"] };
    const produto = { id: "a", nome: "Pastel", chamada: "Crocante", precoCentavos: 700, precoAnteriorCentavos: null, imagem: "/a.webp", disponivel: true };
    const posts = postsDoCatalogo(
      [
        { nome: "Destaques", produtos: [produto] },
        { nome: "Pastéis", produtos: [produto, { ...produto, id: "b", disponivel: false }] },
      ],
      loja,
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: "a", descricao: "Crocante", categoria: "Destaques", loja: { apelido: "pv", logo: "/l.webp" } });
  });
});
