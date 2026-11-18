// @vitest-environment jsdom
/**
 * Card #106, T-10603/T-10605: segmentos só dos tipos reais, página viva sem
 * a lista de tipos, aviso com "Tentar de novo" e busca no endereço.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: ({
    priority: _p,
    ...props
  }: ComponentProps<"img"> & { readonly priority?: boolean }) => (
    <img {...props} />
  ),
}));

import { ouReserva } from "../src/app/(explorar)/explorar/_dados.ts";
import { enderecoDoFeed, lerConsulta } from "../src/features/feed/consulta.ts";
import { TelaDoFeed } from "../src/features/feed/TelaDoFeed.tsx";

const consulta = lerConsulta("produtos", { busca: "pão" });
const tela = (
  tipos: Parameters<typeof TelaDoFeed>[0]["tipos"],
  conteudo: Parameters<typeof TelaDoFeed>[0]["conteudo"],
) =>
  renderToStaticMarkup(
    <TelaDoFeed
      consulta={consulta}
      tipos={tipos}
      conteudo={conteudo}
      logado={false}
    />,
  );

describe("segmentos e estados do início", () => {
  it("[CA-07] @spec:AC-10607 os chips são 'Tudo' mais os tipos reais, e nada do mockup", () => {
    const html = tela(
      [{ codigo: "FOOD_BAKERY", nome: "Padaria", alimentacao: true }],
      { estado: "produtos", itens: [], total: 0, porPagina: 24 },
    );
    expect(html).toContain("Tudo");
    expect(html).toContain("Padaria");
    expect(html).not.toContain("Autopeças");
  });

  it("[CA-08] @spec:AC-10608 sem a lista de tipos a página continua, com 'Tudo'", () => {
    const html = tela([], {
      estado: "produtos",
      itens: [],
      total: 0,
      porPagina: 24,
    });
    expect(html).toContain("Tudo");
    expect(html).toContain('role="search"');
  });

  it("[CA-06] @spec:AC-10606 a busca fica no endereço", () => {
    expect(enderecoDoFeed(consulta)).toContain("busca=p%C3%A3o");
  });

  it("[CA-26] @spec:AC-10626 com as lojas fora do ar, aparece 'Tentar de novo'", () => {
    const html = tela([], { estado: "indisponivel" });
    expect(html).toContain("O feed não carregou");
    expect(html).toContain("Tentar de novo");
  });

  it("[CA-25] @spec:AC-10625 sem produtos, há um caminho útil", () => {
    const html = tela([], {
      estado: "produtos",
      itens: [],
      total: 0,
      porPagina: 24,
    });
    expect(html).toContain("Nada encontrado com esses filtros");
    expect(html).toContain("Limpar filtros");
  });

  it("[CA-05] @spec:AC-10605 uma leitura que lança vira a reserva, sem derrubar as outras", async () => {
    const ok = await ouReserva(Promise.resolve(1), 0);
    const falhou = await ouReserva(Promise.reject(new Error("fora")), 0);
    expect([ok, falhou]).toEqual([1, 0]);
  });

  it("[CA-24] @spec:AC-10624 sem stories a faixa some inteira", () => {
    const html = tela([], {
      estado: "produtos",
      itens: [],
      total: 0,
      porPagina: 24,
    });
    expect(html).not.toContain("sc-stories");
  });
});
