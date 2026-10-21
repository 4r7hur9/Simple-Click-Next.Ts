// @vitest-environment jsdom
/**
 * Prova do menu do painel por papel (card #31): o dono vê todas as funções,
 * a equipe vê só o que a API deixa; o cabeçalho diz a loja e o papel; "Trocar
 * de loja" só existe com mais de uma loja; a impressão some quando a
 * administração desliga; o selo de pedidos novos fala o número; e "Sair"
 * chama a ação de sair.
 */
import { MATRIZ_DE_PERMISSOES } from "@simpleclick/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rota = vi.hoisted(() => ({ caminho: "/painel" }));
vi.mock("next/navigation", () => ({ usePathname: () => rota.caminho }));

import { MenuDoPainel } from "../src/features/painel/MenuDoPainel.tsx";
import {
  clicar,
  desmontar,
  esperar,
  montar,
  simularApi,
} from "./apoio-config.tsx";

function exigir<T>(achado: T | null, nome: string): T {
  if (achado === null) throw new Error(`não achei ${nome} na tela`);
  return achado;
}

const PESSOA = {
  nome: "Ana Ribeiro",
  email: "ana@exemplo.test",
  iniciais: "AR",
};

const TITULOS_DO_DONO = [
  "Operação",
  "Catálogo",
  "Minha loja",
  "Equipe",
  "Conta",
];

const LINKS_DO_DONO = [
  "/painel",
  "/painel/pedidos",
  "/painel/pedidos/novo",
  "/painel/clientes",
  "/painel/comentarios",
  "/painel/produtos",
  "/painel/categorias",
  "/painel/estoque",
  "/painel/variacoes",
  "/painel/opcoes",
  "/loja/pastelaria-da-vila",
  "/painel/aparencia",
  "/painel/feed",
  "/painel/stories",
  "/painel/config/contato",
  "/painel/config/entrega",
  "/painel/config/horarios",
  "/painel/config/pagamento",
  "/painel/config/impressao",
  "/painel/equipe",
  "/conta",
  "/painel/ajuda",
  "/painel?tutorial=1",
];

function aberto(
  papel: "OWNER" | "STAFF",
  opcoes: {
    temOutrasLojas?: boolean;
    sair?: (caminho: string) => Promise<void>;
  } = {},
): HTMLElement {
  return montar(
    <MenuDoPainel
      nomeDaLoja="Pastelaria da Vila"
      apelidoDaLoja="pastelaria-da-vila"
      papel={papel}
      permissoes={[...MATRIZ_DE_PERMISSOES[papel]]}
      temOutrasLojas={opcoes.temOutrasLojas ?? false}
      pessoa={PESSOA}
      sair={opcoes.sair ?? (async () => undefined)}
    />,
  );
}

function navegacao(tela: HTMLElement): HTMLElement {
  return exigir(
    tela.querySelector<HTMLElement>('nav[aria-label="Navegação do painel"]'),
    "a navegação",
  );
}

function enderecos(tela: HTMLElement): (string | null)[] {
  return [...navegacao(tela).querySelectorAll("a")].map((a) =>
    a.getAttribute("href"),
  );
}

let desligadas: string[] = [];
let novos = 0;
let comentariosPendentes = 0;

