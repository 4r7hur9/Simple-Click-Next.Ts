/**
 * O cadastro manual do cliente pelo dono (AC-703, AC-704, AC-706).
 *
 * O MÍNIMO É NOME E TELEFONE (ASM-700). O telefone é o identificador prático
 * do pequeno negócio: é por ele que o dono acha a pessoa que ligou. E-mail,
 * endereço e observação são opcionais, e o cliente nasce pronto para receber
 * pedido manual mesmo sem conta na plataforma.
 *
 * REPETIDO NÃO VIRA DUPLICATA. Antes de gravar, o cadastro procura, NESTA
 * loja, quem já tem o mesmo telefone (pela chave de dígitos) ou o mesmo
 * e-mail. Achando, ele NÃO grava e devolve quem é — para a tela oferecer abrir
 * o cadastro existente (AC-704). Quando o existente é alguém com conta na
 * plataforma que já comprou aqui, a resposta diz isso (AC-706): o e-mail de
 * quem tem conta mora na identidade, fora do alcance do dono, e é a função
 * `app.cliente_da_loja_pelo_email` (0035) que responde por ele sem expor nada.
 *
 * Cliente removido não conta como repetido: a ficha dele saiu das listagens, e
 * obrigar o dono a "restaurar" um cadastro que ele nem vê seria um beco.
 */
import type {
  ClienteExistenteNoContrato,
  esquemaDoClienteParaCadastrar,
  FichaDoClienteNoContrato,
} from "@simpleclick/contracts";
import type { z } from "zod";

import { exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";
import { enderecoParaGravar, fichaDaLinha, SELECAO_DA_FICHA } from "./ficha.ts";
import { normalizarTelefoneDoCliente } from "./telefone-do-cliente.ts";

/** O que o dono mandou, já validado pela borda. */
export type ClienteParaCadastrar = z.output<
  typeof esquemaDoClienteParaCadastrar
>;

/** O resultado: criado, repetido ou telefone que não fecha. */
export type ResultadoDoCadastro =
  | { readonly tipo: "criado"; readonly ficha: FichaDoClienteNoContrato }
  | {
      readonly tipo: "existente";
      readonly existente: ClienteExistenteNoContrato;
    }
  | { readonly tipo: "telefone_invalido"; readonly explicacao: string };

/** Uma linha candidata a repetido. */
interface Candidato {
  readonly id: string;
  readonly display_name: string | null;
  readonly identity_id: string | null;
}

function comoExistente(
  candidato: Candidato,
  motivo: "TELEFONE" | "EMAIL",
): ClienteExistenteNoContrato {
  return {
    erro: "cliente_existente",
    clienteId: candidato.id,
    nome: candidato.display_name ?? "Cliente sem nome",
    motivo,
    vinculo: candidato.identity_id === null ? "MANUAL" : "CONTA",
  };
}

/**
 * Procura, nesta loja, quem já tem este telefone ou este e-mail.
 *
 * O telefone vem primeiro porque é o identificador do pequeno negócio. O
 * cliente de conta aparece na frente do manual quando os dois batem: é o
 * vínculo que o dono NÃO pode duplicar (AC-706).
 *
 * `ignorar` é a própria ficha, na edição: mudar o nome não pode acusar o
 * cliente de repetir a si mesmo.
 */
export async function procurarRepetido(
  busca: {
    readonly chaveDoTelefone?: string | null;
    readonly email?: string | null;
  },
  ignorar: string | null = null,
): Promise<ClienteExistenteNoContrato | null> {
  const lojaId = exigirLojaDoContexto();
  const tx = transacaoAtual();

  if (busca.chaveDoTelefone) {
    const porTelefone = await tx.$queryRaw<Candidato[]>`
      SELECT id, display_name, identity_id
        FROM app.store_customers
       WHERE store_id = ${lojaId}::uuid
         AND phone_key = ${busca.chaveDoTelefone}
         AND removed_at IS NULL
         AND anonymized_at IS NULL
         AND (${ignorar}::uuid IS NULL OR id <> ${ignorar}::uuid)
       ORDER BY (identity_id IS NULL), created_at
       LIMIT 1`;
    const achado = porTelefone[0];
    if (achado !== undefined) return comoExistente(achado, "TELEFONE");
  }

  const email = busca.email?.trim().toLowerCase();
  if (email) {
    const porEmail = await tx.$queryRaw<Candidato[]>`
      SELECT id, display_name, identity_id
        FROM app.store_customers
       WHERE store_id = ${lojaId}::uuid
         AND (
               lower(btrim(email)) = ${email}
            OR id = app.cliente_da_loja_pelo_email(${email})
         )
         AND removed_at IS NULL
         AND anonymized_at IS NULL
         AND (${ignorar}::uuid IS NULL OR id <> ${ignorar}::uuid)
       ORDER BY (identity_id IS NULL), created_at
       LIMIT 1`;
    const achado = porEmail[0];
    if (achado !== undefined) return comoExistente(achado, "EMAIL");
  }

  return null;
}

/** Cadastra o cliente na loja do contexto, ou diz por que não. */
export async function cadastrarCliente(
  dados: ClienteParaCadastrar,
): Promise<ResultadoDoCadastro> {
  const lojaId = exigirLojaDoContexto();
  const telefone = normalizarTelefoneDoCliente(dados.telefone);
  if (!telefone.ok) {
    return { tipo: "telefone_invalido", explicacao: telefone.explicacao };
  }

  const email = dados.email?.trim().toLowerCase() || null;
  const repetido = await procurarRepetido({
    chaveDoTelefone: telefone.chave,
    email,
  });
  if (repetido !== null) return { tipo: "existente", existente: repetido };

  const tx = transacaoAtual();
  const endereco = enderecoParaGravar(dados.endereco);
  const criado = await tx.storeCustomer.create({
    data: {
      storeId: lojaId,
      displayName: dados.nome.trim(),
      phoneE164: telefone.e164,
      email,
      notes: dados.observacao?.trim() || null,
      ...(endereco === null ? {} : { address: endereco }),
    },
    select: SELECAO_DA_FICHA,
  });

  return { tipo: "criado", ficha: fichaDaLinha(criado) };
}
