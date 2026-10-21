/**
 * Dados, senha, sessões, app autenticador e exclusão da conta (card #35),
 * encaminhados à área da conta da API com o token do cookie. Os endereços têm
 * rota própria (mais específica) e vencem esta.
 */
import { encaminharAConta } from "../../../../server/encaminhar-a-loja.ts";

type Contexto = { params: Promise<{ resto: string[] }> };

/** Só estes caminhos passam: nada além do que a tela da conta usa. */
const PERMITIDOS = /^(dados|senha|sessoes|sessoes\/[0-9a-f-]{36}|aplicativo\/desativar|excluir|aceites|privacidade\/exportar|favoritos|recentes|favoritos\/[a-z0-9-]+|tutorial)$/;

async function encaminhar(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  const { resto } = await contexto.params;
  const caminho = resto.map(encodeURIComponent).join("/");
  if (!PERMITIDOS.test(caminho)) {
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });
  }
  return encaminharAConta(requisicao, caminho);
}

export const GET = encaminhar;
export const POST = encaminhar;
export const PATCH = encaminhar;
export const DELETE = encaminhar;
