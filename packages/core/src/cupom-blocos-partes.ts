/**
 * As partes do cupom que `gerarCupom` empilha (AC-619, AC-621): marca de
 * reimpressão, item com escolhas e observação, endereço e pagamento, mais os
 * formatadores que elas compartilham com o gerador.
 */

import {
  ErroDoCupom,
  type BlocoDeTexto,
  type BlocoDoCupom,
  type PedidoParaCupom,
} from "./cupom-contrato.ts";
import type {
  EnderecoDeEntrega,
  FormaDePagamento,
  ItemDoPedido,
  OpcaoDoItem,
  TaxaDeEntrega,
} from "./pedido-descrito.ts";
import { emReais } from "./taxa-entrega.ts";

// ── Formatação ──────────────────────────────────────────────────────────────

/** Recusa dinheiro que não é inteiro em centavos, em vez de arredondar (P-005). */
function reais(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new ErroDoCupom(
      `valor monetário precisa ser inteiro em centavos (P-005); recebido: ${String(centavos)}`,
    );
  }
  return emReais(centavos);
}

/** Texto opcional: vazio e só-espaço valem como ausente. */
export function presente(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const limpo = valor.normalize("NFC").trim();
  return limpo === "" ? null : limpo;
}

/** Junta as partes preenchidas, descartando as vazias. */
function juntar(
  partes: readonly (string | null | undefined)[],
  entre: string,
): string {
  return partes
    .map(presente)
    .filter((parte): parte is string => parte !== null)
    .join(entre);
}

const NOME_DO_PAGAMENTO: Readonly<Record<FormaDePagamento, string>> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CARD_ON_DELIVERY: "Cartão na entrega",
  OTHER: "A combinar",
};

/** Número ordinal da via, como se escreve à mão: "2ª". */
export function ordinal(via: number): string {
  return `${String(via)}ª`;
}

// ── Montagem ────────────────────────────────────────────────────────────────

/** Título de seção: negrito, à esquerda. */
export function titulo(texto: string): BlocoDeTexto {
  return { tipo: "texto", texto, negrito: true };
}

/** A marca de segunda via, visível de longe (AC-621). */
export function marcaDeReimpressao(via: number): BlocoDoCupom[] {
  return [
    {
      tipo: "texto",
      texto: "REIMPRESSÃO",
      alinhamento: "centro",
      negrito: true,
      tamanho: "duplo",
    },
    {
      tipo: "texto",
      texto: `*** ${ordinal(via)} VIA ***`,
      alinhamento: "centro",
      negrito: true,
    },
    { tipo: "separador", caractere: "=" },
  ];
}

/** Uma escolha do item, com a diferença entre acrescentar e tirar. */
function linhaDaOpcao(opcao: OpcaoDoItem): BlocoDeTexto {
  const grupo = presente(opcao.grupo) ?? "";
  const nome = presente(opcao.opcao) ?? "";
  const rotulo = grupo === "" ? "" : `${grupo}: `;
  if (opcao.acao === "REMOVE") {
    return { tipo: "texto", texto: `- ${rotulo}sem ${nome}`, recuo: 3 };
  }
  const quantidade = opcao.quantidade ?? 1;
  const vezes = quantidade > 1 ? ` x${String(quantidade)}` : "";
  const acrescimo = opcao.acrescimoEmCentavos ?? 0;
  const valor = acrescimo > 0 ? ` (+${reais(acrescimo)})` : "";
  return {
    tipo: "texto",
    texto: `+ ${rotulo}${nome}${vezes}${valor}`,
    recuo: 3,
  };
}

