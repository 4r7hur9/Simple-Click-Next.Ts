// @vitest-environment jsdom
/**
 * O rodapé do cliente (card #105, Q-10506): enxuto, com links que levam a
 * páginas que existem e sem prometer o que o produto não tem.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desmontar, exigir, montar } from "./apoio-config.tsx";

const rota = vi.hoisted(() => ({ caminho: "/explorar/produtos" }));
vi.mock("next/navigation", () => ({
  usePathname: () => rota.caminho,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { RodapeLegal } from "../src/features/legal/RodapeLegal.tsx";
import { ROTAS_LEGAIS } from "../src/features/legal/contato.ts";
import { BarraInferiorDoCliente } from "../src/features/usuario/BarraInferiorDoCliente.tsx";
import { MenuDaConta } from "../src/features/usuario/MenuDaConta.tsx";
import { TopoDoCliente } from "../src/features/usuario/TopoDoCliente.tsx";
import type { UsuarioDaBarra } from "../src/lib/quem-esta-logado.ts";

afterEach(() => {
  desmontar();
  rota.caminho = "/explorar/produtos";
});

/** As rotas que existem: um `page.tsx` por pasta, sem os grupos `(x)`. */
function rotasDoAplicativo(): RegExp[] {
  const raiz = join(__dirname, "../src/app");
  const padroes: RegExp[] = [];
  function andar(pasta: string, partes: string[]) {
    for (const nome of readdirSync(pasta)) {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) {
        const segmento =
          nome.startsWith("(") && nome.endsWith(")")
            ? []
            : nome.startsWith("_")
              ? null
              : [nome];
        if (segmento !== null) andar(caminho, [...partes, ...segmento]);
      } else if (nome === "page.tsx") {
        const texto =
          "/" +
          partes
            .map((p) =>
              p.startsWith("[")
                ? "[^/]+"
                : p.replace(/[.*+?^${}()|\\]/g, "\\$&"),
            )
            .join("/");
        padroes.push(new RegExp(`^${texto.replace(/\/$/, "")}/?$`));
      }
    }
  }
  andar(raiz, []);
  return padroes;
}

const ROTAS = rotasDoAplicativo();
const existe = (href: string) => {
  const caminho = new URL(href, "https://x.test").pathname;
  return ROTAS.some((padrao) => padrao.test(caminho));
};

const cliente: UsuarioDaBarra = {
  papel: "cliente",
  nome: "Ana Ribeiro",
  primeiroNome: "Ana",
  iniciais: "AR",
  email: "ana@exemplo.test",
  loja: null,
  temOutrasLojas: false,
};

const PROIBIDOS = [
  /cupom|cupons/i,
  /carteira/i,
  /fidelidade/i,
  /central de ajuda/i,
  /entrega flash/i,
  /suporte 24/i,
  /cnpj/i,
  /raz[ãa]o social/i,
  /universokar/i,
  /garantia de \d/i,
];

