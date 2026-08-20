/**
 * As iniciais de um nome, para a marca de quem ainda não subiu logo.
 *
 * Melhor que um espaço vazio e melhor que um ícone genérico: a marca continua
 * sendo a da loja, e a composição não desmonta.
 *
 * MORA AQUI porque duas telas precisam dela — a apresentação da loja e a prévia
 * da landing. Duas cópias divergiriam no dia em que uma das duas ganhasse uma
 * regra nova, e a loja apareceria com iniciais diferentes em dois lugares do
 * mesmo produto.
 */

/**
 * Palavras que não viram inicial.
 *
 * "Pastelaria do Zé" é PZ, e não PDZ: o "do" é ligação, não parte do nome. Sem
 * esta lista, ou o conector entra na sigla, ou a regra vira "descarte palavra
 * curta" — e aí "Zé" sai junto, o que é pior, porque é o nome da pessoa.
 */
const LIGACOES = new Set([
  "de",
  "do",
  "da",
  "dos",
  "das",
  "e",
  "em",
  "no",
  "na",
]);

/** Quantas letras a sigla tem, no máximo. */
const LETRAS = 2;

export function iniciaisDe(nome: string, reserva = "SL"): string {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter(
      (palavra) =>
        // Só palavra que COMEÇA COM LETRA. "Sabor & Cia" tem três pedaços, e o
        // do meio é um símbolo: sem esta conferência a sigla saía "S&", que não
        // é inicial de nada.
        /^\p{L}/u.test(palavra) && !LIGACOES.has(palavra.toLowerCase()),
    );

  const sigla = palavras
    .slice(0, LETRAS)
    .map((palavra) => palavra[0]?.toUpperCase() ?? "")
    .join("");

  return sigla === "" ? reserva : sigla;
}
