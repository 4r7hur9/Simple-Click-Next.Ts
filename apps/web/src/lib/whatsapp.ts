/**
 * Abertura da conversa do WhatsApp (AC-520, AC-523).
 *
 * O QUE ESTA PEÇA NÃO FAZ: montar o endereço. O texto do pedido e o link vêm
 * prontos do servidor, que é a única camada autorizada a conversar com as
 * regras. Aqui mora só a mecânica de abrir — que é onde o navegador impõe as
 * suas condições.
 *
 * A CONDIÇÃO QUE MANDA NO DESENHO: o navegador só deixa abrir uma janela nova
 * durante o gesto de quem clicou. Se o código esperar a resposta do servidor
 * para só então abrir, o gesto já terminou e a janela é bloqueada — em silêncio,
 * sem erro nenhum. É por isso que o pedido é criado ANTES, e o clique de enviar
 * apenas abre um endereço que já existe.
 *
 * Bloqueio acontece mesmo assim, e é tratado: extensão de bloqueio, navegador
 * em modo restrito, celular sem o aplicativo. Quando acontece, o cliente
 * precisa de dois caminhos — o link para clicar com a própria mão, e o texto
 * para copiar. O pedido já está registrado de qualquer jeito (AC-523).
 */

/** O que aconteceu ao tentar abrir a conversa. */
export type ResultadoDaAbertura = "abriu" | "bloqueado" | "endereco-invalido";

/** Como abrir. Existe como parâmetro para o teste não depender do navegador. */
export type AbridorDeJanela = (
  endereco: string,
  alvo: string,
  opcoes: string,
) => Window | null;

/**
 * Endereços que este projeto aceita abrir.
 *
 * A lista é fechada de propósito. O endereço chega como DADO, e dado vira
 * endereço aberto no navegador: sem esta conferência, um valor adulterado no
 * caminho levaria o cliente para um site qualquer — logo depois de ele ter
 * digitado nome, telefone e endereço de entrega, que é o pior momento possível
 * para mandá-lo a uma página que imita a loja.
 */
const HOSPEDEIROS_PERMITIDOS: ReadonlySet<string> = new Set([
  "wa.me",
  "api.whatsapp.com",
  "web.whatsapp.com",
]);

/** O endereço aponta mesmo para o WhatsApp, por conexão segura? */
export function ehEnderecoDoWhatsApp(endereco: string): boolean {
  try {
    const alvo = new URL(endereco);
    return alvo.protocol === "https:" && HOSPEDEIROS_PERMITIDOS.has(alvo.host);
  } catch {
    // Endereço malformado não é exceção a propagar: é resposta "não".
    return false;
  }
}

/**
 * Abre a conversa, no mesmo gesto de quem clicou.
 *
 * `noopener` e `noreferrer` não são enfeite: sem eles a página aberta recebe
 * uma referência à janela do pedido e pode trocá-la de endereço.
 */
export function abrirConversa(
  endereco: string,
  abrir: AbridorDeJanela,
): ResultadoDaAbertura {
  if (!ehEnderecoDoWhatsApp(endereco)) return "endereco-invalido";

  const janela = abrir(endereco, "_blank", "noopener,noreferrer");
  // Janela bloqueada devolve `null`. Não há evento, não há erro: quem não
  // conferir o retorno acha que enviou e deixa o cliente esperando resposta de
  // uma mensagem que nunca saiu.
  return janela === null ? "bloqueado" : "abriu";
}
