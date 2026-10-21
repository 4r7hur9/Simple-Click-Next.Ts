/**
 * O que a janela do fechamento precisa saber antes de abrir.
 *
 * VEM DE UMA AÇÃO DE SERVIDOR, pedida só quando a pessoa toca em "Fechar
 * pedido". Dois motivos. A resposta do fechamento traz a CHAVE PIX, que não
 * pode ir no HTML de quem só está olhando o cardápio (AC-904). E quem está
 * logado é lido com o token do cookie, que fica no servidor (P-008): o
 * navegador recebe só o nome, o e-mail, o telefone e os endereços da conta.
 *
 * A ação mora na rota (`app/(loja)/loja/[slug]/checkout/acoes.ts`), porque
 * `features/` não alcança `server/`; aqui ficam só os tipos que as duas pontas
 * dividem.
 */
import type { EnderecoSalvo } from "../../lib/enderecos-da-conta.ts";

/** O que a loja faz, decidido no servidor a partir da configuração dela. */
export interface FormasDaLoja {
  readonly aceitaEntrega: boolean;
  readonly aceitaRetirada: boolean;
  /** Mostrado na retirada, para a pessoa saber onde buscar. */
  readonly enderecoDaLoja?: string | null;
}

/** A chave PIX da loja, quando ela aceita PIX. */
export interface PixDaLoja {
  readonly chave: string;
  readonly tipo: string | null;
  readonly titular: string | null;
}

/** O que a loja cobra pela entrega. */
export interface EntregaDaLojaNaTela {
  readonly taxaCentavos: number | null;
  readonly nomeDaTaxa: string | null;
  readonly gratisAcimaDeCentavos: number | null;
  readonly minimoParaEntregaCentavos: number | null;
}

/** A configuração do fechamento da loja. */
export interface ConfigDoFechamento {
  readonly formas: FormasDaLoja;
  readonly formasDePagamento: readonly string[];
  readonly pix: PixDaLoja | null;
  readonly entrega: EntregaDaLojaNaTela;
}

/** Quem está pedindo: a conta logada. */
export interface ContaDoComprador {
  readonly nome: string;
  readonly email: string;
  /** Em E.164 (`+5585999998888`); nulo quando a conta ainda não tem. */
  readonly telefone: string | null;
}

export type PreparoDoFechamento =
  | {
      readonly estado: "pronto";
      readonly config: ConfigDoFechamento;
      /** Nula quando ninguém está logado: a janela pede para entrar. */
      readonly conta: ContaDoComprador | null;
      /** Os endereços salvos da conta, o padrão primeiro. */
      readonly enderecos: readonly EnderecoSalvo[];
    }
  | { readonly estado: "indisponivel" };

/** A ação já presa ao apelido da loja. */
export type PrepararFechamento = () => Promise<PreparoDoFechamento>;

/**
 * O telefone da conta como se lê: `+5585999998888` vira `(85) 99999-8888`.
 * Número de fora do Brasil, ou num formato que não se reconhece, sai como veio.
 */
export function telefoneParaLer(e164: string): string {
  const digitos = e164.replace(/\D/g, "");
  const nacional =
    digitos.startsWith("55") && digitos.length >= 12
      ? digitos.slice(2)
      : digitos;
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return e164;
}
