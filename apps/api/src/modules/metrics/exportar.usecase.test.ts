/**
 * Prova da montagem do arquivo de exportação (T-808): uma linha por pedido,
 * as colunas prometidas, dinheiro em reais com vírgula, e campo que não vira
 * fórmula na planilha do contador.
 */
import { describe, expect, it } from "vitest";

import type { PedidoParaExportar } from "./consultas.ts";
import {
  campoDoCsv,
  COLUNAS_DA_EXPORTACAO,
  descreverItens,
  linhaDoPedido,
  montarCsv,
  nomeDoArquivo,
  reaisParaPlanilha,
} from "./exportar.usecase.ts";
import { resolverPeriodo } from "./periodo.ts";

function pedido(
  sobrescrita: Partial<PedidoParaExportar> = {},
): PedidoParaExportar {
  return {
    id: "p1",
    numero: 12,
    codigo: "A-0012",
    // 2026-09-27 19:45 em São Paulo.
    colocadoEm: new Date("2026-09-27T22:45:00.000Z"),
    cliente: "Maria Conceição",
    canal: "ONLINE",
    status: "COMPLETED",
    aguardandoConfirmacaoWhatsapp: false,
    totalCentavos: 4_890,
    itens: [
      { nome: "Açaí com granola", quantidade: 2 },
      { nome: "Suco de laranja (500 ml)", quantidade: 1 },
    ],
    ...sobrescrita,
  };
}

describe("uma linha por pedido, com o que a tela mostra (AC-815)", () => {
  it("@spec:AC-815 a linha traz data e hora no fuso da loja, número, cliente, canal, itens, status e valor", () => {
    const linha = linhaDoPedido(pedido(), "America/Sao_Paulo");

    expect(linha).toEqual([
      "2026-09-27",
      "19:45",
      "12",
      "A-0012",
      "Maria Conceição",
      "Site",
      "2× Açaí com granola; 1× Suco de laranja (500 ml)",
      "Concluído",
      "Sim",
      "48,90",
    ]);
    expect(linha).toHaveLength(COLUNAS_DA_EXPORTACAO.length);
  });

  it("@spec:AC-815 o arquivo tem cabeçalho, separador de planilha em português, marca de codificação e uma linha por pedido", () => {
    const csv = montarCsv(
      [
        pedido(),
        pedido({
          numero: 13,
          codigo: "A-0013",
          canal: "MANUAL",
          status: "CANCELLED",
          cliente: null,
          itens: [],
          totalCentavos: 700,
        }),
      ],
      "America/Sao_Paulo",
    );

    expect(csv.startsWith("\uFEFF")).toBe(true);
    const linhas = csv.slice(1).split("\r\n");
    expect(linhas[0]).toBe(COLUNAS_DA_EXPORTACAO.join(";"));
    expect(linhas[1]).toContain("12;A-0012;Maria Conceição;Site;");
    expect(linhas[2]).toContain("13;A-0013;;Balcão;;Cancelado;Não;7,00");
    // Cabeçalho, dois pedidos e a quebra final.
    expect(linhas).toHaveLength(4);
    expect(linhas[3]).toBe("");
  });

  it("dinheiro sai em reais com vírgula, nunca em ponto flutuante (P-005)", () => {
    expect(reaisParaPlanilha(4_890)).toBe("48,90");
    expect(reaisParaPlanilha(5)).toBe("0,05");
    expect(reaisParaPlanilha(123_456_78)).toBe("123456,78");
    expect(reaisParaPlanilha(-250)).toBe("-2,50");
  });

  it("campo com separador, aspa ou quebra de linha vai entre aspas, e fórmula é desarmada", () => {
    expect(campoDoCsv("Maria; a da esquina")).toBe('"Maria; a da esquina"');
    expect(campoDoCsv('João "Jota"')).toBe('"João ""Jota"""');
    expect(campoDoCsv("linha\nquebrada")).toBe('"linha\nquebrada"');
    expect(campoDoCsv("=HYPERLINK(...)")).toBe("'=HYPERLINK(...)");
    expect(campoDoCsv("+5511999")).toBe("'+5511999");
    expect(campoDoCsv("Simples")).toBe("Simples");
  });

  it("os itens vêm com quantidade e nome, e a variação entre parênteses", () => {
    expect(descreverItens(pedido().itens)).toBe(
      "2× Açaí com granola; 1× Suco de laranja (500 ml)",
    );
    expect(descreverItens([])).toBe("");
  });

  it("o nome do arquivo carrega a loja e o período", () => {
    const resultado = resolverPeriodo(
      { atalho: "personalizado", de: "2026-08-01", ate: "2026-08-15" },
      new Date(),
      "America/Sao_Paulo",
    );
    if (!resultado.ok) throw new Error(resultado.explicacao);
    expect(nomeDoArquivo("pastelaria-da-vila", resultado.periodo)).toBe(
      "pedidos-pastelaria-da-vila-2026-08-01-a-2026-08-15.csv",
    );
    expect(nomeDoArquivo("a/b c", resultado.periodo)).toBe(
      "pedidos-a-b-c-2026-08-01-a-2026-08-15.csv",
    );
  });
});
