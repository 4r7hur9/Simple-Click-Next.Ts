/**
 * Proteção das ações da conta contra pedido de fora do site (card #111,
 * AC-11126).
 *
 * As rotas `/api/conta/*` leem o token do cookie e escrevem na API. O único
 * freio contra um site de fora era o `SameSite=Lax` do cookie, que não cobre
 * o cookie de domínio compartilhado (outro subdomínio da mesma família manda o
 * cookie). Por isso, toda escrita confere de onde veio:
 *
 * - `Sec-Fetch-Site` (o navegador escreve, a página não consegue mudar): só
 *   `same-origin` passa. `same-site`, `cross-site` e `none` são recusados;
 * - sem ele, o `Origin`: `null` ou diferente da origem do site é recusado;
 * - sem os dois (cliente que não é navegador), passa: não há cookie de
 *   navegador de outra pessoa para abusar;
 * - corpo que não é JSON recebe 415 — a rota repassa o corpo à API como JSON
 *   de qualquer jeito, então um formulário (`text/plain`) não pode atravessar.
 *
 * Roda ANTES da leitura do cookie: pedido de fora recebe 403 mesmo sem sessão.
 *
 * Card #134: a mesma guarda vale nas escritas de `/api/loja/*` e
 * `/api/auth/*`. As rotas cujo corpo legítimo não é JSON (formulários de
 * acesso sem script, imagem e vídeo) usam só `recusarOrigemDeFora`.
 * Não usa `x-forwarded-*`: o que vem do pedido não prova de onde ele veio.
 */
import { enderecoDoSite } from "./endereco-do-site.ts";

const COM_ESCRITA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function recusa(status: 403 | 415, erro: string): Response {
  return Response.json(
    { erro },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/** A origem normalizada (esquema, host e porta; a porta padrão some). */
function origemDe(texto: string): string | null {
  try {
    return new URL(texto).origin;
  } catch {
    return null;
  }
}

function origensDoSite(requisicao: Request): readonly string[] {
  const proprias = [origemDe(requisicao.url), origemDe(enderecoDoSite())];
  return proprias.filter((origem): origem is string => origem !== null);
}

/**
 * Só a parte da ORIGEM (403), para as rotas cujo corpo legítimo não é JSON:
 * os formulários de acesso que funcionam sem script (`form-urlencoded`) e o
 * envio de imagem e vídeo (bytes crus). Leituras (`GET`, `HEAD`) passam.
 */
export function recusarOrigemDeFora(requisicao: Request): Response | null {
  if (!COM_ESCRITA.has(requisicao.method)) return null;

  const destino = requisicao.headers.get("sec-fetch-site");
  if (destino !== null) {
    return destino.toLowerCase() === "same-origin"
      ? null
      : recusa(403, "origem_recusada");
  }
  const origem = requisicao.headers.get("origin");
  if (origem === null) return null;
  const conhecida = origemDe(origem);
  if (conhecida === null || !origensDoSite(requisicao).includes(conhecida)) {
    return recusa(403, "origem_recusada");
  }
  return null;
}

/**
 * Devolve a resposta de recusa (403 ou 415), ou `null` quando o pedido pode
 * seguir. Leituras (`GET`, `HEAD`) não passam por aqui.
 */
export async function recusarAcaoDeFora(
  requisicao: Request,
): Promise<Response | null> {
  if (!COM_ESCRITA.has(requisicao.method)) return null;

  const deFora = recusarOrigemDeFora(requisicao);
  if (deFora !== null) return deFora;

  const tipo = requisicao.headers.get("content-type");
  const tipoDoCorpo = tipo?.split(";")[0]?.trim().toLowerCase();
  if (tipoDoCorpo !== undefined && tipoDoCorpo !== "application/json") {
    return recusa(415, "tipo_nao_suportado");
  }
  if (tipoDoCorpo === undefined) {
    const corpo = await requisicao.clone().text();
    if (corpo !== "") return recusa(415, "tipo_nao_suportado");
  }
  return null;
}
