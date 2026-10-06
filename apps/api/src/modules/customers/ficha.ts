/**
 * A ficha do cliente como o dono a vê (AC-703, AC-705).
 *
 * É a PROJEÇÃO POR LOJA (`store_customers`), e só ela: nome, telefone, e-mail,
 * o endereço anotado e a observação. Senha, segundo fator e endereços salvos
 * da conta moram em `identities` e `customer_addresses`, fora do alcance do
 * dono — e nada aqui os lê.
 */
import type {
  EnderecoDaFichaNoContrato,
  FichaDoClienteNoContrato,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";

/** O que a consulta da ficha seleciona. */
export const SELECAO_DA_FICHA = {
  id: true,
  displayName: true,
  phoneE164: true,
  email: true,
  identityId: true,
  address: true,
  notes: true,
  createdAt: true,
} as const;

/** A linha da ficha, como o Prisma a devolve com a seleção acima. */
export interface LinhaDaFicha {
  readonly id: string;
  readonly displayName: string | null;
  readonly phoneE164: string | null;
  readonly email: string | null;
  readonly identityId: string | null;
  readonly address: unknown;
  readonly notes: string | null;
  readonly createdAt: Date;
}

/** Texto não vazio, ou nulo. */
function textoOuNulo(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

/**
 * Lê o endereço guardado em JSON sem confiar no formato.
 *
 * A coluna aceita qualquer JSON, e uma linha escrita por outro caminho não
 * pode derrubar a ficha: endereço sem logradouro é endereço nenhum.
 */
export function lerEnderecoDaFicha(
  bruto: unknown,
): EnderecoDaFichaNoContrato | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const campos = bruto as Record<string, unknown>;
  const logradouro = textoOuNulo(campos.logradouro);
  if (logradouro === null) return null;
  return {
    logradouro,
    numero: textoOuNulo(campos.numero),
    complemento: textoOuNulo(campos.complemento),
    bairro: textoOuNulo(campos.bairro),
    cidade: textoOuNulo(campos.cidade),
    estado: textoOuNulo(campos.estado),
    cep: textoOuNulo(campos.cep),
    pontoDeReferencia: textoOuNulo(campos.pontoDeReferencia),
  };
}

/** O endereço como vai para a coluna: sempre com todos os campos. */
export function enderecoParaGravar(
  endereco: EnderecoDaFichaNoContrato | null | undefined,
): EnderecoDaFichaNoContrato | null {
  if (endereco === null || endereco === undefined) return null;
  return lerEnderecoDaFicha(endereco);
}

/** A linha no vocabulário do contrato. */
export function fichaDaLinha(linha: LinhaDaFicha): FichaDoClienteNoContrato {
  return {
    id: linha.id,
    nome: linha.displayName ?? "Cliente sem nome",
    telefone: linha.phoneE164,
    email: linha.email,
    temConta: linha.identityId !== null,
    endereco: lerEnderecoDaFicha(linha.address),
    observacao: linha.notes,
    criadoEm: linha.createdAt.toISOString(),
  };
}

/**
 * A ficha de um cliente DESTA loja que não foi removido, ou nulo.
 *
 * Cliente de outra loja, removido ou inexistente são indistinguíveis daqui: o
 * isolamento por linha já esconde o de outra loja, e o filtro esconde o
 * removido. Quem chama transforma nulo em 404 (AC-702, AC-705).
 */
export async function lerFichaAtiva(
  clienteId: string,
): Promise<LinhaDaFicha | null> {
  const tx = transacaoAtual();
  return tx.storeCustomer.findFirst({
    where: { id: clienteId, removedAt: null, anonymizedAt: null },
    select: SELECAO_DA_FICHA,
  });
}
