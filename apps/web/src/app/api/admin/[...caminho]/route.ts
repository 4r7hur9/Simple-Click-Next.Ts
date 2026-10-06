/**
 * Repasse das telas da administração até a API (`/v1/admin/*`).
 *
 * A regra toda mora em `server/admin-api.ts`: lista fechada de caminhos, token
 * lido do cookie httpOnly e nenhuma autorização aqui — quem decide é a API.
 */
import { encaminharParaAdministracao } from "../../../../server/admin-api.ts";

interface Contexto {
  readonly params: Promise<{ readonly caminho: string[] }>;
}

async function repassar(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  const { caminho } = await contexto.params;
  return encaminharParaAdministracao(requisicao, caminho);
}

export const GET = repassar;
export const POST = repassar;
export const PATCH = repassar;
export const PUT = repassar;
export const DELETE = repassar;
