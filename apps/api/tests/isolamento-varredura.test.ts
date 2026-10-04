/**
 * Isolamento provado em TODA tabela de loja, por varredura do catálogo
 * (AC-010, P-003).
 *
 * A T-006 já provou as quatro operações em três tabelas escolhidas à mão. O
 * problema que sobrou é de cobertura, e ele é silencioso: a tabela `orders`
 * nasce na fase seguinte, a `stock_movements` na outra, e a prova só continua
 * valendo enquanto alguém lembrar de escrever mais um teste. Ninguém lembra
 * para sempre, e o esquecimento não aparece em lugar nenhum — a suíte segue
 * verde com a tabela nova desprotegida.
 *
 * Por isso esta prova não escolhe tabela: ela PERGUNTA AO CATÁLOGO quais são as
 * tabelas de loja e cobra isolamento de cada uma. Tabela nova entra na prova no
 * dia em que a migração dela entra no repositório, sem ninguém fazer nada.
 *
 * O contrato é fechado nos dois lados:
 *
 * - a varredura precisa saber povoar cada tabela para poder testá-la. Quando
 *   encontra uma que não sabe, ela REPROVA pedindo o construtor. Pular seria
 *   voltar ao problema de origem, agora com aparência de rigor;
 * - a própria varredura é provada: uma tabela com identificador de loja e sem
 *   política é criada de propósito no fim do arquivo, e a varredura tem de
 *   acusá-la nas quatro operações. Varredura que nunca acusou nada não passa de
 *   um laço vazio bem escrito.
 *
 * Tudo passa por `apps/api/src/core/db.ts`, o caminho único da API até o banco
 * (P-004): é ele que abre a transação e grava o contexto da loja nela. Provar
 * por fora dele provaria o PostgreSQL, não o SimpleClick.
 */

import { createHash, randomUUID } from "node:crypto";

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  codigoDoPostgres,
  comandoDeInsercao,
  comoRequisicao,
  ESPERA_LONGA,
  exigirIdentificador,
  RECUSA_DE_PERMISSAO,
  type Registro,
  resumoDoErro,
} from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

// ---------------------------------------------------------------------------
// O que a varredura precisa saber sobre uma tabela
// ---------------------------------------------------------------------------

/**
 * Como povoar e como mirar uma linha de uma tabela de loja.
 *
 * É o "construtor" que a varredura cobra: sem ele não há como criar a linha da
 * loja B que a loja A vai tentar alcançar, e sem essa linha o teste não prova
 * nada — ele apenas não encontra nada, que é o resultado que um banco vazio
 * também daria.
 */
interface ConstrutorDeLinha {
  /** Coluna que mira uma linha só. */
  readonly chave: string;
  /** O que a tentativa de alteração tenta gravar na linha da outra loja. */
  readonly alteracao: {
    readonly coluna: string;
    readonly valor: string | number;
  };
  /** Colunas de uma linha que pertence à loja informada. */
  colunas(loja: string, marca: string): Registro;
}

/** Uma tabela de loja como o catálogo a descreve. */
interface TabelaDeLoja {
  readonly tabela: string;
  /** Coluna que diz de qual loja é a linha: `store_id`, ou `id` em `stores`. */
  readonly colunaDaLoja: string;
}

/** Uma tabela já com cenário montado, pronta para ser cobrada. */
interface AlvoDaVarredura extends TabelaDeLoja {
  readonly construtor: ConstrutorDeLinha;
  /** Chave da linha semeada da loja A — a que ela PODE alcançar. */
  readonly chaveDeA: string;
  /** Chave da linha semeada da loja B — a que ela NÃO pode alcançar. */
  readonly chaveDeB: string;
}

/** Uma falha de isolamento encontrada pela varredura. */
interface Violacao {
  readonly tabela: string;
  readonly operacao: "leitura" | "inserção" | "alteração" | "remoção";
  readonly problema: string;
}

/** Relato legível: a lista de violações vira o motivo da reprovação. */
function relatar(violacoes: readonly Violacao[]): string {
  if (violacoes.length === 0) return "nenhuma violação";
  return violacoes
    .map((v) => `app.${v.tabela} [${v.operacao}]: ${v.problema}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Os construtores
// ---------------------------------------------------------------------------

/**
 * Identidade usada pelas tabelas que exigem uma pessoa por chave estrangeira.
 * É uma só para todas as lojas: `(store_id, identity_id)` é único por loja, e
 * a mesma pessoa pode operar mais de uma loja — que é justamente o desenho.
 */
let identidadeDeApoio = "";

/**
 * Linhas de apoio criadas por loja, antes da semeadura.
 *
 * Existem porque `colunas()` é sincrônico de propósito — o construtor descreve
 * uma linha, não executa consulta. Tabela que depende de produto, categoria ou
 * pedido precisa que esses já existam na loja certa, e é isso que este mapa
 * guarda. Uma linha de apoio POR LOJA, porque uma compartilhada faria a loja A
 * apontar para dado da loja B e o teste passaria por acidente.
 */
interface ApoioDaLoja {
  produto: string;
  categoria: string;
  variante: string;
  grupoDeOpcao: string;
  itemDeOpcao: string;
  definicao: string;
  pedido: string;
  itemDePedido: string;
  carrinho: string;
}

const apoio: Record<string, ApoioDaLoja> = {};

/**
 * A linha de apoio daquela loja, ou falha dizendo qual falta.
 *
 * Devolver `undefined` aqui seria pior que falhar: a chave estrangeira entraria
 * nula, a linha seria criada mesmo assim e a prova de isolamento passaria sem
 * ter olhado para o vínculo que deveria testar.
 */
function exigirApoio(loja: string, campo: keyof ApoioDaLoja): string {
  const daPropriaLoja = apoio[loja]?.[campo];
  if (daPropriaLoja !== undefined && daPropriaLoja !== "") return daPropriaLoja;

  // A loja de destino das inserções fica sem dado de propósito, e o teste de
  // inserção monta uma linha para ela. Aqui o vínculo cai no da loja A — e isso
  // deixa a prova MAIS fiel, não menos: um atacante que tenta plantar na loja
  // vizinha usa os identificadores que ele tem, que são os dele. O que precisa
  // ser recusado é o `store_id`, e é isso que o teste mede.
  const emprestado = apoio[lojaA]?.[campo];
  if (emprestado !== undefined && emprestado !== "") return emprestado;

  throw new Error(
    `A linha de apoio \`${campo}\` não existe nem na loja ${loja} nem na loja A. ` +
      "Confira a ordem das camadas em CAMADAS: a tabela que depende dela precisa vir depois.",
  );
}

