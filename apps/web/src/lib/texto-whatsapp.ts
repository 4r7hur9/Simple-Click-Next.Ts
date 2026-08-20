/**
 * Lê a formatação do WhatsApp para a tela poder desenhá-la (AC-940).
 *
 * O PROBLEMA QUE ISTO RESOLVE. A mensagem que o gerador produz usa a marcação do
 * WhatsApp: `*Pedido A-1042*` chega em NEGRITO no aparelho de quem recebe.
 * Mostrar os asteriscos crus na prévia faz a landing parecer quebrada
 * justamente para quem mais entende do assunto — o dono de loja abre o WhatsApp
 * quarenta vezes por dia e sabe que mensagem nenhuma tem asterisco à vista.
 *
 * A saída é uma lista de PEDAÇOS, e não texto com marcação. Devolver texto com
 * etiquetas obrigaria a tela a injetá-lo como HTML, e isso transformaria
 * qualquer texto que um dia venha de fora — o nome da loja, a observação do
 * cliente — em código executável na página. Pedaço a pedaço, o React escapa
 * cada um, e não existe caminho para injeção.
 */

/** Um pedaço de linha: texto comum ou texto em negrito. */
export interface PedacoDeTexto {
  readonly texto: string;
  readonly negrito: boolean;
}

/** Uma linha da mensagem, já dividida em pedaços. */
export type LinhaDeMensagem = readonly PedacoDeTexto[];

/**
 * O que o WhatsApp trata como negrito: asterisco em volta, sem espaço colado.
 *
 * A exigência de conteúdo não vazio é do próprio aplicativo: `**` sozinho não
 * vira negrito, ele aparece como dois asteriscos. Casar aí produziria um negrito
 * que a prévia mostra e o aparelho de quem recebe não.
 */
const NEGRITO = /\*([^*\n]+)\*/g;

/** Divide uma linha nos trechos em negrito. */
function pedacosDaLinha(linha: string): PedacoDeTexto[] {
  const pedacos: PedacoDeTexto[] = [];
  let ultimoFim = 0;

  for (const achado of linha.matchAll(NEGRITO)) {
    const inicio = achado.index;
    if (inicio > ultimoFim) {
      pedacos.push({ texto: linha.slice(ultimoFim, inicio), negrito: false });
    }
    pedacos.push({ texto: achado[1] ?? "", negrito: true });
    ultimoFim = inicio + achado[0].length;
  }

  if (ultimoFim < linha.length) {
    pedacos.push({ texto: linha.slice(ultimoFim), negrito: false });
  }

  // Linha vazia continua existindo: ela é o espaço entre os blocos da mensagem,
  // e sumir com ela colaria "Itens" no cliente de cima.
  return pedacos.length > 0 ? pedacos : [{ texto: "", negrito: false }];
}

/**
 * Lê a mensagem inteira, linha a linha.
 *
 * As quebras de linha são PARTE DO FORMATO — é o que separa cliente, itens,
 * entrega e pagamento na mensagem que chega. Juntá-las produziria um parágrafo
 * único que ninguém consegue ler no celular.
 */
export function lerMensagemDoWhatsApp(mensagem: string): LinhaDeMensagem[] {
  return mensagem.split("\n").map(pedacosDaLinha);
}
