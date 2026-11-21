/**
 * As regras puras da navegação do cliente (card #105): qual item está ativo,
 * quais itens cada pessoa vê e para onde cada um leva.
 *
 * Sem React e sem navegador, para o topo, a barra inferior e os testes
 * dividirem a MESMA tabela. A interface não autoriza nada: quem decide
 * acesso continua sendo o servidor e a API, e o papel chega aqui só da
 * sessão lida no servidor.
 */
import type { AbaDaConta } from "../../lib/abas-da-conta.ts";
import { comDestino } from "../../lib/destino-seguro.ts";
import type { UsuarioDaBarra } from "../../lib/quem-esta-logado.ts";
import {
  enderecoDaVitrine,
  enderecoDoFeed,
  lerConsulta,
  type AbaDoFeed,
  type ParametrosDaPagina,
} from "../feed/consulta.ts";

/**
 * Os destinos da navegação. A barra inferior do celular tem cinco (sem
 * "produtos", que mora dentro do Explorar); as abas do topo, cinco também
 * (sem "perfil", que é o avatar). Card #152.
 */
export type IdDoItemPrincipal =
  "explorar" | "lojas" | "produtos" | "favoritos" | "pedidos" | "perfil";

export interface ItemDaNavegacao {
  readonly id: IdDoItemPrincipal;
  readonly rotulo: string;
  readonly href: string;
  /**
   * `data-abre-acesso`: visitante dentro da loja, o clique abre a janela de
   * acesso sem sair dela. `data-abre-conta`: o "Perfil" de quem tem sessão
   * abre o modal "Minha conta" (card #151).
   */
  readonly atributos?:
    | { readonly "data-abre-acesso": "entrar" }
    | { readonly "data-abre-conta": AbaDaConta }
    | undefined;
  /** É a página atual (um só item por rota). */
  readonly ativo: boolean;
}

const ROTULOS: Readonly<Record<IdDoItemPrincipal, string>> = {
  explorar: "Explorar",
  lojas: "Lojas",
  produtos: "Produtos",
  favoritos: "Favoritos",
  pedidos: "Pedidos",
  perfil: "Perfil",
};

/**
 * Onde cada área da conta mora (o visitante entra e volta para ela). O
 * "Perfil" é o modal "Minha conta" (card #151): `/conta/dados` é o endereço
 * dele, o que abre o modal na aba Dados.
 */
const DESTINO_DA_CONTA = {
  favoritos: "/conta/favoritos",
  pedidos: "/conta/pedidos",
  perfil: "/conta/dados",
} as const;

/**
 * Qual item está ativo em cada rota — exatamente UM (ou nenhum, fora do
 * cliente: painel, administração, escolha de loja). A comparação por prefixo
 * do `itemAtivo` deixaria "Explorar" ativo também em `/explorar/lojas`.
 */
export function itemPrincipalAtivo(
  caminho: string | null,
): IdDoItemPrincipal | null {
  if (caminho === null) return null;
  if (/^\/explorar\/lojas(?:\/|$)/.test(caminho)) return "lojas";
  if (/^\/explorar\/produtos(?:\/|$)/.test(caminho)) return "produtos";
  if (/^\/explorar(?:\/|$)/.test(caminho)) return "explorar";
  // Acompanhar o pedido é "Pedidos"; o resto da loja é "Lojas".
  if (/^\/loja\/[^/]+\/pedido(?:\/|$)/.test(caminho)) return "pedidos";
  if (/^\/loja\/[^/]+(?:\/|$)/.test(caminho)) return "lojas";
  if (/^\/conta\/favoritos(?:\/|$)/.test(caminho)) return "favoritos";
  if (/^\/conta\/pedidos(?:\/|$)/.test(caminho)) return "pedidos";
  if (/^\/conta(?:\/|$)/.test(caminho)) return "perfil";
  return null;
}

/**
 * A lista do feed que a página atual mostra, se for uma página do feed. A
 * vitrine (/explorar) lê os filtros como os da lista de produtos.
 */