/**
 * O que a varredura sabe povoar. Tabela de loja que não estiver aqui reprova a
 * suíte pedindo o construtor — e é para isso que a lista existe.
 */
const CONSTRUTORES: Readonly<Record<string, ConstrutorDeLinha>> = {
  // A raiz do inquilino. A "loja da linha" é a própria linha, então semear a
  // loja A é criar a loja A: os identificadores nascem aqui.
  stores: {
    chave: "id",
    alteracao: { coluna: "name", valor: "Loja sequestrada" },
    colunas: (loja, marca) => ({
      id: loja,
      code: `cod-${marca}`,
      name: `Loja ${marca}`,
      slug: `loja-${marca}`,
      status: "ACTIVE",
      vertical_code: "FOOD_SNACK",
    }),
  },

  store_settings: {
    chave: "store_id",
    alteracao: { coluna: "schema_version", valor: 99 },
    colunas: (loja) => ({ store_id: loja }),
  },

  store_hours: {
    chave: "id",
    alteracao: { coluna: "sort_order", valor: 99 },
    colunas: (loja) => ({
      store_id: loja,
      weekday: 1,
      opens_at: "11:00",
      closes_at: "15:00",
    }),
  },

  store_hour_exceptions: {
    chave: "id",
    // A data é fixa e distante: exceção é única por (loja, dia), e uma data
    // calculada a partir de hoje faria duas execuções no mesmo dia colidirem.
    alteracao: { coluna: "reason", valor: "alterado pela varredura" },
    colunas: (loja) => ({
      store_id: loja,
      on_date: "2099-12-25",
    }),
  },

  store_domains: {
    chave: "id",
    alteracao: { coluna: "kind", valor: "LEGACY_SLUG" },
    colunas: (loja, marca) => ({
      store_id: loja,
      host: `${marca}.exemplo.test`,
      kind: "CUSTOM",
    }),
  },

  // O vínculo nasce ACEITO: desde a migração 0041 é ele que faz a identidade
  // de apoio ser dona da loja A — e é como dona da loja A que a varredura
  // tenta alcançar a loja B em todas as outras tabelas.
  store_members: {
    chave: "id",
    alteracao: { coluna: "role", valor: "STAFF" },
    colunas: (loja) => ({
      store_id: loja,
      identity_id: identidadeDeApoio,
      role: "OWNER",
      invite_accepted_at: "2026-01-01T00:00:00Z",
    }),
  },

  products: {
    chave: "id",
    alteracao: { coluna: "name", valor: "Produto sequestrado" },
    colunas: (loja, marca) => ({
      store_id: loja,
      name: `Produto ${marca}`,
      slug: `produto-${marca}`,
      vertical_code: "FOOD_SNACK",
      status: "PUBLISHED",
      // Dinheiro é inteiro em centavos, sempre (P-005).
      display_price_cents: 1990,
    }),
  },

  store_customers: {
    chave: "id",
    alteracao: { coluna: "display_name", valor: "Cliente sequestrado" },
    colunas: (loja, marca) => ({
      store_id: loja,
      display_name: `Cliente ${marca}`,
    }),
  },

  audit_log: {
    chave: "id",
    alteracao: { coluna: "action", valor: "ACAO_SEQUESTRADA" },
    colunas: (loja, marca) => ({
      store_id: loja,
      actor_role: "OWNER",
      action: "CRIACAO",
      entity: "teste",
      entity_id: marca,
    }),
  },

  // ── Catálogo (migração 0007) ─────────────────────────────────────────────

  assets: {
    chave: "id",
    // Trocar a chave de armazenamento da loja vizinha é o ataque útil aqui:
    // aponta a imagem dela para outro arquivo.
    alteracao: { coluna: "storage_key", valor: "sequestrado/arquivo.webp" },
    colunas: (loja, marca) => ({
      store_id: loja,
      kind: "PRODUCT_IMAGE",
      status: "READY",
      storage_key: `exemplo/${marca}/arquivo.webp`,
      mime_type: "image/webp",
    }),
  },

  categories: {
    chave: "id",
    alteracao: { coluna: "name", valor: "Categoria sequestrada" },
    colunas: (loja, marca) => ({
      store_id: loja,
      name: `Categoria ${marca}`,
      slug: `categoria-${marca}`,
    }),
  },

  product_categories: {
    chave: "id",
    alteracao: { coluna: "sort_order", valor: 99 },
    colunas: (loja) => ({
      store_id: loja,
      product_id: exigirApoio(loja, "produto"),
      category_id: exigirApoio(loja, "categoria"),
    }),
  },

  product_images: {
    chave: "id",
    alteracao: { coluna: "alt_text", valor: "Imagem sequestrada" },
    colunas: (loja, marca) => ({
      store_id: loja,
      product_id: exigirApoio(loja, "produto"),
      url: `https://exemplo.test/${marca}.jpg`,
      alt_text: `Imagem ${marca}`,
    }),
  },

  product_variants: {
    chave: "id",
    alteracao: { coluna: "name", valor: "Variante sequestrada" },
    colunas: (loja, marca) => ({
      store_id: loja,
      product_id: exigirApoio(loja, "produto"),
      name: `Variante ${marca}`,
      sku: `sku-${marca}`,
    }),
  },

  // O histórico de estoque da variante (T-307). Só entra e só se lê: a tabela
  // não concede alteração nem remoção a ninguém, e a varredura confirma que a
  // linha da outra loja também não aparece.
  stock_movements: {
    chave: "id",
    alteracao: { coluna: "reason", valor: "Movimento sequestrado" },
    colunas: (loja, marca) => ({
      store_id: loja,
      variant_id: exigirApoio(loja, "variante"),
      quantity_before: 5,
      quantity_delta: -1,
      quantity_after: 4,
      reason: `Contagem ${marca}`,
      origin: "MANUAL",
    }),
  },

  product_prices: {
    chave: "id",
    // Alterar preço da outra loja é o ataque mais direto que existe aqui: o
    // valor que o cliente vai pagar.
    alteracao: { coluna: "amount_cents", valor: 1 },
    colunas: (loja) => ({
      store_id: loja,
      product_id: exigirApoio(loja, "produto"),
      kind: "BASE",
      amount_cents: 1990,
    }),
  },

  option_groups: {
    chave: "id",
    alteracao: { coluna: "name", valor: "Grupo sequestrado" },
    colunas: (loja, marca) => ({
      store_id: loja,
      name: `Grupo ${marca}`,
      kind: "ADDON",
      min_select: 0,
    }),
  },

  option_items: {
    chave: "id",
    alteracao: { coluna: "price_delta_cents", valor: 9999 },
    colunas: (loja, marca) => ({
      store_id: loja,
      group_id: exigirApoio(loja, "grupoDeOpcao"),
      name: `Opção ${marca}`,
      price_delta_cents: 300,
    }),
  },

  product_option_groups: {
    chave: "id",
    alteracao: { coluna: "sort_order", valor: 99 },
    colunas: (loja) => ({
      store_id: loja,
      product_id: exigirApoio(loja, "produto"),
      group_id: exigirApoio(loja, "grupoDeOpcao"),
    }),
  },

  variant_option_values: {
    chave: "id",
    alteracao: {
      coluna: "option_item_id",
      valor: "00000000-0000-0000-0000-000000000000",
    },
    colunas: (loja) => ({
      store_id: loja,
      variant_id: exigirApoio(loja, "variante"),
      group_id: exigirApoio(loja, "grupoDeOpcao"),
      option_item_id: exigirApoio(loja, "itemDeOpcao"),
    }),
  },

  attribute_definitions: {
    chave: "id",
    alteracao: { coluna: "label", valor: "Especificação sequestrada" },
    colunas: (loja, marca) => ({
      store_id: loja,
      category_id: exigirApoio(loja, "categoria"),
      key: `chave_${marca}`,
      label: `Especificação ${marca}`,
      data_type: "TEXT",
    }),
  },

  product_attributes: {
    chave: "id",
    alteracao: { coluna: "value_text", valor: "valor sequestrado" },
    colunas: (loja, marca) => ({
      store_id: loja,
      product_id: exigirApoio(loja, "produto"),
      definition_id: exigirApoio(loja, "definicao"),
      value_text: `valor ${marca}`,
    }),
  },

  // ── Pedidos e carrinho (migração 0008) ───────────────────────────────────

  store_sequences: {
    chave: "store_id",
    alteracao: { coluna: "last_value", valor: 999 },
    colunas: (loja) => ({ store_id: loja, kind: "order", last_value: 10 }),
  },

  orders: {
    chave: "id",
    // O status é o que a loja vizinha mais teria interesse em mexer: marcar o
    // pedido do concorrente como cancelado.
    alteracao: { coluna: "status", valor: "CANCELLED" },
    colunas: (loja, marca) => ({
      store_id: loja,
      number: marca === "a" ? 101 : 201,
      code: `PED-${marca}`,
      // Token do tamanho real: é o endereço da página pública, e o teste de
      // enumeração depende de ele não ser adivinhável.
      public_token: `tok-${marca}-${"0".repeat(24)}${marca}`,
      status: "PENDING",
      channel: "ONLINE",
      fulfillment: "DELIVERY",
      items_total_cents: 1990,
      total_cents: 1990,
    }),
  },

  order_contacts: {
    chave: "order_id",
    alteracao: { coluna: "name", valor: "Cliente sequestrado" },
    colunas: (loja, marca) => ({
      order_id: exigirApoio(loja, "pedido"),
      store_id: loja,
      name: `Cliente ${marca}`,
      phone_e164: marca === "a" ? "+5585900000001" : "+5585900000002",
    }),
  },

  order_items: {
    chave: "id",
    alteracao: { coluna: "unit_price_cents", valor: 1 },
    colunas: (loja, marca) => ({
      store_id: loja,
      order_id: exigirApoio(loja, "pedido"),
      // Nome COPIADO, não lido do produto: é o que faz o pedido sobreviver ao
      // produto ser renomeado ou apagado.
      product_name: `Produto ${marca}`,
      quantity: 1,
      unit_price_cents: 1990,
      line_total_cents: 1990,
    }),
  },

  order_item_options: {
    chave: "id",
    alteracao: { coluna: "option_name_snapshot", valor: "Opção sequestrada" },
    colunas: (loja, marca) => ({
      store_id: loja,
      order_item_id: exigirApoio(loja, "itemDePedido"),
      group_name_snapshot: `Grupo ${marca}`,
      option_name_snapshot: `Opção ${marca}`,
      price_delta_cents: 300,
    }),
  },

  order_status_history: {
    chave: "id",
    alteracao: { coluna: "to_status", valor: "CANCELLED" },
    colunas: (loja) => ({
      store_id: loja,
      order_id: exigirApoio(loja, "pedido"),
      to_status: "PENDING",
    }),
  },

  carts: {
    chave: "id",
    alteracao: { coluna: "channel", valor: "MANUAL" },
    colunas: (loja, marca) => ({
      store_id: loja,
      session_token: `sessao-${marca}`,
      channel: "ONLINE",
    }),
  },

  cart_items: {
    chave: "id",
    alteracao: { coluna: "quantity", valor: 99 },
    colunas: (loja) => ({
      store_id: loja,
      cart_id: exigirApoio(loja, "carrinho"),
      product_id: exigirApoio(loja, "produto"),
      quantity: 1,
    }),
  },

  // ── Impressão (migração 0034) ────────────────────────────────────────────

  print_agents: {
    chave: "id",
    // Renomear o agente da loja vizinha é o ataque visível; o sério seria
    // revogá-lo, e a mesma política barra os dois.
    alteracao: { coluna: "name", valor: "Agente sequestrado" },
    colunas: (loja, marca) => ({
      store_id: loja,
      name: `Caixa ${marca}`,
      // Só o resumo da credencial é guardado; um por agente, em todo o banco.
      token_sha256: `\\x${createHash("sha256").update(`agente-${marca}`).digest("hex")}`,
    }),
  },

  print_jobs: {
    chave: "id",
    // Cancelar o cupom da loja vizinha é o ataque útil: a cozinha dela não
    // recebe o pedido.
    alteracao: { coluna: "status", valor: "CANCELED" },
    colunas: (loja, marca) => ({
      store_id: loja,
      order_id: exigirApoio(loja, "pedido"),
      order_code: `PED-${marca}`,
    }),
  },
};

