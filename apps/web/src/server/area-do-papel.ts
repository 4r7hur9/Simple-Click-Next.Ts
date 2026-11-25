/**
 * A área de cada papel e para onde quem NÃO é dela vai (card #170, T-6, D-10).
 *
 * Quem abre uma área que não é a sua não recebe 404: o SERVIDOR o leva para a
 * área do próprio papel, antes de qualquer HTML da área pedida. O destino sai
 * SEMPRE de `DESTINO_DO_PAPEL`, uma lista fixa; nenhum endereço, parâmetro ou
 * cabeçalho do pedido escolhe para onde ir (nada de open redirect, nada de
 * laço). O papel vem de `GET /v1/eu` (`euDoPedidoAtual`), ao vivo, e nunca do
 * claim do JWT.
 *
 * A ordem dos papéis é a da API: administração > dono > equipe > cliente.
 *
 * Quatro áreas, três jeitos de se comportar:
 * - `/admin` e `/painel` exigem conta, e FECHAM na falha da API (na dúvida,
 *   não mostram nada). `/admin` lança erro; `/painel` cai na escolha da loja,
 *   que explica o problema (`loja-da-pagina.ts`);
 * - `/explorar` e `/conta` ABREM na falha: são áreas de clientes e a vitrine
 *   é pública. Só o administrador CONFIRMADO é desviado, para `/admin`;
 * - sem sessão, quem pede `/admin` vai para `/admin/entrar` e quem pede
 *   `/painel` vai para `/entrar`, levando só o CAMINHO da área em `proximo`
 *   (nunca consulta), e volta depois de entrar.
 *
 * Nenhum desvio aponta para a própria área de origem, e cada destino é uma
 * área em que o papel FICA: o caminho mais longo possível é de dois saltos.
 */
import type { EuNoContrato } from "@simpleclick/contracts";
import { redirect } from "next/navigation";

import { type AbaDaConta, enderecoDoModal } from "../lib/abas-da-conta.ts";
import { comDestino, destinoSeguro } from "../lib/destino-seguro.ts";
import { euDoPedidoAtual, type EuDoPedido } from "./eu-do-pedido.ts";

/** Os papéis do ponto de vista das áreas do site. */
export type PapelNaArea = "admin" | "dono" | "equipe" | "cliente";

/** A área de cada papel: a ÚNICA fonte de destino dos desvios. */
export const DESTINO_DO_PAPEL = {
  admin: "/admin",
  dono: "/painel",
  equipe: "/painel",
  cliente: "/explorar/produtos",
} as const satisfies Record<PapelNaArea, string>;

export type DestinoDoPapel = (typeof DESTINO_DO_PAPEL)[PapelNaArea];

/**
 * As áreas guardadas. `cliente` é `/explorar` e `/conta`: áreas abertas, que
 * só desviam a administração.
 */
export type AreaDoSite = "admin" | "painel" | "cliente";

/** O que a guarda de uma área faz com o pedido. */
export type DecisaoDaArea =
  | { readonly acao: "ficar" }
  | { readonly acao: "ir"; readonly destino: DestinoDoPapel }
  | { readonly acao: "entrar" }
  | { readonly acao: "falhar" };

/** As lojas da conta (dono ou equipe), pela mesma lista que decide a loja. */
function lojasDaConta(eu: EuNoContrato): EuNoContrato["lojas"] {
  return eu.lojasDaConta ?? eu.lojas;
}

/** A conta tem vínculo com alguma loja (dono ou equipe)? */
export function temLojaNaConta(eu: EuNoContrato): boolean {
  return lojasDaConta(eu).length > 0;
}

/**
 * O papel da conta, na ordem admin > dono > equipe > cliente. Administração é
 * o grant ativo que a API informa agora (`adminDaPlataforma`); o papel do
 * token (`identidade.papel`) não entra na conta.
 */
export function papelDoEu(eu: EuNoContrato): PapelNaArea {
  if (eu.adminDaPlataforma === true) return "admin";
  const lojas = lojasDaConta(eu);
  if (lojas.some((loja) => loja.papel === "OWNER")) return "dono";
  if (lojas.some((loja) => loja.papel === "STAFF")) return "equipe";
  return "cliente";
}

/**
 * A matriz de papéis × áreas, sem efeito colateral: o que fazer quando a
 * pessoa de `leitura` pede `area`.
 *
 * - admin: só o administrador fica; os outros vão para a própria área;
 * - painel: fica quem tem loja (inclusive o administrador que também é dono
 *   ou equipe); quem não tem vai para a área do papel;
 * - cliente: todo mundo fica, menos o administrador confirmado.
 */
