/**
 * Dados, senha, sessões, app autenticador e exclusão da conta (card #35),
 * encaminhados à área da conta da API com o token do cookie. Os endereços têm
 * rota própria (mais específica) e vencem esta.
 *
 * Card #111: o que passa é uma TABELA caminho × método (nada de `.+`), e toda
 * escrita confere a origem e o tipo do corpo antes de qualquer coisa
 * (`recusarAcaoDeFora`). Caminho ou método fora da tabela é 404 e a API nem é
 * chamada.
 */
import { FORMATO_DO_APELIDO } from "@simpleclick/contracts";

import { recusarAcaoDeFora } from "../../../../server/protecao-da-conta.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../server/session-cookie.ts";
import { encaminharAConta } from "../../../../server/encaminhar-a-loja.ts";

type Contexto = { params: Promise<{ resto: string[] }> };
type Metodo = "GET" | "POST" | "PATCH" | "DELETE";

const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Os caminhos fixos e os métodos que cada um aceita. */
const FIXOS: Readonly<Record<string, readonly Metodo[]>> = {
  dados: ["GET", "PATCH"],
  senha: ["POST"],
  sessoes: ["GET"],
  "aplicativo/desativar": ["POST"],
  excluir: ["POST"],
  aceites: ["GET", "POST"],
  "privacidade/exportar": ["POST"],
  favoritos: ["GET"],
  recentes: ["GET"],
  tutorial: ["GET", "POST"],
};

/** Os métodos aceitos para o caminho, ou nenhum. `partes` já vem sem barra. */
function metodosDe(partes: readonly string[]): readonly Metodo[] {
  const caminho = partes.join("/");
  const fixo = FIXOS[caminho];
  if (fixo !== undefined) return fixo;
  const [a, b, c] = partes;
  // sessoes/<uuid>: encerrar uma conexão.
  if (
    partes.length === 2 &&
    a === "sessoes" &&
    b !== undefined &&
    UUID.test(b)
  ) {
    return ["DELETE"];
  }
  // favoritos/produtos/<uuid>: só tirar (o favoritar de produto passa pelo
  // servidor, `server/feed-social.ts`).
  if (
    partes.length === 3 &&
    a === "favoritos" &&
    b === "produtos" &&
    c !== undefined &&
    UUID.test(c)
  ) {
    return ["DELETE"];
  }
  // favoritos/<apelido>: favoritar e tirar a loja.
  if (
    partes.length === 2 &&
    a === "favoritos" &&
    b !== undefined &&
    b !== "produtos" &&
    FORMATO_DO_APELIDO.test(b)
  ) {
    return ["POST", "DELETE"];
  }
  return [];
}

function naoEncontrado(): Response {
  return Response.json({ erro: "nao_encontrado" }, { status: 404 });
}

async function encaminhar(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  const { resto } = await contexto.params;
  // Segmento vazio, ponto ou barra dentro do segmento: nunca é um caminho da tabela.
  if (
    resto.some(
      (parte) =>
        parte === "" || parte === "." || parte === ".." || parte.includes("/"),
    )
  ) {
    return naoEncontrado();
  }
  if (!(metodosDe(resto) as readonly string[]).includes(requisicao.method)) {
    return naoEncontrado();
  }
  const recusada = await recusarAcaoDeFora(requisicao);
  if (recusada !== null) return recusada;
  // Visitante sem sessão: a janela de novo aceite pergunta em toda página, e um
  // 401 aqui sujava o console. Sem sessão não há o que aceitar: 200 vazio.
  if (
    requisicao.method === "GET" &&
    resto.join("/") === "aceites" &&
    lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie")) === undefined
  ) {
    return Response.json(
      { pendentes: [], historico: [], anonimo: true },
      { headers: { "cache-control": "no-store" } },
    );
  }
  return encaminharAConta(requisicao, resto.map(encodeURIComponent).join("/"));
}

export const GET = encaminhar;
export const POST = encaminhar;
export const PATCH = encaminhar;
export const DELETE = encaminhar;