// ---------------------------------------------------------------------------
// A varredura do catálogo
// ---------------------------------------------------------------------------

/**
 * Pergunta ao catálogo do PostgreSQL quais são as tabelas de loja.
 *
 * A regra é a mesma da guarda estrutural G1, e é assim de propósito: se as duas
 * discordassem, existiria tabela que uma cobra e a outra não. Tabela de loja é
 * a que tem `store_id` — e também `stores`, cuja coluna de inquilino é a
 * própria chave primária. Uma varredura que procurasse só pelo nome da coluna
 * deixaria de fora justamente a raiz de tudo.
 */
async function descobrirTabelasDeLoja(
  migrador: pg.Client,
): Promise<TabelaDeLoja[]> {
  const achadas = await migrador.query(`
    SELECT c.relname AS tabela,
           CASE WHEN EXISTS (SELECT 1 FROM pg_attribute a
                              WHERE a.attrelid = c.oid
                                AND a.attname = 'store_id'
                                AND a.attnum > 0
                                AND NOT a.attisdropped)
                THEN 'store_id' ELSE 'id' END AS coluna_da_loja
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app'
       AND c.relkind = 'r'
       AND ( c.relname = 'stores'
          OR EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = c.oid
                        AND a.attname = 'store_id'
                        AND a.attnum > 0
                        AND NOT a.attisdropped) )
     ORDER BY c.relname`);

  return achadas.rows.map((linha) => ({
    tabela: exigirIdentificador(String(linha.tabela)),
    colunaDaLoja: exigirIdentificador(String(linha.coluna_da_loja)),
  }));
}

