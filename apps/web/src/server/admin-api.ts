/**
 * Ponte do site até as rotas da administração da API (`/v1/admin/*`).
 *
 * As telas da administração chamam `/api/admin/...` no próprio site, e esta
 * camada de servidor repassa à API com o token que só ela lê (do cookie
 * httpOnly — P-008). A página nunca vê token nenhum.
 *
 * A LISTA DE CAMINHOS É FECHADA. Um repasse que aceitasse qualquer caminho
 * viraria um proxy aberto para a API inteira, com o cookie de quem está logado:
 * bastaria um link malicioso para uma tela da administração chamar uma rota
 * que ninguém planejou expor por aqui. Caminho fora da lista é 404, antes de
 * sair qualquer requisição.
 *
 * Esta ponte NÃO autoriza nada: quem decide se a pessoa é administradora é a
 * API, com duas travas e a credencial própria do banco.
 */

import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Os únicos caminhos repassados, e com quais métodos. */
export const CAMINHOS_DA_ADMINISTRACAO: readonly {
  readonly padrao: RegExp;
  readonly metodos: readonly string[];
}[] = [
  { padrao: /^tipos-de-negocio$/, metodos: ["GET"] },
  { padrao: /^lojas$/, metodos: ["GET", "POST"] },
  // A ficha, a edição e a exclusão confirmada pelo nome (T-206, AC-211).
  {
    padrao: new RegExp(`^lojas/${UUID}$`),
    metodos: ["GET", "PATCH", "DELETE"],
  },
  // Suspender, reativar e restaurar (T-206, AC-209 a AC-211).
  { padrao: new RegExp(`^lojas/${UUID}/suspensao$`), metodos: ["PUT"] },
  { padrao: new RegExp(`^lojas/${UUID}/reativacao$`), metodos: ["PUT"] },
  { padrao: new RegExp(`^lojas/${UUID}/restauracao$`), metodos: ["PUT"] },
  // A troca do tipo de negócio (T-203, AC-214).
  {
    padrao: new RegExp(`^lojas/${UUID}/tipo-de-negocio$`),
    metodos: ["PUT"],
  },
  // A troca do endereço na web, que preserva o antigo (T-204, AC-208).
  { padrao: new RegExp(`^lojas/${UUID}/apelido$`), metodos: ["PUT"] },
  // Contrato e documentos (T-205, AC-203 a AC-205): a lista e o envio, o
  // link temporário gerado no clique e a entrega do arquivo por ele — que só
  // abre com o cookie da administração, porque é a API quem confere.
  {
    padrao: new RegExp(`^lojas/${UUID}/documentos$`),
    metodos: ["GET", "POST"],
  },
  {
    padrao: new RegExp(`^lojas/${UUID}/documentos/${UUID}/link$`),
    metodos: ["POST"],
  },
  {
    padrao: /^arquivos\/[A-Za-z0-9_-]{16,600}\.[A-Za-z0-9_-]{43}$/,
    metodos: ["GET"],
  },
  // O histórico de auditoria consultável (T-208, AC-215); os filtros vão na
  // consulta, que o repasse leva junto.
  { padrao: /^auditoria$/, metodos: ["GET"] },
  // Funcionalidades liberadas por loja (T-207, AC-212, AC-213).
  {
    padrao: new RegExp(`^lojas/${UUID}/funcionalidades$`),
    metodos: ["GET"],
  },
  {
    padrao: new RegExp(`^lojas/${UUID}/funcionalidades/[a-z][a-z0-9_]{1,62}$`),
    metodos: ["PUT"],
  },
  // Aprovação, ativação e desativação da loja (card #25, card #29).
  {
    padrao: new RegExp(`^lojas/${UUID}/(aprovar|recusar|ativar|desativar)$`),
    metodos: ["POST"],
  },
  // Números e equipe de cada loja, e os limites editáveis (card #29).
  { padrao: new RegExp(`^lojas/${UUID}/metricas$`), metodos: ["GET"] },
  { padrao: new RegExp(`^lojas/${UUID}/equipe$`), metodos: ["GET"] },
  { padrao: new RegExp(`^lojas/${UUID}/limites$`), metodos: ["GET", "PATCH"] },
  // Contas da plataforma (donos e equipe) e o limite de lojas de cada dono.
  // Painel de crescimento da home da administração (card #30).
  { padrao: /^metricas$/, metodos: ["GET"] },
  { padrao: /^limites$/, metodos: ["GET"] },
  { padrao: /^contas$/, metodos: ["GET"] },
  { padrao: new RegExp(`^contas/${UUID}$`), metodos: ["GET"] },
  { padrao: new RegExp(`^donos/${UUID}/limites$`), metodos: ["GET", "PATCH"] },
];

