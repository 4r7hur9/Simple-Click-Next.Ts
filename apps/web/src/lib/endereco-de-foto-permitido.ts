/**
 * De onde o painel pode pedir uma foto da loja (card #36): a pasta pública do
 * próprio site, o armazenamento da API e o Cloudinary. Qualquer outro endereço
 * é recusado.
 */

const CAMINHO_DO_SITE = /^\/(demo|capas-padrao|banners-demo)\/[\w./-]+$/;

/** O endereço que o servidor pode buscar, ou nulo se não é de um lugar permitido. */
export function enderecoPermitido(
  pedido: string,
  origemDoSite: string,
  origemDaApi: string,
): URL | null {
  try {
    if (CAMINHO_DO_SITE.test(pedido) && !pedido.includes("..")) {
      return new URL(pedido, origemDoSite);
    }
    const url = new URL(pedido);
    if (url.origin === origemDaApi && url.pathname.startsWith("/v1/midia/")) {
      return url;
    }
    if (url.protocol === "https:" && url.hostname === "res.cloudinary.com") {
      return url;
    }
  } catch {
    // endereço torto
  }
  return null;
}