function abaDoFeedEm(caminho: string | null): AbaDoFeed | null {
  if (caminho === null) return null;
  if (/^\/explorar\/lojas(?:\/|$)/.test(caminho)) return "lojas";
  if (/^\/explorar(?:\/|$)/.test(caminho)) return "produtos";
  return null;
}

type BuscaDoEndereco = { entries(): Iterable<[string, string]> };

function comoParametros(busca: BuscaDoEndereco | undefined): ParametrosDaPagina {
  const lido: Record<string, string> = {};
  if (busca === undefined) return lido;
  for (const [nome, valor] of busca.entries()) {
    if (!(nome in lido)) lido[nome] = valor;
  }
  return lido;
}

/**
 * O endereço da aba do feed. Vindo de uma página do feed, leva a busca e os
 * filtros que valem nas duas listas (os de uma lista só ficam para trás);
 * vindo de fora, é o endereço limpo.
 */
export function enderecoDaAbaDoFeed(
  caminho: string | null,
  busca: BuscaDoEndereco | undefined,
  destino: AbaDoFeed,
): string {
  const atual = abaDoFeedEm(caminho);
  if (atual === null) return `/explorar/${destino}`;
  // Saindo da vitrine mista (/explorar) para uma lista: `inicio` não vai junto.
  return enderecoDoFeed(lerConsulta(atual, comoParametros(busca)), {
    aba: destino,
    inicio: false,
  });
}

/**
 * O endereço de "Explorar" (a vitrine mista): leva só a região e o tipo de
 * negócio; busca e filtros de lista não fazem sentido nela. Fora do feed,
 * é `/explorar` limpo.
 */
export function enderecoDoExplorar(
  caminho: string | null,
  busca: BuscaDoEndereco | undefined,
): string {
  const atual = abaDoFeedEm(caminho);
  if (atual === null) return "/explorar";
  return enderecoDaVitrine(lerConsulta(atual, comoParametros(busca)));
}

export interface ContextoDaNavegacao {
  readonly usuario: UsuarioDaBarra;
  /** O caminho da página (sem busca). */
  readonly caminho: string | null;
  /** A busca da página, para as abas do feed levarem os filtros. */
  readonly busca?: BuscaDoEndereco | undefined;
}

function dentroDeUmaLoja(caminho: string | null): boolean {
  return caminho !== null && /^\/loja\/[^/]+(?:\/|$)/.test(caminho);
}

function itemDaConta(
  id: keyof typeof DESTINO_DA_CONTA,
  contexto: ContextoDaNavegacao,
  ativo: boolean,
): ItemDaNavegacao {
  const destino = DESTINO_DA_CONTA[id];
  if (contexto.usuario.papel !== "visitante") {
    return {
      id,
      rotulo: ROTULOS[id],
      href: destino,
      ...(id === "perfil"
        ? { atributos: { "data-abre-conta": "dados" as const } }
        : {}),
      ativo,
    };
  }
  // Visitante: entra e volta para onde tocou. Dentro da loja a janela de
  // acesso abre sem sair da página (sem script, o link navega para /entrar).
  return {
    id,
    rotulo: ROTULOS[id],
    href: comDestino("/entrar", destino),
    ...(dentroDeUmaLoja(contexto.caminho)
      ? { atributos: { "data-abre-acesso": "entrar" as const } }
      : {}),
    ativo,
  };
}

function itemDoFeed(
  id: "explorar" | "lojas" | "produtos",
  contexto: ContextoDaNavegacao,
): ItemDaNavegacao {
  const href =
    id === "explorar"
      ? enderecoDoExplorar(contexto.caminho, contexto.busca)
      : enderecaDaAba(contexto, id);
  return {
    id,
    rotulo: ROTULOS[id],
    href,
    ativo: itemPrincipalAtivo(contexto.caminho) === id,
  };
}

