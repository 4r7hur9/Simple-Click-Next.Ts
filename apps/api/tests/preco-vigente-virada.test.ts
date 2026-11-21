/**
 * Virada de preço (Estruturação 6, "Entrega progressiva" e "IA como assistente").
 *
 * Lacuna de cobertura apontada pela IA em `precoQueVale` / `precoValeAgora`
 * (packages/core/src/preco-vigente.ts) e validada à mão — ver o registro em
 * docs/estruturacao/06-operacao.md, seção 6. Os valores esperados foram
 * calculados a mão, com o relógio em UTC, antes de rodar:
 *
 *  - o INÍCIO da janela é inclusivo (o fim já era provado como exclusivo);
 *  - na virada, com o preço antigo terminando e o novo começando no MESMO
 *    instante T, vale o antigo até T-1 ms e SÓ o novo a partir de T: nem
 *    buraco (preço nulo), nem sobreposição;
 *  - se o preço antigo NÃO for encerrado, o MENOR vence — então um aumento
 *    cadastrado sem encerrar o antigo não tem efeito (é o motivo do passo
 *    "encerrar o preço antigo" do procedimento de mudança de preço).
 *
 * Dados sintéticos; função pura, sem banco.
 */
import { describe, expect, it } from "vitest";

import {
  precoQueVale,
  precoValeAgora,
  type PrecoCadastrado,
} from "@simpleclick/core";

const VIRADA = new Date("2026-12-01T03:00:00.000Z"); // meia-noite em Brasília
const UM_MS_ANTES = new Date(VIRADA.getTime() - 1);

function base(sobrescrita: Partial<PrecoCadastrado>): PrecoCadastrado {
  return {
    tipo: "BASE",
    valorEmCentavos: 2000,
    quantidadeMinima: 1,
    ativo: true,
    comecaEm: null,
    terminaEm: null,
    ...sobrescrita,
  };
}

describe("virada de preço (janela comecaEm/terminaEm)", () => {
  it("o início da janela é INCLUSIVO: no instante exato, o preço novo já vale", () => {
    expect(precoValeAgora(base({ comecaEm: VIRADA }), VIRADA)).toBe(true);
    expect(precoValeAgora(base({ comecaEm: VIRADA }), UM_MS_ANTES)).toBe(false);
  });

  it("preço antigo termina em T e o novo começa em T: sem buraco e sem sobreposição", () => {
    const antigo = base({ valorEmCentavos: 2000, terminaEm: VIRADA });
    const novo = base({ valorEmCentavos: 2500, comecaEm: VIRADA });

    expect(precoQueVale([antigo, novo], UM_MS_ANTES).atualEmCentavos).toBe(
      2000,
    );
    expect(precoQueVale([antigo, novo], VIRADA).atualEmCentavos).toBe(2500);
  });

  it("aumento SEM encerrar o preço antigo não tem efeito: o menor vence", () => {
    const antigo = base({ valorEmCentavos: 2000 });
    const novo = base({ valorEmCentavos: 2500, comecaEm: VIRADA });

    expect(precoQueVale([antigo, novo], VIRADA).atualEmCentavos).toBe(2000);
  });

  it("voltar atrás: desativar o preço novo devolve o antigo, sem preço nulo", () => {
    const antigo = base({ valorEmCentavos: 2000 });
    const novo = base({
      valorEmCentavos: 2500,
      comecaEm: VIRADA,
      ativo: false,
    });

    expect(precoQueVale([antigo, novo], VIRADA).atualEmCentavos).toBe(2000);
  });
});
