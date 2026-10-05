/**
 * A lista de clientes da loja, com o que importa para atender (AC-700, AC-701).
 *
 * OS TOTAIS SÃO LIDOS DOS PEDIDOS, e não das colunas de contagem da ficha.
 * `orders_count` e `total_spent_cents` existem desde a 0005, mas nada as
 * mantém em dia — e um total que mente é pior do que total nenhum. Somar dos
 * pedidos na hora é o que faz o pedido manual de agora há pouco (AC-709)
 * aparecer no total sem ninguém lembrar de atualizar contador.
 *
 * O QUE CONTA: pedido cancelado não soma nem em quantidade nem em valor — é a
 * mesma régua do "o que é venda" do núcleo. A data do último pedido considera
 * qualquer pedido, porque a pergunta dela é "quando ele apareceu por último".
 *
 * A BUSCA (AC-701) casa por PARTE do nome, sem acento e sem maiúscula, ou por
 * PARTE do telefone, comparando a chave de dígitos (`phone_key`, 0035) — é o
 * que faz "(11) 98888" achar quem foi cadastrado como "+5511988887777".
 *
 * A LOJA NÃO É PARÂMETRO: vem do contexto da transação, e o isolamento por
 * linha é quem garante que a lista é só desta loja (AC-702). O filtro por loja
 * escrito abaixo é redundância deliberada — é ele que deixa o planejador usar o
 * índice por loja, e não segurança.
 */
import type { ClienteDaLojaNoContrato } from "@simpleclick/contracts";

import { exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";
import { pedacosDoTelefoneParaBusca } from "./telefone-do-cliente.ts";

/** Teto da lista: o bastante para o pequeno negócio, sem página infinita. */
export const LIMITE_DA_LISTA = 200;

interface LinhaDaLista {
  readonly id: string;
  readonly display_name: string | null;
  readonly phone_e164: string | null;
  readonly email: string | null;
  readonly tem_conta: boolean;
  readonly total_de_pedidos: bigint | number;
  readonly total_gasto: bigint | number;
  readonly ultimo_pedido: Date | null;
}

/** O termo da busca reduzido ao que o banco compara: sem acento é no banco. */
function termoDeNome(busca: string): string {
  return busca.trim().toLowerCase();
}

/** Escapa os curingas do LIKE: "50%" procura "50%", e não "50 e qualquer coisa". */
function semCuringa(texto: string): string {
  return texto.replace(/[\\%_]/g, (letra) => `\\${letra}`);
}

/**
 * Os parâmetros da busca, prontos para a consulta.
 *
 * A consulta é UMA SÓ, com os filtros ligados ou desligados por parâmetro, e
 * nunca montada colando texto: o termo é dado de quem digitou, e texto colado
 * em SQL é a porta que P-007 existe para fechar. Nulo desliga o pedaço.
 */
interface ParametrosDaBusca {
  readonly ligada: boolean;
  readonly nome: string | null;
  readonly telefone: string | null;
  readonly telefoneSemPais: string | null;
}

function parametrosDaBusca(busca: string | undefined): ParametrosDaBusca {
  const termo = busca?.trim() ?? "";
  if (termo === "") {
    return { ligada: false, nome: null, telefone: null, telefoneSemPais: null };
  }
  const [telefone, telefoneSemPais] = pedacosDoTelefoneParaBusca(termo);
  const comoPadrao = (pedaco: string | undefined): string | null =>
    pedaco === undefined ? null : `%${semCuringa(pedaco)}%`;
  return {
    ligada: true,
    nome: `%${semCuringa(termoDeNome(termo))}%`,
    telefone: comoPadrao(telefone),
    telefoneSemPais: comoPadrao(telefoneSemPais),
  };
}

/** Os clientes da loja do contexto, do que comprou por último para o mais antigo. */
export async function listarClientes(
  busca?: string,
): Promise<readonly ClienteDaLojaNoContrato[]> {
  const lojaId = exigirLojaDoContexto();
  const tx = transacaoAtual();
  const filtro = parametrosDaBusca(busca);

  const linhas = await tx.$queryRaw<LinhaDaLista[]>`
    SELECT c.id,
           c.display_name,
           c.phone_e164,
           c.email,
           (c.identity_id IS NOT NULL) AS tem_conta,
           count(o.id) FILTER (WHERE o.status <> 'CANCELLED') AS total_de_pedidos,
           coalesce(sum(o.total_cents) FILTER (WHERE o.status <> 'CANCELLED'), 0) AS total_gasto,
           max(o.placed_at) AS ultimo_pedido
      FROM app.store_customers c
      LEFT JOIN app.orders o
        ON o.store_customer_id = c.id
       AND o.store_id = c.store_id
     WHERE c.store_id = ${lojaId}::uuid
       AND c.removed_at IS NULL
       AND c.anonymized_at IS NULL
       AND (
             NOT ${filtro.ligada}::boolean
          OR app.sem_acento(lower(coalesce(c.display_name, ''))) LIKE app.sem_acento(${filtro.nome}::text)
          OR (${filtro.telefone}::text IS NOT NULL AND c.phone_key LIKE ${filtro.telefone}::text)
          OR (${filtro.telefoneSemPais}::text IS NOT NULL AND c.phone_key LIKE ${filtro.telefoneSemPais}::text)
       )
     GROUP BY c.id
     ORDER BY max(o.placed_at) DESC NULLS LAST, lower(c.display_name), c.id
     LIMIT ${LIMITE_DA_LISTA}`;

  return linhas.map((linha) => ({
    id: linha.id,
    nome: linha.display_name ?? "Cliente sem nome",
    telefone: linha.phone_e164,
    email: linha.email,
    temConta: linha.tem_conta,
    totalDePedidos: Number(linha.total_de_pedidos),
    totalGastoCentavos: Number(linha.total_gasto),
    ultimoPedidoEm: linha.ultimo_pedido?.toISOString() ?? null,
  }));
}
