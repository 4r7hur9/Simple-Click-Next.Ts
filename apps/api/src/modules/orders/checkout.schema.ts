/**
 * Validação do fechamento na borda da API (AC-505, AC-506, AC-508, P-007).
 *
 * O ENDEREÇO É CONDICIONAL, e essa é a decisão que estrutura o arquivo inteiro.
 * Na entrega ele é obrigatório; na retirada ele não é pedido — e, mais que
 * isso, não é ACEITO. Um esquema que aceitasse endereço na retirada deixaria
 * passar dado pessoal que ninguém pediu, guardado num pedido que nunca vai
 * chegar a lugar nenhum, e que depois teria de ser apagado a pedido do titular.
 *
 * A união é DISCRIMINADA por `entrega`, e não um objeto com campos opcionais.
 * Com campos opcionais, "entrega sem endereço" passaria pela validação e
 * quebraria mais adiante, quando o entregador já tivesse saído. Aqui a forma
 * inválida não tem como ser construída.
 *
 * Tudo o que entra é validado ANTES de chegar ao domínio (P-007). O que a tela
 * mandou de preço e total não está neste esquema de propósito: preço vem do
 * catálogo (P-006), e aceitar o número do cliente aqui já seria meio caminho
 * para usá-lo.
 */
import { z } from "zod";

/** Nome de quem pede: curto, mas suficiente para o dono chamar na entrega. */
const esquemaDeNome = z
  .string()
  .trim()
  .min(2, "Informe seu nome para a loja saber quem pediu.")
  .max(120, "Nome muito longo.");

/**
 * Telefone em formato internacional, já normalizado pela tela.
 *
 * A régua é a mesma de `packages/core/src/telefone.ts`, e por isso é frouxa
 * aqui de propósito: quem sabe se o número é possível é aquele normalizador,
 * que conhece código de área brasileiro. Repetir a regra nos dois lugares faria
 * as duas divergirem, e a borda passaria a recusar número que o produto aceita.
 */
const esquemaDeTelefone = z
  .string()
  .trim()
  .regex(
    /^\d{8,15}$/,
    "Telefone em formato impossível. Informe com DDD, por exemplo (11) 91234-5678.",
  );

/** Endereço de entrega. Só existe quando a escolha é entrega. */
export const esquemaDeEndereco = z.strictObject({
  logradouro: z.string().trim().min(3, "Informe a rua ou avenida."),
  numero: z
    .string()
    .trim()
    .min(1, "Informe o número, ou escreva 'sem número'."),
  complemento: z.string().trim().max(120).optional(),
  bairro: z
    .string()
    .trim()
    .min(2, "Informe o bairro para a loja calcular a entrega."),
  cidade: z.string().trim().min(2, "Informe a cidade.").optional(),
  cep: z
    .string()
    .trim()
    .regex(/^\d{8}$/, "CEP tem 8 dígitos.")
    .optional(),
  pontoDeReferencia: z.string().trim().max(200).optional(),
});

export type EnderecoDeEntrega = z.infer<typeof esquemaDeEndereco>;

/** Quem está pedindo. Convidado e cliente com conta chegam iguais (AC-518). */
export const esquemaDeContato = z.strictObject({
  nome: esquemaDeNome,
  telefone: esquemaDeTelefone,
  email: z.email("E-mail em formato inválido.").optional(),
});

/**
 * O fechamento, como a tela o envia.
 *
 * Repare no que NÃO está aqui: preço, total, taxa. Todos vêm do servidor
 * (P-006). Aceitar o número do cliente neste esquema já seria meio caminho
 * andado para alguém usá-lo mais adiante sem perceber.
 */
export const esquemaDeFechamento = z.discriminatedUnion("entrega", [
  z.strictObject({
    entrega: z.literal("DELIVERY"),
    endereco: esquemaDeEndereco,
    contato: esquemaDeContato,
    formaDePagamento: z.enum(["PIX", "CASH", "CARD_ON_DELIVERY", "OTHER"]),
    trocoParaEmCentavos: z.int().positive().optional(),
    observacao: z.string().trim().max(500).optional(),
    chaveDeIdempotencia: z.uuid(
      "A chave do fechamento precisa ser um identificador de alta entropia.",
    ),
  }),
  z.strictObject({
    entrega: z.literal("PICKUP"),
    // Sem `endereco`: `strictObject` RECUSA a chave, em vez de ignorá-la. É o
    // que impede dado pessoal de entrar num pedido que ninguém vai entregar.
    contato: esquemaDeContato,
    formaDePagamento: z.enum(["PIX", "CASH", "CARD_ON_DELIVERY", "OTHER"]),
    trocoParaEmCentavos: z.int().positive().optional(),
    observacao: z.string().trim().max(500).optional(),
    chaveDeIdempotencia: z.uuid(
      "A chave do fechamento precisa ser um identificador de alta entropia.",
    ),
  }),
]);

export type Fechamento = z.infer<typeof esquemaDeFechamento>;

/** O que a loja oferece, para recusar a escolha que ela não faz (AC-506). */
export interface FormasQueALojaOferece {
  readonly aceitaEntrega: boolean;
  readonly aceitaRetirada: boolean;
}

/**
 * Confere se a loja faz a forma escolhida.
 *
 * Fica FORA do esquema porque depende do banco, e esquema de borda não lê
 * banco. A separação também deixa a mensagem certa: "esta loja não faz entrega"
 * é resposta de negócio, não erro de formato.
 */
export function lojaAceitaAForma(
  fechamento: Fechamento,
  oferece: FormasQueALojaOferece,
): { aceita: boolean; explicacao?: string } {
  if (fechamento.entrega === "DELIVERY" && !oferece.aceitaEntrega) {
    return {
      aceita: false,
      explicacao:
        "Esta loja não faz entrega; o pedido é para retirada no local.",
    };
  }
  if (fechamento.entrega === "PICKUP" && !oferece.aceitaRetirada) {
    return {
      aceita: false,
      explicacao:
        "Esta loja não faz retirada no local; o pedido é para entrega.",
    };
  }
  return { aceita: true };
}
