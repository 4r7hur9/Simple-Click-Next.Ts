/**
 * Cookie que carrega exclusivamente o refresh token (AC-109).
 *
 * O domínio é o ancestral comum de `app` e `api`: assim os dois subdomínios
 * recebem o mesmo cookie, mas JavaScript de nenhum deles consegue lê-lo.
 */

export const NOME_DO_COOKIE_DE_RENOVACAO = "sc_refresh";

export const DURACAO_DO_COOKIE_DE_RENOVACAO_EM_SEGUNDOS = 30 * 24 * 60 * 60;

/** Domínio público comum usado no ambiente local com TLS. */
export const DOMINIO_PADRAO_DO_COOKIE_DE_SESSAO = "simpleclick.localhost";

/** Domínio compartilhado, configurável sem expor nenhum segredo. */
export function dominioDoCookieDeSessao(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const declarado = fonte.NEXT_PUBLIC_SESSION_COOKIE_DOMAIN?.trim();
  if (declarado === undefined || declarado === "") {
    return DOMINIO_PADRAO_DO_COOKIE_DE_SESSAO;
  }
  return declarado.replace(/^\.+/, "");
}

/** Serializa o cookie seguro do refresh para um cabeçalho Set-Cookie. */
export function serializarCookieDeRenovacao(
  tokenDeRenovacao: string,
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return [
    `${NOME_DO_COOKIE_DE_RENOVACAO}=${encodeURIComponent(tokenDeRenovacao)}`,
    `Max-Age=${DURACAO_DO_COOKIE_DE_RENOVACAO_EM_SEGUNDOS}`,
    "Path=/",
    `Domain=${dominioDoCookieDeSessao(fonte)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

/** Lê o refresh do cabeçalho que o navegador enviou ao servidor. */
export function lerTokenDeRenovacaoDoCookie(
  cabecalhoCookie: string | null,
): string | undefined {
  if (cabecalhoCookie === null) return undefined;

  for (const par of cabecalhoCookie.split(";")) {
    const [nome, ...valores] = par.trim().split("=");
    if (nome !== NOME_DO_COOKIE_DE_RENOVACAO || valores.length === 0) continue;

    try {
      const token = decodeURIComponent(valores.join("="));
      return token === "" ? undefined : token;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Acrescenta o refresh sem substituir outros cookies que a resposta já tenha. */
export function adicionarCookieDeRenovacao(
  cabecalhos: Headers,
  tokenDeRenovacao: string,
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): void {
  cabecalhos.append(
    "set-cookie",
    serializarCookieDeRenovacao(tokenDeRenovacao, fonte),
  );
}
