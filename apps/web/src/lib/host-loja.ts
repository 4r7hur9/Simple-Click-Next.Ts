/**
 * Resolução de endereço para apelido de loja.
 *
 * Função pura de propósito: quem decide a reescrita é o proxy, mas a regra de
 * "este endereço é de qual loja?" precisa ser testável sem servidor, sem
 * requisição e sem Next. Nada aqui autoriza nada — ver `src/proxy.ts`.
 */

/**
 * Nomes que pertencem à plataforma e nunca são apelido de loja. Sem esta lista,
 * quem cadastrasse a loja "painel" passaria a receber o tráfego do painel.
 */
export const SUBDOMINIOS_RESERVADOS: ReadonlySet<string> = new Set([
  "www",
  "app",
  "api",
  "painel",
  "admin",
  "static",
  "cdn",
  "mail",
]);

/**
 * Domínios sob os quais um subdomínio vale como apelido de loja.
 *
 * O domínio definitivo só é registrado na fase de publicação (ver
 * `decisoes.md`), então ele entra por variável de ambiente e o
 * desenvolvimento roda em `*.localhost` servido pelo roteador local.
 */
export const DOMINIOS_BASE: readonly string[] = (
  process.env.NEXT_PUBLIC_DOMINIOS_BASE ?? "simpleclick.app,localhost"
)
  .split(",")
  .map((dominio) => dominio.trim().toLowerCase())
  .filter((dominio) => dominio.length > 0);

/** Apelido aceito: minúsculas, números e hífen no meio, de 2 a 63 caracteres. */
const FORMATO_DO_APELIDO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

/** Tira porta, ponto final e maiúsculas — o navegador manda qualquer variação. */
function normalizarHost(host: string): string {
  return host.trim().toLowerCase().split(":")[0]?.replace(/\.$/, "") ?? "";
}

/**
 * Devolve o apelido da loja embutido no endereço, ou `null` quando o endereço
 * é da própria plataforma, é reservado ou não tem forma de apelido.
 */
export function apelidoDaLoja(
  host: string | null | undefined,
  dominiosBase: readonly string[] = DOMINIOS_BASE,
): string | null {
  if (!host) return null;

  const normalizado = normalizarHost(host);

  for (const base of dominiosBase) {
    if (!normalizado.endsWith(`.${base}`)) continue;

    const candidato = normalizado.slice(0, -(base.length + 1));
    // Subdomínio de segundo nível não é loja: só o rótulo mais à esquerda,
    // e só quando ele é o único.
    if (candidato.includes(".")) return null;
    if (SUBDOMINIOS_RESERVADOS.has(candidato)) return null;
    if (!FORMATO_DO_APELIDO.test(candidato)) return null;

    return candidato;
  }

  return null;
}