/** Tabelas descobertas que ninguém ensinou a varredura a povoar. */
function tabelasSemConstrutor(
  descobertas: readonly TabelaDeLoja[],
): readonly string[] {
  return descobertas
    .map(({ tabela }) => tabela)
    .filter((tabela) => CONSTRUTORES[tabela] === undefined);
}

// ---------------------------------------------------------------------------
// Cenário: montado uma vez e reaproveitado entre as tabelas
// ---------------------------------------------------------------------------

/**
 * Três lojas, e cada uma com um papel:
 *
 * - `lojaA` é quem faz as tentativas — é dela o contexto da requisição;
 * - `lojaB` é a vítima: toda linha que a loja A tenta ler, alterar e remover é
 *   dela, e a linha precisa EXISTIR, senão "não encontrei" seria só ausência;
 * - `lojaSemDados` é o destino das tentativas de inserção. Existe porque a
 *   chave primária de `store_settings` é o próprio identificador da loja:
 *   plantar uma segunda configuração para a loja B esbarraria em chave
 *   duplicada, e uma escrita barrada por chave duplicada teria cara de proteção
 *   sem ser proteção nenhuma.
 */
const lojaA = randomUUID();
const lojaB = randomUUID();
const lojaSemDados = randomUUID();

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let descobertas: TabelaDeLoja[] = [];
const alvos: AlvoDaVarredura[] = [];

