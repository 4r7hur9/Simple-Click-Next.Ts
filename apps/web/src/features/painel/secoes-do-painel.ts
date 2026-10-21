/**
 * Quais itens o menu do painel tem, em quais seções, e quem pode ver cada um.
 *
 * É a ÚNICA lista do menu: o computador, a faixa de ícones do tablet e a
 * gaveta do celular desenham a mesma coisa. Cada item carrega a permissão que
 * a API exige para a rota dele (`lib/permissoes.ts`), então o papel decide o
 * que aparece sem nenhuma `if` espalhada: a equipe não vê o que a API
 * recusaria, e o dono vê tudo.
 *
 * Seção sem nenhum item visível some inteira (a equipe não tem "Equipe").
 */
import type { SecaoDoDono } from "@simpleclick/contracts";
import {
  IconeAjuda,
  IconeCartao,
  IconeCategoria,
  IconeClientes,
  IconeComentarios,
  IconeEntrega,
  IconeEquipe,
  IconeEstoque,
  IconeFeed,
  IconeImpressora,
  IconeInfo,
  IconeDashboard,
  IconeLoja,
  IconeOpcoes,
  IconePaleta,
  IconePedido,
  IconePedidoManual,
  IconeProduto,
  IconeRelogio,
  IconeStories,
  IconeConversa,
  IconeTrocar,
  IconeUsuario,
  IconeVariacoes,
  type Icone,
} from "@simpleclick/ui";
import type { ReactNode } from "react";

import { CAMINHO_DA_SECAO } from "../config/secoes.ts";
import { ENDERECO_VER_TUTORIAL_DO_PAINEL } from "../tutorial/passos.ts";
import { pode, type PermissaoDaLoja } from "../../lib/permissoes.ts";
import type { ItemDoMenu, SecaoDoMenu } from "./tipos-do-menu.ts";

/** Um item do menu junto do que decide se ele aparece. */
interface ItemComPermissao {
  readonly item: ItemDoMenu;
  /** A permissão que a API exige. `null`: qualquer pessoa do painel. */
  readonly permissao: PermissaoDaLoja | null;
  /** A seção de configurações que a administração pode desligar para a loja. */
  readonly secao: SecaoDoDono | undefined;
}

/** O item com a permissão que a API exige para a rota dele. */
function item(
  rotulo: string,
  href: string,
  icone: Icone,
  regras: {
    readonly permissao: PermissaoDaLoja | null;
    readonly secao?: SecaoDoDono;
  } & Partial<ItemDoMenu>,
): ItemComPermissao {
  const { permissao, secao, ...doItem } = regras;
  return { item: { rotulo, href, icone, ...doItem }, permissao, secao };
}

export interface EntradaDoMenuDoPainel {
  readonly apelidoDaLoja: string;
  readonly permissoes: ReadonlySet<PermissaoDaLoja>;
  readonly temOutrasLojas: boolean;
  /**
   * Seções de configuração que a administração desligou para esta loja
   * (hoje, a impressão automática). Vazio enquanto não se sabe.
   */
  readonly secoesDesligadas?: ReadonlySet<SecaoDoDono>;
  readonly pedidosNovos?: number;
  /** Comentários esperando a moderação (selo do item "Comentários"). */
  readonly comentariosPendentes?: number;
  /** Quem está logado, no começo da seção Conta. */
  readonly pessoa?: ReactNode;
  /** O botão Sair, no fim da seção Conta. */
  readonly sair?: ReactNode;
}