/** O item: quantidade, nome e valor; depois as escolhas e a observação dele. */
export function blocosDoItem(item: ItemDoPedido): BlocoDoCupom[] {
  if (!Number.isSafeInteger(item.quantidade) || item.quantidade <= 0) {
    throw new ErroDoCupom(
      `quantidade do item "${item.nome}" precisa ser inteiro maior que zero`,
    );
  }
  const variacao = presente(item.variacao);
  const nome = presente(item.nome) ?? "Item";
  const blocos: BlocoDoCupom[] = [
    {
      tipo: "par",
      esquerda: `${String(item.quantidade)}x ${variacao === null ? nome : `${nome} (${variacao})`}`,
      direita: reais(item.totalDaLinhaEmCentavos),
      negrito: true,
    },
  ];
  for (const opcao of item.opcoes ?? []) blocos.push(linhaDaOpcao(opcao));
  const observacao = presente(item.observacao);
  if (observacao !== null) {
    blocos.push({
      tipo: "texto",
      texto: `>> Obs.: ${observacao}`,
      negrito: true,
      recuo: 3,
    });
  }
  return blocos;
}

/** "Rótulo valor" quando o valor existe; vazio quando não. */
function rotulado(rotulo: string, valor: string | null | undefined): string {
  const texto = presente(valor);
  return texto === null ? "" : `${rotulo} ${texto}`;
}

/** O endereço em linhas, como o entregador lê. */
export function blocosDoEndereco(endereco: EnderecoDeEntrega): BlocoDoCupom[] {
  const linhas = [
    juntar(
      [
        juntar([endereco.logradouro, endereco.numero], ", "),
        endereco.complemento,
      ],
      " - ",
    ),
    juntar(
      [endereco.bairro, juntar([endereco.cidade, endereco.uf], "/")],
      " - ",
    ),
    rotulado("CEP", endereco.cep),
    rotulado("Ref.:", endereco.pontoDeReferencia),
    rotulado("Receber:", endereco.destinatario),
  ];
  return linhas
    .filter((texto) => texto !== "")
    .map((texto): BlocoDeTexto => ({ tipo: "texto", texto }));
}

/** Como a taxa de entrega é dita no papel, modo a modo. */
function valorDaTaxa(taxa: TaxaDeEntrega): string {
  switch (taxa.modo) {
    case "VALUE":
      return reais(taxa.valorEmCentavos);
    case "FREE":
      return "grátis";
    case "ASK":
    case "OUTSIDE_AREA":
    case "NEIGHBORHOOD_NOT_FOUND":
      return "a combinar";
  }
}

/** Pagamento: forma, troco e — por fim — os valores com o total. */
export function blocosDoPagamento(
  pedido: PedidoParaCupom,
  totalEmDestaque: boolean,
): BlocoDoCupom[] {
  const blocos: BlocoDoCupom[] = [
    titulo("PAGAMENTO"),
    {
      tipo: "par",
      esquerda: "Forma",
      direita: NOME_DO_PAGAMENTO[pedido.pagamento.forma],
    },
  ];
  if (pedido.pagamento.trocoParaEmCentavos != null) {
    blocos.push({
      tipo: "par",
      esquerda: "Troco para",
      direita: reais(pedido.pagamento.trocoParaEmCentavos),
    });
  }
  blocos.push({ tipo: "separador", caractere: "-" });
  blocos.push({
    tipo: "par",
    esquerda: "Subtotal",
    direita: reais(pedido.subtotalEmCentavos),
  });
  const desconto = pedido.descontoEmCentavos ?? 0;
  if (desconto > 0) {
    blocos.push({
      tipo: "par",
      esquerda: "Desconto",
      direita: reais(-desconto),
    });
  }
  const descontoDeRetirada = pedido.descontoDeRetiradaEmCentavos ?? 0;
  if (descontoDeRetirada > 0) {
    blocos.push({
      tipo: "par",
      esquerda: "Desconto retirada",
      direita: reais(-descontoDeRetirada),
    });
  }
  // Retirada não paga entrega (AC-506): a linha não existe, em vez de zerada.
  if (pedido.entrega.tipo === "DELIVERY") {
    blocos.push({
      tipo: "par",
      esquerda: presente(pedido.taxaDeEntrega.nome) ?? "Taxa de entrega",
      direita: valorDaTaxa(pedido.taxaDeEntrega),
    });
  }
  blocos.push({
    tipo: "par",
    esquerda: "TOTAL",
    direita: reais(pedido.totalEmCentavos),
    negrito: true,
    tamanho: totalEmDestaque ? "duplo" : "normal",
  });
  return blocos;
}