beforeEach(() => {
  rota.caminho = "/painel";
  desligadas = [];
  novos = 0;
  comentariosPendentes = 0;
  vi.stubGlobal(
    "matchMedia",
    () =>
      ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
  simularApi((chamada) => {
    if (chamada.url.includes("/api/loja/funcionalidades")) {
      return {
        status: 200,
        corpo: {
          funcionalidades: desligadas.map((chave) => ({
            chave,
            ligada: false,
          })),
        },
      };
    }
    if (chamada.url.includes("/api/painel/pedidos")) {
      return {
        status: 200,
        corpo: {
          pedidos: Array.from({ length: novos }, (_, i) => ({
            id: `p${i}`,
            numero: i + 1,
            status: "PENDING",
            criadoEm: "2026-10-16T12:00:00Z",
            totalCentavos: 1000,
          })),
        },
      };
    }
    if (chamada.url.includes("/api/loja/comentarios/contagem")) {
      return {
        status: 200,
        corpo: {
          pendentes: comentariosPendentes,
          aprovados: 0,
          recusados: 0,
          denunciados: 0,
        },
      };
    }
    return { status: 404 };
  });
});
afterEach(desmontar);

describe("o menu do painel para o dono", () => {
  it("mostra todas as seções e todas as funções de uma vez", async () => {
    const tela = aberto("OWNER");
    await esperar();
    const titulos = [...navegacao(tela).querySelectorAll("h2")].map(
      (t) => t.textContent,
    );
    expect(titulos).toEqual(TITULOS_DO_DONO);
    expect(enderecos(tela)).toEqual(LINKS_DO_DONO);
    expect(navegacao(tela).querySelector("[aria-expanded]")).toBeNull();
  });

  it("o cabeçalho diz a loja e o selo do papel", async () => {
    const tela = aberto("OWNER");
    await esperar();
    expect(tela.textContent).toContain("Pastelaria da Vila");
    expect(tela.textContent).toContain("Dono");
  });

  it("'Ver loja' abre a vitrine em outra aba", async () => {
    const tela = aberto("OWNER");
    await esperar();
    const link = exigir(
      navegacao(tela).querySelector<HTMLAnchorElement>(
        'a[href="/loja/pastelaria-da-vila"]',
      ),
      "o link da vitrine",
    );
    expect(link.target).toBe("_blank");
  });

  it("a página atual fica marcada", async () => {
    rota.caminho = "/painel/config/entrega";
    const tela = aberto("OWNER");
    await esperar();
    const atuais = [
      ...navegacao(tela).querySelectorAll('[aria-current="page"]'),
    ];
    expect(atuais.map((a) => a.getAttribute("href"))).toEqual([
      "/painel/config/entrega",
    ]);
  });

  it("a impressão some quando a administração desliga a funcionalidade", async () => {
    desligadas = ["auto_print"];
    const tela = aberto("OWNER");
    await esperar();
    expect(enderecos(tela)).not.toContain("/painel/config/impressao");
    expect(enderecos(tela)).toContain("/painel/config/pagamento");
  });

  it("'Trocar de loja' só aparece com mais de uma loja, no cabeçalho e na Conta", async () => {
    const tela = aberto("OWNER", { temOutrasLojas: true });
    await esperar();
    expect(enderecos(tela)).toContain("/escolher-loja");
    expect(
      tela.querySelectorAll('a[href="/escolher-loja"]').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("o selo de pedidos novos diz o número", async () => {
    novos = 4;
    const tela = aberto("OWNER");
    await esperar();
    const pedidos = exigir(
      navegacao(tela).querySelector('a[href="/painel/pedidos"]'),
      "o link de pedidos",
    );
    expect(pedidos.textContent).toContain("4 novos");
  });

  it("o selo de comentários diz quantos esperam a moderação (#48)", async () => {
    comentariosPendentes = 3;
    const tela = aberto("OWNER");
    await esperar();
    const comentarios = exigir(
      navegacao(tela).querySelector('a[href="/painel/comentarios"]'),
      "o link de comentários",
    );
    expect(comentarios.textContent).toContain("3 novos");
  });

  it("'Sair' chama a ação de sair com a página atual", async () => {
    rota.caminho = "/painel/clientes";
    const sair = vi.fn(async () => undefined);
    const tela = aberto("OWNER", { sair });
    await esperar();
    const botao = exigir(
      [...navegacao(tela).querySelectorAll("button")].find(
        (b) => b.textContent === "Sair",
      ) ?? null,
      "o botão Sair",
    );
    clicar(botao);
    await esperar();
    expect(sair).toHaveBeenCalledWith("/painel/clientes");
  });

  it("a conta mostra o nome e o e-mail de quem está logado", async () => {
    const tela = aberto("OWNER");
    await esperar();
    expect(navegacao(tela).textContent).toContain("Ana Ribeiro");
    expect(navegacao(tela).textContent).toContain("ana@exemplo.test");
  });

  it("a barra de baixo do celular tem os atalhos e o botão Menu", async () => {
    const tela = aberto("OWNER");
    await esperar();
    const atalhos = exigir(
      tela.querySelector('nav[aria-label="Atalhos"]'),
      "a barra de atalhos",
    );
    expect(
      [...atalhos.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ).toEqual([
      "/painel",
      "/painel/pedidos",
      "/painel/pedidos/novo",
      "/painel/produtos",
    ]);
    expect(atalhos.querySelector("button")?.textContent).toBe("Menu");
  });
});

describe("o menu do painel para a equipe", () => {
  it("vê só o que a API permite: operação, catálogo, ver loja e conta", async () => {
    const tela = aberto("STAFF");
    await esperar();
    const titulos = [...navegacao(tela).querySelectorAll("h2")].map(
      (t) => t.textContent,
    );
    expect(titulos).toEqual(["Operação", "Catálogo", "Minha loja", "Conta"]);
    expect(enderecos(tela)).toEqual([
      "/painel",
      "/painel/pedidos",
      "/painel/pedidos/novo",
      "/painel/clientes",
      "/painel/comentarios",
      "/painel/produtos",
      "/painel/categorias",
      "/painel/estoque",
      "/painel/variacoes",
      "/painel/opcoes",
      "/loja/pastelaria-da-vila",
      "/painel/stories",
      "/conta",
      "/painel/ajuda",
      "/painel?tutorial=1",
    ]);
  });

  it("não mostra equipe, feed, aparência nem configurações", async () => {
    const tela = aberto("STAFF");
    await esperar();
    const enderecosVisiveis = enderecos(tela).join(" ");
    for (const proibido of [
      "/painel/equipe",
      "/painel/feed",
      "/painel/aparencia",
      "/painel/config",
    ]) {
      expect(enderecosVisiveis).not.toContain(proibido);
    }
  });

  it("o selo diz Equipe", async () => {
    const tela = aberto("STAFF");
    await esperar();
    expect(tela.querySelector("aside")?.textContent).toContain("Equipe");
    expect(tela.querySelector("aside")?.textContent).not.toContain("Dono");
  });

  it("continua com Sair", async () => {
    const tela = aberto("STAFF");
    await esperar();
    expect(
      [...navegacao(tela).querySelectorAll("button")].map((b) => b.textContent),
    ).toContain("Sair");
  });
});