export function secoesDoPainel(entrada: EntradaDoMenuDoPainel): SecaoDoMenu[] {
  const { permissoes, pedidosNovos = 0, comentariosPendentes = 0 } = entrada;
  const desligadas = entrada.secoesDesligadas ?? new Set<SecaoDoDono>();

  const definicao: readonly {
    readonly titulo: string;
    readonly itens: readonly ItemComPermissao[];
    readonly antes?: ReactNode;
    readonly depois?: ReactNode;
  }[] = [
    {
      titulo: "Operação",
      itens: [
        item("Início", "/painel", IconeDashboard, {
          permissao: "metricas",
          exato: true,
        }),
        item("Pedidos", "/painel/pedidos", IconePedido, {
          permissao: "pedidos.operar",
          excluir: ["/painel/pedidos/novo"],
          contador: pedidosNovos,
        }),
        item("Novo pedido", "/painel/pedidos/novo", IconePedidoManual, {
          permissao: "pedidos.manual",
        }),
        item("Clientes", "/painel/clientes", IconeClientes, {
          permissao: "clientes",
        }),
        // Moderação dos comentários de Explorar (card #48).
        item("Comentários", "/painel/comentarios", IconeComentarios, {
          permissao: "moderar_comentarios",
          contador: comentariosPendentes,
        }),
      ],
    },
    {
      titulo: "Catálogo",
      itens: [
        item("Produtos", "/painel/produtos", IconeProduto, {
          permissao: "catalogo.produtos",
        }),
        item("Categorias", "/painel/categorias", IconeCategoria, {
          permissao: "catalogo.categorias",
        }),
        // Páginas próprias, nada escondido dentro do produto (card #52).
        item("Estoque", "/painel/estoque", IconeEstoque, {
          permissao: "catalogo.produtos",
        }),
        item("Variações", "/painel/variacoes", IconeVariacoes, {
          permissao: "catalogo.produtos",
        }),
        item("Opções e adicionais", "/painel/opcoes", IconeOpcoes, {
          permissao: "catalogo.produtos",
        }),
      ],
    },
    {
      titulo: "Minha loja",
      itens: [
        item(
          "Ver loja",
          `/loja/${encodeURIComponent(entrada.apelidoDaLoja)}`,
          IconeLoja,
          { permissao: "loja.ver", novaAba: true },
        ),
        item("Aparência", CAMINHO_DA_SECAO.aparencia, IconePaleta, {
          permissao: "personalizacao",
          secao: "aparencia",
        }),
        item("Feed", "/painel/feed", IconeFeed, { permissao: "feed" }),
        // Stories de 24h da loja (card #48): a API pede catalogo.produtos.
        item("Stories", "/painel/stories", IconeStories, {
          permissao: "catalogo.produtos",
        }),
        item("Contato", CAMINHO_DA_SECAO.contato, IconeConversa, {
          permissao: "configuracoes",
          secao: "contato",
        }),
        item("Entrega", CAMINHO_DA_SECAO.entrega, IconeEntrega, {
          permissao: "configuracoes",
          secao: "entrega",
        }),
        item("Horários", CAMINHO_DA_SECAO.horario, IconeRelogio, {
          permissao: "configuracoes",
          secao: "horario",
        }),
        item("Pagamento", CAMINHO_DA_SECAO.pagamento, IconeCartao, {
          permissao: "configuracoes",
          secao: "pagamento",
        }),
        item("Impressão", CAMINHO_DA_SECAO.impressao, IconeImpressora, {
          permissao: "configuracoes",
          secao: "impressao",
        }),
      ],
    },
    {
      titulo: "Equipe",
      itens: [
        item("Equipe e acessos", "/painel/equipe", IconeEquipe, {
          permissao: "equipe",
        }),
      ],
    },
    {
      titulo: "Conta",
      antes: entrada.pessoa,
      itens: [
        item("Minha conta", "/conta", IconeUsuario, { permissao: null }),
        ...(entrada.temOutrasLojas
          ? [
              item("Trocar de loja", "/escolher-loja", IconeTrocar, {
                permissao: null,
              }),
            ]
          : []),
        item("Ajuda", "/painel/ajuda", IconeAjuda, { permissao: null }),
        // Reabre o tutorial de primeiro acesso (card #39).
        item("Ver tutorial", ENDERECO_VER_TUTORIAL_DO_PAINEL, IconeInfo, {
          permissao: null,
        }),
      ],
      depois: entrada.sair,
    },
  ];

  return (
    definicao
      .map((secao) => ({
        titulo: secao.titulo,
        itens: secao.itens
          .filter(
            (candidato) =>
              pode(permissoes, candidato.permissao) &&
              (candidato.secao === undefined ||
                !desligadas.has(candidato.secao)),
          )
          .map((candidato) => candidato.item),
        antes: secao.antes,
        depois: secao.depois,
      }))
      // A seção Conta sempre fica (tem Sair); as outras somem sem itens.
      .filter((secao) => secao.itens.length > 0 || secao.titulo === "Conta")
      .map(({ antes, depois, ...resto }) => ({
        ...resto,
        ...(antes !== undefined ? { antes } : {}),
        ...(depois !== undefined ? { depois } : {}),
      }))
  );
}

/** Os endereços que viram atalho na barra de baixo do celular, em ordem. */
const ATALHOS_DO_CELULAR = [
  "/painel",
  "/painel/pedidos",
  "/painel/pedidos/novo",
  "/painel/produtos",
] as const;

/** Os atalhos que a pessoa pode usar, tirados das mesmas seções do menu. */
export function atalhosDoPainel(
  secoes: readonly SecaoDoMenu[],
): readonly ItemDoMenu[] {
  const todos = secoes.flatMap((secao) => secao.itens);
  return ATALHOS_DO_CELULAR.flatMap((href) => {
    const encontrado = todos.find((candidato) => candidato.href === href);
    return encontrado === undefined ? [] : [encontrado];
  });
}
