/**
 * O que a pessoa pode fazer no painel da loja, do ponto de vista do site.
 *
 * A REGRA NÃO MORA AQUI. Quem diz o que cada papel pode é a matriz do
 * contrato (`MATRIZ_DE_PERMISSOES`), e quem a impõe é a API, em toda rota do
 * painel (403 `sem_permissao`). O site só ACOMPANHA: esconde do menu o que a
 * pessoa não usa e mostra a tela "Sem permissão" em vez de uma página que a
 * API recusaria. Esconder é conforto; barrar é da API.
 *
 * As permissões efetivas vêm de `GET /v1/eu` (`lojasDaConta[].permissoes`).
 * Uma resposta mais antiga, sem a lista, cai na matriz pelo papel.
 */
import {
  permissoesDoPapel,
  ROTULOS_DAS_PERMISSOES,
  type PapelNaLoja,
  type PermissaoDaLoja,
} from "@simpleclick/contracts";

export type { PapelNaLoja, PermissaoDaLoja };

/** O que o site precisa saber de uma loja da conta para decidir o que mostrar. */
export interface LojaComPermissoes {
  readonly papel: string;
  readonly permissoes?: readonly PermissaoDaLoja[] | undefined;
}

/** As permissões efetivas da conta nesta loja: as do `/v1/eu`, ou as do papel. */
export function permissoesDaLoja(
  loja: LojaComPermissoes,
): ReadonlySet<PermissaoDaLoja> {
  return new Set(loja.permissoes ?? permissoesDoPapel(loja.papel));
}

/** A pessoa pode isto? `null` significa "qualquer pessoa do painel". */
export function pode(
  permissoes: ReadonlySet<PermissaoDaLoja>,
  permissao: PermissaoDaLoja | null,
): boolean {
  return permissao === null || permissoes.has(permissao);
}

/** Como o papel se chama na tela (o selo do cabeçalho do menu). */
export function rotuloDoPapel(papel: string): string {
  return papel === "OWNER" ? "Dono" : "Equipe";
}

/** O nome da permissão para a tela "Sem permissão". */
export function nomeDaPermissao(permissao: PermissaoDaLoja): string {
  return ROTULOS_DAS_PERMISSOES[permissao];
}

/**
 * A permissão que cada área do painel exige, da mais específica para a mais
 * geral (a primeira que casa vale). Área que não está aqui é livre para quem
 * está no painel — a ajuda, por exemplo.
 *
 * Espelha as rotas da API: `/painel/aparencia` é a personalização da vitrine;
 * `/painel/config/*` são as configurações da loja.
 */
const PERMISSAO_DA_AREA: readonly (readonly [
  prefixo: string,
  permissao: PermissaoDaLoja,
])[] = [
  ["/painel/pedidos/novo", "pedidos.manual"],
  ["/painel/pedidos", "pedidos.operar"],
  ["/painel/clientes", "clientes"],
  ["/painel/produtos", "catalogo.produtos"],
  ["/painel/categorias", "catalogo.categorias"],
  ["/painel/estoque", "catalogo.produtos"],
  ["/painel/variacoes", "catalogo.produtos"],
  ["/painel/opcoes", "catalogo.produtos"],
  ["/painel/metricas", "metricas"],
  ["/painel/aparencia", "personalizacao"],
  ["/painel/feed", "feed"],
  ["/painel/stories", "catalogo.produtos"],
  ["/painel/comentarios", "moderar_comentarios"],
  ["/painel/equipe", "equipe"],
  ["/painel/config", "configuracoes"],
];

/** A permissão que o endereço exige, ou `null` quando é livre. */
export function permissaoDoCaminho(caminho: string): PermissaoDaLoja | null {
  if (caminho === "/painel") return "metricas";
  for (const [prefixo, permissao] of PERMISSAO_DA_AREA) {
    if (caminho === prefixo || caminho.startsWith(`${prefixo}/`)) {
      return permissao;
    }
  }
  return null;
}
