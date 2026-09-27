/**
 * O ritmo da exibição, lido do endereço (Q-034).
 *
 * A pergunta em aberto era "quantos segundos cada tela fica". A resposta que
 * serve a toda loja não existe: a lanchonete com seis itens quer telas curtas,
 * a pizzaria com quarenta sabores quer dar tempo de ler. O padrão está em
 * `useRodizio.ts`; o endereço da exibição aceita outro valor, dentro de um
 * limite — abaixo de cinco segundos ninguém lê, acima de dois minutos a fila
 * vê sempre a mesma tela.
 *
 * O MESMO VALE PARA A ATUALIZAÇÃO. O padrão é um minuto; a prova de ponta a
 * ponta pede menos para não esperar um minuto de relógio a cada cenário.
 */

/** O nome do parâmetro do tempo por tela, em segundos. */
export const PARAMETRO_DE_SEGUNDOS = "segundos";

/** O nome do parâmetro do tempo entre atualizações, em segundos. */
export const PARAMETRO_DE_ATUALIZACAO = "atualizar";

/** Os limites do tempo por tela, em segundos. */
export const SEGUNDOS_POR_TELA_MINIMO = 5;
export const SEGUNDOS_POR_TELA_MAXIMO = 120;

/** Os limites do tempo entre atualizações, em segundos. */
export const SEGUNDOS_DE_ATUALIZACAO_MINIMO = 2;
export const SEGUNDOS_DE_ATUALIZACAO_MAXIMO = 600;

/**
 * Lê um número inteiro de segundos do endereço, dentro dos limites.
 *
 * Valor ausente, ilegível ou fora do limite devolve o padrão: um endereço
 * digitado errado na televisão não pode deixá-la parada nem frenética.
 */
export function segundosDoParametro(
  valor: string | string[] | undefined,
  padrao: number,
  minimo: number,
  maximo: number,
): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (texto === undefined) return padrao;
  const lido = Number.parseInt(texto, 10);
  if (!Number.isInteger(lido) || lido < minimo || lido > maximo) return padrao;
  return lido;
}
