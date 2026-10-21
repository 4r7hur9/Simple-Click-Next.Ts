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

/** Como a lista pode ser ordenada. `recentes` (quem comprou por último) é o padrão. */
export const ORDENS_DOS_CLIENTES = [
  "recentes",
  "antigos",
  "nome",
  "nome-desc",
  "gasto",
  "pedidos",
  "cadastro",
] as const;
export type OrdemDosClientes = (typeof ORDENS_DOS_CLIENTES)[number];

/**
 * A consulta da lista. Tudo é opcional e o que faltar liga o comportamento de
 * sempre (os 200 que compraram por último), para os chamadores antigos.
 */
export interface ConsultaDeClientes {
  readonly busca?: string | undefined;
  /** Só quem já pediu (`com`) ou só quem nunca pediu (`sem`). */
  readonly pedidos?: "com" | "sem" | undefined;
  /** `recentes`: cadastrados nos últimos 30 dias. */
  readonly cadastro?: "recentes" | undefined;
  /** Já comprou, mas não compra há mais de N dias. */
  readonly inativosDias?: number | undefined;
  /** `importados`: vieram de planilha. */
  readonly origem?: "importados" | undefined;
  readonly ordem?: OrdemDosClientes | undefined;
  /** Com `pagina`, a lista é paginada e a resposta traz o total. */
  readonly pagina?: number | undefined;
  readonly porPagina?: number | undefined;
}

export const POR_PAGINA_DOS_CLIENTES = 50;
export const POR_PAGINA_MAXIMA_DOS_CLIENTES = 100;
export const DIAS_DO_CADASTRO_RECENTE = 30;

// Cada ordem é um trecho fixo (nunca texto de quem pediu). O nome ordena sem
// acento e sem caixa: "Íris" fica entre "Iara" e "Jair", e não depois do Z.
// O `lower` vem DEPOIS de tirar o acento: o banco roda com LC_CTYPE=C e não
// põe "Í" em minúscula, então tirar o acento antes deixaria um "I" maiúsculo.
const ORDEM_SQL: Readonly<Record<OrdemDosClientes, string>> = {
  recentes: "ultimo_pedido DESC NULLS LAST, chave_nome, id",
  antigos: "ultimo_pedido ASC NULLS LAST, chave_nome, id",
  nome: "chave_nome ASC, id",
  "nome-desc": "chave_nome DESC, id",
  gasto: "total_gasto DESC, chave_nome, id",
  pedidos: "total_de_pedidos DESC, chave_nome, id",
  cadastro: "criado_em DESC, id",
};

export interface PaginaDeClientes {
  readonly clientes: readonly ClienteDaLojaNoContrato[];
  /** Quantos casam com a consulta (todos, e não só os desta página). */
  readonly total: number;
  /** Quantos clientes a loja tem, sem filtro nenhum. */
  readonly todos: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly totalDePaginas: number;
}

/** Os clientes da loja do contexto, na ordem pedida (padrão: quem comprou por último). */
export async function listarClientes(
  consulta: ConsultaDeClientes = {},
): Promise<PaginaDeClientes> {
  const lojaId = exigirLojaDoContexto();
  const tx = transacaoAtual();
  const filtro = parametrosDaBusca(consulta.busca);
  const paginada = consulta.pagina !== undefined;
  const porPagina = paginada
    ? Math.min(
        consulta.porPagina ?? POR_PAGINA_DOS_CLIENTES,
        POR_PAGINA_MAXIMA_DOS_CLIENTES,
      )
    : LIMITE_DA_LISTA;
  const pagina = consulta.pagina ?? 1;
  const ordem = ORDEM_SQL[consulta.ordem ?? "recentes"];

  const linhas = await tx.$queryRawUnsafe<(LinhaDaLista & { total: bigint })[]>(
    `WITH base AS (
       SELECT c.id,
              c.display_name,
              lower(app.sem_acento(coalesce(c.display_name, ''))) AS chave_nome,
              c.phone_e164,
              c.email,
              c.created_at AS criado_em,
              (c.identity_id IS NOT NULL) AS tem_conta,
              count(o.id) FILTER (WHERE o.status <> 'CANCELLED') AS total_de_pedidos,
              coalesce(sum(o.total_cents) FILTER (WHERE o.status <> 'CANCELLED'), 0) AS total_gasto,
              max(o.placed_at) AS ultimo_pedido
         FROM app.store_customers c
         LEFT JOIN app.orders o
           ON o.store_customer_id = c.id
          AND o.store_id = c.store_id
        WHERE c.store_id = $1::uuid
          AND c.removed_at IS NULL
          AND c.anonymized_at IS NULL
          AND ($7::text IS NULL OR c.origin = $7::text)
          AND ($8::boolean IS NOT TRUE OR c.created_at >= now() - ($9::int * interval '1 day'))
          AND (
                NOT $2::boolean
             OR lower(app.sem_acento(coalesce(c.display_name, ''))) LIKE lower(app.sem_acento($3::text))
             OR lower(app.sem_acento(coalesce(c.email, ''))) LIKE lower(app.sem_acento($3::text))
             OR ($4::text IS NOT NULL AND c.phone_key LIKE $4::text)
             OR ($5::text IS NOT NULL AND c.phone_key LIKE $5::text)
          )
        GROUP BY c.id)
     SELECT base.*, count(*) OVER () AS total
       FROM base
      WHERE ($6::text IS NULL
             OR ($6 = 'com' AND total_de_pedidos > 0)
             OR ($6 = 'sem' AND total_de_pedidos = 0))
        AND ($10::int IS NULL
             OR (total_de_pedidos > 0 AND ultimo_pedido < now() - ($10::int * interval '1 day')))
      ORDER BY ${ordem}
      LIMIT $11 OFFSET $12`,
    lojaId,
    filtro.ligada,
    filtro.nome,
    filtro.telefone,
    filtro.telefoneSemPais,
    consulta.pedidos ?? null,
    consulta.origem === "importados" ? "IMPORT" : null,
    consulta.cadastro === "recentes",
    DIAS_DO_CADASTRO_RECENTE,
    consulta.inativosDias ?? null,
    porPagina,
    (pagina - 1) * porPagina,
  );

  let total = Number(linhas[0]?.total ?? 0);
  if (linhas.length === 0 && pagina > 1) {
    // Página depois do fim (a lista encolheu): o total vem sem a página.
    const contagem = await listarClientes({ ...consulta, pagina: 1, porPagina: 1 });
    total = contagem.total;
  }
  const [daLoja] = await tx.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total
      FROM app.store_customers c
     WHERE c.store_id = ${lojaId}::uuid
       AND c.removed_at IS NULL AND c.anonymized_at IS NULL`;

  return {
    clientes: linhas.map((linha) => ({
      id: linha.id,
      nome: linha.display_name ?? "Cliente sem nome",
      telefone: linha.phone_e164,
      email: linha.email,
      temConta: linha.tem_conta,
      totalDePedidos: Number(linha.total_de_pedidos),
      totalGastoCentavos: Number(linha.total_gasto),
      ultimoPedidoEm: linha.ultimo_pedido?.toISOString() ?? null,
    })),
    total,
    todos: Number(daLoja?.total ?? 0),
    pagina,
    porPagina,
    totalDePaginas: Math.max(1, Math.ceil(total / porPagina)),
  };
}
