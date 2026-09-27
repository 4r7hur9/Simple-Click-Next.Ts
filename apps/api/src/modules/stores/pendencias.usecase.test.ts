/**
 * Prova dos avisos de configuração pendente (T-907: AC-902, AC-905, AC-914).
 *
 * A leitura das seções, contra o banco, está provada nas provas de cada seção
 * (`apps/api/tests/config-*.int.test.ts`). Aqui mora a regra: o que conta como
 * pendência, e o que o aviso diz.
 */
import { describe, expect, it } from "vitest";

import {
  pendenciasDaLoja,
  type EstadoDaConfiguracao,
} from "./pendencias.usecase.ts";

const COMPLETA: EstadoDaConfiguracao = {
  pagamento: {
    formas: ["PIX", "CASH"],
    pix: { tipo: "CPF", chave: "52998224725", titular: "Zica" },
  },
  entrega: { aceitaEntrega: true, aceitaRetirada: true },
  contato: { numero: "5511912345678" },
  horario: {
    semana: [{ dia: 2, faixas: [{ abre: "18:00", fecha: "22:00" }] }],
  },
};

const codigos = (estado: EstadoDaConfiguracao) =>
  pendenciasDaLoja(estado).map((pendencia) => pendencia.codigo);

describe("avisos de configuração pendente", () => {
  it("@spec:AC-902 loja configurada não tem aviso nenhum", () => {
    expect(pendenciasDaLoja(COMPLETA)).toEqual([]);
  });

  it("@spec:AC-902 sem nenhuma forma de pagamento, o painel avisa que falta configurar pagamento", () => {
    const [aviso] = pendenciasDaLoja({
      ...COMPLETA,
      pagamento: { formas: [], pix: null },
    });
    expect(aviso?.codigo).toBe("PAGAMENTO");
    expect(aviso?.href).toBe("/painel/config/pagamento");
  });

  it("@spec:AC-902 PIX ligado sem chave não conta como forma de pagamento", () => {
    expect(
      codigos({ ...COMPLETA, pagamento: { formas: ["PIX"], pix: null } }),
    ).toContain("PAGAMENTO");
    expect(
      codigos({ ...COMPLETA, pagamento: { formas: ["CASH"], pix: null } }),
    ).not.toContain("PAGAMENTO");
  });

  it("@spec:AC-905 entrega e retirada desligadas viram aviso de que o cliente não finaliza", () => {
    const aviso = pendenciasDaLoja({
      ...COMPLETA,
      entrega: { aceitaEntrega: false, aceitaRetirada: false },
    }).find((pendencia) => pendencia.codigo === "ENTREGA");
    expect(aviso?.descricao).toMatch(/não consegue finalizar/);
    expect(aviso?.href).toBe("/painel/config/entrega");
    expect(
      codigos({
        ...COMPLETA,
        entrega: { aceitaEntrega: false, aceitaRetirada: true },
      }),
    ).not.toContain("ENTREGA");
  });

  it("@spec:AC-914 sem WhatsApp o aviso diz que o pedido continua sendo registrado", () => {
    const aviso = pendenciasDaLoja({
      ...COMPLETA,
      contato: { numero: "" },
    }).find((pendencia) => pendencia.codigo === "WHATSAPP");
    expect(aviso?.descricao).toMatch(/pedido ainda é registrado/);
    expect(aviso?.href).toBe("/painel/config/contato");
  });

  it("horário vazio, ou só com dias sem faixa, vira aviso com atalho para a grade", () => {
    const aviso = pendenciasDaLoja({
      ...COMPLETA,
      horario: { semana: [{ dia: 1, faixas: [] }] },
    }).find((pendencia) => pendencia.codigo === "HORARIO");
    expect(aviso?.href).toBe("/painel/config/horarios");
  });
});
