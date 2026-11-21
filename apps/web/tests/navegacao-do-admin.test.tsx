// @vitest-environment jsdom
/**
 * A navegação do administrador (card #169, T-7): sem os itens de cliente. Topo
 * sem abas nem busca, barra inferior ausente, menu sem Explorar e "Minha
 * conta" abrindo o modal. Dono, equipe e cliente mantêm o que já tinham.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { desmontar, montar } from "./apoio-config.tsx";

const rota = vi.hoisted(() => ({ caminho: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => rota.caminho,
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { BarraInferiorDoCliente } from "../src/features/usuario/BarraInferiorDoCliente.tsx";
import {
  abasDoTopo,
  itensPrincipais,
} from "../src/features/usuario/regras-da-navegacao.ts";
import { TopoDoCliente } from "../src/features/usuario/TopoDoCliente.tsx";
import { UsuarioNoMenu } from "../src/features/usuario/UsuarioNoMenu.tsx";
import {
  itensDoUsuario,
  type UsuarioDaBarra,
} from "../src/lib/quem-esta-logado.ts";

const base = {
  nome: "Arthur Bruno",
  primeiroNome: "Arthur",
  iniciais: "AB",
  email: "arthur@exemplo.test",
  loja: null,
  temOutrasLojas: false,
} as const;
const admin: UsuarioDaBarra = { ...base, papel: "admin" };
const dono: UsuarioDaBarra = { ...base, papel: "dono" };
const equipe: UsuarioDaBarra = { ...base, papel: "equipe" };
const cliente: UsuarioDaBarra = { ...base, papel: "cliente" };
const sair = vi.fn(async (_caminho: string) => undefined);

afterEach(() => desmontar());

describe("regras por papel", () => {
  it("[CA-18] admin: itens principais e abas do topo vazios", () => {
    const contexto = { usuario: admin, caminho: "/admin" };
    expect(itensPrincipais(contexto)).toEqual([]);
    expect(abasDoTopo(contexto)).toEqual([]);
  });

  it("[CA-18] dono, equipe e cliente mantêm as abas e a barra de sempre", () => {
    for (const usuario of [dono, equipe, cliente]) {
      const contexto = { usuario, caminho: "/explorar/produtos" };
      expect(abasDoTopo(contexto).map((a) => a.rotulo)).toEqual([
        "Explorar",
        "Lojas",
        "Produtos",
        "Favoritos",
        "Pedidos",
      ]);
      expect(itensPrincipais(contexto)).toHaveLength(5);
    }
  });

  it("[CA-18] itens do avatar do admin: Administração, Auditoria e Minha conta, sem Explorar", () => {
    const itens = itensDoUsuario(admin, "/admin");
    expect(itens.map((i) => i.rotulo)).toEqual([
      "Administração",
      "Auditoria",
      "Minha conta",
    ]);
    expect(itens[0]?.href).toBe("/admin");
    expect(itens.find((i) => i.id === "conta")?.abreConta).toBe("dados");
  });
});

describe("telas do admin", () => {
  it("[CA-18] topo sem abas nem busca, com a marca levando a /admin", () => {
    const tela = montar(<TopoDoCliente usuario={admin} sair={sair} />);
    expect(tela.querySelector(".sc-topo-cliente__abas")).toBeNull();
    expect(tela.querySelector('[role="search"]')).toBeNull();
    expect(tela.querySelector('[data-navegacao="buscar"]')).toBeNull();
    expect(
      tela.querySelector(".sc-topo-cliente__marca")?.getAttribute("href"),
    ).toBe("/admin");
  });

  it("[CA-18] topo do dono continua com a busca e as abas", () => {
    rota.caminho = "/explorar/produtos";
    const tela = montar(<TopoDoCliente usuario={dono} sair={sair} />);
    expect(tela.querySelector('[role="search"]')).not.toBeNull();
    expect(tela.querySelectorAll(".sc-topo-cliente__aba")).toHaveLength(5);
    rota.caminho = "/admin";
  });

  it("[CA-18] a barra inferior não renderiza para o admin", () => {
    const tela = montar(<BarraInferiorDoCliente usuario={admin} />);
    expect(tela.querySelector("nav")).toBeNull();
    expect(tela.querySelector(".sc-barra-cliente")).toBeNull();
  });

  it("[CA-18] pé do menu lateral: sem Explorar e com Minha conta abrindo o modal", () => {
    const tela = montar(<UsuarioNoMenu usuario={admin} sair={sair} />);
    expect(tela.textContent).not.toContain("Explorar");
    const conta = tela.querySelector<HTMLAnchorElement>("a[data-abre-conta]");
    expect(conta?.textContent).toContain("Minha conta");
    expect(conta?.getAttribute("data-abre-conta")).toBe("dados");
  });

  it("[CA-18] pé do menu do dono mantém o Explorar", () => {
    const tela = montar(<UsuarioNoMenu usuario={dono} sair={sair} />);
    expect(tela.textContent).toContain("Explorar");
  });
});
