/**
 * Guarda da administração no SERVIDOR (cards #163, T-1, e #170, T-6).
 *
 * Nenhuma tela de `/admin` sai do servidor sem a API confirmar, AO VIVO, que
 * a conta do cookie tem grant ativo de administração da plataforma
 * (`adminDaPlataforma` do `GET /v1/eu`, lido da tabela de administradores a
 * cada pergunta). O claim do JWT NÃO é usado: revogar o grant vale na hora.
 *
 * - sem cookie de acesso, ou 401 do `/v1/eu`: manda para `/entrar`, levando
 *   de volta só o CAMINHO pedido (conferido por `destinoSeguro`, sem consulta);
 * - conta sem grant: o servidor a leva para a área do próprio papel (dono e
 *   equipe, `/painel`; cliente, `/explorar/produtos`), sem nenhum HTML da
 *   administração e sem 404 por falta de permissão;
 * - API fora do ar, tempo esgotado, JSON estranho: erro. Na dúvida, fecha
 *   (fail closed), mas sem fingir que a página não existe.
 *
 * A pergunta à API é feita uma vez por requisição (`euDoPedidoAtual`), mesmo
 * que o layout e a página chamem a guarda. Layout e página chamam os dois
 * porque a navegação parcial do App Router pode não reexecutar o layout.
 *
 * A decisão (a matriz de papéis) mora em `area-do-papel.ts`, e o `fetch` em
 * `eu-do-pedido.ts`, fora de `app/(admin)`: as páginas da administração
 * seguem sem buscar dado nenhum (varredura `admin-varredura`).
 */
import { exigirAreaDaAdministracao } from "./area-do-papel.ts";

/**
 * Barra quem não administra a plataforma antes de qualquer coisa da tela
 * ser montada. Volta normalmente só com grant ativo; nos outros casos lança
 * o `redirect` do Next (ou o erro de API indisponível).
 */
export async function exigirAdministracaoDaPlataforma(
  caminho: string,
): Promise<void> {
  await exigirAreaDaAdministracao(caminho);
}
