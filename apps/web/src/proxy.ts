import { NextResponse, type NextRequest } from "next/server";
import { anotarLojaDeOrigem } from "./server/anotar-loja-de-origem";
import { redirecionarApelidoAntigo } from "./server/apelido-antigo";
import { renovarAcessoSeVenceu } from "./server/renovar-acesso";

/**
 * Proxy do Next: leva o link antigo de uma loja (apelido trocado pela
 * administração) ao endereço atual. A loja é sempre `/loja/<apelido>`; não
 * existe resolução por subdomínio nem por domínio próprio.
 *
 * ATENÇÃO — este arquivo NÃO autoriza nada.
 *
 * Ele roda antes de qualquer verificação de sessão, com o que veio no
 * cabeçalho da requisição, e por isso é otimista por natureza: serve para
 * levar a pessoa ao lugar certo depressa, não para decidir quem pode ver o
 * quê. A autorização de verdade acontece na camada de servidor
 * (`src/server/sessao.ts`) e, no fim da linha, no próprio banco, com o
 * isolamento por loja.
 *
 * ATENÇÃO 2 — o nome do arquivo importa: no Next 16 `middleware.ts` é
 * IGNORADO EM SILÊNCIO. Renomear este arquivo desliga o redirecionamento do
 * apelido antigo sem nenhum aviso, e o teste `tests/sem-middleware.test.ts`
 * existe para pegar exatamente isso.
 */
export default async function proxy(
  requisicao: NextRequest,
): Promise<NextResponse> {
  // O link antigo de uma loja cujo apelido a administração trocou leva ao
  // mesmo lugar no endereço novo (AC-208).
  const redirecionamento = await redirecionarApelidoAntigo(requisicao);
  if (redirecionamento) return redirecionamento;
  // Acesso vencido e renovação à mão: troca antes da página renderizar, para
  // a pessoa não virar visitante no meio do uso (sumia o sair e o menu).
  const renovado = await renovarAcessoSeVenceu(requisicao);
  return anotarLojaDeOrigem(requisicao, renovado ?? NextResponse.next());
}

export const config = {
  // Arquivo estático, rota interna do Next, as rotas de acesso (/api/auth) e o
  // envio de mídia ficam de fora. O envio fica de fora porque o proxy guarda o
  // corpo inteiro na memória e corta acima de 10 MB, e o vídeo do produto e o
  // do story chegam a 50 MB (card #48). As demais /api passam por aqui só para
  // renovar o acesso vencido; o apelido antigo não vale para /api.
  matcher: [
    "/((?!api/auth/|api/loja/midia|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
