// @vitest-environment jsdom
/**
 * O modo visual da administração (card #170, T-12, CA-14 e D-13).
 *
 * /admin mostra o selo "Administração SimpleClick" na sidebar, na barra do
 * celular e no cabeçalho, a faixa da moldura e o fundo distinto da sidebar
 * (classes do design system). O painel do dono e o explorar não mostram nada
 * disso. As capturas em 1440 e 390, claro e escuro, são da T-13.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rota = vi.hoisted(() => ({ caminho: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => rota.caminho }));
vi.mock("../src/server/acesso-da-administracao.ts", () => ({
  exigirAdministracaoDaPlataforma: vi.fn(async () => undefined),
}));
vi.mock("../src/server/pendentes-da-administracao.ts", () => ({
  lojasPendentesDeAprovacao: vi.fn(async () => 2),
}));
vi.mock("../src/app/_usuario/sessao.tsx", () => ({
  UsuarioDoMenuDaSessao: () => null,
  ModalDaContaDaSessao: () => null,
}));

import { IconeInicio } from "@simpleclick/ui";

import LayoutDaAdministracao from "../src/app/(admin)/admin/layout.tsx";
import { MenuDaAdministracao } from "../src/features/painel/MenuDaAdministracao.tsx";
import { MenuLateral } from "../src/features/painel/MenuLateral.tsx";
import { desmontar, montar } from "./apoio-config.tsx";

const SELO = "Administração SimpleClick";

beforeEach(() => {
  rota.caminho = "/admin";
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

function quantasVezes(texto: string, trecho: string): number {
  return texto.split(trecho).length - 1;
}

describe("o modo administração", () => {
  it("[CA-14] o layout do /admin traz a moldura com faixa, o cabeçalho e o selo", async () => {
    const html = renderToStaticMarkup(
      await LayoutDaAdministracao({ children: <p>conteúdo</p> }),
    );
    expect(html).toContain("sc-moldura-admin");
    expect(html).toContain("sc-cabecalho-admin");
    expect(html).toContain("sc-menu--administracao");
    // Selo no cabeçalho, na sidebar e na barra do celular.
    expect(quantasVezes(html, SELO)).toBe(3);
    expect(html).toContain("conteúdo");
  });

  it("[CA-14] a sidebar do admin leva o fundo próprio e o selo; o menu do painel não", () => {
    const admin = montar(<MenuDaAdministracao pendentes={2} />);
    expect(admin.querySelector("aside.sc-menu--administracao")).not.toBeNull();
    expect(admin.querySelector("aside")?.textContent).toContain(SELO);
    expect(admin.querySelector("header")?.textContent).toContain(SELO);
    expect(
      admin.querySelector("nav[aria-label='Atalhos']")?.className,
    ).toContain("sc-menu--administracao");
    desmontar();

    const painel = montar(
      <MenuLateral
        rotulo="Navegação do painel"
        marca={<a href="/painel">simpleclick</a>}
        itens={[{ rotulo: "Início", href: "/painel", icone: IconeInicio }]}
      />,
    );
    expect(painel.querySelector(".sc-menu--administracao")).toBeNull();
    expect(painel.querySelector(".sc-selo-admin")).toBeNull();
    expect(painel.textContent).not.toContain(SELO);
  });

  it("[CA-14] só o layout do admin e o menu lateral usam o selo e a moldura", () => {
    const raiz = join(__dirname, "../src");
    const permitidos = [
      "app/(admin)/admin/layout.tsx",
      "features/painel/MenuLateral.tsx",
    ];
    for (const arquivo of [
      "app/(painel)/painel/layout.tsx",
      "app/(explorar)/explorar/layout.tsx",
    ]) {
      expect(permitidos).not.toContain(arquivo);
      const codigo = readFileSync(join(raiz, arquivo), "utf8");
      expect(codigo).not.toMatch(
        /SeloDaAdministracao|sc-moldura-admin|sc-cabecalho-admin|sc-menu--administracao/,
      );
    }
  });

  it("[CA-22] a faixa do /admin leva o título 'Administração da plataforma' e o selo", async () => {
    const html = renderToStaticMarkup(
      await LayoutDaAdministracao({ children: <p>conteúdo</p> }),
    );
    expect(html).toMatch(
      /sc-cabecalho-admin__titulo[^>]*>Administração da plataforma</,
    );
    const faixa = html.slice(html.indexOf('class="sc-cabecalho-admin'));
    expect(faixa.slice(0, faixa.indexOf("</div>"))).toContain(SELO);
  });

  it("[CA-21] o menu do admin segue o tema da página (sem data-tema); o do painel continua escuro", () => {
    const admin = montar(<MenuDaAdministracao pendentes={2} />);
    for (const no of [
      admin.querySelector("header"),
      admin.querySelector("aside"),
      admin.querySelector("nav[aria-label='Atalhos']"),
    ]) {
      expect(no?.hasAttribute("data-tema")).toBe(false);
    }
    desmontar();

    const painel = montar(
      <MenuLateral
        rotulo="Navegação do painel"
        marca={<a href="/painel">simpleclick</a>}
        itens={[{ rotulo: "Início", href: "/painel", icone: IconeInicio }]}
      />,
    );
    expect(painel.querySelector("header")?.getAttribute("data-tema")).toBe(
      "escuro",
    );
    expect(painel.querySelector("aside")?.getAttribute("data-tema")).toBe(
      "escuro",
    );
  });

  it("[CA-20] nenhuma classe fica colada em ${ no MenuLateral (o Tailwind não a extrairia)", () => {
    const codigo = readFileSync(
      join(__dirname, "../src/features/painel/MenuLateral.tsx"),
      "utf8",
    );
    expect(codigo).not.toMatch(/[A-Za-z0-9\])]\$\{classeDoModo\}/);
    expect(codigo).toContain("lg:w-64 ${classeDoModo}");
  });
});