export function decidirArea(
  area: AreaDoSite,
  leitura: EuDoPedido,
): DecisaoDaArea {
  if (area === "cliente") {
    // Fail open: sem sessão ou com a API fora, a área abre como sempre.
    if (leitura.estado !== "ok") return { acao: "ficar" };
    return papelDoEu(leitura.eu) === "admin"
      ? { acao: "ir", destino: DESTINO_DO_PAPEL.admin }
      : { acao: "ficar" };
  }

  if (leitura.estado === "sem-sessao") return { acao: "entrar" };
  // Fail closed: sem resposta confiável da API, nada da área aparece.
  if (leitura.estado === "indisponivel") return { acao: "falhar" };

  const papel = papelDoEu(leitura.eu);
  if (area === "admin") {
    return papel === "admin"
      ? { acao: "ficar" }
      : { acao: "ir", destino: DESTINO_DO_PAPEL[papel] };
  }
  return temLojaNaConta(leitura.eu)
    ? { acao: "ficar" }
    : { acao: "ir", destino: DESTINO_DO_PAPEL[papel] };
}

/**
 * O caminho de `caminho` sem consulta nem fragmento, ou `undefined` se não é
 * um caminho interno seguro. É o que viaja em `proximo`: a consulta de uma
 * página não volta pelo login.
 */
export function caminhoDoProximo(caminho: string): string | undefined {
  const seguro = destinoSeguro(caminho);
  if (seguro === undefined) return undefined;
  const corte = seguro.search(/[?#]/);
  return corte === -1 ? seguro : seguro.slice(0, corte);
}

/** O endereço de `/entrar` para voltar a `caminho` (só o caminho) depois. */
export function enderecoParaEntrar(caminho: string): string {
  return comDestino("/entrar", caminhoDoProximo(caminho));
}

/**
 * O endereço da entrada PRÓPRIA da administração (`/admin/entrar`) para voltar
 * a `caminho` (só o caminho) depois. Só a guarda do `/admin` usa; o `/painel`
 * continua em `/entrar` (`enderecoParaEntrar`).
 */
export function enderecoParaEntrarNaAdministracao(caminho: string): string {
  return comDestino("/admin/entrar", caminhoDoProximo(caminho));
}

/** A API não confirmou quem é a pessoa: a área fechada não abre. */
export class AreaIndisponivel extends Error {
  constructor(readonly area: AreaDoSite) {
    super(`A área "${area}" não abre sem a API confirmar quem é a pessoa.`);
    this.name = "AreaIndisponivel";
  }
}

/**
 * A guarda da administração: volta só com grant ativo. Sem sessão vai para
 * `/admin/entrar` (a entrada própria da administração); conta sem grant vai
 * para a área do próprio papel; API fora do ar lança `AreaIndisponivel` (a
 * tela de erro do site, e não um 404 que esconderia a falha).
 */
export async function exigirAreaDaAdministracao(
  caminho: string,
): Promise<void> {
  const decisao = decidirArea("admin", await euDoPedidoAtual());
  if (decisao.acao === "ficar") return;
  if (decisao.acao === "ir") redirect(decisao.destino);
  if (decisao.acao === "entrar") {
    redirect(enderecoParaEntrarNaAdministracao(caminho));
  }
  throw new AreaIndisponivel("admin");
}

/** O modal "Minha conta" que o administrador desviado deve reencontrar. */
export interface ModalDaContaDoDesvio {
  /** A aba já conferida pela lista fechada (`lerAbaDaConta`). */
  readonly aba: AbaDaConta;
  /** Só `erro` sobrevive (`enderecoDoModal`); o resto é descartado. */
  readonly estado?: string | undefined;
}

/**
 * A guarda de `/explorar` e `/conta`: só o administrador confirmado sai
 * daqui, para `/admin`. Com `modal`, leva junto a aba aberta (e o `estado`
 * de erro), para o modal reabrir por cima do `/admin`. Qualquer outro caso,
 * inclusive API fora do ar e sem sessão, volta e a página abre.
 */
export async function desviarAdministradorDasAreasDeCliente(
  modal?: ModalDaContaDoDesvio,
): Promise<void> {
  const decisao = decidirArea("cliente", await euDoPedidoAtual());
  if (decisao.acao !== "ir") return;
  redirect(
    modal === undefined
      ? decisao.destino
      : enderecoDoModal(modal.aba, modal.estado, DESTINO_DO_PAPEL.admin),
  );
}
