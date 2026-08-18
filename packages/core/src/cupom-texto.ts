/**
 * Gerador do texto do pedido para o WhatsApp (AC-519, AC-521, AC-522).
 *
 * Função PURA: recebe o pedido já montado e devolve o texto. Não conhece
 * banco, HTTP nem framework — é o que a tabela de fronteiras de
 * `.spec/design/arquitetura.md` exige de `packages/core`, e é o que permite
 * provar o texto por comparação, sem serviço nenhum no ar.
 *
 * A direção da mensagem está decidida em `.spec/design/decisoes.md`
 * (17/08/2026): quem envia é o CLIENTE, para o número da loja. Por isso o
 * texto fala na voz de quem pediu ("Acompanhe seu pedido") e traz os dados de
 * contato do cliente — o dono precisa deles para responder.
 *
 * Quem monta o endereço `https://wa.me/...?text=...` é `apps/web` (T-508).
 * Aqui mora só o CONTEÚDO, mais a medida do tamanho que aquele endereço vai
 * ter (`medirComprimentoNoLink`), para que as duas pontas usem a mesma régua.
 */

/** Erro de uso do gerador: o pedido recebido não descreve um pedido válido. */
export class ErroDeTextoDoPedido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeTextoDoPedido";
  }
}

/**
 * Modo da taxa de entrega — união discriminada, e não `number | null`.
 *
 * Os valores são os mesmos que `orders.delivery_fee_mode` guarda, para que a
 * borda da API não precise traduzir duas vezes e não exista um segundo
 * vocabulário divergindo em silêncio do que está no banco.
 */
export type ModoDaTaxaDeEntrega =
  "VALUE" | "FREE" | "ASK" | "OUTSIDE_AREA" | "NEIGHBORHOOD_NOT_FOUND";

/** Forma de pagamento, como `orders.payment_method` a persiste. */
export type FormaDePagamento = "PIX" | "CASH" | "CARD_ON_DELIVERY" | "OTHER";

/** O que a escolha fez com a opção: acrescentou ou tirou ("sem cebola"). */
export type AcaoDaOpcao = "ADD" | "REMOVE";

/** Escolha registrada em um item, já com os nomes por extenso do momento. */
export interface OpcaoDoItem {
  readonly grupo: string;
  readonly opcao: string;
  readonly acao?: AcaoDaOpcao;
  readonly quantidade?: number;
  readonly acrescimoEmCentavos?: number;
}

/** Item comprado, com os valores já congelados pelo servidor (P-006). */
export interface ItemDoPedido {
  readonly nome: string;
  readonly variacao?: string | null;
  readonly quantidade: number;
  readonly totalDaLinhaEmCentavos: number;
  readonly opcoes?: readonly OpcaoDoItem[];
  readonly observacao?: string | null;
}

/** Endereço de entrega. Só existe quando a forma de entrega é `DELIVERY`. */
export interface EnderecoDeEntrega {
  readonly logradouro: string;
  readonly numero?: string | null;
  readonly complemento?: string | null;
  readonly bairro?: string | null;
  readonly cidade?: string | null;
  readonly uf?: string | null;
  readonly cep?: string | null;
  readonly pontoDeReferencia?: string | null;
  readonly destinatario?: string | null;
}

/**
 * Forma de entrega. Retirada não tem endereço, e o tipo diz isso: sem união
 * discriminada seria possível montar um pedido de retirada carregando
 * endereço, e o texto sairia com um bloco que não devia existir.
 */
export type FormaDeEntrega =
  | { readonly tipo: "PICKUP" }
  | { readonly tipo: "DELIVERY"; readonly endereco: EnderecoDeEntrega };

/** Taxa de entrega com o nome que o dono deu a ela (AC-507). */
export interface TaxaDeEntrega {
  readonly modo: ModoDaTaxaDeEntrega;
  readonly valorEmCentavos: number;
  readonly nome?: string | null;
}

/** Pagamento combinado — a versão 1 nunca cobra de verdade (AC-513). */
export interface PagamentoDoPedido {
  readonly forma: FormaDePagamento;
  readonly chavePix?: string | null;
  readonly tipoDaChavePix?: string | null;
  readonly nomeDoRecebedor?: string | null;
  readonly trocoParaEmCentavos?: number | null;
}

/** Contato do pedido. Convidado (AC-518) chega aqui igual a cliente com conta. */
export interface ClienteDoPedido {
  readonly nome: string;
  readonly telefone: string;
}

/**
 * O pedido, do jeito que o gerador precisa dele.
 *
 * Repare no que NÃO está aqui: identificador de cliente, de loja ou de
 * qualquer linha do banco. O gerador não distingue pedido de convidado de
 * pedido de cliente cadastrado porque, para o texto, não há diferença — o que
 * o dono precisa ler é nome, telefone e o que foi pedido (AC-518).
 */
