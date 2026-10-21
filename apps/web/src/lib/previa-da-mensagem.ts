/**
 * A prévia da mensagem do pedido, com um pedido de exemplo (AC-913, AC-915).
 *
 * A PRÉVIA USA O MESMO GERADOR DO PEDIDO DE VERDADE (`packages/core`). Uma
 * segunda montagem, escrita para a tela, mostraria ao dono uma mensagem que o
 * cliente nunca manda — e ele ajustaria a saudação em cima de um texto que não
 * existe. A composição também é a mesma do servidor: a saudação que o dono
 * escreveu, uma linha em branco, e o corpo do pedido.
 *
 * O DONO EDITA A SAUDAÇÃO, e só ela. O corpo — código, itens, entrega,
 * pagamento, total e o link de acompanhamento — é do sistema e não sai da
 * mensagem (ASM-905): pedido que chega sem o endereço ou sem o total é pedido
 * que a loja não consegue atender. E a mensagem sai sem marca da plataforma:
 * quem a lê é o dono, e ela é da loja dele.
 */
import {
  gerarTextoDoPedido,
  normalizarWhatsApp,
  type PedidoParaTexto,
} from "@simpleclick/core";

/** O pedido de exemplo da prévia: realista, e sem dado de ninguém. */
export function pedidoDeExemplo(apelidoDaLoja: string): PedidoParaTexto {
  return {
    codigo: "A-0042",
    cliente: { nome: "Cliente de exemplo", telefone: "(11) 90000-0000" },
    itens: [
      {
        nome: "Pastel de carne",
        quantidade: 2,
        totalDaLinhaEmCentavos: 1_800,
        opcoes: [{ grupo: "Adicionais", opcao: "Queijo", quantidade: 1 }],
      },
      { nome: "Caldo de cana", quantidade: 1, totalDaLinhaEmCentavos: 700 },
    ],
    observacao: null,
    entrega: {
      tipo: "DELIVERY",
      endereco: {
        logradouro: "Rua de exemplo",
        numero: "100",
        complemento: null,
        bairro: "Centro",
        cidade: null,
        cep: null,
      },
    },
    taxaDeEntrega: { modo: "VALUE", valorEmCentavos: 500, nome: null },
    pagamento: { forma: "CASH", trocoParaEmCentavos: 5_000 },
    subtotalEmCentavos: 2_500,
    totalEmCentavos: 3_000,
    linkDeAcompanhamento: `https://…/loja/${apelidoDaLoja}/pedido/exemplo`,
  };
}

/** O que aparece no corpo de TODO pedido, e que o dono não consegue tirar. */
export const PARTES_OBRIGATORIAS_DO_PEDIDO = [
  "código do pedido",
  "itens com quantidade e valor",
  "forma de entrega e endereço",
  "forma de pagamento",
  "total",
  "link de acompanhamento",
] as const;

/**
 * A mensagem como o dono vai recebê-la, com a saudação que ele escreveu.
 *
 * Saudação vazia é escolha dele — o pedido começa direto pelo código.
 */
export function previaDaMensagem(
  saudacao: string | null,
  apelidoDaLoja: string,
): string {
  const corpo = gerarTextoDoPedido(pedidoDeExemplo(apelidoDaLoja)).texto;
  const abertura = saudacao?.trim() ?? "";
  return abertura === "" ? corpo : `${abertura}\n\n${corpo}`;
}

/** Como o número digitado fica depois de normalizado, ou o que falta nele. */
export type ConferenciaDoNumero =
  | { readonly ok: true; readonly exibicao: string }
  | { readonly ok: false; readonly explicacao: string };

/** A mesma regra da API, para a tela mostrar "assim fica" enquanto digita. */
export function conferirNumero(numero: string): ConferenciaDoNumero {
  const resultado = normalizarWhatsApp(numero);
  return resultado.ok
    ? { ok: true, exibicao: resultado.exibicao }
    : { ok: false, explicacao: resultado.explicacao };
}
