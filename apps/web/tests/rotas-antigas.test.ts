import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import configuracao from "../next.config";
import { MANIFESTO_DE_ROTAS, rotaDoArquivo } from "../src/lib/routes";

function paginasDe(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) return paginasDe(caminho);
    return entrada.name === "page.tsx" ? [caminho] : [];
  });
}

const redirecionar = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: redirecionar }));
vi.mock("../src/server/acesso-da-administracao.ts", () => ({
  exigirAdministracaoDaPlataforma: vi.fn(async () => undefined),
}));
vi.mock("../src/features/admin/ListaLojas.tsx", () => ({
  ListaLojas: () => null,
}));

import PaginaDeLojas from "../src/app/(admin)/admin/lojas/page";

describe("as rotas antigas levam às novas", () => {
  it("[CA-12] /admin/lojas?situacao=PENDING_APPROVAL redireciona para /admin/aprovacoes", async () => {
    redirecionar.mockClear();
    await PaginaDeLojas({
      searchParams: Promise.resolve({ situacao: "PENDING_APPROVAL" }),
    });
    expect(redirecionar).toHaveBeenCalledWith("/admin/aprovacoes");

    redirecionar.mockClear();
    await PaginaDeLojas({
      searchParams: Promise.resolve({ situacao: "ACTIVE" }),
    });
    expect(redirecionar).not.toHaveBeenCalled();
  });

  it("redireciona de forma permanente /l, /minha-conta e a aparência fora da config", async () => {
    const regras = await configuracao.redirects?.();

    expect(regras).toEqual([
      {
        source: "/l/:slug/catalogo",
        destination: "/loja/:slug/cardapio",
        permanent: true,
      },
      {
        source: "/l/:slug/:caminho*",
        destination: "/loja/:slug/:caminho*",
        permanent: true,
      },
      {
        source: "/minha-conta/:caminho*",
        destination: "/conta/:caminho*",
        permanent: true,
      },
      {
        source: "/painel/config/aparencia",
        destination: "/painel/aparencia",
        permanent: true,
      },
    ]);
  });

  it("o mapa do site não guarda mais rota com /l/ nem /minha-conta", () => {
    const antigas = MANIFESTO_DE_ROTAS.filter(
      (tela) =>
        tela.rota.startsWith("/l/") ||
        tela.rota.startsWith("/minha-conta") ||
        tela.rota.includes("/catalogo"),
    );

    expect(antigas).toEqual([]);
  });

  it("a loja pública mora em /loja/{slug}", () => {
    const rotas = MANIFESTO_DE_ROTAS.map((tela) => tela.rota);

    expect(rotas).toEqual(
      expect.arrayContaining([
        "/",
        "/explorar/produtos",
        "/explorar/lojas",
        "/loja/{slug}",
        "/loja/{slug}/cardapio",
        "/loja/{slug}/carrinho",
        "/loja/{slug}/checkout",
        "/loja/{slug}/produto/{id}",
        "/loja/{slug}/pedido/{token}",
        "/conta/pedidos",
        "/painel/aparencia",
        "/admin/contas",
      ]),
    );
  });

  it("toda página do código tem linha no mapa de rotas (fora a vitrine de componentes)", () => {
    const declaradas = new Set(MANIFESTO_DE_ROTAS.map((tela) => tela.rota));
    const semLinha = paginasDe(join(__dirname, "../src/app"))
      .map((arquivo) => rotaDoArquivo(arquivo))
      .filter((rota): rota is string => rota !== null)
      .filter((rota) => !rota.startsWith("/ui") && !declaradas.has(rota));

    expect(semLinha).toEqual([]);
  });
});
