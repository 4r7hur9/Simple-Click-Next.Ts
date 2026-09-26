/**
 * A chave PIX que o dono cadastra, conferida pelo tipo escolhido (AC-901).
 *
 * A CONFERÊNCIA É DE FORMATO, não de titularidade (ASM-900): nada aqui consulta
 * banco nenhum. O que ela impede é o erro de digitação que só apareceria no
 * primeiro cliente tentando pagar — um CPF com um dígito trocado, um telefone
 * sem DDD, um e-mail sem arroba. Chave errada é dinheiro que não chega.
 *
 * RECUSA EXPLICA O FORMATO ESPERADO, e nunca diz só "inválido". O dono escolheu
 * o tipo; a frase diz o que aquele tipo pede, com um exemplo.
 *
 * A CHAVE SAI NORMALIZADA: CPF e CNPJ só com dígitos, telefone com "+55",
 * e-mail e chave aleatória em minúsculas. É assim que o banco do cliente a
 * procura, e é assim que ela deve aparecer para quem copia.
 */
import { normalizarWhatsApp } from "./telefone.ts";

/** Os tipos de chave que o PIX conhece. */
export type TipoDaChavePix =
  "CPF" | "CNPJ" | "TELEFONE" | "EMAIL" | "ALEATORIA";

/** Chave aceita, no formato em que o banco do cliente a procura. */
export interface ChavePixAceita {
  readonly ok: true;
  readonly chave: string;
}

/** Chave recusada, com o formato que aquele tipo pede. */
export interface ChavePixRecusada {
  readonly ok: false;
  readonly formatoEsperado: string;
}

export type ResultadoDaChavePix = ChavePixAceita | ChavePixRecusada;

/** O que cada tipo pede, em uma frase com exemplo. */
export const FORMATO_DA_CHAVE_PIX: Readonly<Record<TipoDaChavePix, string>> = {
  CPF: "Chave do tipo CPF tem 11 dígitos, com ou sem pontos e traço — por exemplo 123.456.789-09 —, e precisa ser um CPF válido.",
  CNPJ: "Chave do tipo CNPJ tem 14 dígitos, com ou sem pontos, barra e traço — por exemplo 12.345.678/0001-95 —, e precisa ser um CNPJ válido.",
  TELEFONE:
    "Chave do tipo telefone é o celular com DDD, por exemplo (11) 91234-5678.",
  EMAIL:
    "Chave do tipo e-mail é um endereço completo, por exemplo loja@exemplo.com.br, com até 77 caracteres.",
  ALEATORIA:
    "Chave aleatória tem 32 letras e números em cinco grupos separados por traço, por exemplo 123e4567-e89b-12d3-a456-426614174000 — copie do aplicativo do seu banco.",
};

function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/** Tudo igual ("111.111.111-11") passa na conta do dígito e não é documento. */
function todosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

/** Dígito verificador pelo módulo 11, com os pesos informados. */
function digitoVerificador(base: string, pesos: readonly number[]): number {
  const soma = pesos.reduce(
    (total, peso, indice) => total + peso * Number(base[indice]),
    0,
  );
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CPF: 11 dígitos, dois verificadores pelo módulo 11. */
export function cpfValido(texto: string): boolean {
  const digitos = somenteDigitos(texto);
  if (digitos.length !== 11 || todosIguais(digitos)) return false;
  const primeiro = digitoVerificador(digitos, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(digitos, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === Number(digitos[9]) && segundo === Number(digitos[10]);
}

/** CNPJ: 14 dígitos, dois verificadores pelo módulo 11. */
export function cnpjValido(texto: string): boolean {
  const digitos = somenteDigitos(texto);
  if (digitos.length !== 14 || todosIguais(digitos)) return false;
  const primeiro = digitoVerificador(
    digitos,
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const segundo = digitoVerificador(
    digitos,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return primeiro === Number(digitos[12]) && segundo === Number(digitos[13]);
}

/** Só o que um documento pode ter além dos dígitos: ponto, traço, barra, espaço. */
const SO_PONTUACAO_DE_DOCUMENTO = /^[\d.\-/\s]+$/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALEATORIA =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function recusar(tipo: TipoDaChavePix): ChavePixRecusada {
  return { ok: false, formatoEsperado: FORMATO_DA_CHAVE_PIX[tipo] };
}

/**
 * Confere a chave pelo tipo escolhido e devolve a forma normalizada.
 *
 * Uma chave que seria válida em OUTRO tipo é recusada assim mesmo: CPF digitado
 * com o tipo "telefone" gera uma chave que não existe, e o cliente não paga.
 */
export function validarChavePix(
  tipo: TipoDaChavePix,
  chave: string,
): ResultadoDaChavePix {
  const limpa = chave.trim();

  switch (tipo) {
    case "CPF":
      return SO_PONTUACAO_DE_DOCUMENTO.test(limpa) && cpfValido(limpa)
        ? { ok: true, chave: somenteDigitos(limpa) }
        : recusar(tipo);
    case "CNPJ":
      return SO_PONTUACAO_DE_DOCUMENTO.test(limpa) && cnpjValido(limpa)
        ? { ok: true, chave: somenteDigitos(limpa) }
        : recusar(tipo);
    case "TELEFONE": {
      const numero = normalizarWhatsApp(limpa);
      return numero.ok && numero.tipo === "MOVEL"
        ? { ok: true, chave: `+${numero.e164}` }
        : recusar(tipo);
    }
    case "EMAIL":
      return EMAIL.test(limpa) && limpa.length <= 77
        ? { ok: true, chave: limpa.toLowerCase() }
        : recusar(tipo);
    case "ALEATORIA":
      return ALEATORIA.test(limpa)
        ? { ok: true, chave: limpa.toLowerCase() }
        : recusar(tipo);
  }
}
