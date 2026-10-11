/**
 * Os blocos do texto do pedido para o WhatsApp (AC-519, AC-521): itens com as
 * escolhas e o resumo dos que não couberam, endereço, pagamento e valores, e a
 * montagem do texto inteiro para um plano de detalhe.
 */

import type { PedidoParaTexto } from "./cupom-texto.ts";
import {
  ErroDeTextoDoPedido,
  formatarReais,
  italico,
  negrito,
  normalizarTexto,
} from "./cupom-texto-formato.ts";
import type {
  EnderecoDeEntrega,
  FormaDePagamento,
  ItemDoPedido,
  OpcaoDoItem,
  PagamentoDoPedido,
  TaxaDeEntrega,
} from "./pedido-descrito.ts";

/** Quanto detalhe cada item recebe e quantos itens aparecem linha a linha. */
export interface PlanoDeMontagem {
  readonly detalharItens: boolean;
  readonly itensExibidos: number;
}

/** Junta as partes preenchidas de uma linha, descartando o que veio vazio. */
function juntar(partes: readonly (string | null | undefined)[], entre: string) {
  return partes
    .map((parte) => (parte == null ? "" : normalizarTexto(parte)))
    .filter((parte) => parte.length > 0)
    .join(entre);
}

/** Nome do item com a variação entre parênteses, quando houver. */
function nomeDoItem(item: ItemDoPedido): string {
  const nome = normalizarTexto(item.nome);
  const variacao = item.variacao == null ? "" : normalizarTexto(item.variacao);
  return variacao.length > 0 ? `${nome} (${variacao})` : nome;
}

/** Uma escolha do item, já com a diferença entre acrescentar e tirar. */
function linhaDaOpcao(opcao: OpcaoDoItem): string {
  const grupo = normalizarTexto(opcao.grupo);
  const nome = normalizarTexto(opcao.opcao);
  if (opcao.acao === "REMOVE") return `   • ${grupo}: sem ${nome}`;

  const quantidade = opcao.quantidade ?? 1;
  const vezes = quantidade > 1 ? ` x${String(quantidade)}` : "";
  const acrescimo = opcao.acrescimoEmCentavos ?? 0;
  const valor = acrescimo > 0 ? ` (+${formatarReais(acrescimo)})` : "";
  return `   • ${grupo}: ${nome}${vezes}${valor}`;
}

/** As linhas de um item: a principal, as escolhas e a observação dele. */
function linhasDoItem(item: ItemDoPedido, detalhar: boolean): string[] {
  if (!Number.isSafeInteger(item.quantidade) || item.quantidade <= 0) {
    throw new ErroDeTextoDoPedido(
      `quantidade do item "${item.nome}" precisa ser inteiro maior que zero`,
    );
  }
  const principal = `${String(item.quantidade)}x ${nomeDoItem(item)} — ${formatarReais(item.totalDaLinhaEmCentavos)}`;
  if (!detalhar) return [principal];

  const linhas = [principal];
  for (const opcao of item.opcoes ?? []) linhas.push(linhaDaOpcao(opcao));
  const observacao =
    item.observacao == null ? "" : normalizarTexto(item.observacao);
  if (observacao.length > 0) linhas.push(`   Obs.: ${observacao}`);
  return linhas;
}

/**
 * O bloco dos itens, com o resumo dos que não couberam (AC-521).
 *
 * O resumo carrega quantos ficaram de fora E quanto eles somam. Sem o valor, o
 * dono veria uma lista que não fecha com o total e desconfiaria do pedido;
 * com ele, a conta fecha na tela e o link leva ao detalhe.
 */
function blocoDeItens(pedido: PedidoParaTexto, plano: PlanoDeMontagem): string {
  const exibidos = pedido.itens.slice(0, plano.itensExibidos);
  const omitidos = pedido.itens.slice(plano.itensExibidos);

  const linhas = [negrito("Itens")];
  for (const item of exibidos) {
    linhas.push(...linhasDoItem(item, plano.detalharItens));
  }
  if (omitidos.length > 0) {
    const soma = omitidos.reduce(
      (total, item) => total + item.totalDaLinhaEmCentavos,
      0,
    );
    const palavra = omitidos.length === 1 ? "item" : "itens";
    linhas.push(
      italico(
        `mais ${String(omitidos.length)} ${palavra} (${formatarReais(soma)}) — a lista completa está no link do pedido`,
      ),
    );
  }
  return linhas.join("\n");
}

/** O endereço em três linhas, mais referência e destinatário quando houver. */
function linhasDoEndereco(endereco: EnderecoDeEntrega): string[] {
  const linhas: string[] = [];
  linhas.push(
    juntar(
      [
        juntar([endereco.logradouro, endereco.numero], ", "),
        endereco.complemento,
      ],
      " - ",
    ),
  );
  linhas.push(
    juntar(
      [endereco.bairro, juntar([endereco.cidade, endereco.uf], "/")],
      " - ",
    ),
  );
  const cep = endereco.cep == null ? "" : normalizarTexto(endereco.cep);
  if (cep.length > 0) linhas.push(`CEP ${cep}`);
  const referencia =
    endereco.pontoDeReferencia == null
      ? ""
      : normalizarTexto(endereco.pontoDeReferencia);
  if (referencia.length > 0) linhas.push(`Referência: ${referencia}`);
  const destinatario =
    endereco.destinatario == null ? "" : normalizarTexto(endereco.destinatario);
  if (destinatario.length > 0) linhas.push(`Destinatário: ${destinatario}`);
  return linhas.filter((linha) => linha.length > 0);
}

