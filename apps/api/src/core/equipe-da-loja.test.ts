/**
 * Card #25 — a tabela de permissões por rota do painel.
 */

import { describe, expect, it } from "vitest";

import { permissaoDaRota } from "./equipe-da-loja.ts";

describe("permissão exigida por rota do painel", () => {
  it("cada área do painel cai na permissão certa, e o desconhecido é só do dono", () => {
    const casos: [string, string][] = [
      ["/catalogo/categorias", "catalogo.categorias"],
      ["/catalogo/categorias/1/especificacoes", "catalogo.categorias"],
      ["/catalogo/produtos/1/imagens", "catalogo.produtos"],
      ["/catalogo/produtos/1/estoque/alerta", "catalogo.produtos"],
      ["/catalogo/visao-geral", "catalogo.produtos"],
      ["/pedidos", "pedidos.operar"],
      ["/pedidos/1/status", "pedidos.operar"],
      ["/pedidos/1/cupom", "pedidos.operar"],
      ["/pedidos/manual", "pedidos.manual"],
      ["/pedidos/1/repetir", "pedidos.manual"],
      ["/impressao/estado", "pedidos.operar"],
      ["/impressao/pareamento", "configuracoes"],
      ["/clientes/1", "clientes"],
      ["/metricas/exportar", "metricas"],
      ["/situacao", "loja.ver"],
      ["/limites", "loja.ver"],
      ["/funcionalidades", "loja.ver"],
      ["/configuracao/contato", "configuracoes"],
      ["/equipe/1/senha", "equipe"],
      ["/feed", "feed"],
      ["/tema", "personalizacao"],
      ["/qualquer-coisa-nova", "configuracoes"],
      ["/", "configuracoes"],
    ];
    for (const [caminho, permissao] of casos) {
      expect([caminho, permissaoDaRota(caminho)]).toEqual([caminho, permissao]);
    }
  });
});