export interface PedidoParaTexto {
  readonly codigo: string;
  readonly cliente: ClienteDoPedido;
  readonly itens: readonly ItemDoPedido[];
  readonly observacao?: string | null;
  readonly entrega: FormaDeEntrega;
  readonly taxaDeEntrega: TaxaDeEntrega;
  readonly pagamento: PagamentoDoPedido;
  readonly subtotalEmCentavos: number;
  readonly descontoEmCentavos?: number;
  readonly descontoDeRetiradaEmCentavos?: number;
  readonly totalEmCentavos: number;
  readonly linkDeAcompanhamento: string;
}

/** O texto gerado, mais o que foi preciso fazer para ele caber no link. */
export interface TextoDoPedido {
  /** O texto pronto para ir no endereço que abre a conversa. */
  readonly texto: string;
  /** Tamanho que este texto ocupa depois de codificado no endereço. */
  readonly comprimentoNoLink: number;
  /** Verdadeiro quando alguma coisa foi encurtada para caber. */
  readonly encurtado: boolean;
  /** Quantos itens viraram resumo em vez de aparecer linha a linha. */
  readonly itensOmitidos: number;
  /** Verdadeiro quando as opções e observações por item foram suprimidas. */
  readonly detalhesDosItensOmitidos: boolean;
  /** Falso quando nem o essencial coube — nunca corta, apenas avisa. */
  readonly dentroDoLimite: boolean;
}

/** Ajustes do gerador. */
export interface OpcoesDoTexto {
  /** Tamanho máximo, já codificado, do texto dentro do endereço. */
  readonly limiteDoLink?: number;
}

/**
 * Limite prático de tamanho do texto dentro do endereço que abre a conversa.
 *
 * O `wa.me` carrega a mensagem na barra de endereços, e endereço longo é
 * cortado em silêncio por navegador, aplicativo de mensagem e sistema
 * operacional — cada um com o seu teto. 2000 caracteres codificados ficam
 * abaixo do menor teto conhecido com folga, e essa folga é de propósito: o
 * custo de errar para menos é uma linha de resumo a mais; o de errar para mais
 * é o dono receber meia mensagem.
 */
export const LIMITE_PADRAO_DO_LINK = 2000;

/**
 * Quanto este texto vai ocupar dentro do endereço que abre a conversa.
 *
 * Medir o texto cru daria um número errado e otimista: no endereço, cada
 * caractere vira a sua forma percentual, e aí "ã" custa 6 caracteres e um
 * emoji custa 12. É esta medida — e não `texto.length` — que decide se o
 * pedido precisa ser encurtado (AC-521).
 */
export function medirComprimentoNoLink(texto: string): number {
  return encodeURIComponent(texto).length;
}

/** Marca de negrito do WhatsApp. */
function negrito(texto: string): string {
  return `*${texto}*`;
}

/** Marca de itálico do WhatsApp. */
function italico(texto: string): string {
  return `_${texto}_`;
}

/**
 * Tira os controles que corrompem a mensagem, sem tocar em acento nem emoji.
 *
 * Percorre por ponto de código (e não por unidade de 16 bits) porque emoji
 * ocupa dois: uma varredura ingênua partiria o par e entregaria o caractere
 * quebrado que AC-522 proíbe. Tabulação e quebra de linha ficam — a quebra é
 * conteúdo que o cliente escreveu e precisa chegar inteira.
 */
function removerControles(texto: string): string {
  let limpo = "";
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0) ?? 0;
    const ehControleProibido =
      (codigo < 0x20 && codigo !== 0x09 && codigo !== 0x0a) || codigo === 0x7f;
    if (!ehControleProibido) limpo += caractere;
  }
  return limpo;
}

/**
 * Normaliza texto livre vindo da tela (AC-522).
 *
 * Três coisas, nesta ordem e por três motivos diferentes:
 *
 * 1. `NFC` junta letra e acento num ponto de código só. O navegador pode
 *    mandar "ç" como "c" mais cedilha solta, e nessa forma o acento fica
 *    sujeito a se separar da letra ao ser cortado, colado ou renderizado.
 * 2. `\r\n` e `\r` viram `\n`. A quebra continua existindo — muda só a
 *    convenção —, e assim ela não gasta um `%0D` inútil no endereço.
 * 3. Controle solto sai fora.
 */
function normalizarTexto(texto: string): string {
  const semRetornoDeCarro = texto.replace(/\r\n?/g, "\n");
  return removerControles(semRetornoDeCarro.normalize("NFC")).trim();
}

/**
 * Formata centavos inteiros como reais (P-005).
 *
 * Recusa o que não for inteiro seguro em vez de arredondar: um valor com casa
 * decimal aqui significa que dinheiro virou ponto flutuante em algum lugar
 * antes, e arredondar em silêncio esconderia exatamente o defeito que P-005
 * existe para impedir.
 */
