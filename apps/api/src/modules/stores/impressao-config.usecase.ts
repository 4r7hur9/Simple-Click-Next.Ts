/**
 * Formato de impressão do cupom (T-906: AC-919, AC-920).
 *
 * A largura é a do rolo da impressora térmica, e é ela que o gerador do cupom
 * recebe: o mesmo pedido sai em 58 ou em 80 mm conforme o que está salvo
 * aqui. O essencial — número do pedido, itens e total — não desliga: a
 * normalização o liga de novo, mesmo que a entrada peça o contrário.
 *
 * A CHAVE DO MODO AUTOMÁTICO (T-608: AC-622, AC-626) mora aqui também, como
 * `automatico`, e é OPCIONAL de propósito. O esquema é estrito e a leitura cai
 * no padrão quando a validação falha: se o campo fosse obrigatório, toda
 * configuração gravada antes dele deixaria de validar, e uma loja de 58 mm
 * voltaria a imprimir em 80 mm sem ninguém ter mexido em nada. Ausente, vale
 * desligado — a impressão por clique é o padrão (ASM-600). Quem lê a chave no
 * banco é a fila de impressão (`printing.automatico = true`, migração 0034).
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
  automatico: z.boolean("Impressão automática: ligue ou desligue.").optional(),
});

/** A configuração já normalizada: a chave do automático sempre presente. */
export type ConfiguracaoDeImpressao = Omit<
  z.infer<typeof esquemaDaConfiguracaoDeImpressao>,
  "automatico"
> & { readonly automatico: boolean };

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
  automatico: false,
};

/**
 * A chave do automático do jeito que o BANCO a lê: só `true` liga. Lida do
 * documento cru, e não do validado, para que a tela e a fila digam a mesma
 * coisa mesmo quando o resto do documento está velho ou incompleto — a fila
 * (`app.enfileirar_impressao`) não passa pelo esquema.
 */
function automaticoGuardado(valor: unknown): boolean {
  return (
    typeof valor === "object" &&
    valor !== null &&
    (valor as Record<string, unknown>)["automatico"] === true
  );
}

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
    automatico: automaticoGuardado(valor),
  };
}

export function validarConfiguracaoDeImpressao(
  valor: unknown,
): ConfiguracaoDeImpressao {
  const configuracao = esquemaDaConfiguracaoDeImpressao.parse(valor);
  return normalizarConfiguracaoDeImpressao(configuracao);
}