/** Insere, com a credencial de migração, uma linha da loja informada. */
async function semearLinha(pedido: {
  readonly tabela: string;
  readonly construtor: ConstrutorDeLinha;
  readonly loja: string;
  readonly marca: string;
}): Promise<string> {
  const { sql, valores } = comandoDeInsercao(
    pedido.tabela,
    pedido.construtor.colunas(pedido.loja, pedido.marca),
  );
  const chave = exigirIdentificador(pedido.construtor.chave);
  const gravada = await migrador.query(`${sql} RETURNING ${chave}`, valores);

  return String((gravada.rows[0] as Record<string, unknown>)[chave]);
}

/** A linha, do jeito que a credencial de migração a enxerga — ou `null`. */
async function linhaVistaPeloMigrador(
  alvo: AlvoDaVarredura,
): Promise<unknown | null> {
  const tabela = exigirIdentificador(alvo.tabela);
  const chave = exigirIdentificador(alvo.construtor.chave);
  const achada = await migrador.query(
    `SELECT to_jsonb(t) AS linha FROM app.${tabela} t WHERE t.${chave}::text = $1`,
    [alvo.chaveDeB],
  );

  return achada.rows.length === 0
    ? null
    : (achada.rows[0] as { linha: unknown }).linha;
}

// ---------------------------------------------------------------------------
// As quatro operações, cobradas tabela por tabela
// ---------------------------------------------------------------------------

/**
 * Leitura: a loja A não enxerga a linha da loja B por endereço direto nem em
 * listagem — e enxerga a própria, que é o que separa "isolado" de "cego".
 */
async function violacoesDeLeitura(alvo: AlvoDaVarredura): Promise<Violacao[]> {
  const tabela = exigirIdentificador(alvo.tabela);
  const chave = exigirIdentificador(alvo.construtor.chave);
  const loja = exigirIdentificador(alvo.colunaDaLoja);

  const [visto] = await comoRequisicao(
    acesso,
    { lojaId: lojaA, usuarioId: identidadeDeApoio, papel: "OWNER" },
    (tx) =>
      tx.$queryRawUnsafe<
        { direto: number; alheias: number; proprias: number }[]
      >(
        `SELECT (SELECT count(*)::int FROM app.${tabela} t WHERE t.${chave}::text = $1) AS direto,
                (SELECT count(*)::int FROM app.${tabela} t WHERE t.${loja}::text <> $2) AS alheias,
                (SELECT count(*)::int FROM app.${tabela} t WHERE t.${loja}::text  = $2) AS proprias`,
        alvo.chaveDeB,
        lojaA,
      ),
  );

  const violacoes: Violacao[] = [];
  const acusar = (problema: string) =>
    violacoes.push({ tabela: alvo.tabela, operacao: "leitura", problema });

  if ((visto?.direto ?? 0) !== 0) {
    acusar(
      `a linha ${alvo.chaveDeB}, que é da loja B, apareceu por endereço direto para a loja A`,
    );
  }
  if ((visto?.alheias ?? 0) !== 0) {
    acusar(
      `a listagem trouxe ${visto?.alheias} linha(s) de outra loja para a loja A`,
    );
  }
  // Sem este contraste, "não vejo nada" passaria como isolamento — e uma tabela
  // que ninguém enxerga não é uma tabela protegida, é uma tabela quebrada.
  if ((visto?.proprias ?? 0) !== 1) {
    acusar(
      `a loja A deveria enxergar exatamente a própria linha e enxergou ${visto?.proprias} — a prova ficaria vazia`,
    );
  }

  return violacoes;
}

/**
 * Inserção: plantar linha de outra loja é recusado, e recusado POR PERMISSÃO.
 * Falhar por chave duplicada ou por chave estrangeira seria acidente com cara
 * de proteção.
 */