function enderecaDaAba(
  contexto: ContextoDaNavegacao,
  aba: AbaDoFeed,
): string {
  return enderecoDaAbaDoFeed(contexto.caminho, contexto.busca, aba);
}

/**
 * Os cinco itens da barra inferior do celular. "Produtos" não entra: a barra
 * não aperta mais um item, e a lista mora dentro do Explorar (card #152).
 */
export function itensPrincipais(
  contexto: ContextoDaNavegacao,
): readonly ItemDaNavegacao[] {
  const ativoAgora = itemPrincipalAtivo(contexto.caminho);
  // Em /explorar/produtos o destino "Explorar" da barra fica atual: é a
  // área a que a lista pertence no celular.
  const ativoNoCelular = ativoAgora === "produtos" ? "explorar" : ativoAgora;
  return [
    { ...itemDoFeed("explorar", contexto), ativo: ativoNoCelular === "explorar" },
    itemDoFeed("lojas", contexto),
    itemDaConta("favoritos", contexto, ativoAgora === "favoritos"),
    itemDaConta("pedidos", contexto, ativoAgora === "pedidos"),
    itemDaConta("perfil", contexto, ativoAgora === "perfil"),
  ];
}

/**
 * As cinco abas do topo no computador: Explorar · Lojas · Produtos ·
 * Favoritos · Pedidos. "Perfil" é o avatar, que abre o modal da conta; em
 * rotas de perfil nenhuma aba fica atual. Exatamente uma aba é a atual em
 * cada rota do feed (card #152).
 */
export function abasDoTopo(
  contexto: ContextoDaNavegacao,
): readonly ItemDaNavegacao[] {
  const ativoAgora = itemPrincipalAtivo(contexto.caminho);
  const [explorar, lojas, favoritos, pedidos] = itensPrincipais(contexto);
  if (
    explorar === undefined ||
    lojas === undefined ||
    favoritos === undefined ||
    pedidos === undefined
  ) {
    return [];
  }
  return [
    { ...explorar, ativo: ativoAgora === "explorar" },
    lojas,
    itemDoFeed("produtos", contexto),
    favoritos,
    pedidos,
  ];
}

/** O avatar do topo está na área de perfil (estado visual, sem `aria-current`). */
export function avatarEmPerfil(caminho: string | null): boolean {
  return itemPrincipalAtivo(caminho) === "perfil";
}

/** Quanto a área visível precisa encolher para valer como teclado virtual. */
export const ENCOLHIMENTO_DO_TECLADO_EM_PX = 120;

/**
 * O teclado virtual está aberto? Só vale com um campo de texto em foco E a
 * área visível bem menor que a de referência (a maior vista sem campo em
 * foco). Sem o foco, uma barra de endereço que some e volta não esconderia a
 * navegação.
 */
export function tecladoAberto(entrada: {
  readonly alturaDeReferencia: number;
  readonly alturaVisivel: number;
  readonly campoEmFoco: boolean;
}): boolean {
  return (
    entrada.campoEmFoco &&
    entrada.alturaDeReferencia - entrada.alturaVisivel >
      ENCOLHIMENTO_DO_TECLADO_EM_PX
  );
}

/** O elemento aceita digitação (o que abre o teclado virtual). */
export function eCampoDeTexto(elemento: Element | null): boolean {
  if (elemento === null) return false;
  if (elemento instanceof HTMLTextAreaElement) return true;
  if (elemento instanceof HTMLSelectElement) return false;
  if (elemento instanceof HTMLInputElement) {
    return !/^(?:button|checkbox|radio|submit|reset|file|image|range|color)$/.test(
      elemento.type,
    );
  }
  if (!(elemento instanceof HTMLElement)) return false;
  // `isContentEditable` não existe em todo ambiente (o jsdom não o tem).
  const editavel = elemento.getAttribute("contenteditable");
  return (
    elemento.isContentEditable === true ||
    editavel === "" ||
    editavel === "true"
  );
}
