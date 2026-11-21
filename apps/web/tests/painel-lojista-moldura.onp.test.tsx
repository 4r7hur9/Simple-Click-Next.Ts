// @vitest-environment jsdom
/**
 * Moldura e menu do painel na linguagem nova (card #112, T-11201): o visual
 * muda, quem vê o quê não. A tabela papel → itens é fixa e escrita aqui; não
 * se confere o menu contra a função que o monta.
 */
import { MATRIZ_DE_PERMISSOES } from "@simpleclick/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rota = vi.hoisted(() => ({ caminho: "/painel" }));
vi.mock("next/navigation", () => ({ usePathname: () => rota.caminho }));

import { MenuDaAdministracao } from "../src/features/painel/MenuDaAdministracao.tsx";
import { MenuDoPainel } from "../src/features/painel/MenuDoPainel.tsx";
import { permissaoDoCaminho } from "../src/lib/permissoes.ts";
import { desmontar, montar, simularApi } from "./apoio-config.tsx";

const SO_DO_DONO = [
  "/painel/aparencia",
  "/painel/feed",
  "/painel/equipe",
  "/painel/config/contato",
  "/painel/config/entrega",
  "/painel/config/horarios",
  "/painel/config/pagamento",
  "/painel/config/impressao",
];

function menu(papel: "OWNER" | "STAFF"): HTMLElement {
  return montar(
    <MenuDoPainel
      nomeDaLoja="Pastelaria da Vila"
      apelidoDaLoja="pastelaria-da-vila"
      papel={papel}
      permissoes={[...MATRIZ_DE_PERMISSOES[papel]]}
      temOutrasLojas={false}
      sair={async () => undefined}
    />,
  );
}

function links(tela: HTMLElement): string[] {
  const nav = tela.querySelector('nav[aria-label="Navegação do painel"]');
  return [...(nav?.querySelectorAll("a") ?? [])].map(
    (a) => a.getAttribute("href") ?? "",
  );
}

let chamadas: string[] = [];

beforeEach(() => {
  rota.caminho = "/painel";
  chamadas = [];
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
    chamadas.push(chamada.url);
    return { status: 200, corpo: { funcionalidades: [], pedidos: [] } };
  });
});
afterEach(desmontar);

describe("painel · moldura e menu", () => {
  it("[CA-1] @spec:AC-11201 a equipe não vê Configurações, Equipe, Feed nem Aparência", () => {
    const tela = menu("STAFF");
    const achados = links(tela);
    for (const proibido of SO_DO_DONO) expect(achados).not.toContain(proibido);
    expect(achados).toContain("/painel/pedidos");
    expect(achados).toContain("/painel/produtos");
  });

  it("[CA-2] @spec:AC-11202 o dono vê todos os itens da tabela", () => {
    const achados = links(menu("OWNER"));
    for (const esperado of [...SO_DO_DONO, "/painel", "/painel/pedidos"]) {
      expect(achados).toContain(esperado);
    }
  });

  it("[CA-3] @spec:AC-11207 cada item aponta para a mesma permissão da área", () => {
    const equipe = links(menu("STAFF"));
    for (const href of equipe.filter((h) => h.startsWith("/painel"))) {
      const caminho = href.split("?")[0] ?? href;
      const exigida = permissaoDoCaminho(caminho);
      if (exigida !== null) {
        expect(MATRIZ_DE_PERMISSOES.STAFF).toContain(exigida);
      }
    }
  });

  it("[CA-4] @spec:AC-11250 o menu leva a marca do tutorial e o tema escuro", () => {
    const tela = menu("OWNER");
    const lateral = tela.querySelector("aside");
    expect(lateral?.getAttribute("data-tutorial")).toBe("menu-do-painel");
    expect(lateral?.getAttribute("data-tema")).toBe("escuro");
  });

  it("[CA-5] @spec:AC-11208 sem permissão não há leitura de contador", () => {
    montar(
      <MenuDoPainel
        nomeDaLoja="Loja"
        apelidoDaLoja="loja"
        papel="STAFF"
        permissoes={[]}
        temOutrasLojas={false}
        sair={async () => undefined}
      />,
    );
    expect(chamadas.some((u) => u.includes("/api/painel/pedidos"))).toBe(false);
    expect(chamadas.some((u) => u.includes("comentarios"))).toBe(false);
  });

  it("[CA-6] @spec:AC-11211 a administração tem os sete itens planos do #170", () => {
    const tela = montar(<MenuDaAdministracao pendentes={3} />);
    const achados = [...tela.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    for (const href of [
      "/admin",
      "/admin/aprovacoes",
      "/admin/lojas",
      "/admin/contas",
      "/admin/donos-e-equipes",
      "/admin/auditoria",
      "/admin/configuracoes",
    ]) {
      expect(achados).toContain(href);
    }
    expect(tela.querySelector("aside")?.hasAttribute("data-tutorial")).toBe(
      false,
    );
  });
});
