/**
 * A chave de repetição do fechamento e a tentativa que ficou pendente.
 *
 * A CHAVE É O QUE FAZ O SEGUNDO ENVIO REENCONTRAR O PRIMEIRO PEDIDO em vez de
 * criar outro (AC-516). Por isso ela precisa de duas coisas ao mesmo tempo:
 *
 * - NÃO SER ADIVINHÁVEL. O servidor a usa para devolver o pedido gravado, e o
 *   pedido traz nome, telefone e endereço. Uma chave previsível (hora mais um
 *   número aleatório fraco) seria uma senha de leitura fácil de chutar. Aqui é
 *   um UUID v4 do gerador seguro do navegador.
 * - SOBREVIVER ENQUANTO A RESPOSTA NÃO CHEGOU. Se a rede cai depois de o
 *   servidor já ter criado o pedido, a pessoa PRECISA repetir o envio com a
 *   mesma chave e o mesmo corpo para recuperar esse pedido. Uma chave nova
 *   aqui criaria um pedido em dobro de verdade.
 *
 * NUNCA VAI PARA STORAGE, ENDEREÇO DA PÁGINA, ATRIBUTO NEM REGISTRO. Ela mora
 * em memória, num objeto que a janela da sacola guarda enquanto a página está
 * aberta, e some com ela.
 */
import type {
  PedidoParaEnviar,
  ResultadoDoFechamento,
} from "../../lib/carrinho-do-navegador.ts";

/**
 * Um UUID v4, ou nulo quando o navegador não tem gerador seguro.
 *
 * SEM GERADOR SEGURO, NÃO HÁ CHAVE: cair em `Math.random` ou `Date.now`
 * traria de volta a chave previsível. Quem chama recusa o envio e explica.
 */
export function novaChaveDoFechamento(): string | null {
  const gerador = globalThis.crypto;
  if (gerador === undefined) return null;
  if (typeof gerador.randomUUID === "function") return gerador.randomUUID();
  if (typeof gerador.getRandomValues !== "function") return null;

  const bytes = gerador.getRandomValues(new Uint8Array(16));
  // Versão 4 e variante RFC 4122: sem esses bits a API (que valida UUID) recusa.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/**
 * O e-mail como se compara: sem espaços e em minúsculas. É o único jeito de
 * saber se é a mesma conta (`ContaDoComprador` não tem id), e só é guardado e
 * comparado em memória: nunca vira `key` do React nem sai em registro.
 */
export function contaNormalizada(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Um envio que ainda não teve resposta definitiva. */
export interface TentativaPendente {
  readonly chave: string;
  /** O que foi enviado: o reenvio leva EXATAMENTE isto, com a mesma chave. */
  readonly corpo: PedidoParaEnviar;
  /** A conta que enviou, normalizada. Outra conta nunca reaproveita a chave. */
  readonly conta: string;
  /** Enquanto o envio está no ar. */
  promessa: Promise<ResultadoDoFechamento> | null;
  /** O que chegou e ninguém viu (a janela fechou no meio). */
  desfecho: ResultadoDoFechamento | null;
}

/** Onde a janela da sacola guarda a tentativa, por loja (um por ilha). */
export interface ArquivoDeTentativas {
  ler(): TentativaPendente | null;
  guardar(tentativa: TentativaPendente): void;
  descartar(): void;
}

export function criarArquivoDeTentativas(): ArquivoDeTentativas {
  let atual: TentativaPendente | null = null;
  return {
    ler: () => atual,
    guardar: (tentativa) => {
      atual = tentativa;
    },
    descartar: () => {
      atual = null;
    },
  };
}
