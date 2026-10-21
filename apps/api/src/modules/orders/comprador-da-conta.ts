/**
 * Quem está comprando, quando o pedido exige conta logada.
 *
 * O pedido do site deixou de aceitar convidado: quem fecha é sempre uma conta.
 * Nome e e-mail vêm da CONTA, e não do corpo — a pessoa não digita de novo o
 * que já informou ao se cadastrar. O telefone também vem da conta; o corpo só
 * o traz quando a conta ainda não tem, e aí ele fica salvo nela.
 *
 * Na entrega, o endereço é um dos salvos da conta (`enderecoId`) ou um novo
 * (`endereco`, ou os campos soltos do `contato` antigo), que fica salvo na
 * conta para a próxima compra. O mesmo endereço digitado de novo não vira uma
 * segunda linha: reaproveita a que já existe.
 *
 * Roda no papel CLIENTE, com a identidade e SEM loja — é o que as políticas de
 * `identities` (só a própria) e de `customer_addresses` (0036) exigem.
 */
import {
  esquemaDoEnderecoParaSalvar,
  type EnderecoParaSalvarNoContrato,
  type EnderecoSalvoNoContrato,
} from "@simpleclick/contracts";

import { normalizarWhatsApp } from "@simpleclick/core";

import { transacaoAtual } from "../../core/db.ts";

/**
 * Os endereços salvos da conta. Moram no módulo `customers`, e quem junta é
 * `app.ts` (a tabela de fronteiras não deixa um módulo importar outro).
 */
export interface EnderecosDaConta {
  readonly listar: () => Promise<readonly EnderecoSalvoNoContrato[]>;
  readonly salvar: (
    dados: EnderecoParaSalvarNoContrato,
  ) => Promise<EnderecoSalvoNoContrato>;
}

/** Uma recusa que a pessoa resolve na tela: vira 422 com o código. */
export type CodigoDaRecusaDoComprador =
  | "conta_obrigatoria"
  | "telefone_obrigatorio"
  | "telefone_invalido"
  | "endereco_obrigatorio"
  | "endereco_nao_encontrado"
  | "endereco_invalido";

export class RecusaDoComprador extends Error {
  readonly codigo: CodigoDaRecusaDoComprador;

  constructor(codigo: CodigoDaRecusaDoComprador, mensagem: string) {
    super(mensagem);
    this.name = "RecusaDoComprador";
    this.codigo = codigo;
  }
}

/** O que o fechamento manda, na parte de quem compra. */
export interface PedidoDoComprador {
  readonly entrega: "DELIVERY" | "PICKUP";
  readonly telefone?: string | undefined;
  readonly enderecoId?: string | undefined;
  readonly endereco?: EnderecoParaSalvarNoContrato | undefined;
  readonly contato?:
    | {
        readonly nome: string;
        readonly telefone: string;
        readonly logradouro?: string | null | undefined;
        readonly numero?: string | null | undefined;
        readonly complemento?: string | null | undefined;
        readonly bairro?: string | null | undefined;
        readonly cidade?: string | null | undefined;
        readonly estado?: string | null | undefined;
        readonly cep?: string | null | undefined;
      }
    | undefined;
}

/** O contato do pedido, montado a partir da conta. */
export interface CompradorDaConta {
  readonly nome: string;
  readonly telefoneE164: string;
  readonly email: string;
  readonly logradouro: string | null;
  readonly numero: string | null;
  readonly complemento: string | null;
  readonly bairro: string | null;
  readonly cidade: string | null;
  readonly estado: string | null;
  readonly cep: string | null;
}

interface LinhaDaConta {
  readonly email_norm: string;
  readonly display_name: string | null;
  readonly phone_e164: string | null;
}

