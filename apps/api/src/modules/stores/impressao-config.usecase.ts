/**
 * Formato de impressão do cupom (T-906: AC-919, AC-920).
 *
 * A largura é a do rolo da impressora térmica, e é ela que o gerador do cupom
 * recebe: o mesmo pedido sai em 58 ou em 80 mm conforme o que está salvo
 * aqui. O essencial — número do pedido, itens e total — não desliga: a
 * normalização o liga de novo, mesmo que a entrada peça o contrário.
 */
import { z } from "zod";

export const CAMPOS_ESSENCIAIS_DO_CUPOM = ["pedido", "itens", "total"] as const;

/** Cada interruptor do cupom, com a mensagem que aparece ao lado dele. */
const interruptor = (rotulo: string) =>
  z.boolean(`${rotulo}: marque ou desmarque.`);

export const esquemaDaConfiguracaoDeImpressao = z.strictObject({
  larguraMm: z.union([z.literal(58), z.literal(80)], {
    error: "Escolha a largura do papel: 58 mm ou 80 mm.",
  }),
  conteudo: z.strictObject({
    pedido: interruptor("Número do pedido"),
    itens: interruptor("Itens"),
    total: interruptor("Total"),
    enderecoCliente: interruptor("Endereço do cliente"),
    totalEmDestaque: interruptor("Total em destaque"),
    observacoes: interruptor("Observações"),
  }),
});

export type ConfiguracaoDeImpressao = z.infer<
  typeof esquemaDaConfiguracaoDeImpressao
>;

export const CONFIGURACAO_DE_IMPRESSAO_PADRAO: ConfiguracaoDeImpressao = {
  larguraMm: 80,
  conteudo: {
    pedido: true,
    itens: true,
    total: true,
    enderecoCliente: true,
    totalEmDestaque: false,
    observacoes: true,
  },
};

/** Normaliza o documento persistido e nunca permite desligar o essencial. */
export function normalizarConfiguracaoDeImpressao(
  valor: unknown,
): ConfiguracaoDeImpressao {
  const resultado = esquemaDaConfiguracaoDeImpressao.safeParse(valor);
  const configuracao = resultado.success
    ? resultado.data
    : CONFIGURACAO_DE_IMPRESSAO_PADRAO;

  return {
    ...configuracao,
    conteudo: {
      ...configuracao.conteudo,
      pedido: true,
      itens: true,
      total: true,
    },
  };
}

export function validarConfiguracaoDeImpressao(
  valor: unknown,
): ConfiguracaoDeImpressao {
  const configuracao = esquemaDaConfiguracaoDeImpressao.parse(valor);
  return normalizarConfiguracaoDeImpressao(configuracao);
}