function formatarReais(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new ErroDeTextoDoPedido(
      `valor monetário precisa ser inteiro em centavos (P-005); recebido: ${String(centavos)}`,
    );
  }
  const sinal = centavos < 0 ? "-" : "";
  const absoluto = Math.abs(centavos);
  const reais = Math.floor(absoluto / 100);
  const resto = absoluto % 100;
  const comMilhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sinal}R$ ${comMilhar},${String(resto).padStart(2, "0")}`;
}

/** Quanto detalhe cada item recebe e quantos itens aparecem linha a linha. */
interface PlanoDeMontagem {
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
function montarTexto(pedido: PedidoParaTexto, plano: PlanoDeMontagem): string {
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

/**
 * Maior quantidade de itens listados que ainda cabe no limite.
 *
 * Busca binária, e não varredura: a montagem é barata, mas um pedido de
 * centenas de linhas montado uma vez por item viraria trabalho quadrático
 * dentro do fechamento do pedido, que é o caminho mais quente do sistema.
 *
 * A busca só é válida porque a faixa examinada vai de 0 até `total - 1`, onde
 * a linha de resumo está SEMPRE presente: aí cada item a mais só faz o texto
 * crescer, e a resposta é monótona. O caso `total` (lista inteira, sem resumo)
 * é decidido antes, fora daqui — incluí-lo quebraria a monotonia, porque
 * listar o último item pode custar menos do que a linha de resumo dele.
 */
function maiorQuantidadeQueCabe(
  pedido: PedidoParaTexto,
  limite: number,
): number {
  let melhor = 0;
  let baixo = 0;
  let alto = pedido.itens.length - 1;
  while (baixo <= alto) {
    const meio = Math.floor((baixo + alto) / 2);
    const texto = montarTexto(pedido, {
      detalharItens: false,
      itensExibidos: meio,
    });
    if (medirComprimentoNoLink(texto) <= limite) {
      melhor = meio;
      baixo = meio + 1;
    } else {
      alto = meio - 1;
    }
  }
  return melhor;
}

/** Empacota o texto com a medida e o que foi preciso encurtar. */
function resultado(
  texto: string,
  limite: number,
  itensOmitidos: number,
  detalhesDosItensOmitidos: boolean,
): TextoDoPedido {
  const comprimentoNoLink = medirComprimentoNoLink(texto);
  return {
    texto,
    comprimentoNoLink,
    encurtado: itensOmitidos > 0 || detalhesDosItensOmitidos,
    itensOmitidos,
    detalhesDosItensOmitidos,
    dentroDoLimite: comprimentoNoLink <= limite,
  };
}

/**
 * Gera o texto do pedido para o WhatsApp.
 *
 * Quando o pedido não cabe no endereço que abre a conversa, o texto é
 * encurtado em degraus, do menos ao mais custoso para quem lê (AC-521):
 *
 * 1. lista inteira, cada item com as suas escolhas e a sua observação;
 * 2. lista inteira, uma linha por item — some o detalhe, não o item;
 * 3. os primeiros itens que couberem, mais uma linha de resumo dizendo
 *    quantos ficaram de fora e quanto somam.
 *
 * Em nenhum degrau existe corte por quantidade de caracteres: a unidade que
 * sai é sempre a linha inteira, e por isso nunca sobra meia palavra nem meio
 * valor. O essencial — número do pedido, contato, entrega, pagamento, total e
 * o link — não entra na negociação e permanece nos três degraus. Se nem assim
 * couber, o texto volta completo com `dentroDoLimite: false`: mutilar o
 * endereço do cliente para ganhar caractere seria trocar um problema visível
 * (mensagem longa) por um invisível (entrega no lugar errado). A tela decide o
 * que fazer com o aviso — há o caminho de copiar o texto (AC-523).
 */
export function gerarTextoDoPedido(
  pedido: PedidoParaTexto,
  opcoes: OpcoesDoTexto = {},
): TextoDoPedido {
  if (pedido.itens.length === 0) {
    throw new ErroDeTextoDoPedido("pedido sem itens não gera texto");
  }
  const limite = opcoes.limiteDoLink ?? LIMITE_PADRAO_DO_LINK;
  const total = pedido.itens.length;

  const completo = montarTexto(pedido, {
    detalharItens: true,
    itensExibidos: total,
  });
  if (medirComprimentoNoLink(completo) <= limite) {
    return resultado(completo, limite, 0, false);
  }

  const semDetalhe = montarTexto(pedido, {
    detalharItens: false,
    itensExibidos: total,
  });
  if (medirComprimentoNoLink(semDetalhe) <= limite) {
    return resultado(semDetalhe, limite, 0, true);
  }

  const exibidos = maiorQuantidadeQueCabe(pedido, limite);
  const encurtado = montarTexto(pedido, {
    detalharItens: false,
    itensExibidos: exibidos,
  });
  return resultado(encurtado, limite, total - exibidos, true);
}
