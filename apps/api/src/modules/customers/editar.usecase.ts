/**
 * A correção da ficha do cliente (AC-705).
 *
 * MUDA A FICHA, NUNCA O PEDIDO. O pedido guarda cópia do contato do momento da
 * compra (`order_contacts`, P-010), e é essa cópia que o histórico, o cupom e
 * as métricas leem. Corrigir o telefone hoje não reescreve o que foi entregue
 * ontem — e é exatamente o que o critério pede.
 *
 * Só o que veio muda: campo ausente fica como está, e `null` apaga o opcional.
 * O telefone novo passa pela mesma conferência e pelo mesmo aviso de repetido
 * do cadastro, ignorando a própria ficha.
 */
import type {
  ClienteExistenteNoContrato,
  esquemaDoClienteParaEditar,
  FichaDoClienteNoContrato,
} from "@simpleclick/contracts";
import type { z } from "zod";

import { transacaoAtual } from "../../core/db.ts";
import { procurarRepetido } from "./cadastrar.usecase.ts";
import {
  enderecoParaGravar,
  fichaDaLinha,
  lerFichaAtiva,
  SELECAO_DA_FICHA,
} from "./ficha.ts";
import { normalizarTelefoneDoCliente } from "./telefone-do-cliente.ts";

export type ClienteParaEditar = z.output<typeof esquemaDoClienteParaEditar>;

export type ResultadoDaEdicao =
  | { readonly tipo: "editado"; readonly ficha: FichaDoClienteNoContrato }
  | { readonly tipo: "nao_encontrado" }
  | {
      readonly tipo: "existente";
      readonly existente: ClienteExistenteNoContrato;
    }
  | { readonly tipo: "telefone_invalido"; readonly explicacao: string };

/** Corrige a ficha de um cliente desta loja. */
export async function editarCliente(
  clienteId: string,
  dados: ClienteParaEditar,
): Promise<ResultadoDaEdicao> {
  const atual = await lerFichaAtiva(clienteId);
  if (atual === null) return { tipo: "nao_encontrado" };

  let telefoneE164: string | undefined;
  let chaveDoTelefone: string | null = null;
  if (dados.telefone !== undefined) {
    const telefone = normalizarTelefoneDoCliente(dados.telefone);
    if (!telefone.ok) {
      return { tipo: "telefone_invalido", explicacao: telefone.explicacao };
    }
    telefoneE164 = telefone.e164;
    chaveDoTelefone = telefone.chave;
  }

  const email =
    dados.email === undefined
      ? undefined
      : dados.email === null
        ? null
        : dados.email.trim().toLowerCase();

  const repetido = await procurarRepetido(
    { chaveDoTelefone, email: email ?? null },
    clienteId,
  );
  if (repetido !== null) return { tipo: "existente", existente: repetido };

  const endereco =
    dados.endereco === undefined
      ? undefined
      : enderecoParaGravar(dados.endereco);

  const tx = transacaoAtual();
  const editado = await tx.storeCustomer.update({
    where: { id: atual.id },
    data: {
      ...(dados.nome === undefined ? {} : { displayName: dados.nome.trim() }),
      ...(telefoneE164 === undefined ? {} : { phoneE164: telefoneE164 }),
      ...(email === undefined ? {} : { email }),
      ...(dados.observacao === undefined
        ? {}
        : { notes: dados.observacao?.trim() || null }),
      // `DbNull` seria o jeito do Prisma de gravar NULO em coluna JSON, e ele
      // mora no pacote do banco, que o módulo não alcança (P-004). Endereço
      // apagado vira objeto vazio, que a leitura trata como "sem endereço".
      ...(endereco === undefined ? {} : { address: endereco ?? {} }),
    },
    select: SELECAO_DA_FICHA,
  });

  return { tipo: "editado", ficha: fichaDaLinha(editado) };
}