async function violacoesDeInsercao(alvo: AlvoDaVarredura): Promise<Violacao[]> {
  const violacoes: Violacao[] = [];
  const acusar = (problema: string) =>
    violacoes.push({ tabela: alvo.tabela, operacao: "inserção", problema });

  // Em `stores` a loja da linha É a linha, então plantar linha de outra loja é
  // criar uma loja — identificador que ainda não existe em lugar nenhum.
  const lojaDaLinhaPlantada =
    alvo.colunaDaLoja === "id" ? randomUUID() : lojaSemDados;

  const { sql, valores } = comandoDeInsercao(
    alvo.tabela,
    alvo.construtor.colunas(lojaDaLinhaPlantada, `intrusa-${alvo.tabela}`),
  );

  try {
    const gravadas = await comoRequisicao(
      acesso,
      { lojaId: lojaA, usuarioId: identidadeDeApoio, papel: "OWNER" },
      (tx) => tx.$executeRawUnsafe(sql, ...valores),
    );
    acusar(
      `a loja A gravou ${gravadas} linha(s) para outra loja, e a gravação deveria ter sido recusada`,
    );
  } catch (erro) {
    const codigo = codigoDoPostgres(erro);
    if (codigo !== RECUSA_DE_PERMISSAO) {
      acusar(
        `a gravação falhou com ${codigo ?? "código desconhecido"}, e não com ${RECUSA_DE_PERMISSAO} (política ou privilégio): ${resumoDoErro(erro)}`,
      );
    }
  }

  // A transação foi desfeita, então nada pode ter sobrado.
  const plantadas = await migrador.query(
    `SELECT count(*)::int AS total FROM app.${exigirIdentificador(alvo.tabela)} t
      WHERE t.${exigirIdentificador(alvo.colunaDaLoja)}::text = $1`,
    [lojaDaLinhaPlantada],
  );
  const total = (plantadas.rows[0] as { total: number }).total;
  if (total !== 0) {
    acusar(`sobraram ${total} linha(s) plantadas pela loja A em outra loja`);
  }

  return violacoes;
}

/**
 * Alteração: atravessar loja devolve ZERO LINHAS SEM ERRO — ou é recusado por
 * privilégio. Nos dois casos a linha da loja B tem de sair intacta.
 */
