/**
 * A situação da loja em palavras: "Aberta agora", "Fechada agora · abre às 18h".
 *
 * MORA EM `lib` porque três telas dizem a mesma coisa — a porta da loja, a
 * capa do cardápio e a página do produto — e a frase precisa ser uma só. Duas
 * cópias divergiriam no dia em que uma ganhasse o motivo do feriado e a outra
 * não, e a loja pareceria aberta numa tela e fechada na outra.
 */

/** Se está aberta agora, e quando volta a abrir, como a API descreve. */
export interface AberturaDaLoja {
  readonly aberta: boolean;
  readonly proximaAbertura: string | null;
  readonly motivo: string;
  readonly explicacaoDaExcecao?: string | null | undefined;
}

/**
 * A frase que a tela mostra ao lado do pulso.
 *
 * Fechada por EXCEÇÃO (feriado, folga) diz o motivo que o dono escreveu, porque
 * "fechada agora" numa terça-feira às 11h parece defeito; "Feriado municipal"
 * explica. Sem previsão de abertura, a frase diz isso em vez de inventar.
 */
export function fraseDaSituacao(abertura: AberturaDaLoja): string {
  if (abertura.aberta) return "Aberta agora";

  const explicacao =
    abertura.motivo === "EXCECAO" && abertura.explicacaoDaExcecao
      ? abertura.explicacaoDaExcecao
      : "Fechada agora";

  return `${explicacao} · ${abertura.proximaAbertura ?? "horário não informado"}`;
}
