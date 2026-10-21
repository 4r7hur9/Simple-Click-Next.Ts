/**
 * Prova do helper de permissões do site: as permissões efetivas vêm de
 * `GET /v1/eu` (ou da matriz, se a lista faltar), e cada área do painel exige
 * a mesma permissão que a API exige na rota dela.
 */
import { MATRIZ_DE_PERMISSOES } from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import {
  permissaoDoCaminho,
  permissoesDaLoja,
  pode,
  rotuloDoPapel,
} from "../src/lib/permissoes.ts";

describe("as permissões da loja", () => {
  it("usa a lista que a API mandou", () => {
    const permissoes = permissoesDaLoja({
      papel: "STAFF",
      permissoes: ["clientes"],
    });
    expect(pode(permissoes, "clientes")).toBe(true);
    expect(pode(permissoes, "catalogo.produtos")).toBe(false);
  });

  it("sem a lista, cai na matriz do papel: dono pode tudo, equipe só a operação", () => {
    const dono = permissoesDaLoja({ papel: "OWNER" });
    const equipe = permissoesDaLoja({ papel: "STAFF" });
    expect([...dono].sort()).toEqual([...MATRIZ_DE_PERMISSOES.OWNER].sort());
    expect([...equipe].sort()).toEqual([...MATRIZ_DE_PERMISSOES.STAFF].sort());
    for (const so_do_dono of [
      "configuracoes",
      "equipe",
      "feed",
      "personalizacao",
    ] as const) {
      expect(pode(equipe, so_do_dono)).toBe(false);
      expect(pode(dono, so_do_dono)).toBe(true);
    }
  });

  it("papel desconhecido não pode nada, e área livre é de todos", () => {
    const ninguem = permissoesDaLoja({ papel: "QUALQUER" });
    expect(ninguem.size).toBe(0);
    expect(pode(ninguem, null)).toBe(true);
    expect(pode(ninguem, "loja.ver")).toBe(false);
  });

  it("escreve o papel para a tela", () => {
    expect(rotuloDoPapel("OWNER")).toBe("Dono");
    expect(rotuloDoPapel("STAFF")).toBe("Equipe");
  });
});

describe("a permissão que cada endereço do painel exige", () => {
  it.each([
    ["/painel", "metricas"],
    ["/painel/metricas", "metricas"],
    ["/painel/pedidos", "pedidos.operar"],
    ["/painel/pedidos/42", "pedidos.operar"],
    ["/painel/pedidos/novo", "pedidos.manual"],
    ["/painel/clientes/7", "clientes"],
    ["/painel/produtos/novo", "catalogo.produtos"],
    ["/painel/categorias/3/especificacoes", "catalogo.categorias"],
    ["/painel/estoque", "catalogo.produtos"],
    ["/painel/variacoes", "catalogo.produtos"],
    ["/painel/opcoes", "catalogo.produtos"],
    ["/painel/aparencia", "personalizacao"],
    ["/painel/feed", "feed"],
    ["/painel/equipe", "equipe"],
    ["/painel/config/pagamento", "configuracoes"],
    ["/painel/config/impressao", "configuracoes"],
  ] as const)("%s exige %s", (caminho, esperada) => {
    expect(permissaoDoCaminho(caminho)).toBe(esperada);
  });

  it("a ajuda e endereços desconhecidos são livres", () => {
    expect(permissaoDoCaminho("/painel/ajuda")).toBeNull();
    expect(permissaoDoCaminho("/painel/sei-la")).toBeNull();
    expect(permissaoDoCaminho("/painel/pedidosx")).toBeNull();
  });

  it("a equipe pode tudo o que o menu dela mostra e nada das áreas do dono", () => {
    const equipe = permissoesDaLoja({ papel: "STAFF" });
    const podeAbrir = (caminho: string) =>
      pode(equipe, permissaoDoCaminho(caminho));
    for (const caminho of [
      "/painel",
      "/painel/pedidos",
      "/painel/pedidos/novo",
      "/painel/clientes",
      "/painel/produtos",
      "/painel/categorias",
      "/painel/estoque",
      "/painel/variacoes",
      "/painel/opcoes",
      "/painel/ajuda",
    ]) {
      expect(podeAbrir(caminho), caminho).toBe(true);
    }
    for (const caminho of [
      "/painel/equipe",
      "/painel/feed",
      "/painel/aparencia",
      "/painel/config/pagamento",
      "/painel/config/entrega",
      "/painel/config/horarios",
      "/painel/config/contato",
      "/painel/config/impressao",
    ]) {
      expect(podeAbrir(caminho), caminho).toBe(false);
    }
  });
});