/** Texto comparável: sem espaço sobrando e sem diferença de caixa. */
function chave(valor: string | null | undefined): string {
  return (valor ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function mesmoEndereco(
  salvo: EnderecoSalvoNoContrato,
  novo: EnderecoParaSalvarNoContrato,
): boolean {
  return (
    chave(salvo.logradouro) === chave(novo.logradouro) &&
    chave(salvo.numero) === chave(novo.numero) &&
    chave(salvo.complemento) === chave(novo.complemento) &&
    chave(salvo.bairro) === chave(novo.bairro) &&
    chave(salvo.cep).replace(/\D/g, "") === chave(novo.cep).replace(/\D/g, "")
  );
}

/** O endereço novo do pedido: o campo `endereco`, ou os soltos do contato. */
function enderecoNovo(
  pedido: PedidoDoComprador,
): EnderecoParaSalvarNoContrato | null {
  if (pedido.endereco !== undefined) return pedido.endereco;
  const contato = pedido.contato;
  if (contato?.logradouro === undefined || contato.logradouro === null) {
    return null;
  }
  const lido = esquemaDoEnderecoParaSalvar.safeParse({
    logradouro: contato.logradouro,
    numero: contato.numero ?? null,
    complemento: contato.complemento ?? null,
    bairro: contato.bairro ?? null,
    cidade: contato.cidade ?? null,
    estado: contato.estado ?? null,
    cep: contato.cep ?? null,
  });
  if (!lido.success) {
    throw new RecusaDoComprador(
      "endereco_invalido",
      "Confira o endereço de entrega: informe pelo menos a rua.",
    );
  }
  return lido.data;
}

/** O endereço da entrega: salvo, ou novo (e então salvo na conta). */
async function enderecoDaEntrega(
  pedido: PedidoDoComprador,
  enderecos: EnderecosDaConta,
): Promise<EnderecoSalvoNoContrato> {
  const salvos = await enderecos.listar();
  if (pedido.enderecoId !== undefined) {
    const escolhido = salvos.find((e) => e.id === pedido.enderecoId);
    if (escolhido === undefined) {
      throw new RecusaDoComprador(
        "endereco_nao_encontrado",
        "Esse endereço não está mais na sua conta. Escolha outro.",
      );
    }
    return escolhido;
  }
  const novo = enderecoNovo(pedido);
  if (novo === null) {
    throw new RecusaDoComprador(
      "endereco_obrigatorio",
      "Escolha um endereço salvo ou informe um novo para a entrega.",
    );
  }
  return (
    salvos.find((salvo) => mesmoEndereco(salvo, novo)) ??
    (await enderecos.salvar(novo))
  );
}

/**
 * Os dados de quem compra, da conta do contexto. Grava o telefone na conta
 * quando ela não tinha, e o endereço novo na lista de endereços.
 */
export async function compradorDaConta(
  pedido: PedidoDoComprador,
  enderecos: EnderecosDaConta,
): Promise<CompradorDaConta> {
  const tx = transacaoAtual();
  const [conta] = await tx.$queryRaw<LinhaDaConta[]>`
    SELECT email_norm, display_name, phone_e164
      FROM app.identities
     WHERE id = app.current_user_id() AND anonymized_at IS NULL`;
  if (conta === undefined) {
    throw new RecusaDoComprador(
      "conta_obrigatoria",
      "Entre ou crie sua conta para fechar o pedido.",
    );
  }

  let telefoneE164 = conta.phone_e164;
  if (telefoneE164 === null || telefoneE164 === "") {
    const digitado = pedido.telefone ?? pedido.contato?.telefone;
    if (digitado === undefined || digitado.trim() === "") {
      throw new RecusaDoComprador(
        "telefone_obrigatorio",
        "Informe um telefone para a loja falar com você sobre o pedido.",
      );
    }
    const telefone = normalizarWhatsApp(digitado);
    if (!telefone.ok) {
      throw new RecusaDoComprador("telefone_invalido", telefone.explicacao);
    }
    telefoneE164 = `+${telefone.e164}`;
    await tx.$executeRaw`
      UPDATE app.identities SET phone_e164 = ${telefoneE164}
       WHERE id = app.current_user_id()`;
  }

  const nome =
    conta.display_name?.trim() ||
    pedido.contato?.nome.trim() ||
    conta.email_norm.split("@")[0] ||
    conta.email_norm;

  const endereco =
    pedido.entrega === "DELIVERY"
      ? await enderecoDaEntrega(pedido, enderecos)
      : null;

  return {
    nome,
    telefoneE164,
    email: conta.email_norm,
    logradouro: endereco?.logradouro ?? null,
    numero: endereco?.numero ?? null,
    complemento: endereco?.complemento ?? null,
    bairro: endereco?.bairro ?? null,
    cidade: endereco?.cidade ?? null,
    estado: endereco?.estado ?? null,
    cep: endereco?.cep ?? null,
  };
}
