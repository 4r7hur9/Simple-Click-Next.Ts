/**
 * O endereço público deste site (AC-403, AC-414).
 *
 * POR QUE ELE PRECISA SER ABSOLUTO. Endereço canônico, mapa do site e prévia de
 * compartilhamento não admitem caminho relativo: o buscador guarda o endereço
 * fora do contexto da página, e a rede social busca a imagem de um servidor que
 * não é o nosso. Um `/loja/padaria` sozinho não abre em lugar nenhum.
 *
 * MORA NO SERVIDOR, e não em `lib`, de propósito. `URL_DO_SITE` não tem o
 * prefixo `NEXT_PUBLIC_`, então ela existe no processo do servidor e é
 * `undefined` no navegador. Em `lib` — que a camada de componentes também
 * alcança — alguém a leria de um componente de navegador e receberia o padrão
 * de desenvolvimento em produção, calado.
 *
 * A MESMA VARIÁVEL QUE A API USA para avisar o site de que um catálogo mudou
 * (AC-028). É o mesmo endereço, e duas variáveis para o mesmo valor divergem no
 * dia em que só uma for editada.
 */

/**
 * Endereço quando o ambiente não diz outro.
 *
 * É o nome que o roteador local serve com TLS (ver `infra/traefik`). Não é
 * segredo: endereço público de serviço não é segredo (P-002).
 */
export const ENDERECO_PADRAO_DO_SITE = "https://simpleclick.localhost";

/** O endereço configurado, sem barra sobrando no fim. */
export function enderecoDoSite(): string {
  const declarado = process.env.URL_DO_SITE;
  const escolhido =
    declarado === undefined || declarado.length === 0
      ? ENDERECO_PADRAO_DO_SITE
      : declarado;
  return escolhido.replace(/\/+$/, "");
}

/**
 * O endereço canônico de uma loja.
 *
 * UM ENDEREÇO POR LOJA, e é isso que o AC-403 cobra. A mesma loja alcançável
 * por dois caminhos divide a relevância dela entre os dois, e o buscador escolhe
 * um — normalmente o errado.
 */
export function enderecoDaLoja(apelido: string): string {
  return `${enderecoDoSite()}/loja/${apelido}`;
}

/** O endereço canônico da página institucional da loja. */
export function enderecoSobreDaLoja(apelido: string): string {
  return `${enderecoDaLoja(apelido)}/sobre`;
}

/** O endereço canônico de um produto (AC-414). */
export function enderecoDoProduto(apelido: string, produtoId: string): string {
  return `${enderecoDaLoja(apelido)}/produto/${produtoId}`;
}

/** O endereço canônico do catálogo de uma loja. */
export function enderecoDoCatalogo(apelido: string): string {
  return `${enderecoDaLoja(apelido)}/cardapio`;
}
