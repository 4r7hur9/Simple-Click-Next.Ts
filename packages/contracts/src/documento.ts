/**
 * CPF e CNPJ conferidos pelo dígito verificador (AC-202).
 *
 * MORA NO CONTRATO, e não no módulo da administração, porque a mesma regra
 * precisa valer em dois lados: no formulário, que recusa o envio antes de
 * qualquer gravação, e na API, que recusa de novo porque o formulário é só uma
 * conveniência — quem chama a API direto não passa por ele. Duas cópias da
 * conta divergiriam no primeiro ajuste; uma só, compartilhada, não tem como.
 *
 * O documento é guardado só com dígitos. Máscara (pontos, barra, hífen) é
 * apresentação, e aceitar as duas formas na entrada evita recusar quem colou o
 * número do jeito que ele aparece no cartão do CNPJ.
 */

export type TipoDeDocumento = "CPF" | "CNPJ";

export type DocumentoConferido =
  | {
      readonly valido: true;
      readonly tipo: TipoDeDocumento;
      /** Só os dígitos, do jeito que o banco guarda. */
      readonly numero: string;
    }
  | { readonly valido: false; readonly motivo: string };

/** Mensagem única de recusa: o formulário mostra exatamente esta frase. */
export const MENSAGEM_DE_DOCUMENTO_INVALIDO =
  "CPF ou CNPJ inválido: confira os números digitados.";

/** Tira a máscara. Letras e outros símbolos continuam lá e reprovam depois. */
export function somenteDigitos(valor: string): string {
  return valor.replace(/[.\-/\s]/g, "");
}

/** Sequência de um dígito só (111.111.111-11) passa na conta e não existe. */
function repetido(digitos: string): boolean {
  return /^(\d)\1*$/.test(digitos);
}

/**
 * Dígito verificador pelo módulo 11, com os pesos informados.
 * Resto menor que 2 vira zero — é a regra da Receita para os dois documentos.
 */
function digitoVerificador(base: string, pesos: readonly number[]): number {
  let soma = 0;
  for (let indice = 0; indice < pesos.length; indice += 1) {
    soma += Number(base[indice]) * (pesos[indice] ?? 0);
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Confere os dois dígitos do CPF (pesos de 10 a 2, depois de 11 a 2). */
function cpfConfere(digitos: string): boolean {
  const primeiro = digitoVerificador(digitos, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(digitos, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(digitos[9]) === primeiro && Number(digitos[10]) === segundo;
}

/** Confere os dois dígitos do CNPJ, com os pesos da Receita. */
function cnpjConfere(digitos: string): boolean {
  const primeiro = digitoVerificador(
    digitos,
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const segundo = digitoVerificador(
    digitos,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return Number(digitos[12]) === primeiro && Number(digitos[13]) === segundo;
}

/**
 * Confere o documento e diz de que tipo ele é.
 *
 * O tipo sai do tamanho: 11 dígitos é CPF, 14 é CNPJ. Qualquer outro tamanho,
 * qualquer caractere que não seja dígito ou máscara, e qualquer sequência
 * repetida são recusados antes da conta.
 */
export function conferirDocumento(valor: string): DocumentoConferido {
  const digitos = somenteDigitos(valor.trim());
  const recusa = {
    valido: false,
    motivo: MENSAGEM_DE_DOCUMENTO_INVALIDO,
  } as const;

  if (!/^\d+$/.test(digitos) || repetido(digitos)) return recusa;
  if (digitos.length === 11) {
    return cpfConfere(digitos)
      ? { valido: true, tipo: "CPF", numero: digitos }
      : recusa;
  }
  if (digitos.length === 14) {
    return cnpjConfere(digitos)
      ? { valido: true, tipo: "CNPJ", numero: digitos }
      : recusa;
  }
  return recusa;
}