/** Como a taxa de entrega é dita ao dono, modo a modo. */
function textoDaTaxa(taxa: TaxaDeEntrega): string {
  const nome = taxa.nome == null ? "" : normalizarTexto(taxa.nome);
  const rotulo = nome.length > 0 ? nome : "Taxa de entrega";
  switch (taxa.modo) {
    case "VALUE":
      return `${rotulo}: ${formatarReais(taxa.valorEmCentavos)}`;
    case "FREE":
      return `${rotulo}: grátis`;
    case "ASK":
      return `${rotulo}: a combinar`;
    case "OUTSIDE_AREA":
      return `${rotulo}: fora da área de entrega, a combinar`;
    case "NEIGHBORHOOD_NOT_FOUND":
      return `${rotulo}: bairro não encontrado, a combinar`;
  }
}

/** Nome da forma de pagamento na língua de quem lê a mensagem. */
function nomeDoPagamento(forma: FormaDePagamento): string {
  switch (forma) {
    case "PIX":
      return "PIX";
    case "CASH":
      return "Dinheiro";
    case "CARD_ON_DELIVERY":
      return "Cartão na entrega";
    case "OTHER":
      return "A combinar com a loja";
  }
}

/** O bloco de pagamento, com chave PIX ou troco quando fizerem sentido. */
function blocoDePagamento(pagamento: PagamentoDoPedido): string {
  const linhas = [negrito("Pagamento"), nomeDoPagamento(pagamento.forma)];
  const chave =
    pagamento.chavePix == null ? "" : normalizarTexto(pagamento.chavePix);
  if (chave.length > 0) {
    const tipo =
      pagamento.tipoDaChavePix == null
        ? ""
        : normalizarTexto(pagamento.tipoDaChavePix);
    linhas.push(`Chave PIX: ${chave}${tipo.length > 0 ? ` (${tipo})` : ""}`);
  }
  const recebedor =
    pagamento.nomeDoRecebedor == null
      ? ""
      : normalizarTexto(pagamento.nomeDoRecebedor);
  if (recebedor.length > 0) linhas.push(`Recebedor: ${recebedor}`);
  if (pagamento.trocoParaEmCentavos != null) {
    linhas.push(`Troco para ${formatarReais(pagamento.trocoParaEmCentavos)}`);
  }
  return linhas.join("\n");
}

/** O bloco de valores: subtotal, descontos, taxa e o total em destaque. */
function blocoDeValores(pedido: PedidoParaTexto): string {
  const linhas = [
    negrito("Valores"),
    `Itens: ${formatarReais(pedido.subtotalEmCentavos)}`,
  ];
  const desconto = pedido.descontoEmCentavos ?? 0;
  if (desconto > 0) linhas.push(`Desconto: ${formatarReais(-desconto)}`);
  const descontoDeRetirada = pedido.descontoDeRetiradaEmCentavos ?? 0;
  if (descontoDeRetirada > 0) {
    linhas.push(`Desconto de retirada: ${formatarReais(-descontoDeRetirada)}`);
  }
  // Retirada não paga entrega em hipótese nenhuma (AC-506): a linha da taxa
  // simplesmente não existe, em vez de aparecer zerada e levantar dúvida.
  if (pedido.entrega.tipo === "DELIVERY") {
    linhas.push(textoDaTaxa(pedido.taxaDeEntrega));
  }
  linhas.push(negrito(`Total: ${formatarReais(pedido.totalEmCentavos)}`));
  return linhas.join("\n");
}

/** Monta o texto inteiro para um plano de detalhe e de quantidade de itens. */
export function montarTexto(
  pedido: PedidoParaTexto,
  plano: PlanoDeMontagem,
): string {
  const blocos: string[] = [];

  blocos.push(negrito(`Pedido ${normalizarTexto(pedido.codigo)}`));
  blocos.push(
    [
      negrito("Cliente"),
      normalizarTexto(pedido.cliente.nome),
      normalizarTexto(pedido.cliente.telefone),
    ].join("\n"),
  );
  blocos.push(blocoDeItens(pedido, plano));

  const observacao =
    pedido.observacao == null ? "" : normalizarTexto(pedido.observacao);
  if (observacao.length > 0) {
    blocos.push([negrito("Observações"), observacao].join("\n"));
  }

  if (pedido.entrega.tipo === "DELIVERY") {
    blocos.push(
      [negrito("Entrega"), ...linhasDoEndereco(pedido.entrega.endereco)].join(
        "\n",
      ),
    );
  } else {
    blocos.push([negrito("Retirada"), "Retirada no local"].join("\n"));
  }

  blocos.push(blocoDePagamento(pedido.pagamento));
  blocos.push(blocoDeValores(pedido));
  blocos.push(
    [
      negrito("Acompanhe seu pedido"),
      normalizarTexto(pedido.linkDeAcompanhamento),
    ].join("\n"),
  );

  return blocos.join("\n\n");
}
