/**
 * Dinheiro em centavos inteiros (AC-311, P-005).
 *
 * POR QUE ISTO É UM MÓDULO, e não um `* 100` em cada tela. Ponto flutuante não
 * representa R$ 19,99: `19.99 * 100` dá `1998.9999999999998`. Quem arredonda
 * acerta hoje e erra no dia em que alguém esquecer o `Math.round` — foi o que
 * aconteceu na grade de variações, que mandava esse número quebrado para a API
 * e via o cadastro recusado sem entender por quê.
 *
 * A REGRA É UMA SÓ: valor monetário nasce inteiro (centavos) na borda que lê o
 * que a pessoa digitou, e daí em diante só é somado e multiplicado por inteiros.
 * Nada aqui divide, e nada aqui passa por `parseFloat`. Formatar em reais é
 * assunto da apresentação (`emReais`), e só dela.
 *
 * Função PURA, como o resto do core: a tela usa para ler o que foi digitado, a
 * API usa para multiplicar, e as duas chegam ao mesmo centavo.
 */

/** Erro de uso: alguém tentou fazer conta de dinheiro com o que não é centavo. */
export class ErroDeDinheiro extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeDinheiro";
  }
}

/**
 * Confere que o valor é um inteiro em centavos, e o devolve.
 *
 * Recusa em vez de arredondar: um valor quebrado chegando aqui é defeito de
 * quem chamou, e arredondar em silêncio esconderia o defeito até o extrato.
 * `Number.isSafeInteger` recusa também o que passou do inteiro exato do
 * JavaScript — acima dele, somar um centavo pode não mudar nada.
 */
export function exigirCentavos(valor: number, oQue = "o valor"): number {
  if (!Number.isSafeInteger(valor)) {
    throw new ErroDeDinheiro(
      `${oQue} precisa ser um inteiro em centavos, e chegou ${String(valor)}`,
    );
  }
  return valor;
}

/**
 * Preço unitário × quantidade, em centavos (AC-311).
 *
 * Inteiro vezes inteiro é exato: R$ 19,99 × 3 é 1999 × 3 = 5997, e não
 * 59.97000000000001. A quantidade também precisa ser inteira — meia unidade é
 * venda por peso, que a versão 1 não faz (Q-304).
 */
export function multiplicarCentavos(
  unitarioEmCentavos: number,
  quantidade: number,
): number {
  exigirCentavos(unitarioEmCentavos, "o preço unitário");
  if (!Number.isSafeInteger(quantidade) || quantidade < 0) {
    throw new ErroDeDinheiro(
      `a quantidade precisa ser um inteiro não negativo, e chegou ${String(quantidade)}`,
    );
  }
  return exigirCentavos(unitarioEmCentavos * quantidade, "o total");
}

/** Soma valores em centavos, conferindo cada parcela e o resultado. */
export function somarCentavos(valores: readonly number[]): number {
  let soma = 0;
  for (const valor of valores) {
    soma = exigirCentavos(soma + exigirCentavos(valor, "a parcela"), "a soma");
  }
  return soma;
}

/** Real com milhar por ponto e decimal por vírgula: "1.234,56", "19,9", "20". */
const FORMA_BRASILEIRA = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** Real com decimal por ponto e sem milhar: "19.99", o que o teclado numérico manda. */
const FORMA_COM_PONTO = /^(\d+)\.(\d{1,2})$/;

/**
 * Lê o valor em reais que a pessoa digitou e devolve centavos inteiros.
 *
 * SEM PONTO FLUTUANTE NO CAMINHO: as partes inteira e decimal são lidas como
 * texto e juntadas como inteiros. "19,99" vira 19 × 100 + 99 = 1999, sempre.
 *
 * Aceita o que o dono escreve de verdade no celular: "19,99", "19.99",
 * "R$ 1.234,50", "20", e o sinal de menos para acréscimo que desconta. Devolve
 * `null` para o que não é valor em reais ("abc", "19,999", vazio) — nulo, e não
 * zero, porque zero é um preço válido e o engano sairia de graça.
 */
export function centavosDoTexto(texto: string): number | null {
  const semEspaco = texto.replace(/R\$/gi, "").replace(/\s+/g, "");
  const negativo = /^[-−]/.test(semEspaco);
  const limpo = negativo ? semEspaco.slice(1) : semEspaco;
  if (limpo === "") return null;

  const partes =
    FORMA_BRASILEIRA.exec(limpo) ?? FORMA_COM_PONTO.exec(limpo) ?? null;
  if (partes === null) return null;

  const inteiro = Number((partes[1] ?? "").replace(/\./g, ""));
  const fracao = Number((partes[2] ?? "").padEnd(2, "0"));
  const centavos = inteiro * 100 + fracao;
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo && centavos !== 0 ? -centavos : centavos;
}