describe("links do rodapé", () => {
  it("[CA-31] @spec:AC-10522 o conferidor de rotas reconhece as páginas do aplicativo (sanidade)", () => {
    expect(existe("/explorar/produtos")).toBe(true);
    expect(existe("/loja/padaria/cardapio")).toBe(true);
    expect(existe("/conta/pedidos/abc")).toBe(true);
    expect(existe("/termos")).toBe(false);
    expect(existe("/privacidade")).toBe(false);
    expect(existe("/central-de-ajuda")).toBe(false);
  });

  it("[CA-31] @spec:AC-10522 cada link do rodapé casa com um page.tsx do aplicativo", () => {
    const tela = montar(<RodapeLegal />);
    const links = [...tela.querySelectorAll("a")].map(
      (a) => a.getAttribute("href") ?? "",
    );
    expect(links.length).toBeGreaterThanOrEqual(ROTAS_LEGAIS.length);
    for (const href of links) {
      expect(href.startsWith("/"), href).toBe(true);
      expect(existe(href), `${href} não tem página`).toBe(true);
    }
  });

  it("[CA-31] @spec:AC-10522 o rodapé liga termos, privacidade, cookies e LGPD e reabre as preferências de cookies", () => {
    const tela = montar(<RodapeLegal />);
    // Card #128: o rodapé ganhou as colunas do Stitch; os links legais moram
    // na navegação "Informações legais", na linha de baixo.
    const legal = exigir(tela, 'nav[aria-label="Informações legais"]');
    const links = [...legal.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toEqual([
      "/termos-de-uso",
      "/politica-de-privacidade",
      "/cookies",
      "/lgpd",
    ]);
    expect(legal.textContent).toContain("Preferências de cookies");
    expect(tela.textContent).toContain("© SimpleClick");
  });

  it("[CA-31] @spec:AC-10522 todo link do topo, da barra e do menu da conta também leva a uma página que existe", () => {
    const sair = vi.fn(async () => undefined);
    // Uma raiz por vez: `montar` guarda só a última, e uma raiz esquecida
    // ficaria agendando trabalho do React depois de o jsdom ser desmontado
    // (erro "window is not defined" sob a carga do CI).
    const hrefs = new Set<string>();
    for (const elemento of [
      <TopoDoCliente key="topo" usuario={cliente} sair={sair} />,
      <BarraInferiorDoCliente key="barra" usuario={cliente} />,
      <MenuDaConta key="menu" usuario={cliente} sair={sair} />,
    ]) {
      const tela = montar(elemento);
      for (const a of tela.querySelectorAll("a")) {
        hrefs.add(a.getAttribute("href") ?? "");
      }
      desmontar();
    }
    for (const href of hrefs) {
      const semAncora = href.split("#")[0] ?? href;
      expect(existe(semAncora), `${href} não tem página`).toBe(true);
    }
    expect(hrefs.size).toBeGreaterThan(5);
  });
});

describe("o que o rodapé não promete", () => {
  it("[CA-32] @spec:AC-10523 o rodapé não tem cupom, carteira, fidelidade, ajuda inexistente, Entrega Flash, Suporte 24h, CNPJ nem razão social", () => {
    const tela = montar(<RodapeLegal />);
    for (const proibido of PROIBIDOS) {
      expect(tela.textContent ?? "").not.toMatch(proibido);
      expect(tela.innerHTML).not.toMatch(proibido);
    }
  });

  it("[CA-32] @spec:AC-10523 o topo, a barra e o menu também não usam dado ilustrativo do Stitch", () => {
    const sair = vi.fn(async () => undefined);
    for (const elemento of [
      <TopoDoCliente key="topo" usuario={cliente} sair={sair} />,
      <BarraInferiorDoCliente key="barra" usuario={cliente} />,
    ]) {
      const tela = montar(elemento);
      for (const proibido of PROIBIDOS) {
        expect(tela.textContent ?? "").not.toMatch(proibido);
      }
      expect(tela.textContent).not.toMatch(/entregar em/i);
      desmontar();
    }
  });

  it("[CA-32] @spec:AC-10523 o rodapé segue o tema da página (sem tema escuro forçado)", () => {
    const tela = montar(<RodapeLegal />);
    expect(exigir(tela, "footer").hasAttribute("data-tema")).toBe(false);
  });
});

describe("onde o rodapé some", () => {
  it("[CA-31] @spec:AC-10524 não aparece na TV da loja", () => {
    rota.caminho = "/loja/padaria/tv";
    expect(montar(<RodapeLegal />).querySelector("footer")).toBeNull();
  });

  it("[CA-31] @spec:AC-10524 aparece na loja, no explorar e na conta", () => {
    for (const caminho of ["/loja/padaria", "/explorar/lojas", "/conta"]) {
      rota.caminho = caminho;
      const tela = montar(<RodapeLegal />);
      expect(tela.querySelector("footer"), caminho).not.toBeNull();
      desmontar();
    }
  });
});