/** Cabeçalhos da requisição que seguem para a API. Nenhum outro. */
const CABECALHOS_REPASSADOS = ["content-type", "x-nome-do-arquivo"];

/**
 * Cabeçalhos da resposta que voltam da API além do tipo. São os que fazem o
 * documento sair como ANEXO e sem rodar nada na página (AC-203, AC-205):
 * sem eles, o arquivo chegaria ao navegador como se fosse do próprio site.
 */
const CABECALHOS_DA_RESPOSTA_REPASSADOS = [
  "content-disposition",
  "x-content-type-options",
  "content-security-policy",
];

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

/** O caminho está na lista, com este método? */
export function caminhoPermitido(caminho: string, metodo: string): boolean {
  return CAMINHOS_DA_ADMINISTRACAO.some(
    (permitido) =>
      permitido.padrao.test(caminho) && permitido.metodos.includes(metodo),
  );
}

/**
 * Repassa a requisição da tela para a API.
 *
 * `buscar` entra por parâmetro para a prova responder sem rede.
 */
export async function encaminharParaAdministracao(
  requisicao: Request,
  partes: readonly string[],
  buscar: typeof fetch = fetch,
): Promise<Response> {
  const caminho = partes.map((parte) => encodeURIComponent(parte)).join("/");
  const metodo = requisicao.method.toUpperCase();
  if (!caminhoPermitido(caminho, metodo)) {
    return respostaJson(404, { erro: "nao_encontrado" });
  }

  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return respostaJson(401, { erro: "nao_autenticado" });
  }

  const cabecalhos = new Headers({
    accept: "application/json",
    authorization: `Bearer ${token}`,
    // A API confere a lista fechada de origens antes de toda escrita.
    origin: requisicao.headers.get("origin") ?? new URL(requisicao.url).origin,
  });
  for (const nome of CABECALHOS_REPASSADOS) {
    const valor = requisicao.headers.get(nome);
    if (valor !== null) cabecalhos.set(nome, valor);
  }

  const consulta = new URL(requisicao.url).search;
  const temCorpo = metodo !== "GET" && metodo !== "HEAD";
  const corpoDaRequisicao = temCorpo ? await requisicao.arrayBuffer() : null;

  // O proxy do site corta o corpo que passa do teto dele e entrega só o
  // começo. Um PDF cortado ainda começa com `%PDF-` e passaria pela
  // conferência da API como se fosse inteiro — então corpo menor do que o
  // tamanho declarado não segue: chegou incompleto.
  const declarado = Number(requisicao.headers.get("content-length") ?? "");
  if (
    corpoDaRequisicao !== null &&
    Number.isFinite(declarado) &&
    declarado > corpoDaRequisicao.byteLength
  ) {
    return respostaJson(413, {
      erro: "arquivo_recusado",
      motivo: "GRANDE_DEMAIS",
      mensagem:
        "O envio passou do limite de tamanho e chegou incompleto. Nada foi gravado.",
    });
  }

  let resposta: Response;
  try {
    resposta = await buscar(
      `${enderecoDaApi()}/v1/admin/${caminho}${consulta}`,
      {
        method: metodo,
        cache: "no-store",
        headers: cabecalhos,
        ...(corpoDaRequisicao !== null ? { body: corpoDaRequisicao } : {}),
      },
    );
  } catch {
    return respostaJson(503, { erro: "indisponivel" });
  }

  const corpo = await resposta.arrayBuffer();
  const cabecalhosDaResposta = new Headers({
    "cache-control": "no-store",
    "content-type": resposta.headers.get("content-type") ?? "application/json",
  });
  for (const nome of CABECALHOS_DA_RESPOSTA_REPASSADOS) {
    const valor = resposta.headers.get(nome);
    if (valor !== null) cabecalhosDaResposta.set(nome, valor);
  }
  return new Response(corpo.byteLength === 0 ? null : corpo, {
    status: resposta.status,
    headers: cabecalhosDaResposta,
  });
}
