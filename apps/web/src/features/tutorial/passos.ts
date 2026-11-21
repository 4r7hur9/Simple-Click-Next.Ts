/**
 * O conteúdo do tutorial de primeiro acesso (card #39), por papel.
 *
 * Cada passo é curto: um título, uma ou duas frases e, quando dá, o elemento
 * da tela que ele aponta. O alvo é uma LISTA de seletores: vale o primeiro que
 * estiver visível (no computador é o item do menu lateral; no celular, o
 * atalho da barra de baixo). Nenhum visível: o passo aparece no meio da tela,
 * sem destaque — o tutorial nunca trava por causa de um elemento que não está
 * ali.
 *
 * Os alvos são os endereços dos links que já existem no menu. A única marcação
 * própria é `data-tutorial="menu-do-painel"` no menu lateral: antes o tutorial
 * achava o menu por `data-tema`, que quebra se o tema do menu mudar.
 */
import { ETAPAS_DO_PEDIDO } from "@simpleclick/contracts";

export type PapelDoTutorial = "cliente" | "dono" | "equipe";

/** Uma demonstração animada do fluxo principal, dentro do cartão do passo. */
export interface Demonstracao {
  readonly titulo: string;
  readonly etapas: readonly string[];
}

export interface PassoDoTutorial {
  readonly id: string;
  readonly titulo: string;
  readonly texto: string;
  readonly alvos?: readonly string[];
  readonly demonstracao?: Demonstracao;
}

/** O evento que "Ver tutorial" dispara para abrir o tutorial de novo. */
export const EVENTO_VER_TUTORIAL = "sc:ver-tutorial";
/** O parâmetro de endereço que também abre o tutorial (o item do menu). */
export const PARAMETRO_VER_TUTORIAL = "tutorial";
/** O endereço do item "Ver tutorial" no menu do painel. */
export const ENDERECO_VER_TUTORIAL_DO_PAINEL = `/painel?${PARAMETRO_VER_TUTORIAL}=1`;

/** O item do menu lateral E o atalho do celular para o mesmo endereço. */
const link = (href: string): string => `a[href="${href}"]`;

const FLUXO_DO_PEDIDO: Demonstracao = {
  titulo: "O caminho de um pedido",
  etapas: ETAPAS_DO_PEDIDO.filter((etapa) => etapa.etapa !== "RETIRADA").map(
    (etapa) => etapa.rotulo,
  ),
};

const MENU_DO_PAINEL = ['aside[data-tutorial="menu-do-painel"]', 'nav[aria-label="Atalhos"]'];
const ONDE_REVER_NO_PAINEL = [link(ENDERECO_VER_TUTORIAL_DO_PAINEL), ...MENU_DO_PAINEL];

const PASSOS_DO_DONO: readonly PassoDoTutorial[] = [
  {
    id: "boas-vindas",
    titulo: "Bem-vindo ao painel da sua loja",
    texto:
      "Em um minuto você conhece o essencial. Se preferir explorar sozinho, toque em Pular.",
  },
  {
    id: "menu",
    titulo: "Tudo fica no menu",
    texto:
      "Operação, catálogo, a sua loja e a equipe, separados em seções. No celular, os atalhos ficam embaixo e o resto no botão Menu.",
    alvos: MENU_DO_PAINEL,
  },
  {
    id: "inicio",
    titulo: "Início: como a loja está indo",
    texto: "Vendas, pedidos e ticket médio do dia, comparados com antes.",
    alvos: [link("/painel")],
  },
  {
    id: "pedidos",
    titulo: "Pedidos em quadro",
    texto:
      "Cada pedido é um cartão que anda pelas colunas do dia. O número verde mostra quantos novos chegaram.",
    alvos: [link("/painel/pedidos")],
    demonstracao: FLUXO_DO_PEDIDO,
  },
  {
    id: "produtos",
    titulo: "Produtos e categorias",
    texto: "Cadastre o que você vende, com foto, preço e opções, e organize por categoria. Estoque, Variações e Opções e adicionais têm página própria logo abaixo.",
    alvos: [link("/painel/produtos"), link("/painel/categorias")],
  },
  {
    id: "aparencia",
    titulo: "A cara da sua loja",
    texto: "Em Aparência você escolhe cor, capa e descrição. Ver loja abre a vitrine como o cliente vê.",
    alvos: [link("/painel/aparencia")],
  },
  {
    id: "feed",
    titulo: "Feed",
    texto: "Escolha se a loja aparece em Explorar, o feed onde clientes de todo o SimpleClick descobrem lojas, e quais produtos entram nele.",
    alvos: [link("/painel/feed")],
  },
  {
    id: "equipe",
    titulo: "Sua equipe",
    texto: "Crie acessos para quem ajuda na loja. A equipe vê pedidos e catálogo, sem mexer nas configurações.",
    alvos: [link("/painel/equipe")],
  },
  {
    id: "rever",
    titulo: "Pronto para vender",
    texto: "Quando quiser rever este passo a passo, use Ver tutorial, na seção Conta do menu.",
    alvos: ONDE_REVER_NO_PAINEL,
  },
];

