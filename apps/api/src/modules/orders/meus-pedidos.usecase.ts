/**
 * Os pedidos da conta do cliente, em todas as lojas onde ele comprou (AC-616).
 *
 * O link público (T-603) serve a quem tem o link. Este caminho serve a quem
 * tem a CONTA: o cliente logado enxerga o histórico dele sem guardar mensagem
 * nenhuma do WhatsApp — e enxerga o de todas as lojas de uma vez, porque a
 * conta é uma só na plataforma (ASM-104).
 *
 * As políticas de `app.orders` são por loja, e a restritiva exige loja no
 * contexto. Nenhuma consulta comum alcança pedidos de duas lojas — e é assim
 * que deve ser. O caminho dedicado é a função `app.meus_pedidos()` (migração
 * 0029): corre com os direitos de quem a definiu e fecha o escopo sozinha, no
 * papel CUSTOMER e na identidade do contexto. O dono da loja A não a chama com
 * proveito, e a loja B continua sem existir para a loja A (P-003).
 *
 * O vínculo que torna tudo isso possível nasce no fechamento: quando o pedido é
 * feito por cliente logado, ele é ligado ao cliente-da-loja daquela identidade
 * (`vincularClienteDaLoja`). Pedido como convidado continua sem vínculo, e por
 * isso sem histórico — que é o combinado da ASM-103.
 */
import { exigirContexto, exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";

/** Identificador de identidade: o que `app.identities.id` guarda. */
const FORMATO_DE_IDENTIDADE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Um pedido como a conta o lista: o resumo, com a loja onde foi feito. */
export interface PedidoDaConta {
  readonly id: string;
  readonly loja: {
    /** Interno: a rota nunca o devolve ao cliente. */
    readonly id: string;
    readonly nome: string;
    readonly apelido: string;
  };
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  readonly entrega: string;
  readonly totalCentavos: number;
  readonly quantidadeDeItens: number;
  readonly criadoEm: string;
  readonly atualizadoEm: string;
  /** O endereço público do pedido, para o detalhe reaproveitar o caminho do link. */
  readonly tokenPublico: string;
}

/** A linha como `app.meus_pedidos()` a devolve. */
export interface LinhaDeMeusPedidos {
  readonly order_id: string;
  readonly store_id: string;
  readonly store_name: string;
  readonly store_slug: string;
  readonly number: bigint | number;
  readonly code: string;
  readonly status: string;
  readonly fulfillment: string;
  readonly total_cents: bigint | number;
  readonly placed_at: Date;
  readonly updated_at: Date;
  readonly public_token: string;
  readonly items_count: bigint | number;
}

/** O cliente logado do contexto, ou recusa: este caminho é SÓ dele. */
export function exigirClienteDaConta(): { readonly identidadeId: string } {
  const contexto = exigirContexto();
  if (
    contexto.papel !== "CUSTOMER" ||
    contexto.usuarioId === undefined ||
    !FORMATO_DE_IDENTIDADE.test(contexto.usuarioId)
  ) {
    throw erroDeDominio("sem_permissao", { recurso: "conta" });
  }
  return { identidadeId: contexto.usuarioId };
}

/** Traduz a linha do banco para o vocabulário da API (inteiros em centavos, P-005). */
export function montarPedidoDaConta(linha: LinhaDeMeusPedidos): PedidoDaConta {
  return {
    id: linha.order_id,
    loja: {
      id: linha.store_id,
      nome: linha.store_name,
      apelido: linha.store_slug,
    },
    numero: Number(linha.number),
    codigo: linha.code,
    status: linha.status,
    entrega: linha.fulfillment,
    totalCentavos: Number(linha.total_cents),
    quantidadeDeItens: Number(linha.items_count),
    criadoEm: linha.placed_at.toISOString(),
    atualizadoEm: linha.updated_at.toISOString(),
    tokenPublico: linha.public_token,
  };
}

/** Todos os pedidos do cliente logado, do mais novo para o mais antigo. */
export async function listarMeusPedidos(): Promise<readonly PedidoDaConta[]> {
  exigirClienteDaConta();
  const tx = transacaoAtual();
  const linhas = await tx.$queryRaw<LinhaDeMeusPedidos[]>`
    SELECT * FROM app.meus_pedidos()
  `;
  return linhas.map(montarPedidoDaConta);
}

/** Um pedido do cliente logado, ou nulo — inclusive quando é de outra pessoa. */
export async function localizarMeuPedido(
  pedidoId: string,
): Promise<PedidoDaConta | null> {
  exigirClienteDaConta();
  const tx = transacaoAtual();
  const linhas = await tx.$queryRaw<LinhaDeMeusPedidos[]>`
    SELECT * FROM app.meus_pedidos(${pedidoId}::uuid)
  `;
  const linha = linhas[0];
  return linha === undefined ? null : montarPedidoDaConta(linha);
}

/** O que o vínculo guarda na ficha da loja: só o que o dono precisa para entregar. */
export interface ContatoParaVincular {
  readonly nome: string;
  readonly telefoneE164: string;
}

/**
 * O cliente-da-loja da identidade do contexto, criado na primeira compra.
 *
 * Roda com loja E identidade no contexto, no papel CUSTOMER: é o que a
 * política `sc_self_insert` de `app.store_customers` exige (migração 0005) —
 * só a si mesmo, e só na loja corrente. Duas compras ao mesmo tempo disputam a
 * mesma linha, e a chave única por (loja, identidade) resolve: a segunda não
 * insere e lê a que a primeira criou.
 */
export async function vincularClienteDaLoja(
  contato: ContatoParaVincular,
): Promise<string> {
  const lojaId = exigirLojaDoContexto();
  const { identidadeId } = exigirClienteDaConta();
  const tx = transacaoAtual();

  const inseridos = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO app.store_customers (store_id, identity_id, display_name, phone_e164)
    VALUES (${lojaId}::uuid, ${identidadeId}::uuid, ${contato.nome}, ${contato.telefoneE164})
    ON CONFLICT (store_id, identity_id) WHERE identity_id IS NOT NULL DO NOTHING
    RETURNING id
  `;
  const inserido = inseridos[0];
  if (inserido !== undefined) return inserido.id;

  const existentes = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM app.store_customers
     WHERE store_id = ${lojaId}::uuid AND identity_id = ${identidadeId}::uuid
  `;
  const existente = existentes[0];
  if (existente === undefined) {
    // Nem inseriu nem leu: a política recusou. Melhor saber do que gravar um
    // pedido "de conta" que a conta nunca vai enxergar.
    throw erroDeDominio("sem_permissao", { recurso: "cliente_da_loja" });
  }
  return existente.id;
}
