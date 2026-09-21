import { describe, expect, it } from "vitest";

import {
  acrescentarOpcaoDaLista,
  congelarEspecificacaoNoPedido,
  criarEspecificacao,
  estimarImpactoDaRemocao,
  herdarEspecificacoesDaCategoria,
  removerEspecificacao,
  renomearEspecificacao,
  validarPreenchimentoDoProduto,
  validarValorDaEspecificacao,
} from "./especificacoes.usecase.ts";

const agora = new Date("2026-09-21T12:00:00.000Z");

function especificacao(
  entrada: Partial<Parameters<typeof criarEspecificacao>[0]> = {},
  id = "esp-aro",
) {
  return criarEspecificacao(
    {
      categoriaId: "categoria-pneus",
      nome: "Aro",
      tipo: "lista",
      unidade: "pol",
      obrigatoria: true,
      filtravel: true,
      opcoes: ["13", "14", "15", "16"],
      ordem: 0,
      ...entrada,
    },
    { id, agora },
  );
}

describe("criador de especificações dentro da categoria", () => {
  it("@spec:AC-325 cria registro tipado ligado à categoria", () => {
    const criada = especificacao();

    expect(criada).toMatchObject({
      id: "esp-aro",
      categoriaId: "categoria-pneus",
      nome: "Aro",
      tipo: "lista",
      unidade: "pol",
      obrigatoria: true,
      filtravel: true,
      opcoes: ["13", "14", "15", "16"],
      versao: 1,
      removidaEm: null,
    });
  });

  it("@spec:AC-326 herda as especificações na ordem e bloqueia obrigatória vazia", () => {
    const aro = especificacao({ ordem: 1 });
    const largura = especificacao(
      {
        nome: "Largura",
        tipo: "numero",
        unidade: "mm",
        opcoes: [],
        ordem: 0,
      },
      "esp-largura",
    );
    const indice = especificacao(
      {
        nome: "Índice de carga",
        tipo: "numero",
        unidade: null,
        opcoes: [],
        ordem: 2,
        obrigatoria: false,
      },
      "esp-indice",
    );

    const herdadas = herdarEspecificacoesDaCategoria(
      [aro, indice, largura],
      "categoria-pneus",
    );
    expect(herdadas.map(({ especificacao: item }) => item.nome)).toEqual([
      "Largura",
      "Aro",
      "Índice de carga",
    ]);

    const preenchimento = validarPreenchimentoDoProduto(
      herdadas.map(({ especificacao: item }) => item),
      { "esp-largura": 195 },
    );
    expect(preenchimento.valido).toBe(false);
    expect(preenchimento.erros).toEqual([
      expect.objectContaining({ especificacaoId: "esp-aro" }),
    ]);
  });

  it("@spec:AC-327 recusa valor inexistente e permite acrescentar à lista", () => {
    const aro = especificacao();

    expect(() => validarValorDaEspecificacao(aro, "17")).toThrow(
      /13, 14, 15, 16/,
    );
    const atualizada = acrescentarOpcaoDaLista(aro, "17");
    expect(atualizada.opcoes).toEqual(["13", "14", "15", "16", "17"]);
    expect(validarValorDaEspecificacao(atualizada, "17")).toBe("17");
  });

  it("@spec:AC-330 renomeia e remove sem perder histórico nem congelamento do pedido", () => {
    const aro = especificacao();
    const pedidoAntigo = congelarEspecificacaoNoPedido(aro, "15");
    const renomeada = renomearEspecificacao(aro, "Diâmetro do aro", agora);
    const impacto = estimarImpactoDaRemocao(renomeada.especificacao, 20);

    expect(impacto.aviso).toContain("20 produto(s)");
    const removida = removerEspecificacao(
      renomeada.especificacao,
      impacto,
      agora,
    );

    expect(renomeada.versaoAnterior).toMatchObject({
      nome: "Aro",
      evento: "RENOMEADA",
      versao: 1,
    });
    expect(removida.versaoAnterior).toMatchObject({
      nome: "Diâmetro do aro",
      evento: "REMOVIDA",
      versao: 2,
    });
    expect(removida.especificacao.removidaEm).toBe(agora.toISOString());
    expect(pedidoAntigo).toMatchObject({ nome: "Aro", valor: "15" });
  });
});