const PASSOS_DA_EQUIPE: readonly PassoDoTutorial[] = [
  {
    id: "boas-vindas",
    titulo: "Bem-vindo à equipe",
    texto: "Veja em poucos passos onde fica o seu trabalho. Se preferir, toque em Pular.",
  },
  {
    id: "menu",
    titulo: "O seu menu",
    texto: "Aqui ficam só as funções que a sua conta pode usar nesta loja.",
    alvos: MENU_DO_PAINEL,
  },
  {
    id: "pedidos",
    titulo: "Pedidos",
    texto:
      "Os pedidos do dia chegam em quadro. Abra o cartão para ver os itens e arraste para a próxima etapa.",
    alvos: [link("/painel/pedidos")],
    demonstracao: FLUXO_DO_PEDIDO,
  },
  {
    id: "novo-pedido",
    titulo: "Pedido pelo balcão ou telefone",
    texto: "Em Novo pedido você lança um pedido que chegou fora do site.",
    alvos: [link("/painel/pedidos/novo")],
  },
  {
    id: "produtos",
    titulo: "Produtos",
    texto: "Acabou um item? Pause ou ajuste o estoque por aqui.",
    alvos: [link("/painel/produtos")],
  },
  {
    id: "categorias",
    titulo: "Categorias",
    texto: "Organize a ordem em que os produtos aparecem no cardápio.",
    alvos: [link("/painel/categorias")],
  },
  {
    id: "rever",
    titulo: "Tudo certo",
    texto: "Para rever este passo a passo, use Ver tutorial, na seção Conta do menu.",
    alvos: ONDE_REVER_NO_PAINEL,
  },
];

const PASSOS_DO_CLIENTE: readonly PassoDoTutorial[] = [
  {
    id: "boas-vindas",
    titulo: "Que bom ter você aqui",
    texto: "Veja em quatro passos como pedir no SimpleClick. Se preferir, toque em Pular.",
    demonstracao: {
      titulo: "Do jeito mais curto",
      etapas: ["Explorar", "Favoritar", "Pedir", "Acompanhar"],
    },
  },
  {
    id: "explorar",
    titulo: "Explore lojas e produtos",
    texto: "Navegue pelas lojas da sua região e pelos produtos de cada uma, por categoria.",
    // O topo (computador) e a barra inferior (celular) marcam cada destino com
    // `data-navegacao`; o tutorial usa o que estiver visível.
    alvos: [
      '[data-navegacao="explorar"]',
      'a[href^="/explorar"]',
      '[aria-label="Categorias"]',
    ],
  },
  {
    id: "favoritar",
    titulo: "Favorite o que gostou",
    texto: "Toque no coração para guardar uma loja ou um produto e achar de novo depois.",
    alvos: [
      'button[aria-label*="avorit"]',
      '[data-navegacao="favoritos"]',
      'a[href="/conta/favoritos"]',
    ],
  },
  {
    id: "pedir",
    titulo: "Monte o pedido",
    texto:
      "Adicione itens à sacola e finalize: os seus dados e endereços já vêm da conta.",
    alvos: ["[data-sacola]", '[data-navegacao="sacola"]'],
  },
  {
    id: "acompanhar",
    titulo: "Acompanhe cada etapa",
    texto: "Em Meus pedidos você vê em que etapa o pedido está, do preparo à entrega.",
    alvos: ['[data-navegacao="pedidos"]', link("/conta/pedidos")],
    demonstracao: FLUXO_DO_PEDIDO,
  },
  {
    id: "rever",
    titulo: "É isso!",
    texto: "Para rever este passo a passo, abra o menu da conta e toque em Ver tutorial.",
    // Com o menu da conta aberto, o próprio "Ver tutorial"; fechado, o botão
    // do menu da conta no topo do cliente.
    alvos: ["[data-ver-tutorial]", "[data-menu-da-conta]"],
  },
];

export const PASSOS_DO_TUTORIAL: Readonly<Record<PapelDoTutorial, readonly PassoDoTutorial[]>> = {
  cliente: PASSOS_DO_CLIENTE,
  dono: PASSOS_DO_DONO,
  equipe: PASSOS_DA_EQUIPE,
};

/** O papel do painel (`OWNER`/`STAFF`) no tutorial; outro papel não tem. */
export function papelDoTutorialNoPainel(papel: string): PapelDoTutorial | null {
  if (papel === "OWNER") return "dono";
  if (papel === "STAFF") return "equipe";
  return null;
}

/** O seletor é só "o link para tal endereço"? */
const SO_LINK = /^a\[href="[^"]+"\]$/;

/**
 * Tira os passos que apontam só para itens de menu que não existem nesta
 * página — por exemplo, Aparência desligada pela administração. Passo sem
 * alvo, ou com algum alvo que não é link de menu, sempre fica.
 */
export function passosVisiveis(
  passos: readonly PassoDoTutorial[],
  existe: (seletor: string) => boolean,
): PassoDoTutorial[] {
  return passos.filter((passo) => {
    const alvos = passo.alvos ?? [];
    if (alvos.length === 0 || !alvos.every((alvo) => SO_LINK.test(alvo))) return true;
    return alvos.some(existe);
  });
}
