/**
 * A matriz de permissões da loja (card #25).
 *
 * UM LUGAR SÓ para dizer o que cada papel faz na loja: a API confere cada rota
 * do painel contra esta matriz, `GET /v1/eu` devolve as permissões efetivas de
 * cada loja da conta e o site esconde do menu o que a pessoa não pode usar.
 *
 * Os papéis na loja são os do vínculo (`store_members.role`):
 *
 * - `OWNER` (dono): tudo.
 * - `STAFF` (equipe/operador): catálogo, pedidos, clientes, pedido manual,
 *   métricas e moderação dos comentários. NÃO mexe nas configurações da loja, na equipe, no feed nem na
 *   personalização.
 *
 * A administração da plataforma não é papel de loja: ela fala por outra
 * credencial e tem as permissões de `PERMISSOES_DA_PLATAFORMA`.
 */

import { z } from "zod";

/** Tudo o que se pode fazer dentro de uma loja. */
export const PERMISSOES_DA_LOJA = [
  /** Ver a loja: situação, funcionalidades, uso e limites. */
  "loja.ver",
  /** Criar, editar, ordenar, ocultar e apagar categorias. */
  "catalogo.categorias",
  /** Produtos e tudo dentro deles: preços, variações, estoque, imagens, opções e especificações. */
  "catalogo.produtos",
  /** O quadro de pedidos: ver, mudar etapa, imprimir o cupom. */
  "pedidos.operar",
  /** Lançar pedido no balcão e repetir pedido. */
  "pedidos.manual",
  /** Clientes da loja: lista, detalhe, histórico com a loja, cadastro e edição. */
  "clientes",
  /** Painel de métricas e exportação. */
  "metricas",
  /** Configurações da loja: contato, entrega, pagamento, horários, impressão, aparência. */
  "configuracoes",
  /** Equipe: cadastrar, desativar, remover e trocar a senha de quem a loja cadastrou. */
  "equipe",
  /** Feed: aparecer ou não, publicação automática e a marca "publicar no feed" do produto. */
  "feed",
  /** Personalização da vitrine: cor de destaque, fundo da vitrine e topo do cardápio. */
  "personalizacao",
  /**
   * Comentários dos clientes (card #47): ver a fila, aprovar, recusar, apagar,
   * bloquear quem comenta. Ligar a aprovação automática é `configuracoes`.
   */
  "moderar_comentarios",
] as const;

export type PermissaoDaLoja = (typeof PERMISSOES_DA_LOJA)[number];

export const esquemaDaPermissaoDaLoja = z.enum(PERMISSOES_DA_LOJA);

/** Os papéis de um vínculo com a loja. */
export const PAPEIS_NA_LOJA = ["OWNER", "STAFF"] as const;

export type PapelNaLoja = (typeof PAPEIS_NA_LOJA)[number];

export const esquemaDoPapelNaLoja = z.enum(PAPEIS_NA_LOJA);

/** O que a equipe (STAFF) pode. O dono pode tudo. */
const DA_EQUIPE: readonly PermissaoDaLoja[] = Object.freeze([
  "loja.ver",
  "catalogo.categorias",
  "catalogo.produtos",
  "pedidos.operar",
  "pedidos.manual",
  "clientes",
  "metricas",
  "moderar_comentarios",
]);

/** A matriz: papel → permissões, em ordem estável. */
export const MATRIZ_DE_PERMISSOES: Readonly<
  Record<PapelNaLoja, readonly PermissaoDaLoja[]>
> = Object.freeze({
  OWNER: Object.freeze([...PERMISSOES_DA_LOJA]),
  STAFF: DA_EQUIPE,
});

/** As permissões de um papel na loja. Papel desconhecido não tem nenhuma. */
export function permissoesDoPapel(papel: string): readonly PermissaoDaLoja[] {
  return papel === "OWNER" || papel === "STAFF"
    ? MATRIZ_DE_PERMISSOES[papel]
    : [];
}

/** O papel pode fazer isto na loja? */
export function podeNaLoja(papel: string, permissao: PermissaoDaLoja): boolean {
  return permissoesDoPapel(papel).includes(permissao);
}

/** Como cada permissão se chama na tela. */
export const ROTULOS_DAS_PERMISSOES: Readonly<Record<PermissaoDaLoja, string>> =
  Object.freeze({
    "loja.ver": "Ver a loja",
    "catalogo.categorias": "Categorias",
    "catalogo.produtos": "Produtos",
    "pedidos.operar": "Pedidos",
    "pedidos.manual": "Pedido manual",
    clientes: "Clientes",
    metricas: "Métricas",
    configuracoes: "Configurações da loja",
    equipe: "Equipe",
    feed: "Feed",
    personalizacao: "Personalização",
    moderar_comentarios: "Moderar comentários",
  });

/** O que a administração da plataforma pode (credencial própria). */
export const PERMISSOES_DA_PLATAFORMA = [
  /** Listar, cadastrar, editar, aprovar, recusar, ativar e desativar lojas. */
  "admin.lojas",
  /** Ajustar os limites da plataforma, de cada loja e de cada dono. */
  "admin.limites",
  /** Consultar a trilha de auditoria. */
  "admin.auditoria",
] as const;

export type PermissaoDaPlataforma = (typeof PERMISSOES_DA_PLATAFORMA)[number];

export const esquemaDaPermissaoDaPlataforma = z.enum(PERMISSOES_DA_PLATAFORMA);

/** A recusa de uma rota do painel para quem não tem a permissão (403). */
export const esquemaDaRecusaPorPermissao = z.strictObject({
  erro: z.literal("sem_permissao"),
  permissao: esquemaDaPermissaoDaLoja,
  mensagem: z.string(),
});

export const MENSAGEM_DE_SEM_PERMISSAO =
  "A sua função nesta loja não permite esta ação. Fale com o dono da loja.";
