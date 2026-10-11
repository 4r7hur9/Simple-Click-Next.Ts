/**
 * Formatação do texto do pedido para o WhatsApp (AC-521, AC-522): a régua do
 * tamanho no link, as marcas de negrito e itálico, a limpeza do texto livre e
 * os reais a partir de centavos inteiros (P-005).
 */

/** Erro de uso do gerador: o pedido recebido não descreve um pedido válido. */
export class ErroDeTextoDoPedido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeTextoDoPedido";
  }
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
export function negrito(texto: string): string {
  return `*${texto}*`;
}

/** Marca de itálico do WhatsApp. */
export function italico(texto: string): string {
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
export function normalizarTexto(texto: string): string {
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
export function formatarReais(centavos: number): string {
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
