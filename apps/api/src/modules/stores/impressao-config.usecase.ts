import { z } from "zod";

export const CAMPOS_ESSENCIAIS_DO_CUPOM = ["pedido", "itens", "total"] as const;

export const esquemaDaConfiguracaoDeImpressao = z.strictObject({
  larguraMm: z.union([z.literal(58), z.literal(80)]),
  conteudo: z.strictObject({
    pedido: z.boolean(),
    itens: z.boolean(),
    total: z.boolean(),
    enderecoCliente: z.boolean(),
    totalEmDestaque: z.boolean(),
    observacoes: z.boolean(),
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
