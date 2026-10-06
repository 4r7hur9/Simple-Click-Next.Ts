/**
 * Cookie que carrega exclusivamente o refresh token (AC-109).
 *
 * O domínio é o ancestral comum de `app` e `api`: assim os dois subdomínios
 * recebem o mesmo cookie, mas JavaScript de nenhum deles consegue lê-lo.
 */

export const NOME_DO_COOKIE_DE_RENOVACAO = "sc_refresh";
export const NOME_DO_COOKIE_DE_ACESSO = "sc_access";

export const DURACAO_DO_COOKIE_DE_RENOVACAO_EM_SEGUNDOS = 30 * 24 * 60 * 60;
export const DURACAO_DO_COOKIE_DE_ACESSO_EM_SEGUNDOS = 15 * 60;

/** Domínio público comum usado no ambiente local com TLS. */
export const DOMINIO_PADRAO_DO_COOKIE_DE_SESSAO = "simpleclick.localhost";

/** Domínio compartilhado, configurável sem expor nenhum segredo. */
export function dominioDoCookieDeSessao(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const declarado = fonte.NEXT_PUBLIC_SESSION_COOKIE_DOMAIN?.trim();
  if (declarado !== undefined && declarado !== "") {
    return declarado.replace(/^\.+/, "");
  }

  // Em localhost, o cookie precisa ser host-only: navegadores rejeitam ou
  // ignoram de forma inconsistente Domain=simpleclick.localhost quando o
  // site está sendo aberto em http://localhost:3000. O domínio compartilhado
  // continua disponível para o ambiente TLS por configuração explícita.
  if (fonte.NODE_ENV !== "production") return undefined;
  return DOMINIO_PADRAO_DO_COOKIE_DE_SESSAO;
}

/** Serializa o cookie seguro do refresh para um cabeçalho Set-Cookie. */
export function serializarCookieDeRenovacao(
  tokenDeRenovacao: string,
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const dominio = dominioDoCookieDeSessao(fonte);
  const atributos = [
    `${NOME_DO_COOKIE_DE_RENOVACAO}=${encodeURIComponent(tokenDeRenovacao)}`,
    `Max-Age=${DURACAO_DO_COOKIE_DE_RENOVACAO_EM_SEGUNDOS}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (dominio !== undefined) atributos.splice(3, 0, `Domain=${dominio}`);
  return atributos.join("; ");
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

/**
 * Cookie do token de acesso curto (15 minutos), que as rotas do servidor do
 * site usam para falar com a API em nome da pessoa. HttpOnly como o de
 * renovação: script nenhum o lê. Vale também em produção (T-113) — é por ele
 * que o painel e a conta alcançam a API depois do login real.
 *
 * Mora no MESMO domínio comum do de renovação: o fechamento do pedido sai do
 * navegador direto para a API (o carrinho é cookie da API), e é por este
 * cookie que a API reconhece o cliente logado e liga a compra à conta dele
 * (AC-616). A API só o lê para isso (`cliente-da-compra.ts`).
 */
export function adicionarCookieDeAcesso(
  cabecalhos: Headers,
  token: string,
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const dominio = dominioDoCookieDeSessao(fonte);
  cabecalhos.append(
    "set-cookie",
    [
      `${NOME_DO_COOKIE_DE_ACESSO}=${encodeURIComponent(token)}`,
      `Max-Age=${DURACAO_DO_COOKIE_DE_ACESSO_EM_SEGUNDOS}`,
      "Path=/",
      ...(dominio === undefined ? [] : [`Domain=${dominio}`]),
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
    ].join("; "),
  );
}

export function lerTokenDeAcessoDoCookie(
  cabecalhoCookie: string | null,
): string | undefined {
  if (cabecalhoCookie === null) return undefined;
  for (const par of cabecalhoCookie.split(";")) {
    const [nome, ...valores] = par.trim().split("=");
    if (nome !== NOME_DO_COOKIE_DE_ACESSO || valores.length === 0) continue;
    try {
      const token = decodeURIComponent(valores.join("="));
      return token === "" ? undefined : token;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Apaga os dois cookies da sessão (renovação recusada, saída). */
export function adicionarCookiesQueApagam(
  cabecalhos: Headers,
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const dominio = dominioDoCookieDeSessao(fonte);
  cabecalhos.append(
    "set-cookie",
    [
      `${NOME_DO_COOKIE_DE_RENOVACAO}=`,
      "Max-Age=0",
      "Path=/",
      ...(dominio === undefined ? [] : [`Domain=${dominio}`]),
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
    ].join("; "),
  );
  cabecalhos.append(
    "set-cookie",
    [
      `${NOME_DO_COOKIE_DE_ACESSO}=`,
      "Max-Age=0",
      "Path=/",
      ...(dominio === undefined ? [] : [`Domain=${dominio}`]),
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
    ].join("; "),
  );
}
