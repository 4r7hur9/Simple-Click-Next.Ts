/**
 * As regras puras da navegação do cliente (card #105): qual item está ativo,
 * quais itens cada pessoa vê e para onde cada um leva.
 *
 * Sem React e sem navegador, para o topo, a barra inferior e os testes
 * dividirem a MESMA tabela. A interface não autoriza nada: quem decide
 * acesso continua sendo o servidor e a API, e o papel chega aqui só da
 * sessão lida no servidor.
 */
import { comDestino } from "../../lib/destino-seguro.ts";
import type { UsuarioDaBarra } from "../../lib/quem-esta-logado.ts";
import {
  enderecoDoFeed,
  lerConsulta,
  type AbaDoFeed,
  type ParametrosDaPagina,
} from "../feed/consulta.ts";

/** Os cinco destinos da barra inferior; as quatro primeiras também são abas. */
export type IdDoItemPrincipal =
  "explorar" | "lojas" | "favoritos" | "pedidos" | "perfil";

export interface ItemDaNavegacao {
  readonly id: IdDoItemPrincipal;
  readonly rotulo: string;
  readonly href: string;
  /** Visitante dentro da loja: o clique abre a janela de acesso, sem sair dela. */
  readonly atributos?: { readonly "data-abre-acesso": "entrar" } | undefined;
  /** É a página atual (um só item por rota). */
  readonly ativo: boolean;
}

const ROTULOS: Readonly<Record<IdDoItemPrincipal, string>> = {
  explorar: "Explorar",
  lojas: "Lojas",
  favoritos: "Favoritos",
  pedidos: "Pedidos",
  perfil: "Perfil",
};

/** Onde cada área da conta mora (o visitante entra e volta para ela). */
const DESTINO_DA_CONTA = {
  favoritos: "/conta/favoritos",
  pedidos: "/conta/pedidos",
  perfil: "/conta",
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
  if (/^\/explorar(?:\/|$)/.test(caminho)) return "explorar";
  // Acompanhar o pedido é "Pedidos"; o resto da loja é "Lojas".
  if (/^\/loja\/[^/]+\/pedido(?:\/|$)/.test(caminho)) return "pedidos";
  if (/^\/loja\/[^/]+(?:\/|$)/.test(caminho)) return "lojas";
  if (/^\/conta\/favoritos(?:\/|$)/.test(caminho)) return "favoritos";
  if (/^\/conta\/pedidos(?:\/|$)/.test(caminho)) return "pedidos";
  if (/^\/conta(?:\/|$)/.test(caminho)) return "perfil";
  return null;
}

/** A aba do feed que a página atual mostra, se for uma página do feed. */
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
  return enderecoDoFeed(lerConsulta(atual, comoParametros(busca)), {
    aba: destino,
  });
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
    return { id, rotulo: ROTULOS[id], href: destino, ativo };
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

/** Os cinco itens da barra inferior do celular. */
export function itensPrincipais(
  contexto: ContextoDaNavegacao,
): readonly ItemDaNavegacao[] {
  const ativoAgora = itemPrincipalAtivo(contexto.caminho);
  return [
    {
      id: "explorar",
      rotulo: ROTULOS.explorar,
      href: enderecoDaAbaDoFeed(contexto.caminho, contexto.busca, "produtos"),
      ativo: ativoAgora === "explorar",
    },
    {
      id: "lojas",
      rotulo: ROTULOS.lojas,
      href: enderecoDaAbaDoFeed(contexto.caminho, contexto.busca, "lojas"),
      ativo: ativoAgora === "lojas",
    },
    itemDaConta("favoritos", contexto, ativoAgora === "favoritos"),
    itemDaConta("pedidos", contexto, ativoAgora === "pedidos"),
    itemDaConta("perfil", contexto, ativoAgora === "perfil"),
  ];
}

/**
 * As quatro abas do topo no computador. "Perfil" é o avatar, que abre o menu
 * da conta; em rotas de perfil nenhuma aba fica atual.
 */
export function abasDoTopo(
  contexto: ContextoDaNavegacao,
): readonly ItemDaNavegacao[] {
  return itensPrincipais(contexto).filter((item) => item.id !== "perfil");
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