async function violacoesDeAlteracao(
  alvo: AlvoDaVarredura,
): Promise<Violacao[]> {
  const tabela = exigirIdentificador(alvo.tabela);
  const chave = exigirIdentificador(alvo.construtor.chave);
  const coluna = exigirIdentificador(alvo.construtor.alteracao.coluna);

  const violacoes: Violacao[] = [];
  const acusar = (problema: string) =>
    violacoes.push({ tabela: alvo.tabela, operacao: "alteração", problema });

  const antes = await linhaVistaPeloMigrador(alvo);

  try {
    const alteradas = await comoRequisicao(
      acesso,
      { lojaId: lojaA, usuarioId: identidadeDeApoio, papel: "OWNER" },
      (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE app.${tabela} SET ${coluna} = $1 WHERE ${chave}::text = $2`,
          alvo.construtor.alteracao.valor,
          alvo.chaveDeB,
        ),
    );
    if (alteradas !== 0) {
      acusar(
        `a loja A alterou ${alteradas} linha(s) da loja B — a norma do repositório converte zero em "não encontrado", mas aqui não deu zero`,
      );
    }
  } catch (erro) {
    const codigo = codigoDoPostgres(erro);
    if (codigo !== RECUSA_DE_PERMISSAO) {
      acusar(
        `a alteração falhou com ${codigo ?? "código desconhecido"}, e não com zero linhas nem com ${RECUSA_DE_PERMISSAO}: ${resumoDoErro(erro)}`,
      );
    }
  }

  const depois = await linhaVistaPeloMigrador(alvo);
  if (depois === null) {
    acusar("a linha da loja B sumiu durante a tentativa de alteração");
  } else if (JSON.stringify(depois) !== JSON.stringify(antes)) {
    acusar(
      `a linha da loja B mudou: antes ${JSON.stringify(antes)}, depois ${JSON.stringify(depois)}`,
    );
  }

  return violacoes;
}

/** Remoção: mesma regra da alteração, e a linha da loja B continua lá. */
async function violacoesDeRemocao(alvo: AlvoDaVarredura): Promise<Violacao[]> {
  const tabela = exigirIdentificador(alvo.tabela);
  const chave = exigirIdentificador(alvo.construtor.chave);

  const violacoes: Violacao[] = [];
  const acusar = (problema: string) =>
    violacoes.push({ tabela: alvo.tabela, operacao: "remoção", problema });

  const antes = await linhaVistaPeloMigrador(alvo);

  try {
    const removidas = await comoRequisicao(
      acesso,
      { lojaId: lojaA, usuarioId: identidadeDeApoio, papel: "OWNER" },
      (tx) =>
        tx.$executeRawUnsafe(
          `DELETE FROM app.${tabela} WHERE ${chave}::text = $1`,
          alvo.chaveDeB,
        ),
    );
    if (removidas !== 0) {
      acusar(`a loja A apagou ${removidas} linha(s) da loja B`);
    }
  } catch (erro) {
    const codigo = codigoDoPostgres(erro);
    if (codigo !== RECUSA_DE_PERMISSAO) {
      acusar(
        `a remoção falhou com ${codigo ?? "código desconhecido"}, e não com zero linhas nem com ${RECUSA_DE_PERMISSAO}: ${resumoDoErro(erro)}`,
      );
    }
  }

  const depois = await linhaVistaPeloMigrador(alvo);
  if (depois === null) {
    acusar(
      "a linha da loja B deixou de existir depois da tentativa de remoção",
    );
  } else if (JSON.stringify(depois) !== JSON.stringify(antes)) {
    acusar(`a linha da loja B mudou durante a tentativa de remoção`);
  }

  return violacoes;
}

/** Roda uma operação em todas as tabelas e junta o que apareceu. */
async function varrer(
  operacao: (alvo: AlvoDaVarredura) => Promise<Violacao[]>,
): Promise<Violacao[]> {
  const encontradas: Violacao[] = [];
  for (const alvo of alvos) {
    encontradas.push(...(await operacao(alvo)));
  }
  return encontradas;
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();

  const identidade = await migrador.query(
    `INSERT INTO app.identities (email_norm, display_name)
     VALUES ('apoio.varredura@exemplo.test', 'Apoio da varredura') RETURNING id`,
  );
  identidadeDeApoio = String((identidade.rows[0] as { id: string }).id);

  descobertas = await descobrirTabelasDeLoja(migrador);

  // A ordem de semeadura É a ordem de dependência do banco, escrita à mão em
  // camadas. Ordenação automática por nome não serve: `cart_items` depende de
  // `carts` e de `products`, e nada no nome diz isso.
  //
  // Cada camada guarda em `apoio` a chave que acabou de semear, e a camada
  // seguinte a usa como pai. Assim existe exatamente UMA linha por tabela por
  // loja — a contagem importa, porque a prova de leitura exige que a loja A
  // enxergue a própria linha e só ela: com duas, "enxerguei uma" não
  // distinguiria isolamento de acidente.
  const CAMADAS: readonly (readonly string[])[] = [
    ["stores"],
    [
      "store_settings",
      "store_domains",
      "store_members",
      "store_customers",
      "products",
      "assets",
      "categories",
      "option_groups",
      "carts",
      "store_sequences",
      "store_hours",
      "store_hour_exceptions",
      "print_agents",
    ],
    [
      "orders",
      "product_variants",
      "option_items",
      "attribute_definitions",
      "product_images",
      "product_prices",
      "product_categories",
      "product_option_groups",
      "cart_items",
      "audit_log",
    ],
    [
      "order_contacts",
      "order_items",
      "order_status_history",
      "variant_option_values",
      "stock_movements",
      "product_attributes",
      "print_jobs",
    ],
    ["order_item_options"],
  ];

  const porNome = new Map(descobertas.map((d) => [d.tabela, d]));
  const naOrdem: TabelaDeLoja[] = [];
  for (const camada of CAMADAS) {
    for (const nome of camada) {
      const d = porNome.get(nome);
      if (d !== undefined) {
        naOrdem.push(d);
        porNome.delete(nome);
      }
    }
  }
  // Tabela descoberta que não está em nenhuma camada entra no fim: quem cobra
  // por ela é o primeiro teste, que reprova pedindo o construtor.
  naOrdem.push(...porNome.values());

  const guardarApoio = (loja: string, tabela: string, chave: string): void => {
    const atual = apoio[loja] ?? ({} as ApoioDaLoja);
    const campo: Partial<Record<string, keyof ApoioDaLoja>> = {
      products: "produto",
      categories: "categoria",
      product_variants: "variante",
      option_groups: "grupoDeOpcao",
      option_items: "itemDeOpcao",
      attribute_definitions: "definicao",
      orders: "pedido",
      order_items: "itemDePedido",
      carts: "carrinho",
    };
    const nome = campo[tabela];
    if (nome !== undefined) atual[nome] = chave;
    apoio[loja] = atual;
  };

  for (const descoberta of naOrdem) {
    const construtor = CONSTRUTORES[descoberta.tabela];
    // Tabela sem construtor não é semeada: quem cobra por ela é o primeiro
    // teste, que reprova nomeando-a. Semear às cegas seria adivinhar.
    if (construtor === undefined) continue;

    const semear = (loja: string, marca: string) =>
      semearLinha({ tabela: descoberta.tabela, construtor, loja, marca });

    const chaveDeA = await semear(lojaA, "a");
    guardarApoio(lojaA, descoberta.tabela, chaveDeA);
    const chaveDeB = await semear(lojaB, "b");
    guardarApoio(lojaB, descoberta.tabela, chaveDeB);

    // A loja de destino das inserções existe, mas fica vazia de propósito.
    if (descoberta.tabela === "stores") await semear(lojaSemDados, "sem-dados");

    alvos.push({ ...descoberta, construtor, chaveDeA, chaveDeB });
  }

  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
});

// ---------------------------------------------------------------------------
// AC-010 — a loja A não alcança a loja B em NENHUMA tabela
// ---------------------------------------------------------------------------

describe("varredura do catálogo por tabela de loja", () => {
  it("@spec:AC-010 @principle:P-003 toda tabela de loja do catálogo tem construtor na varredura", () => {
    // Anti-vacuidade: uma consulta de descoberta quebrada devolveria lista
    // vazia e todos os testes abaixo passariam sem olhar para nada.
    const nomes = descobertas.map(({ tabela }) => tabela);
    expect(nomes).toContain("stores");
    expect(nomes).toContain("products");
    expect(nomes.length).toBeGreaterThanOrEqual(7);

    // A cobrança: tabela de loja sem construtor reprova pedindo o construtor.
    expect(
      tabelasSemConstrutor(descobertas),
      [
        "Tabela de loja que a varredura não sabe povoar:",
        tabelasSemConstrutor(descobertas)
          .map((t) => `  app.${t}`)
          .join("\n"),
        "",
        "Acrescente o construtor dela em CONSTRUTORES neste arquivo (chave,",
        "coluna alterável e colunas mínimas respeitando as chaves estrangeiras).",
        "Tabela não coberta é exatamente o buraco que esta prova existe para fechar.",
      ].join("\n"),
    ).toEqual([]);

    // Toda tabela descoberta virou alvo: a semeadura não deixou nenhuma para
    // trás em silêncio. A ordem não importa — a cobertura importa.
    expect([...alvos.map(({ tabela }) => tabela)].sort()).toEqual(
      [...nomes].sort(),
    );
  });

  it(
    "@spec:AC-010 @principle:P-003 leitura: nenhuma tabela entrega linha da outra loja, e cada uma entrega a da própria",
    async () => {
      const violacoes = await varrer(violacoesDeLeitura);
      expect(violacoes, relatar(violacoes)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-010 @principle:P-003 inserção: nenhuma tabela aceita linha plantada em outra loja",
    async () => {
      const violacoes = await varrer(violacoesDeInsercao);
      expect(violacoes, relatar(violacoes)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-010 @principle:P-003 alteração: nenhuma tabela deixa alterar linha da outra loja",
    async () => {
      const violacoes = await varrer(violacoesDeAlteracao);
      expect(violacoes, relatar(violacoes)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-010 @principle:P-003 remoção: nenhuma tabela deixa apagar linha da outra loja",
    async () => {
      const violacoes = await varrer(violacoesDeRemocao);
      expect(violacoes, relatar(violacoes)).toEqual([]);
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// Sentinela — a varredura enxerga o vazamento
// ---------------------------------------------------------------------------

/**
 * Aqui o isolamento é QUEBRADO de propósito.
 *
 * Uma tabela de loja nasce sem política e com o isolamento desligado — é
 * exatamente o esquecimento que uma migração futura pode cometer. Se a
 * varredura não acusar isto, ela não estava provando nada nos testes acima: um
 * laço vazio também termina sem violação.
 */
describe("a varredura enxerga o vazamento", () => {
  const TABELA_VAZANDO = "vazamento_proposital";

  const construtorDoVazamento: ConstrutorDeLinha = {
    chave: "id",
    alteracao: { coluna: "rotulo", valor: "sequestrado" },
    colunas: (loja, marca) => ({ store_id: loja, rotulo: `linha ${marca}` }),
  };

  let alvoVazando: AlvoDaVarredura;

  beforeAll(async () => {
    // Criada como `sc_migrator` porque é assim que uma migração de verdade a
    // criaria — e é isso que faz `sc_app` receber os privilégios padrão do
    // esquema. Criada por outro papel, a tabela nasceria inalcançável e o
    // vazamento não aconteceria por motivo errado.
    await migrador.query("SET ROLE sc_migrator");
    await migrador.query(
      `CREATE TABLE app.${TABELA_VAZANDO} (
         id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         store_id uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
         rotulo   text NOT NULL
       )`,
    );
    // O gatilho de evento da migração 0001 liga o isolamento em toda tabela
    // nova. Desligar aqui é o que reproduz o esquecimento que a varredura
    // precisa pegar.
    await migrador.query(
      `ALTER TABLE app.${TABELA_VAZANDO} DISABLE ROW LEVEL SECURITY`,
    );
    await migrador.query(
      `ALTER TABLE app.${TABELA_VAZANDO} NO FORCE ROW LEVEL SECURITY`,
    );
    await migrador.query("RESET ROLE");

    const chaveDeA = await semearLinha({
      tabela: TABELA_VAZANDO,
      construtor: construtorDoVazamento,
      loja: lojaA,
      marca: "a",
    });
    const chaveDeB = await semearLinha({
      tabela: TABELA_VAZANDO,
      construtor: construtorDoVazamento,
      loja: lojaB,
      marca: "b",
    });

    alvoVazando = {
      tabela: TABELA_VAZANDO,
      colunaDaLoja: "store_id",
      construtor: construtorDoVazamento,
      chaveDeA,
      chaveDeB,
    };
  }, ESPERA_LONGA);

  afterAll(async () => {
    await migrador.query("SET ROLE sc_migrator");
    await migrador.query(`DROP TABLE IF EXISTS app.${TABELA_VAZANDO}`);
    await migrador.query("RESET ROLE");
  });

  it(
    "@spec:AC-010 @principle:P-003 acusa a tabela nova que ninguém ensinou a varredura a povoar",
    async () => {
      // A tabela apareceu no catálogo sozinha, sem ninguém acrescentá-la a
      // lista nenhuma — é essa a propriedade que faz a prova sobreviver às
      // migrações futuras.
      const agora = await descobrirTabelasDeLoja(migrador);
      expect(agora.map(({ tabela }) => tabela)).toContain(TABELA_VAZANDO);
      expect(tabelasSemConstrutor(agora)).toEqual([TABELA_VAZANDO]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-010 @principle:P-003 acusa as quatro operações na tabela de loja sem política de isolamento",
    async () => {
      const porOperacao = {
        leitura: await violacoesDeLeitura(alvoVazando),
        inserção: await violacoesDeInsercao(alvoVazando),
        alteração: await violacoesDeAlteracao(alvoVazando),
        remoção: await violacoesDeRemocao(alvoVazando),
      };

      for (const [operacao, violacoes] of Object.entries(porOperacao)) {
        expect(
          violacoes.length,
          `a varredura NÃO acusou ${operacao} numa tabela de loja sem política — ela não está provando nada`,
        ).toBeGreaterThan(0);
      }

      // O vazamento é o que se espera dele: a loja A leu a linha da loja B.
      expect(relatar(porOperacao.leitura)).toMatch(/endereço direto/);
      expect(relatar(porOperacao.remoção)).toMatch(/apagou/);
    },
    ESPERA_LONGA,
  );
});
