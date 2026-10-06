/**
 * O telefone do cliente da loja: como guardar e como comparar (AC-701, AC-704).
 *
 * DUAS FORMAS, DOIS PAPÉIS. O que se GUARDA é o número conferido, em E.164 com
 * o "+" da frente — é o que o botão do WhatsApp e o cupom sabem usar. O que se
 * COMPARA é a chave: só dígitos, sem o 55 do Brasil. O banco gera a mesma
 * chave numa coluna (`phone_key`, migração 0035) com a mesma regra desta
 * função, e é por ela que "(11) 98888-7777", "11988887777" e "+55 11
 * 98888-7777" são o mesmo cliente.
 *
 * A conferência do número é a do núcleo (`normalizarWhatsApp`): código de
 * área que existe, celular com nove dígitos, fixo com oito. Recusa dizendo o
 * que falta, e nunca um "telefone inválido" mudo.
 */
import { normalizarWhatsApp } from "@simpleclick/core";

/** O número aceito, pronto para gravar. */
export interface TelefoneAceito {
  readonly ok: true;
  /** E.164 com o "+": `+5511988887777`. */
  readonly e164: string;
  /** A chave de comparação, igual à coluna gerada `phone_key`. */
  readonly chave: string;
}

/** O número recusado, com a frase que a tela mostra ao dono. */
export interface TelefoneRecusado {
  readonly ok: false;
  readonly explicacao: string;
}

export type TelefoneDoCliente = TelefoneAceito | TelefoneRecusado;

/** Só os dígitos do que foi digitado. */
function somenteDigitos(entrada: string): string {
  return entrada.replace(/[^0-9]/g, "");
}

/**
 * A chave de comparação, com a MESMA regra de `app.chave_de_telefone` (0035).
 *
 * Doze ou treze dígitos começando por 55 são o Brasil na frente (DDD de dois
 * dígitos mais oito ou nove do assinante): o 55 sai. Qualquer outra forma fica
 * como está. Duas implementações da mesma regra só são aceitáveis porque a
 * prova contra o banco compara as duas.
 */
export function chaveDoTelefone(entrada: string): string {
  const digitos = somenteDigitos(entrada);
  if (
    (digitos.length === 12 || digitos.length === 13) &&
    digitos.startsWith("55")
  ) {
    return digitos.slice(2);
  }
  return digitos;
}

/** Confere o número que o dono digitou e devolve a forma de gravar. */
export function normalizarTelefoneDoCliente(
  entrada: string,
): TelefoneDoCliente {
  if (entrada.trim() === "") {
    return {
      ok: false,
      explicacao: "Informe o telefone do cliente, com o código de área.",
    };
  }
  const conferido = normalizarWhatsApp(entrada);
  if (!conferido.ok) return { ok: false, explicacao: conferido.explicacao };
  const e164 = `+${conferido.e164}`;
  return { ok: true, e164, chave: chaveDoTelefone(e164) };
}

/**
 * Os pedaços de telefone que a BUSCA procura (AC-701).
 *
 * A busca é por PARTE do número, então não dá para exigir número completo. O
 * que se procura é a sequência de dígitos que o dono digitou, em qualquer
 * posição da chave — e, quando ele começou pelo 55 do país, também a mesma
 * sequência sem ele, porque a chave não guarda o 55. Menos de três dígitos não
 * é busca por telefone: "1" acharia metade da lista.
 */
export function pedacosDoTelefoneParaBusca(termo: string): readonly string[] {
  const digitos = somenteDigitos(termo);
  if (digitos.length < 3) return [];
  const pedacos = new Set([digitos]);
  if (digitos.startsWith("55") && digitos.length > 4) {
    pedacos.add(digitos.slice(2));
  }
  return [...pedacos];
}
