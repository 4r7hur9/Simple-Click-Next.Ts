import { NextResponse, type NextRequest } from "next/server";
import { apelidoDaLoja } from "./lib/host-loja";
import { redirecionarApelidoAntigo } from "./server/apelido-antigo";

/**
 * Proxy do Next: resolve o endereço para o apelido da loja e reescreve a rota
 * para a subárvore pública `/l/<apelido>`.
 *
 * ATENÇÃO — este arquivo NÃO autoriza nada.
 *
 * Ele roda antes de qualquer verificação de sessão, com o que veio no
 * cabeçalho da requisição, e por isso é otimista por natureza: serve para
 * levar a pessoa ao lugar certo depressa, não para decidir quem pode ver o
 * quê. A autorização de verdade acontece na camada de servidor
 * (`src/server/sessao.ts`) e, no fim da linha, no próprio banco, com o
 * isolamento por loja. Tratar reescrita como defesa é o caminho conhecido
 * para vazar dado de uma loja na outra.
 *
 * ATENÇÃO 2 — o nome do arquivo importa: no Next 16 `middleware.ts` é
 * IGNORADO EM SILÊNCIO. Renomear este arquivo desliga o roteamento por
 * endereço sem nenhum aviso, e o teste `tests/sem-middleware.test.ts` existe
 * para pegar exatamente isso.
 */
export default async function proxy(
  requisicao: NextRequest,
): Promise<NextResponse> {
  // O link antigo de uma loja cujo apelido a administração trocou leva ao
  // mesmo lugar no endereço novo (AC-208). Vem antes da reescrita: o que se
  // reescreve é o endereço atual, e não o antigo.
  const redirecionamento = await redirecionarApelidoAntigo(requisicao);
  if (redirecionamento !== null) return redirecionamento;

  const apelido = apelidoDaLoja(requisicao.headers.get("host"));
  if (apelido === null) return NextResponse.next();

  const destino = requisicao.nextUrl.clone();

  // Endereço já dentro da subárvore da loja: reescrever de novo criaria
  // `/l/<apelido>/l/<apelido>`.
  if (destino.pathname === "/l" || destino.pathname.startsWith("/l/")) {
    return NextResponse.next();
  }

  destino.pathname =
    destino.pathname === "/"
      ? `/l/${apelido}`
      : `/l/${apelido}${destino.pathname}`;

  return NextResponse.rewrite(destino);
}

export const config = {
  // Arquivo estático e rota interna do Next não passam por aqui: reescrever
  // recurso de build só gastaria processamento em toda requisição.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
